'use strict';
// Voxel mechs. Each agent is a small 3D robot built from cubes: a biped, a four-legged walker or a spider, in one of
// several paint schemes with glowing lights. They are made in a 32 x 48 x 32 grid, from a server secret, and no two
// agents in a set match. The same model is used for the 3D views (as cubes) and for the flat logo (drawn by isorender.js).
const crypto = require('crypto');

const W = 32, H = 48, D = 32, CX = 15.5, CZ = 16;

const SCHEMES = [
  { key: 'rust', name: 'Rust', w: 14, base: '#c4532c', trim: '#f0d9b8', dark: '#2a2a31', joint: '#4b4d5a', bg: '#1c3a3c' },
  { key: 'mustard', name: 'Mustard', w: 14, base: '#e0a02b', trim: '#9a4326', dark: '#2d2a2a', joint: '#5a4a3a', bg: '#26324a' },
  { key: 'crimson', name: 'Crimson', w: 12, base: '#b01c24', trim: '#e8e8ee', dark: '#25262e', joint: '#585a68', bg: '#1d3a5e' },
  { key: 'slate', name: 'Slate', w: 14, base: '#6f9bb8', trim: '#c89a5a', dark: '#232830', joint: '#3d4450', bg: '#2a2a34' },
  { key: 'olive', name: 'Olive', w: 10, base: '#8c8a3e', trim: '#3d3f2c', dark: '#23241c', joint: '#4c4e40', bg: '#252a34' },
  { key: 'moss', name: 'Moss', w: 10, base: '#4f7d3c', trim: '#b0b0a0', dark: '#1f241f', joint: '#44503c', bg: '#2d2438' },
  { key: 'orchid', name: 'Orchid', w: 8, base: '#b48ac4', trim: '#eee6f2', dark: '#2a2630', joint: '#6a5a78', bg: '#1d3a4a' },
  { key: 'bone', name: 'Bone', w: 8, base: '#d8d2c4', trim: '#7a5a3a', dark: '#2a2826', joint: '#6a665c', bg: '#2a3248' },
  { key: 'graphite', name: 'Graphite', w: 10, base: '#4a4f5c', trim: '#c8a04a', dark: '#1c1e24', joint: '#30343e', bg: '#2a2a3a' },
  { key: 'teal', name: 'Teal', w: 10, base: '#2f9e9a', trim: '#f2e8c8', dark: '#1d2a2c', joint: '#3f5c5c', bg: '#3a2a2e' },
  { key: 'violet', name: 'Violet', w: 9, base: '#6a4cc4', trim: '#f0c24a', dark: '#211c34', joint: '#463c78', bg: '#2a3a2a' },
  { key: 'blaze', name: 'Blaze', w: 10, base: '#e8741c', trim: '#24262c', dark: '#24262c', joint: '#5a4034', bg: '#1c2c44' },
  { key: 'arctic', name: 'Arctic', w: 8, base: '#e4ecf6', trim: '#3a7ac8', dark: '#252a36', joint: '#7a8aa0', bg: '#2a2a3c' },
  { key: 'gold', name: 'Gold', w: 8, base: '#d8b238', trim: '#3c3c46', dark: '#2a2620', joint: '#6a5a30', bg: '#2c2638' },
  { key: 'navy', name: 'Navy', w: 10, base: '#284a8c', trim: '#e0a038', dark: '#161c2c', joint: '#3a4a6c', bg: '#3a2a24' },
  { key: 'pink', name: 'Pink', w: 6, base: '#e0689a', trim: '#f4f0f0', dark: '#2c2030', joint: '#7a4a62', bg: '#1f3a3a' },
  { key: 'onyx', name: 'Onyx', w: 9, base: '#2c2e34', trim: '#e03a3a', dark: '#14151a', joint: '#40424c', bg: '#3a3a44' },
  { key: 'lime', name: 'Lime', w: 7, base: '#9ccf2c', trim: '#2a2a30', dark: '#22261a', joint: '#5a6a30', bg: '#301f3a' },
  { key: 'maroon', name: 'Maroon', w: 8, base: '#7c2430', trim: '#d4c4a0', dark: '#241418', joint: '#5a3a40', bg: '#1c3a34' },
];
const TRIMS = ['#f4efe0', '#ffd166', '#1f2228', '#ffffff', '#ff7a2a', '#e63a3a', '#44d6c8', '#b0e04a'];
const BIPED_WEAPONS = [['rifle', 22], ['gatling', 16], ['cannon', 16], ['blade', 18], ['claw', 8], ['none', 6]];
const MOUNTS = [['none', 24], ['pods', 22], ['backgun', 18], ['rail', 14], ['cannon', 10]];
const CRESTS = [['none', 40], ['horns', 18], ['fin', 18], ['mohawk', 14]];
const QUAD_WEAPONS = [['turret', 30], ['twin', 24], ['rack', 24], ['mortar', 22]];
const SPIDER_WEAPONS = [['mandibles', 34], ['mortar', 32], ['twin', 34]];
const WEAPON_LABEL = { rifle: 'Pulse rifle', gatling: 'Gatling gun', cannon: 'Arm cannon', blade: 'Energy blade', claw: 'Plasma claw', none: 'Unarmed', turret: 'Roof turret', twin: 'Twin guns', rack: 'Missile racks', mortar: 'Mortar', mandibles: 'Plasma fangs' };
const GLOWS = [['cyan', '#4ff3ff', 26], ['green', '#5dff7a', 18], ['amber', '#ffa530', 20], ['magenta', '#ff58d0', 12], ['red', '#ff4a3a', 14], ['ice', '#c4ecff', 10]];
const ARCHS = [['biped', 22], ['slim', 11], ['heavy', 11], ['tall', 8], ['brute', 10], ['scout', 10], ['quad', 15], ['spider', 13]];
const VISORS = [['eyes', 28], ['slit', 22], ['cross', 14], ['cyclops', 16], ['dots', 20]];
const ANTENNAS = [['none', 30], ['single', 28], ['dual', 22], ['dish', 20]];
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
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

