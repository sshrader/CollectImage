// Browser-side coin creation on Solana devnet using the official pump SDK.
// Bundled to dist/launch.js by build.mjs and exposed as window.SparkLaunch.
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionMessage,
  VersionedTransaction, LAMPORTS_PER_SOL
} from '@solana/web3.js';
import BN from 'bn.js';
import { PUMP_SDK, OnlinePumpSdk, getBuyTokenAmountFromSolAmount, feeSharingConfigPda } from '@pump-fun/pump-sdk';

// The pump program is deployed on devnet at the same address as mainnet.
// Mainnet goes through this site's own /api/rpc/mainnet, so the private RPC address stays on the server.
// That endpoint has no websocket, so mainnet waits for confirmation by polling.
export const CLUSTERS = {
  devnet: { label: 'Devnet', rpc: 'https://api.devnet.solana.com', explorer: 'devnet' },
  mainnet: { label: 'Mainnet', rpc: () => window.location.origin + '/api/rpc/mainnet', explorer: null, mainnet: true, poll: true, priority: 300000 }
};

// Each network has its own genesis hash. A launch only continues if the RPC is the network the person chose.
const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const TOKEN_DECIMALS = 6;
// Coins made with create_v2 use the Token-2022 program.
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
// Pump coins paired with SOL use wrapped SOL as the quote mint.
const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const MAX_TX_BYTES = 1232;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function message(e) {
  if (e && e.code === 4001) return 'You declined the request.';
  let m = (e && e.message) || String(e);
  const logs = e && e.logs;
  if (Array.isArray(logs) && logs.length) m += ' Logs: ' + logs.slice(-3).join(' | ');
  return m;
}

// Runs one named step. fn(done) calls done('ok', detail, href) itself; a throw marks the step as failed.
async function phase(step, label, fn) {
  const done = step(label);
  try { return await fn(done); }
  catch (e) { done('err', message(e)); throw e; }
}

const clusterQuery = (cfg) => (cfg.explorer ? '?cluster=' + cfg.explorer : '');
function explorerTx(cfg, sig) {
  return 'https://explorer.solana.com/tx/' + sig + clusterQuery(cfg);
}
function explorerAddress(cfg, addr) {
  return 'https://explorer.solana.com/address/' + addr + clusterQuery(cfg);
}

function config(cluster) {
  const base = CLUSTERS[cluster];
  if (!base) throw new Error('Unknown network: ' + cluster);
  return Object.assign({}, base, { rpc: typeof base.rpc === 'function' ? base.rpc() : base.rpc });
}

async function checkNetwork(conn, cfg) {
  const genesis = await conn.getGenesisHash();
  if (cfg.mainnet && genesis !== MAINNET_GENESIS) throw new Error('The mainnet connection is not answering as mainnet. Refusing to continue.');
  if (!cfg.mainnet && genesis === MAINNET_GENESIS) throw new Error('This RPC is mainnet. Refusing to continue.');
}

// Waits for a transaction by polling, and re-sends the same signed transaction every few seconds in case it was dropped.
async function pollConfirm(conn, sig, raw, lastValidBlockHeight) {
  for (let i = 0; i < 80; i++) {
    const st = (await conn.getSignatureStatuses([sig])).value[0];
    if (st && st.err) throw new Error('Transaction failed: ' + JSON.stringify(st.err));
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return;
    if (i > 0 && i % 4 === 0) {
      try { await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }); } catch (e) { /* the first send may already have landed */ }
      if ((await conn.getBlockHeight('confirmed')) > lastValidBlockHeight) throw new Error('The transaction expired before it was confirmed. Nothing was spent. Try again.');
    }
    await wait(1200);
  }
  throw new Error('Still waiting for confirmation after about 90 seconds. Check the signature on Solana Explorer before trying again.');
}

function tokensLabel(baseUnits) {
  const whole = Number(baseUnits.div(new BN(10).pow(new BN(TOKEN_DECIMALS))).toString());
  return whole.toLocaleString('en-US');
}

