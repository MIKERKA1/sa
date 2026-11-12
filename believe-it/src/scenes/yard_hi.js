// "Enhanced" graphics: high-res (256-512 px) twins of the yard's pixel textures, same palette and layout,
// smooth detail instead of single pixels. Built lazily the first time the enhanced mode needs them.
import { PixelCanvas, valueNoise, rng, mixc, mulc, clamp, hiTexture } from '../engine/util.js';

const fbm = (n, x, y, o = 3) => { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; } return s / t; };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function snowHi() { // tile 4 m on the ground
  const S = 256, pc = new PixelCanvas(S, S), n1 = valueNoise(11, 8, 8), n2 = valueNoise(12, 4, 4), n3 = valueNoise(14, 32, 32), n4 = valueNoise(15, 64, 16), r = rng(13);
  pc.each((x, y) => {
    let v = 233 + (n1(x / 32, y / 32) - 0.5) * 12 + (n2(x / 64, y / 64) - 0.5) * 12 + (n3(x / 8, y / 8) - 0.5) * 5 + (r() - 0.5) * 4;
    v += (n4(x / 4, y / 16 + n1(x / 32, y / 32) * 3) - 0.5) * 7; // wind ripples
    const c = [v * 0.962, v * 0.98, v];
    pc.set(x, y, c.map((k) => clamp(k, 0, 255)));
    if (r() < 0.004) pc.set(x, y, [252, 253, 255]);
  });
  return hiTexture(pc, true);
}

export function logHi() { // horizontal hewn logs, 4 per 1 m tile, dark chinking between
  const W = 256, H = 512, LH = 128, pc = new PixelCanvas(W, H), g = valueNoise(21, 8, 128), f = valueNoise(23, 32, 64), m = valueNoise(24, 16, 32), r = rng(22);
  const logs = Array.from({ length: 4 }, (_, i) => ({ tone: 0.88 + r() * 0.22, crack: 0.25 + r() * 0.5, crack2: 0.55 + r() * 0.3, ph: r() * 6, knots: Array.from({ length: 2 }, () => [r() * W, 0.3 + r() * 0.45, 5 + r() * 6]) }));
  pc.each((x, y) => {
    const li = Math.floor(y / LH), L = logs[li], k = (y % LH) / (LH - 1), round = Math.sin(Math.PI * k);
    let c = mixc([50, 38, 30], [110, 89, 68], 0.18 + 0.82 * Math.pow(round, 0.7));
    const grain = g(x / 32, y / 4), fine = f(x / 8, y / 8);
    c = mulc(c, L.tone * (0.86 + (grain - 0.5) * 0.36 + (fine - 0.5) * 0.12 + (r() - 0.5) * 0.05));
    // drying checks along the log
    for (const [cy, w] of [[L.crack, 1.3], [L.crack2, 0.9]]) {
      const yy = cy + Math.sin(x / 37 + L.ph) * 0.03 + (m(x / 16, li * 8) - 0.5) * 0.06;
      const d = Math.abs(k - yy) * LH;
      const on = m(x / 16 + 3, li * 8 + cy * 10) > 0.42;
      if (on && d < w) c = mulc(c, 0.45 + d / w * 0.3); else if (on && d < w + 1.5) c = mulc(c, 0.85);
    }
    for (const [kx, ky, kr] of L.knots) {
      let dx = Math.abs(x - kx); dx = Math.min(dx, W - dx);
      const d = Math.hypot(dx / kr, (k - ky) * LH / (kr * 0.7));
      if (d < 1) c = mixc(c, [44, 32, 24], (1 - d) * 0.85); else if (d < 1.6) c = mulc(c, 0.92 + (d - 1) * 0.13);
    }
    // chinking (moss / oakum) in the joints
    const j = Math.min(y % LH, LH - (y % LH));
    if (j < 5) c = mixc([30, 26, 22], [46, 44, 34], fbm(m, x / 8, y / 8) * 0.8);
    else if (j < 9) c = mulc(c, 0.62 + (j - 5) * 0.09);
    pc.set(x, y, c.map((v) => clamp(v, 0, 255)));
  });
  return hiTexture(pc, true);
}