// ---- traits: the same look is never handed out twice in one set ----
const traitCache = new Map();
const si0 = (t) => t.skin;
function traitsFor(slot, secret) {
  const ck = String(secret);
  let list = traitCache.get(ck);
  if (!list) { list = { rnd: prng(crypto.createHmac('sha256', ck).update('mechs').digest()), items: [], seen: new Set(), skins: new Set(), names: new Set() }; traitCache.set(ck, list); }
  while (list.items.length <= slot) {
    let t, key, tries = 0;
    do {
      const si = pickW(SCHEMES.map((c, i) => [i, c.w]), list.rnd())[0], gi = pickW(GLOWS.map((a, i) => [i, a[2]]), list.rnd())[0];
      t = {
        species: 'AGENT', arch: pickW(ARCHS, list.rnd())[0], skin: si, coat: SCHEMES[si].key, glow: gi,
        visor: pickW(VISORS, list.rnd())[0], antenna: pickW(ANTENNAS, list.rnd())[0],
        pack: list.rnd() < 0.5, pads: list.rnd() < 0.45, helmet: list.rnd() < 0.35, lights: list.rnd() < 0.6, seed: Math.floor(list.rnd() * 1e9),
      };
      t.accent = list.rnd() < 0.55 ? Math.floor(list.rnd() * TRIMS.length) : -1; t.tone = 0.86 + list.rnd() * 0.28;
      const quadish = t.arch === 'quad', spiderish = t.arch === 'spider';
      t.weapon = pickW(quadish ? QUAD_WEAPONS : spiderish ? SPIDER_WEAPONS : BIPED_WEAPONS, list.rnd())[0];
      t.wside = list.rnd() < 0.5 ? 'R' : 'L'; t.twin = list.rnd() < 0.25 && ['rifle', 'gatling', 'cannon', 'blade'].includes(t.weapon);
      t.shield = !t.twin && t.weapon !== 'none' && list.rnd() < 0.3;
      t.mount = quadish || spiderish ? 'none' : pickW(MOUNTS, list.rnd())[0]; t.crest = quadish || spiderish ? 'none' : pickW(CRESTS, list.rnd())[0];
      key = [t.arch, t.skin, t.glow, t.visor, t.antenna, t.pack, t.pads, t.helmet, t.accent, t.weapon, t.twin, t.shield, t.mount, t.crest].join('|');
      tries++;
    } while ((list.seen.has(key) || (tries < 200 && list.skins.has(si0(t)) && list.skins.size < SCHEMES.length)) && tries < 300);
    list.seen.add(key); list.skins.add(t.skin);
    let nm, nt = 0;
    do { nm = NAMES[Math.floor(list.rnd() * NAMES.length)]; nt++; } while (list.names.has(nm) && nt < 200);
    list.names.add(nm);
    t.name = nm; t.role = ROLE_KEYS[Math.floor(list.rnd() * ROLE_KEYS.length)];
    list.items.push(t);
  }
  return list.items[slot];
}
function agentFor(slot, secret) { const t = traitsFor(slot, secret); return { name: t.name, role: t.role, blurb: ROLES[t.role], chassis: SCHEMES[t.skin].name, weapon: WEAPON_LABEL[t.weapon] + (t.twin ? ' (twin)' : '') + (t.mount !== 'none' ? ' + ' + ({ pods: 'missile pods', backgun: 'back guns', rail: 'rail gun', cannon: 'shoulder cannons' })[t.mount] : '') }; }

// ---- the voxel grid ----
class Vox {
  constructor() { this.m = new Map(); this.g = 0; this.pv = { leg: 8, arm: 28 }; this.info = { gun: null, muz: [] }; }
  muz(x, y, z, dx, dy, dz, mirror) { this.info.muz.push({ x, y, z, dx, dy, dz }); if (mirror) this.info.muz.push({ x: W - 1 - x, y, z, dx, dy, dz }); }
  set(x, y, z, c, e) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (x < 0 || x >= W || y < 0 || y >= H || z < 0 || z >= D) return;
    this.m.set((y * D + z) * W + x, { x, y, z, c, e: e ? 1 : 0, g: this.g });
  }
  box(x0, y0, z0, x1, y1, z1, c, e) { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, c, e); }
  // a box and its mirror image across the middle; gR and gL are the swing groups of the two sides
  mb(x0, y0, z0, x1, y1, z1, c, e, gR, gL) {
    const g = this.g;
    if (gR != null) this.g = gR; this.box(x0, y0, z0, x1, y1, z1, c, e);
    if (gL != null) this.g = gL; this.box(W - 1 - x1, y0, z0, W - 1 - x0, y1, z1, c, e);
    this.g = g;
  }
  line(a, b, t, c, e) {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 2 + 1, h = (t - 1) / 2;
    for (let i = 0; i <= n; i++) {
      const f = i / n, x = Math.round(a[0] + (b[0] - a[0]) * f - h), y = Math.round(a[1] + (b[1] - a[1]) * f - h), z = Math.round(a[2] + (b[2] - a[2]) * f - h);
      this.box(x, y, z, x + t - 1, y + t - 1, z + t - 1, c, e);
    }
  }
}

