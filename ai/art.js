'use strict';
// Pixel agents on a 64 by 64 grid. Each slot gets its own chassis, face, antenna and name, picked from a server secret,
// and no two slots in a set share the same look. The art stays on the server until a coin claims the agent.
const crypto = require('crypto');
const zlib = require('zlib');
const W = 64, H = 64;

const CHASSIS = [
  { key: 'steel', name: 'Steel', w: 24, base: '#8a98a8', light: '#b4c0cf', dark: '#5f6c7c', deep: '#3e4856' },
  { key: 'copper', name: 'Copper', w: 16, base: '#c0713a', light: '#e39a62', dark: '#8c4c22', deep: '#5e3114' },
  { key: 'mint', name: 'Mint', w: 14, base: '#4fd1a5', light: '#8cf0cc', dark: '#2c9a74', deep: '#1c6a50' },
  { key: 'violet', name: 'Violet', w: 14, base: '#8a6bd8', light: '#b79cf5', dark: '#5f45a8', deep: '#402d7a' },
  { key: 'ice', name: 'Ice', w: 12, base: '#9fd8f0', light: '#d2f1fc', dark: '#6aa8c4', deep: '#487e98' },
  { key: 'onyx', name: 'Onyx', w: 12, base: '#4a4f60', light: '#6f7690', dark: '#2e3240', deep: '#1c1f2a' },
  { key: 'sunset', name: 'Sunset', w: 8, base: '#e0603a', light: '#f78e66', dark: '#a93e20', deep: '#74270f' },
];
const ACCENTS = [['cyan', '#4ff3ff', 30], ['lime', '#9dff4f', 18], ['amber', '#ffb347', 18], ['magenta', '#ff5fd0', 14], ['red', '#ff5252', 10], ['white', '#f4faff', 10]];
const EYES = [['dots', 30], ['wide', 22], ['visor', 18], ['cyclops', 8], ['happy', 12], ['x', 5], ['sleepy', 5]];
const MOUTHS = [['smile', 34], ['flat', 24], ['grille', 18], ['open', 12], ['speaker', 12]];
const ANTENNAS = [['single', 30], ['none', 16], ['dual', 18], ['dish', 12], ['bolt', 8], ['halo', 10]];
const ACCS = [['none', 34], ['headset', 22], ['bolts', 18], ['blush', 10], ['stripe', 16]];
const CHESTS = [['core', 30], ['bars', 26], ['graph', 22], ['keypad', 22]];
const BGS = [['grid', 22], ['circuit', 20], ['dusk', 18], ['scan', 14], ['stars', 14], ['racks', 12]];
const NAMES = ['ATLAS', 'NOVA', 'PIXEL', 'ORBIT', 'KIRO', 'VEGA', 'ZED', 'LYRA', 'BOLT', 'MIRA', 'ECHO', 'QUILL', 'RIVET', 'SOL', 'TALOS', 'UMBRA', 'WREN', 'XENO', 'YARA', 'ZIP', 'AXLE', 'BYTE', 'CIPHER', 'DELTA', 'EMBER', 'FLUX', 'GLITCH', 'HALO', 'IOTA', 'JOULE', 'KILO', 'LUMEN', 'MOSS', 'NEON', 'OMNI', 'PROXY', 'QUBIT', 'RELAY', 'SPARK', 'TORQUE', 'VOLT', 'WISP', 'ARC', 'BEACON', 'CLINK', 'DRIFT', 'FABLE', 'GRID'];
// What each role does for its coin. These match what the coin page agent really reports.
const ROLES = {
  SCOUT: 'Watches for new holders and big buys.',
  ANALYST: 'Reports curve progress, market cap and holder spread.',
  SENTRY: 'Flags dev sells and wallets holding too much.',
  COURIER: 'Keeps a running tally of the coin’s activity.',
  ARCHIVIST: 'Records milestones as the coin passes them.',
  NAVIGATOR: 'Tracks how close the coin is to graduating.',
  MECHANIC: 'Checks the coin’s numbers and says what looks off.',
  SCRIBE: 'Writes the coin’s plain-language status report.',
};
const ROLE_KEYS = Object.keys(ROLES);
const INK = '#0b0e14';

