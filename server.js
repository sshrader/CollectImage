'use strict';
// Collect: hold the coin, sign a free message with Phantom, and get one of N images that only your wallet can open.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const art = require('./art');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE = path.join(DATA_DIR, 'assignments.json');
const SECRET_FILE = path.join(DATA_DIR, 'image-secret.txt');
const INDEX = path.join(__dirname, 'index.html');

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const CHALLENGE_TTL = 5 * 60 * 1000;

// Settings are read on each request so they can be changed without code edits.
const cfg = () => ({
  mint: (process.env.COIN_MINT || '').trim(),
  cluster: process.env.CLUSTER === 'devnet' ? 'devnet' : 'mainnet',
  rpc: (process.env.RPC_URL || '').trim(),
  total: Math.min(100, Math.max(1, parseInt(process.env.SLOTS, 10) || 10)),
  minHold: Math.max(0, Number(process.env.MIN_HOLD) || 1),
  requireHold: process.env.REQUIRE_HOLD_ON_DOWNLOAD !== '0',
  coinName: (process.env.COIN_NAME || '').trim().slice(0, 40),
});
const rpcUrl = (c) => (/^https?:\/\//.test(c.rpc) ? c.rpc : c.cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');

// The secret that decides how each image looks. It lives on the server only. Set IMAGE_SECRET to choose your own.
function imageSecret() {
  if (process.env.IMAGE_SECRET) return process.env.IMAGE_SECRET;
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch (e) { /* create below */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } }
function save(map) { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(map)); fs.renameSync(t, FILE); }

function b58decode(str) {
  const bytes = [];
  for (const ch of str) {
    const v = B58.indexOf(ch);
    if (v < 0) throw new Error('Invalid base58.');
    let carry = v;
    for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of str) { if (ch === '1') bytes.push(0); else break; }
  return Buffer.from(bytes.reverse());
}

function verifySignature(wallet, message, sigB64) {
  try {
    const pub = b58decode(wallet);
    const sig = Buffer.from(String(sigB64), 'base64');
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI, pub]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(message, 'utf8'), key, sig);
  } catch (e) { return false; }
}

const challenges = new Map();
function challengeMessage(wallet, nonce, expires) {
  return 'Sparkpad Collect\nSign to prove you own this wallet. This sends no transaction and costs nothing.\nWallet: ' + wallet + '\nNonce: ' + nonce + '\nExpires: ' + new Date(expires).toISOString();
}

const hits = new Map();
function limited(key, max) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= max) { hits.set(key, recent); return true; }
  recent.push(now); hits.set(key, recent);
  return false;
}
// Railway puts the real client last in X-Forwarded-For; earlier entries can be forged.
function clientIp(req) {
  const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || req.socket.remoteAddress || 'unknown';
}

async function rpc(c, method, params) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(rpcUrl(c), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) });
      if (r.status === 429 || r.status >= 500) { last = new Error('RPC ' + r.status); await new Promise((ok) => setTimeout(ok, 400 * (i + 1))); continue; }
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'RPC error');
      return j.result;
    } catch (e) { last = e; await new Promise((ok) => setTimeout(ok, 400 * (i + 1))); }
  }
  throw last || new Error('RPC failed');
}

// Total of the coin this wallet holds, across all its token accounts (works for both token programs).
async function balanceOf(c, wallet) {
  const res = await rpc(c, 'getTokenAccountsByOwner', [wallet, { mint: c.mint }, { encoding: 'jsonParsed' }]);
  let sum = 0;
  for (const a of (res && res.value) || []) {
    const t = a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info && a.account.data.parsed.info.tokenAmount;
    if (t) sum += Number(t.uiAmountString || t.uiAmount || 0) || 0;
  }
  return sum;
}

