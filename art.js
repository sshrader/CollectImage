'use strict';
// Pixel bears on a 64 by 64 grid. Each slot gets its own combination of traits, picked from a server secret,
// and no two slots in a set share the same combination. The art stays on the server until a holder claims it.
const crypto = require('crypto');
const zlib = require('zlib');
const W = 64, H = 64;

const COATS = [
  { key: 'brown', name: 'Brown', w: 24, base: '#7a4a2b', light: '#a06a42', dark: '#4d2d18', deep: '#35200f', snout: '#d9b48a', snoutDark: '#b8905f', ear: '#c98a6a' },
  { key: 'black', name: 'Black', w: 18, base: '#44445a', light: '#6a6a84', dark: '#2a2a3a', deep: '#1a1a26', snout: '#9a8a7c', snoutDark: '#76685c', ear: '#7a6a68', moon: true },
  { key: 'honey', name: 'Honey', w: 14, base: '#d9952b', light: '#f5c065', dark: '#a8681a', deep: '#74430f', snout: '#f7e0ae', snoutDark: '#dcb877', ear: '#f0b070' },
  { key: 'cinnamon', name: 'Cinnamon', w: 12, base: '#a8522a', light: '#d4804f', dark: '#6e3217', deep: '#4a210e', snout: '#ebc7a0', snoutDark: '#c99c72', ear: '#e0956a' },
  { key: 'glacier', name: 'Glacier', w: 10, base: '#8fa6bf', light: '#bccfe2', dark: '#5d7490', deep: '#445770', snout: '#e8f0f8', snoutDark: '#bccbdb', ear: '#c7d6e6' },
  { key: 'polar', name: 'Polar', w: 10, base: '#e9edf4', light: '#ffffff', dark: '#aab5c8', deep: '#8895ac', snout: '#ffffff', snoutDark: '#d4dbe6', ear: '#dcc9d0', darkNose: true },
  { key: 'panda', name: 'Panda', w: 7, base: '#f2f2f4', light: '#ffffff', dark: '#b4b4be', deep: '#8a8a98', snout: '#ffffff', snoutDark: '#d8d8e0', ear: '#4a4a55', panda: true },
  { key: 'ember', name: 'Ember', w: 5, base: '#8c3b2a', light: '#bd5c42', dark: '#5a2217', deep: '#3d160e', snout: '#ecb494', snoutDark: '#c98e70', ear: '#d98a70' }
];
const EYES = [['open', 30], ['sleepy', 26], ['zzz', 12], ['wink', 10], ['heart', 8], ['glare', 14]];
const MOUTHS = [['smile', 40], ['flat', 30], ['open', 15], ['grumpy', 15]];
const ACCS = [['none', 30], ['beanie', 14], ['nightcap', 12], ['scarf', 12], ['flowers', 6], ['honey pot', 10], ['mug', 8], ['fish', 8]];
const BGS = [['cave', 24], ['snow night', 22], ['campfire', 16], ['starry', 18], ['dawn', 10], ['aurora', 10]];
const INK = '#1a0f0a';


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

// The traits for every slot are made in order, skipping any combination already used, so all bears in a set differ.
const SKINS = COATS.map((c) => ({ name: c.name, base: c.base, light: c.light }));
const traitCache = new Map();
function traitsFor(slot, secret) {
  const ck = String(secret);
  let list = traitCache.get(ck);
  if (!list) { list = { rnd: prng(crypto.createHmac('sha256', ck).update('bears').digest()), items: [], seen: new Set() }; traitCache.set(ck, list); }
  while (list.items.length <= slot) {
    let t, key, tries = 0;
    do {
      const ci = pickW(COATS.map((c, i) => [i, c.w]), list.rnd())[0];
      t = {
        species: 'BEAR', skin: ci, coat: COATS[ci].key,
        eyes: pickW(EYES, list.rnd())[0], mouth: pickW(MOUTHS, list.rnd())[0], acc: pickW(ACCS, list.rnd())[0],
        bg: pickW(BGS, list.rnd())[0], blush: list.rnd() < 0.25, seed: Math.floor(list.rnd() * 1e9),
      };
      key = [t.skin, t.eyes, t.mouth, t.acc, t.bg, t.blush].join('|');
      tries++;
    } while (list.seen.has(key) && tries < 300);
    list.seen.add(key);
    list.items.push(t);
  }
  return list.items[slot];
}