function prng(seedBytes) {
  let a = seedBytes.readUInt32LE(0) ^ seedBytes.readUInt32LE(4);
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickW(list, r) { const tot = list.reduce((a, x) => a + x[1], 0); let t = r * tot; for (const x of list) { t -= x[1]; if (t < 0) return x; } return list[list.length - 1]; }

const SKINS = CHASSIS.map((c) => ({ name: c.name, base: c.base, light: c.light }));
const traitCache = new Map();
function traitsFor(slot, secret) {
  const ck = String(secret);
  let list = traitCache.get(ck);
  if (!list) { list = { rnd: prng(crypto.createHmac('sha256', ck).update('agents').digest()), items: [], seen: new Set(), names: new Set() }; traitCache.set(ck, list); }
  while (list.items.length <= slot) {
    let t, key, tries = 0;
    do {
      const ci = pickW(CHASSIS.map((c, i) => [i, c.w]), list.rnd())[0];
      const ai = pickW(ACCENTS.map((a, i) => [i, a[2]]), list.rnd())[0];
      t = {
        species: 'AGENT', skin: ci, coat: CHASSIS[ci].key, accent: ai,
        eyes: pickW(EYES, list.rnd())[0], mouth: pickW(MOUTHS, list.rnd())[0], antenna: pickW(ANTENNAS, list.rnd())[0],
        acc: pickW(ACCS, list.rnd())[0], chest: pickW(CHESTS, list.rnd())[0], bg: pickW(BGS, list.rnd())[0],
        wide: list.rnd() < 0.4, seed: Math.floor(list.rnd() * 1e9),
      };
      key = [t.skin, t.accent, t.eyes, t.mouth, t.antenna, t.acc, t.chest, t.bg, t.wide].join('|');
      tries++;
    } while (list.seen.has(key) && tries < 300);
    list.seen.add(key);
    let nm, nt = 0;
    do { nm = NAMES[Math.floor(list.rnd() * NAMES.length)]; nt++; } while (list.names.has(nm) && nt < 200);
    list.names.add(nm);
    t.name = nm; t.role = ROLE_KEYS[Math.floor(list.rnd() * ROLE_KEYS.length)];
    list.items.push(t);
  }
  return list.items[slot];
}
// What the page shows for an agent: its name, role and what the role does.
function agentFor(slot, secret) { const t = traitsFor(slot, secret); return { name: t.name, role: t.role, blurb: ROLES[t.role], chassis: CHASSIS[t.skin].name }; }

const grid = () => Array.from({ length: H }, () => Array(W).fill(null));
const put = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
const ell = (cx, cy, rx, ry) => (x, y) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; };
const fill = (g, shape, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shape(x, y)) g[y][x] = c; };
const rect = (g, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c); };
const mix = (a, b, t) => { const p = parseInt(a.slice(1, 7), 16), q = parseInt(b.slice(1, 7), 16); return '#' + [16, 8, 0].map((sh) => Math.round(((p >> sh) & 255) * (1 - t) + ((q >> sh) & 255) * t).toString(16).padStart(2, '0')).join(''); };
const mx = (x) => 63 - x;
// A plain box with a dark outline, a lit top and left edge, a shaded bottom and right edge, and clipped corners.
function box(g, x0, y0, x1, y1, P) {
  const clip = (x, y, a, b, c, d) => (x === a && y === b) || (x === c && y === b) || (x === a && y === d) || (x === c && y === d);
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (!clip(x, y, x0 - 1, y0 - 1, x1 + 1, y1 + 1)) put(g, x, y, INK);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (clip(x, y, x0, y0, x1, y1)) continue;
    put(g, x, y, y === y0 || x === x0 ? P.light : y === y1 || x === x1 ? P.dark : P.base);
  }
}

