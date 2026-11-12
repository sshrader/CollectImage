'use strict';
// The agent's status report for its coin. It only reads the public numbers the server already fetched from the chain
// and turns them into plain sentences. It does not predict anything, and it does not trade or move funds.

const fmt = (n, d) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d });
const pc = (n) => fmt(n, n >= 10 ? 1 : 2) + '%';
function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'less than a minute ago';
  if (m < 60) return m + ' minute' + (m === 1 ? '' : 's') + ' ago';
  const h = Math.round(m / 60);
  if (h < 48) return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
  return Math.round(h / 24) + ' days ago';
}
const MARKS = [90, 75, 50, 25];

// agent: { name, role }; coin: { launchedAt, symbol }; onchain: the object from chain.coinChain; now: ms.
function statusReport(agent, coin, onchain, now) {
  const lines = [];
  const add = (kind, level, text) => lines.push({ kind, level, text });
  const oc = onchain || {};
  const cv = oc.curve;
  if (coin && coin.launchedAt) add('age', 'info', 'Launched ' + ago((now || Date.now()) - coin.launchedAt) + '.');
  if (cv) {
    if (cv.complete) add('curve', 'good', 'The bonding curve is complete, so the coin has graduated from pump.fun.');
    else {
      add('curve', 'info', 'The curve is ' + pc(cv.progress) + ' full, with ' + fmt(cv.raisedSol, 2) + ' SOL raised.');
      const m = MARKS.find((x) => cv.progress >= x);
      if (m) add('mark', 'good', 'It has passed the ' + m + '% mark on the curve.');
    }
    if (cv.marketCapSol != null) add('cap', 'info', 'Market cap is about ' + fmt(cv.marketCapSol, cv.marketCapSol >= 100 ? 0 : 2) + ' SOL.');
  }
  if (oc.devHoldPct != null) {
    if (oc.devHoldPct >= 15) add('dev', 'warn', 'The dev wallet holds ' + pc(oc.devHoldPct) + ' of the supply. A large share in one wallet can move the price if it is sold.');
    else if (oc.devHoldPct > 0) add('dev', 'info', 'The dev wallet holds ' + pc(oc.devHoldPct) + ' of the supply.');
    else add('dev', 'info', 'The dev wallet holds none of the supply right now.');
  }
  if (oc.top10Pct != null) {
    if (oc.top10Pct >= 50) add('top', 'warn', 'The ten biggest wallets, not counting the curve, hold ' + pc(oc.top10Pct) + '. Ownership is concentrated.');
    else add('top', 'info', 'The ten biggest wallets, not counting the curve, hold ' + pc(oc.top10Pct) + '.');
  }
  if (oc.holderCount != null) add('holders', 'info', fmt(oc.holderCount, 0) + (oc.holderCountCapped ? '+' : '') + ' wallets hold the coin.');
  if (oc.errors && oc.errors.length) add('gap', 'info', 'A few numbers could not be read from the chain just now, so this report is incomplete.');
  if (!cv && !lines.some((l) => l.kind !== 'age' && l.kind !== 'gap')) add('none', 'info', 'There is nothing to report yet. The chain has not returned this coin’s numbers.');

  // Each role leads with what it watches. The rest follow in the usual order.
  const lead = { SENTRY: ['dev', 'top'], ANALYST: ['cap', 'curve'], NAVIGATOR: ['curve', 'mark'], SCOUT: ['holders', 'top'], ARCHIVIST: ['mark', 'age'], COURIER: ['holders', 'cap'], MECHANIC: ['gap', 'dev'], SCRIBE: [] }[agent && agent.role] || [];
  const order = (l) => { const i = lead.indexOf(l.kind); return i < 0 ? 99 : i; };
  const sorted = lines.map((l, i) => ({ l, i })).sort((a, b) => (order(a.l) - order(b.l)) || (a.i - b.i)).map((x) => x.l);
  const warns = sorted.filter((l) => l.level === 'warn').length;
  const status = warns ? 'attention' : 'steady';
  const who = agent ? agent.name + ' (' + agent.role.toLowerCase() + ')' : 'The agent';
  const headline = warns ? who + ' has ' + warns + ' thing' + (warns === 1 ? '' : 's') + ' to flag.' : who + ' sees nothing to flag.';
  return { status, headline, lines: sorted, at: now || Date.now(), note: 'Read from public chain data. This is not advice, and nothing here predicts the price.' };
}

module.exports = { statusReport };