export async function airdrop(cluster, address, sol) {
  const cfg = config(cluster);
  if (cfg.mainnet) throw new Error('There is no faucet on mainnet.');
  const conn = new Connection(cfg.rpc, 'confirmed');
  const latest = await conn.getLatestBlockhash('confirmed');
  const sig = await conn.requestAirdrop(new PublicKey(address), (sol || 1) * LAMPORTS_PER_SOL);
  await conn.confirmTransaction({ signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, 'confirmed');
  return sig;
}

function statsFrom(info, global) {
  if (!info) return null;
  try {
    const c = PUMP_SDK.decodeBondingCurve(info);
    const initial = global.initialRealTokenReserves;
    let sold = initial.gtn(0) ? 100 - Number(c.realTokenReserves.muln(10000).div(initial).toString()) / 100 : 0;
    if (c.complete) sold = 100;
    sold = Math.max(0, Math.min(100, sold));
    const mcapLamports = c.virtualTokenReserves.gtn(0)
      ? c.virtualQuoteReserves.mul(c.tokenTotalSupply).div(c.virtualTokenReserves)
      : new BN(0);
    return { soldPct: sold, mcapSol: Number(mcapLamports.toString()) / LAMPORTS_PER_SOL, complete: !!c.complete };
  } catch (e) {
    return null;
  }
}

// The coin's on-chain fee split, or null if none is set.
function splitFrom(info) {
  if (!info) return null;
  try {
    const sc = PUMP_SDK.decodeSharingConfig(info);
    return {
      locked: !!sc.adminRevoked,
      shareholders: (sc.shareholders || []).map((s) => ({ address: s.address.toBase58(), shareBps: Number(s.shareBps) }))
    };
  } catch (e) {
    return null;
  }
}

// Reads each coin's bonding curve and fee split from the network.
// Returns one entry per mint, or null where the curve could not be read.
export async function curveStats(cluster, mints) {
  const cfg = config(cluster);
  const conn = new Connection(cfg.rpc, 'confirmed');
  const online = new OnlinePumpSdk(conn);
  const global = await online.fetchGlobal();
  const keys = mints.map((m) => PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), new PublicKey(m).toBuffer()], PUMP_PROGRAM)[0]);
  const shareKeys = mints.map((m) => feeSharingConfigPda(new PublicKey(m)));
  const out = [];
  for (let i = 0; i < keys.length; i += 100) {
    const [curveInfos, shareInfos] = await Promise.all([
      conn.getMultipleAccountsInfo(keys.slice(i, i + 100)),
      conn.getMultipleAccountsInfo(shareKeys.slice(i, i + 100))
    ]);
    curveInfos.forEach((info, j) => {
      const s = statsFrom(info, global);
      out.push(s ? Object.assign(s, { split: splitFrom(shareInfos[j]) }) : null);
    });
  }
  return out;
}

