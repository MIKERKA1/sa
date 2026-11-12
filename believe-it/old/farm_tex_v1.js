// "Believe It" — Hinterkaifeck farmstead textures. Every texture is a small nearest-filtered pixel canvas (retro look)
// with a hand-written 256-512 px twin for the enhanced look (registered through setHiTex, built lazily).
import * as THREE from 'three';
import { PixelCanvas, valueNoise, rng, mixc, mulc, clamp, hiTexture, setHiTex } from '../engine/util.js';

const fbm = (n, x, y, o = 3) => { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; } return s / t; };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const cl = (c) => c.map((v) => clamp(v, 0, 255));
// one texture = generator run at two sizes; S is the size of the lo canvas, K the hi multiplier
function twin(gen, w, h, k, repeat = true, alpha = false) {
  const make = (s) => { const pc = new PixelCanvas(w * s, h * s); gen(pc, s); return pc; };
  const lo = make(1).texture(repeat);
  setHiTex(lo, () => hiTexture(make(k), repeat));
  return lo;
}

/* limewashed masonry, tile 2 m: dirty white, rain streaks, a few flaked patches showing grey plaster.
   clean = indoor plaster: same lime white, fainter streaks, only rare small flakes */
export const whitewash = (clean = false) => twin((pc, s) => {
  const W = pc.w, n = valueNoise(clean ? 211 : 201, 8, 8), m = valueNoise(clean ? 212 : 202, 16, 16), st = valueNoise(203, 32, 4), f = valueNoise(204, 64, 64), r = rng(205);
  const th = clean ? 0.76 : 0.71;
  pc.each((x, y) => {
    const u = x / W, v = y / W;
    let c = mixc(clean ? [226, 220, 206] : [222, 216, 202], clean ? [206, 199, 184] : [198, 192, 178], fbm(n, u * 8, v * 8));
    c = mulc(c, 0.965 + (fbm(m, u * 16, v * 16) - 0.5) * 0.1 + (f(u * 64, v * 64) - 0.5) * 0.05 * (s > 1 ? 1 : 0.4));
    const streak = st(u * 32, v * 4 + n(u * 8, 0) * 2);
    if (streak > 0.62) c = mixc(c, [176, 168, 152], (streak - 0.62) * (clean ? 0.5 : 1.0));
    const flake = fbm(m, u * 16 + 5, v * 16 + 3, 3);
    if (flake > th) c = mixc([176, 168, 154], [158, 150, 138], f(u * 64, v * 64)); else if (flake > th - 0.02) c = mulc(c, 0.86);
    pc.set(x, y, cl(mulc(c, 0.985 + (r() - 0.5) * 0.03)));
  });
}, 64, 64, 8);

/* fieldstone plinth / cellar / well masonry, tile 1.2 m */
export const stone = () => twin((pc, s) => {
  const W = pc.w, r = rng(211), n = valueNoise(212, 16, 16);
  const rows = 6, rowH = W / rows, stones = [];
  for (let j = 0; j < rows; j++) { let x = r() * 8 * s; while (x < W + 12 * s) { const w = (6 + r() * 7) * s; stones.push({ j, x0: x, x1: x + w, t: 0.75 + r() * 0.4, hue: r() }); x += w; } }
  pc.each((x, y) => {
    const j = Math.floor(y / rowH), ly = y - j * rowH;
    let c = mulc([150, 146, 136], 0.9 + n(x / (4 * s), y / (4 * s)) * 0.2); // mortar
    for (const S of stones) {
      if (S.j !== j) continue;
      const xx = x < S.x0 ? x + W : x;
      if (xx >= S.x0 + 0.8 * s && xx < S.x1 - 0.8 * s && ly > 0.8 * s && ly < rowH - 0.8 * s) {
        const e = Math.min(xx - S.x0, S.x1 - xx, ly, rowH - ly) / s;
        c = mulc(mixc([118, 114, 106], [102, 94, 84], S.hue), S.t * (0.86 + n(x / (2 * s), y / (2 * s)) * 0.28) * (e < 2 ? 0.82 + e * 0.09 : 1));
      }
    }
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.06)));
  });
}, 32, 32, 8);