function drawBg(g, bg, r, A) {
  const dim = mix('#0b0e14', A, 0.18), mid = mix('#0b0e14', A, 0.32);
  if (bg === 'grid') {
    rect(g, 0, 0, 63, 63, '#0d1320');
    for (let i = 0; i < 64; i += 8) { rect(g, i, 0, i, 63, '#18233a'); rect(g, 0, i, 63, i, '#18233a'); }
  } else if (bg === 'circuit') {
    rect(g, 0, 0, 63, 63, '#0a1717');
    for (let n = 0; n < 14; n++) {
      let x = Math.floor(r() * 64), y = Math.floor(r() * 64);
      const horiz = r() < 0.5, len = 6 + Math.floor(r() * 18);
      for (let i = 0; i < len; i++) { put(g, horiz ? x + i : x, horiz ? y : y + i, '#15403c'); }
      put(g, horiz ? x + len : x, horiz ? y : y + len, mid); put(g, horiz ? x + len + 1 : x, horiz ? y : y + len + 1, mid);
    }
  } else if (bg === 'dusk') {
    const bands = ['#160d2a', '#221338', '#34194a', '#4d2250', '#733050', '#a24848', '#cf7648'];
    for (let y = 0; y < 64; y++) { const b = Math.min(6, Math.floor(y / 9.2)); const edge = (y % 9.2) < 1 && b > 0; for (let x = 0; x < 64; x++) g[y][x] = edge && (x + y) % 2 ? bands[b - 1] : bands[b]; }
  } else if (bg === 'scan') {
    for (let y = 0; y < 64; y++) rect(g, 0, y, 63, y, y % 2 ? '#0e121b' : '#0b0e15');
    const sy = 6 + Math.floor(r() * 48); rect(g, 0, sy, 63, sy + 1, dim);
  } else if (bg === 'stars') {
    rect(g, 0, 0, 63, 63, '#090b19');
    for (let n = 0; n < 46; n++) put(g, Math.floor(r() * 64), Math.floor(r() * 64), r() < 0.25 ? '#e9f2ff' : '#3a4468');
  } else {
    rect(g, 0, 0, 63, 63, '#0c0e13');
    for (const x0 of [0, 52]) {
      rect(g, x0, 0, x0 + 11, 63, '#151922');
      for (let y = 2; y < 62; y += 4) {
        rect(g, x0 + 1, y, x0 + 10, y + 2, '#1c2230');
        for (let k = 0; k < 3; k++) put(g, x0 + 2 + k * 2, y + 1, r() < 0.45 ? A : r() < 0.5 ? '#3ddc84' : '#2a3142');
      }
    }
  }
}

