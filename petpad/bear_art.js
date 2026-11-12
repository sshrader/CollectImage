'use strict';
// Pixel bears for the PetPad concept page. 32x32, every bear in a set is different.
const crypto = require('crypto');
const W = 32, H = 32;

const COATS = [
  { key: 'brown', name: 'Brown', w: 24, base: '#7a4a2b', light: '#a8693f', dark: '#4d2d18', snout: '#d9b48a', ear: '#c98a6a' },
  { key: 'black', name: 'Black', w: 18, base: '#44445a', light: '#66667e', dark: '#22222e', snout: '#8a7b6e', ear: '#6a5a58', moon: true },
  { key: 'honey', name: 'Honey', w: 14, base: '#d9952b', light: '#f2bb55', dark: '#9a6014', snout: '#f5dca6', ear: '#f0b070' },
  { key: 'cinnamon', name: 'Cinnamon', w: 12, base: '#a8522a', light: '#cf7a4a', dark: '#6e3217', snout: '#e8c19a', ear: '#e0956a' },
  { key: 'glacier', name: 'Glacier', w: 10, base: '#8fa6bf', light: '#b6c8dc', dark: '#5d7490', snout: '#e3ecf5', ear: '#c7d6e6' },
  { key: 'polar', name: 'Polar', w: 10, base: '#e9edf4', light: '#ffffff', dark: '#aab5c8', snout: '#ffffff', ear: '#d8c9cf', darkNose: true },
  { key: 'panda', name: 'Panda', w: 7, base: '#f2f2f4', light: '#ffffff', dark: '#b4b4be', snout: '#ffffff', ear: '#4a4a55', panda: true },
  { key: 'ember', name: 'Ember', w: 5, base: '#8c3b2a', light: '#b8583f', dark: '#5a2217', snout: '#e8b090', ear: '#d98a70' }
];
const EYES = [['open', 30], ['sleepy', 26], ['zzz', 12], ['wink', 10], ['heart', 8], ['glare', 14]];
const MOUTHS = [['smile', 40], ['flat', 30], ['open', 15], ['grumpy', 15]];
const ACCS = [['none', 30], ['beanie', 14], ['nightcap', 12], ['scarf', 12], ['flowers', 6], ['honey pot', 10], ['mug', 8], ['fish', 8]];
const BGS = [['cave', 24], ['snow night', 22], ['campfire', 16], ['starry', 18], ['dawn', 10], ['aurora', 10]];

function prng(buf) { let i = 0; return () => { const v = buf[i % buf.length] / 256; i += 1; return v; }; }
function pickW(list, r) { const tot = list.reduce((a, x) => a + x[1], 0); let t = r * tot; for (const x of list) { t -= x[1]; if (t < 0) return x; } return list[list.length - 1]; }

function traitsFor(slot, secret) {
  const seen = traitsFor.cache || (traitsFor.cache = {});
  const keyBase = secret + ':';
  for (let n = 0; n < 200; n++) {
    const h = crypto.createHash('sha256').update(keyBase + slot + ':' + n).digest();
    const r = prng(h);
    const coat = pickW(COATS.map((c) => [c.key, c.w]), r());
    const eyes = pickW(EYES, r()), mouth = pickW(MOUTHS, r()), acc = pickW(ACCS, r()), bg = pickW(BGS, r());
    const blush = r() < 0.25;
    const t = { slot, coat: coat[0], eyes: eyes[0], mouth: mouth[0], acc: acc[0], bg: bg[0], blush, seed: h.readUInt32LE(0) };
    const sig = secret + [t.coat, t.eyes, t.mouth, t.acc, t.bg, t.blush].join('|');
    if (seen[sig]) continue;
    seen[sig] = true;
    // Rarity from how unlikely this mix is.
    const p = (coat[1] / 100) * (eyes[1] / 100) * (mouth[1] / 100) * (acc[1] / 100 * 1.2) * (bg[1] / 100);
    t.p = p;
    return t;
  }
  throw new Error('no unique bear');
}

const grid = () => Array.from({ length: H }, () => Array(W).fill(null));
const put = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
const ell = (cx, cy, rx, ry) => (x, y) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; };
const fill = (g, shape, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shape(x, y)) g[y][x] = c; };
const px = (g, list, c) => list.forEach(([x, y, cc]) => put(g, x, y, cc || c));

