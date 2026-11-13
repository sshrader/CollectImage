'use strict';
// Mechpad: anyone can launch a pump.fun coin. Each launch claims one of a small set of voxel mech agents as its logo,
// and that agent is then locked to the coin. The launcher signs everything from their own wallet.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const art = require('./mech');
const chain = require('./chain');
const { statusReport } = require('./report');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const SECRET_FILE = path.join(DATA_DIR, 'image-secret.txt');
const INDEX = path.join(__dirname, 'index.html');
const COIN_PAGE = path.join(__dirname, 'coin.html');

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const CHALLENGE_TTL = 5 * 60 * 1000;
const HOLD_TTL = 15 * 60 * 1000; // how long a picked agent is kept for its launcher
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RETRY_MS = Number(process.env.LAUNCH_RETRY_MS) || 1500; // wait between looks for a fresh launch on the chain
const PLATFORM_BPS = 500; // 5% of the coin's creator fees go to PLATFORM_WALLET, 95% to the launcher

// Settings are read on each request so they can be changed in Railway without code edits.
const cfg = () => ({
  // Devnet unless CLUSTER=mainnet, so a missing setting can never spend real SOL.
  cluster: process.env.CLUSTER === 'mainnet' ? 'mainnet' : 'devnet',
  rpc: (process.env.RPC_URL || '').trim(),
  total: Math.min(100, Math.max(1, parseInt(process.env.SLOTS, 10) || 4)),
  platformWallet: B58_RE.test((process.env.PLATFORM_WALLET || '').trim()) ? process.env.PLATFORM_WALLET.trim() : '',
  maxBuy: process.env.CLUSTER === 'mainnet' ? 10 : 5,
  // The one wallet that may launch the special PRIME agent (not part of the numbered set).
  founderWallet: B58_RE.test((process.env.FOUNDER_WALLET || '').trim()) ? process.env.FOUNDER_WALLET.trim() : '',
});
// Each network reads from its own endpoint. RPC_URL is for mainnet only, so a mainnet key is never used to read devnet.
// Set DEVNET_RPC_URL to use a private devnet endpoint; otherwise the public one is used.
const rpcUrl = (c) => {
  if (c.cluster === 'devnet') return /^https?:\/\//.test(process.env.DEVNET_RPC_URL || '') ? process.env.DEVNET_RPC_URL.trim() : 'https://api.devnet.solana.com';
  return /^https?:\/\//.test(c.rpc) ? c.rpc : 'https://api.mainnet-beta.solana.com';
};