function drawAgent(t, r) {
  const g = grid(), P = CHASSIS[t.skin], A = ACCENTS[t.accent][1], Ad = mix(A, '#000000', 0.55);
  drawBg(g, t.bg, r, A);
  const hx0 = t.wide ? 14 : 16, hx1 = 63 - hx0;
  // antenna, behind the head
  if (t.antenna === 'single') { rect(g, 31, 6, 32, 11, P.dark); rect(g, 30, 3, 33, 6, INK); rect(g, 31, 4, 32, 5, A); put(g, 31, 4, '#ffffff'); }
  else if (t.antenna === 'dual') { rect(g, 23, 7, 24, 11, P.dark); rect(g, 39, 7, 40, 11, P.dark); rect(g, 22, 3, 25, 6, INK); rect(g, 38, 3, 41, 6, INK); rect(g, 23, 4, 24, 5, A); rect(g, 39, 4, 40, 5, A); }
  else if (t.antenna === 'dish') { rect(g, 31, 8, 32, 11, P.dark); fill(g, ell(32, 6.5, 6, 3.2), INK); fill(g, ell(32, 6.5, 5, 2.4), P.light); fill(g, (x, y) => ell(32, 6.5, 5, 2.4)(x, y) && y >= 7, P.dark); put(g, 32, 5, A); put(g, 31, 5, A); }
  else if (t.antenna === 'bolt') { rect(g, 31, 9, 32, 11, P.dark); [[33, 2], [32, 3], [31, 4], [32, 4], [33, 5], [32, 6], [31, 7], [32, 7], [31, 8]].forEach(([x, y]) => put(g, x, y, A)); }
  else if (t.antenna === 'halo') { const o = ell(32, 7, 10, 3.2), i = ell(32, 7, 8, 1.8); for (let y = 0; y < 14; y++) for (let x = 0; x < 64; x++) if (o(x, y) && !i(x, y)) put(g, x, y, A); }
  // ear pieces, behind the head
  if (t.acc === 'bolts') { box(g, hx0 - 3, 20, hx0 - 1, 27, { base: P.dark, light: P.base, dark: P.deep }); box(g, hx1 + 1, 20, hx1 + 3, 27, { base: P.dark, light: P.base, dark: P.deep }); }
  if (t.acc === 'headset') { box(g, hx0 - 3, 19, hx0 - 1, 28, { base: A, light: '#ffffff', dark: Ad }); box(g, hx1 + 1, 19, hx1 + 3, 28, { base: A, light: '#ffffff', dark: Ad }); }
  // arms and hands, behind the body
  box(g, 8, 40, 12, 54, P); box(g, 51, 40, 55, 54, P);
  box(g, 8, 55, 12, 58, { base: P.dark, light: P.base, dark: P.deep }); box(g, 51, 55, 55, 58, { base: P.dark, light: P.base, dark: P.deep });
  // legs
  box(g, 20, 58, 28, 61, { base: P.dark, light: P.base, dark: P.deep }); box(g, 35, 58, 43, 61, { base: P.dark, light: P.base, dark: P.deep });
  // neck, body, head
  rect(g, 28, 35, 35, 38, INK); rect(g, 29, 35, 34, 38, P.dark);
  box(g, 14, 38, 49, 57, P);
  [[16, 40], [47, 40], [16, 55], [47, 55]].forEach(([x, y]) => put(g, x, y, P.light));
  box(g, hx0, 12, hx1, 34, P);
  if (t.acc === 'stripe') rect(g, hx0 + 3, 14, hx1 - 3, 14, A);
  // face screen
  rect(g, hx0 + 3, 15, hx1 - 3, 31, INK); rect(g, hx0 + 4, 16, hx1 - 4, 30, '#0d1822');
  put(g, hx0 + 5, 17, '#1f3a4d'); put(g, hx0 + 6, 17, '#1f3a4d'); put(g, hx0 + 5, 18, '#1f3a4d');
  // eyes
  const pair = (pts, c) => pts.forEach(([x, y]) => { put(g, x, y, c); put(g, mx(x), y, c); });
  if (t.eyes === 'dots') { for (let y = 22; y <= 24; y++) for (let x = 26; x <= 28; x++) pair([[x, y]], A); pair([[26, 22]], '#ffffff'); }
  else if (t.eyes === 'wide') { for (let y = 20; y <= 25; y++) for (let x = 25; x <= 28; x++) pair([[x, y]], A); pair([[26, 21], [26, 22]], '#ffffff'); pair([[27, 24], [28, 24], [27, 25], [28, 25]], Ad); }
  else if (t.eyes === 'visor') { rect(g, 23, 21, 40, 25, A); rect(g, 23, 21, 40, 21, mix(A, '#ffffff', 0.5)); for (let y = 22; y <= 25; y += 1) { put(g, 31, y, Ad); put(g, 32, y, Ad); } }
  else if (t.eyes === 'cyclops') { fill(g, ell(32, 22.5, 4.2, 4.2), A); rect(g, 31, 22, 32, 23, '#0d1822'); put(g, 30, 20, '#ffffff'); put(g, 31, 20, '#ffffff'); }
  else if (t.eyes === 'happy') pair([[25, 24], [26, 23], [27, 22], [28, 22], [29, 23], [25, 25], [26, 24], [27, 23], [28, 23], [29, 24]], A);
  else if (t.eyes === 'x') pair([[25, 21], [26, 22], [27, 23], [28, 24], [28, 21], [27, 22], [26, 23], [25, 24]], A);
  else pair([[25, 24], [26, 24], [27, 24], [28, 24], [25, 25], [26, 25], [27, 25], [28, 25]], A);
  // mouth
  if (t.mouth === 'smile') pair([[28, 27], [29, 28], [30, 29], [31, 29]], A);
  else if (t.mouth === 'flat') rect(g, 28, 28, 35, 28, A);
  else if (t.mouth === 'grille') for (const x of [28, 30, 33, 35]) rect(g, x, 27, x, 29, A);
  else if (t.mouth === 'open') { rect(g, 29, 27, 34, 29, A); rect(g, 30, 28, 33, 28, '#0d1822'); }
  else pair([[29, 28], [31, 28]], A);
  if (t.acc === 'blush') pair([[23, 26], [24, 26], [23, 27], [24, 27]], '#ff7ab8');
  if (t.acc === 'headset') { [[hx0 - 2, 29], [hx0 - 2, 30], [hx0 - 1, 31], [hx0, 32], [hx0 + 1, 32]].forEach(([x, y]) => put(g, x, y, Ad)); put(g, hx0 + 2, 32, A); }
  // chest
  rect(g, 21, 41, 42, 54, INK); rect(g, 22, 42, 41, 53, P.deep);
  if (t.chest === 'core') { fill(g, ell(32, 47.5, 6, 6), INK); fill(g, ell(32, 47.5, 5, 5), Ad); fill(g, ell(32, 47.5, 3.6, 3.6), A); fill(g, ell(32, 47.5, 1.6, 1.6), '#ffffff'); }
  else if (t.chest === 'bars') for (let i = 0; i < 3; i++) { const len = 5 + Math.floor(r() * 11); rect(g, 24, 44 + i * 4, 39, 45 + i * 4, Ad); rect(g, 24, 44 + i * 4, 23 + len, 45 + i * 4, A); }
  else if (t.chest === 'graph') { let y = 48; for (let x = 24; x <= 39; x += 2) { const ny = 44 + Math.floor(r() * 8); for (let k = Math.min(y, ny); k <= Math.max(y, ny); k++) put(g, x, k, A); put(g, x + 1, ny, A); y = ny; } }
  else for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rect(g, 24 + j * 5, 44 + i * 3 + (i > 0 ? 0 : 0), 26 + j * 5, 45 + i * 3 + 0, r() < 0.55 ? A : Ad);
  return g;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The plain agent outline as rows of pixels: [y, x, length]. Used for the locked tiles on the page.
const SHAPE_ON = (x, y) => (x >= 16 && x <= 47 && y >= 12 && y <= 34) || (x >= 28 && x <= 35 && y >= 35 && y <= 38) || (x >= 14 && x <= 49 && y >= 38 && y <= 57)
  || (x >= 8 && x <= 12 && y >= 40 && y <= 58) || (x >= 51 && x <= 55 && y >= 40 && y <= 58) || (x >= 20 && x <= 28 && y >= 58 && y <= 61) || (x >= 35 && x <= 43 && y >= 58 && y <= 61);
function silhouette() {
  const runs = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!SHAPE_ON(x, y)) { x++; continue; }
      let n = 1;
      while (x + n < W && SHAPE_ON(x + n, y)) n++;
      runs.push([y, x, n]); x += n;
    }
  }
  return runs;
}