Vox.prototype.sb = function (side, x0, y0, z0, x1, y1, z1, c, e) { const g = this.g; this.g = side === 'R' ? 5 : 6; if (side === 'R') this.box(x0, y0, z0, x1, y1, z1, c, e); else this.box(W - 1 - x1, y0, z0, W - 1 - x0, y1, z1, c, e); this.g = g; };
Vox.prototype.sl = function (side, a, b, t, c, e) { const g = this.g, X = (x) => (side === 'R' ? x : W - 1 - x); this.g = side === 'R' ? 5 : 6; this.line([X(a[0]), a[1], a[2]], [X(b[0]), b[1], b[2]], t, c, e); this.g = g; };
// what a mech holds: h is the hand (x range, the front of the hand, and the hand's height)
function armWeapon(v, P, A, side, kind, h) {
  const { ax0, ax1, az0, az1, hy } = h, xm = ax0 + ((ax1 - ax0) >> 1), zf = az1;
  if (kind === 'rifle') {
    v.sb(side, ax0, hy, az0, ax1, hy + 1, zf + 8, P.dark, 0); v.sb(side, xm, hy, zf + 9, xm, hy, zf + 13, P.joint, 0); v.sb(side, xm, hy, zf + 14, xm, hy, zf + 14, A, 1);
    v.sb(side, xm, hy + 2, zf + 1, xm, hy + 2, zf + 5, P.trim, 0); v.sb(side, xm, hy - 3, zf + 2, xm, hy - 1, zf + 3, P.base, 0); v.sb(side, ax0, hy + 1, zf + 6, ax1, hy + 1, zf + 6, A, 1);
  } else if (kind === 'gatling') {
    v.sb(side, xm - 1, hy - 1, az0, xm + 1, hy + 1, zf + 2, P.joint, 0);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { v.sb(side, xm + dx, hy + dy, zf + 3, xm + dx, hy + dy, zf + 9, P.dark, 0); v.sb(side, xm + dx, hy + dy, zf + 10, xm + dx, hy + dy, zf + 10, A, 1); }
    v.sb(side, xm - 1, hy - 1, zf + 6, xm + 1, hy + 1, zf + 6, P.joint, 0); v.sb(side, xm - 1, hy + 2, az0, xm + 1, hy + 2, zf + 1, P.trim, 0);
  } else if (kind === 'cannon') {
    v.sb(side, xm - 2, hy - 2, az0 - 1, xm + 2, hy + 2, zf + 6, P.base, 0); v.sb(side, xm - 2, hy + 2, az0 - 1, xm + 2, hy + 2, zf + 6, P.trim, 0);
    v.sb(side, xm - 1, hy - 1, zf + 7, xm + 1, hy + 1, zf + 9, P.dark, 0); v.sb(side, xm, hy, zf + 9, xm, hy, zf + 9, A, 1); v.sb(side, xm - 2, hy - 2, zf + 2, xm + 2, hy - 2, zf + 2, A, 1);
  } else if (kind === 'blade') {
    v.sb(side, xm, hy, zf - 1, xm, hy, zf + 1, P.dark, 0); v.sb(side, xm - 1, hy, zf + 2, xm + 1, hy, zf + 2, P.trim, 0);
    v.sl(side, [xm, hy, zf + 3], [xm, hy + 11, zf + 13], 2, A, 1); v.sl(side, [xm, hy + 1, zf + 4], [xm, hy + 10, zf + 12], 1, '#ffffff', 1);
  } else if (kind === 'claw') {
    v.sb(side, xm - 1, hy - 1, zf + 1, xm + 1, hy + 1, zf + 2, P.joint, 0);
    for (const dy of [-2, 2]) { v.sb(side, xm, hy + dy, zf + 1, xm, hy + dy, zf + 6, P.trim, 0); v.sb(side, xm, hy + dy - Math.sign(dy), zf + 6, xm, hy + dy - Math.sign(dy), zf + 7, P.trim, 0); v.sb(side, xm, hy + dy, zf + 7, xm, hy + dy, zf + 7, A, 1); }
  } else if (kind === 'shield') {
    const xo = side === 'R' ? ax1 + 1 : ax1 + 1;
    v.sb(side, xo, hy - 5, az0 - 2, xo + 1, hy + 5, zf + 4, P.base, 0); v.sb(side, xo, hy - 5, az0 - 2, xo + 1, hy - 5, zf + 4, P.trim, 0); v.sb(side, xo, hy + 5, az0 - 2, xo + 1, hy + 5, zf + 4, P.trim, 0);
    v.sb(side, xo + 1, hy - 1, az0 + 1, xo + 1, hy + 2, zf + 1, A, 1);
  }
}
function shoulderMount(v, P, A, kind, m) {
  const { sx, tt, tz0, cz } = m;
  if (kind === 'pods') { v.mb(sx, tt + 1, cz - 3, sx + 3, tt + 4, cz + 2, P.dark, 0); v.mb(sx, tt + 4, cz - 3, sx + 3, tt + 4, cz + 2, P.trim, 0); for (const y of [tt + 1, tt + 3]) for (const x of [sx, sx + 2]) v.mb(x, y, cz + 2, x, y, cz + 2, A, 1); }
  else if (kind === 'backgun') { v.mb(sx, tt + 1, tz0 - 2, sx + 1, tt + 2, cz + 7, P.dark, 0); v.mb(sx, tt + 3, tz0 - 2, sx + 1, tt + 3, cz + 3, P.trim, 0); v.mb(sx, tt + 1, cz + 8, sx + 1, tt + 2, cz + 9, P.joint, 0); v.mb(sx, tt + 1, cz + 10, sx, tt + 1, cz + 10, A, 1); }
  else if (kind === 'rail') { v.box(sx - 1, tt + 1, tz0 - 2, sx + 2, tt + 2, cz + 10, P.dark, 0); v.box(sx - 1, tt + 3, tz0, sx + 2, tt + 3, cz + 8, P.trim, 0); v.box(sx, tt + 3, cz + 2, sx + 1, tt + 3, cz + 8, A, 1); v.box(sx, tt + 1, cz + 11, sx + 1, tt + 2, cz + 11, A, 1); }
  else if (kind === 'cannon') { v.mb(sx + 1, tt, cz - 1, sx + 3, tt + 2, cz + 6, P.dark, 0); v.mb(sx + 1, tt + 1, cz + 6, sx + 3, tt + 1, cz + 6, A, 1); v.mb(sx + 1, tt, cz - 1, sx + 3, tt, cz - 1, P.trim, 0); }
}
function crestFor(v, P, A, kind, m) {
  const { hTop, hz0, hz1, hw } = m;
  if (kind === 'horns') { v.mb(16 + hw - 1, hTop, hz0 + 1, 16 + hw - 1, hTop + 2, hz0 + 2, P.trim, 0); v.mb(16 + hw, hTop + 2, hz0, 16 + hw, hTop + 4, hz0 + 1, P.trim, 0); v.mb(16 + hw, hTop + 5, hz0, 16 + hw, hTop + 5, hz0, A, 1); }
  else if (kind === 'fin') { for (let i = 0; i < 5; i++) v.box(15, hTop + i, hz0, 16, hTop + i, Math.max(hz0, hz1 - i - 1), i < 4 ? P.base : P.trim, 0); v.box(15, hTop + 1, hz0, 16, hTop + 1, hz0, A, 1); }
  else if (kind === 'mohawk') { v.box(15, hTop, hz0, 16, hTop + 1, hz1, P.dark, 0); v.box(15, hTop + 2, hz0 + 1, 16, hTop + 2, hz1 - 1, A, 1); }
}

