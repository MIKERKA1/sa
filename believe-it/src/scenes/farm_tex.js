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

/* limewashed masonry, tile 2 m: dirty lime white with a trowelled undulation, rain streaks, hairline cracks and a few
   small flaked spots showing the grey plaster. clean = indoor plaster: same lime white, fainter streaks, rarer flakes */
export const whitewash = (clean = false) => twin((pc, s) => {
  const W = pc.w, n = valueNoise(clean ? 211 : 201, 8, 8), m = valueNoise(clean ? 212 : 202, 16, 16), st = valueNoise(203, 32, 4), f = valueNoise(204, 64, 64), r = rng(205);
  const fl = valueNoise(clean ? 214 : 206, 32, 32), tr = valueNoise(207, 12, 24);
  const th = clean ? 0.83 : 0.79;
  pc.each((x, y) => {
    const u = x / W, v = y / W;
    let c = mixc(clean ? [228, 223, 210] : [224, 218, 205], clean ? [212, 206, 192] : [204, 198, 184], fbm(n, u * 8, v * 8));
    c = mulc(c, 0.975 + (fbm(m, u * 16, v * 16) - 0.5) * 0.06 + (f(u * 64, v * 64) - 0.5) * 0.06 * (s > 1 ? 1 : 0.4));
    c = mulc(c, 1 + (tr(u * 12 + v * 3, v * 24) - 0.5) * 0.035); // trowel strokes
    const streak = st(u * 32, v * 4 + n(u * 8, 0) * 2);
    if (streak > 0.6) c = mixc(c, [180, 172, 156], (streak - 0.6) * (clean ? 0.45 : 0.9));
    const flake = fl(u * 32, v * 32) * 0.7 + f(u * 64, v * 64) * 0.3, tl = th + 0.035 - (fbm(n, u * 3 + 5, v * 3 + 1) - 0.5) * 0.16; // flaking comes in patches
    if (flake > tl + 0.03) c = mixc([186, 178, 164], [164, 156, 143], f(u * 64 + 9, v * 64)); else if (flake > tl) c = mulc(c, 0.88 + (flake - tl) * 1.6);
    pc.set(x, y, cl(mulc(c, 0.985 + (r() - 0.5) * 0.025)));
  });
  // hairline cracks: a few short, faint, branching lines (hi texture only: in the lo one they read as wires)
  if (s > 1) {
    const rc = rng(clean ? 215 : 208), NC = clean ? 3 : 6;
    for (let i = 0; i < NC; i++) {
      let x = rc() * W, y = rc() * W, a = rc() * Math.PI * 2;
      const L = (3 + rc() * 6) * s;
      for (let k = 0; k < L; k++) {
        a += (rc() - 0.5) * 0.7; x += Math.cos(a) * 0.7; y += Math.sin(a) * 0.7;
        const fade = Math.sin((k / L) * Math.PI); // thin out at both ends
        pc.mix(((x % W) + W) % W, ((y % W) + W) % W, [150, 142, 128], 0.3 * fade);
        if (k === Math.floor(L * 0.4) && rc() < 0.6) { let bx = x, by = y, ba = a + (rc() < 0.5 ? 0.9 : -0.9); for (let q = 0; q < L * 0.3; q++) { ba += (rc() - 0.5) * 0.6; bx += Math.cos(ba) * 0.7; by += Math.sin(ba) * 0.7; pc.mix(((bx % W) + W) % W, ((by % W) + W) % W, [150, 142, 128], 0.2 * (1 - q / (L * 0.3))); } }
      }
    }
  }
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
  const W = pc.w, H = pc.h, NB = 5, r = rng(231), g = valueNoise(232, 64, 8), f = valueNoise(233, 16, 16), gr = valueNoise(234, 8, 32);
  const B = Array.from({ length: NB }, () => ({ t: 0.82 + r() * 0.3, j: Math.floor(r() * H), ph: r() * 10, k: r() < 0.7 ? { y: r() * H, x: 0.25 + r() * 0.5, r: (1.2 + r() * 1.6) } : null }));
  pc.each((x, y) => {
    const fb = (x / W) * NB, b = Math.floor(fb), u = fb - b, bb = B[b];
    // grain: stretched rings along the board, bending round the knot
    let du = u - (bb.k ? bb.k.x : 0.5), dy = bb.k ? (((y - bb.k.y + H * 1.5) % H) - H / 2) / s : 99;
    const kn = bb.k ? Math.exp(-(du * du * 60 + dy * dy * 0.02)) : 0;
    const ring = Math.sin((u * 9 + bb.ph + gr(x / (2 * s), y / (6 * s)) * 2.2 + kn * 3) * Math.PI * 2);
    let c = mulc([134, 100, 70], bb.t * (0.9 + (g(x / (2 * s), y / (16 * s)) - 0.5) * 0.32 + (f(x / (4 * s), y / (4 * s)) - 0.5) * 0.1));
    c = mulc(c, 1 + ring * 0.055 - (ring > 0.85 ? 0.08 : 0));
    c = mulc(c, 1 + Math.sin(u * Math.PI) * 0.05);
    if (bb.k) { const kd = Math.hypot(du * (W / NB) / s * 1.4, dy * 0.7), kr = bb.k.r * 0.55; if (kd < kr) { const t = 1 - kd / kr; c = mulc(mixc(c, [104, 74, 48], 0.35 * sm(0, 0.6, t)), 1 - 0.06 * Math.sin(t * 14)); } }
    const e = Math.min(u, 1 - u) * (W / NB) / s;
    if (e < 0.7) c = [40, 30, 22]; else if (e < 1.6) c = mulc(c, 0.8);
    const jd = Math.abs(((y - bb.j + H) % H)) / s;
    if (jd < 0.8) c = mulc(c, 0.5);
    // hand-forged nail heads near the board joints
    const nd = Math.hypot((u - 0.5) * (W / NB) / s, Math.min(Math.abs(y - bb.j - 3 * s), Math.abs(y - bb.j + 3 * s)) / s);
    if (nd < 0.32) c = mixc(c, [58, 50, 44], 0.55); else if (nd < 0.5) c = mulc(c, 0.92);
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.05)));
  });
}, 32, 64, 8);

