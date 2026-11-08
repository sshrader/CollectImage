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
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
// The coin address chosen on the launch page is saved here, so it takes effect without a Railway change or redeploy.
// It overrides COIN_MINT.
const savedMint = () => { try { return String(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')).mint || '').trim(); } catch (e) { return ''; } };
const cfg = () => ({
  mint: savedMint() || (process.env.COIN_MINT || '').trim(),
  cluster: process.env.CLUSTER === 'devnet' ? 'devnet' : 'mainnet',
  rpc: (process.env.RPC_URL || '').trim(),
  total: Math.min(100, Math.max(1, parseInt(process.env.SLOTS, 10) || 40)),
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
function limited(key, max, peek) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= max) { hits.set(key, recent); return true; }
  if (peek) { hits.set(key, recent); return false; }
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

function readBody(req, max) {
  const limit = max || 4096;
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Request is too large.'), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function jsonBody(req, res, max) {
  try { const j = JSON.parse(await readBody(req, max)); if (j && typeof j === 'object') return j; } catch (e) { if (e.status) { send(res, e.status, { error: e.message }); return undefined; } }
  send(res, 400, { error: 'Body must be a JSON object.' });
  return undefined;
}

function status(res) {
  const c = cfg(); const map = load();
  const owners = {};
  for (const w of Object.keys(map)) owners[map[w]] = w;
  const slots = [];
  const secret = imageSecret();
  for (let i = 0; i < c.total; i++) slots.push({ n: i + 1, owner: owners[i] ? owners[i].slice(0, 4) + '…' + owners[i].slice(-4) : null, tint: owners[i] ? art.SKINS[art.traitsFor(i, secret).skin].base : null });
  send(res, 200, { silhouette: art.silhouette(), configured: !!c.mint, mint: c.mint || null, cluster: c.cluster, coinName: c.coinName || null, total: c.total, claimed: Object.keys(map).length, minHold: c.minHold, requireHold: c.requireHold, slots });
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

// ---- Launch tools (owner only): coin metadata hosting and the mainnet RPC proxy for the pump.fun launch ----
const META_DIR = path.join(DATA_DIR, 'meta');
const IMG_DIR = path.join(DATA_DIR, 'images');
fs.mkdirSync(META_DIR, { recursive: true }); fs.mkdirSync(IMG_DIR, { recursive: true });
const LAUNCH = path.join(__dirname, 'launch.html');
const LAUNCH_JS = path.join(__dirname, 'dist', 'launch.js');
const MAX_IMAGE = 1024 * 1024;
const CORS = { 'Access-Control-Allow-Origin': '*' };
const RPC_METHODS = new Set(['getLatestBlockhash', 'getBlockHeight', 'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getSlot',
  'simulateTransaction', 'sendTransaction', 'getSignatureStatuses', 'getTransaction', 'getGenesisHash', 'getFeeForMessage',
  'getMinimumBalanceForRentExemption', 'getRecentPrioritizationFees', 'getTokenAccountBalance', 'getEpochInfo', 'getVersion']);

// Lets the launch page point the site at the coin it just created. The network must match this server's CLUSTER.
async function setCoin(req, res) {
  if (!guardAdmin(req, res)) return;
  const b = await jsonBody(req, res, 2000); if (!b) return;
  const mint = text(b.mint, 60);
  if (!B58_RE.test(mint) || b58decode(mint).length !== 32) return send(res, 400, { error: 'That is not a valid coin address.' });
  const c = cfg();
  if (b.cluster && b.cluster !== c.cluster) return send(res, 409, { error: 'This site is set to ' + c.cluster + ' (CLUSTER in Railway), but the coin was made on ' + b.cluster + '. Change CLUSTER and RPC_URL in Railway, then try again.' });
  if (mint !== c.mint) {
    // A different coin starts with a clean slate. The old claims are kept in a file next to the new ones.
    const map = load();
    if (Object.keys(map).length) fs.renameSync(FILE, path.join(DATA_DIR, 'assignments-' + Date.now() + '.json'));
    fs.writeFileSync(SETTINGS_FILE + '.tmp', JSON.stringify({ mint })); fs.renameSync(SETTINGS_FILE + '.tmp', SETTINGS_FILE);
  }
  send(res, 200, { ok: true, mint, cluster: c.cluster });
}

// The launch page remembers its lookup table here too, because some browsers will not keep it.
// The page only uses a table that the connected wallet controls, so a wrong value here can do no harm.
const LUT_FILE = path.join(DATA_DIR, 'tables.json');
async function lutStore(req, res, u) {
  if (!guardAdmin(req, res)) return;
  let map = {}; try { map = JSON.parse(fs.readFileSync(LUT_FILE, 'utf8')); } catch (e) { /* none yet */ }
  if (req.method === 'GET') {
    const w = u.searchParams.get('wallet') || '', cl = u.searchParams.get('cluster') || '';
    return send(res, 200, { table: B58_RE.test(w) ? map[cl + ':' + w] || null : null });
  }
  const b = await jsonBody(req, res, 1000); if (!b) return;
  if (!B58_RE.test(text(b.wallet, 60)) || !B58_RE.test(text(b.table, 60)) || !/^(devnet|mainnet)$/.test(b.cluster)) return send(res, 400, { error: 'Bad value.' });
  map[b.cluster + ':' + b.wallet] = b.table;
  fs.writeFileSync(LUT_FILE + '.tmp', JSON.stringify(map)); fs.renameSync(LUT_FILE + '.tmp', LUT_FILE);
  send(res, 200, { ok: true });
}

function adminOk(req) {
  const token = String(process.env.ADMIN_TOKEN || '').trim();
  if (!token) return false;
  const h = String(req.headers.authorization || '');
  const given = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(a, b);
}
function guardAdmin(req, res) {
  if (!String(process.env.ADMIN_TOKEN || '').trim()) { send(res, 503, { error: 'Launch tools are off. Set ADMIN_TOKEN on the server.' }); return false; }
  if (limited('adminfail:' + clientIp(req), 20, true)) { send(res, 429, { error: 'Too many wrong tries. Wait an hour.' }); return false; }
  if (!adminOk(req)) { limited('adminfail:' + clientIp(req), 20); send(res, 401, { error: 'Wrong token.' }); return false; }
  return true;
}
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function cleanTwitter(v) {
  const t = text(v, 120);
  if (!t) return '';
  const host = '^(?:https?:\\/\\/)?(?:www\\.|mobile\\.)?(?:x|twitter)\\.com\\/';
  let m = new RegExp(host + '@?([A-Za-z0-9_]{1,15})\\/?(?:[?#].*)?$', 'i').exec(t);
  if (m) return 'https://x.com/' + m[1];
  m = new RegExp(host + '([A-Za-z0-9_]{1,15})\\/status\\/(\\d{1,25})\\/?(?:[?#].*)?$', 'i').exec(t);
  if (m) return 'https://x.com/' + m[1] + '/status/' + m[2];
  m = new RegExp(host + 'i\\/communities\\/(\\d{1,25})\\/?(?:[?#].*)?$', 'i').exec(t);
  if (m) return 'https://x.com/i/communities/' + m[1];
  return /^@?[A-Za-z0-9_]{1,15}$/.test(t) ? 'https://x.com/' + t.replace(/^@/, '') : null;
}
function cleanWebsite(v) {
  const t = text(v, 120);
  if (!t) return '';
  let u;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /\s/.test(t)) return null;
  return u.href.length <= 150 ? u.href : null;
}
function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  return proto + '://' + req.headers.host;
}
function sniff(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 6 && /^GIF8[79]a/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}
const EXT = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

async function createMetadata(req, res) {
  if (!guardAdmin(req, res)) return;
  const input = await jsonBody(req, res, 2 * 1024 * 1024); if (!input) return;
  const name = text(input.name, 32), symbol = text(input.symbol, 10), description = text(input.description, 280);
  if (!name) return send(res, 400, { error: 'Name is required.' });
  if (!/^[A-Za-z0-9$._-]{1,10}$/.test(symbol)) return send(res, 400, { error: 'Ticker must be 1 to 10 letters or digits.' });
  const twitter = cleanTwitter(input.twitter);
  if (twitter === null) return send(res, 400, { error: 'Twitter must be a handle like @yourcoin, or an x.com profile, post or community link.' });
  const website = cleanWebsite(input.website);
  if (website === null) return send(res, 400, { error: 'Website must be a link starting with https://.' });
  const id = crypto.randomBytes(8).toString('hex');
  const base = baseUrl(req);
  let imageUrl;
  if (input.image != null) {
    const match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(input.image));
    if (!match) return send(res, 400, { error: 'Image must be a PNG, JPG, GIF or WebP data URL.' });
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > MAX_IMAGE) return send(res, 400, { error: 'Image is over 1 MB.' });
    const kind = sniff(buf);
    if (!kind || kind !== match[1]) return send(res, 400, { error: 'Image content does not match its type.' });
    const file = id + '.' + EXT[kind];
    fs.writeFileSync(path.join(IMG_DIR, file), buf);
    imageUrl = base + '/images/' + file;
  }
  const doc = { name, symbol, description, image: imageUrl, external_url: base };
  if (twitter) doc.twitter = twitter;
  if (website) doc.website = website;
  fs.writeFileSync(path.join(META_DIR, id + '.json'), JSON.stringify(doc, null, 2));
  send(res, 201, { uri: base + '/metadata/' + id + '.json', image: imageUrl || null });
}

// Forwards one JSON-RPC call to the private mainnet RPC, so its address never reaches the browser.
async function rpcProxy(req, res) {
  const c = cfg();
  if (c.cluster !== 'mainnet' || !/^https?:\/\//.test(c.rpc)) return send(res, 404, { error: 'Mainnet RPC is not set up here.' });
  if (limited('rpc:' + clientIp(req), 3000)) return send(res, 429, { error: 'Too many requests. Try again later.' });
  let body;
  try { body = JSON.parse(await readBody(req, 200 * 1024)); }
  catch (e) { return send(res, e.status || 400, { error: e.status ? e.message : 'Body must be JSON.' }); }
  if (!body || Array.isArray(body) || typeof body !== 'object' || !RPC_METHODS.has(body.method)) return send(res, 400, { error: 'That call is not allowed.' });
  try {
    const r = await fetch(c.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id == null ? 1 : body.id, method: body.method, params: Array.isArray(body.params) ? body.params : [] }), signal: AbortSignal.timeout(20000) });
    const out = await r.text();
    res.writeHead(r.status === 429 ? 429 : 200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(out);
  } catch (e) { send(res, 502, { error: 'The mainnet RPC did not answer.' }); }
}