// The secret that decides how each agent looks. It lives on the server only. Set IMAGE_SECRET to choose your own.
function imageSecret() {
  if (process.env.IMAGE_SECRET) return process.env.IMAGE_SECRET;
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch (e) { /* create below */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}

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
  return 'Mechpad Launch\nSign to prove you own this wallet. This sends no transaction and costs nothing.\nWallet: ' + wallet + '\nNonce: ' + nonce + '\nExpires: ' + new Date(expires).toISOString();
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

function send(res, status, body, headers) {
  if (Buffer.isBuffer(body)) { res.writeHead(status, Object.assign({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }, headers || {})); return res.end(body); }
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


// ---- Bears: which are open, held for a launcher right now, or locked to a coin ----
// Devnet and mainnet keep separate books, so test launches never use up a real bear.
const bearsFile = (c) => path.join(DATA_DIR, 'bears-' + c.cluster + '.json');
function loadBears(c) {
  let d; try { d = JSON.parse(fs.readFileSync(bearsFile(c), 'utf8')); } catch (e) { d = {}; }
  d.launched = d.launched || {}; d.holds = d.holds || {};
  const now = Date.now();
  for (const k of Object.keys(d.holds)) if (d.holds[k].until < now) delete d.holds[k];
  return d;
}
function saveBears(c, d) { const f = bearsFile(c); fs.writeFileSync(f + '.tmp', JSON.stringify(d)); fs.renameSync(f + '.tmp', f); }
const holdFor = (d, token) => { for (const k of Object.keys(d.holds)) if (d.holds[k].token === token) return { slot: k === 'F' ? 'F' : Number(k), hold: d.holds[k] }; return null; };
const bearLabel = (slot) => (slot === 'F' ? 'founder' : slot + 1); // what the pages are told
const PRIME = { name: 'PRIME', role: 'FLAGSHIP', blurb: 'The one-of-one flagship agent. Reserved for Mechpad’s founder wallet.' };
// The 3D views fetch an agent's voxels. They only depend on the image secret, so they are cached and gzipped.
const voxCache = new Map();
function sendVoxels(req, res, slot) {
  const key = imageSecret() + ':' + slot;
  const model = () => (slot === 'F' ? art.founderVoxels() : art.agentVoxels(slot, imageSecret()));
  let e = voxCache.get(key);
  if (!e) { const raw = Buffer.from(JSON.stringify(model())); e = { raw, gz: require('zlib').gzipSync(raw) }; voxCache.set(key, e); }
  const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  res.writeHead(200, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'Content-Length': (gz ? e.gz : e.raw).length }, gz ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}, { 'X-Content-Type-Options': 'nosniff' }));
  res.end(gz ? e.gz : e.raw);
}
const shortAddr = (a) => a.slice(0, 4) + '…' + a.slice(-4);

function bearsState(res) {
  const c = cfg(), d = loadBears(c);
  const bears = [];
  for (let i = 0; i < c.total; i++) {
    const L = d.launched[i], H = d.holds[i];
    const ag = art.agentFor(i, imageSecret());
    bears.push({ n: i + 1, agent: { name: ag.name, role: ag.role, blurb: ag.blurb }, state: L ? 'launched' : H ? 'held' : 'open', symbol: L ? L.symbol : null, name: L ? L.name : null, mint: L ? L.mint : null, dev: L ? L.wallet : null, split: L ? !!L.split : false });
  }
  const recent = Object.keys(d.launched).map((k) => ({ bear: k === 'F' ? 'F' : Number(k) + 1, agent: k === 'F' ? PRIME.name : art.agentFor(Number(k), imageSecret()).name, name: d.launched[k].name, symbol: d.launched[k].symbol, mint: d.launched[k].mint, at: d.launched[k].at }))
    .sort((x, y) => y.at - x.at).slice(0, 8);
  send(res, 200, {
    cluster: c.cluster, total: c.total, maxBuy: c.maxBuy, silhouette: art.silhouette(), bears, recent,
    open: bears.filter((b) => b.state === 'open').length,
    founder: c.founderWallet ? (() => { const L = d.launched.F, H = d.holds.F; return { agent: PRIME, state: L ? 'launched' : H ? 'held' : 'reserved', short: shortAddr(c.founderWallet), symbol: L ? L.symbol : null, name: L ? L.name : null, mint: L ? L.mint : null }; })() : null,
    platform: c.platformWallet ? { wallet: c.platformWallet, bps: PLATFORM_BPS } : null,
  });
}

// Name and ticker rules for an open launchpad. Add more words with BLOCKED_WORDS (comma separated).
const BLOCKED = ['nigg', 'faggot', 'hitler', 'nazi', 'rape', 'kike', 'chink'];
function badWords(s) {
  const flat = String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const extra = String(process.env.BLOCKED_WORDS || '').toLowerCase().split(',').map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  return BLOCKED.concat(extra).some((w) => flat.includes(w));
}