/* planed wood for furniture and beams, grain along u, tile 1 m */
export const wood = () => twin((pc, s) => {
  const r = rng(241), g = valueNoise(242, 4, 64), f = valueNoise(243, 16, 16), h = valueNoise(244, 32, 32), W = pc.w;
  const knots = Array.from({ length: 2 }, () => ({ x: r() * W, y: r() * W, r: (0.5 + r() * 0.5) * s }));
  pc.each((x, y) => {
    let bend = 0;
    for (const K of knots) { const dx = (x - K.x) / s, dy = (y - K.y) / s; bend += Math.exp(-(dx * dx * 0.04 + dy * dy * 0.6)) * 2.2; }
    const v = g(x / (8 * s), y / (0.5 * s) + f(x / (4 * s), y / (4 * s)) * 1.5 + bend);
    let c = mixc([116, 84, 56], [148, 112, 78], v);
    if (v < 0.25) c = mulc(c, 0.8);
    c = mulc(c, 0.95 + (h(x / (2 * s), y / (2 * s)) - 0.5) * 0.1);
    for (const K of knots) { const d = Math.hypot((x - K.x) * 0.6, (y - K.y) * 1.3); if (d < K.r) { const t = 1 - d / K.r; c = mulc(mixc(c, [92, 66, 42], 0.4 * sm(0, 0.7, t)), 1 - 0.05 * Math.sin(t * 12)); } }
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
  // fibrous straw, tile 1 m: dark gaps between layers of long stalks, each stalk a lit edge + a shaded edge, mostly lying
  // one way (heaps are mapped so it runs roughly down the slope) with some crossing; no blotches
  const W = pc.w, r = rng(281), n = valueNoise(282, 4, 4);
  pc.each((x, y) => pc.set(x, y, cl(mulc([72, 56, 32], 0.85 + n(x / (16 * s), y / (16 * s)) * 0.3))));
  const N = 2600 * s * s, pal = [[150, 122, 70], [186, 156, 94], [206, 178, 112], [226, 200, 136], [168, 150, 96], [196, 170, 100]];
  for (let i = 0; i < N; i++) {
    const layer = i / N, x = r() * W, y = r() * W, a = (r() < 0.75 ? 1.45 + (r() - 0.5) * 0.7 : r() * Math.PI), L = (5 + r() * 16) * s;
    const base = layer < 0.25 ? mulc(pal[Math.floor(r() * pal.length)], 0.55) : pal[Math.floor(r() * pal.length)];
    const ca = Math.cos(a), sa = Math.sin(a), wob = (r() - 0.5) * 0.15;
    const x1 = x + ca * L + wob * L * -sa, y1 = y + sa * L + wob * L * ca;
    pc.line(x, y, x1, y1, base, layer < 0.25 ? 0.6 : 0.95);
    if (s > 1) { // stalks are tubes: a highlight along one side, a dark line along the other (both offset across the stalk)
      pc.line(x - sa * 0.9, y + ca * 0.9, x1 - sa * 0.9, y1 + ca * 0.9, mixc(base, [250, 232, 180], 0.4), 0.5);
      pc.line(x + sa * 1.2, y - ca * 1.2, x1 + sa * 1.2, y1 - ca * 1.2, [52, 40, 22], layer < 0.25 ? 0.2 : 0.45);
    }
  }
}, 64, 64, 4);

/* single straw stalks on a transparent card (fuzzy edges of heaps and litter): u across, v up, stalks rooted at the
   bottom and fanning out. alpha-tested */
export const strawCard = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(291);
  pc.each((x, y) => pc.set(x, y, [150, 120, 70], 0));
  const pal = [[150, 122, 70], [190, 160, 98], [214, 186, 120], [230, 206, 142], [120, 96, 58]];
  for (let i = 0; i < 70; i++) {
    const x0 = W * (0.15 + r() * 0.7), y0 = H * (r() * 0.25), a = Math.PI / 2 + (r() - 0.5) * 1.6, L = H * (0.35 + r() * 0.6), bend = (r() - 0.5) * 0.6;
    const c = pal[Math.floor(r() * pal.length)], n = Math.ceil(L), th = s > 1 ? (r() < 0.5 ? 1 : 2) : 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n, aa = a + bend * t, x = x0 + Math.cos(aa) * L * t, y = y0 + Math.sin(aa) * L * t;
      if (x < 1 || x > W - 2 || y > H - 2) break;
      for (let q = 0; q <= th; q++) pc.set(x + q, H - 1 - y, mulc(c, q ? 0.75 : 1 + (t - 0.5) * 0.15), 255);
    }
  }
}, 32, 32, 8, false);

