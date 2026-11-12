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
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bearden-'));
  process.env.IMAGE_SECRET = 'test-secret';
  process.env.LAUNCH_RETRY_MS = '5';
  process.env.ADMIN_TOKEN = 'a'.repeat(32);
  const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

  // A fake chain: transactions by signature.
  const txs = {};
  const fake = { chain: null };
  const fakeRpc = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c));
    req.on('end', () => {
      const j = JSON.parse(b);
      let result = null;
      if (j.method === 'getTransaction') result = txs[j.params[0]] || null;
      else if (j.method === 'getSlot') result = 123;
      else if (fake.chain && fake.chain[j.method]) result = fake.chain[j.method](j.params);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id || 1, result }));
    });
  });
  await new Promise((ok) => fakeRpc.listen(0, '127.0.0.1', ok));
  process.env.RPC_URL = 'http://127.0.0.1:' + fakeRpc.address().port;

  const server = require('../server.js');
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (p, body, tok) => fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: JSON.stringify(body) });

  async function reserve(w, slot, opts) {
    opts = opts || {};
    const ch = await (await post('/api/challenge', { wallet: w.address })).json();
    const sig = opts.badSig ? crypto.randomBytes(64).toString('base64') : w.sign(ch.message);
    const body = { wallet: w.address, nonce: ch.nonce, signature: sig, slot };
    const r = await post('/api/reserve', body);
    return { status: r.status, json: await r.json(), body };
  }
  const sigOf = () => b58encode(crypto.randomBytes(64));
  const launchTx = (wallet, mint, err) => ({ meta: { err: err || null }, transaction: { message: { header: { numRequiredSignatures: 2 }, accountKeys: [wallet, mint, PUMP, '11111111111111111111111111111111'] } } });

  let r = await (await fetch(base + '/api/bears')).json();
  check('starts on devnet with 4 open bears', r.cluster === 'devnet' && r.total === 4 && r.open === 4 && r.bears.length === 4 && r.bears.every((b) => b.state === 'open'), JSON.stringify(r).slice(0, 200));
  check('no platform split until a wallet is set', r.platform === null);
  const platformWallet = newWallet().address;
  process.env.PLATFORM_WALLET = platformWallet;
  r = await (await fetch(base + '/api/bears')).json();
  check('platform wallet and 5% are shown when set', r.platform && r.platform.wallet === platformWallet && r.platform.bps === 500);
  r = await fetch(base + '/api/preview/1.svg');
  const sv = await r.text();
  check('every bear can be previewed', r.status === 200 && sv.startsWith('<svg') && !sv.includes('<text'));
  check('preview out of range is a 404', (await fetch(base + '/api/preview/5.svg')).status === 404);
  check('the old admin launch page is gone', (await fetch(base + '/launch')).status === 404);
  const home = await fetch(base + '/');
  check('home page is Bear Den', home.status === 200 && (await home.text()).includes('Bear Den'));

  const a = newWallet(), b = newWallet(), c = newWallet(), d = newWallet(), e = newWallet();

  const bad = await reserve(a, 'random', { badSig: true });
  check('wrong signature is refused', bad.status === 401);
  const replay = await post('/api/reserve', bad.body);
  check('a used sign-in cannot be replayed', replay.status === 401);
  const chA = await (await post('/api/challenge', { wallet: a.address })).json();
  const steal = await post('/api/reserve', { wallet: b.address, nonce: chA.nonce, signature: b.sign(chA.message), slot: 'random' });
  check('a sign-in only works for the wallet it was issued to', steal.status === 401);
  check('bad wallet address rejected', (await post('/api/challenge', { wallet: 'nope' })).status === 400);

  let xa = await reserve(a, 2);
  check('a wallet can pick an open bear', xa.status === 200 && xa.json.slot === 2 && xa.json.token.length >= 32, JSON.stringify(xa.json));
  let xb = await reserve(b, 2);
  check('a held bear cannot be taken by someone else', xb.status === 409);
  xb = await reserve(b, 'random');
  check('random picks a different open bear', xb.status === 200 && xb.json.slot !== 2);
  check('bad bear number rejected', (await reserve(c, 9)).status === 400);
  const SL = [1, 2, 3, 4].find((n) => n !== 2 && n !== xb.json.slot); // a free bear that is neither a's first pick nor b's
  const xa2 = await reserve(a, SL);
  check('asking again swaps the held bear', xa2.status === 200 && xa2.json.slot === SL);
  r = await (await fetch(base + '/api/bears')).json();
  check('a wallet holds only one bear', r.bears.filter((x) => x.state === 'held').length === 2, JSON.stringify(r.bears.map((x) => x.state)));
  const xc = await reserve(c, 'random'), xd = await reserve(d, 'random');
  check('four wallets fill four bears', xc.status === 200 && xd.status === 200 && new Set([xa2.json.slot, xb.json.slot, xc.json.slot, xd.json.slot]).size === 4);
  const xe = await reserve(e, 'random');
  check('nothing left to hold when every bear is taken', xe.status === 409);

  // coin details: needs the hold token, and the logo is always the held bear
  const meta = (body, tok) => post('/api/metadata', body, tok);
  r = await meta({ name: 'Honey', symbol: 'HONEY' }, 'nope'.repeat(10));
  check('coin details need a live bear hold', r.status === 401);
  r = await meta({ name: 'Honey', symbol: 'HONEY', description: 'grr', twitter: '@Honey_Coin', website: 'honey.xyz' }, xa2.json.token);
  const jm = await r.json();
  const dm = jm.uri ? await (await fetch(base + new URL(jm.uri).pathname)).json() : {};
  check('metadata saved with cleaned socials', r.status === 201 && dm.name === 'Honey' && dm.twitter === 'https://x.com/Honey_Coin' && dm.website === 'https://honey.xyz/' && /\/images\/[a-f0-9]{16}\.png$/.test(dm.image || ''), JSON.stringify(jm));
  const im = await fetch(base + new URL(dm.image).pathname);
  const png = Buffer.from(await im.arrayBuffer());
  check('coin image is the bear as a 512px PNG', im.status === 200 && im.headers.get('content-type') === 'image/png' && png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 512 && png.readUInt32BE(20) === 512);
  r = await meta({ name: 'Honey', symbol: 'HONEY', image: 'data:image/png;base64,AAAA' }, xa2.json.token);
  check('an uploaded image is ignored, the bear is always the logo', r.status === 201);
  r = await meta({ name: 'Honey', symbol: 'HONEY', website: 'javascript:alert(1)' }, xa2.json.token);
  check('bad website rejected', r.status === 400);
  r = await meta({ name: 'Honey', symbol: 'bad ticker!' }, xa2.json.token);
  check('bad ticker rejected', r.status === 400);
  r = await meta({ name: 'Nazi Bear', symbol: 'HONEY' }, xa2.json.token);
  check('blocked words rejected', r.status === 400);
  r = await meta({ name: '', symbol: 'HONEY' }, xa2.json.token);
  check('name is required', r.status === 400);

  // locking after the launch is checked on the chain
  const mint = b58encode(crypto.randomBytes(32));
  r = await post('/api/launched', { mint: 'nope', signature: sigOf() }, xa2.json.token);
  check('bad coin address rejected', r.status === 400);
  r = await post('/api/launched', { mint, signature: sigOf() }, xa2.json.token);
  check('a launch that is not on the chain is refused', r.status === 422);
  const s1 = sigOf(); txs[s1] = launchTx(b.address, mint);
  r = await post('/api/launched', { mint, signature: s1 }, xa2.json.token);
  check("someone else's launch cannot lock my bear", r.status === 422);
  const s2 = sigOf(); txs[s2] = launchTx(a.address, mint, { InstructionError: 1 });
  r = await post('/api/launched', { mint, signature: s2 }, xa2.json.token);
  check('a failed transaction is refused', r.status === 422);
  const s3 = sigOf(); txs[s3] = { meta: { err: null }, transaction: { message: { header: { numRequiredSignatures: 2 }, accountKeys: [a.address, mint, '11111111111111111111111111111111'] } } };
  r = await post('/api/launched', { mint, signature: s3 }, xa2.json.token);
  check('a transaction that is not a pump.fun launch is refused', r.status === 422);
  const s4 = sigOf(); txs[s4] = launchTx(a.address, mint);
  r = await post('/api/launched', { mint, signature: s4, splitSignature: sigOf() }, xa2.json.token); r = { status: r.status, json: await r.json() };
  check('a real launch locks the bear', r.status === 200 && r.json.ok && r.json.slot === SL, r.status + ' ' + JSON.stringify(r.json));
  r = await (await fetch(base + '/api/bears')).json();
  const locked = r.bears.find((x) => x.n === SL);
  check('the bear shows its coin', locked.state === 'launched' && locked.symbol === 'HONEY' && locked.mint === mint);
  check('recent launches lists the new coin, and the bear knows its dev', r.recent.length === 1 && r.recent[0].mint === mint && r.recent[0].symbol === 'HONEY' && locked.dev === a.address && locked.split === true);

  // the coin's own page
  const chainMod = require('../chain.js');
  const curveAddr = chainMod.curveFor(mint);
  check('the bonding curve address is a program address (off the curve)', !chainMod.isOnCurve(chainMod.b58decode(curveAddr)) && chainMod.b58decode(curveAddr).length === 32);
  const curveData = Buffer.alloc(81); curveData.writeBigUInt64LE(1000000000000000n, 8); curveData.writeBigUInt64LE(40000000000n, 16); curveData.writeBigUInt64LE(693100000000000n, 24); curveData.writeBigUInt64LE(10000000000n, 32); curveData.writeBigUInt64LE(1000000000000000n, 40);
  fake.chain = {
    getTokenSupply: () => ({ value: { amount: '1000000000000000', decimals: 6, uiAmountString: '1000000000' } }),
    getAccountInfo: () => ({ value: { data: [curveData.toString('base64'), 'base64'] } }),
    getTokenLargestAccounts: () => ({ value: [{ address: 'AcctCurve', amount: '693100000000000' }, { address: 'AcctDev', amount: '50000000000000' }, { address: 'AcctOther', amount: '20000000000000' }] }),
    getMultipleAccounts: () => ({ value: [curveAddr, a.address, b.address].map((o) => ({ data: { parsed: { info: { owner: o } } } })) }),
    getTokenAccountsByOwner: () => ({ value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '50000000000000' } } } } } }] }),
  };
  r = await fetch(base + '/api/coin/' + mint);
  let cj = await r.json();
  check('coin page data has the den details', r.status === 200 && cj.name === 'Honey' && cj.symbol === 'HONEY' && cj.bear === SL && cj.dev === a.address && cj.feeSplit === true && cj.platformBps === 500, JSON.stringify(cj).slice(0, 200));
  check('coin page data has supply and the bonding curve', cj.onchain.supply === 1000000000 && cj.onchain.curve && Math.abs(cj.onchain.curve.progress - 12.6) < 0.1 && cj.onchain.curve.raisedSol === 10 && cj.onchain.curve.marketCapSol > 0, JSON.stringify(cj.onchain.curve));
  check('coin page data has holders, the dev share and top 10 without the curve', cj.onchain.holders.length === 3 && cj.onchain.holders[0].isCurve && cj.onchain.holders[1].isDev && cj.onchain.devHoldPct === 5 && cj.onchain.top10Pct === 7, JSON.stringify(cj.onchain).slice(0, 300));
  check('an unknown coin has no page', (await fetch(base + '/api/coin/' + b58encode(crypto.randomBytes(32)))).status === 404);
  r = await fetch(base + '/coin/' + mint);
  check('the coin page is served', r.status === 200 && (await r.text()).includes('Top holders'));
  r = await fetch(base + '/cave.js');
  check('the cave script is served', r.status === 200 && (await r.text()).includes('window.Cave'));
  r = await post('/api/launched', { mint, signature: s4 }, xa2.json.token);
  check('the used hold cannot lock again', r.status === 401);
  const again = await reserve(e, SL);
  check('a locked bear cannot be picked', again.status === 409);

  // giving a bear back
  r = await post('/api/release', {}, xb.json.token);
  check('a launcher can give their bear back', r.status === 200);
  r = await (await fetch(base + '/api/bears')).json();
  check('the released bear is open again', r.bears.find((x) => x.n === xb.json.slot).state === 'open' && r.open === 1);
  r = await post('/api/release', {}, xb.json.token);
  check('a released hold is dead', r.status === 401);

  // the lookup table is remembered per wallet and needs the hold token
  r = await fetch(base + '/api/lut');
  check('lookup table needs a bear hold', r.status === 401);
  const table = b58encode(crypto.randomBytes(32));
  r = await post('/api/lut', { table }, xc.json.token);
  const got = await (await fetch(base + '/api/lut', { headers: { Authorization: 'Bearer ' + xc.json.token } })).json();
  check('lookup table is remembered on the server', r.status === 200 && got.table === table);

  // owner tools
  r = await post('/api/admin/release', { slot: SL }, 'wrong');
  check('freeing a bear needs the admin password', r.status === 401);
  r = await post('/api/admin/release', { slot: SL }, 'a'.repeat(32));
  const after = await (await fetch(base + '/api/bears')).json();
  check('the owner can free a locked bear', r.status === 200 && after.bears.find((x) => x.n === SL).state === 'open');

  // one more full pass on a second network keeps its own books
  process.env.CLUSTER = 'mainnet';
  const mainState = await (await fetch(base + '/api/bears')).json();
  check('mainnet keeps separate bears from devnet', mainState.cluster === 'mainnet' && mainState.open === 4 && mainState.maxBuy === 10);
  r = await post('/api/rpc/mainnet', { method: 'getSlot', params: [] });
  check('rpc proxy forwards an allowed call', r.status === 200);
  r = await post('/api/rpc/mainnet', { method: 'requestAirdrop', params: [] });
  check('rpc proxy blocks other calls', r.status === 400);
  r = await post('/api/rpc/mainnet', [{ method: 'getSlot' }]);
  check('rpc proxy blocks batches', r.status === 400);
  delete process.env.CLUSTER;

  server.close(); fakeRpc.close();
  console.log(failed ? failed + ' failed' : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