const grid = () => Array.from({ length: H }, () => Array(W).fill(null));
const put = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
const ell = (cx, cy, rx, ry) => (x, y) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; };
const fill = (g, shape, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shape(x, y)) g[y][x] = c; };
const px = (g, list, c) => list.forEach(([x, y, cc]) => put(g, x, y, cc || c));
const rect = (g, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c); };
const darken = (hex, k) => { const n = parseInt(hex.slice(1, 7), 16); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join(''); };
// Checkerboard blend between two shapes' colours, for a soft glow without gradients.
const dither = (g, shape, a, b) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shape(x, y)) g[y][x] = (x + y) % 2 ? a : b; };

function drawBg(g, bg, r) {
  const rows = (c, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) g[y][x] = c; };
  const scatter = (n, c, y0, y1) => { for (let i = 0; i < n; i++) put(g, Math.floor(r() * W), y0 + Math.floor(r() * (y1 - y0 + 1)), c); };
  const star = (x, y, c) => px(g, [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], c);
  const glow = (cx, cy, rx, ry, cols) => { cols.forEach((c, i) => { const k = 1 - i * 0.22; fill(g, ell(cx, cy, rx * k, ry * k), c); if (i > 0) dither(g, (x, y) => ell(cx, cy, rx * (k + 0.07), ry * (k + 0.07))(x, y) && !ell(cx, cy, rx * k, ry * k)(x, y), cols[i - 1], c); }); };
  if (bg === 'cave') {
    rows('#150e0a', 0, 63);
    for (let i = 0; i < 26; i++) fill(g, ell(r() * W, r() * 44, 2 + r() * 4, 1.5 + r() * 3), r() < 0.5 ? '#1b110c' : '#110a07');
    glow(32, 40, 30, 26, ['#2a1a10', '#3a2313', '#4d2e18', '#643b1e']);
    for (const x of [3, 11, 19, 43, 51, 59]) { const hgt = 5 + Math.floor(r() * 9); for (let i = 0; i < hgt; i++) { const w = Math.max(1, Math.round((hgt - i) / 3)); rect(g, x - w, i, x + w - 1, i, i % 5 === 0 ? '#1c120c' : '#0d0806'); } }
    rows('#1d130d', 55, 63); rows('#2a1a10', 55, 55); scatter(10, '#3a2616', 56, 63); scatter(6, '#0d0806', 57, 63);
  } else if (bg === 'snow night') {
    rows('#0f1630', 0, 63); rows('#131c3c', 14, 30); rows('#182350', 31, 44);
    for (let i = 0; i < 9; i++) put(g, Math.floor(r() * W), Math.floor(r() * 34), '#f0f4ff');
    for (let i = 0; i < 3; i++) star(4 + Math.floor(r() * 56), 3 + Math.floor(r() * 24), '#c9d6f4');
    for (const [x, h] of [[3, 14], [10, 10], [50, 12], [58, 15], [56, 9]]) for (let i = 0; i < h; i++) rect(g, x - Math.floor(i / 3), 46 - h + i, x + Math.floor(i / 3), 46 - h + i, '#0a0f24');
    rows('#dfe7f3', 54, 63); rows('#b9c8e0', 54, 54); rows('#c9d6ea', 58, 58); scatter(12, '#ffffff', 55, 63); scatter(6, '#aab9d4', 55, 63);
  } else if (bg === 'campfire') {
    rows('#1a0f0c', 0, 63); glow(32, 42, 30, 24, ['#2a170e', '#38200f', '#4a2a14', '#5e3519']);
    rows('#241610', 54, 63); rows('#33201a', 54, 54); scatter(8, '#4a3020', 55, 63);
    rect(g, 4, 59, 13, 61, '#4a2a14'); rect(g, 3, 60, 14, 61, '#35200f'); rect(g, 5, 59, 12, 59, '#6a3c1c');
    fill(g, ell(8.5, 54, 4.5, 6), '#c4421a'); fill(g, ell(8.5, 55, 3.4, 4.6), '#e8782a'); fill(g, ell(8.5, 56, 2.2, 3.2), '#ffb347'); fill(g, ell(8.5, 57, 1.2, 1.8), '#ffe9a8');
    px(g, [[7, 47], [9, 45], [5, 49], [12, 50], [10, 43]], '#ffb347');
  } else if (bg === 'starry') {
    rows('#0a1026', 0, 63); rows('#0e1632', 12, 26); rows('#131d42', 27, 40); rows('#192654', 41, 53);
    for (let i = 0; i < 14; i++) put(g, Math.floor(r() * W), Math.floor(r() * 44), '#f4f0dc');
    for (let i = 0; i < 4; i++) star(4 + Math.floor(r() * 56), 3 + Math.floor(r() * 30), '#e8e4c8');
    fill(g, ell(52, 11, 5.4, 5.4), '#f6edcf'); fill(g, ell(54.4, 9.6, 4.4, 4.4), '#0a1026'); fill(g, ell(48, 6, 0.6, 0.6), '#fff');
    fill(g, ell(10, 70, 34, 18), '#1b2652'); fill(g, ell(54, 72, 34, 20), '#222e5c');
    rows('#dfe7f3', 58, 63); rows('#b9c8e0', 58, 58);
  } else if (bg === 'dawn') {
    rows('#26332a', 0, 63); rows('#33443a', 10, 24); rows('#4a5e48', 25, 40); rows('#6a7a56', 41, 52);
    fill(g, ell(50, 34, 8, 8), '#f2b782'); fill(g, ell(50, 34, 6, 6), '#f8cf9f');
    for (const x of [4, 9, 55, 59]) for (let y = 0; y < 54; y++) { g[y][x] = '#0d1810'; if (y % 6 === 0) put(g, x + 1, y, '#1c2c1c'); g[y][x + 1] = g[y][x + 1] || '#14221a'; }
    scatter(6, '#0d1810', 0, 40);
    rows('#2a2418', 54, 63); rows('#3d3422', 54, 54); scatter(14, '#4f6a3a', 55, 63); scatter(8, '#1c1810', 56, 63);
  } else {
    rows('#080d1c', 0, 63);
    for (let x = 0; x < W; x++) { const o = Math.round(Math.sin(x / 6) * 3 + Math.sin(x / 2.3) * 0.8); for (let y = 3; y < 9; y++) put(g, x, y + o, y < 5 ? '#1c6a56' : '#2a9a7c'); for (let y = 9; y < 14; y++) put(g, x, y + o, y < 11 ? '#1a5a6a' : '#16445a'); for (let y = 14; y < 16; y++) put(g, x, y + o, '#102c44'); }
    for (let i = 0; i < 6; i++) put(g, Math.floor(r() * W), 20 + Math.floor(r() * 24), '#e8f0fa');
    for (const [x, h] of [[8, 16], [24, 12], [46, 18], [58, 11]]) for (let i = 0; i < h; i++) rect(g, x - i, 56 - h + i, x + i, 56 - h + i, '#0e1830');
    rows('#d8e3f0', 56, 63); rows('#b6c6dc', 56, 56); rows('#c4d2e6', 60, 60); scatter(10, '#fff', 57, 63);
  }
}