function rectsOf(g) {
  let rects = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = g[y][x];
      if (!c) { x++; continue; }
      let run = 1;
      while (x + run < W && g[y][x + run] === c) run++;
      rects += '<rect x="' + x + '" y="' + y + '" width="' + run + '" height="1" fill="' + c + '"/>';
      x += run;
    }
  }
  return rects;
}

// slot is 0-based. total is how many agents are in the set. owner is the wallet that holds this one (may be empty).
function render(slot, total, owner, secret, opts) {
  const bare = !!(opts && opts.bare);
  const t = traitsFor(slot, secret);
  const pal = CHASSIS[t.skin];
  const g = drawAgent(t, prng(crypto.createHash('sha256').update(String(t.seed)).digest()));
  const rects = rectsOf(g);
  const num = String(slot + 1).padStart(2, '0');
  const short = owner ? owner.slice(0, 4) + '…' + owner.slice(-4) : '';
  const traitLine = (pal.name + ' chassis, ' + t.eyes + ' eyes, ' + ACCENTS[t.accent][0] + ' glow').toUpperCase();
  if (bare) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" shape-rendering="crispEdges" role="img" aria-label="' + esc(t.name + ', a ' + t.role.toLowerCase() + ' agent') + '">' + rects + '</svg>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76" width="1024" height="1216" shape-rendering="crispEdges" role="img" aria-label="' + esc(t.name + ', agent ' + num + ' of ' + total + ', ' + t.role.toLowerCase() + ', ' + pal.name + ' chassis') + '">'
    + '<rect width="64" height="76" fill="#0b0e14"/>' + rects
    + '<text x="32" y="68.6" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="3.2" fill="' + pal.light + '" shape-rendering="auto">' + esc(t.name) + ' / ' + esc(t.role) + '</text>'
    + '<text x="32" y="71.8" text-anchor="middle" font-family="Courier New, monospace" font-size="1.9" fill="#8a97a8" shape-rendering="auto">' + esc(traitLine) + '</text>'
    + (short ? '<text x="32" y="74.6" text-anchor="middle" font-family="Courier New, monospace" font-size="1.8" fill="#5f6c7c" shape-rendering="auto">claimed by ' + esc(short) + '</text>' : '')
    + '</svg>';
}