// ---- the builders ----
function biped(v, P, A, r, o) {
  const cz = CZ, heavy = o.heavy, lw = heavy ? 4 : o.slim ? 2 : 3, lx0 = heavy ? 17 : 17, lx1 = lx0 + lw - 1, lz0 = cz - (heavy ? 3 : 2), lz1 = cz + (heavy ? 2 : 1);
  const L = o.leg, shin = Math.ceil(L * 0.5), thigh = L - shin;
  let y = 0;
  // feet, shins, knees, thighs, hips (right side drawn, mirrored to the left; groups 1 and 2 swing)
  v.mb(lx0 - 1, 0, lz0 - 2, lx1 + 1, 1, lz1 + 2, P.dark, 0, 1, 2); v.mb(lx0 - 1, 1, lz1 + 1, lx1 + 1, 1, lz1 + 2, P.trim, 0, 1, 2);
  y = 2; v.mb(lx0, y, lz0, lx1, y + shin - 1, lz1, P.base, 0, 1, 2);
  if (o.lights) v.mb(lx1 - lw + 1, y + 1, lz1, lx1 - lw + 1, y + 2, lz1, A, 1, 1, 2);
  y += shin; v.mb(lx0 - 1, y, lz0 - 1, lx1 + 1, y + 1, lz1 + 1, P.joint, 0, 1, 2); v.mb(lx0 - 1, y, lz1 + 1, lx0 - 1, y, lz1 + 1, A, 1, 1, 2);
  y += 2; v.mb(lx0, y, lz0, lx1, y + thigh - 1, lz1, P.base, 0, 1, 2); v.mb(lx0, y, lz1 + 1, lx0, y + thigh - 1, lz1 + 1, P.trim, 0, 1, 2);
  y += thigh; const hipY = y; v.mb(lx0 - 1, y, lz0 - 1, lx1 + 1, y + 1, lz1 + 1, P.joint, 0, 1, 2);
  y += 2; v.pv.leg = hipY + 1;
  // pelvis and torso
  const tw = o.tw, td = o.td, th = o.th, tz0 = cz - Math.floor(td / 2), tz1 = tz0 + td - 1;
  v.mb(16, y, tz0 + 1, 16 + tw - 1, y + 2, tz1 - 1, P.dark, 0); v.mb(16, y + 2, tz1 - 1, 16 + tw - 1, y + 2, tz1 - 1, P.trim, 0);
  y += 3; const tb = y, tt = y + th;
  v.mb(16, tb, tz0, 16 + tw - 1, tt - 1, tz1, P.base, 0);
  v.mb(16, tb, tz0, 16 + tw - 1, tb, tz1, P.trim, 0);                                    // belt
  v.mb(16 + 1, tb + 2, tz1, 16 + tw - 2, tt - 3, tz1, P.trim, 0);                       // chest plate
  v.mb(16, tb + 2, tz1, 16, tt - 3, tz1, P.dark, 0);                                     // centre seam
  v.mb(17, tb + Math.floor(th / 2) - 1, tz1, 18, tb + Math.floor(th / 2), tz1, A, 1);   // chest light
  v.mb(16 + tw - 1, tb + 1, tz0 + 1, 16 + tw - 1, tt - 2, tz1 - 1, P.joint, 0);          // side panel
  // neck, head
  v.mb(16, tt, cz - 1, 16, tt, cz, P.dark, 0);
  const hw = o.hw, hh = o.hh, hd = o.hd, hz0 = cz - Math.floor(hd / 2), hz1 = hz0 + hd - 1, hy = tt + 1, hTop = hy + hh;
  v.mb(16, hy, hz0, 16 + hw - 1, hTop - 1, hz1, P.base, 0);
  v.mb(16, hTop - 1, hz0, 16 + hw - 1, hTop - 1, hz1, P.trim, 0);
  const ey = hy + Math.floor(hh / 2) - 1;
  v.mb(16, ey - 1, hz1, 16 + hw - 2, ey + 2, hz1, P.dark, 0);                            // face plate
  if (o.visor === 'eyes') v.mb(17, ey, hz1, 16 + Math.max(1, hw - 3), ey + 1, hz1, A, 1);
  else if (o.visor === 'slit') { v.mb(16, ey, hz1, 16 + hw - 2, ey, hz1, A, 1); }
  else if (o.visor === 'cross') { v.box(15, ey - 1, hz1, 16, ey + 1, hz1, A, 1); v.box(14, ey, hz1, 17, ey, hz1, A, 1); }
  else if (o.visor === 'cyclops') v.box(15, ey, hz1, 16, ey + 1, hz1, A, 1);
  else { v.mb(17, ey, hz1, 17, ey, hz1, A, 1); v.mb(17, ey + 2, hz1, 17, ey + 2, hz1, A, 1); }
  if (o.helmet) { v.mb(16, hTop - 1, hz0 - 1, 16 + hw, hTop, hz1 + 1, P.base, 0); v.mb(16, hTop, hz0 - 1, 16 + hw, hTop, hz1 + 1, P.trim, 0); }
  if (o.crest && o.crest !== 'none') crestFor(v, P, A, o.crest, { hTop, hz0, hz1, hw });
  else if (o.antenna === 'single') { v.box(15, hTop, cz - 1, 16, hTop + 2, cz - 1, P.dark, 0); v.box(15, hTop + 3, cz - 1, 16, hTop + 3, cz - 1, A, 1); }
  else if (o.antenna === 'dual') { v.mb(17 + Math.min(1, hw - 3), hTop, cz - 1, 17 + Math.min(1, hw - 3), hTop + 3, cz - 1, P.dark, 0); v.mb(17 + Math.min(1, hw - 3), hTop + 4, cz - 1, 17 + Math.min(1, hw - 3), hTop + 4, cz - 1, A, 1); }
  else if (o.antenna === 'dish') { v.box(15, hTop, cz - 1, 16, hTop + 1, cz - 1, P.dark, 0); v.box(13, hTop + 2, cz - 3, 18, hTop + 2, cz + 1, P.trim, 0); v.box(14, hTop + 3, cz - 2, 17, hTop + 3, cz, P.joint, 0); v.box(15, hTop + 3, cz - 1, 16, hTop + 3, cz - 1, A, 1); }
  // shoulders and arms (groups 3 and 4 swing)
  const sx = 16 + tw, aw = o.aw || (heavy ? 4 : o.slim ? 2 : 3), az0 = cz - (heavy ? 2 : 1), az1 = cz + (heavy ? 2 : 1);
  v.pv.arm = tt - 3;
  v.mb(sx, tt - 4, cz - 2, sx + aw + 1, tt - 1, cz + 2, P.joint, 0, 3, 4);
  if (o.pads) { v.mb(sx - 1, tt - 1, cz - 3, sx + aw + 2, tt, cz + 3, P.base, 0, 3, 4); v.mb(sx - 1, tt, cz - 3, sx + aw + 2, tt, cz + 3, P.trim, 0, 3, 4); }
  const ax0 = sx + 1, ax1 = ax0 + aw - 1, ua = Math.round(o.arm * 0.5), fa = o.arm - ua;
  let ay = tt - 5;
  v.mb(ax0, ay - ua + 1, az0, ax1, ay, az1, P.base, 0, 3, 4);
  ay -= ua; v.mb(ax0 - 1, ay - 1, az0 - 1, ax1 + 1, ay, az1 + 1, P.joint, 0, 3, 4);
  ay -= 2; v.mb(ax0, ay - fa + 1, az0, ax1, ay, az1, P.base, 0, 3, 4);
  if (o.lights) v.mb(ax0, ay - 2, az0, ax1, ay - 2, az1, A, 1, 3, 4);
  v.mb(ax0, ay - fa + 1, az1, ax0, ay - 1, az1, P.trim, 0, 3, 4);
  ay -= fa; v.mb(ax0 - 1, ay - 2, az0 - 1, ax1 + 1, ay, az1 + 1, P.dark, 0, 3, 4);
  if (o.cannon) { v.mb(sx + 1, tt, cz - 1, sx + 3, tt + 2, cz + 6, P.dark, 0, 3, 4); v.mb(sx + 1, tt + 1, cz + 6, sx + 3, tt + 1, cz + 6, A, 1, 3, 4); v.mb(sx + 1, tt, cz - 1, sx + 3, tt, cz - 1, P.trim, 0, 3, 4); }
  else if (o.mount && o.mount !== 'none') shoulderMount(v, P, A, o.mount, { sx, tt, tz0, cz });
  if (o.cannon) v.muz(sx + 2, tt + 1, cz + 7, 0, 0, 1, true);
  else if (o.mount === 'pods') { for (const x of [sx, sx + 2]) v.muz(x, tt + 2, cz + 3, 0, .2, 1, true); }
  else if (o.mount === 'backgun') v.muz(sx, tt + 1, cz + 11, 0, 0, 1, true);
  else if (o.mount === 'rail') v.muz(sx, tt + 2, cz + 12, 0, 0, 1, false);
  if (o.weapon && o.weapon !== 'none') {
    const hand = { ax0, ax1, az0, az1, hy: ay - 1 }, ws = o.wside || 'R', os = ws === 'R' ? 'L' : 'R';
    v.info.gun = { kind: o.weapon, side: ws, twin: !!o.twin, len: { rifle: 14, gatling: 10, cannon: 9 }[o.weapon] || 0, hand: [ax0 + ((ax1 - ax0) >> 1), ay - 1, az1] };
    armWeapon(v, P, A, ws, o.weapon, hand); if (o.twin) armWeapon(v, P, A, os, o.weapon, hand); else if (o.shield) armWeapon(v, P, A, os, 'shield', hand);
  }
  // backpack
  if (o.pack) {
    v.mb(16, tb + 1, tz0 - 3, 16 + tw - 3, tt - 2, tz0 - 1, P.dark, 0); v.mb(16 + 1, tb + 2, tz0 - 3, 16 + tw - 4, tt - 4, tz0 - 3, A, 1);
    v.mb(16 + tw - 3, tb + 1, tz0 - 3, 16 + tw - 2, tt + 1, tz0 - 2, P.joint, 0); v.mb(16 + tw - 3, tt + 1, tz0 - 3, 16 + tw - 2, tt + 1, tz0 - 2, P.trim, 0);
  }
  return hTop;
}
function quad(v, P, A, r, o) {
  const cz = CZ, legH = o.legH, bw = o.bw, bd = o.bd, bh = o.bh, z0 = cz - bd, z1 = cz + bd - 1, by = legH, top = by + bh;
  // body
  v.mb(16, by, z0, 16 + bw - 1, top - 1, z1, P.base, 0);
  v.mb(16, by, z0, 16 + bw - 1, by, z1, P.dark, 0);
  v.mb(16 + bw - 1, top - 1, z0, 16 + bw - 1, top - 1, z1, P.trim, 0); v.mb(16, top - 1, z0, 16 + bw - 1, top - 1, z0, P.trim, 0); v.mb(16, top - 1, z1, 16 + bw - 1, top - 1, z1, P.trim, 0);
  v.mb(16 + bw - 1, by + 1, z0 + 2, 16 + bw - 1, top - 2, z1 - 2, P.joint, 0);
  v.box(13, top - 1, z0 + 2, 18, top, z0 + 5, P.joint, 0);                                           // roof hatch
  v.mb(17, top, z0 + 3, 18, top, z0 + 4, A, 1);
  // head, a block on the front
  const hw = o.hw, hh = Math.min(bh, 6), hz0 = z1 + 1;
  v.mb(16, by + bh - hh - 1, hz0, 16 + hw - 1, by + bh - 2, hz0 + 3, P.base, 0);
  v.mb(16, by + bh - 2, hz0, 16 + hw - 1, by + bh - 2, hz0 + 3, P.trim, 0);
  const ey = by + bh - hh + 1;
  v.mb(16, ey - 1, hz0 + 3, 16 + hw - 2, ey + 2, hz0 + 3, P.dark, 0);
  if (o.visor === 'slit') v.mb(16, ey, hz0 + 3, 16 + hw - 2, ey, hz0 + 3, A, 1); else if (o.visor === 'cyclops') v.box(15, ey, hz0 + 3, 16, ey + 1, hz0 + 3, A, 1); else v.mb(17, ey, hz0 + 3, 17, ey + 1, hz0 + 3, A, 1);
  if (o.weapon === 'turret') { v.box(13, top, cz - 2, 18, top + 2, cz + 2, P.joint, 0); v.box(14, top + 1, cz + 3, 15, top + 2, cz + 10, P.dark, 0); v.box(16, top + 1, cz + 3, 17, top + 2, cz + 10, P.dark, 0); v.box(14, top + 1, cz + 11, 14, top + 1, cz + 11, A, 1); v.box(17, top + 1, cz + 11, 17, top + 1, cz + 11, A, 1); v.muz(14, top + 1, cz + 11, 0, 0, 1, false); v.muz(17, top + 1, cz + 11, 0, 0, 1, false); v.box(15, top + 3, cz - 1, 16, top + 3, cz, A, 1); }
  else if (o.weapon === 'twin') { v.mb(16 + hw, by + bh - 4, hz0, 16 + hw + 1, by + bh - 3, hz0 + 8, P.dark, 0); v.mb(16 + hw, by + bh - 4, hz0 + 9, 16 + hw + 1, by + bh - 3, hz0 + 9, A, 1); v.muz(16 + hw, by + bh - 4, hz0 + 9, 0, 0, 1, true); v.mb(16 + hw, by + bh - 2, hz0, 16 + hw + 1, by + bh - 2, hz0 + 3, P.trim, 0); }
  else if (o.weapon === 'rack') { v.mb(16 + bw, by + 1, z0 + 2, 16 + bw + 1, top - 1, z1 - 2, P.dark, 0); v.mb(16 + bw, top - 1, z0 + 2, 16 + bw + 1, top - 1, z1 - 2, P.trim, 0); for (let y = by + 2; y < top - 1; y += 2) { v.mb(16 + bw, y, z1 - 2, 16 + bw + 1, y, z1 - 2, A, 1); v.muz(16 + bw, y, z1 - 2, .1, .15, 1, true); } }
  else if (o.weapon === 'mortar') { v.line([15, top, cz - 1], [15, top + 9, cz - 4], 2, P.dark, 0); v.box(15, top + 9, cz - 5, 16, top + 10, cz - 4, A, 1); v.muz(15, top + 10, cz - 4, 0, 1, -.35, false); v.box(13, top, cz - 3, 18, top + 1, cz + 1, P.joint, 0); }
  // back radiator
  v.mb(16, by + 1, z0 - 2, 16 + bw - 3, top - 2, z0 - 1, P.dark, 0); v.mb(17, by + 2, z0 - 2, 16 + bw - 4, top - 3, z0 - 2, A, 1);
  if (o.antenna !== 'none') { v.mb(16 + bw - 2, top, z0 + 1, 16 + bw - 2, top + 4, z0 + 1, P.dark, 0); v.mb(16 + bw - 2, top + 5, z0 + 1, 16 + bw - 2, top + 5, z0 + 1, A, 1); }
  // four legs, alternate pairs swing together
  v.pv.leg = by + 1;
  const lx0 = 16 + bw - 3, lw = 3;
  for (const [zz, gR, gL] of [[z1 - 3, 1, 2], [z0 + 1, 2, 1]]) {
    v.mb(lx0, by - 3, zz - 1, lx0 + lw, by, zz + 3, P.joint, 0, gR, gL);                                // hip block
    v.mb(lx0 + 1, 3, zz + 1, lx0 + 2, by - 4, zz + 2, P.base, 0, gR, gL);                               // leg, two cubes thick
    v.mb(lx0 + 1, 3, zz + 2, lx0 + 1, by - 4, zz + 2, P.trim, 0, gR, gL);
    v.mb(lx0, Math.floor(by / 2) + 1, zz - 1, lx0 + lw, Math.floor(by / 2) + 2, zz + 3, P.joint, 0, gR, gL); // knee
    v.mb(lx0 + 1, Math.floor(by / 2) + 1, zz + 3, lx0 + 1, Math.floor(by / 2) + 1, zz + 3, A, 1, gR, gL);
    v.mb(lx0 - 1, 0, zz - 1, lx0 + lw + 1, 2, zz + 4, P.dark, 0, gR, gL);                               // foot
    v.mb(lx0 - 1, 2, zz + 4, lx0 + lw + 1, 2, zz + 4, P.trim, 0, gR, gL);
  }
  return top;
}
function spider(v, P, A, r, o) {
  const cz = CZ, bw = o.bw, bd = o.bd, bh = o.bh, legH = o.legH, by = legH, top = by + bh, z0 = cz - bd, z1 = cz + bd - 1;
  v.mb(16, by, z0, 16 + bw - 1, top - 1, z1, P.dark, 0);
  v.mb(16 + 1, by + 1, z0, 16 + bw - 1, top - 2, z1, P.joint, 0);
  // battery and cargo hanging underneath, glowing
  v.mb(16, by - 3, z0 + 1, 16 + bw - 2, by - 1, z1 - 1, P.base, 0); v.mb(16 + 1, by - 3, z0 + 1, 16 + bw - 3, by - 3, z1 - 1, A, 1);
  // head box on top, at the front, with a lit slit
  const hw = o.hw, hh = 5, hz0 = z1 - 4, hz1 = z1 + 2;
  v.mb(16, top, hz0, 16 + hw - 1, top + hh - 1, hz1, P.base, 0); v.mb(16, top + hh - 1, hz0, 16 + hw - 1, top + hh - 1, hz1, P.trim, 0);
  const ey = top + 2;
  v.mb(16, ey - 1, hz1, 16 + hw - 1, ey + 1, hz1, P.dark, 0);
  if (o.visor === 'cyclops') v.box(15, ey, hz1, 16, ey, hz1, A, 1); else if (o.visor === 'slit') v.mb(16, ey, hz1, 16 + hw - 1, ey, hz1, A, 1); else v.mb(17, ey, hz1, 17, ey, hz1, A, 1);
  // a scoop or antenna at the back
  v.mb(16, top, z0, 16 + 1, top + 2, z0 + 2, P.base, 0); v.mb(16, top + 3, z0, 16, top + 3, z0 + 1, A, 1);
  if (o.antenna !== 'none') { v.box(15, top + hh, hz0 + 1, 16, top + hh + 3, hz0 + 1, P.dark, 0); v.box(15, top + hh + 4, hz0 + 1, 16, top + hh + 4, hz0 + 1, A, 1); }
  if (o.weapon === 'mandibles') { for (const dx of [0, 1]) { v.mb(16 + dx, top, hz1 + 1, 16 + dx, top + 1, hz1 + 5, P.trim, 0); v.mb(16 + dx, top + 2, hz1 + 4, 16 + dx, top + 2, hz1 + 5, P.trim, 0); v.mb(16 + dx, top + 2, hz1 + 5, 16 + dx, top + 2, hz1 + 5, A, 1); } v.muz(16, top + 2, hz1 + 5, 0, 0, 1, true); }
  else if (o.weapon === 'mortar') { v.line([15, top, cz - 1], [15, top + 9, cz - 3], 2, P.dark, 0); v.box(15, top + 9, cz - 4, 16, top + 10, cz - 3, A, 1); v.muz(15, top + 10, cz - 3, 0, 1, -.3, false); }
  else if (o.weapon === 'twin') { v.mb(16 + bw, top - 3, z1 - 4, 16 + bw + 1, top - 2, z1 + 3, P.dark, 0); v.mb(16 + bw, top - 3, z1 + 4, 16 + bw + 1, top - 2, z1 + 4, A, 1); v.muz(16 + bw, top - 3, z1 + 4, 0, 0, 1, true); v.mb(16 + bw, top - 1, z1 - 4, 16 + bw + 1, top - 1, z1, P.trim, 0); }
  // legs: out from the body, up to a knee, then down to the floor
  v.pv.leg = by + 2;
  const zs = o.legs === 6 ? [z1 - 1, cz, z0 + 1] : [z1 - 1, z0 + 1];
  zs.forEach((z, i) => {
    const gR = i % 2 ? 2 : 1, gL = i % 2 ? 1 : 2, dz = (z >= cz ? 1 : -1) * 2, kx = 16 + bw + o.knee, fx = kx + o.reach;
    for (const side of [1, -1]) {
      const X = (x) => side === 1 ? x : W - 1 - x;
      v.g = side === 1 ? gR : gL;
      const A0 = [X(16 + bw - 1), by + 2, z], K = [X(kx), by + o.lift, z + dz], F = [X(fx), 1, z + dz * 2];
      v.line(A0, K, 2, P.base, 0); v.line(K, F, 2, P.trim, 0);
      v.box(X(kx) - 1, K[1] - 1, K[2] - 1, X(kx) + 1, K[1] + 1, K[2] + 1, P.joint, 0);
      v.set(X(kx), K[1] + 2, K[2], A, 1);
      v.box(X(fx) - 1, 0, F[2] - 1, X(fx) + 1, 1, F[2] + 1, P.dark, 0); v.set(X(fx), 1, F[2] + 1, A, 1);
    }
    v.g = 0;
  });
  return top + hh;
}