// Draws one body part on its own layer with a light top-left rim and a dark bottom-right rim, then lays it over the bear.
function part(L, shape, c, shades) {
  const m = grid(); fill(m, shape, c);
  const out = m.map((row) => row.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y][x]) continue;
    const dn = y + 1 < H && m[y + 1][x], rt = x + 1 < W && m[y][x + 1], up = y > 0 && m[y - 1][x], lf = x > 0 && m[y][x - 1];
    const dn2 = y + 2 < H && m[y + 2][x], rt2 = x + 2 < W && m[y][x + 2];
    if (shades) {
      if (!dn || !rt) out[y][x] = shades.deep;
      else if (!dn2 || !rt2) out[y][x] = shades.dark;
      else if (!up || !lf) out[y][x] = shades.light;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (out[y][x]) L[y][x] = out[y][x];
}

function drawBear(t, r) {
  const coat = COATS.find((c) => c.key === t.coat);
  const bg = grid(); drawBg(bg, t.bg, r);
  const L = grid();
  const furShade = { deep: coat.deep, dark: coat.dark, light: coat.light };
  const blk = '#2c2c34', blkShade = { deep: '#14141a', dark: '#1f1f26', light: '#3e3e48' };
  const P = coat.panda;
  const snoutShade = { deep: coat.snoutDark, dark: coat.snoutDark, light: null };
  // back to front: feet, body, arms, ears, head
  part(L, ell(22, 58, 6.8, 3.9), P ? blk : coat.base, P ? blkShade : furShade); part(L, ell(42, 58, 6.8, 3.9), P ? blk : coat.base, P ? blkShade : furShade);
  fill(L, ell(22, 58.6, 3.4, 1.8), coat.snoutDark); fill(L, ell(42, 58.6, 3.4, 1.8), coat.snoutDark);
  part(L, ell(32, 45, 16.6, 14.8), coat.base, furShade);
  part(L, ell(32, 47.4, 9.8, 9.4), coat.snout, snoutShade);
  if (coat.moon) { part(L, ell(32, 38.8, 6.6, 3.6), '#efe3c8', null); fill(L, ell(32, 36.8, 6.6, 3.6), coat.base); }
  part(L, ell(17.2, 45.8, 5.4, 10.2), P ? blk : coat.base, P ? blkShade : furShade); part(L, ell(46.8, 45.8, 5.4, 10.2), P ? blk : coat.base, P ? blkShade : furShade);
  fill(L, ell(17.2, 54.4, 3.4, 2.2), coat.snoutDark); fill(L, ell(46.8, 54.4, 3.4, 2.2), coat.snoutDark);
  px(L, [[16, 53], [18, 53], [45, 53], [47, 53]], P ? '#55555f' : coat.dark);
  part(L, ell(19, 13, 6.2, 6.2), P ? blk : coat.base, P ? blkShade : furShade); part(L, ell(45, 13, 6.2, 6.2), P ? blk : coat.base, P ? blkShade : furShade);
  part(L, ell(19.4, 13.8, 3.4, 3.4), coat.ear, { deep: coat.snoutDark, dark: coat.snoutDark, light: null }); part(L, ell(44.6, 13.8, 3.4, 3.4), coat.ear, { deep: coat.snoutDark, dark: coat.snoutDark, light: null });
  part(L, ell(32, 25, 15.8, 14), coat.base, furShade);
  if (P) { part(L, ell(24.4, 23.2, 4.4, 5.2), blk, blkShade); part(L, ell(39.6, 23.2, 4.4, 5.2), blk, blkShade); }
  part(L, ell(32, 30.6, 7.6, 5.8), coat.snout, snoutShade);

  // face
  const eyeL = [24, 22], eyeR = [40, 22];
  const open = (e) => { fill(L, ell(e[0] + 0.5, e[1] + 0.5, 2.1, 2.7), INK); px(L, [[e[0] - 1, e[1] - 1], [e[0], e[1] - 1], [e[0] - 1, e[1]]], '#fff'); put(L, e[0] + 1, e[1] + 2, '#7a6a68'); };
  const closed = (e) => px(L, [[e[0] - 2, e[1] + 1], [e[0] - 1, e[1] + 2], [e[0], e[1] + 2], [e[0] + 1, e[1] + 2], [e[0] + 2, e[1] + 1]], INK);
  const heart = (e) => { px(L, [[-2, -1], [-1, -1], [1, -1], [2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]].map(([a, b]) => [e[0] + a, e[1] + b]), '#e8506a'); px(L, [[e[0] - 2, e[1] - 1], [e[0] - 1, e[1] - 1]], '#ff9aa8'); };
  if (t.eyes === 'open') { open(eyeL); open(eyeR); }
  else if (t.eyes === 'sleepy' || t.eyes === 'zzz') { closed(eyeL); closed(eyeR); }
  else if (t.eyes === 'wink') { closed(eyeL); open(eyeR); }
  else if (t.eyes === 'glare') { open(eyeL); open(eyeR); px(L, [[21, 17], [22, 18], [23, 18], [24, 19], [27, 19], [43, 17], [42, 18], [41, 18], [40, 19], [37, 19]], INK); }
  else if (t.eyes === 'heart') { heart(eyeL); heart(eyeR); }
  const nose = coat.darkNose ? '#2a2a33' : INK;
  px(L, [[30, 26], [31, 26], [32, 26], [33, 26], [29, 27], [30, 27], [31, 27], [32, 27], [33, 27], [34, 27], [30, 28], [31, 28], [32, 28], [33, 28]], nose);
  px(L, [[30, 26], [31, 26]], coat.darkNose ? '#555566' : '#5a4036');
  px(L, [[32, 29], [32, 30], [32, 31]], INK);
  if (t.mouth === 'smile') px(L, [[31, 32], [30, 32], [29, 31], [28, 30], [33, 32], [34, 32], [35, 31], [36, 30]], INK);
  else if (t.mouth === 'flat') px(L, [[29, 32], [30, 32], [31, 32], [33, 32], [34, 32], [35, 32]], INK);
  else if (t.mouth === 'open') { fill(L, ell(32, 33.4, 3.6, 2.4), '#7a2030'); fill(L, ell(32, 34.4, 2.4, 1.2), '#e8707a'); px(L, [[29, 31], [30, 31], [34, 31], [35, 31], [31, 32], [33, 32]], INK); }
  else px(L, [[29, 33], [30, 32], [31, 32], [33, 32], [34, 32], [35, 33]], INK);
  if (t.blush) { fill(L, ell(19.5, 29.6, 2.6, 1.5), '#e58a8a'); fill(L, ell(44.5, 29.6, 2.6, 1.5), '#e58a8a'); }
  if (t.eyes === 'zzz') { px(L, [[50, 5], [51, 5], [52, 5], [53, 5], [53, 6], [52, 7], [51, 8], [50, 9], [50, 10], [51, 10], [52, 10], [53, 10]], '#cfd8ee'); px(L, [[56, 1], [57, 1], [58, 1], [58, 2], [57, 3], [56, 4], [56, 5], [57, 5], [58, 5]], '#cfd8ee'); }

  // accessories
  const a = t.acc;
  if (a === 'beanie') {
    part(L, (x, y) => ell(32, 15.4, 11.8, 7.8)(x, y) && y <= 15, '#b8402f', { deep: '#7a2418', dark: '#962f21', light: '#d4604a' });
    for (let x = 22; x <= 42; x += 3) for (let y = 9; y <= 14; y++) put(L, x, y, '#962f21');
    rect(L, 20, 16, 44, 18, '#e8d8b8'); for (let x = 20; x <= 44; x += 2) put(L, x, 17, '#cdb893'); rect(L, 20, 18, 44, 18, '#b8a27a');
    fill(L, ell(32, 5.4, 3.6, 3.6), '#f2e6d3'); px(L, [[30, 4], [31, 3]], '#fff'); px(L, [[34, 7], [33, 8]], '#cdb893'); rect(L, 31, 8, 33, 9, '#b8402f');
  }
  if (a === 'nightcap') {
    rect(L, 20, 15, 44, 17, '#e8d8b8'); for (let x = 20; x <= 44; x += 2) put(L, x, 16, '#cdb893'); rect(L, 20, 17, 44, 17, '#b8a27a');
    const path = (t2) => [26 + t2 * 26, 14 - Math.sin(t2 * 2.2) * 9 + t2 * t2 * 14];
    for (let i = 0; i <= 60; i++) { const t2 = i / 60, [cx, cy] = path(t2); fill(L, ell(cx, cy, 6.4 - 3.6 * t2, 6.2 - 3.4 * t2), i % 7 === 3 ? '#4a6ec4' : '#3a5aa8'); }
    for (let i = 0; i <= 60; i += 6) { const [cx, cy] = path(i / 60); put(L, cx - 1, cy - 1, '#2a428a'); }
    px(L, [[28, 10, '#ffd54a'], [34, 6, '#ffd54a'], [40, 9, '#ffd54a'], [44, 14, '#ffd54a']]);
    const [ex, ey] = path(1); fill(L, ell(ex + 1, ey + 3, 3.6, 3.6), '#f2e6d3'); px(L, [[ex, ey + 1], [ex - 1, ey + 2]], '#fff');
  }
  if (a === 'scarf') {
    fill(L, (x, y) => ell(32, 39.6, 13, 3.4)(x, y) && y >= 37 && y <= 42, '#c4452f');
    for (let x = 18; x <= 46; x++) for (let y = 37; y <= 42; y++) if (L[y][x] && Math.floor(x / 3) % 2) L[y][x] = '#f2e6d3';
    rect(L, 18, 42, 46, 42, '#8a2e1f');
    for (let y = 43; y <= 53; y++) for (let x = 40; x <= 45; x++) L[y][x] = (Math.floor(y / 3) % 2) ? '#f2e6d3' : '#c4452f';
    for (let x = 40; x <= 45; x += 2) { put(L, x, 54, '#c4452f'); put(L, x, 55, '#f2e6d3'); } rect(L, 45, 43, 45, 53, '#8a2e1f');
  }
  if (a === 'flowers') {
    const fl = [[22, 13, '#e58aa8'], [27, 9, '#ffffff'], [32, 8, '#ffd54a'], [37, 9, '#e58aa8'], [42, 13, '#ffffff']];
    px(L, [[24, 11], [25, 10], [29, 8], [30, 8], [34, 8], [35, 8], [39, 10], [40, 11]], '#4f9a52'); px(L, [[24, 12], [40, 12]], '#3a7a3e');
    fl.forEach(([x, y, c]) => { px(L, [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]], c); put(L, x, y, c === '#ffd54a' ? '#e8782a' : '#ffd54a'); });
  }
  if (a === 'honey pot') {
    part(L, ell(32, 53, 9.4, 6.6), '#8a5a2b', { deep: '#5a3a18', dark: '#6e4620', light: '#a87238' });
    rect(L, 23, 47, 41, 48, '#f2bb55'); rect(L, 23, 47, 41, 47, '#ffd98a'); px(L, [[25, 49], [25, 50], [25, 51], [36, 49], [36, 50], [38, 49]], '#f2bb55');
    rect(L, 24, 45, 40, 46, '#6e431e'); rect(L, 26, 52, 38, 53, '#e8d8b8'); px(L, [[29, 52], [31, 53], [33, 52], [35, 53]], '#8a5a2b');
  }
  if (a === 'mug') {
    rect(L, 38, 46, 47, 55, '#e8e0d0'); rect(L, 38, 46, 47, 47, '#6b3a1c'); rect(L, 38, 55, 47, 55, '#b8ae9a'); rect(L, 46, 48, 47, 54, '#cfc6b2'); rect(L, 38, 48, 39, 54, '#fffdf4');
    px(L, [[48, 49], [49, 49], [50, 50], [50, 51], [50, 52], [49, 53], [48, 53]], '#e8e0d0'); px(L, [[43, 50], [44, 50], [43, 51]], '#c4452f');
    px(L, [[41, 44], [42, 43], [41, 42], [42, 41], [44, 44], [45, 43], [44, 42], [45, 41], [44, 40]], '#cfd6df');
  }
  if (a === 'fish') {
    part(L, ell(31, 51, 8.6, 3.9), '#6fa6d4', { deep: '#3f6e96', dark: '#528cb8', light: '#9cc8ea' });
    px(L, [[39, 49], [40, 47], [41, 47], [41, 48], [40, 49], [40, 50], [41, 51], [42, 52], [42, 54], [41, 54], [40, 53], [39, 52], [39, 51], [40, 52]], '#6fa6d4');
    px(L, [[26, 50], [26, 53]], INK); put(L, 25, 50, INK); for (let x = 29; x <= 36; x += 3) { put(L, x, 50, '#a9cdea'); put(L, x + 1, 52, '#a9cdea'); }
    px(L, [[30, 47], [31, 47], [32, 47], [31, 46]], '#528cb8'); fill(L, ell(26, 51, 1, 1), '#cfe4f4');
  }

  // floor shadow, bear over background, dark outline
  { const sh = ell(32, 61.4, 20, 2.6); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sh(x, y) && bg[y][x]) bg[y][x] = darken(bg[y][x], 0.55); }
  const out = bg.map((row) => row.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L[y][x]) out[y][x] = L[y][x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (L[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < W && yy < H && L[yy][xx]; })) out[y][x] = INK;
  }
  return out;
}