/* beaver-tail clay roof tiles (Biberschwanz), tile 1 m x 1 m along the slope: 6 rows x 6 tiles, staggered */
export const rooftile = () => twin((pc, s) => {
  const W = pc.w, T = W / 6, r = rng(221), n = valueNoise(222, 16, 16), m = valueNoise(223, 32, 32);
  const tone = Array.from({ length: 36 }, () => [0.8 + r() * 0.35, r()]);
  pc.each((x, y) => {
    const row = Math.floor(y / T), ox = row % 2 ? T / 2 : 0, col = Math.floor(((x + ox) % W) / T), id = row * 6 + col;
    const lx = ((x + ox) % T) / T, ly = (y % T) / T; // ly = 0 at the lower (rounded) edge
    const [t, h] = tone[id];
    let c = mixc([150, 74, 50], [118, 66, 50], h);
    c = mulc(c, t * (0.9 + (n(x / (2 * s), y / (2 * s)) - 0.5) * 0.25));
    const round = Math.hypot((lx - 0.5) * 2, Math.max(0, 0.35 - ly) / 0.35);
    if (ly < 0.35 && round > 1.0) c = mulc([70, 40, 32], 0.8); // gap under the rounded tail shows the row below in shadow
    else if (ly < 0.12) c = mulc(c, 0.78 + ly * 1.6);
    if (ly > 0.82) c = mulc(c, 0.7 + (1 - ly) * 1.4); // overlap shadow from the row above
    if (lx < 0.035 || lx > 0.965) c = mulc(c, 0.6);
    const moss = fbm(m, x / (8 * s), y / (8 * s));
    if (moss > 0.62) c = mixc(c, [88, 92, 62], (moss - 0.62) * 2.4);
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.06)));
  });
}, 48, 48, 8);

/* interior floorboards, tile 1 m: 5 boards running along v, worn lighter in the middle, dark gaps */
export const floorboard = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, NB = 5, r = rng(231), g = valueNoise(232, 64, 8), f = valueNoise(233, 16, 16);
  const B = Array.from({ length: NB }, () => ({ t: 0.82 + r() * 0.3, j: Math.floor(r() * H) }));
  pc.each((x, y) => {
    const fb = (x / W) * NB, b = Math.floor(fb), u = fb - b, bb = B[b];
    let c = mulc([132, 98, 68], bb.t * (0.88 + (g(x / (2 * s), y / (16 * s)) - 0.5) * 0.4 + (f(x / (4 * s), y / (4 * s)) - 0.5) * 0.12));
    c = mulc(c, 1 + Math.sin(u * Math.PI) * 0.06);
    const e = Math.min(u, 1 - u) * (W / NB) / s;
    if (e < 0.7) c = [40, 30, 22]; else if (e < 1.6) c = mulc(c, 0.78);
    const jd = Math.abs(((y - bb.j + H) % H)) / s;
    if (jd < 0.8) c = mulc(c, 0.5);
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.05)));
  });
}, 32, 64, 8);

/* planed wood for furniture and beams, grain along u, tile 1 m */
export const wood = () => twin((pc, s) => {
  const r = rng(241), g = valueNoise(242, 4, 64), f = valueNoise(243, 16, 16);
  pc.each((x, y) => {
    const v = g(x / (8 * s), y / (0.5 * s) + f(x / (4 * s), y / (4 * s)) * 1.5);
    let c = mixc([118, 86, 58], [146, 110, 76], v);
    if (v < 0.25) c = mulc(c, 0.82);
    pc.set(x, y, cl(mulc(c, 0.96 + (r() - 0.5) * 0.05)));
  });
}, 32, 32, 8);