function build(t, r) {
  const P0 = SCHEMES[t.skin], A = GLOWS[t.glow][1], v = new Vox();
  const P = Object.assign({}, P0, { base: mixHex(P0.base, t.tone || 1) }); if (t.accent >= 0) P.trim = TRIMS[t.accent];
  const kind = t.arch;
  if (kind === 'quad') quad(v, P, A, r, { legH: ri(r, 12, 15), bw: ri(r, 5, 6), bd: ri(r, 5, 7), bh: ri(r, 6, 7), hw: ri(r, 3, 4), visor: t.visor, antenna: t.antenna, weapon: t.weapon });
  else if (kind === 'spider') spider(v, P, A, r, { legH: ri(r, 8, 11), bw: ri(r, 4, 5), bd: ri(r, 4, 5), bh: ri(r, 5, 6), hw: ri(r, 3, 4), legs: r() < 0.35 ? 6 : 4, knee: ri(r, 3, 5), reach: ri(r, 3, 5), lift: ri(r, 8, 11), visor: t.visor, antenna: t.antenna, weapon: t.weapon });
  else {
    const o = { visor: t.visor, antenna: t.antenna, pack: t.pack, pads: t.pads, helmet: t.helmet, lights: t.lights, weapon: t.weapon, wside: t.wside, twin: t.twin, shield: t.shield, mount: t.mount, crest: t.crest };
    if (kind === 'brute') Object.assign(o, { heavy: true, aw: 5, leg: ri(r, 8, 10), th: ri(r, 9, 11), tw: 9, td: 9, hw: 3, hh: 4, hd: 5, arm: ri(r, 12, 14), pads: true });
    else if (kind === 'scout') Object.assign(o, { slim: true, leg: ri(r, 9, 11), th: 7, tw: 4, td: 5, hw: 4, hh: 6, hd: 6, arm: ri(r, 9, 11) });
    else if (kind === 'slim') Object.assign(o, { slim: true, leg: ri(r, 12, 15), th: ri(r, 8, 10), tw: 4, td: 5, hw: 3, hh: 5, hd: 5, arm: ri(r, 12, 15) });
    else if (kind === 'tall') Object.assign(o, { slim: true, leg: ri(r, 15, 18), th: ri(r, 10, 12), tw: 4, td: 5, hw: 3, hh: 5, hd: 5, arm: ri(r, 14, 17) });
    else if (kind === 'heavy') Object.assign(o, { heavy: true, leg: ri(r, 9, 12), th: ri(r, 9, 12), tw: ri(r, 7, 8), td: ri(r, 8, 9), hw: ri(r, 4, 5), hh: 5, hd: 6, arm: ri(r, 9, 12), cannon: r() < 0.5, pads: true });
    else Object.assign(o, { leg: ri(r, 10, 13), th: ri(r, 8, 11), tw: ri(r, 5, 6), td: ri(r, 6, 7), hw: ri(r, 3, 4), hh: ri(r, 5, 6), hd: ri(r, 5, 6), arm: ri(r, 10, 13) });
    biped(v, P, A, r, o);
  }
  greeble(v, r, P, A);
  return v;
}
// small panel marks and tiny lights on exposed faces, so the big flat areas have some detail
function greeble(v, r, P, A) {
  const get = (x, y, z) => v.m.get((y * D + z) * W + x), cells = [...v.m.values()];
  for (const q of cells) {
    if (q.e || (q.c !== P.base && q.c !== P.trim)) continue;
    const front = !get(q.x, q.y, q.z + 1) && q.z + 1 < D, side = !get(q.x + 1, q.y, q.z) && q.x + 1 < W, roll = r();
    if (!(front || side)) continue;
    if (roll < 0.035) { q.c = P.dark; const n = get(q.x, q.y + 1, q.z); if (n && !n.e && n.c === q.c && r() < 0.5) n.c = P.dark; }
    else if (roll < 0.06) { q.c = P.joint; }
    else if (roll < 0.07) { q.c = A; q.e = 1; }
  }
}
// colour the cubes: each gets a slight shade of its own so the surfaces look hand-painted
const mixHex = (hex, k) => { const n = parseInt(hex.slice(1, 7), 16); return '#' + [16, 8, 0].map((sh) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * k))).toString(16).padStart(2, '0')).join(''); };
function finish(v) {
  const palette = [], index = new Map(), cells = [];
  for (const q of v.m.values()) {
    let c = q.c;
    if (!q.e) { const h = Math.imul(q.x * 73856093 ^ q.y * 19349663 ^ q.z * 83492791, 2654435761) >>> 0; c = mixHex(c, 0.93 + (h % 1000) / 1000 * 0.12); }
    let pi = index.get(c); if (pi == null) { pi = palette.length; palette.push(c); index.set(c, pi); }
    cells.push([q.x, q.y, q.z, q.e + 2 * q.g, pi]);
  }
  cells.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
  return { w: W, h: H, d: D, cx: CX, cz: CZ, pivot: [v.pv.leg, v.pv.arm], gun: v.info.gun, muz: v.info.muz, palette, cells };
}
const modelCache = new Map();
function agentVoxels(slot, secret) {
  const key = String(secret) + ':' + slot;
  let m = modelCache.get(key);
  if (!m) {
    const t = traitsFor(slot, secret), r = prng(crypto.createHash('sha256').update(String(t.seed)).digest());
    m = finish(build(t, r)); m.scheme = SCHEMES[t.skin].bg; m.glow = GLOWS[t.glow][1]; modelCache.set(key, m);
  }
  return m;
}

