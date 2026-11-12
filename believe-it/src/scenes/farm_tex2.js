// "Believe It" — v4 texture pass: seamless, more detailed replacements for the weaker farm textures.
// Same conventions as farm_tex.js: twin(gen, w, h, k) = retro pixel canvas w x h + a hi-res twin (x k); row 0 = v 0 (bottom).
import { PixelCanvas, valueNoise, rng, mixc, mulc, clamp, hiTexture, setHiTex } from '../engine/util.js';

const fbm = (n, x, y, o = 3) => { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; } return s / t; };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const cl = (c) => c.map((v) => clamp(v, 0, 255));
const fr = (x) => x - Math.floor(x);
const add = (c, k) => [c[0] + k, c[1] + k, c[2] + k];
function twin(gen, w, h, k, repeat = true) {
  const make = (s) => { const pc = new PixelCanvas(w * s, h * s); gen(pc, s); return pc; };
  const lo = make(1).texture(repeat);
  setHiTex(lo, () => hiTexture(make(k), repeat));
  return lo;
}
// periodic jittered Voronoi over the unit square: GX x GY cells; returns nearest / second distances (uv units) + cell
function vor(seed, GX, GY = GX, jit = 0.85) {
  const r = rng(seed), P = [];
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) P.push({ x: i + 0.5 + (r() - 0.5) * jit, y: j + 0.5 + (r() - 0.5) * jit, a: r(), b: r(), c: r(), i: j * GX + i });
  const o = { f1: 0, f2: 0, p: null, dx: 0, dy: 0 };
  return (u, v) => {
    const x = fr(u) * GX, y = fr(v) * GY, ci = Math.floor(x), cj = Math.floor(y);
    let f1 = 1e9, f2 = 1e9, best = null, bx = 0, by = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ci + di, jj = cj + dj, wi = ((ii % GX) + GX) % GX, wj = ((jj % GY) + GY) % GY, p = P[wj * GX + wi];
      const px = p.x + (ii - wi), py = p.y + (jj - wj), dx = (x - px) / GX, dy = (y - py) / GY, d = Math.hypot(dx, dy);
      if (d < f1) { f2 = f1; f1 = d; best = p; bx = dx; by = dy; } else if (d < f2) f2 = d;
    }
    o.f1 = f1; o.f2 = f2; o.p = best; o.dx = bx; o.dy = by;
    return o;
  };
}

/* green Kacheln (tile = 0.4 m = 2 x 2 tiles): cushion-shaped glazed tiles, glaze pooled dark at the edges and thin /
   pale on the shoulders, per-tile hue, soft sheen, crazing, pinholes, lime grout */
