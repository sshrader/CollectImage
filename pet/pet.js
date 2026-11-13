'use strict';
// Voxel pets for PetPad: dogs and cats built from cubes in a 32 x 48 x 32 grid, from a server secret. Every pet has a breed,
// a coat, a collar with a glowing chain tag and sometimes an accessory, and no two pets in a set match. Even slots are dogs,
// odd slots are cats, so the two teams stay level. The same model drives the 3D views (cubes) and the flat logos (isorender.js).
const crypto = require('crypto');

const W = 32, H = 48, D = 32, CX = 15.5, CZ = 16;

// ---- coats ----
// pattern: solid, tabby, tux, calico, points, spots, mask, saddle. base is the main colour, belly the pale one, mark the dark one.
const COATS = {
  tabbyO: { name: 'Orange tabby', base: '#d98a3d', belly: '#f3dcb5', mark: '#a85d1d', pattern: 'tabby', eye: '#7dff9a' },
  tabbyG: { name: 'Grey tabby', base: '#8f959d', belly: '#e8e8ee', mark: '#5a6068', pattern: 'tabby', eye: '#ffe066' },
  tuxedo: { name: 'Tuxedo', base: '#25262d', belly: '#f2f2f2', pattern: 'tux', eye: '#c8ff6a' },
  blackC: { name: 'Black cat', base: '#26272e', belly: '#34353e', pattern: 'solid', eye: '#ffd23a' },
  siamese: { name: 'Siamese', base: '#e9dcc6', belly: '#f4ebdc', mark: '#5b4637', pattern: 'points', eye: '#6ec8ff' },
  calico: { name: 'Calico', base: '#f1ece4', belly: '#fffaf0', alt: '#d98a3d', alt2: '#2a2a30', pattern: 'calico', eye: '#ffe066' },
  blueC: { name: 'Blue cat', base: '#7f8aa0', belly: '#a9b2c4', pattern: 'solid', eye: '#ffb347' },
  whiteC: { name: 'White cat', base: '#f3f3f6', belly: '#ffffff', pattern: 'solid', eye: '#6ec8ff' },
  gingerC: { name: 'Ginger', base: '#e8903a', belly: '#fbe3bd', mark: '#bf6a22', pattern: 'tabby', eye: '#9dff7a' },
  shiba: { name: 'Shiba', base: '#d9873b', belly: '#f6ead3', mark: '#bf6e27', pattern: 'mask', eye: '#2a1a14' },
  husky: { name: 'Husky', base: '#6b7480', belly: '#f1f1f4', mark: '#3a3f48', pattern: 'mask', eye: '#7fd4ff' },
  corgi: { name: 'Corgi', base: '#d08a45', belly: '#f8f0e0', mark: '#b06a2a', pattern: 'mask', eye: '#2a1a14' },
  labG: { name: 'Golden lab', base: '#d8a44a', belly: '#ecc980', pattern: 'solid', eye: '#2a1a14' },
  labC: { name: 'Chocolate lab', base: '#6b4228', belly: '#82583a', pattern: 'solid', eye: '#1c120c' },
  labB: { name: 'Black lab', base: '#27272d', belly: '#34343c', pattern: 'solid', eye: '#2a1a14' },
  dalmatian: { name: 'Dalmatian', base: '#f4f4f2', belly: '#ffffff', mark: '#222226', pattern: 'spots', eye: '#2a1a14' },
  shepherd: { name: 'Shepherd', base: '#c9904f', belly: '#e0b57a', mark: '#2a2622', pattern: 'saddle', eye: '#2a1a14' },
  beagle: { name: 'Beagle', base: '#9a6a3a', belly: '#f6efe3', mark: '#2b2623', pattern: 'saddle', eye: '#2a1a14' },
  pug: { name: 'Pug', base: '#dcc18f', belly: '#ecd8b4', mark: '#2a2622', pattern: 'mask', eye: '#1c120c' },
};
// ---- breeds: sizes are in cubes. ear: cat, point, tall, floppy, big. tail: cat, curl, plume, wag, nub ----
const BREEDS = {
  dog: {
    shiba: { name: 'Shiba', leg: 8, bh: 6, bl: 13, hw: 3, hhw: 3, hs: 5, hh: 6, sn: 3, sw: 2, lw: 2, ear: 'point', tail: 'curl', coats: ['shiba'], w: 14 },
    husky: { name: 'Husky', leg: 10, bh: 7, bl: 15, hw: 4, hhw: 3, hs: 6, hh: 6, sn: 4, sw: 2, lw: 3, ear: 'point', tail: 'plume', coats: ['husky'], w: 12 },
    corgi: { name: 'Corgi', leg: 4, bh: 6, bl: 17, hw: 3, hhw: 3, hs: 5, hh: 6, sn: 3, sw: 2, lw: 2, ear: 'big', tail: 'nub', coats: ['corgi'], w: 12 },
    lab: { name: 'Labrador', leg: 10, bh: 7, bl: 15, hw: 4, hhw: 3, hs: 6, hh: 6, sn: 4, sw: 3, lw: 3, ear: 'floppy', tail: 'wag', coats: ['labG', 'labC', 'labB'], w: 18 },
    dalmatian: { name: 'Dalmatian', leg: 11, bh: 6, bl: 15, hw: 3, hhw: 3, hs: 6, hh: 6, sn: 4, sw: 2, lw: 2, ear: 'floppy', tail: 'wag', coats: ['dalmatian'], w: 10 },
    shepherd: { name: 'Shepherd', leg: 11, bh: 7, bl: 16, hw: 4, hhw: 3, hs: 6, hh: 7, sn: 5, sw: 2, lw: 3, ear: 'tall', tail: 'plume', coats: ['shepherd'], w: 12 },
    beagle: { name: 'Beagle', leg: 8, bh: 6, bl: 14, hw: 3, hhw: 3, hs: 6, hh: 6, sn: 3, sw: 2, lw: 2, ear: 'floppy', tail: 'wag', coats: ['beagle'], w: 10 },
    pug: { name: 'Pug', leg: 7, bh: 6, bl: 11, hw: 4, hhw: 4, hs: 5, hh: 6, sn: 1, sw: 3, lw: 2, ear: 'floppy', tail: 'curl', coats: ['pug'], w: 8 },
  },
  cat: {
    tabby: { name: 'Tabby', leg: 8, bh: 6, bl: 14, hw: 3, hhw: 3, hs: 5, hh: 6, sn: 1, sw: 2, lw: 2, ear: 'cat', tail: 'cat', coats: ['tabbyO', 'tabbyG', 'gingerC'], w: 24 },
    tuxedo: { name: 'Tuxedo', leg: 8, bh: 6, bl: 14, hw: 3, hhw: 3, hs: 5, hh: 6, sn: 1, sw: 2, lw: 2, ear: 'cat', tail: 'cat', coats: ['tuxedo'], w: 14 },
    siamese: { name: 'Siamese', leg: 10, bh: 5, bl: 15, hw: 3, hhw: 3, hs: 5, hh: 6, sn: 1, sw: 2, lw: 2, ear: 'tall', tail: 'cat', coats: ['siamese'], w: 12 },
    calico: { name: 'Calico', leg: 8, bh: 6, bl: 14, hw: 3, hhw: 3, hs: 5, hh: 6, sn: 1, sw: 2, lw: 2, ear: 'cat', tail: 'cat', coats: ['calico'], w: 12 },
    shorthair: { name: 'Shorthair', leg: 8, bh: 6, bl: 14, hw: 3, hhw: 3, hs: 5, hh: 6, sn: 1, sw: 2, lw: 2, ear: 'cat', tail: 'cat', coats: ['blackC', 'blueC', 'whiteC'], w: 20 },
    coon: { name: 'Maine coon', leg: 9, bh: 7, bl: 16, hw: 4, hhw: 4, hs: 5, hh: 7, sn: 1, sw: 2, lw: 3, ear: 'tall', tail: 'plume', coats: ['tabbyG', 'tabbyO', 'blackC'], w: 10 },
  },
};
const ACCS = { floppy: [['none', 26], ['bandana', 22], ['shades', 14], ['pack', 14], ['cap', 14], ['bowtie', 10]], other: [['none', 28], ['bandana', 24], ['shades', 16], ['pack', 16], ['bowtie', 16]] };
const COLLARS = ['#e63a3a', '#3a7ae6', '#3ae68a', '#e6c13a', '#b03ae6', '#ff7aa8', '#ff8a3a'];
const GLOWS = [['cyan', '#4ff3ff', 26], ['green', '#5dff7a', 20], ['amber', '#ffa530', 20], ['magenta', '#ff58d0', 14], ['violet', '#b69cff', 12], ['ice', '#c4ecff', 8]];
const BGS = { dog: ['#3a2c1c', '#1f3a2e', '#2c3a1c', '#3a2424'], cat: ['#2a2848', '#1f3a4a', '#3a2a44', '#243a3a'] };
const NAMES = {
  dog: ['BISCUIT', 'MOCHI', 'PEPPER', 'WAFFLES', 'COOKIE', 'BEAR', 'ROCKY', 'MAPLE', 'OTIS', 'NALA', 'COCO', 'BUDDY', 'ZIGGY', 'TANK', 'CHIP', 'SCOUT', 'DUKE', 'LUNA', 'MILO', 'HAZEL', 'OREO', 'BANDIT', 'RUFUS', 'PEANUT', 'GIZMO', 'TOBY', 'DAISY', 'HANK'],
  cat: ['WHISKERS', 'MISO', 'SMOKEY', 'TIGGER', 'NOODLE', 'PICKLES', 'SHADOW', 'CLEO', 'SIMBA', 'MOCHA', 'BEANS', 'FIGARO', 'GINGER', 'TOFU', 'NINJA', 'POUNCE', 'SOCKS', 'BOOTS', 'PUDDING', 'VELVET', 'SALEM', 'JINX', 'FELIX', 'OLIVE', 'BISCOTTI', 'PIXEL', 'TRUFFLE', 'WISP'],
};