/* stone flags (hallway, kitchen), tile 2 m */
export const flagstone = () => twin((pc, s) => {
  const W = pc.w, r = rng(251), n = valueNoise(252, 16, 16), m = valueNoise(253, 64, 64);
  const rows = 4, rh = W / rows, slabs = [];
  for (let j = 0; j < rows; j++) { let x = r() * 10 * s; while (x < W + 20 * s) { const w = (10 + r() * 10) * s; slabs.push({ j, x0: x, x1: x + w, t: 0.8 + r() * 0.3, h: r() }); x += w; } }
  pc.each((x, y) => {
    const j = Math.floor(y / rh), ly = y - j * rh;
    let c = [58, 54, 50];
    for (const S of slabs) {
      if (S.j !== j) continue;
      const xx = x < S.x0 ? x + W : x;
      if (xx >= S.x0 + 0.7 * s && xx < S.x1 - 0.7 * s && ly > 0.7 * s && ly < rh - 0.7 * s) {
        c = mulc(mixc([142, 138, 128], [124, 118, 108], S.h), S.t * (0.88 + (fbm(n, x / (6 * s), y / (6 * s)) - 0.5) * 0.3 + (m(x / s, y / s) - 0.5) * 0.06));
        const e = Math.min(xx - S.x0, S.x1 - xx, ly, rh - ly) / s;
        if (e < 1.8) c = mulc(c, 0.8 + e * 0.1);
      }
    }
    pc.set(x, y, cl(c));
  });
}, 64, 64, 8);

/* bricks, tile 1 m: 4 per row, 14 rows, lime mortar */
export const brick = () => twin((pc, s) => {
  const W = pc.w, r = rng(261), n = valueNoise(262, 16, 16), rows = 14, rh = W / rows;
  const tone = Array.from({ length: rows * 4 }, () => [0.78 + r() * 0.34, r()]);
  pc.each((x, y) => {
    const j = Math.floor(y / rh), ox = j % 2 ? W / 8 : 0, i = Math.floor(((x + ox) % W) / (W / 4)), lx = ((x + ox) % (W / 4)) / s, ly = (y % rh) / s;
    const [t, h] = tone[j * 4 + i];
    let c = mulc(mixc([150, 72, 50], [120, 60, 46], h), t * (0.9 + (n(x / (2 * s), y / (2 * s)) - 0.5) * 0.25));
    if (lx < 0.9 || ly < 0.9) c = mulc([176, 168, 152], 0.9 + n(x / s, y / s) * 0.15);
    pc.set(x, y, cl(c));
  });
}, 64, 64, 4);

/* green glazed stove tiles (Kachelofen), tile 0.4 m = 2 x 2 tiles with a sunken rosette */
export const kachel = () => twin((pc, s) => {
  const W = pc.w, T = W / 2, r = rng(271), n = valueNoise(272, 8, 8);
  pc.each((x, y) => {
    const lx = (x % T) / T - 0.5, ly = (y % T) / T - 0.5, e = 0.5 - Math.max(Math.abs(lx), Math.abs(ly)), d = Math.hypot(lx, ly);
    let c = mixc([46, 92, 66], [70, 122, 88], n(x / (4 * s), y / (4 * s)));
    if (e < 0.03) c = [120, 116, 100]; // grout
    else if (e < 0.09) c = mulc(c, ly > 0 ? 1.25 : 0.72); // bevel catches the light from above
    const ring = Math.abs(d - 0.24);
    if (ring < 0.03) c = mulc(c, 1.2); else if (d < 0.21 && d > 0.08) c = mulc(c, 0.82);
    if (d < 0.06) c = mulc(c, 1.15);
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.05)));
  });
}, 32, 32, 8);

/* straw / hay, tile 1 m: tangled strands */
export const hay = () => twin((pc, s) => {
  const W = pc.w, r = rng(281), n = valueNoise(282, 8, 8);
  pc.each((x, y) => pc.set(x, y, cl(mulc([150, 120, 70], 0.75 + n(x / (8 * s), y / (8 * s)) * 0.3))));
  const N = 900 * s * s;
  for (let i = 0; i < N; i++) {
    const x = r() * W, y = r() * W, a = r() * Math.PI, L = (3 + r() * 9) * s, t = r();
    const c = t < 0.2 ? [96, 76, 44] : t < 0.75 ? [196, 166, 102] : [226, 200, 134];
    pc.line(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.6, c, 0.85);
  }
}, 64, 64, 4);

