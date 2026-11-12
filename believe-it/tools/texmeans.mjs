// mean / std colour of the current hi-res texture twins -> qa/texmeans.json (calibration targets for the photo textures)
import * as TX from '../src/scenes/farm_tex.js';
import * as TX2 from '../src/scenes/farm_tex2.js';
import { snowTex, plankTex } from '../src/scenes/yard.js';
import { hiOf } from '../src/engine/util.js';
import fs from 'fs';
const L = { wash: () => TX.whitewash(), washI: () => TX.whitewash(true), stone: TX2.stone, roof: TX.rooftile, floor: TX.floorboard, wood: TX.wood, flag: TX.flagstone, brick: TX.brick,
  hay: TX.hay, mud: TX.mud, grass: TX.grass, snow: snowTex, plank: plankTex, bark: TX2.bark, burlap: TX.burlap, iron: TX2.iron };
const out = {};
for (const [k, fn] of Object.entries(L)) {
  const hi = hiOf(fn()), d = hi.image.data, n = hi.image.width * hi.image.height;
  const m = [0, 0, 0], s = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { m[c] += d[i * 4 + c]; s[c] += d[i * 4 + c] ** 2; }
  out[k] = { mean: m.map((v) => +(v / n).toFixed(1)), std: s.map((v, c) => +Math.sqrt(v / n - (m[c] / n) ** 2).toFixed(1)), size: [hi.image.width, hi.image.height] };
}
fs.writeFileSync('qa/texmeans.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