// ---- classes: dogs guard and herd, cats watch and hunt. Each one is an ability that works from real chain numbers. ----
// fn names the report that does the work (see report.js).
const ROLES = {
  GUARD: { team: 'dog', fn: 'SENTRY', blurb: 'Guards the coin and barks if the dev wallet sells.' },
  SNIFFER: { team: 'dog', fn: 'HUNTER', blurb: 'Sniffs out the wallets that bought in the launch block.' },
  HERDER: { team: 'dog', fn: 'SCOUT', blurb: 'Keeps count of the holders and how the flock has changed.' },
  RETRIEVER: { team: 'dog', fn: 'COURIER', blurb: 'Fetches the coin’s records: its highs and how far it has come.' },
  NIGHTWATCH: { team: 'cat', fn: 'ANALYST', blurb: 'Watches the market cap through the night and notes every move.' },
  MOUSER: { team: 'cat', fn: 'WARDEN', blurb: 'Finds the weak spot: what a big sale would do to the curve.' },
  CURATOR: { team: 'cat', fn: 'ARCHIVIST', blurb: 'Keeps the milestone log, each one with the time it was reached.' },
  AUDITOR: { team: 'cat', fn: 'AUDITOR', blurb: 'Inspects the token itself: who can still mint or freeze.' },
};
const ABILITIES = {
  GUARD: { name: 'Dev Watch', fn: 'SENTRY', does: 'Watches the dev wallet and the top ten holders, and sounds the alarm if the dev’s share drops.' },
  SNIFFER: { name: 'Launch Block Scan', fn: 'HUNTER', does: 'Finds the wallets that bought in the same block as the launch or the next, and how much of the supply they hold now.' },
  HERDER: { name: 'Holder Radar', fn: 'SCOUT', does: 'Tracks how many wallets hold the coin and how that count has changed since the pet first looked.' },
  RETRIEVER: { name: 'Record Board', fn: 'COURIER', does: 'Keeps the coin’s records: its highest market cap, most holders and furthest curve progress, with when each was seen.' },
  NIGHTWATCH: { name: 'Cap Tracker', fn: 'ANALYST', does: 'Follows market cap against where it started and where it peaked, and shows how far it is from the high.' },
  MOUSER: { name: 'Sell Impact', fn: 'WARDEN', does: 'Uses the curve’s real reserves to work out what would happen if the dev or the biggest holder sold everything right now.' },
  CURATOR: { name: 'Milestone Log', fn: 'ARCHIVIST', does: 'Writes down the moment the coin first passes 25%, 50%, 75% and 90% of the curve, and when it graduates.' },
  AUDITOR: { name: 'Authority Audit', fn: 'AUDITOR', does: 'Reads the token itself and says whether its mint authority and freeze authority are revoked.' },
  FLAGSHIP: { name: 'Command Sweep', fn: 'FLAGSHIP', does: 'Runs every other pet’s ability on the coin at once and reports the headline from each.' },
};
const DOG_ROLES = Object.keys(ROLES).filter((k) => ROLES[k].team === 'dog');
const CAT_ROLES = Object.keys(ROLES).filter((k) => ROLES[k].team === 'cat');

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
const hash3 = (x, y, z) => (Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791, 2654435761) >>> 0) % 1000;