function serveStatic(res, file, type, extra) {
  let data;
  try { data = fs.readFileSync(file); } catch (e) { return send(res, 404, 'Not found'); }
  res.writeHead(200, Object.assign({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=300' }, extra || {}));
  res.end(data);
}

const MIME = { '.html': 'text/html; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const uu = new URL(req.url, 'http://x'); const p = uu.pathname;
    if (req.method === 'POST' && p === '/api/challenge') return await challenge(req, res);
    if (req.method === 'POST' && p === '/api/collect') return await collect(req, res);
    if (req.method === 'POST' && p === '/api/metadata') return await createMetadata(req, res);
    if (req.method === 'POST' && p === '/api/coin') return await setCoin(req, res);
    if (p === '/api/lut' && (req.method === 'GET' || req.method === 'POST')) return await lutStore(req, res, uu);
    if (req.method === 'POST' && p === '/api/rpc/mainnet') return await rpcProxy(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (p === '/api/status') return status(res);
    if (p === '/api/health') return send(res, 200, { ok: true });
    if (p === '/api/mascot.svg') return send(res, 200, art.render(0, 1, '', 'cathouse-public-mascot', { bare: true }), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
    if (p === '/assets/house.svg' || p === '/assets/moon.svg') return serveStatic(res, path.join(__dirname, p), 'image/svg+xml', { 'Cache-Control': 'public, max-age=86400' });
    if (p === '/launch') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' }); return res.end(fs.readFileSync(LAUNCH)); }
    if (p === '/launch.js') {
      if (!fs.existsSync(LAUNCH_JS)) return send(res, 404, 'Not built yet. Run npm run build.');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return res.end(fs.readFileSync(LAUNCH_JS));
    }
    let mm = /^\/metadata\/([a-f0-9]{16})\.json$/.exec(p);
    if (mm) return serveStatic(res, path.join(META_DIR, mm[1] + '.json'), 'application/json; charset=utf-8', CORS);
    mm = /^\/images\/([a-f0-9]{16})\.(png|jpg|gif|webp)$/.exec(p);
    if (mm) return serveStatic(res, path.join(IMG_DIR, mm[1] + '.' + mm[2]), IMG_MIME[mm[2]], CORS);
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