const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHAPES = [ell(22, 58, 6.8, 3.9), ell(42, 58, 6.8, 3.9), ell(32, 45, 16.6, 14.8), ell(17.2, 45.8, 5.4, 10.2), ell(46.8, 45.8, 5.4, 10.2), ell(19, 13, 6.2, 6.2), ell(45, 13, 6.2, 6.2), ell(32, 25, 15.8, 14)];
// The plain bear outline as rows of pixels: [y, x, length]. Used for the locked tiles on the page.
function silhouette() {
  const runs = [], on = (x, y) => SHAPES.some((s) => s(x, y));
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!on(x, y)) { x++; continue; }
      let n = 1;
      while (x + n < W && on(x + n, y)) n++;
      runs.push([y, x, n]); x += n;
    }
  }
  return runs;
}

// slot is 0-based. total is how many bears are in the set. owner is the wallet that holds this one (may be empty).
function render(slot, total, owner, secret, opts) {
  const bare = !!(opts && opts.bare);
  const t = traitsFor(slot, secret);
  const pal = SKINS[t.skin];
  const g = drawBear(t, prng(crypto.createHash('sha256').update(String(t.seed)).digest()));
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
  const traitLine = (pal.name + ' bear, ' + (t.eyes === 'zzz' ? 'sleeping' : t.eyes) + ' eyes' + (t.acc !== 'none' ? ', ' + t.acc : '')).toUpperCase();
  if (bare) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" shape-rendering="crispEdges" role="img" aria-label="Bear">' + rects + '</svg>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76" width="1024" height="1216" shape-rendering="crispEdges" role="img" aria-label="' + esc(t.species + ' ' + num + ' of ' + total + ', ' + pal.name + ' bear with ' + t.eyes + ' eyes') + '">'
    + '<rect width="64" height="76" fill="#120d0a"/>' + rects
    + '<text x="32" y="68.6" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="3.2" fill="' + pal.light + '" shape-rendering="auto">' + t.species + ' ' + num + ' / ' + total + '</text>'
    + '<text x="32" y="71.8" text-anchor="middle" font-family="Courier New, monospace" font-size="1.9" fill="#ad9a82" shape-rendering="auto">' + esc(traitLine) + '</text>'
    + (short ? '<text x="32" y="74.6" text-anchor="middle" font-family="Courier New, monospace" font-size="1.8" fill="#7d6c58" shape-rendering="auto">held by ' + esc(short) + '</text>' : '')
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
  return gridToPng(drawBear(t, prng(crypto.createHash('sha256').update(String(t.seed)).digest())), scale || 8);
}