// ---- traits: the same look is never handed out twice in one set ----
const traitCache = new Map();
function traitsFor(slot, secret) {
  const ck = String(secret);
  let list = traitCache.get(ck);
  if (!list) { list = { rnd: prng(crypto.createHmac('sha256', ck).update('pets').digest()), items: [], seen: new Set(), names: new Set(), breeds: new Set() }; traitCache.set(ck, list); }
  while (list.items.length <= slot) {
    const idx = list.items.length, species = idx % 2 === 0 ? 'dog' : 'cat';
    let t, key, tries = 0;
    do {
      const bl = BREEDS[species], bk = pickW(Object.keys(bl).map((k) => [k, bl[k].w]), list.rnd())[0], br = bl[bk];
      const coat = br.coats[Math.floor(list.rnd() * br.coats.length)];
      const acc = pickW(br.ear === 'floppy' ? ACCS.floppy : ACCS.other, list.rnd())[0];
      t = { species, breed: bk, coat, acc, glow: pickW(GLOWS.map((a, i) => [i, a[2]]), list.rnd())[0], collar: Math.floor(list.rnd() * COLLARS.length), accColor: Math.floor(list.rnd() * COLLARS.length), bg: Math.floor(list.rnd() * 4), seed: Math.floor(list.rnd() * 1e9) };
      key = [species, bk, coat, acc, t.collar].join('|');
      tries++;
    } while ((list.seen.has(key) || (tries < 120 && list.breeds.has(species + t.breed) && list.breeds.size < Object.keys(BREEDS[species]).length * 2)) && tries < 200);
    list.seen.add(key); list.breeds.add(species + t.breed);
    let nm, nt = 0;
    const pool = NAMES[species];
    do { nm = pool[Math.floor(list.rnd() * pool.length)]; nt++; } while (list.names.has(nm) && nt < 200);
    list.names.add(nm);
    const roles = species === 'dog' ? DOG_ROLES : CAT_ROLES;
    t.name = nm; t.role = roles[Math.floor(list.rnd() * roles.length)];
    list.items.push(t);
  }
  return list.items[slot];
}
function agentFor(slot, secret) {
  const t = traitsFor(slot, secret), b = BREEDS[t.species][t.breed];
  return { name: t.name, role: t.role, team: t.species === 'dog' ? 'DOG' : 'CAT', blurb: ROLES[t.role].blurb, ability: ABILITIES[t.role], chassis: COATS[t.coat].name, breed: b.name, accessory: t.acc === 'none' ? null : t.acc };
}

