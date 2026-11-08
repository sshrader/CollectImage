'use strict';
// Pixel cats on a 32 by 32 grid. Each slot gets its own combination of traits, picked from a server secret,
// and no two slots in a set share the same combination. The art stays on the server until a holder claims it.
const crypto = require('crypto');

const W = 32, H = 32;

const SKINS = [
  { name: 'Ginger', base: '#e8892b', light: '#ffb866', dark: '#b05a10', line: '#40210a', belly: '#fff0d0' },
  { name: 'Black', base: '#34364a', light: '#5a5f7e', dark: '#1c1d2b', line: '#06060c', belly: '#6a6f8e' },
  { name: 'Snow', base: '#f2f0ec', light: '#ffffff', dark: '#bdb8b0', line: '#3a362f', belly: '#ffffff' },
  { name: 'Grey', base: '#8d93a3', light: '#b9bfcf', dark: '#5c6272', line: '#1d2029', belly: '#d6dae4' },
  { name: 'Cream', base: '#f0d9a8', light: '#fff0cf', dark: '#c2a468', line: '#4a3a18', belly: '#fff8e6' },
  { name: 'Brown', base: '#8b5e3c', light: '#b98558', dark: '#5a3a22', line: '#22140a', belly: '#d8b48a' },
  { name: 'Chocolate', base: '#5b3a2a', light: '#8a5f48', dark: '#3a2318', line: '#150c07', belly: '#a88268' },
  { name: 'Blue', base: '#6f86a8', light: '#9fb6d6', dark: '#465c7a', line: '#141e2e', belly: '#c9d7ea' },
  { name: 'Lilac', base: '#b8a3c8', light: '#dccbea', dark: '#85709a', line: '#2e2338', belly: '#efe6f6' },
  { name: 'Cinnamon', base: '#c0703a', light: '#e49a64', dark: '#8a4a22', line: '#3a1c08', belly: '#f0cba8' },
  { name: 'Silver', base: '#c4c9d4', light: '#eef1f7', dark: '#8e94a2', line: '#2a2e38', belly: '#ffffff' },
  { name: 'Golden', base: '#e8b84a', light: '#ffe08a', dark: '#a87c18', line: '#44300a', belly: '#fff1c4' },
  { name: 'Charcoal', base: '#4a4f5c', light: '#757b8c', dark: '#2c2f3a', line: '#0b0c12', belly: '#8d93a6' },
  { name: 'Rose', base: '#f0a8b4', light: '#ffd0d8', dark: '#c27484', line: '#4a2028', belly: '#ffe6ea' },
];

// Rooms and rooftops. sky is the wall or sky from top to bottom, floor is the sill or rug the cat sits on.
const BGS = [
  { name: 'Night window', sky: ['#0b1426', '#12203c', '#1a2c52', '#243a68'], floor: '#4a3322', grain: '#6a4a32', decor: 'stars', cushion: ['#b5446a', '#e0709a'] },
  { name: 'Sunset roof', sky: ['#5a2a5e', '#a8396a', '#e2634a', '#ffa050'], floor: '#3a2230', grain: '#5a3a4a', decor: 'sun', cushion: ['#3a6ab0', '#6a9ae0'] },
  { name: 'Moonlit', sky: ['#070914', '#0c1226', '#111a36', '#18244a'], floor: '#1c2440', grain: '#2c3a66', decor: 'moon', cushion: ['#8a5ad0', '#b88af0'] },
  { name: 'Warm lamp', sky: ['#3a1f14', '#55301c', '#7a4526', '#a0602f'], floor: '#4a2a18', grain: '#6c4126', decor: 'lights', cushion: ['#2f8a6a', '#58c29a'] },
  { name: 'Attic', sky: ['#3a3248', '#4e4560', '#645a78', '#7c7290'], floor: '#503a2a', grain: '#6e5238', decor: 'none', cushion: ['#c2603a', '#f08a5a'] },
  { name: 'Candy room', sky: ['#3a2a6e', '#5a3a9a', '#8a4ac2', '#c25ee0'], floor: '#2c2a6a', grain: '#4a48a0', decor: 'stars', cushion: ['#e0a02a', '#ffd25a'] },
  { name: 'Snowy night', sky: ['#1a2a3e', '#2a4058', '#41607c', '#6a8aa6'], floor: '#d8e2ec', grain: '#b0c0d2', decor: 'snow', cushion: ['#c2403a', '#f06a5a'] },
  { name: 'Garden', sky: ['#0f3a3a', '#1a5a52', '#2a7a6a', '#4aa88a'], floor: '#2a5a3a', grain: '#3f8052', decor: 'fireflies', cushion: ['#a03a8a', '#d062b8'] },
];