// Dry run, ask Phantom to sign, add any extra signer, send, confirm. Returns the signature.
async function signAndSend({ step, conn, cfg, wallet, tx, extraSigner, labels, dryRetries }) {
  await phase(step, labels.dry, async (done) => {
    // dryRetries covers a brand new lookup table, which can take a moment before it can be used.
    let sim = null;
    for (let i = 0; i <= (dryRetries || 0); i++) {
      sim = await conn.simulateTransaction(tx);
      if (!sim.value.err) break;
      if (i < (dryRetries || 0)) await wait(1500);
    }
    if (sim.value.err) {
      const tail = (sim.value.logs || []).slice(-4).join(' | ');
      throw new Error('The network rejected the dry run: ' + JSON.stringify(sim.value.err) + (tail ? '. ' + tail : ''));
    }
    done('ok', 'Passed, ' + (sim.value.unitsConsumed || '?') + ' compute units');
  });

  // Phantom signs first, then the new mint (if any) signs, so a wallet that adjusts the transaction cannot invalidate that signature.
  const signed = await phase(step, labels.sign, async (done) => {
    const s = await wallet.signTransaction(tx);
    if (extraSigner) { if (typeof s.partialSign === 'function') s.partialSign(extraSigner); else s.sign([extraSigner]); }
    done('ok', extraSigner ? 'Signed by your wallet and the new mint' : 'Signed by your wallet');
    return s;
  });

  return await phase(step, labels.send, async (done) => {
    const latest = await conn.getLatestBlockhash('confirmed');
    const raw = signed.serialize();
    // Public RPCs sit behind several nodes, and the one that checks the transaction can be a moment behind the one that
    // issued its blockhash ("Blockhash not found"). Resending the same signed transaction is safe: it can only land once.
    let sig = null;
    for (let i = 0; i < 6 && !sig; i++) {
      try {
        sig = await conn.sendRawTransaction(raw, { skipPreflight: i >= 4, preflightCommitment: 'processed' });
      } catch (e) {
        if (i === 5 || !/blockhash not found/i.test(String((e && e.message) || e))) throw e;
        await wait(1200);
      }
    }
    if (cfg.poll) {
      await pollConfirm(conn, sig, raw, latest.lastValidBlockHeight);
    } else {
      const res = await conn.confirmTransaction({ signature: sig, blockhash: signed.recentBlockhash || (signed.message && signed.message.recentBlockhash) || latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, 'confirmed');
      if (res.value.err) throw new Error('Transaction failed: ' + JSON.stringify(res.value.err));
    }
    done('ok', 'Confirmed ' + sig.slice(0, 12) + '… View on Solana Explorer', explorerTx(cfg, sig));
    return sig;
  });
}

// ---------- Creator fees ----------

// SOL waiting in the creator's fee vaults (bonding curve and open market), in SOL.
export async function creatorFees(cluster, address) {
  const cfg = config(cluster);
  const conn = new Connection(cfg.rpc, 'confirmed');
  const bal = await new OnlinePumpSdk(conn).getCreatorVaultBalanceBothPrograms(new PublicKey(address));
  return Number(bal.toString()) / LAMPORTS_PER_SOL;
}

// Sends the creator's accrued fees to the creator's own wallet. Coins with a fee split are paid out by the split instead.
export async function claimCreatorFees({ cluster, wallet, user }, step) {
  const cfg = config(cluster);
  const conn = new Connection(cfg.rpc, 'confirmed');
  const userKey = new PublicKey(user);
  await phase(step, 'Network check', async (done) => {
    await checkNetwork(conn, cfg);
    done('ok', cfg.label);
  });
  const tx = await phase(step, 'Build claim', async (done) => {
    const online = new OnlinePumpSdk(conn);
    const bal = await online.getCreatorVaultBalanceBothPrograms(userKey);
    if (bal.lten(0)) throw new Error('Nothing to claim yet. Fees build up as people trade your coins.');
    const ixs = await online.collectCoinCreatorFeeInstructions(userKey, userKey);
    const t = new Transaction().add(...ixs);
    t.feePayer = userKey;
    t.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
    done('ok', 'Claiming about ' + (Number(bal.toString()) / LAMPORTS_PER_SOL).toFixed(6) + ' SOL to your wallet');
    return t;
  });
  return await signAndSend({ step, conn, cfg, wallet, tx, labels: { dry: 'Dry run (claim)', sign: 'Approve claim in Phantom', send: 'Send claim' } });
}

// ---------- One-transaction launch: create + the creator's first buy ----------
// Create and buy together are 1501 bytes, over the 1232 byte limit for a normal transaction. A version 0 transaction
// with an address lookup table swaps the shared addresses for one-byte indexes, so both fit in one transaction.
// One transaction means the coin and the creator's buy land in the same block, so nobody can buy in between.

const LUT_CHUNK = 18;

function keysOf(ixs) {
  const out = new Set();
  for (const ix of ixs) {
    out.add(ix.programId.toBase58());
    for (const k of ix.keys) out.add(k.pubkey.toBase58());
  }
  return out;
}

// Addresses that are the same for every launch by this wallet. Found by building the instructions for two different
// throwaway mints and keeping what the two have in common (the creator's own wallet signs, so it is left out).
async function sharedAddresses({ global, userKey, amount, lamports, name, symbol, uri }) {
  const build = (mint) => PUMP_SDK.createV2AndBuyV2Instructions({
    global, mint, name, symbol, uri, creator: userKey, user: userKey, amount, quoteAmount: lamports, mayhemMode: false, slippage: 1
  });
  const [a, b] = await Promise.all([build(Keypair.generate().publicKey), build(Keypair.generate().publicKey)]);
  const kb = keysOf(b);
  return [...keysOf(a)].filter((k) => kb.has(k) && k !== userKey.toBase58());
}

function savedTable(cfg, userKey) {
  try { return localStorage.getItem('spark-lut:' + cfg.explorer + ':' + userKey.toBase58()); } catch (e) { return null; }
}
function saveTable(cfg, userKey, addr) {
  try { localStorage.setItem('spark-lut:' + cfg.explorer + ':' + userKey.toBase58(), addr); } catch (e) { /* only a convenience */ }
}

// Finds or builds the lookup table holding the shared addresses. Setting it up takes one or two wallet approvals, once.
async function ensureLookupTable({ step, conn, cfg, wallet, userKey, keys, tableHint, onTable }) {
  return await phase(step, 'Lookup table', async (done) => {
    let table = null;
    let why = 'no saved table in this browser';
    const saved = savedTable(cfg, userKey) || tableHint || null;
    if (saved) {
      why = 'saved table could not be read';
      // A node that is a moment behind can answer "not found" for a table that exists, so ask a few times.
      for (let i = 0; i < 4 && !table; i++) {
        try { table = (await conn.getAddressLookupTable(new PublicKey(saved), { commitment: 'confirmed' })).value; } catch (e) { table = null; }
        if (!table && i < 3) await wait(800);
      }
      // Only trust a table this wallet controls, so a copied or altered saved value cannot swap in someone else's.
      if (table && !(table.state.authority && table.state.authority.equals(userKey))) { table = null; why = 'saved table is not controlled by this wallet'; }
    }
    if (!table) console.info('[launch] building a new lookup table:', why);
    const have = new Set(table ? table.state.addresses.map((x) => x.toBase58()) : []);
    const missing = keys.filter((k) => !have.has(k));
    if (table && !missing.length) { done('ok', 'Using your saved table ' + table.key.toBase58().slice(0, 6) + '…'); return { table, fresh: false }; }

    let tableKey = table ? table.key : null;
    const chunks = [];
    for (let i = 0; i < missing.length; i += LUT_CHUNK) chunks.push(missing.slice(i, i + LUT_CHUNK).map((k) => new PublicKey(k)));
    for (let i = 0; i < chunks.length; i++) {
      const ixs = [];
      if (!tableKey) {
        const [createIx, addr] = AddressLookupTableProgram.createLookupTable({ authority: userKey, payer: userKey, recentSlot: await conn.getSlot('finalized') }); // a finalized slot is already in the network's recent-slot list; the latest one is not
        ixs.push(createIx);
        tableKey = addr;
      }
      ixs.push(AddressLookupTableProgram.extendLookupTable({ payer: userKey, authority: userKey, lookupTable: tableKey, addresses: chunks[i] }));
      const t = new Transaction().add(...ixs);
      t.feePayer = userKey;
      t.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
      const n = chunks.length > 1 ? ' ' + (i + 1) + '/' + chunks.length : '';
      await signAndSend({ step, conn, cfg, wallet, tx: t, labels: { dry: 'Dry run (lookup table' + n + ')', sign: 'Approve lookup table' + n + ' in Phantom', send: 'Send lookup table' + n } });
    }
    saveTable(cfg, userKey, tableKey.toBase58());
    if (onTable) { try { await onTable(tableKey.toBase58()); } catch (e) { /* only a convenience */ } }

    // Wait until the network shows every address, then a little longer: a table is usable from the slot after it is filled.
    let fresh = null;
    for (let i = 0; i < 12; i++) {
      fresh = (await conn.getAddressLookupTable(tableKey)).value;
      if (fresh && keys.every((k) => fresh.state.addresses.some((x) => x.toBase58() === k))) break;
      fresh = null;
      await wait(1000);
    }
    if (!fresh) throw new Error('The lookup table was created but is not readable yet. Try the launch again in a few seconds.');
    await wait(2500);
    done('ok', 'Table ready with ' + fresh.state.addresses.length + ' addresses (new table: ' + why + ')');
    return { table: fresh, fresh: true };
  });
}

// Create the coin and buy it in one transaction. Throws before anything is sent if it cannot be built.
async function createAndBuy({ step, conn, cfg, wallet, userKey, mint, name, symbol, uri, lamports, devBuySol, priorityMicroLamports, tableHint, onTable }) {
  const online = new OnlinePumpSdk(conn);
  const built = await phase(step, 'Build create + buy', async (done) => {
    const global = await online.fetchGlobal();
    let feeConfig = null;
    try { feeConfig = await online.fetchFeeConfig(); } catch (e) { /* the quote also works without it */ }
    // A brand new coin has no curve yet, so the first buy is priced against a fresh one.
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: lamports, quoteMint: NATIVE_MINT });
    if (amount.lten(0)) throw new Error('That dev buy size returns no tokens. Try a larger amount.');
    const ixs = await PUMP_SDK.createV2AndBuyV2Instructions({
      global, mint: mint.publicKey, name, symbol, uri, creator: userKey, user: userKey,
      amount, quoteAmount: lamports, mayhemMode: false, slippage: 1
    });
    const shared = await sharedAddresses({ global, userKey, amount, lamports, name, symbol, uri });
    done('ok', 'Mint ' + mint.publicKey.toBase58() + '. ' + devBuySol + ' SOL for about ' + tokensLabel(amount) + ' tokens, in the same transaction as the launch', explorerAddress(cfg, mint.publicKey.toBase58()));
    return { ixs, shared, amount };
  });

  const { table, fresh } = await ensureLookupTable({ step, conn, cfg, wallet, userKey, keys: built.shared, tableHint, onTable });

  const tx = await phase(step, 'Pack into one transaction', async (done) => {
    const pre = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 })];
    if (priorityMicroLamports > 0) pre.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }));
    const msg = new TransactionMessage({
      payerKey: userKey,
      recentBlockhash: (await conn.getLatestBlockhash('confirmed')).blockhash,
      instructions: pre.concat(built.ixs)
    }).compileToV0Message([table]);
    const vtx = new VersionedTransaction(msg);
    const size = vtx.serialize().length;
    if (size > MAX_TX_BYTES) throw new Error('Still too large for one transaction (' + size + ' of ' + MAX_TX_BYTES + ' bytes).');
    done('ok', size + ' of ' + MAX_TX_BYTES + ' bytes');
    return vtx;
  });

  return await signAndSend({
    step, conn, cfg, wallet, tx, extraSigner: mint, dryRetries: fresh ? 6 : 1,
    labels: { dry: 'Dry run (create + buy)', sign: 'Approve create + buy in Phantom', send: 'Send create + buy' }
  });
}