// Step 1: the launcher signs a free message, and picks a bear (or asks for a random one). The bear is held for them.
async function reserve(req, res) {
  if (limited('rs:' + clientIp(req), 30)) return send(res, 429, { error: 'Too many requests. Try again later.' });
  const c = cfg();
  const body = await jsonBody(req, res); if (!body) return;
  const wallet = body.wallet, nonce = body.nonce;
  if (typeof wallet !== 'string' || !B58_RE.test(wallet) || typeof nonce !== 'string') return send(res, 400, { error: 'Missing wallet or nonce.' });
  const ch = challenges.get(nonce);
  challenges.delete(nonce); // one use only
  if (!ch || ch.wallet !== wallet || ch.expires < Date.now()) return send(res, 401, { error: 'That sign-in expired. Press the button again.' });
  if (!verifySignature(wallet, challengeMessage(wallet, nonce, ch.expires), body.signature)) return send(res, 401, { error: 'The signature did not match this wallet.' });
  const d = loadBears(c);
  // A wallet keeps one held agent at a time, so asking again swaps it rather than hoarding.
  for (const k of Object.keys(d.holds)) if (d.holds[k].wallet === wallet) delete d.holds[k];
  let slot;
  if (body.slot === 'founder') {
    // The Founder bear is not in the numbered set. Only FOUNDER_WALLET can take it, and only once per network.
    if (!c.founderWallet || wallet !== c.founderWallet) { saveBears(c, d); return send(res, 403, { error: 'That agent is reserved for Mechpad founder.' }); }
    if (d.launched.F) { saveBears(c, d); return send(res, 409, { error: 'The founder coin has already been launched.' }); }
    if (d.holds.F) { saveBears(c, d); return send(res, 409, { error: 'The PRIME agent is being launched right now.' }); }
    slot = 'F';
  } else {
    const free = [];
    for (let i = 0; i < c.total; i++) if (!d.launched[i] && !d.holds[i]) free.push(i);
    if (!free.length) { saveBears(c, d); return send(res, 409, { error: 'Every agent is claimed or being launched right now. Check back in a few minutes.' }); }
    if (body.slot === 'random' || body.slot == null) slot = free[crypto.randomInt(free.length)];
    else {
      slot = Number(body.slot) - 1;
      if (!Number.isInteger(slot) || slot < 0 || slot >= c.total) return send(res, 400, { error: 'No such agent.' });
      if (!free.includes(slot)) { saveBears(c, d); return send(res, 409, { error: 'That agent was just claimed. Pick another.' }); }
    }
  }
  const token = crypto.randomBytes(24).toString('hex');
  d.holds[slot] = { wallet, token, until: Date.now() + HOLD_TTL };
  saveBears(c, d);
  send(res, 200, { token, slot: bearLabel(slot), founder: slot === 'F', expires: d.holds[slot].until, cluster: c.cluster });
}

// The launcher's token (from reserve) is what lets them use the other launch calls. It names one wallet and one bear.
function authHold(req, res) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const c = cfg(), d = loadBears(c);
  const f = token.length >= 32 ? holdFor(d, token) : null;
  if (!f) { send(res, 401, { error: 'Your agent hold expired. Pick an agent again.' }); return null; }
  return { c, d, slot: f.slot, hold: f.hold };
}