export const kachel = () => twin((pc, s) => {
  const W = pc.w, N = 2, r = rng(271), n = valueNoise(272, 16, 16), m = valueNoise(273, 64, 64), cz = vor(274, 18, 18, 1);
  const tiles = Array.from({ length: N * N }, () => ({ h: r(), l: 0.9 + r() * 0.2, d: (r() - 0.5) * 0.25 }));
  const L = [-0.38, 0.55, 0.74], Ln = Math.hypot(...L), Hh = [L[0] / Ln, L[1] / Ln, L[2] / Ln + 1], Hn = Math.hypot(...Hh);
  const hgt = (lx, ly) => sm(0, 0.16, 0.5 - Math.abs(lx)) * sm(0, 0.16, 0.5 - Math.abs(ly)) * (1 + 0.22 * (0.5 - (lx * lx + ly * ly) * 2));
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, tu = u * N, tv = v * N, ti = Math.floor(tu), tj = Math.floor(tv), T = tiles[tj * N + ti];
    const lx = tu - ti - 0.5, ly = tv - tj - 0.5, e = 0.5 - Math.max(Math.abs(lx), Math.abs(ly)), g = 0.026;
    if (e < g) { // grout: lime mortar, a little sooty, shadowed by the tile above
      let c = mulc([150, 142, 124], 0.82 + m(u * 64, v * 64) * 0.3);
      if (ly < 0 && Math.abs(ly) > Math.abs(lx)) c = mulc(c, 0.8);
      pc.set(x, y, cl(mulc(c, 0.75 + 0.25 * (e / g))));
      return;
    }
    const d = 0.004, hx = (hgt(lx + d, ly) - hgt(lx - d, ly)) / (2 * d), hy = (hgt(lx, ly + d) - hgt(lx, ly - d)) / (2 * d);
    const k = 0.085, nx = -hx * k, ny = -hy * k, nl = Math.hypot(nx, ny, 1), N3 = [nx / nl, ny / nl, 1 / nl];
    const dif = (N3[0] * L[0] + N3[1] * L[1] + N3[2] * L[2]) / Ln, spec = Math.pow(Math.max(0, (N3[0] * Hh[0] + N3[1] * Hh[1] + N3[2] * Hh[2]) / Hn), 34);
    const slope = Math.min(1, Math.hypot(hx, hy) * 0.09);
    let c = mixc([30, 78, 58], [70, 128, 92], clamp(T.h * 0.45 + fbm(n, u * 16, v * 16) * 0.55 + T.d, 0, 1));
    c = mulc(c, T.l);
    const pool = sm(0.06, g, e); // glaze runs into the corner and pools thick and dark
    c = mixc(c, [16, 54, 38], pool * 0.7);
    c = mixc(c, [128, 150, 104], slope * (1 - pool) * 0.38); // thin glaze on the shoulder shows the pale body
    c = mulc(c, 0.7 + 0.42 * dif);
    if (s > 1) {
      const q = cz(u, v);
      if (q.f2 - q.f1 < 0.0016) c = mulc(c, 0.86); // crazing
      if (m(u * 64 + 17, v * 64) > 0.9 && m(u * 64, v * 64 + 5) > 0.75) c = mulc(c, 0.7); // pinholes
    }
    c = add(c, 120 * spec * (0.6 + 0.4 * fbm(n, u * 16 + 4, v * 16)));
    pc.set(x, y, cl(mulc(c, 0.985 + (r() - 0.5) * 0.03)));
  });
}, 32, 32, 8);

/* fieldstone / rubble masonry (tile 1.2 m): irregular rounded stones of granite, gneiss and brown sandstone in a
   recessed lime mortar, lit from above, speckled grains, a little lichen and damp at the joints */
export const stone = () => twin((pc, s) => {
  const W = pc.w, V = vor(211, 6, 8, 0.7), n = valueNoise(212, 16, 16), m = valueNoise(213, 64, 64), q = valueNoise(215, 32, 32), r = rng(214);
  const kinds = [[132, 130, 126], [118, 112, 104], [134, 116, 94], [104, 108, 112], [146, 140, 128]];
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, o = V(u, v), edge = o.f2 - o.f1;
    const w = 0.012 + (n(u * 16, v * 16) - 0.5) * 0.008;
    if (edge < w) {
      let c = mulc([170, 164, 150], 0.82 + m(u * 64, v * 64) * 0.26);
      c = mulc(c, 0.62 + 0.38 * sm(0, w, edge * 1.6)); // recessed: shadow next to the stones
      c = mixc(c, [118, 112, 96], sm(0.55, 0.8, fbm(q, u * 32, v * 32)) * 0.4);
      pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.05)));
      return;
    }
    const p = o.p, base = mixc(kinds[Math.floor(p.a * kinds.length)], kinds[Math.floor(p.b * kinds.length)], 0.3);
    let c = mulc(base, 0.82 + p.c * 0.3);
    const round = sm(w, w + 0.035, edge), up = clamp(-o.dy / 0.06, -1, 1); // top of each stone catches the light
    c = mulc(c, (0.6 + 0.4 * round) * (1 + 0.14 * up * round) * (0.88 + fbm(n, u * 16 + p.a * 7, v * 16) * 0.24));
    if (s > 1) { const g = m(u * 64 * 2 % 64, v * 64 * 2 % 64); if (g > 0.78) c = mixc(c, [196, 190, 178], (g - 0.78) * 2.2); else if (g < 0.16) c = mulc(c, 0.72); }
    const lich = fbm(q, u * 32 + 3, v * 32, 2); if (lich > 0.66) c = mixc(c, [128, 132, 104], (lich - 0.66) * 1.6);
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.06)));
  });
}, 32, 32, 8);