export function plankHi() { // vertical weathered boards, 5 per 1 m tile
  const W = 256, H = 512, NB = 5, pc = new PixelCanvas(W, H), g = valueNoise(31, 64, 8), f = valueNoise(33, 32, 32), r = rng(32);
  const boards = Array.from({ length: NB }, () => ({ tone: 0.84 + r() * 0.24, grey: r() * 0.35, joint: Math.floor(r() * H), knot: [r(), r() * H, 3 + r() * 4] }));
  pc.each((x, y) => {
    const fb = (x / W) * NB, b = Math.floor(fb), B = boards[b], u = fb - b, px = u * (W / NB);
    let c = mixc([98, 85, 72], [104, 100, 96], B.grey);
    const grain = g(x / 4, y / 64), fine = f(x / 8, y / 16);
    c = mulc(c, B.tone * (0.9 + (grain - 0.5) * 0.4 + (fine - 0.5) * 0.12 + (r() - 0.5) * 0.05));
    // board edges: dark gap + rounded wear
    const e = Math.min(px, W / NB - px);
    if (e < 2.2) c = [34, 29, 25]; else if (e < 6) c = mulc(c, 0.74 + (e - 2.2) * 0.07);
    // butt joint across the board + two nails
    const jd = Math.abs(((y - B.joint + H) % H) - 3);
    if (jd < 1.5) c = mulc(c, 0.55); else if (jd < 3) c = mulc(c, 0.85);
    for (const ny of [B.joint - 14, B.joint + 18]) for (const nx of [0.25, 0.75]) {
      const d = Math.hypot(px - nx * (W / NB), ((((y - ny) % H) + H * 1.5) % H) - H / 2);
      if (d < 2.2) c = mixc(c, [52, 46, 42], 0.8);
    }
    const kd = Math.hypot((u - B.knot[0]) * (W / NB) / B.knot[2], (((y - B.knot[1] + H * 1.5) % H) - H / 2) / (B.knot[2] * 1.6));
    if (kd < 1) c = mixc(c, [48, 38, 30], (1 - kd) * 0.8);
    pc.set(x, y, c.map((v) => clamp(v, 0, 255)));
  });
  return hiTexture(pc, true);
}

export function needleHi() { // spruce tiers: dark needle tufts, snow clumps on the upper part
  const S = 256, pc = new PixelCanvas(S, S), n = valueNoise(41, 8, 8), h = valueNoise(43, 64, 64), d = valueNoise(44, 32, 32), r = rng(42);
  pc.each((x, y) => {
    const tuft = h((x + y * 0.6) / 4, (y - x * 0.6) / 4) * 0.6 + h((x - y * 0.6) / 4 + 9, (y + x * 0.6) / 4) * 0.4;
    const v = 0.72 + (n(x / 32, y / 32) - 0.5) * 0.5 + (tuft - 0.5) * 0.55 + (d(x / 8, y / 8) - 0.5) * 0.2;
    let c = mulc([38, 55, 46], v);
    const s = fbm(n, (x + 56) / 32, (y + 24) / 32, 3) + (y / S) * 0.55 - 0.6 + (d(x / 8, y / 8) - 0.5) * 0.12;
    if (s > 0.03) {
      const top = sm(0.03, 0.16, s);
      c = mixc(mulc([150, 160, 176], 1), mulc([228, 234, 242], 0.94 + r() * 0.06), top);
    } else if (s > -0.01) c = mulc(c, 0.75);
    pc.set(x, y, c.map((k) => clamp(k, 0, 255)));
  });
  return hiTexture(pc, true);
}