/* yard mud, tile 3 m: wet dark soil, clods, small stones */
export const mud = () => twin((pc, s) => {
  const W = pc.w, r = rng(291), n = valueNoise(292, 16, 16), m = valueNoise(293, 64, 64);
  pc.each((x, y) => {
    const v = fbm(n, x / (4 * s), y / (4 * s));
    let c = mixc([58, 46, 36], [96, 78, 58], v);
    c = mulc(c, 0.9 + (m(x / s, y / s) - 0.5) * 0.2);
    if (m(x / (0.5 * s) + 3, y / (0.5 * s)) > 0.86) c = mixc(c, [128, 120, 108], 0.7);
    pc.set(x, y, cl(mulc(c, 0.96 + (r() - 0.5) * 0.08)));
  });
}, 64, 64, 4);

/* dead winter grass of the fields, tile 3 m: flattened ochre-brown blades */
export const grass = () => twin((pc, s) => {
  const W = pc.w, r = rng(301), n = valueNoise(302, 8, 8);
  pc.each((x, y) => pc.set(x, y, cl(mixc([84, 72, 52], [116, 100, 70], fbm(n, x / (8 * s), y / (8 * s))))));
  const N = 1200 * s * s, dir = 0.6;
  for (let i = 0; i < N; i++) {
    const x = r() * W, y = r() * W, a = dir + (r() - 0.5) * 1.4, L = (2 + r() * 6) * s, t = r();
    const c = t < 0.25 ? [62, 54, 40] : t < 0.8 ? [138, 118, 80] : [168, 150, 106];
    pc.line(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, c, 0.7);
  }
}, 64, 64, 4);

/* linen / canvas weave (bedding, sacks, tarp, curtains — tinted by vertex colour), tile 0.5 m */
export const linen = () => twin((pc, s) => {
  const r = rng(311), n = valueNoise(312, 8, 8);
  pc.each((x, y) => {
    const w = ((x + y) % 2 === 0 ? 1.03 : 0.97);
    pc.set(x, y, cl(mulc([222, 216, 204], w * (0.92 + n(x / (4 * s), y / (4 * s)) * 0.12) + (r() - 0.5) * 0.04)));
  });
}, 32, 32, 4);

/* checked bedding (blue / red), tile 0.4 m */
const check = (seed, col) => () => twin((pc, s) => {
  const W = pc.w, r = rng(seed), q = W / 8;
  pc.each((x, y) => {
    const a = Math.floor(x / q) % 2, b = Math.floor(y / q) % 2;
    let c = a && b ? col : a || b ? mixc(col, [232, 228, 218], 0.55) : [232, 228, 218];
    pc.set(x, y, cl(mulc(c, 0.95 + (r() - 0.5) * 0.06)));
  });
}, 32, 32, 4);
export const checkBlue = check(321, [70, 96, 150]);
export const checkRed = check(322, [160, 58, 52]);

/* Fleckvieh cow hide: red-brown with white patches, tile 1 m */
export const hide = () => twin((pc, s) => {
  const r = rng(331), n = valueNoise(332, 4, 4), m = valueNoise(333, 32, 32);
  pc.each((x, y) => {
    const p = fbm(n, x / (8 * s), y / (8 * s), 3) + (m(x / s, y / s) - 0.5) * 0.06;
    let c = p > 0.55 ? [226, 214, 196] : mulc([140, 78, 46], 0.85 + m(x / (2 * s), y / (2 * s)) * 0.3);
    if (Math.abs(p - 0.55) < 0.012) c = mixc(c, [180, 140, 110], 0.5);
    pc.set(x, y, cl(mulc(c, 0.96 + (r() - 0.5) * 0.06)));
  });
}, 32, 32, 8);