const CRCT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRCT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngChunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
// A pixel grid as a PNG, scaled up with hard pixel edges (8x gives 512 by 512). Used for coin logos.
function gridToPng(g, k) {
  const w = W * k, h = H * k, row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = g[Math.floor(y / k)][Math.floor(x / k)] || '#120d0a';
      const hex = c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c;
      const n = parseInt(hex.slice(1, 7), 16), o = y * row + 1 + x * 3;
      raw[o] = (n >> 16) & 255; raw[o + 1] = (n >> 8) & 255; raw[o + 2] = n & 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

function png(slot, secret, scale) {
  const t = traitsFor(slot, secret);
  return gridToPng(drawAgent(t, prng(crypto.createHash('sha256').update(String(t.seed)).digest())), scale || 8);
}

// ---- PRIME: one special agent that is not part of the numbered set. A big graphite flagship with a gold crown and an amber visor. ----
function drawFounder() {
  const g = grid(), A = '#ffb347', GOLD = { base: '#ffc84a', light: '#fff0a0', dark: '#c8901c', deep: '#8a5c0a' };
  const P = { base: '#3a3d48', light: '#5a5e6e', dark: '#262830', deep: '#16171c' }, Ad = '#7a4a10';
  drawBg(g, 'racks', (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(), A);
  // arms: gold pauldrons over graphite forearms, gold fists
  for (const f of [(x) => x, mx]) {
    const a = f(4), b = f(13), lo = Math.min(a, b), hi = Math.max(a, b);
    box(g, Math.min(f(6), f(11)), 44, Math.max(f(6), f(11)), 55, P);
    box(g, Math.min(f(5), f(12)), 56, Math.max(f(5), f(12)), 60, GOLD);
    box(g, lo, 35, hi, 43, GOLD);
  }
  box(g, 19, 58, 28, 61, P); box(g, 35, 58, 44, 61, P);
  rect(g, 27, 33, 36, 36, INK); rect(g, 28, 33, 35, 36, P.dark);
  box(g, 14, 36, 49, 57, P);
  rect(g, 15, 36, 48, 36, GOLD.base); rect(g, 15, 53, 48, 54, GOLD.base); rect(g, 15, 54, 48, 54, GOLD.dark);
  [[17, 39], [46, 39], [17, 50], [46, 50]].forEach(([x, y]) => put(g, x, y, GOLD.light));
  // chest core
  fill(g, ell(32, 45, 7.4, 7.4), INK); fill(g, ell(32, 45, 6.4, 6.4), GOLD.dark); fill(g, ell(32, 45, 5, 5), A); fill(g, ell(32, 45, 2.4, 2.4), '#fff3c0');
  // head and crown
  box(g, 15, 10, 48, 32, P);
  rect(g, 17, 8, 46, 9, INK); rect(g, 18, 8, 45, 9, GOLD.base); rect(g, 18, 9, 45, 9, GOLD.dark);
  [[19, 4], [25, 5], [31, 7], [37, 5], [43, 4]].forEach(([x, h]) => { const top = 8 - h + (h === 7 ? -1 : 0); rect(g, x - 1, top - 1, x + 2, 7, INK); rect(g, x, top, x + 1, 7, GOLD.base); put(g, x, top, GOLD.light); });
  put(g, 31, 0, INK); rect(g, 31, 1, 32, 1, '#ff3b3b'); rect(g, 31, 2, 32, 2, '#ff3b3b');
  // visor screen and angry amber eyes
  rect(g, 18, 13, 45, 29, INK); rect(g, 19, 14, 44, 28, '#1a0a05');
  const rows = [[19, [29]], [20, [28, 29]], [21, [26, 27, 28, 29]], [22, [24, 25, 26, 27, 28, 29]], [23, [24, 25, 26, 27, 28]]];
  for (const [y, xs] of rows) for (const x of xs) { put(g, x, y, A); put(g, mx(x), y, A); }
  put(g, 28, 21, '#fff3c0'); put(g, 27, 22, '#fff3c0'); put(g, mx(28), 21, '#fff3c0'); put(g, mx(27), 22, '#fff3c0');
  rect(g, 24, 18, 27, 18, Ad); rect(g, mx(27), 18, mx(24), 18, Ad);
  for (let x = 26; x <= 37; x += 2) rect(g, x, 26, x, 27, A);
  rect(g, 26, 25, 37, 25, Ad);
  return g;
}
const founderPng = (scale) => gridToPng(drawFounder(), scale || 8);
function founderSvg(owner, bare) {
  const rects = rectsOf(drawFounder());
  if (bare) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" shape-rendering="crispEdges" role="img" aria-label="PRIME, the flagship agent">' + rects + '</svg>';
  const short = owner ? owner.slice(0, 4) + '…' + owner.slice(-4) : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76" width="1024" height="1216" shape-rendering="crispEdges" role="img" aria-label="PRIME, the flagship agent with a gold crown and an amber visor">'
    + '<rect width="64" height="76" fill="#0b0e14"/>' + rects
    + '<text x="32" y="68.6" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="3.2" fill="#ffc84a" shape-rendering="auto">PRIME 1 / 1</text>'
    + '<text x="32" y="71.8" text-anchor="middle" font-family="Courier New, monospace" font-size="1.9" fill="#8a97a8" shape-rendering="auto">FLAGSHIP, GOLD CROWN, AMBER VISOR</text>'
    + (short ? '<text x="32" y="74.6" text-anchor="middle" font-family="Courier New, monospace" font-size="1.8" fill="#5f6c7c" shape-rendering="auto">claimed by ' + short + '</text>' : '')
    + '</svg>';
}

module.exports = { render, traitsFor, agentFor, silhouette, SKINS, png, founderPng, founderSvg, ROLES };