export function endsHi() { // woodpile face: staggered log ends, 4 per row, 4 rows per tile
  const S = 256, C = 64, pc = new PixelCanvas(S, S, [22, 18, 14]), n = valueNoise(61, 32, 32), r = rng(62);
  const tone = Array.from({ length: 16 }, () => 0.76 + r() * 0.38), rad = Array.from({ length: 16 }, () => 24 + r() * 5.5), ph = Array.from({ length: 16 }, () => r() * 6.28);
  const crk = Array.from({ length: 16 }, () => [r() * 6.28, r() < 0.6 ? r() * 6.28 : null]);
  pc.each((x, y) => {
    const row = Math.floor(y / C), ox = row % 2 ? C / 2 : 0, col = Math.floor(((x + ox) % S) / C), id = (row % 4) * 4 + col;
    const lx = ((x + ox) % C) - (C - 1) / 2, ly = (y % C) - (C - 1) / 2, d = Math.hypot(lx, ly * 1.06), a = Math.atan2(ly, lx);
    let c = mulc([22, 18, 14], 0.8 + n(x / 8, y / 8) * 0.4);
    const R = rad[id] * (1 + (n(a * 2 + id, id) - 0.5) * 0.06);
    if (d < R) {
      const ring = (d * 0.55 + n(x / 8, y / 8) * 2.2 + Math.sin(a * 3 + ph[id]) * 0.4) % 2;
      c = mixc([128, 100, 72], [170, 140, 102], ring < 0.7 ? 0.15 : 0.85);
      c = mixc(c, [104, 78, 56], sm(R * 0.4, 0, d) * 0.5); // darker heart
      c = mulc(c, tone[id] * (0.95 + (r() - 0.5) * 0.08));
      for (const ca of crk[id]) if (ca !== null) {
        const da = Math.abs(((a - ca + 9.42) % 6.28) - 3.14);
        if (da * d < 1.2 && d > 2 && d < R * 0.92) c = mulc(c, 0.5);
      }
      if (d > R - 2.5) c = mulc(c, 0.8);
    } else if (d < R + 6) c = mulc(mixc([58, 45, 35], [80, 64, 50], n(a * 6, d)), tone[id] * (1 - sm(R + 3, R + 6, d) * 0.4)); // bark
    pc.set(x, y, c.map((v) => clamp(v, 0, 255)));
  });
  return hiTexture(pc, true);
}

export function barkHi() { // dark grey-brown bark, vertical furrows
  const S = 256, pc = new PixelCanvas(S, S), n = valueNoise(71, 16, 4), m = valueNoise(73, 64, 32), r = rng(72);
  pc.each((x, y) => {
    const f = n(x / 16 + (m(x / 4, y / 8) - 0.5) * 0.4, y / 64);
    let c = mixc([44, 37, 31], [96, 84, 71], f);
    c = mulc(c, 0.9 + (m(x / 4, y / 8) - 0.5) * 0.25 + (r() - 0.5) * 0.06);
    if (f < 0.3) c = mulc([30, 25, 21], 0.8 + f);
    pc.set(x, y, c.map((v) => clamp(v, 0, 255)));
  });
  return hiTexture(pc, true);
}

export function ringHi() { // chopping-block top: growth rings, radial checks, axe marks
  const S = 256, k = S / 32, pc = new PixelCanvas(S, S), n = valueNoise(81, 32, 32), r = rng(82);
  pc.each((x, y) => {
    const dx = x / k - 15.5, dy = y / k - 15.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const ring = (d * 0.9 + n(x / 8, y / 8) * 1.5) % 2;
    let c = mixc([116, 90, 64], [152, 124, 92], sm(0.5, 0.9, ring));
    c = mixc(c, [128, 98, 70], sm(4, 0, d) * 0.5);
    if (d > 14.6) c = mixc([58, 46, 36], [76, 60, 46], n(a * 8, d));
    if (Math.abs(((a + 3.4) % 1.3) - 0.65) * d < 0.12 && d > 3 && d < 14) c = mulc(c, 0.5);
    if ((Math.abs(dx * 0.6 - dy - 3) < 0.35 || Math.abs(dx + dy * 0.4 + 5) < 0.3) && d < 12) c = mulc(c, 0.6); // axe marks
    pc.set(x, y, mulc(c, 0.95 + (r() - 0.5) * 0.08).map((v) => clamp(v, 0, 255)));
  });
  return hiTexture(pc, true);
}

