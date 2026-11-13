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

// The special abilities. Each one works only from the numbers the server read from the chain, and from w, what the agents
// saw on earlier visits (first look, highs, when milestones were crossed). Nothing here predicts, trades or moves funds.
const delta = (a, b, d) => (a >= b ? '+' : '−') + fmt(Math.abs(a - b), d);
const hrs = (ms) => ms / 3600000;
function span(ms) { const m = Math.round(ms / 60000); if (m < 1) return 'under a minute'; if (m < 90) return m + ' min'; const h = ms / 3600000; return h < 48 ? fmt(h, 1) + ' h' : fmt(h / 24, 1) + ' days'; }
const ABILITY_FN = {
  SCOUT(c) {
    const o = [], { oc, w, now, launched } = c;
    if (oc.holderCount == null) return [{ level: 'info', text: 'Holder Radar could not read the holder count just now.' }];
    o.push({ level: 'info', text: fmt(oc.holderCount, 0) + (oc.holderCountCapped ? '+' : '') + ' wallets hold the coin right now.' });
    if (w && w.first && w.first.holders != null && now - w.first.at > 60000) { const dl = oc.holderCount - w.first.holders; o.push({ level: dl > 0 ? 'good' : 'info', text: (dl === 0 ? 'No change in holders' : 'Holders ' + (dl > 0 ? 'up ' : 'down ') + fmt(Math.abs(dl), 0)) + ' since I first looked ' + span(now - w.first.at) + ' ago (' + fmt(w.first.holders, 0) + ' then).' }); }
    else o.push({ level: 'info', text: 'This is my first look at the coin. I will report the change next time you open this page.' });
    if (launched && hrs(now - launched) >= 0.25) o.push({ level: 'info', text: 'That averages about ' + fmt(oc.holderCount / hrs(now - launched), 1) + ' holders per hour since launch. It is an average so far, not a forecast.' });
    return o;
  },
  ANALYST(c) {
    const { oc, cv, w, now } = c;
    if (!cv || cv.marketCapSol == null) return [{ level: 'info', text: 'Cap Tracker could not read the market cap just now.' }];
    const o = [{ level: 'info', text: 'Market cap is about ' + fmt(cv.marketCapSol, cv.marketCapSol >= 100 ? 0 : 2) + ' SOL.' }];
    if (w && w.first && w.first.cap != null && now - w.first.at > 60000 && w.first.cap > 0) { const p = (cv.marketCapSol / w.first.cap - 1) * 100; o.push({ level: 'info', text: 'That is ' + (p >= 0 ? 'up ' : 'down ') + pc(Math.abs(p)) + ' from my first look (' + fmt(w.first.cap, 2) + ' SOL, ' + span(now - w.first.at) + ' ago).' }); }
    const pk = w && w.peak && w.peak.cap;
    if (pk && pk.v > 0) { const off = (1 - cv.marketCapSol / pk.v) * 100; o.push({ level: off >= 40 ? 'warn' : 'info', text: off < 1 ? 'It is at the highest market cap I have seen (' + fmt(pk.v, 2) + ' SOL).' : 'It is ' + pc(off) + ' below the highest I have seen (' + fmt(pk.v, 2) + ' SOL, ' + span(now - pk.at) + ' ago).' }); }
    return o;
  },
  SENTRY(c) {
    const { oc, w, now } = c, o = [];
    if (oc.devHoldPct == null) return [{ level: 'info', text: 'Dev Watch could not read the dev wallet just now.' }];
    o.push({ level: oc.devHoldPct >= 15 ? 'warn' : 'info', text: 'The dev wallet holds ' + pc(oc.devHoldPct) + ' of the supply.' });
    if (w && w.devMax != null && w.devMax - oc.devHoldPct >= 1) o.push({ level: 'warn', text: 'ALERT: the dev share fell from ' + pc(w.devMax) + ' to ' + pc(oc.devHoldPct) + ' since I started watching. The dev wallet has sold or moved tokens.' });
    else if (w && w.first && w.first.dev != null && now - w.first.at > 60000) o.push({ level: 'good', text: 'No dev selling seen in ' + span(now - w.first.at) + ' of watching (' + pc(w.first.dev) + ' at first look).' });
    else o.push({ level: 'info', text: 'I have only just started watching. I will flag it if the dev share drops.' });
    if (oc.top10Pct != null) { const f = w && w.first && w.first.top10; o.push({ level: oc.top10Pct >= 50 ? 'warn' : 'info', text: 'The top ten wallets hold ' + pc(oc.top10Pct) + (f != null && now - w.first.at > 60000 ? ' (' + pc(f) + ' at first look).' : '.') }); }
    return o;
  },
  COURIER(c) {
    const { w, now } = c, pk = (w && w.peak) || {}, o = [];
    if (pk.cap) o.push({ level: 'info', text: 'Highest market cap seen: ' + fmt(pk.cap.v, 2) + ' SOL, ' + span(now - pk.cap.at) + ' ago.' });
    if (pk.holders) o.push({ level: 'info', text: 'Most holders seen: ' + fmt(pk.holders.v, 0) + ', ' + span(now - pk.holders.at) + ' ago.' });
    if (pk.curve) o.push({ level: 'info', text: 'Furthest along the curve: ' + pc(pk.curve.v) + ', ' + span(now - pk.curve.at) + ' ago.' });
    if (w && w.n) o.push({ level: 'info', text: 'Records kept over ' + w.n + ' reading' + (w.n === 1 ? '' : 's') + ' since ' + span(now - w.first.at) + ' ago.' });
    return o.length ? o : [{ level: 'info', text: 'No records yet. The chain has not returned this coin’s numbers.' }];
  },
  ARCHIVIST(c) {
    const { w, now, launched } = c, o = [], m = (w && w.marks) || {};
    for (const k of ['25', '50', '75', '90']) if (m[k]) o.push({ level: 'good', text: 'First saw it pass ' + k + '% of the curve ' + span(now - m[k]) + ' ago' + (launched && m[k] > launched ? ' (' + span(m[k] - launched) + ' after launch).' : '.') });
    if (m.grad) o.push({ level: 'good', text: 'Graduated from pump.fun, first seen ' + span(now - m.grad) + ' ago.' });
    if (!o.length) o.push({ level: 'info', text: 'No milestone logged yet. The first one is at 25% of the curve.' });
    return o;
  },
  NAVIGATOR(c) {
    const { cv, now, launched } = c;
    if (!cv) return [{ level: 'info', text: 'Graduation Pace could not read the curve just now.' }];
    if (cv.complete) return [{ level: 'good', text: 'The curve is complete, so there is nothing left to raise.' }];
    const o = [];
    if (cv.progress > 0 && cv.raisedSol != null) o.push({ level: 'info', text: 'About ' + fmt(cv.raisedSol * (100 - cv.progress) / cv.progress, 1) + ' SOL more must be raised to fill the curve (' + pc(100 - cv.progress) + ' left).' });
    else o.push({ level: 'info', text: 'The curve is still empty, so the whole amount is left to raise.' });
    if (launched && hrs(now - launched) >= 0.25 && cv.progress > 0) o.push({ level: 'info', text: 'It has averaged ' + pc(cv.progress / hrs(now - launched)) + ' of the curve per hour since launch. That is the pace so far and it says nothing about what comes next.' });
    return o;
  },
  MECHANIC(c) {
    const { oc, cv, w } = c, errs = oc.errors || [], reads = [['curve', !!cv], ['holders', oc.holderCount != null], ['dev wallet', oc.devHoldPct != null], ['top ten', oc.top10Pct != null]], ok = reads.filter((r) => r[1]).length, o = [];
    o.push({ level: ok === reads.length ? 'good' : 'warn', text: ok + ' of ' + reads.length + ' readings came back from the chain' + (ok === reads.length ? '.' : '. Missing: ' + reads.filter((r) => !r[1]).map((r) => r[0]).join(', ') + '.') });
    if (errs.length) o.push({ level: 'warn', text: 'The chain reported trouble reading: ' + errs.join(', ') + '.' });
    if (oc.devHoldPct != null && oc.top10Pct != null) o.push({ level: oc.devHoldPct > 100 || oc.top10Pct > 100 ? 'warn' : 'good', text: oc.devHoldPct > 100 || oc.top10Pct > 100 ? 'A share came out above 100%, so a number is wrong.' : 'The shares are all between 0% and 100%, as they should be.' });
    if (oc.holderCountCapped) o.push({ level: 'info', text: 'The holder list was cut off at its limit, so the holder count is a minimum.' });
    if (w && w.n) o.push({ level: 'info', text: 'I have taken ' + w.n + ' reading' + (w.n === 1 ? '' : 's') + ' of this coin.' });
    return o;
  },
  SCRIBE(c) {
    const { oc, cv, now, launched } = c, parts = [];
    if (cv) parts.push((cv.complete ? 'has graduated from pump.fun' : 'is ' + pc(cv.progress) + ' of the way up its curve') + (cv.marketCapSol != null ? ', with a market cap of about ' + fmt(cv.marketCapSol, cv.marketCapSol >= 100 ? 0 : 2) + ' SOL' : ''));
    if (oc.holderCount != null) parts.push(fmt(oc.holderCount, 0) + (oc.holderCountCapped ? '+' : '') + ' wallets hold it');
    if (oc.devHoldPct != null) parts.push('the dev holds ' + pc(oc.devHoldPct));
    if (oc.top10Pct != null) parts.push('the top ten wallets hold ' + pc(oc.top10Pct));
    if (!parts.length) return [{ level: 'info', text: 'Nothing to write yet. The chain has not returned this coin’s numbers.' }];
    const flags = (oc.devHoldPct >= 15 ? 1 : 0) + (oc.top10Pct >= 50 ? 1 : 0);
    return [{ level: 'info', text: 'The coin ' + parts.join('; ') + '.' + (launched ? ' It launched ' + ago(now - launched) + '.' : '') + (flags ? ' ' + flags + ' thing' + (flags === 1 ? ' is' : 's are') + ' worth a closer look.' : ' Nothing stands out.') }];
  },
};
function abilityReport(role, c) {
  if (role === 'FLAGSHIP') {
    const lines = [];
    for (const r of Object.keys(ABILITY_FN)) { const l = ABILITY_FN[r](c); if (l.length) lines.push({ level: l.some((x) => x.level === 'warn') ? 'warn' : l[0].level, text: r[0] + r.slice(1).toLowerCase() + ': ' + l[0].text }); }
    return lines;
  }
  const fn = ABILITY_FN[role];
  return fn ? fn(c) : [];
}

// agent: { name, role }; coin: { launchedAt, symbol }; onchain: the object from chain.coinChain; now: ms.
function statusReport(agent, coin, onchain, now, watch) {
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
  const nowMs = now || Date.now();
  const ability = agent && agent.ability ? { name: agent.ability.name, does: agent.ability.does, lines: abilityReport(agent.role, { oc, cv, w: watch || null, now: nowMs, launched: coin && coin.launchedAt }) } : null;
  return { status, headline, lines: sorted, ability, at: now || Date.now(), note: 'Read from public chain data. This is not advice, and nothing here predicts the price.' };
}

module.exports = { statusReport };