/* iron: dark grey with rust bloom, tile 0.5 m */
export const iron = () => twin((pc, s) => {
  const r = rng(341), n = valueNoise(342, 8, 8), m = valueNoise(343, 32, 32);
  pc.each((x, y) => {
    let c = mulc([70, 70, 72], 0.85 + n(x / (4 * s), y / (4 * s)) * 0.3);
    const rust = fbm(m, x / (2 * s), y / (2 * s));
    if (rust > 0.58) c = mixc(c, [120, 66, 38], (rust - 0.58) * 2.5);
    pc.set(x, y, cl(mulc(c, 0.95 + (r() - 0.5) * 0.08)));
  });
}, 16, 16, 8);

/* spruce needles without snow (late March), tile as in the yard */
export const needleDark = () => twin((pc, s) => {
  const S = pc.w, n = valueNoise(351, 8, 8), h = valueNoise(352, 64, 64), d = valueNoise(353, 32, 32);
  pc.each((x, y) => {
    const u = x / S * 256, v = y / S * 256;
    const tuft = h((u + v * 0.6) / 4, (v - u * 0.6) / 4) * 0.6 + h((u - v * 0.6) / 4 + 9, (v + u * 0.6) / 4) * 0.4;
    const k = 0.7 + (n(u / 32, v / 32) - 0.5) * 0.5 + (tuft - 0.5) * 0.6 + (d(u / 8, v / 8) - 0.5) * 0.2;
    pc.set(x, y, cl(mulc([34, 50, 40], k)));
  });
}, 32, 32, 8);

/* window glass: faint dirt, mostly see-through (alpha); 6 panes are separate geometry bars */
export const glass = () => twin((pc, s) => {
  const r = rng(361), n = valueNoise(362, 8, 8);
  pc.each((x, y) => { const d = fbm(n, x / (4 * s), y / (4 * s)); pc.set(x, y, cl(mixc([150, 162, 172], [190, 196, 196], d)), Math.round(60 + d * 70 + (y / pc.h) * 30 + (r() - 0.5) * 6)); });
}, 16, 16, 8, false);

/* painted farmhouse wardrobe door: blue-green field, red / white flower bunch, ochre frame. u 0..1 x v 0..1 */
export const paintedPanel = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(371), n = valueNoise(372, 8, 8);
  pc.each((x, y) => {
    const u = x / W, v = y / H;
    let c = mulc([62, 92, 96], 0.9 + n(x / (4 * s), y / (4 * s)) * 0.2);
    const fr = Math.min(u, 1 - u, (v) * 0.5, (1 - v) * 0.5);
    if (fr < 0.06) c = mulc([150, 118, 70], 0.9 + n(x / s, y / s) * 0.15);
    else if (fr < 0.08) c = [40, 34, 28];
    const cx = 0.5, cy = 0.55, du = (u - cx) * 2.2, dv = (v - cy) * 1.1;
    for (const [fx, fy, rr, col] of [[0, 0.06, 0.13, [176, 52, 44]], [-0.2, -0.04, 0.09, [214, 200, 170]], [0.2, -0.04, 0.09, [214, 200, 170]], [0, -0.14, 0.08, [190, 130, 60]], [-0.12, 0.18, 0.07, [176, 52, 44]], [0.12, 0.18, 0.07, [176, 52, 44]]]) {
      const d = Math.hypot(du - fx, dv - fy);
      if (d < rr) c = mulc(col, 0.85 + (1 - d / rr) * 0.25);
    }
    if (Math.abs(du) < 0.02 && dv < -0.1 && dv > -0.32) c = [70, 96, 52];
    if (Math.abs(Math.abs(du) - (-dv - 0.12) * 0.8) < 0.025 && dv < -0.15 && dv > -0.3) c = [70, 96, 52];
    pc.set(x, y, cl(mulc(c, 0.96 + (r() - 0.5) * 0.05)));
  });
}, 16, 32, 8, false);