/* homespun linen (tile 0.5 m): plain weave with uneven slubbed threads, soft folds, a few darker fibres */
export const linen = () => twin((pc, s) => {
  const W = pc.w, P = s > 1 ? 4 : 1, NT = W / P, n = valueNoise(312, 8, 8), wa = valueNoise(313, 64, 8), we = valueNoise(314, 8, 64), f = valueNoise(315, 64, 64), r = rng(311);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, tx = x / P, ty = y / P, over = (Math.floor(tx) + Math.floor(ty)) % 2;
    const slW = wa(Math.floor(tx) / NT * 64, v * 8), slF = we(u * 8, Math.floor(ty) / NT * 64);
    let c = [230, 224, 210];
    let k = over ? 0.86 + 0.16 * Math.sin(Math.PI * fr(tx)) + (slW - 0.5) * 0.12 : 0.84 + 0.16 * Math.sin(Math.PI * fr(ty)) + (slF - 0.5) * 0.12;
    if (P === 1) k = over ? 1.03 : 0.97;
    k *= 0.93 + fbm(n, u * 8, v * 8) * 0.1;
    c = mulc(c, k);
    if (s > 1 && f(u * 64, v * 64) > 0.86 && (over ? slW : slF) > 0.6) c = mulc(c, 0.9); // darker fibres
    c = mixc(c, [214, 204, 184], sm(0.6, 0.85, fbm(f, u * 16, v * 16, 2)) * 0.35); // faint yellowing
    pc.set(x, y, cl(mulc(c, 0.99 + (r() - 0.5) * 0.03)));
  });
}, 32, 32, 8);

/* woven gingham (tile 0.4 m, 8 checks): coloured warp + weft stripes, real weave so the crossings mix, faded */
const check = (seed, col) => () => twin((pc, s) => {
  const W = pc.w, q = W / 8, P = s > 1 ? 4 : 1, white = [236, 232, 222], n = valueNoise(seed + 1, 8, 8), f = valueNoise(seed + 2, 64, 64), r = rng(seed);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, ax = Math.floor(x / q) % 2, by = Math.floor(y / q) % 2;
    let c;
    if (P === 1) c = ax && by ? col : ax || by ? mixc(col, white, 0.5) : white;
    else {
      const over = (Math.floor(x / P) + Math.floor(y / P)) % 2, warp = ax ? col : white, weft = by ? col : white;
      c = over ? mixc(warp, weft, 0.2) : mixc(weft, warp, 0.2);
      c = mulc(c, 0.86 + 0.16 * Math.sin(Math.PI * fr(over ? x / P : y / P)) + (f(u * 64, v * 64) - 0.5) * 0.08);
    }
    c = mixc(c, white, sm(0.5, 0.9, fbm(n, u * 8, v * 8)) * 0.16); // washed out
    c = mulc(c, 0.95 + fbm(n, u * 8 + 3, v * 8) * 0.07);
    pc.set(x, y, cl(mulc(c, 0.99 + (r() - 0.5) * 0.03)));
  });
}, 32, 32, 8);
export const checkBlue = check(321, [62, 88, 146]);
export const checkRed = check(322, [158, 54, 48]);

/* Fleckvieh hide (tile 1 m): red-brown patches with ragged hairy edges on cream white, hair streaks, dirt low down */
export const hide = () => twin((pc, s) => {
  const W = pc.w, r = rng(331), n = valueNoise(332, 4, 4), m = valueNoise(333, 32, 32), h = valueNoise(334, 128, 16), sp = valueNoise(335, 16, 16);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, hair = h(u * 128, v * 16);
    const p = fbm(n, u * 4, v * 4, 3) + (m(u * 32, v * 32) - 0.5) * 0.08 + (hair - 0.5) * 0.05;
    let c;
    if (p > 0.55) c = mulc([228, 216, 198], 0.92 + hair * 0.1);
    else { c = mulc(mixc([150, 82, 46], [112, 58, 34], fbm(sp, u * 16, v * 16)), 0.82 + hair * 0.3); c = mulc(c, 0.9 + 0.1 * sm(0.38, 0.52, p)); }
    if (Math.abs(p - 0.55) < 0.015) c = mixc(c, [186, 140, 106], 0.5);
    c = mulc(c, 0.94 + (h(u * 128 + 31, v * 16 + 3) - 0.5) * 0.14);
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.04)));
  });
}, 32, 32, 8);