// ---- the voxel grid ----
class Vox {
  constructor() { this.m = new Map(); this.g = 0; this.pv = { leg: 8, arm: 28 }; this.info = { pz: [16, 16], tailZ: 8 }; }
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
}

// ---- the pet ----
function buildPet(t, r) {
  const v = new Vox(), br = BREEDS[t.species][t.breed], C = COATS[t.coat], cat = t.species === 'cat', big = t.big ? 1 : 0;
  const hw = br.hw + big, bh = br.bh + big * 2, bl = br.bl + big * 2, L = br.leg + big * 2, lw = br.lw + (big && br.lw < 3 ? 1 : 0);
  const hhw = br.hhw + big, hs = br.hs + big, hh = br.hh + big, sn = br.sn, sw = Math.min(br.sw, hhw);
  const z0 = Math.max(4, 34 - bl - hs - sn), z1 = z0 + bl - 1, yTop = L + bh - 1;
  const hb = L + bh - 3, ht = hb + hh - 1, hz0 = z1 - 1, hz1 = hz0 + hs - 1;
  // legs: front right and back left swing together (groups 1 and 8), the others the other way (2 and 7)
  const lx0 = 16 + hw - lw, lx1 = 16 + hw - 1, fz0 = z1 - lw + 1, rz0 = z0;
  v.pv.leg = L;
  v.info.pz = [fz0 + (lw - 1) / 2, rz0 + (lw - 1) / 2];
  for (const [zz, gR, gL] of [[fz0, 1, 2], [rz0, 8, 7]]) {
    v.mb(lx0, 2, zz, lx1, L - 1, zz + lw - 1, 'leg', 0, gR, gL);
    v.mb(lx0, 0, zz, lx1, 1, zz + lw - 1 + (zz === fz0 ? 1 : 0), 'paw', 0, gR, gL);
    if (zz === rz0) v.mb(lx0 - 1, L - 4, zz, lx1, L, zz + lw, 'leg', 0, gR, gL); // the thigh
    else v.mb(lx0 - 1, L - 3, zz, lx1, L, zz + lw - 1, 'leg', 0, gR, gL);         // the shoulder
  }
  // body, belly and chest
  v.mb(16, L, z0, 16 + hw - 1, yTop, z1, 'body', 0);
  v.mb(16, L, z0, 16 + hw - 1, L, z1, 'belly', 0);
  v.mb(16, L, z1 - 1, 16 + hw - 1, hb - 1, z1, 'chest', 0);
  // head and muzzle
  v.mb(16, hb, hz0, 16 + hhw - 1, ht, hz1, 'head', 0);
  v.mb(16, ht, hz0, 16 + hhw - 1, ht, hz1, 'headTop', 0);
  const mh = cat ? 2 : 3;
  v.mb(16, hb, hz1 + 1, 16 + sw - 1, hb + mh - 1, hz1 + sn, 'muzzle', 0);
  if (cat) v.box(15, hb + 1, hz1 + 1, 16, hb + 1, hz1 + 1, 'nose', 0);
  else v.box(15, hb + mh - 1, hz1 + sn, 16, hb + mh - 1, hz1 + sn, 'nose', 0);
  // eyes: cats have glowing ones, dogs dark ones with a spark
  const ey = ht - 2, ex = 16 + Math.max(1, hhw - 2), ez = hz1;
  if (cat) v.mb(ex, ey, ez, ex, ey + 1, ez, 'eye', 1);
  else { v.mb(ex, ey, ez, ex, ey, ez, 'eyeDark', 0); v.mb(ex, ey + 1, ez, ex, ey + 1, ez, 'spark', 0); }
  if (!cat && C.pattern === 'mask') v.mb(ex, ey + 2, ez, ex, ey + 2, ez, 'brow', 0);
  if (cat) { v.mb(16 + hhw, hb + 1, hz1, 16 + hhw + 1, hb + 1, hz1, 'whisker', 0); }
  // ears
  const eo = 16 + hhw - 1, ezs = hz0 + 1;
  if (br.ear === 'cat') { v.mb(eo - 1, ht + 1, ezs, eo, ht + 2, ezs + 1, 'ear', 0); v.mb(eo, ht + 3, ezs, eo, ht + 3, ezs + 1, 'ear', 0); v.mb(eo - 1, ht + 1, ezs + 1, eo - 1, ht + 2, ezs + 1, 'earIn', 0); }
  else if (br.ear === 'point') { v.mb(eo - 1, ht + 1, ezs, eo, ht + 3, ezs + 1, 'ear', 0); v.mb(eo, ht + 4, ezs, eo, ht + 4, ezs + 1, 'ear', 0); v.mb(eo - 1, ht + 1, ezs + 1, eo - 1, ht + 2, ezs + 1, 'earIn', 0); }
  else if (br.ear === 'tall') { v.mb(eo - 1, ht + 1, ezs, eo, ht + 4, ezs + 1, 'ear', 0); v.mb(eo, ht + 5, ezs, eo, ht + 5, ezs + 1, 'ear', 0); v.mb(eo - 1, ht + 1, ezs + 1, eo - 1, ht + 3, ezs + 1, 'earIn', 0); }
  else if (br.ear === 'big') { v.mb(eo - 1, ht + 1, ezs, eo, ht + 4, ezs + 1, 'ear', 0); v.mb(eo - 1, ht + 5, ezs, eo - 1, ht + 5, ezs + 1, 'ear', 0); v.mb(eo - 1, ht + 1, ezs + 1, eo - 1, ht + 3, ezs + 1, 'earIn', 0); }
  else { v.mb(eo + 1, ht - 3, ezs, eo + 1, ht, ezs + 2, 'ear', 0); v.mb(eo + 1, ht - 4, ezs, eo + 1, ht - 4, ezs + 1, 'ear', 0); }
  // tail: its own swing group (9), so it can wag
  v.g = 9; v.info.tailZ = z0;
  const tb = yTop - 1;
  if (br.tail === 'cat') { v.box(15, tb, z0 - 3, 16, tb, z0 - 1, 'tail', 0); v.box(15, tb, z0 - 3, 16, tb + 5, z0 - 3, 'tail', 0); v.box(15, tb + 6, z0 - 3, 16, tb + 7, z0 - 3, 'tailTip', 0); v.box(15, tb + 5, z0 - 2, 16, tb + 5, z0 - 2, 'tailTip', 0); }
  else if (br.tail === 'curl') { v.box(15, tb, z0 - 1, 16, tb + 3, z0, 'tail', 0); v.box(15, tb + 3, z0 + 1, 16, tb + 3, z0 + 4, 'tail', 0); v.box(15, tb + 2, z0 + 3, 16, tb + 2, z0 + 3, 'tailTip', 0); }
  else if (br.tail === 'plume') { for (let i = 0; i < 6; i++) v.box(14, tb + (i >> 1), z0 - 1 - i, 17, tb + (i >> 1) + 1, z0 - 1 - i, i > 3 ? 'tailTip' : 'tail', 0); }
  else if (br.tail === 'wag') { for (let i = 0; i < 6; i++) v.box(15, tb - (i >> 2), z0 - 1 - i, 16, tb - (i >> 2) + 1, z0 - 1 - i, i > 4 ? 'tailTip' : 'tail', 0); }
  else v.box(15, tb, z0 - 1, 16, tb + 1, z0 - 1, 'tail', 0);
  v.g = 0;
  // collar with a glowing chain tag, then the accessory
  v.mb(16, L, z1 - 3, 16 + hw - 1, yTop, z1 - 3, 'collar', 0);
  v.box(15, L + 1, z1 + 1, 16, L + 2, z1 + 1, 'glow', 1);
  const acc = t.acc;
  if (acc === 'bandana') { v.mb(16, L, z1 - 4, 16 + hw - 1, yTop, z1 - 4, 'acc', 0); v.box(14, L + 3, z1 + 1, 17, L + 3, z1 + 1, 'acc', 0); v.box(15, L + 4, z1 + 1, 16, L + 4, z1 + 1, 'acc', 0); }
  else if (acc === 'shades') { v.mb(16, ey, hz1 + 1, 16 + hhw - 1, ey + 1, hz1 + 1, 'shade', 0); v.mb(ex, ey + 1, hz1 + 1, ex, ey + 1, hz1 + 1, 'glow', 1); }
  else if (acc === 'pack') { v.mb(16, yTop + 1, z0 + 3, 16 + hw - 2, yTop + 3, z0 + 8, 'pack', 0); v.mb(16, yTop + 3, z0 + 4, 16 + hw - 3, yTop + 3, z0 + 7, 'glow', 1); }
  else if (acc === 'cap') { v.mb(16, ht + 1, hz0, 16 + hhw - 1, ht + 1, hz1, 'acc', 0); v.mb(16, ht + 2, hz0 + 1, 16 + hhw - 2, ht + 2, hz1 - 1, 'acc', 0); v.mb(16, ht + 1, hz1 + 1, 16 + hhw - 1, ht + 1, hz1 + 2, 'acc', 0); }
  else if (acc === 'bowtie') { v.mb(15, hb - 1, hz1 - 1, 17, hb - 1, hz1 - 1, 'acc', 0); v.box(15, hb - 1, hz1 - 1, 16, hb - 1, hz1 - 1, 'glow', 1); }
  if (t.crown) { v.mb(16, ht + 1, hz0, 16 + hhw - 1, ht + 1, hz1, 'gold', 0); for (const x of [16, 18]) for (const z of [hz0, hz0 + 2, hz1]) { v.set(x, ht + 2, z, 'gold', 0); v.set(31 - x, ht + 2, z, 'gold', 0); } v.set(16, ht + 3, hz1, 'gem', 1); v.set(15, ht + 3, hz1, 'gem', 1); }
  v.layout = { L, yTop, z0, z1, hb, ht };
  return v;
}

