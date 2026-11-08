'use strict';
// Draws one collectible spark as an SVG. Everything about an image comes from the slot number and a server secret,
// so the art can't be guessed or previewed before it is claimed. The owner's short address is printed on it.
const crypto = require('crypto');

const PALETTES = [
  { name: 'Ember', core: '#fff6e2', mid: '#ffc65c', tail: '#ff6a3d', bg: '#0d0b17', glow: '#2a1c34' },
  { name: 'Gold', core: '#fffbe8', mid: '#ffe27a', tail: '#ff9d2e', bg: '#100d12', glow: '#2c2416' },
  { name: 'Aqua', core: '#e8fffb', mid: '#5ee0d0', tail: '#2a7fff', bg: '#080e17', glow: '#10303a' },
  { name: 'Violet', core: '#f3eaff', mid: '#b08cff', tail: '#6a3dff', bg: '#0c0a18', glow: '#241a45' },
  { name: 'Rose', core: '#ffeaf0', mid: '#ff7aa8', tail: '#d12f6a', bg: '#130a12', glow: '#3a1a2c' },
  { name: 'Lime', core: '#f4ffe6', mid: '#b6f05a', tail: '#3da84a', bg: '#0a120b', glow: '#1d3320' },
  { name: 'Ice', core: '#ffffff', mid: '#9fd6ff', tail: '#4a86ff', bg: '#080d18', glow: '#16284a' },
  { name: 'Sunset', core: '#fff1dc', mid: '#ff9a5c', tail: '#c2185b', bg: '#140a10', glow: '#3d1a28' },
  { name: 'Mint', core: '#eafff4', mid: '#5ee0a0', tail: '#128f6a', bg: '#08130f', glow: '#133a2b' },
  { name: 'Moon', core: '#ffffff', mid: '#e6e6f0', tail: '#8d8aa8', bg: '#0b0b12', glow: '#232338' },
];

function prng(seedBytes) {
  let a = seedBytes.readUInt32LE(0) ^ seedBytes.readUInt32LE(4);
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// slot is 0-based. total is how many images exist. owner is the wallet address that holds it.
function render(slot, total, owner, secret) {
  const pal = PALETTES[slot % PALETTES.length];
  const rnd = prng(crypto.createHmac('sha256', String(secret)).update('slot:' + slot).digest());
  const streaks = [];
  const n = 24 + Math.floor(rnd() * 12);
  for (let i = 0; i < n; i++) {
    const angle = Math.round((i * 360) / n + (rnd() - 0.5) * 9);
    const scale = (0.42 + rnd() * 0.95).toFixed(2);
    streaks.push('<use href="#' + (rnd() < 0.5 ? 'sa' : 'sb') + '" transform="translate(200 190) rotate(' + angle + ' ) scale(' + scale + ')"/>');
  }
  const dots = [];
  const d = 8 + Math.floor(rnd() * 8);
  for (let i = 0; i < d; i++) {
    const ang = rnd() * Math.PI * 2, r = 120 + rnd() * 70;
    const x = (200 + Math.cos(ang) * r).toFixed(1), y = (190 + Math.sin(ang) * r).toFixed(1);
    dots.push('<circle cx="' + x + '" cy="' + y + '" r="' + (1 + rnd() * 2.2).toFixed(1) + '" fill="' + (rnd() < 0.5 ? pal.mid : pal.tail) + '" opacity="' + (0.5 + rnd() * 0.4).toFixed(2) + '"/>');
  }
  const short = owner ? owner.slice(0, 4) + '…' + owner.slice(-4) : '';
  const num = String(slot + 1).padStart(2, '0');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440" width="1024" height="1126" role="img" aria-label="Spark ' + num + ' of ' + total + '">'
    + '<defs>'
    + '<radialGradient id="bg" cx="0.5" cy="0.43" r="0.75"><stop offset="0" stop-color="' + pal.glow + '"/><stop offset="0.6" stop-color="' + pal.bg + '"/><stop offset="1" stop-color="#05040a"/></radialGradient>'
    + '<linearGradient id="tail" gradientUnits="userSpaceOnUse" x1="0" y1="-24" x2="0" y2="-100"><stop offset="0" stop-color="' + pal.tail + '" stop-opacity="0"/><stop offset="0.45" stop-color="' + pal.tail + '" stop-opacity="0.55"/><stop offset="0.85" stop-color="' + pal.mid + '"/><stop offset="1" stop-color="' + pal.core + '"/></linearGradient>'
    + '<path id="sa" fill="url(#tail)" d="M-0.3,-24 C-1.6,-58 -2.6,-84 -2.2,-98 A2.2,2.2 0 0 1 2.2,-98 C2.6,-84 1.4,-58 0.3,-24 Z"/>'
    + '<path id="sb" fill="url(#tail)" d="M-0.3,-24 C1.0,-58 2.4,-84 2.2,-98 A2.2,2.2 0 0 0 -2.2,-98 C-2.6,-84 -1.4,-58 0.3,-24 Z" transform="scale(-1,1)"/>'
    + '<radialGradient id="core" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff"/><stop offset="0.22" stop-color="' + pal.core + '"/><stop offset="0.5" stop-color="' + pal.mid + '" stop-opacity="0.9"/><stop offset="0.8" stop-color="' + pal.tail + '" stop-opacity="0.45"/><stop offset="1" stop-color="' + pal.tail + '" stop-opacity="0"/></radialGradient>'
    + '<filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>'
    + '</defs>'
    + '<rect width="400" height="440" fill="url(#bg)"/>'
    + '<circle cx="200" cy="190" r="100" fill="url(#core)" opacity="0.5" filter="url(#bloom)"/>'
    + streaks.join('')
    + dots.join('')
    + '<circle cx="200" cy="190" r="20" fill="url(#core)"/><circle cx="200" cy="190" r="7" fill="#fff"/>'
    + '<text x="200" y="392" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="17" letter-spacing="3" fill="' + pal.mid + '">SPARK ' + num + ' / ' + total + ' · ' + esc(pal.name.toUpperCase()) + '</text>'
    + (short ? '<text x="200" y="414" text-anchor="middle" font-family="Courier New, monospace" font-size="12" fill="#9d96bc">held by ' + esc(short) + '</text>' : '')
    + '</svg>';
}

module.exports = { render, PALETTES };
