'use strict';
// Builds petpad/index.html: the PetPad concept page, with its 40 sample bears drawn into it.
// Run: node petpad/build.js   (no dependencies)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const art = require('./bear_art.js');
const dir = __dirname;
const SECRET = 'petpad-demo';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const puri = (png) => 'data:image/png;base64,' + png.toString('base64');
const wallet = (i) => { const h = crypto.createHash('sha256').update('w' + i).digest(); const s = Array.from(h.slice(0, 8), (b) => B58[b % 58]).join(''); return s.slice(0, 4) + '…' + s.slice(4); };

const claimed = new Set();
for (let i = 0; claimed.size < 26; i++) claimed.add(crypto.createHash('sha256').update('c' + i).digest()[0] % 40);

const rendered = Array.from({ length: 40 }, (_, i) => art.render(i, SECRET));
const pets = rendered.map((r, i) => {
  const t = r.traits;
  return { n: i + 1, coat: art.label(t), eyes: t.eyes === 'zzz' ? 'sleeping eyes' : t.eyes + ' eyes', mouth: t.mouth, acc: t.acc === 'none' ? 'no extras' : t.acc, bg: t.bg, rarity: 'Common', owner: claimed.has(i) ? wallet(i) : null, img: puri(r.png) };
});
// Rarity by rank within the set: rarest 2 Legendary, next 6 Rare, next 14 Uncommon, rest Common.
rendered.map((r, i) => i).sort((a, b) => rendered[a].traits.p - rendered[b].traits.p)
  .forEach((idx, rank) => { pets[idx].rarity = rank < 2 ? 'Legendary' : rank < 8 ? 'Rare' : rank < 22 ? 'Uncommon' : 'Common'; });

const data = { pets, sil: puri(art.silhouette().png), cat: puri(fs.readFileSync(path.join(dir, 'samples/cat.png'))), frog: puri(fs.readFileSync(path.join(dir, 'samples/frog.png'))) };
const tpl = fs.readFileSync(path.join(dir, 'template.html'), 'utf8').replace('/*DATA*/null', JSON.stringify(data)).replace('/*BUILD*/', 'pixel-64');
// The template starts with <title>, <meta>, <link> and a <style> block, then the page body.
const cut = tpl.indexOf('</style>') + '</style>'.length;
const html = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  + tpl.slice(0, cut).replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, '') + '\n</head>\n<body>\n' + tpl.slice(cut) + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(dir, 'index.html'), html);
console.log('petpad/index.html', Math.round(html.length / 1024) + ' KB');