/* wicker (willow) weave, tile 0.25 m: horizontal weavers over / under vertical stakes, gaps dark */
export const wicker = () => twin((pc, s) => {
  const W = pc.w, r = rng(296), n = valueNoise(297, 8, 8), RH = 4 * s, SW = 8 * s; // weaver row height, stake spacing
  const tone = Array.from({ length: 64 }, () => 0.82 + r() * 0.3);
  pc.each((x, y) => {
    const row = Math.floor(y / RH), fy = (y % RH) / RH, col = Math.floor(x / SW), fx = (x % SW) / SW;
    const over = (row + col) % 2 === 0; // the weaver passes over the stake in this cell
    const wv = Math.sin(fy * Math.PI), wvShade = 0.55 + 0.6 * Math.pow(wv, 0.6) - (1 - fy) * 0.12; // round weaver, lit from above
    let c = mulc([182, 146, 92], tone[row % 64] * wvShade);
    // where the weaver dives under the stake it dips into shadow
    const dip = Math.abs(fx - 0.5) < 0.18 && !over ? 0.55 : 1;
    if (!over && Math.abs(fx - 0.5) < 0.14) { const st = Math.sin(((fx - 0.36) / 0.28) * Math.PI); c = mulc([170, 134, 84], 0.6 + 0.5 * st); } // stake on top
    else c = mulc(c, dip + (over ? 0 : 0.2) * (1 - dip));
    if (fy < 0.08 || fy > 0.94) c = mulc(c, 0.45); // gap between rows
    c = mulc(c, 0.92 + (n(x / (4 * s), y / (4 * s)) - 0.5) * 0.2);
    pc.set(x, y, cl(mulc(c, 0.96 + (r() - 0.5) * 0.06)));
  });
}, 32, 32, 8);