function send(res, status, body, headers) {
  const isStr = typeof body === 'string';
  res.writeHead(status, Object.assign({
    'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
  }, headers || {}));
  res.end(isStr ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 4096) { reject(Object.assign(new Error('Request is too large.'), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function jsonBody(req, res) {
  try { const j = JSON.parse(await readBody(req)); if (j && typeof j === 'object') return j; } catch (e) { if (e.status) { send(res, e.status, { error: e.message }); return undefined; } }
  send(res, 400, { error: 'Body must be a JSON object.' });
  return undefined;
}

function status(res) {
  const c = cfg(); const map = load();
  const owners = {};
  for (const w of Object.keys(map)) owners[map[w]] = w;
  const slots = [];
  for (let i = 0; i < c.total; i++) slots.push({ n: i + 1, owner: owners[i] ? owners[i].slice(0, 4) + '…' + owners[i].slice(-4) : null });
  send(res, 200, { configured: !!c.mint, mint: c.mint || null, cluster: c.cluster, coinName: c.coinName || null, total: c.total, claimed: Object.keys(map).length, minHold: c.minHold, requireHold: c.requireHold, slots });
}

async function challenge(req, res) {
  if (limited('ch:' + clientIp(req), 60)) return send(res, 429, { error: 'Too many requests. Try again later.' });
  const body = await jsonBody(req, res); if (!body) return;
  if (typeof body.wallet !== 'string' || !B58_RE.test(body.wallet)) return send(res, 400, { error: 'Wallet address looks wrong.' });
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expires < now) challenges.delete(k);
  if (challenges.size > 5000) return send(res, 503, { error: 'Busy. Try again in a minute.' });
  const nonce = crypto.randomBytes(16).toString('hex');
  const expires = now + CHALLENGE_TTL;
  challenges.set(nonce, { wallet: body.wallet, expires });
  send(res, 200, { nonce, message: challengeMessage(body.wallet, nonce, expires) });
}

async function collect(req, res) {
  if (limited('co:' + clientIp(req), 40)) return send(res, 429, { error: 'Too many requests. Try again later.' });
  const c = cfg();
  if (!c.mint) return send(res, 503, { error: 'This page is not set up yet.' });
  const body = await jsonBody(req, res); if (!body) return;
  const wallet = body.wallet, nonce = body.nonce;
  if (typeof wallet !== 'string' || !B58_RE.test(wallet) || typeof nonce !== 'string') return send(res, 400, { error: 'Missing wallet or nonce.' });
  const ch = challenges.get(nonce);
  challenges.delete(nonce); // one use only
  if (!ch || ch.wallet !== wallet || ch.expires < Date.now()) return send(res, 401, { error: 'That sign-in expired. Press the button again.' });
  if (!verifySignature(wallet, challengeMessage(wallet, nonce, ch.expires), body.signature)) return send(res, 401, { error: 'The signature did not match this wallet.' });

  let map = load();
  const has = Object.prototype.hasOwnProperty.call(map, wallet);
  if (has && !c.requireHold) return send(res, 200, reply(c, map[wallet], wallet, false));

  let bal;
  try { bal = await balanceOf(c, wallet); }
  catch (e) { return send(res, 502, { error: 'Could not read the chain just now. Try again in a minute.' }); }
  if (bal < c.minHold) {
    return send(res, 403, { error: (has ? 'This wallet no longer holds enough of the coin. It needs at least ' : 'This wallet needs at least ') + c.minHold + ' of the coin to collect an image.', balance: bal });
  }
  map = load(); // re-read: another claim may have landed while we waited on the chain
  if (Object.prototype.hasOwnProperty.call(map, wallet)) return send(res, 200, reply(c, map[wallet], wallet, false));
  const taken = new Set(Object.values(map));
  const free = [];
  for (let i = 0; i < c.total; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return send(res, 409, { error: 'All ' + c.total + ' images have been collected.' });
  const slot = free[crypto.randomInt(free.length)];
  map[wallet] = slot; save(map);
  send(res, 200, reply(c, slot, wallet, true));
}

function reply(c, slot, wallet, isNew) {
  return { slot: slot + 1, total: c.total, isNew, svg: art.render(slot, c.total, wallet, imageSecret()) };
}

const MIME = { '.html': 'text/html; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    if (req.method === 'POST' && p === '/api/challenge') return await challenge(req, res);
    if (req.method === 'POST' && p === '/api/collect') return await collect(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (p === '/api/status') return status(res);
    if (p === '/api/health') return send(res, 200, { ok: true });
    if (p === '/' || p === '/index.html') {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' });
      return res.end(fs.readFileSync(INDEX));
    }
    if (p === '/favicon.ico') return send(res, 204, '');
    return send(res, 404, 'Not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Server error.' });
  }
});

if (require.main === module) server.listen(PORT, '0.0.0.0', () => console.log('Collect listening on ' + PORT + ', data in ' + DATA_DIR));
module.exports = server;