/* forged / cast iron (tile 0.5 m): blue-black mill scale, hammer facets, worn bright scratches, rust blooms with pits */
export const iron = () => twin((pc, s) => {
  const W = pc.w, n = valueNoise(342, 8, 8), m = valueNoise(343, 32, 32), D = vor(344, 9, 9), sc = valueNoise(345, 128, 8), pit = valueNoise(346, 128, 128), r = rng(341);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, o = D(u, v);
    let c = mulc(mixc([58, 60, 66], [76, 74, 72], fbm(n, u * 8, v * 8)), 0.86 + fbm(m, u * 32, v * 32, 2) * 0.26);
    c = mulc(c, 1 + clamp((o.dy - o.dx) / 0.08, -1, 1) * 0.07 - sm(0.004, 0, o.f2 - o.f1) * 0.12); // hammer facets
    if (s > 1 && sc(u * 128 + v * 16, v * 8) > 0.86) c = mixc(c, [128, 128, 132], (sc(u * 128 + v * 16, v * 8) - 0.86) * 2.5);
    const rr = fbm(m, u * 32 + 7, v * 32, 3) * 0.6 + fbm(n, u * 8 + 3, v * 8, 2) * 0.4;
    if (rr > 0.54) {
      const t = sm(0.54, 0.7, rr);
      c = mixc(c, mulc(mixc([124, 64, 32], [92, 50, 30], m(u * 32 + 5, v * 32)), 0.85 + pit(u * 128, v * 128) * 0.3), t);
      if (s > 1 && pit(u * 128, v * 128) > 0.82) c = mulc(c, 0.6);
    }
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.05)));
  });
}, 32, 32, 8);

/* brass (tile 0.25 m): brushed along u, polished highlights, fine brown-green tarnish in streaks and spots */
export const brass = () => twin((pc, s) => {
  const W = pc.w, r = rng(501), n = valueNoise(502, 8, 8), st = valueNoise(503, 64, 4), st2 = valueNoise(504, 256, 8), t = valueNoise(505, 32, 32);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W;
    let c = mixc([186, 140, 62], [236, 200, 116], st(u * 64, v * 4) * 0.55 + fbm(n, u * 8, v * 8) * 0.45);
    if (s > 1) c = mulc(c, 0.94 + st2(u * 256, v * 8) * 0.12);
    const tar = fbm(t, u * 32, v * 32, 3);
    c = mixc(c, [104, 92, 56], sm(0.6, 0.78, tar) * 0.45);
    if (t(u * 32 * 2 % 32, v * 32 * 2 % 32) > 0.88) c = mixc(c, [80, 92, 64], 0.35);
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.05)));
  });
}, 32, 32, 8);

/* white enamel ware (lathe uv: v up): slightly grey-blue white, blue rim with a black edge, rounded chips showing the
   grey ground coat, black iron and rust; brown stains low down */
export const enamel = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, n = valueNoise(542, 8, 8), m = valueNoise(544, 64, 64), V = vor(543, 10, 10), r = rng(541);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    let c = mulc([234, 234, 228], 0.93 + fbm(n, u * 8, v * 8) * 0.08);
    c = mixc(c, [196, 180, 150], sm(0.25, 0, v) * 0.35 * fbm(n, u * 8 + 4, v * 8)); // stains near the bottom
    if (v > 0.92) c = mulc([46, 66, 128], 0.9 + m(u * 64, v * 64) * 0.2);
    if (v > 0.985) c = [26, 28, 34];
    const o = V(u, v), rad = (o.p.a < 0.16 ? 0.018 + o.p.b * 0.03 : 0) * (0.8 + m(u * 64, v * 64) * 0.4);
    if (o.f1 < rad) {
      const k = o.f1 / rad;
      c = k > 0.78 ? [150, 150, 152] : k > 0.55 ? [36, 36, 40] : mixc([36, 36, 40], [118, 62, 34], sm(0.55, 0.15, k));
    }
    pc.set(x, y, cl(mulc(c, 0.99 + (r() - 0.5) * 0.02)));
  });
}, 32, 32, 8);

