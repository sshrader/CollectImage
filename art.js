'use strict';
// Pixel frogs and toads on a 32 by 32 grid. Each slot gets its own combination of traits, picked from a server secret,
// and no two slots in a set share the same combination. The art stays on the server until a holder claims it.
const crypto = require('crypto');

const W = 32, H = 32;

const SKINS = [
  { name: 'Green', base: '#4caf50', light: '#7ddc6f', dark: '#2e7d32', line: '#14391a', belly: '#c9f2a8' },
  { name: 'Lime', base: '#a6d608', light: '#d4ff4d', dark: '#6f9400', line: '#2d3d00', belly: '#f3ffb0' },
  { name: 'Teal', base: '#1fb5a8', light: '#5fe8d9', dark: '#0f7b72', line: '#06302d', belly: '#c0fff7' },
  { name: 'Poison Blue', base: '#2f6bff', light: '#7aa2ff', dark: '#1c3fb0', line: '#0b1a52', belly: '#ffd84d' },
  { name: 'Red', base: '#e04b3a', light: '#ff8a73', dark: '#a12a1d', line: '#3d0d08', belly: '#ffd7c2' },
  { name: 'Orange', base: '#ff9a2e', light: '#ffc470', dark: '#c25f00', line: '#4a2400', belly: '#fff0c2' },
  { name: 'Yellow', base: '#ffd93b', light: '#fff08a', dark: '#c79b00', line: '#4f3d00', belly: '#fffbe0' },
  { name: 'Purple', base: '#9b5de5', light: '#c9a0ff', dark: '#5f2f99', line: '#230d42', belly: '#ecdcff' },
  { name: 'Pink', base: '#ff6fae', light: '#ffa8d0', dark: '#c2407a', line: '#4a0f2b', belly: '#ffe0ef' },
  { name: 'Gold', base: '#f2b705', light: '#ffe27a', dark: '#a37a00', line: '#3f2e00', belly: '#fff3b0' },
  { name: 'Ghost', base: '#dfe6f0', light: '#ffffff', dark: '#9aa7bd', line: '#2a3140', belly: '#ffffff' },
  { name: 'Mud', base: '#8b6b4a', light: '#b89268', dark: '#5a4129', line: '#241a10', belly: '#d9c3a0' },
  { name: 'Olive', base: '#7a8a3a', light: '#a9ba5c', dark: '#4d5a20', line: '#1c2208', belly: '#d7dfa0' },
  { name: 'Obsidian', base: '#3a3f52', light: '#6a7390', dark: '#1d2030', line: '#07080e', belly: '#8b93b0' },
];

const BGS = [
  { name: 'Dusk', sky: ['#2b1b4a', '#4a2a6e', '#7a3a7e', '#b5527a'], water: '#243a6e', ripple: '#4a66a8', decor: 'stars' },
  { name: 'Swamp', sky: ['#13281f', '#1b3a2a', '#245238', '#2f6a46'], water: '#16402f', ripple: '#2f7a58', decor: 'fireflies' },
  { name: 'Sunset', sky: ['#5a2a5e', '#a8396a', '#e2634a', '#ffa050'], water: '#7a2f5a', ripple: '#d1604f', decor: 'sun' },
  { name: 'Midnight', sky: ['#070914', '#0c1226', '#111a36', '#18244a'], water: '#0e1a3a', ripple: '#27407a', decor: 'moon' },
  { name: 'Mist', sky: ['#52605e', '#6b7c78', '#86998f', '#a2b5a6'], water: '#3d5a52', ripple: '#6e9488', decor: 'none' },
  { name: 'Candy', sky: ['#3a2a6e', '#5a3a9a', '#8a4ac2', '#c25ee0'], water: '#2c3a8a', ripple: '#5a6ad2', decor: 'stars' },
  { name: 'Ember', sky: ['#1c0a0a', '#3a1210', '#6a2012', '#a83a14'], water: '#3a1a1a', ripple: '#8a3a22', decor: 'fireflies' },
  { name: 'Mint', sky: ['#0f3a3a', '#1a5a52', '#2a7a6a', '#4aa88a'], water: '#10484a', ripple: '#3a9a8a', decor: 'none' },
];