// ---- PRIME: the flagship. A big graphite biped with gold trim, shoulder cannons, a crown and one amber eye. ----
let primeCache = null;
function founderVoxels() {
  if (primeCache) return primeCache;
  const P = { base: '#3b3e4a', trim: '#ffc84a', dark: '#17181d', joint: '#2a2c35' }, A = '#ffb347', v = new Vox();
  const hTop = biped(v, P, A, () => 0.5, { heavy: true, leg: 12, th: 12, tw: 8, td: 9, hw: 5, hh: 6, hd: 6, arm: 12, visor: 'cyclops', antenna: 'none', pack: true, pads: true, helmet: false, lights: true, cannon: true });
  // crown: a gold band with five prongs and a red stone
  v.mb(16, hTop, 13, 20, hTop, 18, P.trim, 0);
  for (const x of [11, 13, 15, 16, 18, 20]) v.box(x, hTop + 1, 13, x, hTop + (x === 15 || x === 16 ? 4 : 3), 13, P.trim, 0);
  v.set(15, hTop + 4, 13, '#ff3b3b', 1); v.set(16, hTop + 4, 13, '#ff3b3b', 1);
  primeCache = finish(v); primeCache.scheme = '#2e2418'; primeCache.glow = A;
  return primeCache;
}

// ---- flat pictures for logos and tiles, cached because drawing one takes a moment ----
const iso = require('./isorender');
const picCache = new Map();
function pngFor(model, key, size) {
  const k = key + ':' + size; let b = picCache.get(k);
  if (!b) { b = iso.renderPng(model, { size }); picCache.set(k, b); if (picCache.size > 120) picCache.delete(picCache.keys().next().value); }
  return b;
}
const png = (slot, secret, size) => pngFor(agentVoxels(slot, secret), 'a' + secret + ':' + slot, size || 512);
const founderPng = (size) => pngFor(founderVoxels(), 'prime', size || 512);

// A small robot outline as rows of pixels [y, x, length] on a 64 by 64 grid, for the page's logo mark.
const SHAPE_ON = (x, y) => (x >= 18 && x <= 45 && y >= 14 && y <= 36) || (x >= 27 && x <= 36 && y >= 37 && y <= 40) || (x >= 14 && x <= 49 && y >= 40 && y <= 56)
  || (x >= 8 && x <= 12 && y >= 42 && y <= 58) || (x >= 51 && x <= 55 && y >= 42 && y <= 58) || (x >= 20 && x <= 28 && y >= 57 && y <= 61) || (x >= 35 && x <= 43 && y >= 57 && y <= 61) || (x >= 30 && x <= 33 && y >= 6 && y <= 13);
function silhouette() {
  const runs = [];
  for (let y = 0; y < 64; y++) { let x = 0; while (x < 64) { if (!SHAPE_ON(x, y)) { x++; continue; } let n = 1; while (x + n < 64 && SHAPE_ON(x + n, y)) n++; runs.push([y, x, n]); x += n; } }
  return runs;
}

module.exports = { png, founderPng, silhouette, traitsFor, agentFor, agentVoxels, founderVoxels, ROLES, SCHEMES, GLOWS, W, H, D };
