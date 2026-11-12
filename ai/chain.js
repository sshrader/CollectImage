'use strict';
// Reads a coin's public numbers from the chain for its Den page: supply, bonding curve, top holders, the dev's share.
// Read only. Plain JSON-RPC through the server's own rpc() function, so the private RPC address never leaves the server.
const crypto = require('crypto');

const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INITIAL_REAL_TOKENS = 793100000000000n; // what the curve starts with (793.1M tokens at 6 decimals)

function b58decode(str) {
  let n = 0n;
  for (const ch of str) { const i = ALPHA.indexOf(ch); if (i < 0) throw new Error('Not base58'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  let zeros = 0; while (zeros < str.length && str[zeros] === '1') zeros++;
  return Buffer.concat([Buffer.alloc(zeros), n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex')]);
}
function b58encode(buf) {
  let n = 0n; for (const b of buf) n = n * 256n + BigInt(b);
  let out = ''; while (n > 0n) { out = ALPHA[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = '1' + out; else break; }
  return out;
}

// A program derived address is a 32-byte value that is NOT a point on the ed25519 curve.
const P = 2n ** 255n - 19n;
function modpow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
const D = (P - 121665n * modpow(121666n, P - 2n, P) % P) % P;
function isOnCurve(bytes) {
  const y = BigInt('0x' + Buffer.from(bytes).reverse().toString('hex')) & ((1n << 255n) - 1n);
  if (y >= P) return false;
  const y2 = (y * y) % P, num = (y2 - 1n + P) % P, den = (D * y2 + 1n) % P;
  const x2 = (num * modpow(den, P - 2n, P)) % P;
  if (x2 === 0n) return true;
  return modpow(x2, (P - 1n) / 2n, P) === 1n;
}
function findPda(seeds, programId) {
  for (let bump = 255; bump >= 0; bump--) {
    const h = crypto.createHash('sha256').update(Buffer.concat([...seeds, Buffer.from([bump]), b58decode(programId), Buffer.from('ProgramDerivedAddress')])).digest();
    if (!isOnCurve(h)) return b58encode(h);
  }
  throw new Error('No program address found');
}
const curveFor = (mint) => findPda([Buffer.from('bonding-curve'), b58decode(mint)], PUMP);

function readCurve(b64) {
  const d = Buffer.from(b64, 'base64');
  if (d.length < 49) return null;
  return {
    virtualTokens: d.readBigUInt64LE(8), virtualSol: d.readBigUInt64LE(16), realTokens: d.readBigUInt64LE(24), realSol: d.readBigUInt64LE(32),
    totalSupply: d.readBigUInt64LE(40), complete: d[48] === 1,
  };
}

const pct = (part, whole) => (whole > 0n ? Number((part * 10000n) / whole) / 100 : 0);
const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);

// rpc(method, params) returns the JSON-RPC result. url is only used to spot a Helius endpoint (it can count holders in one call).
async function coinChain(rpc, mint, dev, url) {
  const out = { supply: null, decimals: 6, curve: null, holders: null, holderCount: null, devHoldPct: null, top10Pct: null, errors: [] };
  const attempt = async (label, fn) => { try { return await fn(); } catch (e) { out.errors.push(label); return null; } };

  const sup = await attempt('supply', () => rpc('getTokenSupply', [mint]));
  let supply = 0n;
  if (sup && sup.value) { supply = BigInt(sup.value.amount); out.decimals = sup.value.decimals; out.supply = Number(sup.value.uiAmountString || sup.value.uiAmount || 0); }

  const curveAddr = curveFor(mint);
  const acct = await attempt('curve', () => rpc('getAccountInfo', [curveAddr, { encoding: 'base64' }]));
  const cv = acct && acct.value && acct.value.data ? readCurve(acct.value.data[0]) : null;
  if (cv) {
    const dec = 10 ** out.decimals;
    const priceSol = cv.virtualTokens > 0n ? (Number(cv.virtualSol) / 1e9) / (Number(cv.virtualTokens) / dec) : null;
    const total = Number(cv.totalSupply) / dec;
    let progress = cv.complete ? 100 : Number(((INITIAL_REAL_TOKENS - cv.realTokens) * 10000n) / INITIAL_REAL_TOKENS) / 100;
    progress = Math.max(0, Math.min(100, progress));
    out.curve = { complete: cv.complete, progress, raisedSol: Number(cv.realSol) / 1e9, priceSol, marketCapSol: priceSol == null ? null : priceSol * total, address: curveAddr };
    if (!supply) { supply = cv.totalSupply; out.supply = total; }
  }

  // The biggest token accounts, with the wallet that owns each.
  const big = await attempt('holders', () => rpc('getTokenLargestAccounts', [mint]));
  const list = big && big.value ? big.value.slice(0, 20) : [];
  if (list.length) {
    const owners = await attempt('owners', () => rpc('getMultipleAccounts', [list.map((x) => x.address), { encoding: 'jsonParsed' }]));
    const rows = list.map((x, i) => {
      const acc = owners && owners.value && owners.value[i];
      const owner = acc && acc.data && acc.data.parsed && acc.data.parsed.info ? acc.data.parsed.info.owner : null;
      const raw = BigInt(x.amount);
      return { owner, raw, pct: pct(raw, supply), isCurve: owner === curveAddr, isDev: !!owner && owner === dev };
    });
    // The same wallet can own several accounts, so add them up.
    const byOwner = new Map();
    for (const r of rows) {
      const key = r.owner || ('acct' + byOwner.size);
      const prev = byOwner.get(key);
      if (prev) { prev.raw += r.raw; prev.pct = pct(prev.raw, supply); } else byOwner.set(key, Object.assign({}, r));
    }
    const merged = [...byOwner.values()].sort((a, b) => (b.raw > a.raw ? 1 : b.raw < a.raw ? -1 : 0));
    out.holders = merged.map((r) => ({ owner: r.owner, short: r.owner ? short(r.owner) : 'unknown', pct: r.pct, isCurve: r.isCurve, isDev: r.isDev }));
    const real = merged.filter((r) => !r.isCurve).slice(0, 10).reduce((s, r) => s + r.raw, 0n);
    out.top10Pct = pct(real, supply);
  }

  if (dev) {
    const bal = await attempt('dev', () => rpc('getTokenAccountsByOwner', [dev, { mint }, { encoding: 'jsonParsed' }]));
    if (bal && bal.value) {
      let sum = 0n;
      for (const a of bal.value) { const t = a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info && a.account.data.parsed.info.tokenAmount; if (t) sum += BigInt(t.amount); }
      out.devHoldPct = pct(sum, supply);
    }
  }

  // Counting every holder needs a Helius call. Skipped on other RPCs, where the top 20 is all we can show.
  if (/helius/i.test(url || '')) {
    const r = await attempt('count', () => rpc('getTokenAccounts', { mint, limit: 1000, page: 1 }));
    if (r && Array.isArray(r.token_accounts)) {
      const owners = new Set(r.token_accounts.filter((t) => Number(t.amount) > 0).map((t) => t.owner));
      out.holderCount = owners.size; out.holderCountCapped = r.token_accounts.length >= 1000;
    }
  }
  return out;
}

module.exports = { coinChain, curveFor, readCurve, findPda, b58encode, b58decode, isOnCurve };