// Splits the coin's creator fees between the listed wallets and locks the list, so it cannot be changed later.
// Needs createFeeSharingConfig, then updateFeeSharesV2. One transaction if it fits, otherwise two.
async function lockFeeSplit({ step, conn, cfg, wallet, userKey, mint, shareholders }) {
  const txs = await phase(step, 'Build fee split', async (done) => {
    const create = await PUMP_SDK.createFeeSharingConfig({ creator: userKey, mint, pool: null });
    const update = await PUMP_SDK.updateFeeSharesV2({
      authority: userKey,
      mint,
      currentShareholders: [userKey],
      newShareholders: shareholders.map((s) => ({ address: new PublicKey(s.address), shareBps: s.shareBps })),
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM
    });
    const blockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
    const make = (ixs) => {
      const t = new Transaction().add(...ixs);
      t.feePayer = userKey;
      t.recentBlockhash = blockhash;
      return t;
    };
    let list = [make([create, update])];
    const size = list[0].serialize({ requireAllSignatures: false, verifySignatures: false }).length;
    if (size > MAX_TX_BYTES) list = [make([create]), make([update])];
    done('ok', shareholders.map((s) => (s.shareBps / 100) + '% to ' + s.address.slice(0, 4) + '…' + s.address.slice(-4)).join(', ') + (list.length > 1 ? '. Two transactions.' : ''));
    return list;
  });

  let last = null;
  for (let i = 0; i < txs.length; i++) {
    const n = txs.length > 1 ? ' ' + (i + 1) + '/' + txs.length : '';
    last = await signAndSend({
      step, conn, cfg, wallet, tx: txs[i],
      labels: { dry: 'Dry run (fee split' + n + ')', sign: 'Approve fee split' + n + ' in Phantom', send: 'Send fee split' + n }
    });
  }
  return last;
}

