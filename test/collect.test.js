'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58encode(buf) {
  const digits = [0];
  for (const byte of buf) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (const byte of buf) { if (byte === 0) out += '1'; else break; }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}
function newWallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { address: b58encode(raw), sign: (msg) => crypto.sign(null, Buffer.from(msg), privateKey).toString('base64') };
}

let failed = 0;
function check(label, ok, extra) { console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok ? '' : ' ' + (extra || ''))); if (!ok) failed++; }

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-'));
  process.env.IMAGE_SECRET = 'test-secret';

  // A fake chain: balances by wallet.
  const balances = {};
  const fakeRpc = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c));
    req.on('end', () => {
      const j = JSON.parse(b);
      const owner = j.params[0];
      const amt = balances[owner] || 0;
      const value = amt > 0 ? [{ account: { data: { parsed: { info: { tokenAmount: { uiAmountString: String(amt) } } } } } }] : [];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value } }));
    });
  });
  await new Promise((ok) => fakeRpc.listen(0, '127.0.0.1', ok));
  process.env.RPC_URL = 'http://127.0.0.1:' + fakeRpc.address().port;
  process.env.COIN_MINT = b58encode(crypto.randomBytes(32));
  process.env.SLOTS = '3';
  process.env.MIN_HOLD = '100';

  const server = require('../server.js');
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  async function collect(w, opts) {
    opts = opts || {};
    const ch = await (await post('/api/challenge', { wallet: w.address })).json();
    const sig = opts.badSig ? crypto.randomBytes(64).toString('base64') : w.sign(ch.message);
    const body = { wallet: w.address, nonce: ch.nonce, signature: sig };
    const r = await post('/api/collect', body);
    return { status: r.status, json: await r.json(), body };
  }

  let r = await (await fetch(base + '/api/status')).json();
  check('status shows set up and empty', r.configured && r.total === 3 && r.claimed === 0 && r.slots.length === 3);

  const a = newWallet(), b = newWallet(), c = newWallet(), d = newWallet();

  let x = await collect(a);
  check('wallet with no coin is refused', x.status === 403, JSON.stringify(x.json));

  balances[a.address] = 50;
  x = await collect(a);
  check('wallet under the minimum is refused', x.status === 403);

  balances[a.address] = 100;
  x = await collect(a);
  check('holder gets an image', x.status === 200 && x.json.isNew && x.json.svg.startsWith('<svg') && x.json.svg.includes('SPARK 0'), JSON.stringify(x.json).slice(0, 120));
  check('image shows the owner', x.json.svg.includes(a.address.slice(0, 4)));
  const slotA = x.json.slot;
  const svgA = x.json.svg;

  x = await collect(a);
  check('same wallet gets the same image again', x.status === 200 && !x.json.isNew && x.json.slot === slotA && x.json.svg === svgA);

  const bad = await collect(b, { badSig: true });
  check('wrong signature is refused', bad.status === 401);
  const replay = await post('/api/collect', bad.body);
  check('a used sign-in cannot be replayed', replay.status === 401);

  const other = await collect(b); // b has no coin yet
  balances[b.address] = 1000; balances[c.address] = 1000; balances[d.address] = 1000;
  const xb = await collect(b), xc = await collect(c);
  check('other holders get different images', xb.status === 200 && xc.status === 200 && new Set([slotA, xb.json.slot, xc.json.slot]).size === 3);
  check('images differ', xb.json.svg !== svgA && xc.json.svg !== xb.json.svg);

  x = await collect(d);
  check('sold out after all images are taken', x.status === 409, JSON.stringify(x.json));

  r = await (await fetch(base + '/api/status')).json();
  check('status counts claims and hides full addresses', r.claimed === 3 && r.slots.every((s) => s.owner && s.owner.length < 12));

  balances[a.address] = 0;
  x = await collect(a);
  check('owner who sold loses access', x.status === 403);

  // someone else can't use a's challenge
  const chA = await (await post('/api/challenge', { wallet: a.address })).json();
  balances[a.address] = 500;
  const steal = await post('/api/collect', { wallet: b.address, nonce: chA.nonce, signature: b.sign(chA.message) });
  check('a sign-in only works for the wallet it was issued to', steal.status === 401);

  const junk = await post('/api/challenge', { wallet: 'nope' });
  check('bad wallet address rejected', junk.status === 400);

  server.close(); fakeRpc.close();
  console.log(failed ? failed + ' failed' : 'all passed');
  process.exit(failed ? 1 : 0);
})();