export function windowHi() { // 4 panes in a dark frame, warm glass, curtain hint
  const S = 128, pc = new PixelCanvas(S, S), n = valueNoise(51, 8, 8), r = rng(51);
  pc.each((x, y) => {
    const u = x / (S - 1), v = y / (S - 1);
    let c = mixc([255, 216, 142], [234, 156, 80], v * 0.6 + n(x / 16, y / 16) * 0.15);
    if (v > 0.72 && (u < 0.27 || u > 0.73)) c = mulc(c, 0.7 + n(x / 4, 0) * 0.08); // curtains
    c = mulc(c, 0.97 + (r() - 0.5) * 0.04);
    const fr = u < 0.09 || u > 0.91 || v < 0.09 || v > 0.91 || Math.abs(u - 0.5) < 0.035 || Math.abs(v - 0.53) < 0.03;
    if (fr) c = mulc([44, 34, 26], 0.9 + n(x / 4, y / 4) * 0.2);
    pc.set(x, y, c.map((k) => clamp(k, 0, 255)));
  });
  return hiTexture(pc, false);
}

export function printHi() { // boot print with tread, soft alpha edge
  const W = 64, H = 128, pc = new PixelCanvas(W, H, [150, 162, 186]);
  pc.each((x, y) => {
    const fx = (x / 4 - 7.5) / 6.5, sole = (y / 4 - 20) / 10, heel = (y / 4 - 6) / 5;
    const ds = fx * fx + sole * sole, dh = fx * fx * 1.4 + heel * heel;
    const inSole = ds < 1 && y / 4 > 11, inHeel = dh < 1;
    const a = inSole || inHeel ? 255 : 0;
    const edge = (inSole && ds > 0.62) || (inHeel && dh > 0.58);
    let c = edge ? [162, 174, 200] : [112, 124, 154];
    if (!edge && (inSole || inHeel) && (Math.floor(y / 5) % 2 === 0)) c = mulc(c, 0.9); // tread bars
    pc.set(x, y, c, a);
  });
  return hiTexture(pc, false);
}

export function treelineHi() { // distant spruce-top silhouettes with tiered, anti-aliased edges (alpha cut)
  const W = 1024, H = 256, pc = new PixelCanvas(W, H, [255, 255, 255]), r = rng(61), n = valueNoise(63, 128, 8);
  const trees = [];
  for (let x = 0; x < W;) { const w = 24 + r() * 36, h = 80 + r() * 160; trees.push({ cx: x + w, w, h, tiers: 4 + Math.floor(r() * 4), ph: r() }); x += w + r() * 30; }
  const A = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y < 76 + n(x / 8, y / 32) * 8) A[y * W + x] = 1;
  for (const t of trees) for (const off of [-W, 0, W]) {
    const x0 = Math.max(0, Math.floor(t.cx + off - t.w * 2.4)), x1 = Math.min(W - 1, Math.ceil(t.cx + off + t.w * 2.4));
    for (let y = 0; y < Math.min(H, t.h + 2); y++) {
      const k = clamp((t.h - y) / t.h, 0, 1), tf = ((t.h - y) / (t.h / t.tiers) + t.ph) % 1;
      const half = t.w * 2.2 * k * (0.6 + 0.4 * tf) + 1.2;
      for (let x = x0; x <= x1; x++) {
        const dx = Math.abs(x - t.cx - off) + (n(x / 8, y / 32) - 0.5) * 3;
        const i = y * W + x;
        A[i] = Math.max(A[i], clamp(half - dx + 0.5, 0, 1));
      }
    }
  }
  pc.each((x, y) => pc.set(x, y, [255, 255, 255], Math.round(A[y * W + x] * 255)));
  return hiTexture(pc, true);
}
