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
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mechpad-'));
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
  process.env.DEVNET_RPC_URL = process.env.RPC_URL;

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
  r = await fetch(base + '/api/preview/1.png');
  const sv = Buffer.from(await r.arrayBuffer());
  check('every agent can be previewed', r.status === 200 && sv.subarray(1, 4).toString() === 'PNG');
  check('preview out of range is a 404', (await fetch(base + '/api/preview/5.png')).status === 404);
  r = await fetch(base + '/api/agent/1/voxels.json');
  const vj = await r.json();
  check('agent voxel model is served', r.status === 200 && vj.cells.length > 300 && vj.cells[0].length === 5 && Array.isArray(vj.palette) && (await fetch(base + '/api/agent/9/voxels.json')).status === 404);
  check('the old admin launch page is gone', (await fetch(base + '/launch')).status === 404);
  const home = await fetch(base + '/');
  check('home page is Mechpad', home.status === 200 && (await home.text()).includes('Mechpad'));

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
  check('/api/bears gives every agent a name and role', (await (await fetch(base + '/api/bears')).json()).bears.every((x) => x.agent && x.agent.name && x.agent.role));
  check('coin page data names its agent', cj.agent && /^[A-Z]+$/.test(cj.agent.name) && /^[A-Z]+$/.test(cj.agent.role) && cj.agent.blurb.length > 10, JSON.stringify(cj.agent));
  check('coin page data has an agent report built from the chain numbers', cj.report && cj.report.lines.some((l) => l.kind === 'curve' && /12\.6% full/.test(l.text)) && cj.report.lines.some((l) => l.kind === 'dev' && /holds 5% of the supply/.test(l.text)) && cj.report.status === 'steady' && /not advice/.test(cj.report.note), JSON.stringify(cj.report).slice(0, 300));
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

  // the Founder bear: one special bear that only FOUNDER_WALLET can launch
  const f = newWallet();
  check('the founder bear is hidden until a founder wallet is set', (await fetch(base + '/api/founder.png')).status === 404 && (await (await fetch(base + '/api/bears')).json()).founder === null);
  process.env.FOUNDER_WALLET = f.address;
  let fs0 = await (await fetch(base + '/api/bears')).json();
  check('the founder bear shows as reserved, without the full wallet', fs0.founder.state === 'reserved' && fs0.founder.short === f.address.slice(0, 4) + '…' + f.address.slice(-4) && !JSON.stringify(fs0).includes(f.address));
  const fsvg = await fetch(base + '/api/founder.png');
  check('the founder image is served', fsvg.status === 200 && Buffer.from(await fsvg.arrayBuffer()).subarray(1, 4).toString() === 'PNG');
  r = await reserve(e, 'founder');
  check('another wallet cannot take the founder bear', r.status === 403);
  r = await reserve(f, 'founder');
  check('the founder wallet can take the founder bear', r.status === 200 && r.json.slot === 'founder' && r.json.founder === true, JSON.stringify(r.json));
  const ftok = r.json.token;
  fs0 = await (await fetch(base + '/api/bears')).json();
  check('the founder bear shows as held', fs0.founder.state === 'held');
  r = await meta({ name: 'Mechpad', symbol: 'DEN', description: 'Mechpad coin' }, ftok);
  const fj = await r.json();
  const fdoc = await (await fetch(base + new URL(fj.uri).pathname)).json();
  const fpng = Buffer.from(await (await fetch(base + new URL(fdoc.image).pathname)).arrayBuffer());
  check('the founder logo is its own 512px PNG', r.status === 201 && fj.slot === 'founder' && fpng.subarray(1, 4).toString() === 'PNG' && fpng.readUInt32BE(16) === 512);
  const fmint = b58encode(crypto.randomBytes(32)), fs4 = sigOf(); txs[fs4] = launchTx(f.address, fmint);
  r = await post('/api/launched', { mint: fmint, signature: fs4 }, ftok);
  const fl = await r.json();
  check('the founder launch locks the founder bear', r.status === 200 && fl.slot === 'founder', JSON.stringify(fl));
  fs0 = await (await fetch(base + '/api/bears')).json();
  check('the founder bear shows its coin and is in recent launches', fs0.founder.state === 'launched' && fs0.founder.symbol === 'DEN' && fs0.founder.mint === fmint && fs0.recent.some((x) => x.bear === 'F' && x.mint === fmint));
  check('the founder coin does not use up a numbered bear', fs0.bears.every((x) => x.mint !== fmint));
  r = await reserve(f, 'founder');
  check('the founder bear cannot be launched twice', r.status === 409);
  cj = await (await fetch(base + '/api/coin/' + fmint)).json();
  check('the founder coin page data is marked as the founder', cj.bear === 'F' && cj.founder === true && cj.name === 'Mechpad');
  r = await post('/api/admin/release', { slot: 'founder' }, 'a'.repeat(32));
  fs0 = await (await fetch(base + '/api/bears')).json();
  check('the owner can free the founder bear', r.status === 200 && fs0.founder.state === 'reserved');
  // attaching a coin that is already on the chain (when the automatic lock failed)
  const amint = b58encode(crypto.randomBytes(32)), asig = sigOf(); txs[asig] = launchTx(f.address, amint);
  r = await post('/api/admin/attach', { slot: 'founder', mint: amint, signature: asig, name: 'Mechpad', symbol: 'DEN' }, 'wrong');
  check('attaching needs the admin password', r.status === 401);
  r = await post('/api/admin/attach', { slot: 'founder', mint: amint, signature: sigOf(), name: 'Mechpad', symbol: 'DEN' }, 'a'.repeat(32));
  check('attaching checks the launch on the chain', r.status === 422);
  r = await post('/api/admin/attach', { slot: 'founder', mint: amint, signature: asig, name: 'Mechpad', symbol: 'DEN' }, 'a'.repeat(32));
  fs0 = await (await fetch(base + '/api/bears')).json();
  check('the owner can attach an existing coin to a bear', r.status === 200 && fs0.founder.state === 'launched' && fs0.founder.mint === amint, r.status);
  r = await post('/api/admin/attach', { slot: 'founder', mint: amint, signature: asig, name: 'Mechpad', symbol: 'DEN' }, 'a'.repeat(32));
  check('a bear that already has a coin cannot be attached twice', r.status === 409);
  await post('/api/admin/release', { slot: 'founder' }, 'a'.repeat(32));

  // admin page
  check('the admin page is served', (await fetch(base + '/admin')).status === 200);
  r = await post('/api/admin/state', {}, 'wrong');
  check('admin state needs the password', r.status === 401);
  r = await post('/api/admin/state', {}, 'a'.repeat(32));
  const as = await r.json();
  check('admin state lists every bear, the founder first', r.status === 200 && as.cluster === 'devnet' && as.bears[0].slot === 'founder' && as.bears.length === 5, JSON.stringify(as).slice(0, 200));
  delete process.env.FOUNDER_WALLET;

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
  // agent art and the agent report, no server needed
  {
    const artM = require('../mech.js'), { statusReport } = require('../report.js');
    const names = new Set(), looks = new Set();
    for (let n = 0; n < 24; n++) { const t = artM.traitsFor(n, 'unit-secret'); names.add(t.name); looks.add(JSON.stringify(artM.agentVoxels(n, 'unit-secret').cells.slice(0, 400))); }
    check('agents in a set each have their own name and their own picture', names.size === 24 && looks.size === 24);
    const ag = artM.agentFor(0, 'unit-secret'), ag2 = artM.agentFor(0, 'unit-secret'), ag3 = artM.agentFor(0, 'other-secret');
    check('an agent is the same every time for the same secret', JSON.stringify(ag) === JSON.stringify(ag2) && ag.name && ag.role && ag.blurb);
    check('a different secret gives a different set', [0, 1, 2, 3].some((n) => JSON.stringify(artM.agentFor(n, 'unit-secret')) !== JSON.stringify(artM.agentFor(n, 'other-secret'))) && ag3.name);
    const pngB = artM.png(3, 'unit-secret'), prime = artM.founderPng();
    check('agent and PRIME logos are 512px PNGs', pngB.subarray(1, 4).toString() === 'PNG' && pngB.readUInt32BE(16) === 512 && prime.readUInt32BE(16) === 512);
    check('the outline for locked tiles has rows of runs', artM.silhouette().length > 40 && artM.silhouette().every((r) => r.length === 3));
    const calm = statusReport({ name: 'NOVA', role: 'ANALYST' }, { launchedAt: 1000 }, { curve: { complete: false, progress: 52, raisedSol: 30, marketCapSol: 80 }, devHoldPct: 3, top10Pct: 20, holderCount: 41, errors: [] }, 1000 + 5 * 60000);
    check('a calm coin gets a steady report with no flags', calm.status === 'steady' && /sees nothing to flag/.test(calm.headline) && calm.lines.every((l) => l.level !== 'warn') && calm.lines[0].kind === 'cap' && calm.lines.some((l) => /passed the 50% mark/.test(l.text)) && calm.lines.some((l) => /5 minutes ago/.test(l.text)), JSON.stringify(calm).slice(0, 300));
    const risky = statusReport({ name: 'TORQUE', role: 'SENTRY' }, { launchedAt: 1000 }, { curve: { complete: false, progress: 10, raisedSol: 2, marketCapSol: 30 }, devHoldPct: 40, top10Pct: 70, errors: ['holders'] }, 2000);
    check('a concentrated coin gets flags, led by the sentry, plus a gap note', risky.status === 'attention' && /2 things to flag/.test(risky.headline) && risky.lines[0].level === 'warn' && risky.lines[0].kind === 'dev' && risky.lines.some((l) => l.kind === 'gap'));
    {
      const chainM = require('../chain.js'), MINT = 'MintMintMintMintMintMintMintMintMint11111', DEV = 'DevDevDevDevDevDevDevDevDevDevDevDev111', SN = 'SniperSniperSniperSniperSniperSniper111';
      const calls = [];
      const mock = async (method, params) => {
        calls.push(method);
        if (method === 'getTokenSupply') return { value: { amount: '1000000000000000', decimals: 6, uiAmountString: '1000000000' } };
        if (method === 'getAccountInfo') return params[0] === MINT ? { value: { data: { parsed: { info: { mintAuthority: null, freezeAuthority: 'FreezeFreezeFreeze1111' } } } } } : { value: null };
        if (method === 'getTokenLargestAccounts') return { value: [{ address: 'a1', amount: '200000000000000' }, { address: 'a2', amount: '50000000000000' }] };
        if (method === 'getMultipleAccounts') return { value: [{ data: { parsed: { info: { owner: SN } } } }, { data: { parsed: { info: { owner: 'Other' } } } }] };
        if (method === 'getTokenAccountsByOwner') return { value: [] };
        if (method === 'getSignaturesForAddress') return [{ signature: 's3', slot: 101, err: null }, { signature: 's2', slot: 100, err: null }, { signature: 's1', slot: 100, err: null }];
        if (method === 'getTransaction') return { transaction: { message: { accountKeys: [{ pubkey: params[0] === 's2' ? SN : DEV }] } } };
        return null;
      };
      const cc = await chainM.coinChain(mock, MINT, DEV, '');
      check('the audit reads the mint and freeze authorities', cc.authority && cc.authority.mint === null && cc.authority.freeze === 'FreezeFreezeFreeze1111');
      check('the launch scan finds early buyers and what they hold', cc.launch && cc.launch.early === 2 && cc.launch.wallets === 1 && cc.launch.heldCount === 1 && cc.launch.heldPct === 20, JSON.stringify(cc.launch));
      const au = statusReport({ name: 'A', role: 'AUDITOR', ability: require('../mech.js').ABILITIES.AUDITOR }, {}, cc, 1).ability, hu = statusReport({ name: 'H', role: 'HUNTER', ability: require('../mech.js').ABILITIES.HUNTER }, {}, cc, 1).ability;
      check('auditor and hunter report what they found', au.lines[0].level === 'good' && au.lines[1].level === 'warn' && hu.lines[1].level === 'warn' && /20%/.test(hu.lines[1].text));
      const wd = statusReport({ name: 'W', role: 'WARDEN', ability: require('../mech.js').ABILITIES.WARDEN }, {}, { supply: 1e9, devHoldPct: 10, holders: [], curve: { complete: false, progress: 40, raisedSol: 30, vSol: 60, vTok: 700e6 } }, 1).ability;
      check('warden works out a sale from the curve reserves', /sold everything/.test(wd.lines[1].text) && /fall about/.test(wd.lines[1].text), JSON.stringify(wd.lines));
    }
    const abs = require('../mech.js').ABILITIES, rr = (role, w) => statusReport({ name: 'X', role, ability: abs[role] }, { launchedAt: 1000 }, { curve: { complete: false, progress: 52, raisedSol: 44, marketCapSol: 80 }, devHoldPct: 3, top10Pct: 20, holderCount: 41, errors: [] }, 3 * 3600000, w).ability;
    const hist = { first: { at: 0, cap: 50, holders: 20, dev: 8, top10: 30 }, peak: { cap: { v: 100, at: 1e5 }, holders: { v: 45, at: 2e5 }, curve: { v: 55, at: 2e5 } }, marks: { 25: 6e4 }, devMax: 8, n: 6 };
    check('every class has its own named ability', Object.keys(abs).length === 12 && new Set(Object.values(abs).map((a) => a.name)).size === 12);
    check('abilities compare now with what the agent saw before', /up 21/.test(rr('SCOUT', hist).lines[1].text) && /up 60%/.test(rr('ANALYST', hist).lines[1].text) && rr('SENTRY', hist).lines.some((l) => l.level === 'warn' && /fell from 8%/.test(l.text)) && /25%/.test(rr('ARCHIVIST', hist).lines[0].text) && /40\.6 SOL/.test(rr('NAVIGATOR', null).lines[0].text));
    check('abilities work with no history and the flagship sweeps them all', Object.keys(abs).every((k) => rr(k, null).lines.length > 0) && rr('FLAGSHIP', hist).lines.length === 11);
    const done = statusReport({ name: 'ZED', role: 'NAVIGATOR' }, {}, { curve: { complete: true, progress: 100, raisedSol: 85, marketCapSol: 400 } }, 1);
    check('a graduated coin says so', done.lines[0].level === 'good' && /graduated/.test(done.lines[0].text));
    const empty = statusReport({ name: 'WREN', role: 'SCRIBE' }, {}, { errors: ['supply', 'curve'] }, 1);
    check('with no chain data the report says so and does not invent numbers', empty.lines.length === 2 && empty.lines.every((l) => l.level === 'info') && !/%|SOL/.test(empty.lines.map((l) => l.text).join(' ')));
  }
  console.log(failed ? failed + ' failed' : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