/* framed holy picture (sepia saint under glass). u, v 0..1 */
export const holyPicture = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, n = valueNoise(381, 8, 8);
  pc.each((x, y) => {
    const u = x / W, v = y / H, fr = Math.min(u, 1 - u, v, 1 - v);
    let c = mixc([178, 150, 108], [140, 112, 80], n(x / (2 * s), y / (2 * s)));
    const fig = Math.hypot((u - 0.5) * 2.4, (v - 0.68) * 3.2) < 0.32 || (Math.abs(u - 0.5) < 0.18 + (0.6 - v) * 0.25 && v < 0.6 && v > 0.14);
    if (fig) c = mixc([90, 60, 50], [120, 40, 40], v < 0.6 ? 0.5 : 0);
    if (Math.hypot((u - 0.5) * 2.4, (v - 0.68) * 3.2) < 0.42 && !fig) c = mixc(c, [214, 180, 96], 0.6); // halo
    if (fr < 0.1) c = mulc([64, 44, 30], 0.9 + n(x / s, y / s) * 0.2);
    pc.set(x, y, cl(c));
  });
}, 16, 24, 8, false);

/* printed paper (newspaper / wall calendar): lines of type. u, v 0..1 */
export const printed = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(391), n = valueNoise(392, 8, 8);
  pc.each((x, y) => {
    const v = y / H, u = x / W;
    let c = mulc([214, 204, 178], 0.94 + n(x / (4 * s), y / (4 * s)) * 0.1);
    if (v > 0.86 && v < 0.95 && u > 0.1 && u < 0.9) c = mulc(c, (Math.floor(x / s) % 3 === 0 ? 0.35 : 0.85)); // masthead
    const line = (y / s) % 3;
    if (v < 0.82 && v > 0.06 && line < 1 && u > 0.06 && u < 0.94 && Math.abs(u - 0.5) > 0.015 && r() > 0.25) c = mulc(c, 0.55);
    pc.set(x, y, cl(c));
  });
}, 32, 48, 4, false);

/* clock face */
export const clockFace = () => twin((pc, s) => {
  const W = pc.w;
  pc.each((x, y) => {
    const u = x / W - 0.5, v = y / W - 0.5, d = Math.hypot(u, v), a = Math.atan2(v, u);
    let c = [226, 218, 196];
    if (d > 0.46) c = [90, 70, 40];
    const tick = Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.46 && d > 0.36 && d < 0.43;
    if (tick) c = [30, 26, 22];
    pc.set(x, y, c);
  });
}, 16, 16, 8, false);

/* soft round puff (chimney smoke) and light shaft gradient, alpha textures */
export const puff = () => twin((pc, s) => {
  const W = pc.w, n = valueNoise(401, 4, 4);
  pc.each((x, y) => { const u = x / W - 0.5, v = y / W - 0.5, d = Math.hypot(u, v) * 2 + (n(x / (4 * s), y / (4 * s)) - 0.5) * 0.3; pc.set(x, y, [255, 255, 255], Math.round(clamp(1 - d, 0, 1) ** 1.6 * 255)); });
}, 16, 16, 4, false);
export const shaft = () => twin((pc, s) => {
  pc.each((x, y) => { const u = x / pc.w, v = y / pc.h; pc.set(x, y, [255, 246, 222], Math.round(Math.sin(u * Math.PI) ** 2 * (0.3 + 0.7 * v) * 255)); });
}, 8, 16, 8, false);

/* ground mask for the farm: r = snow, g = mud (vs dead grass), b = wet. Painted procedurally. */
export function groundMask(size, half, paint) {
  const pc = new PixelCanvas(size, size), lo = pc.texture(false), k = (2 * half) / size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -half + (i + 0.5) * k, z = -half + (j + 0.5) * k, [a, b, c] = paint(x, z);
    pc.set(i, j, [clamp(Math.round(a * 255), 0, 255), clamp(Math.round(b * 255), 0, 255), clamp(Math.round(c * 255), 0, 255)]);
  }
  // enhanced twin: same data, linear filtering (smooth patch edges; the shader adds fine noise)
  setHiTex(lo, () => { const t = new THREE.DataTexture(pc.d, size, size, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; });
  return lo;
}