// colours: each part of the pet is painted by the coat's pattern
function paintAll(v, t) {
  const C = COATS[t.coat], { yTop, z0, z1 } = v.layout, glow = GLOWS[t.glow][1], collar = COLLARS[t.collar], accC = COLLARS[t.accColor];
  const body = new Set(['body', 'leg', 'head', 'headTop', 'tail', 'ear', 'tailTip', 'paw', 'chest', 'belly', 'muzzle', 'brow']);
  for (const q of v.m.values()) {
    const p = q.c;
    let c;
    if (p === 'nose') c = t.species === 'cat' ? '#e89aa8' : '#1c1416';
    else if (p === 'eye') c = C.eye;
    else if (p === 'eyeDark') c = '#14100e';
    else if (p === 'spark') c = '#ffffff';
    else if (p === 'whisker') c = '#f4f4f6';
    else if (p === 'earIn') c = C.pattern === 'points' ? '#e8a8b0' : (t.species === 'cat' ? '#e8a8b0' : C.belly);
    else if (p === 'collar') c = collar;
    else if (p === 'acc') c = accC;
    else if (p === 'shade') c = '#101218';
    else if (p === 'pack') c = '#2f3541';
    else if (p === 'glow') c = glow;
    else if (p === 'gold') c = '#ffc84a';
    else if (p === 'gem') c = '#ff3b3b';
    else if (body.has(p)) {
      const isHead = p === 'head' || p === 'headTop';
      switch (C.pattern) {
        case 'solid': c = (p === 'belly' || p === 'chest' || p === 'muzzle') ? C.belly : C.base; break;
        case 'tabby': {
          const lite = p === 'belly' || p === 'chest' || p === 'muzzle' || p === 'paw';
          const stripe = p === 'headTop' ? q.x % 2 === 0 : p === 'tail' || p === 'tailTip' ? (q.z + q.y) % 3 === 0 : p === 'body' || p === 'leg' ? (q.z + (q.y >> 1)) % 4 === 0 : false;
          c = lite ? C.belly : stripe ? C.mark : C.base; break;
        }
        case 'tux': c = (p === 'belly' || p === 'chest' || p === 'paw' || p === 'muzzle') ? C.belly : C.base; break;
        case 'calico': {
          if (p === 'belly' || p === 'chest' || p === 'paw') { c = C.belly; break; }
          const h = hash3(q.x >> 1, q.y >> 1, q.z >> 1) % 100; c = h < 38 ? C.base : h < 70 ? C.alt : C.alt2; break;
        }
        case 'points': c = (p === 'belly' || p === 'chest') ? C.belly : (isHead || p === 'ear' || p === 'leg' || p === 'paw' || p === 'tail' || p === 'tailTip' || p === 'muzzle') ? C.mark : C.base; if (p === 'leg' && q.y > 5) c = C.base; break;
        case 'spots': c = (p === 'belly' || p === 'chest' || p === 'paw' || p === 'muzzle') ? C.base : p === 'ear' ? C.mark : (hash3(q.x, q.y, q.z) < 130 ? C.mark : C.base); break;
        case 'mask': c = (p === 'belly' || p === 'chest' || p === 'muzzle' || p === 'paw' || p === 'brow' || (p === 'tailTip')) ? C.belly : p === 'headTop' ? C.mark : (p === 'ear' && t.coat !== 'pug') ? C.base : p === 'ear' ? C.mark : C.base; if (t.coat === 'pug' && (p === 'muzzle' || isHead && q.z > z1 + 2)) c = C.mark; break;
        case 'saddle': c = (p === 'belly' || p === 'chest' || p === 'paw' || p === 'tailTip') ? C.belly : (p === 'ear' || (p === 'body' && q.y >= yTop - 1 && q.z > z0 + 2 && q.z < z1 - 3)) ? C.mark : C.base; break;
        default: c = C.base;
      }
    } else c = '#ff00ff';
    q.c = c;
  }
}