const EYES = ['normal', 'big', 'dot', 'angry', 'sleepy', 'laser', 'heart', 'cross', 'shades'];
const MOUTHS = ['smile', 'wide', 'tongue', 'grumpy', 'open', 'tiny', 'goldtooth'];
const PATTERNS = ['none', 'spots', 'stripes', 'freckles', 'dither'];
const HATS = [null, 'crown', 'tophat', 'party', 'wizard', 'beanie', 'flower', 'mushroom', 'halo'];
const ACCS = [null, 'bowtie', 'chain', 'scarf', 'fly'];

const HAT_ART = {
  crown: { bottom: 11, rows: ['g.g.g.g', 'ggggggg', 'gdgrgdg'] },
  tophat: { bottom: 11, rows: ['..kkkkk..', '..kkkkk..', '..rrrrr..', 'kkkkkkkkk'] },
  party: { bottom: 11, rows: ['..w..', '..p..', '.pyp.', 'pypyp'] },
  wizard: { bottom: 11, rows: ['....v....', '...vvv...', '...vsv...', '..vvvvv..', '..vvsvv..', '.vvvvvvv.', 'vvvvvvvvv'] },
  beanie: { bottom: 11, rows: ['...w...', '.rrrrr.', 'rrrrrrr', 'wwwwwww'] },
  flower: { bottom: 11, rows: ['..p..', '.pyp.', '..p..', '..g..'] },
  mushroom: { bottom: 11, rows: ['.rrrrr.', 'rwrrrwr', 'rrrrrrr', '..www..'] },
  halo: { bottom: 4, rows: ['.yyyyyyy.', 'y.......y'] },
};
const HAT_COLORS = { g: '#ffc65c', d: '#c98a1e', r: '#e23b3b', b: '#3b6be2', k: '#15121f', w: '#ffffff', y: '#ffe76a', p: '#ff7aa8', v: '#6a3dff', s: '#ffe76a' };

function prng(seedBytes) {
  let a = seedBytes.readUInt32LE(0) ^ seedBytes.readUInt32LE(4);
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// The traits for every slot are made in order, skipping any combination already used, so all frogs in a set differ.
const traitCache = new Map();
function traitsFor(slot, secret) {
  const ck = String(secret);
  let list = traitCache.get(ck);
  if (!list) { list = { rnd: prng(crypto.createHmac('sha256', ck).update('frogs').digest()), items: [], seen: new Set() }; traitCache.set(ck, list); }
  while (list.items.length <= slot) {
    let t, key, tries = 0;
    do {
      const toad = list.rnd() < 0.28;
      t = {
        species: toad ? 'TOAD' : 'FROG',
        skin: Math.floor(list.rnd() * SKINS.length),
        pattern: toad ? 'warts' : pick(list.rnd, PATTERNS),
        eyes: pick(list.rnd, EYES),
        mouth: pick(list.rnd, MOUTHS),
        hat: pick(list.rnd, HATS),
        acc: pick(list.rnd, ACCS),
        bg: Math.floor(list.rnd() * BGS.length),
        sparkle: list.rnd() < 0.5,
        seed: Math.floor(list.rnd() * 1e9),
      };
      key = [t.species, t.skin, t.pattern, t.eyes, t.mouth, t.hat, t.acc, t.bg, t.sparkle].join('|');
      tries++;
    } while (list.seen.has(key) && tries < 300);
    list.seen.add(key);
    list.items.push(t);
  }
  return list.items[slot];
}

function grid() { return Array.from({ length: H }, () => Array(W).fill(null)); }
function put(g, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; }
const ell = (cx, cy, rx, ry) => (x, y) => { const dx = (x - cx) / rx, dy = (y - cy) / ry; return dx * dx + dy * dy <= 1; };
function fill(g, shape, c) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shape(x, y)) g[y][x] = c; }
function stamp(g, art, cx, bottom) {
  const w = art.rows[0].length, top = bottom - art.rows.length + 1;
  art.rows.forEach((row, j) => { for (let i = 0; i < w; i++) { const ch = row[i]; if (ch !== '.') put(g, cx - ((w - 1) >> 1) + i, top + j, HAT_COLORS[ch]); } });
}

const SHAPES = [ell(16, 16.5, 10.5, 5.5), ell(16, 23, 8.5, 6.5), ell(10, 10, 4, 4), ell(22, 10, 4, 4), ell(7.5, 28, 4.5, 2.3), ell(24.5, 28, 4.5, 2.3), ell(6.5, 23, 3, 4), ell(25.5, 23, 3, 4)];