/* coarse burlap (jute) for sacks, tile 0.5 m: square weave with slubs, frayed colour variation */
export const burlap = () => twin((pc, s) => {
  const W = pc.w, r = rng(298), n = valueNoise(299, 16, 16), sl = valueNoise(300, 64, 4);
  pc.each((x, y) => {
    const T = 2 * s, fx = (x % T) / T, fy = (y % T) / T, cx = Math.floor(x / T), cy = Math.floor(y / T), warpOver = (cx + cy) % 2 === 0;
    const wx = Math.sin(fx * Math.PI), wy = Math.sin(fy * Math.PI);
    let v = warpOver ? 0.55 + 0.45 * wx : 0.55 + 0.45 * wy;
    if (s > 1 && fx < 0.12 && fy < 0.12) v = 0.3; // tiny holes in the weave
    let c = mulc([160, 128, 88], v * (0.88 + (n(x / (4 * s), y / (4 * s)) - 0.5) * 0.25) * (0.92 + sl(x / (2 * s), y / (16 * s)) * 0.16));
    pc.set(x, y, cl(mulc(c, 0.95 + (r() - 0.5) * 0.08)));
  });
}, 32, 32, 8);

/* straw dung (manure heap), tile 1.5 m: dark wet brown, packed straw stalks, glistening wet spots */
export const dung = () => twin((pc, s) => {
  const W = pc.w, r = rng(381), n = valueNoise(382, 8, 8), m = valueNoise(383, 32, 32);
  pc.each((x, y) => {
    const v = fbm(n, x / (8 * s), y / (8 * s)), w = m(x / (2 * s), y / (2 * s));
    let c = mixc([38, 28, 20], [72, 54, 36], v);
    if (w > 0.78) c = mixc(c, [28, 22, 18], (w - 0.78) * 3);
    pc.set(x, y, cl(mulc(c, 0.92 + (r() - 0.5) * 0.12)));
  });
  const N = 210 * s * s;
  for (let i = 0; i < N; i++) {
    const x = r() * W, y = r() * W, a = (r() - 0.5) * 1.2, L = (3 + r() * 8) * s, t = r();
    const c = t < 0.55 ? [74, 56, 34] : t < 0.9 ? [104, 82, 50] : [140, 114, 70];
    pc.line(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, c, 0.45 + r() * 0.3);
  }
  for (let i = 0; i < 40 * s; i++) { const x = r() * W, y = r() * W; pc.mix(x, y, [150, 140, 120], 0.5); } // wet glints
}, 64, 64, 4);

/* feathers, tile 0.12 m: overlapping rounded feather tips in rows (grey, tinted by the vertex colour) */
export const feather = () => twin((pc, s) => {
  const W = pc.w, r = rng(391), n = valueNoise(392, 8, 8), R = 4 * s;
  pc.each((x, y) => {
    const row = Math.floor(y / R), ox = row % 2 ? R : 0, cx = Math.floor((x + ox) / (2 * R)) * 2 * R + R - ox, cy = row * R;
    const dx = (x - cx) / R, dy = (y - cy) / R, d = Math.hypot(dx, dy * 1.2);
    let k = 0.9 + n(x / (2 * s), y / (2 * s)) * 0.18 - dy * 0.12;
    if (d > 0.82 && d < 1.0 && dy > 0) k *= 0.72; // dark feather edge
    if (Math.abs(dx) < 0.06 && dy < 0.7) k *= 0.88; // shaft
    pc.set(x, y, cl([Math.round(205 * k), Math.round(200 * k), Math.round(194 * k)]));
    void r;
  });
}, 32, 32, 8);

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