// Step 2: the coin's name, ticker and links. The logo is always the held agent, drawn here by the server.
async function createMetadata(req, res) {
  const a = authHold(req, res); if (!a) return;
  if (limited('md:' + a.hold.wallet, 12)) return send(res, 429, { error: 'Too many tries. Try again later.' });
  const input = await jsonBody(req, res, 8 * 1024); if (!input) return;
  const name = text(input.name, 32), symbol = text(input.symbol, 10), description = text(input.description, 280);
  if (!name) return send(res, 400, { error: 'Name is required.' });
  if (!/^[A-Za-z0-9$._-]{1,10}$/.test(symbol)) return send(res, 400, { error: 'Ticker must be 1 to 10 letters or digits.' });
  if (badWords(name) || badWords(symbol) || badWords(description)) return send(res, 400, { error: 'That name, ticker or description is not allowed here.' });
  const twitter = cleanTwitter(input.twitter);
  if (twitter === null) return send(res, 400, { error: 'Twitter must be a handle like @yourcoin, or an x.com profile, post or community link.' });
  const website = cleanWebsite(input.website);
  if (website === null) return send(res, 400, { error: 'Website must be a link starting with https://.' });
  const id = crypto.randomBytes(8).toString('hex');
  const base = baseUrl(req);
  fs.writeFileSync(path.join(IMG_DIR, id + '.png'), a.slot === 'F' ? art.founderPng(512) : art.png(a.slot, imageSecret(), 512));
  const imageUrl = base + '/images/' + id + '.png';
  const doc = { name, symbol, description, image: imageUrl, external_url: base };
  if (twitter) doc.twitter = twitter;
  if (website) doc.website = website;
  fs.writeFileSync(path.join(META_DIR, id + '.json'), JSON.stringify(doc, null, 2));
  a.hold.pending = { name, symbol, uri: base + '/metadata/' + id + '.json' };
  a.hold.until = Date.now() + HOLD_TTL; // starting the launch refreshes the hold
  saveBears(a.c, a.d);
  send(res, 201, { uri: a.hold.pending.uri, image: imageUrl, slot: bearLabel(a.slot) });
}

// Reads a launch transaction from the chain and checks it: it succeeded, the new coin signed it, and it used the pump.fun program.
// Returns the wallet that paid for it (the first signer).
async function verifyLaunch(c, sig, mint) {
  let tx = null;
  for (let i = 0; i < 6 && !tx; i++) {
    try { tx = await rpc(c, 'getTransaction', [sig, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]); }
    catch (e) { tx = null; }
    if (!tx) await new Promise((ok) => setTimeout(ok, RETRY_MS));
  }
  if (!tx || (tx.meta && tx.meta.err)) return { error: 'Could not find that launch on ' + c.cluster + '. If it just went through, try again in a few seconds.' };
  const msg = tx.transaction && tx.transaction.message;
  let keys = ((msg && msg.accountKeys) || []).slice();
  if (tx.meta && tx.meta.loadedAddresses) keys = keys.concat(tx.meta.loadedAddresses.writable || [], tx.meta.loadedAddresses.readonly || []);
  const signers = keys.slice(0, (msg && msg.header && msg.header.numRequiredSignatures) || 1);
  if (!signers.includes(mint) || !keys.includes(PUMP_PROGRAM)) return { error: 'That transaction is not a pump.fun launch for this coin.' };
  return { wallet: signers[0], signers };
}

// Step 3 (after the launch lands): the server checks the transaction on the chain, then locks the bear to the coin.
async function launched(req, res) {
  const a = authHold(req, res); if (!a) return;
  if (limited('ln:' + clientIp(req), 40)) return send(res, 429, { error: 'Too many requests. Try again later.' });
  const b = await jsonBody(req, res, 2000); if (!b) return;
  const mint = text(b.mint, 60), sig = text(b.signature, 120);
  if (!B58_RE.test(mint) || b58decode(mint).length !== 32) return send(res, 400, { error: 'That is not a valid coin address.' });
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig)) return send(res, 400, { error: 'That is not a valid transaction signature.' });
  if (Object.values(a.d.launched).some((l) => l.mint === mint)) return send(res, 409, { error: 'That coin already has an agent.' });
  const vr = await verifyLaunch(a.c, sig, mint);
  if (vr.error) return send(res, 422, { error: vr.error });
  if (vr.wallet !== a.hold.wallet || !vr.signers.includes(a.hold.wallet)) return send(res, 422, { error: 'That transaction is not a pump.fun launch by your wallet for this coin.' });
  const p = a.hold.pending || {};
  const d = loadBears(a.c); // re-read before writing
  d.launched[a.slot] = { mint, signature: sig, wallet: a.hold.wallet, name: p.name || '', symbol: p.symbol || '', uri: p.uri || '', at: Date.now(), split: !!text(b.splitSignature, 120), founder: a.slot === 'F' };
  delete d.holds[a.slot];
  saveBears(a.c, d);
  send(res, 200, { ok: true, slot: bearLabel(a.slot) });
}


