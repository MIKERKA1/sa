// Texture atlas: every farm texture (hi twin), 2x2 repeat, labelled -> qa/v4/atlas.png
import * as TX from '../src/scenes/farm_tex.js';
import { snowTex, plankTex, treelineTex, endsTex, barkTex, ringTex } from '../src/scenes/yard.js';
import * as TX2 from '../src/scenes/farm_tex2.js';
import { hiOf } from '../src/engine/util.js';
import sharp from 'sharp';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const L = { wash: () => TX.whitewash(), washI: () => TX.whitewash(true), stone: TX.stone, roof: TX.rooftile, board: TX.floorboard, wood: TX.wood, flag: TX.flagstone, brick: TX.brick,
  kachel: TX.kachel, hay: TX.hay, mud: TX.mud, grass: TX.grass, linen: TX.linen, checkB: TX.checkBlue, checkR: TX.checkRed, hide: TX.hide, iron: TX.iron, needle: TX.needleDark,
  paint: TX.paintedPanel, holy: TX.holyPicture, print: TX.printed, clock: TX.clockFace, dung: TX.dung, wicker: TX.wicker, burlap: TX.burlap, strawC: TX.strawCard,
  brass: TX.brass, ceramic: TX.ceramic, stoneware: TX.stoneware, earthen: TX.earthen, enamel: TX.enamel, preserve: TX.preserve, rope: TX.rope, grain: TX.grain, machine: TX.machine,
  leather: TX.leather, feather: TX.feather, snow: snowTex, plank: plankTex, ends: endsTex, bark: barkTex, ring: ringTex };
for (const k of Object.keys(TX)) if (/^[a-z]/.test(k) && typeof TX[k] === 'function' && !Object.values(L).includes(TX[k]) && !['whitewash', 'checkBlue', 'checkRed', 'groundMask', 'shaft', 'puff'].includes(k)) L[k] = TX[k];
for (const k of Object.keys(TX2)) if (k !== 'checkBlue' && k !== 'checkRed') L[k === 'holyPicture' ? 'holy' : k] = TX2[k];
L.checkB = TX2.checkBlue; L.checkR = TX2.checkRed;
const S = 220, tiles = [];
for (const [name, fn] of Object.entries(L)) {
  if (only && !only.includes(name)) continue;
  let lo; try { lo = fn(); } catch (e) { console.log('skip', name, e.message); continue; }
  const hi = hiOf(lo) || lo, im = hi.image;
  const raw = await sharp(Buffer.from(im.data.buffer, im.data.byteOffset, im.data.length), { raw: { width: im.width, height: im.height, channels: 4 } }).png().toBuffer();
  const one = await sharp(raw).resize(S, Math.round(S * im.height / im.width), { kernel: 'lanczos3' }).png().toBuffer();
  const h1 = Math.round(S * im.height / im.width);
  const two = await sharp({ create: { width: S * 2, height: h1 * 2, channels: 4, background: '#000' } }).composite([{ input: one, left: 0, top: 0 }, { input: one, left: S, top: 0 }, { input: one, left: 0, top: h1 }, { input: one, left: S, top: h1 }]).png().toBuffer();
  const lab = Buffer.from(`<svg width="${S * 2}" height="22"><rect width="100%" height="100%" fill="#222"/><text x="6" y="16" font-size="15" fill="#fff" font-family="Arial">${name} ${im.width}x${im.height}</text></svg>`);
  tiles.push({ name, buf: await sharp({ create: { width: S * 2, height: Math.min(h1 * 2, S * 2) + 22, channels: 4, background: '#111' } }).composite([{ input: lab, left: 0, top: 0 }, { input: await sharp(two).extract({ left: 0, top: 0, width: S * 2, height: Math.min(h1 * 2, S * 2) }).toBuffer(), left: 0, top: 22 }]).png().toBuffer() });
}
const C = only ? Math.min(tiles.length, 4) : 6, CW = S * 2 + 8, CH = S * 2 + 30, R = Math.ceil(tiles.length / C);
const comp = tiles.map((t, i) => ({ input: t.buf, left: (i % C) * CW, top: Math.floor(i / C) * CH }));
await sharp({ create: { width: C * CW, height: R * CH, channels: 4, background: '#000' } }).composite(comp).jpeg({ quality: 85 }).toFile(process.argv[3] || 'qa/v4/atlas.jpg');
console.log('ok', tiles.length);