/* leather (tile 0.3 m): pebbled grain, creases, rubbed lighter patches, darker greasy spots */
export const leather = () => twin((pc, s) => {
  const W = pc.w, r = rng(591), n = valueNoise(592, 16, 16), V = vor(594, 40, 40, 1), cr = valueNoise(595, 4, 32), m = valueNoise(593, 64, 64);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, o = V(u, v);
    let c = mulc([108, 68, 40], 0.82 + fbm(n, u * 16, v * 16) * 0.3);
    if (s > 1) c = mulc(c, 0.9 + sm(0, 0.004, o.f2 - o.f1) * 0.12 + o.p.a * 0.05);
    const k = Math.abs(cr(u * 4, v * 32) - 0.5); if (k < 0.03) c = mulc(c, 0.8 + k * 6); // creases
    c = mixc(c, [148, 106, 70], sm(0.62, 0.82, fbm(n, u * 16 + 9, v * 16)) * 0.45);
    if (m(u * 64, v * 64) > 0.8) c = mulc(c, 0.86);
    pc.set(x, y, cl(mulc(c, 0.98 + (r() - 0.5) * 0.04)));
  });
}, 32, 32, 8);

/* twisted rope (tile 0.1 m): three strands winding diagonally, hairy fibres along each strand, frayed bits */
export const rope = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(561), n = valueNoise(562, 8, 8), fb = valueNoise(563, 256, 8);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / H, a = u * 4 + v * 2, t = fr(a), ply = Math.sin(t * Math.PI);
    let c = mulc([180, 154, 108], 0.42 + 0.62 * Math.pow(ply, 0.6));
    if (s > 1) c = mulc(c, 0.86 + fb(a * 64, (u - v * 2) * 8) * 0.28);
    c = mulc(c, 0.9 + fbm(n, u * 8, v * 8) * 0.18);
    if (s > 1 && r() < 0.015) c = mulc(c, 1.25);
    pc.set(x, y, cl(c));
  });
}, 32, 32, 8);

/* apple / pear bark (tile 0.5 m): scaly grey-brown plates split by dark vertical fissures, striations, lichen */
export const bark = () => twin((pc, s) => {
  const W = pc.w, n = valueNoise(712, 16, 4), n2 = valueNoise(716, 32, 8), st = valueNoise(713, 64, 8), l = valueNoise(714, 16, 16), V = vor(711, 10, 5, 0.9), r = rng(715);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W;
    const f = fbm(n, u * 16 + fbm(n2, u * 32, v * 8, 2) * 1.2, v * 4, 3), fur = Math.abs(f - 0.5); // wavy vertical furrows
    const o = V(u, v), crack = sm(0.004, 0, o.f2 - o.f1) * sm(0.3, 0.9, Math.abs(o.dx) / (Math.abs(o.dy) + 1e-4) * 0.2); // short cross splits
    let c = mulc(mixc([88, 78, 66], [122, 110, 96], fbm(l, u * 16 + 5, v * 16, 2)), 0.86 + st(u * 64, v * 8) * 0.24);
    c = mulc(c, 0.42 + 0.58 * sm(0.015, 0.07, fur)); // furrows: deep and dark
    c = mulc(c, 1 + sm(0.07, 0.2, fur) * 0.08); // plate tops catch the light
    c = mulc(c, 1 - crack * 0.4);
    const li = fbm(l, u * 16, v * 16, 3); if (li > 0.68 && fur > 0.05) c = mixc(c, [136, 140, 118], sm(0.68, 0.84, li) * 0.45);
    pc.set(x, y, cl(mulc(c, 0.96 + (r() - 0.5) * 0.07)));
  });
}, 32, 32, 8);

/* woodpile face (tile 0.64 m, 4 x 4 staggered log ends): split and round billets, growth rings, pith, checks, bark
   rims, weathered grey or fresh yellow faces, deep shadow between */