// ---- A coin's Den page: what the Den knows (bear, dev, links) plus the chain's public numbers, cached briefly ----
const coinCache = new Map();
function findLaunched(c, mint) {
  const d = loadBears(c);
  for (const k of Object.keys(d.launched)) if (d.launched[k].mint === mint) return { slot: k === 'F' ? 'F' : Number(k), rec: d.launched[k] };
  return null;
}
async function coinInfo(res, mint) {
  const c = cfg();
  if (!B58_RE.test(mint)) return send(res, 404, { error: 'No such coin.' });
  const f = findLaunched(c, mint);
  if (!f) return send(res, 404, { error: 'That coin was not launched from Mechpad.' });
  const key = c.cluster + ':' + mint, hit = coinCache.get(key);
  let onchain;
  if (hit && Date.now() - hit.at < 45000) onchain = hit.data;
  else {
    onchain = await chain.coinChain((method, params) => rpc(c, method, params), mint, f.rec.wallet, rpcUrl(c));
    coinCache.set(key, { at: Date.now(), data: onchain });
    if (coinCache.size > 200) coinCache.delete(coinCache.keys().next().value);
  }
  let meta = {};
  const mm = /\/metadata\/([a-f0-9]{16})\.json$/.exec(f.rec.uri || '');
  if (mm) { try { meta = JSON.parse(fs.readFileSync(path.join(META_DIR, mm[1] + '.json'), 'utf8')); } catch (e) { /* no metadata file */ } }
  const agent = f.slot === 'F' ? { name: PRIME.name, role: PRIME.role, blurb: PRIME.blurb } : (({ name, role, blurb }) => ({ name, role, blurb }))(art.agentFor(f.slot, imageSecret()));
  send(res, 200, {
    cluster: c.cluster, mint, bear: f.slot === 'F' ? 'F' : f.slot + 1, founder: !!f.rec.founder, total: c.total, name: f.rec.name, symbol: f.rec.symbol, dev: f.rec.wallet,
    launchedAt: f.rec.at, signature: f.rec.signature, feeSplit: !!f.rec.split, platformBps: c.platformWallet ? PLATFORM_BPS : 0,
    description: meta.description || '', twitter: meta.twitter || '', website: meta.website || '', onchain,
    agent, report: statusReport(agent, { launchedAt: f.rec.at, symbol: f.rec.symbol }, onchain, Date.now()),
  });
}

// Lets the launcher give the bear back (closed the page, changed their mind).
async function releaseHold(req, res) {
  const a = authHold(req, res); if (!a) return;
  delete a.d.holds[a.slot]; saveBears(a.c, a.d);
  send(res, 200, { ok: true });
}

// Owner only: everything about the bears on this network, for the /admin page.
async function adminState(req, res) {
  if (!guardAdmin(req, res)) return;
  const c = cfg(), d = loadBears(c), now = Date.now();
  const row = (key, label) => {
    const L = d.launched[key], H = d.holds[key];
    return { slot: key === 'F' ? 'founder' : Number(key) + 1, label, state: L ? 'launched' : H ? 'held' : 'open',
      name: L ? L.name : null, symbol: L ? L.symbol : null, mint: L ? L.mint : null, dev: L ? L.wallet : H ? H.wallet : null,
      at: L ? L.at : null, holdSeconds: H ? Math.max(0, Math.round((H.until - now) / 1000)) : null };
  };
  const bears = [];
  for (let i = 0; i < c.total; i++) bears.push(row(String(i), 'Agent #' + String(i + 1).padStart(2, '0')));
  if (c.founderWallet || d.launched.F || d.holds.F) bears.unshift(row('F', 'PRIME'));
  send(res, 200, { cluster: c.cluster, total: c.total, founderWallet: c.founderWallet || null, platformWallet: c.platformWallet || null, bears });
}