/* clock face: aged enamel dial, minute track, heavy hour marks (stylised roman numerals as bar groups), brass bezel */
export const clockFace = () => twin((pc, s) => {
  const W = pc.w, n = valueNoise(355, 8, 8);
  pc.each((x, y) => {
    const u = (x + 0.5) / W - 0.5, v = (y + 0.5) / W - 0.5, d = Math.hypot(u, v), a = Math.atan2(v, u);
    let c = mulc([226, 216, 190], 0.92 + n(x / (4 * s), y / (4 * s)) * 0.1);
    c = mixc(c, [196, 180, 146], sm(0.25, 0.47, d) * 0.4); // yellowed towards the rim
    const hf = ((a / (Math.PI / 6)) % 1 + 1) % 1, mf = ((a / (Math.PI / 30)) % 1 + 1) % 1;
    if (d > 0.395 && d < 0.42 && Math.abs(mf - 0.5) > 0.4) c = [40, 34, 28]; // minute ticks
    if (d > 0.392 && d < 0.398 || d > 0.42 && d < 0.426) c = mixc(c, [40, 34, 28], 0.8); // minute track
    if (d > 0.27 && d < 0.375) { const g = Math.abs(hf - 0.5); if (g > 0.455) c = [34, 28, 24]; else if (g > 0.43 && g < 0.445) c = [34, 28, 24]; } // hour bars
    if (d < 0.035) c = [40, 34, 28];
    if (d > 0.455) c = mulc([150, 116, 56], 0.8 + 0.4 * Math.sin((d - 0.455) / 0.045 * Math.PI)); // bezel
    pc.set(x, y, cl(c));
  });
}, 32, 32, 8, false);

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
    const x = -half + (i + 0.5) * k, z = -half + (j + 0.5) * k, [a, b, c, d = 0] = paint(x, z);
    pc.set(i, j, [clamp(Math.round(a * 255), 0, 255), clamp(Math.round(b * 255), 0, 255), clamp(Math.round(c * 255), 0, 255)], clamp(Math.round(d * 255), 0, 255));
  }
  // enhanced twin: same data, linear filtering (smooth patch edges; the shader adds fine noise)
  setHiTex(lo, () => { const t = new THREE.DataTexture(pc.d, size, size, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; });
  lo.userData.maskData = { d: pc.d, size, half };
  return lo;
}

/* ================================================================ detail pass: materials for household things and machines */
/* brass / copper: warm metal with polish streaks, darkened patina in the pores, tile 0.25 m */
export const brass = () => twin((pc, s) => {
  const W = pc.w, r = rng(501), n = valueNoise(502, 8, 8), st = valueNoise(503, 64, 4);
  pc.each((x, y) => {
    const u = x / W, v = y / W, p = fbm(n, u * 8, v * 8);
    let c = mixc([196, 150, 70], [240, 206, 120], st(u * 64, v * 4) * 0.7 + p * 0.3);
    c = mixc(c, [92, 84, 52], sm(0.62, 0.8, p) * 0.5); // tarnish
    pc.set(x, y, cl(mulc(c, 0.95 + (r() - 0.5) * 0.08)));
  });
}, 32, 32, 8);
/* glazed farmhouse earthenware (lathe uv: u round, v up the profile): cream glaze, cobalt / brown painted bands with a
   little flower garland, crazing; rim darker */