function drawBg(g, bg, r) {
  const rows = (c, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) g[y][x] = c; };
  const scatter = (n, c, y0, y1) => { for (let i = 0; i < n; i++) put(g, Math.floor(r() * W), y0 + Math.floor(r() * (y1 - y0 + 1)), c); };
  if (bg === 'cave') {
    rows('#140d0a', 0, 31); rows('#1c120c', 26, 31);
    fill(g, ell(16, 21, 15, 13), '#2a1a10'); fill(g, ell(16, 22, 11, 10), '#3d2514'); fill(g, ell(16, 23, 8, 8), '#553320');
    scatter(10, '#0e0907', 0, 20);
    for (const x of [2, 6, 11, 21, 26, 29]) { const h = 2 + Math.floor(r() * 4); for (let i = 0; i < h; i++) put(g, x, i, '#0b0705'), put(g, x + 1, i, i < h - 1 ? '#0b0705' : null); }
    rows('#120b08', 31, 31);
  } else if (bg === 'snow night') {
    rows('#121a38', 0, 31); rows('#18224a', 12, 22);
    scatter(7, '#e8eefc', 0, 22);
    rows('#dfe7f3', 27, 31); rows('#b8c6de', 27, 27); rows('#c8d4e8', 29, 29);
  } else if (bg === 'campfire') {
    rows('#1a0f0c', 0, 31); rows('#241610', 26, 31);
    fill(g, ell(16, 22, 15, 12), '#33200f'); fill(g, ell(16, 23, 10, 8), '#4f2c16');
    px(g, [[3, 29], [4, 29], [5, 29], [6, 29]], '#4a2a14');
    px(g, [[4, 28], [5, 28]], '#e8782a'); px(g, [[4, 27], [5, 27], [5, 26]], '#ffb347'); px(g, [[4, 26]], '#ffd98a');
    scatter(3, '#ffb347', 14, 22);
  } else if (bg === 'starry') {
    rows('#0b1128', 0, 31); rows('#111a3a', 14, 24); rows('#16204a', 25, 31);
    scatter(8, '#f4f0dc', 0, 20);
    fill(g, ell(26, 5, 2.6, 2.6), '#f6edcf'); fill(g, ell(27, 4.4, 2, 2), '#0b1128');
  } else if (bg === 'dawn') {
    rows('#2d3a2e', 0, 31); rows('#3a4a3a', 8, 18); rows('#55684f', 19, 25); rows('#2a2418', 27, 31);
    fill(g, ell(25, 14, 3, 3), '#f2b782');
    for (const x of [3, 4, 27, 28]) for (let y = 0; y < 27; y++) g[y][x] = '#0f1a10';
    scatter(3, '#0f1a10', 0, 22);
  } else {
    rows('#0a0f1e', 0, 31);
    for (let x = 0; x < W; x++) { const o = Math.round(Math.sin(x / 4) * 1.6); for (let y = 2; y < 6; y++) put(g, x, y + o, y < 4 ? '#1f6a56' : '#2a8f78'); for (let y = 6; y < 9; y++) put(g, x, y + o, '#1a5a66'); }
    scatter(4, '#e8f0fa', 10, 22); rows('#d8e3f0', 28, 31); rows('#b6c6dc', 28, 28);
  }
}