const EYES = ['amber', 'green', 'blue', 'odd', 'big', 'sleepy', 'angry', 'laser', 'heart', 'shades', 'wink'];
const MOUTHS = ['smile', 'open', 'tongue', 'grumpy', 'tiny', 'fang'];
const PATTERNS = ['none', 'tabby', 'tuxedo', 'calico', 'points', 'spots', 'socks', 'bicolor'];
const HATS = [null, 'crown', 'tophat', 'party', 'wizard', 'beanie', 'flower', 'bow', 'halo'];
const ACCS = [null, 'bowtie', 'collar', 'scarf', 'chain'];

const HAT_ART = {
  crown: { bottom: 8, rows: ['g.g.g.g', 'ggggggg', 'gdgrgdg'] },
  tophat: { bottom: 8, rows: ['..kkkkk..', '..kkkkk..', '..rrrrr..', 'kkkkkkkkk'] },
  party: { bottom: 8, rows: ['..w..', '..p..', '.pyp.', 'pypyp'] },
  wizard: { bottom: 8, rows: ['....v....', '...vvv...', '...vsv...', '..vvvvv..', '..vvsvv..', '.vvvvvvv.', 'vvvvvvvvv'] },
  beanie: { bottom: 8, rows: ['...w...', '.bbbbb.', 'bbbbbbb', 'wwwwwww'] },
  flower: { bottom: 8, rows: ['..p..', '.pyp.', '..p..', '..g..'] },
  bow: { bottom: 7, rows: ['rr...rr', 'rrrkrrr', 'rr...rr'] },
  halo: { bottom: 3, rows: ['.yyyyyyy.', 'y.......y'] },
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

// The traits for every slot are made in order, skipping any combination already used, so all cats in a set differ.
const traitCache = new Map();
function traitsFor(slot, secret) {
  const ck = String(secret);
  let list = traitCache.get(ck);
  if (!list) { list = { rnd: prng(crypto.createHmac('sha256', ck).update('cats').digest()), items: [], seen: new Set() }; traitCache.set(ck, list); }
  while (list.items.length <= slot) {
    let t, key, tries = 0;
    do {
      t = {
        species: 'CAT',
        skin: Math.floor(list.rnd() * SKINS.length),
        pattern: pick(list.rnd, PATTERNS),
        eyes: pick(list.rnd, EYES),
        mouth: pick(list.rnd, MOUTHS),
        hat: pick(list.rnd, HATS),
        acc: pick(list.rnd, ACCS),
        bg: Math.floor(list.rnd() * BGS.length),
        sparkle: list.rnd() < 0.5,
        seed: Math.floor(list.rnd() * 1e9),
      };
      key = [t.skin, t.pattern, t.eyes, t.mouth, t.hat, t.acc, t.bg, t.sparkle].join('|');
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
// A triangle, for the ears. Pixels are tested at their centres.
const tri = (a, b, c) => (x, y) => {
  const px = x + 0.5, py = y + 0.5;
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d;
  const l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d;
  return l1 >= 0 && l2 >= 0 && 1 - l1 - l2 >= 0;
};
const shrinkTri = (a, b, c, k) => { const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]; const f = (p) => [m[0] + (p[0] - m[0]) * k, m[1] + (p[1] - m[1]) * k]; return tri(f(a), f(b), f(c)); };
function fill(g, shape, c) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shape(x, y)) g[y][x] = c; }
function stamp(g, art, cx, bottom) {
  const w = art.rows[0].length, top = bottom - art.rows.length + 1;
  art.rows.forEach((row, j) => { for (let i = 0; i < w; i++) { const ch = row[i]; if (ch !== '.') put(g, cx - ((w - 1) >> 1) + i, top + j, HAT_COLORS[ch]); } });
}

const EAR_L = [[6, 3], [5, 12], [13, 8]], EAR_R = [[26, 3], [27, 12], [19, 8]];
const SHAPES = [
  ell(16, 14.5, 10, 7.5),            // head
  tri(EAR_L[0], EAR_L[1], EAR_L[2]), // ears
  tri(EAR_R[0], EAR_R[1], EAR_R[2]),
  ell(16, 25.5, 8, 5.5),             // body
  ell(10.5, 29.5, 3.2, 2),           // front paws
  ell(21.5, 29.5, 3.2, 2),
  ell(26.8, 25, 2.2, 5.5),           // tail
];
const EAR_IN_L = shrinkTri(EAR_L[0], EAR_L[1], EAR_L[2], 0.5), EAR_IN_R = shrinkTri(EAR_R[0], EAR_R[1], EAR_R[2], 0.5);

// The plain cat outline as rows of pixels: [y, x, length]. Used for the locked tiles on the page.
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
  for (let y = 27; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = bg.floor;
  for (let i = 0; i < 9; i++) { const y = 28 + Math.floor(rnd() * 4), x = Math.floor(rnd() * 30); put(g, x, y, bg.grain); put(g, x + 1, y, bg.grain); }
  if (bg.decor === 'stars') for (let i = 0; i < 9; i++) put(g, Math.floor(rnd() * 32), Math.floor(rnd() * 14), '#fff4dc');
  if (bg.decor === 'fireflies') for (let i = 0; i < 6; i++) { const x = 1 + Math.floor(rnd() * 30), y = 2 + Math.floor(rnd() * 20); put(g, x, y, '#ffe76a'); put(g, x - 1, y, '#8a8a2a'); put(g, x + 1, y, '#8a8a2a'); }
  if (bg.decor === 'snow') for (let i = 0; i < 14; i++) put(g, Math.floor(rnd() * 32), Math.floor(rnd() * 26), '#ffffff');
  if (bg.decor === 'lights') for (let i = 0; i < 7; i++) { const x = 1 + Math.floor(rnd() * 30), y = 2 + Math.floor(rnd() * 12); put(g, x, y, '#ffd27a'); put(g, x, y + 1, '#c28a3a'); }
  if (bg.decor === 'sun') fill(g, ell(26, 5, 3.4, 3.4), '#ffd27a');
  if (bg.decor === 'moon') { fill(g, ell(27, 5, 3.2, 3.2), '#f3f1e6'); fill(g, ell(28.4, 4.2, 2.6, 2.6), bg.sky[0]); }
}

function drawCat(t, rnd, transparent) {
  const pal = SKINS[t.skin], bg = BGS[t.bg];
  const g = grid();
  drawBackground(transparent ? grid() : g, bg, rnd); // the same random numbers are used either way

  if (!transparent) {
    // the cushion the cat sits on
    fill(g, ell(16, 29.8, 11.5, 2), bg.cushion[0]); fill(g, ell(16, 29.3, 10, 1.3), bg.cushion[1]);
  }

  // the hat goes in before the head so the ears and face always stay in front of it
  if (t.hat) stamp(g, HAT_ART[t.hat], 16, HAT_ART[t.hat].bottom);

  // silhouette, outline and light and shade
  const mask = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => SHAPES.some((s) => s(x, y))));
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
  const interior = (x, y) => inM(x, y) && dist[y][x] >= 1;
  const paint = (shape, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shape(x, y) && interior(x, y)) g[y][x] = c; };

  // inner ears and chest
  paint(EAR_IN_L, '#f4a6b4'); paint(EAR_IN_R, '#f4a6b4');
  paint((x, y) => ell(16, 26, 4.5, 3.5)(x, y) && y > 22, pal.belly);

  // coat pattern
  const dot = (x, y, c) => { if (interior(x, y)) put(g, x, y, c); };
  const head = (x, y) => y <= 22 && x > 5 && x < 27 && ell(16, 14.5, 10, 7.5)(x, y);
  if (t.pattern === 'tabby') {
    for (const [x, y] of [[16, 7], [16, 8], [16, 9], [13, 8], [13, 9], [19, 8], [19, 9]]) dot(x, y, pal.dark);
    for (const y of [24, 26, 28]) for (const x of [9, 10, 11, 21, 22, 23]) dot(x, y, pal.dark);
    for (const y of [21, 24, 27]) { dot(26, y, pal.dark); dot(27, y, pal.dark); }
  }
  if (t.pattern === 'tuxedo') { paint(ell(16, 18, 4, 3), '#f4efe6'); paint((x, y) => ell(16, 26.5, 3.6, 4.5)(x, y) && y > 22, '#f4efe6'); paint(ell(10.5, 29.5, 3.2, 2), '#f4efe6'); paint(ell(21.5, 29.5, 3.2, 2), '#f4efe6'); }
  if (t.pattern === 'socks') { paint(ell(10.5, 29.5, 3.2, 2), '#f4efe6'); paint(ell(21.5, 29.5, 3.2, 2), '#f4efe6'); paint((x, y) => y >= 27 && ell(26.8, 25, 2.2, 5.5)(x, y), '#f4efe6'); }
  if (t.pattern === 'bicolor') for (let y = 8; y <= 22; y++) for (let x = 6; x < 16; x++) if (head(x, y) && interior(x, y) && g[y][x] === pal.base) g[y][x] = pal.belly;
  if (t.pattern === 'calico') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (interior(x, y) && g[y][x] === pal.base) g[y][x] = '#f4efe6';
    paint(ell(10, 10, 3.2, 2.8), '#e8892b'); paint(ell(22, 12, 3.4, 3.4), '#2b2b36'); paint(ell(10, 25, 3.2, 3), '#2b2b36'); paint(ell(22, 26, 3.4, 3), '#e8892b'); paint(ell(26.8, 24, 2, 4), '#e8892b');
  }
  if (t.pattern === 'points') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!interior(x, y)) continue;
      const face = ell(16, 16, 5.5, 4.5)(x, y), ear = y <= 9 && (x <= 12 || x >= 20), paw = y >= 28, tail = x >= 25 && y >= 19;
      if (face || ear || paw || tail) g[y][x] = pal.dark;
    }
  }
  if (t.pattern === 'spots') for (let i = 0; i < 12; i++) { const x = 7 + Math.floor(rnd() * 19), y = 8 + Math.floor(rnd() * 21); dot(x, y, pal.dark); if (rnd() < 0.5) dot(x + 1, y, pal.dark); }

  // eyes
  const irisOf = { amber: '#ffb300', green: '#4cd964', blue: '#4aa8ff', odd: null, big: '#4cd964', angry: '#ffb300', laser: '#ff2a2a', wink: '#ffb300', heart: '#ffb300' };
  const dark = '#15121f';
  for (const [ex, ey, side] of [[11, 13, 0], [21, 13, 1]]) {
    let iris = irisOf[t.eyes] || '#ffb300';
    if (t.eyes === 'odd') iris = side ? '#4aa8ff' : '#ffb300';
    if (t.eyes === 'sleepy' || (t.eyes === 'wink' && side)) { for (const [dx, dy] of [[-2, 1], [-1, 0], [0, -1], [1, 0], [2, 1]]) put(g, ex + dx, ey + dy, dark); continue; }
    if (t.eyes === 'shades') {
      for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 1; dy++) put(g, ex + dx, ey + dy, dark);
      put(g, ex - 2, ey - 1, '#7a86b8'); put(g, ex - 1, ey - 1, '#7a86b8');
      continue;
    }
    if (t.eyes === 'heart') { for (const [dx, dy] of [[-1, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) put(g, ex + dx, ey + dy, '#ff3d7f'); continue; }
    const big = t.eyes === 'big';
    fill(g, ell(ex, ey, big ? 3.3 : 2.6, big ? 3.4 : 2.8), iris);
    for (const dy of big ? [-1, 0, 1] : [-1, 0, 1]) { put(g, ex, ey + dy, t.eyes === 'laser' ? '#ffffff' : dark); if (big) put(g, ex - 1, ey + dy, t.eyes === 'laser' ? '#ffffff' : dark); }
    put(g, ex + 1, ey - 1, '#ffffff');
    if (t.eyes === 'angry') {
      const left = side === 0;
      for (let dx = -3; dx <= 3; dx++) {
        const step = Math.floor((dx + 3) / 2);
        put(g, ex + dx, left ? ey - 4 + step : ey - 4 + (3 - step), pal.line);
      }
    }
  }
  if (t.eyes === 'shades') for (let x = 14; x <= 18; x++) put(g, x, 12, dark);

  // nose, mouth and whiskers
  const L = pal.line;
  const hline = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(g, x, y, c); };
  hline(15, 17, 16, '#f07a98'); put(g, 16, 17, '#f07a98');
  if (t.mouth === 'smile' || t.mouth === 'tongue' || t.mouth === 'fang') { put(g, 16, 18, L); hline(13, 15, 19, L); hline(17, 19, 19, L); put(g, 12, 18, L); put(g, 20, 18, L); }
  if (t.mouth === 'tongue') { hline(15, 17, 20, '#ff5c8a'); put(g, 16, 21, '#d6406c'); }
  if (t.mouth === 'fang') { put(g, 14, 20, '#ffffff'); put(g, 18, 20, '#ffffff'); }
  if (t.mouth === 'open') { fill(g, ell(16, 20, 2.8, 1.8), '#3a0f1c'); put(g, 16, 21, '#ff5c8a'); put(g, 15, 21, '#ff5c8a'); }
  if (t.mouth === 'grumpy') { put(g, 16, 18, L); hline(13, 19, 19, L); put(g, 12, 20, L); put(g, 20, 20, L); }
  if (t.mouth === 'tiny') { put(g, 16, 18, L); put(g, 15, 19, L); put(g, 17, 19, L); }
  const wh = '#e9e4da';
  for (const [x, y] of [[5, 16], [4, 16], [3, 15], [5, 18], [4, 18], [3, 19]]) { put(g, x, y, wh); put(g, 32 - x, y, wh); }

  // accessories
  const NECK = '#e23b3b';
  if (t.acc === 'bowtie') { for (const [x, y, c] of [[14, 24, NECK], [13, 24, NECK], [18, 24, NECK], [19, 24, NECK], [13, 25, NECK], [14, 25, NECK], [15, 25, dark], [16, 25, dark], [17, 25, NECK], [18, 25, NECK], [19, 25, NECK], [13, 26, NECK], [14, 26, NECK], [18, 26, NECK], [19, 26, NECK]]) put(g, x, y, c); }
  if (t.acc === 'collar') { hline(10, 22, 23, NECK); put(g, 16, 24, '#ffd84d'); put(g, 16, 25, '#ffd84d'); put(g, 15, 25, '#c98a1e'); }
  if (t.acc === 'chain') { for (let x = 10; x <= 22; x++) put(g, x, 25 - Math.round(Math.abs(x - 16) * 0.5), '#ffc65c'); hline(15, 16, 26, '#ffc65c'); hline(15, 16, 27, '#ffe27a'); }
  if (t.acc === 'scarf') { for (let x = 9; x <= 23; x++) { put(g, x, 23, x % 4 === 0 ? '#ffffff' : '#e23b3b'); put(g, x, 24, '#b02a2a'); } for (let y = 25; y <= 28; y++) put(g, 21, y, y === 27 ? '#ffffff' : '#e23b3b'); }

  // sparkles
  if (t.sparkle) for (const [sx, sy] of [[3, 4], [29, 9], [2, 22]]) { put(g, sx, sy, '#fff4dc'); put(g, sx - 1, sy, '#ffc65c'); put(g, sx + 1, sy, '#ffc65c'); put(g, sx, sy - 1, '#ffc65c'); put(g, sx, sy + 1, '#ffc65c'); }
  return g;
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// slot is 0-based. total is how many cats are in the set. owner is the wallet that holds this one (may be empty).
function render(slot, total, owner, secret, opts) {
  const bare = !!(opts && opts.bare);
  const t = traitsFor(slot, secret);
  const pal = SKINS[t.skin];
  const g = drawCat(t, prng(crypto.createHash('sha256').update(String(t.seed)).digest()), !!(opts && opts.transparent));
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
  const traitLine = (pal.name + ' ' + 'cat' + ', ' + t.eyes + ' eyes' + (t.hat ? ', ' + t.hat : '')).toUpperCase();
  if (bare) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512" shape-rendering="crispEdges" role="img" aria-label="Cat">' + rects + '</svg>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 38" width="1024" height="1216" shape-rendering="crispEdges" role="img" aria-label="' + esc(t.species + ' ' + num + ' of ' + total + ', ' + pal.name + ' ' + hat + 'with ' + t.eyes + ' eyes') + '">'
    + '<rect width="32" height="38" fill="#0b0913"/>' + rects
    + '<text x="16" y="34.3" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="1.6" fill="' + pal.light + '" shape-rendering="auto">' + t.species + ' ' + num + ' / ' + total + '</text>'
    + '<text x="16" y="35.9" text-anchor="middle" font-family="Courier New, monospace" font-size="0.95" fill="#9d96bc" shape-rendering="auto">' + esc(traitLine) + '</text>'
    + (short ? '<text x="16" y="37.3" text-anchor="middle" font-family="Courier New, monospace" font-size="0.9" fill="#6f6890" shape-rendering="auto">held by ' + esc(short) + '</text>' : '')
    + '</svg>';
}

module.exports = { render, traitsFor, silhouette, SKINS };