// Owner only: tie a coin that is already on the chain to a bear, for when the automatic lock did not go through.
async function adminAttach(req, res) {
  if (!guardAdmin(req, res)) return;
  const b = await jsonBody(req, res, 2000); if (!b) return;
  const c = cfg(), d = loadBears(c);
  const key = b.slot === 'founder' ? 'F' : Number(b.slot) - 1;
  if (key !== 'F' && (!Number.isInteger(key) || key < 0 || key >= c.total)) return send(res, 400, { error: 'No such agent.' });
  const mint = text(b.mint, 60), sig = text(b.signature, 120);
  if (!B58_RE.test(mint) || b58decode(mint).length !== 32) return send(res, 400, { error: 'That is not a valid coin address.' });
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig)) return send(res, 400, { error: 'That is not a valid transaction signature.' });
  if (d.launched[key]) return send(res, 409, { error: 'That agent already has a coin. Free it first.' });
  if (Object.values(d.launched).some((l) => l.mint === mint)) return send(res, 409, { error: 'That coin already has an agent.' });
  const vr = await verifyLaunch(c, sig, mint);
  if (vr.error) return send(res, 422, { error: vr.error });
  const name = text(b.name, 32), symbol = text(b.symbol, 10);
  if (!name || !/^[A-Za-z0-9$._-]{1,10}$/.test(symbol)) return send(res, 400, { error: 'Add the coin name and ticker.' });
  d.launched[key] = { mint, signature: sig, wallet: vr.wallet, name, symbol, uri: '', at: Date.now(), split: !!b.split, founder: key === 'F' };
  delete d.holds[key];
  saveBears(c, d);
  send(res, 200, { ok: true });
}

// Owner only: free a locked bear again (for example after a devnet test).
async function adminRelease(req, res) {
  if (!guardAdmin(req, res)) return;
  const b = await jsonBody(req, res, 500); if (!b) return;
  const c = cfg(), d = loadBears(c), i = b.slot === 'founder' ? 'F' : Number(b.slot) - 1;
  if (i !== 'F' && (!Number.isInteger(i) || i < 0 || i >= c.total)) return send(res, 400, { error: 'No such agent.' });
  delete d.launched[i]; delete d.holds[i]; saveBears(c, d);
  send(res, 200, { ok: true });
}

// ---- Coin metadata hosting and the mainnet RPC proxy ----
const META_DIR = path.join(DATA_DIR, 'meta');
const IMG_DIR = path.join(DATA_DIR, 'images');
fs.mkdirSync(META_DIR, { recursive: true }); fs.mkdirSync(IMG_DIR, { recursive: true });
const LAUNCH_JS = path.join(__dirname, 'dist', 'launch.js');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const IMG_MIME = { png: 'image/png' };
const RPC_METHODS = new Set(['getLatestBlockhash', 'getBlockHeight', 'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getSlot',
  'simulateTransaction', 'sendTransaction', 'getSignatureStatuses', 'getTransaction', 'getGenesisHash', 'getFeeForMessage',
  'getMinimumBalanceForRentExemption', 'getRecentPrioritizationFees', 'getTokenAccountBalance', 'getEpochInfo', 'getVersion']);