export const ceramic = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(511), n = valueNoise(512, 16, 16);
  pc.each((x, y) => {
    const u = x / W, v = y / H;
    let c = mulc([234, 228, 212], 0.95 + n(u * 16, v * 16) * 0.06);
    const band = (v0, v1) => v > v0 && v < v1;
    if (band(0.78, 0.84) || band(0.9, 0.93)) c = [52, 74, 140];
    if (band(0.62, 0.66)) c = [150, 92, 48];
    // garland between the bands: small blue flowers with a red heart
    const fu = (u * 12) % 1, fv = (v - 0.72) / 0.05, d = Math.hypot((fu - 0.5) * 2.4, fv);
    if (v > 0.67 && v < 0.77) { if (d < 0.55) c = [64, 90, 160]; if (d < 0.2) c = [176, 60, 48]; if (Math.abs(fv) < 0.08 && d > 0.6) c = mixc(c, [60, 110, 60], 0.7); }
    if (v > 0.965) c = [120, 96, 70]; // unglazed rim edge
    if (s > 1 && r() < 0.003) c = mulc(c, 0.75); // crazing specks
    pc.set(x, y, cl(c));
  });
}, 32, 32, 8);
/* salt-glazed stoneware (Steinzeug): grey orange-peel glaze, cobalt bands and a scrolled leaf, brownish foot */
export const stoneware = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(521), n = valueNoise(522, 32, 32), m = valueNoise(523, 8, 8);
  pc.each((x, y) => {
    const u = x / W, v = y / H;
    let c = mulc([168, 166, 156], 0.9 + n(u * 32, v * 32) * 0.12 + (m(u * 8, v * 8) - 0.5) * 0.1);
    if ((v > 0.8 && v < 0.835) || (v > 0.18 && v < 0.21)) c = [58, 74, 128];
    const lu = (u * 4) % 1, wave = 0.5 + Math.sin(lu * Math.PI * 2) * 0.12;
    if (v > 0.3 && v < 0.75 && Math.abs((v - 0.3) / 0.45 - wave) < 0.035) c = mixc(c, [52, 70, 130], 0.9); // scroll
    if (v > 0.3 && v < 0.75 && Math.hypot((lu - 0.25) * 3, (v - 0.55) * 6) < 0.28) c = mixc(c, [58, 76, 140], 0.85); // leaf
    if (v < 0.07) c = mulc([150, 120, 90], 0.9 + n(u * 32, v * 32) * 0.1);
    pc.set(x, y, cl(mulc(c, 0.96 + (r() - 0.5) * 0.06)));
  });
}, 32, 32, 8);
/* lead-glazed brown earthenware (Hafnergeschirr): honey-brown glaze with drips, darker inside the rim, tile per object */
export const earthen = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(531), n = valueNoise(532, 16, 16), dr = valueNoise(533, 24, 2);
  pc.each((x, y) => {
    const u = x / W, v = y / H, drip = dr(u * 24, 0) * 0.35;
    let c = mixc([132, 74, 34], [176, 112, 52], n(u * 16, v * 16));
    if (v < 0.2 + drip) c = mixc([170, 120, 84], c, sm(0.1 + drip, 0.2 + drip, v)); // unglazed foot below the drips
    if (v > 0.88) c = mulc(c, 0.8);
    if (s > 1 && ((u * 40) % 1) < 0.04 && v > 0.3 && v < 0.85) c = mulc(c, 0.92); // throwing rings
    pc.set(x, y, cl(mulc(c, 0.95 + (r() - 0.5) * 0.06)));
  });
}, 32, 32, 8);
/* enamelware (white, blue rim, a few black chips) */
export const enamel = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(541), n = valueNoise(542, 8, 8), ch = valueNoise(543, 32, 32);
  pc.each((x, y) => {
    const u = x / W, v = y / H;
    let c = mulc([232, 232, 226], 0.95 + n(u * 8, v * 8) * 0.06);
    if (v > 0.93) c = [44, 62, 120];
    if (ch(u * 32, v * 32) > 0.86) c = [34, 32, 34];
    pc.set(x, y, cl(c));
  });
}, 32, 32, 8);
/* preserved fruit seen through jar glass (cherries / plums / pears depending on the vertex colour), syrup */
export const preserve = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(551);
  pc.each((x, y) => pc.set(x, y, [150, 120, 100]));
  for (let i = 0; i < 60 * s; i++) { const cx = r() * W, cy = r() * H, rr = (2 + r() * 2.5) * s; for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++) { const d = Math.hypot(xx, yy) / rr; if (d < 1) pc.set(cx + xx, cy + yy, cl(mulc([210, 190, 170], 0.55 + 0.45 * Math.sqrt(1 - d) + (xx < 0 && yy < 0 ? 0.15 * (1 - d) : 0)))); } }
}, 32, 32, 8);
/* twisted rope / cord, tile 0.1 m along u */
export const rope = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(561), n = valueNoise(562, 8, 8);
  pc.each((x, y) => {
    const t = ((x / W) * 4 + (y / H) * 2) % 1, ply = Math.sin(t * Math.PI);
    let c = mulc([176, 150, 106], 0.45 + 0.6 * Math.pow(ply, 0.7));
    c = mulc(c, 0.9 + n(x / (4 * s), y / (4 * s)) * 0.2);
    if (s > 1 && r() < 0.02) c = mulc(c, 1.2);
    pc.set(x, y, cl(c));
  });
}, 16, 16, 8);
/* threshed oats / rye: dense small kernels with husks, tile 0.4 m */
export const grain = () => twin((pc, s) => {
  const W = pc.w, r = rng(571), Wd = 0.7 * s + 0.3, d = pc.d;
  const qs = [], q2 = [], shade = [];
  for (let q = -Wd; q <= Wd; q += 0.5) { qs.push(q); q2.push((q / Wd) ** 2); shade.push(q < 0 ? 0.1 : -0.05); }
  // The 32/256 px square tiles wrap rounded coordinates exactly with a bit mask.
  // Keep the general indexer available if these canvas dimensions change.
  const fastWrap = pc.h === W && (W & (W - 1)) === 0, mask = W - 1;
  pc.each((x, y) => pc.set(x, y, [120, 92, 50]));
  for (let i = 0; i < 520 * s * s; i++) {
    const cx = r() * W, cy = r() * W, a = r() * Math.PI, L = (1.6 + r()) * s, c = mulc([218, 184, 116], 0.7 + r() * 0.45);
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let k = -L; k <= L; k += 0.5) {
      const k2 = (k / L) ** 2;
      for (let j = 0; j < qs.length; j++) {
        const e = k2 + q2[j];
        if (e >= 1) continue;
        const q = qs[j], x = cx + ca * k - sa * q, y = cy + sa * k + ca * q;
        const at = fastWrap ? ((Math.round(y) & mask) * W + (Math.round(x) & mask)) * 4 : pc.i(x, y);
        const f = 0.7 + 0.3 * (1 - e) + shade[j];
        // Reuse scalar channels instead of allocating two colour arrays per grain sample.
        d[at] = clamp(c[0] * f, 0, 255); d[at + 1] = clamp(c[1] * f, 0, 255); d[at + 2] = clamp(c[2] * f, 0, 255); d[at + 3] = 255;
      }
    }
  }
}, 32, 32, 8);
/* farm machine paint: oxide red wood / green iron with worn edges, rust and grime; mixed by the vertex colour */
export const machine = () => twin((pc, s) => {
  const W = pc.w, r = rng(581), n = valueNoise(582, 8, 8), w = valueNoise(583, 48, 48), g = valueNoise(584, 4, 32), gr = valueNoise(585, 6, 96);
  pc.each((x, y) => {
    const u = x / W, v = y / W;
    // painted planks: soft brush streaks and the wood grain showing through the paint
    let c = mulc([206, 200, 194], 0.92 + n(u * 8, v * 8) * 0.08 + (gr(u * 6, v * 96) - 0.5) * 0.1);
    const wear = w(u * 48, v * 48) * 0.55 + fbm(n, u * 8 + 3, v * 8) * 0.45;
    if (wear > 0.74) c = mixc([128, 92, 62], [92, 64, 42], gr(u * 6, v * 96)); // small chips worn through to bare wood
    else if (wear > 0.7) c = mulc(c, 0.84); // chip rim
    c = mulc(c, 1 - sm(0.45, 1, v) * 0.14 * g(u * 4, v * 32)); // grime streaks running down
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.04)));
  });
}, 64, 64, 4);
/* leather (harness, belts), tile 0.3 m */
export const leather = () => twin((pc, s) => {
  const W = pc.w, r = rng(591), n = valueNoise(592, 16, 16), m = valueNoise(593, 64, 64);
  pc.each((x, y) => { const u = x / W, v = y / W; pc.set(x, y, cl(mulc([110, 72, 44], 0.8 + fbm(n, u * 16, v * 16) * 0.3 + (m(u * 64, v * 64) - 0.5) * 0.08))); });
}, 32, 32, 8);