// Second transaction: the creator buys their own coin. Create plus buy together is over the 1232 byte limit.
async function devBuy({ step, conn, cfg, wallet, userKey, mint, lamports, devBuySol }) {
  const online = new OnlinePumpSdk(conn);

  const tx = await phase(step, 'Build dev buy', async (done) => {
    const global = await online.fetchGlobal();
    let feeConfig = null;
    try { feeConfig = await online.fetchFeeConfig(); } catch (e) { /* the quote also works without it */ }

    // The new coin may take a moment to be readable.
    let state = null, lastErr = null;
    for (let i = 0; i < 6 && !state; i++) {
      try { state = await online.fetchBuyState(mint, userKey, TOKEN_2022); }
      catch (e) { lastErr = e; await wait(1000); }
    }
    if (!state) throw lastErr || new Error('The new coin could not be read yet.');

    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: state.bondingCurve.tokenTotalSupply,
      bondingCurve: state.bondingCurve,
      amount: lamports,
      quoteMint: state.quoteMint
    });
    if (amount.lten(0)) throw new Error('That dev buy size returns no tokens. Try a larger amount.');

    // quoteAmount is a spending cap. The SDK adds 1% slippage on top of it.
    const ixs = await PUMP_SDK.buyV2Instructions({
      global,
      bondingCurveAccountInfo: state.bondingCurveAccountInfo,
      bondingCurve: state.bondingCurve,
      associatedUserAccountInfo: state.associatedUserAccountInfo,
      mint,
      user: userKey,
      amount,
      quoteAmount: lamports,
      slippage: 1,
      tokenProgram: TOKEN_2022,
      quoteTokenProgram: state.quoteTokenProgram
    });
    const t = new Transaction();
    t.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }));
    t.add(...ixs);
    t.feePayer = userKey;
    t.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
    done('ok', devBuySol + ' SOL for about ' + tokensLabel(amount) + ' tokens');
    return t;
  });

  return await signAndSend({
    step, conn, cfg, wallet, tx,
    labels: { dry: 'Dry run (dev buy)', sign: 'Approve dev buy in Phantom', send: 'Send dev buy' }
  });
}