const mixHex = (hex, k) => { const n = parseInt(hex.slice(1, 7), 16); return '#' + [16, 8, 0].map((sh) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * k))).toString(16).padStart(2, '0')).join(''); };
function finish(v) {
  const palette = [], index = new Map(), cells = [];
  for (const q of v.m.values()) {
    let c = q.c;
    if (!q.e) { const h = Math.imul(q.x * 73856093 ^ q.y * 19349663 ^ q.z * 83492791, 2654435761) >>> 0; c = mixHex(c, 0.92 + (h % 1000) / 1000 * 0.14); }
    let pi = index.get(c); if (pi == null) { pi = palette.length; palette.push(c); index.set(c, pi); }
    cells.push([q.x, q.y, q.z, q.e + 2 * q.g, pi]);
  }
  cells.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
  return { pet: true, zoom: 0.62, w: W, h: H, d: D, cx: CX, cz: CZ, pivot: [v.pv.leg, v.pv.arm], pz: v.info.pz, tailZ: v.info.tailZ, gun: null, muz: [], palette, cells };
}
const modelCache = new Map();
function agentVoxels(slot, secret) {
  const key = String(secret) + ':' + slot;
  let m = modelCache.get(key);
  if (!m) {
    const t = traitsFor(slot, secret), r = prng(crypto.createHash('sha256').update(String(t.seed)).digest());
    const v = buildPet(t, r); paintAll(v, t);
    m = finish(v); m.scheme = BGS[t.species][t.bg]; m.glow = GLOWS[t.glow][1]; modelCache.set(key, m);
  }
  return m;
}