function drawBear(t, r) {
  const coat = COATS.find((c) => c.key === t.coat);
  const bg = grid(); drawBg(bg, t.bg, r);
  const L = grid(); // bear layer
  const B = coat.base, S = coat.snout, EARC = coat.ear, DARK = '#1a0f0a';
  const part = (shape, c) => fill(L, shape, c);
  const armC = coat.panda ? '#2c2c34' : B;
  // feet, body, arms, ears, head
  part(ell(11, 29, 3.3, 1.9), coat.panda ? '#2c2c34' : B); part(ell(21, 29, 3.3, 1.9), coat.panda ? '#2c2c34' : B);
  part(ell(16, 22.5, 8.2, 7.3), B);
  part(ell(16, 23.6, 4.8, 4.6), S);
  if (coat.moon) { part(ell(16, 19.3, 3.2, 1.7), '#efe3c8'); part(ell(16, 18.2, 3.2, 1.7), B); }
  part(ell(8.6, 22.8, 2.6, 5), armC); part(ell(23.4, 22.8, 2.6, 5), armC);
  part(ell(9.5, 6.5, 3, 3), coat.panda ? '#2c2c34' : B); part(ell(22.5, 6.5, 3, 3), coat.panda ? '#2c2c34' : B);
  part(ell(9.6, 6.8, 1.5, 1.5), EARC); part(ell(22.4, 6.8, 1.5, 1.5), EARC);
  part(ell(16, 12.5, 7.8, 7), B);
  if (coat.panda) { part(ell(12.2, 11.6, 2.2, 2.6), '#2c2c34'); part(ell(19.8, 11.6, 2.2, 2.6), '#2c2c34'); }
  part(ell(16, 15.2, 3.7, 2.8), S);
  // rim shading on fur pixels
  const furs = new Set([B, '#2c2c34']);
  const copy = L.map((row) => row.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = copy[y][x]; if (!c || !furs.has(c)) continue;
    const dn = y + 1 < H ? copy[y + 1][x] : null, rt = x + 1 < W ? copy[y][x + 1] : null;
    const up = y > 0 ? copy[y - 1][x] : null, lf = x > 0 ? copy[y][x - 1] : null;
    if (c === B && (!dn || !rt)) L[y][x] = coat.dark;
    else if (c === B && (!up || !lf) && (x + y) % 2 === 0) L[y][x] = coat.light;
  }
  // face
  const eyeC = '#1a0f0a';
  const eyeL = [12, 11], eyeR = [19, 11];
  const open = (e) => { const x = e[0] + (e[0] < 16 ? -1 : 0), y = e[1]; px(L, [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]], eyeC); put(L, x, y, '#fff'); };
  const line = (e) => { put(L, e[0] - 1, e[1] + 1, eyeC); put(L, e[0], e[1] + 1, eyeC); put(L, e[0] + 1, e[1] + 1, eyeC); };
  if (t.eyes === 'open') { open(eyeL); open(eyeR); }
  else if (t.eyes === 'sleepy' || t.eyes === 'zzz') { line(eyeL); line(eyeR); }
  else if (t.eyes === 'wink') { line(eyeL); open(eyeR); }
  else if (t.eyes === 'glare') { open(eyeL); open(eyeR); px(L, [[10, 9], [11, 10], [12, 10], [20, 9], [19, 10], [18, 10]], eyeC); L[9][10] = null; L[9][20] = null; }
  else if (t.eyes === 'heart') { for (const e of [eyeL, eyeR]) px(L, [[e[0] - 1, e[1]], [e[0] + 1, e[1]], [e[0] - 1, e[1] + 1], [e[0], e[1] + 1], [e[0] + 1, e[1] + 1], [e[0], e[1] + 2]], '#e8506a'); }
  const noseC = coat.darkNose ? '#2a2a33' : '#1a0f0a';
  px(L, [[15, 14], [16, 14]], noseC); put(L, 15, 13, noseC); put(L, 16, 13, noseC);
  if (t.mouth === 'smile') px(L, [[14, 16], [15, 17], [16, 17], [17, 16]], DARK);
  else if (t.mouth === 'flat') px(L, [[15, 16], [16, 16]], DARK);
  else if (t.mouth === 'open') { px(L, [[15, 16], [16, 16]], DARK); px(L, [[15, 17], [16, 17]], '#e8707a'); }
  else px(L, [[14, 17], [15, 16], [16, 16], [17, 17]], DARK);
  if (t.blush) px(L, [[10, 14], [21, 14]], '#e58a8a');
  if (t.eyes === 'zzz') px(L, [[24, 3], [25, 3], [26, 3], [25, 4], [24, 5], [25, 5], [26, 5]], '#cfd8ee');

  // accessories
  const a = t.acc;
  if (a === 'beanie') { fill(L, (x, y) => ell(16, 7.4, 5.8, 3.6)(x, y) && y <= 7, '#b8402f'); px(L, Array.from({ length: 12 }, (_, i) => [10 + i, 8]), '#e8d8b8'); px(L, [[15, 2], [16, 2], [15, 3], [16, 3]], '#f2e6d3'); px(L, [[15, 4], [16, 4]], '#b8402f'); }
  if (a === 'nightcap') { px(L, Array.from({ length: 12 }, (_, i) => [10 + i, 7]), '#e8d8b8'); px(L, Array.from({ length: 10 }, (_, i) => [11 + i, 6]), '#3a5aa8'); px(L, Array.from({ length: 8 }, (_, i) => [12 + i, 5]), '#3a5aa8'); px(L, [[18, 4], [19, 4], [20, 4], [21, 4], [22, 3], [23, 3], [24, 3], [25, 4], [26, 5], [26, 6]], '#3a5aa8'); px(L, [[19, 5], [20, 5], [21, 5], [22, 4], [23, 4], [24, 4], [25, 5]], '#3a5aa8'); px(L, [[26, 7], [27, 7], [26, 8], [27, 8]], '#f2e6d3'); }
  if (a === 'scarf') { for (let x = 11; x <= 21; x++) { put(L, x, 19, x % 2 ? '#c4452f' : '#f2e6d3'); put(L, x, 20, x % 2 ? '#f2e6d3' : '#c4452f'); } for (let y = 21; y <= 24; y++) { put(L, 20, y, y % 2 ? '#c4452f' : '#f2e6d3'); put(L, 21, y, y % 2 ? '#f2e6d3' : '#c4452f'); } }
  if (a === 'flowers') { px(L, [[11, 6], [13, 5], [16, 4], [19, 5], [21, 6]], '#fff'); px(L, [[12, 6], [14, 5], [15, 4], [17, 4], [18, 5], [20, 6]], '#4f9a52'); px(L, [[13, 5]], '#e58aa8'); px(L, [[19, 5]], '#ffd54a'); px(L, [[11, 6]], '#e58aa8'); px(L, [[21, 6]], '#ffd54a'); }
  if (a === 'honey pot') { fill(L, ell(16, 26, 4.6, 3.2), '#8a5a2b'); px(L, Array.from({ length: 8 }, (_, i) => [12 + i, 23]), '#f2bb55'); px(L, [[13, 24], [17, 24], [17, 25]], '#f2bb55'); px(L, Array.from({ length: 8 }, (_, i) => [12 + i, 22]), '#6e431e'); }
  if (a === 'mug') { fill(L, (x, y) => x >= 19 && x <= 23 && y >= 23 && y <= 27, '#e8e0d0'); px(L, [[24, 24], [25, 24], [25, 25], [25, 26], [24, 26]], '#e8e0d0'); px(L, [[19, 23], [20, 23], [21, 23], [22, 23], [23, 23]], '#6b3a1c'); px(L, [[20, 21], [21, 20], [22, 21]], '#cfd6df'); }
  if (a === 'fish') { fill(L, ell(15.5, 25.5, 4.2, 1.9), '#6fa6d4'); px(L, [[19, 24], [20, 23], [20, 27], [19, 26], [20, 25], [21, 24], [21, 26]], '#6fa6d4'); put(L, 13, 25, '#1a0f0a'); px(L, [[15, 25], [16, 25], [17, 25]], '#a9cdea'); }

  // floor shadow, then bear, then outline
  { const sh = ell(16, 30.6, 10, 1.3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sh(x, y) && bg[y][x]) bg[y][x] = darken(bg[y][x], 0.55); }
  const out = bg.map((row) => row.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L[y][x]) out[y][x] = L[y][x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (L[y][x]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < W && yy < H && L[yy][xx]; });
    if (n) out[y][x] = DARK;
  }
  return out;
}
function darken(hex, k) {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function toSvg(grid, extra) {
  let rects = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = grid[y][x];
      if (!c) { x++; continue; }
      let run = 1;
      while (x + run < W && grid[y][x + run] === c) run++;
      rects += '<rect x="' + x + '" y="' + y + '" width="' + run + '" height="1" fill="' + c + '"/>';
      x += run;
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" shape-rendering="crispEdges">' + rects + '</svg>';
}

const zlib = require('zlib');
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
// 32x32 RGBA PNG, one real pixel per art pixel, so the page can scale it with nearest-neighbour and stay perfectly sharp.
function toPng(grid) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const c = grid[y][x], o = y * (W * 4 + 1) + 1 + x * 4;
      if (c) { const hex = c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c; const n = parseInt(hex.slice(1, 7), 16); raw[o] = (n >> 16) & 255; raw[o + 1] = (n >> 8) & 255; raw[o + 2] = n & 255; raw[o + 3] = 255; }
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function render(slot, secret) {
  const t = traitsFor(slot, secret);
  const h = crypto.createHash('sha256').update(String(t.seed)).digest();
  const g = drawBear(t, prng(h));
  return { traits: t, svg: toSvg(g), png: toPng(g) };
}
function silhouette() {
  const L = grid();
  const part = (shape) => fill(L, shape, '#3a2a1d');
  part(ell(11, 29, 3.3, 1.9)); part(ell(21, 29, 3.3, 1.9)); part(ell(16, 22.5, 8.2, 7.3)); part(ell(8.6, 22.8, 2.6, 5)); part(ell(23.4, 22.8, 2.6, 5));
  part(ell(9.5, 6.5, 3, 3)); part(ell(22.5, 6.5, 3, 3)); part(ell(16, 12.5, 7.8, 7));
  return { svg: toSvg(L), png: toPng(L) };
}
const label = (t) => { const c = COATS.find((x) => x.key === t.coat); return c.name + ' bear'; };
module.exports = { render, silhouette, traitsFor, COATS, label };