// wallet is Phantom's provider. step(label) returns done(state, detail, href), as in the page's log.
// devBuySol is how much SOL the creator spends buying their own coin right after launch (0 for none).
// shareholders is an optional list of { address, shareBps } for the creator fee split (basis points, total 10000).
// atomic (default true): with a dev buy, create and buy go in ONE transaction so nobody can buy in between.
// allowSplitFallback: if the one-transaction launch cannot be built, fall back to two transactions. Devnet only.
export async function createCoin({ cluster, wallet, user, name, symbol, uri, devBuySol, shareholders, atomic, allowSplitFallback, priorityMicroLamports, tableHint, onTable }, step) {
  const cfg = config(cluster);
  const conn = new Connection(cfg.rpc, 'confirmed');
  const userKey = new PublicKey(user);
  let mint = Keypair.generate();
  const lamports = new BN(Math.round((devBuySol || 0) * LAMPORTS_PER_SOL));

  await phase(step, 'Network check', async (done) => {
    await checkNetwork(conn, cfg);
    const bal = await conn.getBalance(userKey);
    const sol = bal / LAMPORTS_PER_SOL;
    const need = (cfg.mainnet ? 0.08 : 0.06) + (devBuySol || 0);
    if (cfg.mainnet && sol < need) throw new Error('Balance is ' + sol.toFixed(3) + ' SOL. A ' + (devBuySol || 0) + ' SOL dev buy plus fees needs about ' + need.toFixed(2) + ' SOL.');
    done(sol < need ? 'warn' : 'ok', cfg.label + ', balance ' + sol.toFixed(3) + ' SOL' + (sol < need ? '. You may need more. Use the faucet button if the launch fails.' : ''));
  });

  const result = { signature: null, mint: mint.publicKey.toBase58(), buySignature: null, buyError: null, splitSignature: null, splitError: null, atomic: false };
  const wantBuy = lamports.gtn(0);

  if (wantBuy && atomic !== false) {
    try {
      result.signature = await createAndBuy({ step, conn, cfg, wallet, userKey, mint, name, symbol, uri, lamports, devBuySol, priorityMicroLamports: priorityMicroLamports != null ? priorityMicroLamports : (cfg.priority || 0), tableHint, onTable });
      result.buySignature = result.signature;
      result.atomic = true;
    } catch (e) {
      // Nothing was created if this failed, because one transaction either lands whole or not at all.
      if (!allowSplitFallback || cfg.mainnet || (e && e.code === 4001)) throw e; // never split a mainnet launch into two transactions
      step('One-transaction launch failed')('warn', message(e) + ' Falling back to two transactions, which a bot could slip between.');
      mint = Keypair.generate(); // fresh mint, in case the first attempt landed after all
      result.mint = mint.publicKey.toBase58();
    }
  }

  if (!result.signature) {
    const tx = await phase(step, 'Build create transaction', async (done) => {
      const ix = await PUMP_SDK.createV2Instruction({
        mint: mint.publicKey,
        name,
        symbol,
        uri,
        creator: userKey,
        user: userKey,
        mayhemMode: false
      });
      const t = new Transaction().add(ix);
      t.feePayer = userKey;
      t.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
      done('ok', 'Mint ' + mint.publicKey.toBase58(), explorerAddress(cfg, mint.publicKey.toBase58()));
      return t;
    });
    result.signature = await signAndSend({
      step, conn, cfg, wallet, tx, extraSigner: mint,
      labels: { dry: 'Dry run', sign: 'Approve in Phantom', send: 'Send and confirm' }
    });
  }

  // The coin exists now. If a later step fails, report it but keep the launch result.
  if (shareholders && shareholders.length) {
    try {
      result.splitSignature = await lockFeeSplit({ step, conn, cfg, wallet, userKey, mint: mint.publicKey, shareholders });
    } catch (e) {
      result.splitError = message(e);
    }
  }
  if (wantBuy && !result.atomic) {
    try {
      result.buySignature = await devBuy({ step, conn, cfg, wallet, userKey, mint: mint.publicKey, lamports, devBuySol });
    } catch (e) {
      result.buyError = message(e);
    }
  }
  return result;
}
