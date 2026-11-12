'use strict';
// Draws a voxel model as a flat picture, from a three-quarter view above, for logos and tiles. Plain JS, no libraries.
// Cubes are drawn far to near, three faces each, at twice the size and then shrunk for smooth edges.
const zlib = require('zlib');

const CRCT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRCT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function encodePng(rgb, w, h) {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) { raw[y * row] = 0; rgb.copy(raw, y * row + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const rgbOf = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// size is the picture's width and height in pixels
function renderPng(model, opts) {
  opts = opts || {};
  const size = opts.size || 512, SS = 2, S = size * SS;
  const yaw = (opts.yaw == null ? 35 : opts.yaw) * Math.PI / 180, pit = (opts.pitch == null ? 26 : opts.pitch) * Math.PI / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  // camera direction (toward the camera), screen right and screen up in world terms
  const cam = [sy * cp, sp, cy * cp], rt = [cy, 0, -sy], up = [-sy * sp, cp, -cy * sp];
  const proj = (x, y, z) => [x * rt[0] + y * rt[1] + z * rt[2], x * up[0] + y * up[1] + z * up[2]];
  const pal = model.palette.map(rgbOf), cells = model.cells.map((c) => ({ x: c[0] - model.cx, y: c[1], z: c[2] - model.cz, e: c[3] & 1, c: pal[c[4]] }));
  // fit the model into the picture
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const c of cells) for (const dx of [-.5, .5]) for (const dy of [-.5, .5]) for (const dz of [-.5, .5]) { const p = proj(c.x + dx, c.y + dy, c.z + dz); minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const k = Math.min(S * 0.8 / (maxX - minX), S * 0.8 / (maxY - minY)), ox = S / 2 - (minX + maxX) / 2 * k, oy = S * 0.5 + (minY + maxY) / 2 * k - S * 0.015;
  const sc = (p) => [ox + p[0] * k, oy - p[1] * k];

  const buf = new Float32Array(S * S * 3);
  // backdrop: a soft glow behind the model on a dark tint of the scheme
  const bg = rgbOf(model.bg || model.scheme || '#1c2a3a'), gl = rgbOf(model.glow || '#4ff3ff');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / S, dy = (y - S * 0.52) / S, d = Math.sqrt(dx * dx + dy * dy * 1.2), f = Math.max(0, 1 - d * 1.5), v = Math.max(0.25, 1 - d * 1.1), o = (y * S + x) * 3;
    buf[o] = bg[0] * v * 0.75 + gl[0] * f * f * 0.08; buf[o + 1] = bg[1] * v * 0.75 + gl[1] * f * f * 0.08; buf[o + 2] = bg[2] * v * 0.75 + gl[2] * f * f * 0.08;
  }
  // floor shadow under the feet
  const fp = sc(proj(0, -.5, 0)), shW = (maxX - minX) * k * 0.42, shH = shW * 0.3;
  for (let y = Math.max(0, Math.floor(fp[1] - shH)); y < Math.min(S, Math.ceil(fp[1] + shH)); y++) for (let x = Math.max(0, Math.floor(fp[0] - shW)); x < Math.min(S, Math.ceil(fp[0] + shW)); x++) {
    const dx = (x - fp[0]) / shW, dy = (y - fp[1]) / shH, d = dx * dx + dy * dy; if (d >= 1) continue; const a = (1 - d) * 0.55, o = (y * S + x) * 3; buf[o] *= 1 - a; buf[o + 1] *= 1 - a; buf[o + 2] *= 1 - a;
  }
  function fillPoly(pts, col) {
    let y0 = Infinity, y1 = -Infinity; for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(S - 1, Math.ceil(y1));
    const n = pts.length;
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5; let xl = Infinity, xr = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) { const x = a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]); if (x < xl) xl = x; if (x > xr) xr = x; }
      }
      if (xl > xr) continue;
      const xs = Math.max(0, Math.round(xl)), xe = Math.min(S - 1, Math.round(xr) - 1);
      for (let x = xs; x <= xe; x++) { const o = (y * S + x) * 3; buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; }
    }
  }
  const order = cells.map((c) => ({ c, d: c.x * cam[0] + c.y * cam[1] + c.z * cam[2] })).sort((a, b) => a.d - b.d);
  const glows = [];
  for (const { c } of order) {
    const { x, y, z } = c, base = c.c, lit = c.e ? 1.12 : 1;
    const f = (dx, dy, dz) => sc(proj(x + dx, y + dy, z + dz));
    const top = [f(-.5, .5, -.5), f(.5, .5, -.5), f(.5, .5, .5), f(-.5, .5, .5)];
    const rgt = [f(.5, -.5, -.5), f(.5, -.5, .5), f(.5, .5, .5), f(.5, .5, -.5)];
    const frt = [f(-.5, -.5, .5), f(.5, -.5, .5), f(.5, .5, .5), f(-.5, .5, .5)];
    const sh = c.e ? [1.25, 1.25, 1.25] : [1.12, 0.94, 0.7];
    fillPoly(top, [clamp(base[0] * sh[0] * lit), clamp(base[1] * sh[0] * lit), clamp(base[2] * sh[0] * lit)]);
    fillPoly(frt, [clamp(base[0] * sh[1] * lit), clamp(base[1] * sh[1] * lit), clamp(base[2] * sh[1] * lit)]);
    fillPoly(rgt, [clamp(base[0] * sh[2] * lit), clamp(base[1] * sh[2] * lit), clamp(base[2] * sh[2] * lit)]);
    if (c.e) { const p = f(0, 0, 0); glows.push([p[0], p[1], base]); }
  }
  // light glow around the lit cubes
  const R = k * 1.9;
  for (const [gx, gy, col] of glows) {
    for (let y = Math.max(0, Math.floor(gy - R)); y < Math.min(S, Math.ceil(gy + R)); y++) for (let x = Math.max(0, Math.floor(gx - R)); x < Math.min(S, Math.ceil(gx + R)); x++) {
      const d = Math.hypot(x - gx, y - gy) / R; if (d >= 1) continue; const a = (1 - d) * (1 - d) * 0.12, o = (y * S + x) * 3;
      buf[o] += col[0] * a; buf[o + 1] += col[1] * a; buf[o + 2] += col[2] * a;
    }
  }
  // shrink for smooth edges
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    for (let ch = 0; ch < 3; ch++) { let s = 0; for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += buf[(((y * SS + j) * S) + x * SS + i) * 3 + ch]; out[(y * size + x) * 3 + ch] = clamp(Math.round(s / (SS * SS))); }
  }
  return encodePng(out, size, size);
}
module.exports = { renderPng, encodePng };