// ---- The Founder: one special bear that is not part of the numbered set. A giant, mean grizzly in a gold crown, with a coffee. ----
const mix = (a, b, t) => { const p = parseInt(a.slice(1, 7), 16), q = parseInt(b.slice(1, 7), 16); return '#' + [16, 8, 0].map((sh) => Math.round(((p >> sh) & 255) * (1 - t) + ((q >> sh) & 255) * t).toString(16).padStart(2, '0')).join(''); };
function drawFounder() {
  const r = prng(crypto.createHash('sha256').update('bear-den-founder').digest());
  const bg = grid(); drawBg(bg, 'cave', r);
  // a warm gold glow behind him, as a checkerboard so it stays pixel art
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!bg[y][x]) continue;
    const dx = (x - 32) / 31, dy = (y - 34) / 30, d = dx * dx + dy * dy;
    if (d < 1 && (x + y) % 2 === 0) bg[y][x] = mix(bg[y][x], '#ffb347', 0.28 * (1 - d));
  }
  const L = grid();
  const fur = { base: '#5b3a22', light: '#82593a', dark: '#3b2314', deep: '#24150b' };
  const snout = '#b08a60', snoutDark = '#85653f', GOLD = '#ffc84a', GOLD_L = '#ffe99a', GOLD_D = '#c98a1e';
  const claw = '#efe6d0';
  // feet, hump, body
  part(L, ell(19, 59, 8.6, 4), fur.base, fur); part(L, ell(45, 59, 8.6, 4), fur.base, fur);
  px(L, [[13, 61], [15, 62], [17, 62], [41, 62], [43, 62], [45, 62]], claw);
  part(L, ell(32, 33, 18, 10), fur.dark, { deep: fur.deep, dark: fur.deep, light: fur.base });   // the grizzly shoulder hump
  part(L, ell(32, 46, 20.8, 16.8), fur.base, fur);
  part(L, ell(32, 51, 12, 10), '#70492b', { deep: fur.dark, dark: fur.dark, light: null });
  // arms: left hangs, right holds the mug
  part(L, ell(11.5, 47, 6.6, 13.4), fur.base, fur); fill(L, ell(11.5, 58.2, 4.4, 2.6), fur.light);
  px(L, [[9, 60], [11, 60], [13, 60]], claw);
  part(L, ell(52.5, 47, 6.6, 12), fur.base, fur);
  // grizzled silver tips on the fur
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((L[y][x] === fur.base || L[y][x] === fur.light) && r() < 0.06) L[y][x] = '#b9a487';
  // ears, head, muzzle
  part(L, ell(17, 13, 4.9, 4.9), fur.base, fur); part(L, ell(47, 13, 4.9, 4.9), fur.base, fur);
  fill(L, ell(17.3, 13.9, 2.5, 2.5), '#8a5a40'); fill(L, ell(46.7, 13.9, 2.5, 2.5), '#8a5a40');
  part(L, ell(32, 25, 16.8, 13.8), fur.base, fur);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((L[y][x] === fur.base) && y < 38 && r() < 0.05) L[y][x] = '#b9a487';
  part(L, ell(32, 31, 9.6, 7.2), snout, { deep: snoutDark, dark: snoutDark, light: null });
  // face: amber eyes under heavy brows, a scar, a big nose and a snarl with fangs
  px(L, [[22, 22], [23, 22], [24, 22], [22, 23], [23, 23], [24, 23], [40, 22], [41, 22], [42, 22], [40, 23], [41, 23], [42, 23]], '#ffb21a');
  px(L, [[23, 22], [23, 23], [41, 22], [41, 23]], INK);
  px(L, [[18, 19], [19, 19], [20, 20], [21, 20], [22, 21], [23, 21], [24, 21], [25, 22], [46, 19], [45, 19], [44, 20], [43, 20], [42, 21], [41, 21], [40, 21], [39, 22],
    [18, 20], [19, 20], [20, 21], [21, 21], [46, 20], [45, 20], [44, 21], [43, 21]], INK);
  px(L, [[21, 15], [22, 16], [22, 17], [23, 18], [23, 19], [24, 24], [24, 25], [25, 26], [25, 27]], '#e0907c');   // scar across the left eye
  px(L, [[29, 26], [30, 26], [31, 26], [32, 26], [33, 26], [34, 26], [35, 26], [29, 27], [30, 27], [31, 27], [32, 27], [33, 27], [34, 27], [35, 27], [30, 28], [31, 28], [32, 28], [33, 28], [34, 28]], INK);
  px(L, [[30, 26], [31, 26]], '#6a5a52');
  px(L, [[32, 29], [32, 30], [32, 31]], INK);
  px(L, [[25, 36], [26, 35], [27, 34], [28, 34], [29, 33], [30, 33], [31, 33], [32, 33], [33, 33], [34, 33], [35, 33], [36, 34], [37, 34], [38, 35], [39, 36]], INK);
  px(L, [[29, 34], [29, 35], [35, 34], [35, 35], [30, 34], [34, 34]], '#f4efe4');
  px(L, [[29, 36], [35, 36]], '#f4efe4');
  // the gold crown
  const tri = (cx, baseY, h) => { for (let i = 0; i < h; i++) { const half = Math.floor(i * 2.4 / h), y = baseY - h + 1 + i; rect(L, cx - half, y, cx + half, y, GOLD); put(L, cx - half, y, GOLD_L); if (half) put(L, cx + half, y, GOLD_D); } };
  tri(22, 11, 5); tri(27, 11, 7); tri(32, 11, 9); tri(37, 11, 7); tri(42, 11, 5);
  rect(L, 20, 11, 44, 13, GOLD); rect(L, 20, 11, 44, 11, GOLD_L); rect(L, 20, 13, 44, 13, GOLD_D);
  px(L, [[22, 6], [27, 4], [32, 2], [37, 4], [42, 6]], '#ffffff');
  px(L, [[26, 12], [32, 12], [38, 12]].map(([x, y], i) => [x, y, ['#3b6be2', '#e23b3b', '#3b6be2'][i]]));
  // the coffee, held in the right paw, with steam
  rect(L, 44, 38, 54, 38, '#3a1f10'); rect(L, 44, 39, 54, 49, '#efe6d4'); rect(L, 44, 39, 46, 49, '#fffdf4'); rect(L, 52, 39, 54, 49, '#c9bda3'); rect(L, 44, 49, 54, 49, '#a89c84');
  rect(L, 45, 38, 53, 38, '#5a3018');
  px(L, [[55, 41], [56, 41], [57, 42], [57, 43], [57, 44], [57, 45], [56, 46], [55, 46]], '#efe6d4');
  px(L, [[48, 43], [49, 43], [48, 44], [50, 42], [50, 43], [49, 45], [50, 45], [51, 45]], '#c4452f');
  fill(L, ell(44.2, 44, 3, 4.6), fur.base); fill(L, ell(43.6, 43.4, 1.6, 2.4), fur.light);
  px(L, [[41, 41], [41, 43], [41, 45]], claw);
  px(L, [[47, 36], [46, 35], [47, 34], [48, 33], [47, 32], [51, 35], [50, 34], [51, 33], [52, 32], [51, 31]], '#d8d8e8');
  // floor shadow, bear over the cave, dark outline
  { const sh = ell(32, 62, 26, 2.4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sh(x, y) && bg[y][x]) bg[y][x] = darken(bg[y][x], 0.55); }
  const out = bg.map((row) => row.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L[y][x]) out[y][x] = L[y][x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (L[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < W && yy < H && L[yy][xx]; })) out[y][x] = INK;
  }
  return out;
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
const founderPng = (scale) => gridToPng(drawFounder(), scale || 8);
function founderSvg(owner, bare) {
  const rects = rectsOf(drawFounder());
  if (bare) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" shape-rendering="crispEdges" role="img" aria-label="The Founder, a giant grizzly bear">' + rects + '</svg>';
  const short = owner ? owner.slice(0, 4) + '…' + owner.slice(-4) : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76" width="1024" height="1216" shape-rendering="crispEdges" role="img" aria-label="The Founder, a giant grizzly bear with a gold crown and a coffee">'
    + '<rect width="64" height="76" fill="#120d0a"/>' + rects
    + '<text x="32" y="68.6" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="3.2" fill="#ffc84a" shape-rendering="auto">FOUNDER 1 / 1</text>'
    + '<text x="32" y="71.8" text-anchor="middle" font-family="Courier New, monospace" font-size="1.9" fill="#ad9a82" shape-rendering="auto">GRIZZLY, GOLD CROWN, COFFEE</text>'
    + (short ? '<text x="32" y="74.6" text-anchor="middle" font-family="Courier New, monospace" font-size="1.8" fill="#7d6c58" shape-rendering="auto">held by ' + short + '</text>' : '')
    + '</svg>';
}

module.exports = { render, traitsFor, silhouette, SKINS, png, founderPng, founderSvg };