export const ends = () => twin((pc, s) => {
  const W = pc.w, R = 4, cs = W / R, r = rng(62), n = valueNoise(61, 16, 16), m = valueNoise(63, 64, 64);
  const L = Array.from({ length: R * R }, () => ({ rad: 0.4 + r() * 0.08, tone: 0.75 + r() * 0.35, grey: r() < 0.35 ? 0.4 : 0, ox: (r() - 0.5) * 0.08, oy: (r() - 0.5) * 0.08, split: r() < 0.45 ? r() * Math.PI : null, ring: 7 + r() * 5 }));
  pc.each((x, y) => {
    const row = Math.floor(y / cs), sx = row % 2 ? cs / 2 : 0, xx = (x + sx) % W, col = Math.floor(xx / cs), Lg = L[row * R + col];
    let lx = (xx - col * cs) / cs - 0.5 - Lg.ox, ly = (y - row * cs) / cs - 0.5 - Lg.oy;
    const u = (x + 0.5) / W, v = (y + 0.5) / W;
    let d = Math.hypot(lx, ly * 1.06), cut = false;
    if (Lg.split !== null) { const sd = lx * Math.cos(Lg.split) + ly * Math.sin(Lg.split); if (sd > 0.06) cut = true; }
    let c = mulc([22, 18, 14], 0.8 + m(u * 64, v * 64) * 0.4);
    if (!cut && d < Lg.rad) {
      const rings = d * Lg.ring * 2 + (n(u * 16, v * 16) - 0.5) * 1.2, t = fr(rings);
      c = mixc([174, 142, 100], [132, 100, 68], sm(0.55, 0.85, t));
      c = mixc(c, [150, 146, 136], Lg.grey);
      if (d < 0.03) c = mulc(c, 0.7);
      const ang = Math.atan2(ly, lx); if (Math.abs(fr(ang / (Math.PI * 2) * 3 + Lg.ox * 5) - 0.5) < 0.012 && d > 0.06) c = mulc(c, 0.55); // radial checks
      c = mulc(c, Lg.tone * (0.92 + m(u * 64 + 3, v * 64) * 0.16) * (1 - 0.25 * sm(Lg.rad - 0.08, Lg.rad, d)));
    } else if (!cut && d < Lg.rad + 0.05) c = mulc([70, 56, 44], Lg.tone * (0.8 + m(u * 64, v * 64) * 0.4)); // bark rim
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.06)));
  });
}, 64, 64, 4);

/* chopping-block top (uv 0..1 over the disc): growth rings, pith, radial drying checks, criss-cross axe cuts, bark */
export const ring = () => twin((pc, s) => {
  const W = pc.w, n = valueNoise(81, 8, 8), m = valueNoise(83, 64, 64), r = rng(82), cuts = Array.from({ length: 5 }, () => [r() * Math.PI, (r() - 0.5) * 0.5, 0.004 + r() * 0.006]);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const rg = d * 30 + (fbm(n, u * 8, v * 8) - 0.5) * 2.2, t = fr(rg);
    let c = mixc([168, 136, 96], [124, 94, 64], sm(0.55, 0.85, t));
    c = mixc(c, [118, 110, 98], sm(0.2, 0.48, d) * 0.4); // greyed rim
    if (d < 0.02) c = mulc(c, 0.7);
    if (Math.abs(fr(a / (Math.PI * 2) * 5 + 0.13) - 0.5) < 0.006 * (1 + d * 3) && d > 0.12 && d < 0.44) c = mulc(c, 0.5);
    for (const [ca, off, w] of cuts) { const q = dx * Math.cos(ca) + dy * Math.sin(ca) - off * 0.5; if (Math.abs(q) < w && d < 0.3 - Math.abs(off) * 0.3) c = mulc(c, 0.74); }
    c = mulc(c, 0.92 + m(u * 64, v * 64) * 0.16);
    if (d > 0.465) c = mulc([64, 52, 42], 0.8 + m(u * 64 + 7, v * 64) * 0.4);
    pc.set(x, y, cl(mulc(c, 0.98 + (r() - 0.5) * 0.04)));
  });
}, 64, 64, 4);