// The launch page remembers its lookup table here too, because some browsers will not keep it.
// The page only uses a table that the connected wallet controls, so a wrong value here can do no harm.
const LUT_FILE = path.join(DATA_DIR, 'tables.json');
async function lutStore(req, res, u) {
  const a = authHold(req, res); if (!a) return;
  let map = {}; try { map = JSON.parse(fs.readFileSync(LUT_FILE, 'utf8')); } catch (e) { /* none yet */ }
  const w = a.hold.wallet, cl = a.c.cluster;
  if (req.method === 'GET') return send(res, 200, { table: map[cl + ':' + w] || null });
  const b = await jsonBody(req, res, 1000); if (!b) return;
  if (!B58_RE.test(text(b.table, 60))) return send(res, 400, { error: 'Bad value.' });
  map[cl + ':' + w] = b.table;
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
    if (req.method === 'POST' && p === '/api/reserve') return await reserve(req, res);
    if (req.method === 'POST' && p === '/api/metadata') return await createMetadata(req, res);
    if (req.method === 'POST' && p === '/api/launched') return await launched(req, res);
    if (req.method === 'POST' && p === '/api/release') return await releaseHold(req, res);
    if (req.method === 'POST' && p === '/api/admin/release') return await adminRelease(req, res);
    if (req.method === 'POST' && p === '/api/admin/state') return await adminState(req, res);
    if (req.method === 'POST' && p === '/api/admin/attach') return await adminAttach(req, res);
    if (p === '/api/lut' && (req.method === 'GET' || req.method === 'POST')) return await lutStore(req, res, uu);
    if (req.method === 'POST' && p === '/api/rpc/mainnet') return await rpcProxy(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (p === '/api/bears') return bearsState(res);
    { const m = /^\/api\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(p); if (m) return await coinInfo(res, m[1]); }
    if (/^\/coin\/[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p)) { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' }); return res.end(fs.readFileSync(COIN_PAGE)); }
    if (p === '/admin') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' }); return res.end(fs.readFileSync(path.join(__dirname, 'admin.html'))); }
    if (p === '/intro3d.js' || p === '/vox.js') return serveStatic(res, path.join(__dirname, p.slice(1)), 'application/javascript; charset=utf-8', { 'Cache-Control': 'no-cache' });
    if (p === '/api/founder/voxels.json') { if (!cfg().founderWallet) return send(res, 404, { error: 'Not found' }); return sendVoxels(req, res, 'F'); }
    { const m = /^\/api\/agent\/(\d+)\/voxels\.json$/.exec(p); if (m) { const c = cfg(), n = Number(m[1]); if (n < 1 || n > c.total) return send(res, 404, { error: 'Not found' }); return sendVoxels(req, res, n - 1); } }
    if (p === '/cave.js') return serveStatic(res, path.join(__dirname, 'cave.js'), 'application/javascript; charset=utf-8', { 'Cache-Control': 'no-cache' });
    if (p === '/api/health') return send(res, 200, { ok: true });
    if (p === '/api/founder.png') { if (!cfg().founderWallet) return send(res, 404, { error: 'Not found' }); return send(res, 200, art.founderPng(384), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' }); }
    { const m = /^\/api\/preview\/(\d+)\.png$/.exec(p); if (m) { const c = cfg(), n = Number(m[1]); if (n < 1 || n > c.total) return send(res, 404, { error: 'Not found' }); return send(res, 200, art.png(n - 1, imageSecret(), 384), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' }); } }
    if (p === '/assets/cave.svg' || p === '/assets/moon.svg') return serveStatic(res, path.join(__dirname, p), 'image/svg+xml', { 'Cache-Control': 'public, max-age=86400' });
    if (p === '/launch.js') {
      if (!fs.existsSync(LAUNCH_JS)) return send(res, 404, 'Not built yet. Run npm run build.');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return res.end(fs.readFileSync(LAUNCH_JS));
    }
    let mm = /^\/metadata\/([a-f0-9]{16})\.json$/.exec(p);
    if (mm) return serveStatic(res, path.join(META_DIR, mm[1] + '.json'), 'application/json; charset=utf-8', CORS);
    mm = /^\/images\/([a-f0-9]{16})\.(png)$/.exec(p);
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

if (require.main === module) server.listen(PORT, '0.0.0.0', () => console.log('Mechpad listening on ' + PORT + ', data in ' + DATA_DIR));
module.exports = server;