// The plain frog outline as rows of pixels: [y, x, length]. Used for the locked tiles on the page.
function silhouette() {
  const runs = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!SHAPES.some((s) => s(x, y))) { x++; continue; }
      let n = 1;
      while (x + n < W && SHAPES.some((s) => s(x + n, y))) n++;
      runs.push([y, x, n]); x += n;
    }
  }
  return runs;
}

function drawBackground(g, bg, rnd) {
  for (let y = 0; y < H; y++) {
    const band = Math.min(3, Math.floor(y / 7));
    for (let x = 0; x < W; x++) {
      let c = bg.sky[band];
      const edge = y % 7;
      if (band < 3 && edge >= 5 && (x + y) % 2 === 0) c = bg.sky[band + 1]; // dithered blend into the next band
      g[y][x] = c;
    }
  }
  for (let y = 27; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = bg.water;
  for (let i = 0; i < 9; i++) { const y = 28 + Math.floor(rnd() * 4), x = Math.floor(rnd() * 30); put(g, x, y, bg.ripple); put(g, x + 1, y, bg.ripple); }
  if (bg.decor === 'stars') for (let i = 0; i < 9; i++) put(g, Math.floor(rnd() * 32), Math.floor(rnd() * 14), '#fff4dc');
  if (bg.decor === 'fireflies') for (let i = 0; i < 6; i++) { const x = 1 + Math.floor(rnd() * 30), y = 2 + Math.floor(rnd() * 20); put(g, x, y, '#ffe76a'); put(g, x - 1, y, '#8a8a2a'); put(g, x + 1, y, '#8a8a2a'); }
  if (bg.decor === 'sun') fill(g, ell(26, 5, 3.4, 3.4), '#ffd27a');
  if (bg.decor === 'moon') { fill(g, ell(27, 5, 3.2, 3.2), '#f3f1e6'); fill(g, ell(28.4, 4.2, 2.6, 2.6), bg.sky[0]); }
}

function drawFrog(t, rnd, transparent) {
  const pal = SKINS[t.skin], bg = BGS[t.bg];
  const g = grid();
  drawBackground(transparent ? grid() : g, bg, rnd); // the same random numbers are used either way

  if (!transparent) {
    // lily pad
    fill(g, ell(16, 29.6, 11, 1.9), '#3f9a3f'); fill(g, ell(16, 29.2, 9.5, 1.2), '#58c258');
    put(g, 27, 29, bg.water);
  }

  // hat goes in before the head so the eyes always stay in front of it
  if (t.hat) stamp(g, HAT_ART[t.hat], 16, HAT_ART[t.hat].bottom);

  // silhouette
  const shapes = SHAPES;
  const mask = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => shapes.some((s) => s(x, y))));
  const inM = (x, y) => x >= 0 && x < W && y >= 0 && y < H && mask[y][x];
  const outline = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => mask[y][x] && (!inM(x - 1, y) || !inM(x + 1, y) || !inM(x, y - 1) || !inM(x, y + 1))));
  const dist = Array.from({ length: H }, () => Array(W).fill(99));
  const queue = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (outline[y][x]) { dist[y][x] = 0; queue.push([x, y]); }
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y] = queue[qi];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inM(nx, ny) && dist[ny][nx] > dist[y][x] + 1) { dist[ny][nx] = dist[y][x] + 1; queue.push([nx, ny]); }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y][x]) continue;
    if (outline[y][x]) { g[y][x] = pal.line; continue; }
    let c = pal.base;
    if (dist[y][x] === 1) {
      if (outline[y - 1][x] || outline[y][x - 1]) c = pal.light;
      else if (outline[y + 1][x] || outline[y][x + 1]) c = pal.dark;
    }
    g[y][x] = c;
  }
  const interior = (x, y) => inM(x, y) && dist[y][x] >= 2;

  // belly
  const belly = ell(16, 23.5, 5.5, 4.5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (belly(x, y) && interior(x, y) && y > 17) g[y][x] = pal.belly;

  // skin pattern
  const spot = (x, y, c) => { if (interior(x, y) && g[y][x] !== pal.belly) put(g, x, y, c); };
  if (t.pattern === 'spots') for (let i = 0; i < 12; i++) { const x = 4 + Math.floor(rnd() * 24), y = 12 + Math.floor(rnd() * 15); spot(x, y, pal.dark); if (rnd() < 0.5) spot(x + 1, y, pal.dark); }
  if (t.pattern === 'stripes') for (const x of [12, 14, 16, 18, 20]) { spot(x, 12, pal.dark); spot(x, 13, pal.dark); }
  if (t.pattern === 'stripes') for (const y of [22, 24, 26]) for (const x of [5, 6, 7, 25, 26, 27]) spot(x, y, pal.dark);
  if (t.pattern === 'freckles') for (let i = 0; i < 14; i++) spot(6 + Math.floor(rnd() * 20), 13 + Math.floor(rnd() * 13), pal.light);
  if (t.pattern === 'dither') for (let y = 20; y < 29; y++) for (let x = 0; x < W; x++) if ((x + y) % 2 === 0 && mask[y][x] && g[y][x] === pal.base) g[y][x] = pal.dark;
  if (t.pattern === 'warts') for (let i = 0; i < 16; i++) { const x = 5 + Math.floor(rnd() * 22), y = 12 + Math.floor(rnd() * 15); if (interior(x, y) && g[y][x] !== pal.belly && interior(x - 1, y - 1)) { put(g, x, y, pal.dark); put(g, x - 1, y - 1, pal.light); } }

  // eyes
  const eyeCenters = [[10, 10], [22, 10]];
  for (const [ex, ey] of eyeCenters) {
    fill(g, ell(ex, ey, 2.9, 2.9), '#ffffff');
    if (t.eyes === 'sleepy') { fill(g, (x, y) => y <= ey - 1 && ell(ex, ey, 3.3, 3.3)(x, y), pal.base); for (let x = ex - 2; x <= ex + 2; x++) put(g, x, ey, pal.line); put(g, ex, ey + 1, '#15121f'); put(g, ex - 1, ey + 1, '#15121f'); continue; }
    if (t.eyes === 'normal' || t.eyes === 'angry') { for (const [dx, dy] of [[-1, 0], [0, 0], [-1, 1], [0, 1]]) put(g, ex + dx, ey + dy, '#15121f'); }
    if (t.eyes === 'big') { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) put(g, ex + dx, ey + dy, '#15121f'); put(g, ex - 1, ey - 1, '#ffffff'); }
    if (t.eyes === 'dot') put(g, ex, ey, '#15121f');
    if (t.eyes === 'laser') { for (const [dx, dy] of [[-1, 0], [0, 0], [-1, 1], [0, 1]]) put(g, ex + dx, ey + dy, '#ff2a2a'); put(g, ex - 1, ey, '#ffb0b0'); }
    if (t.eyes === 'heart') { for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) put(g, ex + dx, ey + dy, '#ff3d7f'); }
    if (t.eyes === 'cross') { for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) put(g, ex + dx, ey + dy, '#15121f'); }
    if (t.eyes === 'angry') {
      const left = ex < 16;
      for (let dx = -3; dx <= 3; dx++) {
        const step = Math.floor((dx + 3) / 2);
        const by = left ? ey - 3 + step : ey - 3 + (3 - step);
        for (let y = ey - 3; y < by; y++) put(g, ex + dx, y, pal.base);
        put(g, ex + dx, by, pal.line);
      }
    }
    if (t.eyes === 'shades') {
      for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 1; dy++) put(g, ex + dx, ey + dy, '#15121f');
      put(g, ex - 2, ey - 1, '#7a86b8'); put(g, ex - 1, ey - 1, '#7a86b8');
    }
  }
  if (t.eyes === 'shades') for (let x = 14; x <= 18; x++) put(g, x, 9, '#15121f');

  // nostrils and mouth
  put(g, 14, 14, pal.line); put(g, 18, 14, pal.line);
  const L = pal.line;
  const hline = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(g, x, y, c); };
  if (t.mouth === 'smile') { hline(11, 21, 19, L); put(g, 10, 18, L); put(g, 22, 18, L); }
  if (t.mouth === 'wide') { hline(8, 24, 19, L); put(g, 7, 18, L); put(g, 25, 18, L); }
  if (t.mouth === 'tongue') { hline(11, 21, 19, L); put(g, 10, 18, L); put(g, 22, 18, L); hline(15, 17, 20, '#ff5c8a'); hline(15, 17, 21, '#ff5c8a'); put(g, 16, 22, '#d6406c'); }
  if (t.mouth === 'grumpy') { hline(12, 20, 19, L); put(g, 11, 20, L); put(g, 21, 20, L); }
  if (t.mouth === 'open') { fill(g, ell(16, 20, 4.6, 2.3), '#3a0f1c'); fill(g, (x, y) => ell(16, 21.6, 2.6, 1.1)(x, y) && y >= 21, '#ff5c8a'); }
  if (t.mouth === 'tiny') hline(15, 17, 19, L);
  if (t.mouth === 'goldtooth') { hline(11, 21, 19, L); put(g, 10, 18, L); put(g, 22, 18, L); put(g, 13, 20, '#ffd84d'); put(g, 13, 19, '#fff3b0'); }

  // accessories
  if (t.acc === 'bowtie') { for (const [x, y, c] of [[14, 24, '#e23b3b'], [13, 24, '#e23b3b'], [18, 24, '#e23b3b'], [19, 24, '#e23b3b'], [13, 25, '#e23b3b'], [14, 25, '#e23b3b'], [15, 25, '#15121f'], [16, 25, '#15121f'], [17, 25, '#e23b3b'], [18, 25, '#e23b3b'], [19, 25, '#e23b3b'], [13, 26, '#e23b3b'], [14, 26, '#e23b3b'], [18, 26, '#e23b3b'], [19, 26, '#e23b3b']]) put(g, x, y, c); }
  if (t.acc === 'chain') { for (let x = 10; x <= 22; x++) put(g, x, 25 - Math.round(Math.abs(x - 16) * 0.5), '#ffc65c'); hline(15, 16, 26, '#ffc65c'); hline(15, 16, 27, '#ffe27a'); }
  if (t.acc === 'scarf') { for (let x = 8; x <= 24; x++) { put(g, x, 21, x % 4 === 0 ? '#ffffff' : '#e23b3b'); put(g, x, 22, '#b02a2a'); } for (let y = 23; y <= 26; y++) put(g, 21, y, y === 25 ? '#ffffff' : '#e23b3b'); }
  if (t.acc === 'fly') { put(g, 27, 15, '#15121f'); put(g, 28, 15, '#15121f'); put(g, 27, 14, '#cfe8ff'); put(g, 28, 14, '#cfe8ff'); put(g, 25, 17, '#7a7a8a'); put(g, 23, 18, '#7a7a8a'); }

  // Sparkpad sparkles
  if (t.sparkle) for (const [sx, sy] of [[3, 3], [28, 12], [4, 17]]) { put(g, sx, sy, '#fff4dc'); put(g, sx - 1, sy, '#ffc65c'); put(g, sx + 1, sy, '#ffc65c'); put(g, sx, sy - 1, '#ffc65c'); put(g, sx, sy + 1, '#ffc65c'); }
  return g;
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// slot is 0-based. total is how many frogs are in the set. owner is the wallet that holds this one (may be empty).
function render(slot, total, owner, secret, opts) {
  const bare = !!(opts && opts.bare);
  const t = traitsFor(slot, secret);
  const pal = SKINS[t.skin];
  const g = drawFrog(t, prng(crypto.createHash('sha256').update(String(t.seed)).digest()), !!(opts && opts.transparent));
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
  const num = String(slot + 1).padStart(2, '0');
  const short = owner ? owner.slice(0, 4) + '…' + owner.slice(-4) : '';
  const hat = t.hat ? t.hat + ' ' : '';
  const traitLine = (pal.name + ' ' + t.species.toLowerCase() + ', ' + t.eyes + ' eyes' + (t.hat ? ', ' + t.hat : '')).toUpperCase();
  if (bare) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512" shape-rendering="crispEdges" role="img" aria-label="Frog">' + rects + '</svg>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 38" width="1024" height="1216" shape-rendering="crispEdges" role="img" aria-label="' + esc(t.species + ' ' + num + ' of ' + total + ', ' + pal.name + ' ' + hat + 'with ' + t.eyes + ' eyes') + '">'
    + '<rect width="32" height="38" fill="#0b0913"/>' + rects
    + '<text x="16" y="34.3" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="1.6" fill="' + pal.light + '" shape-rendering="auto">' + t.species + ' ' + num + ' / ' + total + '</text>'
    + '<text x="16" y="35.9" text-anchor="middle" font-family="Courier New, monospace" font-size="0.95" fill="#9d96bc" shape-rendering="auto">' + esc(traitLine) + '</text>'
    + (short ? '<text x="16" y="37.3" text-anchor="middle" font-family="Courier New, monospace" font-size="0.9" fill="#6f6890" shape-rendering="auto">held by ' + esc(short) + '</text>' : '')
    + '</svg>';
}

module.exports = { render, traitsFor, silhouette, SKINS };