/* devotional print in a gilt frame: Madonna in blue mantle and red dress, halo with rays, sepia ground, glass glare */
export const holyPicture = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, n = valueNoise(381, 8, 8), m = valueNoise(382, 32, 32), r = rng(383);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / H, f = Math.min(u, 1 - u, (v) * H / W, (1 - v) * H / W);
    let c = mixc([196, 170, 126], [150, 118, 82], sm(0.1, 0.6, Math.hypot(u - 0.5, (v - 0.6) * 0.8)) * 0.8 + fbm(n, u * 8, v * 8) * 0.2);
    const hx = (u - 0.5) * 2, hv = v - 0.7;
    const halo = Math.hypot(hx * 0.9, hv * 2.2 * 1.5);
    if (halo < 0.42) c = mixc(c, [232, 200, 110], 0.55 * (1 - halo / 0.42) + (Math.abs(fr(Math.atan2(hv, hx) / Math.PI * 8) - 0.5) < 0.12 ? 0.2 : 0));
    const face = Math.hypot(hx / 0.17, (v - 0.7) / 0.075);
    const mantle = v < 0.74 && v > 0.08 && Math.abs(hx) < 0.2 + (0.74 - v) * 0.75;
    const dress = v < 0.6 && v > 0.08 && Math.abs(hx) < 0.08 + (0.6 - v) * 0.18;
    if (mantle) c = mulc([52, 78, 136], 0.8 + fbm(n, u * 8 + 3, v * 8) * 0.3 + (hx < 0 ? 0.08 : -0.05));
    if (dress) c = mulc([150, 48, 44], 0.85 + m(u * 32, v * 32) * 0.2);
    if (face < 1) c = mulc([222, 184, 150], 1 - face * 0.15);
    if (Math.hypot(hx / 0.12, (v - 0.44) / 0.05) < 1) c = [214, 176, 142]; // folded hands
    c = mulc(c, 0.94 + m(u * 32, v * 32) * 0.1);
    if (Math.abs((u - v * 0.6) - 0.05) < 0.06 && f > 0.1) c = mixc(c, [255, 255, 250], 0.12); // glare on the glass
    if (f < 0.11) { // gilt frame with an inner bead and a dark outer edge
      const t = f / 0.11;
      c = mulc(mixc([150, 112, 48], [226, 188, 102], Math.sin(t * Math.PI)), 0.8 + m(u * 32, v * 32) * 0.35);
      if (t < 0.15 || (t > 0.8 && t < 0.9)) c = mulc(c, 0.55);
    }
    pc.set(x, y, cl(mulc(c, 0.98 + (r() - 0.5) * 0.04)));
  });
}, 16, 24, 8, false);

/* generic "plain" surface (vertex colour does the work): faint mottling and grain so nothing reads as flat plastic */
export const plain = () => twin((pc, s) => {
  const W = pc.w, n = valueNoise(901, 8, 8), m = valueNoise(902, 64, 64), r = rng(903);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / W;
    pc.set(x, y, cl(mulc([246, 244, 240], 0.93 + fbm(n, u * 8, v * 8) * 0.08 + (m(u * 64, v * 64) - 0.5) * 0.05 + (r() - 0.5) * 0.02)));
  });
}, 32, 32, 8);

/* brown-glazed earthenware (lathe uv: u round, v up): glossy glaze with rounded runs over the unglazed foot, a dark
   pooled line where each run stops, horizontal throwing rings, kiln speckle, rim worn pale */
export const earthen = () => twin((pc, s) => {
  const W = pc.w, H = pc.h, r = rng(531), n = valueNoise(532, 16, 16), dr = valueNoise(533, 24, 2), m = valueNoise(534, 64, 64), rg = valueNoise(535, 2, 64);
  pc.each((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    const run = Math.pow(dr(u * 24, 0.5), 2.2) * 0.22 + 0.05 * Math.sin(u * Math.PI * 2 * 9); // rounded drip tongues
    const edge = 0.2 - run;
    let c = mixc([120, 64, 28], [172, 104, 46], fbm(n, u * 16, v * 16));
    c = mulc(c, 0.9 + rg(u * 2, v * 64) * 0.16); // throwing rings
    if (v < edge) c = mulc(mixc([182, 136, 98], [160, 116, 80], m(u * 64, v * 64)), 0.95);
    else if (v < edge + 0.025) c = mulc(c, 0.72); // pooled glaze at the run's end
    if (v > 0.93) c = mixc(c, [196, 150, 104], 0.45); // worn rim
    if (s > 1 && m(u * 64 + 11, v * 64) > 0.86) c = mulc(c, 0.75);
    pc.set(x, y, cl(mulc(c, 0.97 + (r() - 0.5) * 0.04)));
  });
}, 32, 32, 8);