// ---- PRIME: the flagship. A big black cat with a gold crown, a gold collar and amber eyes. ----
let primeCache = null;
function founderVoxels() {
  if (primeCache) return primeCache;
  const t = { species: 'cat', breed: 'coon', coat: 'blackC', acc: 'none', glow: 2, collar: 3, accColor: 3, big: true, crown: true };
  const v = buildPet(t, () => 0.5);
  paintAll(v, t);
  for (const q of v.m.values()) { if (q.c === C_EYE_BLACK) q.c = '#ffb347'; }
  primeCache = finish(v); primeCache.scheme = '#2e2418'; primeCache.glow = '#ffb347';
  return primeCache;
}
const C_EYE_BLACK = COATS.blackC.eye;

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

// a paw print, as runs of cubes on a 64 x 64 grid, for the locked tiles and the logo
const inCircle = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const SHAPE_ON = (x, y) => inCircle(x, y, 32, 42, 15, 12) || inCircle(x, y, 14, 26, 6, 8) || inCircle(x, y, 26, 14, 6, 8) || inCircle(x, y, 38, 14, 6, 8) || inCircle(x, y, 50, 26, 6, 8);
function silhouette() {
  const runs = [];
  for (let y = 0; y < 64; y++) { let x = 0; while (x < 64) { if (!SHAPE_ON(x, y)) { x++; continue; } let n = 1; while (x + n < 64 && SHAPE_ON(x + n, y)) n++; runs.push([y, x, n]); x += n; } }
  return runs;
}

module.exports = { png, founderPng, silhouette, traitsFor, agentFor, agentVoxels, founderVoxels, ROLES, ABILITIES, COATS, BREEDS, GLOWS, W, H, D };
