// "Believe It" — farm dog: northern village laika mutt (ash-grey / ginger coat, dark saddle, cream chest and paws,
// curled tail, leather collar with an iron ring). PS1-style low-poly character built from the approved
// "Farm Dog · Character Model Sheet" concept.
// Rigid segmented parts on a small joint tree (like PS1-era characters), Gouraud vertex lighting, one 128x128 painted
// atlas with nearest sampling. Procedural poses; planar 2-bone leg IK keeps the paws on the ground.
// Origin = ground under the middle of the body; nose towards +Z, up +Y, the dog's left side is +X. Withers ~0.56 m.
import * as THREE from 'three';
import { MeshBuilder, loft } from '../engine/geo.js';
import { ps1Material } from '../engine/ps1.js';
import { PixelCanvas, valueNoise, rng, hex, mixc, mulc, clamp, lerp, smooth, deg } from '../engine/util.js';

const V3 = THREE.Vector3;
const v3 = (x, y, z) => new V3(x, y, z);
const AX = v3(1, 0, 0);
const W1 = [1, 1, 1];

/* ================================================================ palette (concept sheet chips) */
export const DOG_PALETTE = [
  { id: 'ash', label: 'Пепельно-серый', en: 'Ash grey', hex: '#7a766f' },
  { id: 'ginger', label: 'Рыжий', en: 'Ginger', hex: '#c48b55' },
  { id: 'cream', label: 'Кремово-белый', en: 'Cream white', hex: '#e6dccb' },
  { id: 'saddle', label: 'Тёмный чепрак', en: 'Dark saddle', hex: '#3b3735' },
  { id: 'leather', label: 'Кожа ошейника', en: 'Leather brown', hex: '#6b3524' },
];
const C = {
  ash: hex('#7a766f'), ashD: hex('#5b5752'), ashL: hex('#9d988f'),
  gin: hex('#c48b55'), ginD: hex('#98693f'), ginL: hex('#d8a673'),
  cream: hex('#e6dccb'), creamD: hex('#c7b9a3'), white: hex('#f2ece1'),
  sad: hex('#3b3735'), sadD: hex('#282523'), sadL: hex('#514b46'),
  nose: hex('#1b1918'), noseL: hex('#55504c'), eye: hex('#b36f24'), eyeL: hex('#d99a3e'), pupil: hex('#120d0a'),
  mouth: hex('#4c2522'), tongue: hex('#c06a64'), tongueD: hex('#8c423e'),
  lea: hex('#6b3524'), leaD: hex('#43200f'), leaL: hex('#8b4b32'), stitch: hex('#b0906f'),
  iron: hex('#5e6063'), ironL: hex('#9a9c9e'), ironD: hex('#2e2f31'),
  pad: hex('#2a2320'), claw: hex('#4a413a'),
};

/* ================================================================ dimensions (metres, rest pose = standing) */
const HIP = v3(0, 0.45, -0.17), CHEST = v3(0, 0.45, -0.07); // pivots in root space
// torso sections [z, yTop, yBottom, halfWidth]
const TORSO_H = [[-0.315, 0.535, 0.385, 0.082], [-0.225, 0.552, 0.362, 0.098], [-0.105, 0.548, 0.382, 0.094], [-0.020, 0.545, 0.372, 0.098]];
const TORSO_C = [[-0.075, 0.548, 0.362, 0.097], [0.030, 0.565, 0.306, 0.110], [0.150, 0.580, 0.288, 0.112], [0.262, 0.572, 0.318, 0.100], [0.330, 0.548, 0.388, 0.066]];
const RUMP = v3(0, 0.465, -0.36), BRISKET = v3(0, 0.47, 0.348), Z0 = -0.36, Z1 = 0.348;
const NECK0 = v3(0, 0.51, 0.225), NECK_A = deg(45), NECK_L = 0.12;
const NECK = [[-0.06, 0.092, 0.100, 0.088], [0.04, 0.086, 0.094, 0.080], [0.12, 0.070, 0.072, 0.066]]; // [s, halfWidth, throat, nape]
const neckAt = (s) => { // interpolated neck section at s
  const i = s < NECK[1][0] ? 0 : 1, a = NECK[i], b = NECK[i + 1], t = (s - a[0]) / (b[0] - a[0]);
  return [s, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
};
// head sections [z, yTop, yBottom, halfWidth], head frame: joint at the origin, muzzle towards +Z
const HEAD = [[-0.040, 0.072, -0.015, 0.046], [0.005, 0.094, -0.040, 0.076], [0.058, 0.084, -0.042, 0.068], [0.100, 0.048, -0.034, 0.046], [0.178, 0.018, -0.026, 0.024]];
const HZ0 = -0.053, HZ1 = 0.19;
const JAW0 = v3(0, -0.034, 0.05), EAR0 = v3(0.042, 0.086, -0.004), EAR_SPLAY = deg(14);
const TAIL0 = v3(0, 0.515, -0.33);
const TAIL_PTS = [[0, -0.01, 0.01], [0, 0.05, -0.035], [0, 0.125, -0.042], [0.008, 0.175, -0.002], [0.022, 0.182, 0.066], [0.042, 0.142, 0.118], [0.062, 0.088, 0.122]];
const TAIL_R = [0.040, 0.055, 0.066, 0.071, 0.067, 0.056, 0.040];
const LEG = { // segment lengths, per-segment tube sections [s, halfWidth, halfDepth], joint in root space
  F: { L: [0.139, 0.225, 0.045], secs: [[[-0.03, 0.038, 0.052], [0.139, 0.031, 0.036]], [[-0.015, 0.030, 0.033], [0.225, 0.021, 0.023]], [[-0.012, 0.022, 0.024], [0.045, 0.024, 0.026]]], at: v3(0.068, 0.43, 0.205), paw: 1.12, region: 'legF' },
  H: { L: [0.162, 0.175, 0.111], secs: [[[-0.05, 0.052, 0.074], [0.162, 0.034, 0.042]], [[-0.015, 0.033, 0.038], [0.175, 0.021, 0.024]], [[-0.012, 0.022, 0.024], [0.111, 0.023, 0.025]]], at: v3(0.066, 0.445, -0.245), paw: 1.05, region: 'legH' },
};
export const DOG_SIZE = { withers: 0.58, length: Z1 - Z0, headTop: 0.72 };

/* ================================================================ atlas (128x128, row 0 = v 0) */
const AW = 128, AH = 128;
const RG = {
  torso: { x: 0, y: 0, w: 64, h: 64 },   // u around (0 left flank, .25 belly, .5 right flank, .75 spine), v rump -> brisket
  head: { x: 64, y: 0, w: 64, h: 32 },   // u around, v occiput -> nose
  tail: { x: 64, y: 32, w: 32, h: 32 },  // u around (.75 outer side of the curl), v base -> tip
  ear: { x: 96, y: 32, w: 16, h: 16 },   // inner ear (front face)
  earB: { x: 112, y: 32, w: 16, h: 16 }, // outer fur
  nose: { x: 96, y: 48, w: 16, h: 16 },
  jaw: { x: 112, y: 48, w: 16, h: 16 },  // bottom half chin fur, top half mouth + tongue
  legF: { x: 0, y: 64, w: 32, h: 64 },   // u around (.75 front), v shoulder -> wrist
  legH: { x: 32, y: 64, w: 32, h: 64 },  // v hip -> paw
  neck: { x: 64, y: 64, w: 32, h: 32 },  // u around (.75 nape, .25 throat), v base -> head
  collar: { x: 96, y: 64, w: 32, h: 8 },
  ring: { x: 96, y: 72, w: 16, h: 16 },  // alpha-cut iron ring
  paw: { x: 112, y: 72, w: 16, h: 16 },  // bottom half pads, top half toes
  lid: { x: 96, y: 88, w: 16, h: 8 },    // closed eyelid (alpha-cut ellipse)
  bris: { x: 64, y: 96, w: 16, h: 16 }, // brisket end cap (planar)
  rump: { x: 80, y: 96, w: 16, h: 16 }, // rump end cap (planar)
};
export const DOG_ATLAS_REGIONS = RG;
const uvR = (R, fx, fy) => [(R.x + 0.5 + clamp(fx, 0, 1) * (R.w - 1)) / AW, (R.y + 0.5 + clamp(fy, 0, 1) * (R.h - 1)) / AH];
const dTop = (u, top = 0.75) => Math.abs(((((u - top) % 1) + 1.5) % 1) - 0.5); // 0 = top line, 0.5 = opposite side

function paintAtlas() {
  const pc = new PixelCanvas(AW, AH, [60, 56, 52]);
  const r = rng(907);
  const nS = valueNoise(901, 32, 32), nM = valueNoise(902, 8, 8), nL = valueNoise(903, 4, 4);
  const put = (R, x, y, c, a = 255) => pc.set(R.x + x, R.y + y, c.map((q) => clamp(Math.round(q), 0, 255)), a);
  const jit = (c, a = 0.1) => mulc(c, 1 - a / 2 + r() * a);
  const paint = (R, fn) => { for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) fn(x, y, x / (R.w - 1), y / (R.h - 1)); };
  const fur = (c, st) => (r() < 0.07 ? mulc(c, 0.78) : r() < 0.05 ? mixc(c, [255, 250, 240], 0.18) : c); // guard-hair speckle
  const cream = (st) => mixc(C.creamD, C.white, clamp(st * 1.2 - 0.1, 0, 1));
  const gb = (v, m, s) => Math.exp(-(((v - m) / s) ** 2));

  /* torso: ash flanks with ginger lower sides, dark saddle along the spine (widest over the shoulders), cream belly + chest */
  paint(RG.torso, (x, y, u, v) => {
    const d = dTop(u), st = nS(x * 0.45, y * 1.3), nE = (nM(x / 3, y / 3) - 0.5) * 0.07;
    let c = mixc(C.ash, C.ashL, clamp(st * 1.1 - 0.2, 0, 1));
    const g = clamp((d - 0.17) / 0.12, 0, 1) * 0.85 + 0.3 * Math.max(gb(v, 0.66, 0.16), gb(v, 0.2, 0.12)) * clamp((d - 0.1) / 0.1, 0, 1);
    c = mixc(c, mixc(C.ginD, C.ginL, st), clamp(g + nE, 0, 1));
    const sw = 0.08 + 0.075 * gb(v, 0.66, 0.2) + 0.02 * gb(v, 0.25, 0.12) + nE;
    if (d < sw) c = mixc(C.sadD, C.sadL, st * 0.9);
    else if (d < sw + 0.06) c = mixc(c, C.sad, (1 - (d - sw) / 0.06) * (r() < 0.6 ? 0.85 : 0.35));
    const cl = 0.37 - 0.16 * smooth(clamp((v - 0.74) / 0.2, 0, 1)) - 0.08 * smooth(clamp((0.16 - v) / 0.16, 0, 1)) + nE;
    if (d > cl) c = mixc(c, cream(st), clamp((d - cl) / 0.04, 0, 1));
    put(RG.torso, x, y, jit(fur(c, st), 0.1));
  });
  /* neck: saddle runs up the nape, ginger-ash ruff, cream throat */
  paint(RG.neck, (x, y, u, v) => {
    const d = dTop(u), st = nS(x * 0.6 + 7, y * 0.9 + 3), nE = (nM(x / 3 + 5, y / 3) - 0.5) * 0.06;
    let c = mixc(C.ash, C.ashL, st);
    c = mixc(c, mixc(C.ginD, C.gin, st), clamp((d - 0.15) / 0.1, 0, 1) * 0.85);
    if (d < 0.12 - v * 0.06 + nE) c = mixc(C.sadD, C.sadL, st);
    if (d > 0.32 + nE) c = mixc(c, cream(st), clamp((d - 0.32 - nE) / 0.05, 0, 1));
    put(RG.neck, x, y, jit(fur(c, st), 0.1));
  });
  /* head: grey crown with a dark forehead line, ginger cheeks, cream lower face + muzzle sides, dark bridge, mouth roof */
  paint(RG.head, (x, y, u, v) => {
    const d = dTop(u), st = nS(x * 0.8 + 20, y * 0.9), nE = (nM(x / 3 + 9, y / 2) - 0.5) * 0.05;
    let c = mixc(C.ash, C.ashL, st * 0.8);
    if (v < 0.3) c = mixc(c, C.ashD, 0.35);
    if (d < 0.035 && v > 0.16 && v < 0.6) c = mixc(c, C.sad, 0.75);
    c = mixc(c, mixc(C.ginD, C.gin, st), clamp((d - 0.11 + nE) / 0.08, 0, 1) * 0.9);
    const cl = 0.29 - 0.11 * smooth(clamp((v - 0.5) / 0.25, 0, 1)) + nE;
    if (d > cl) c = mixc(c, cream(st), clamp((d - cl) / 0.05, 0, 1));
    if (v > 0.58 && d < 0.13) c = mixc(c, mixc(C.ginD, C.ashD, clamp((v - 0.68) / 0.25, 0, 1)), 0.75 * (1 - d / 0.13));
    if (v > 0.6 && d > 0.43) c = mixc(C.mouth, C.tongueD, st * 0.4);
    put(RG.head, x, y, jit(c, 0.08));
  });
  for (const s of [1, -1]) { // amber eyes with a dark rim, pale "brow" spots above them
    const R = RG.head, ex = (((0.75 + s * 0.105) % 1) * (R.w - 1)), ey = 0.53 * (R.h - 1);
    const bx = (((0.75 + s * 0.068) % 1) * (R.w - 1)), by = 0.46 * (R.h - 1);
    for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) {
      const px = Math.round(ex + x), py = Math.round(ey + y), dx = (px - ex) / 1.55, dy = (py - ey) / 1.05, q = Math.hypot(dx, dy);
      if (q < 0.62) put(R, px, py, Math.abs(px - ex) < 0.6 && Math.abs(py - ey) < 0.6 ? C.pupil : C.eyeL);
      else if (q < 1.05) put(R, px, py, C.eye);
      else if (q < 1.7) put(R, px, py, C.sadD);
      const bq = Math.hypot((px - bx) / 1.2, (py - by) / 0.8);
      if (bq < 0.9 && q >= 1.7) put(R, px, py, C.cream);
    }
  }
  /* tail: dark grizzled outer side of the curl, ginger edges, cream inner side, darker tip */
  paint(RG.tail, (x, y, u, v) => {
    const d = dTop(u), st = nS(x * 0.5 + 40, y * 0.55), nE = (nM(x / 3, y / 3 + 4) - 0.5) * 0.06;
    let c = mixc(C.ash, C.ashL, st);
    if (d < 0.14 + nE) c = mixc(C.sad, C.sadL, st);
    c = mixc(c, C.gin, clamp((d - 0.2) / 0.1, 0, 1) * 0.6);
    if (d > 0.3 + nE) c = mixc(c, cream(st), clamp((d - 0.3 - nE) / 0.06, 0, 1));
    if (v > 0.84) c = mixc(c, C.sadD, ((v - 0.84) / 0.16) * (d < 0.3 ? 0.7 : 0.25));
    put(RG.tail, x, y, jit(fur(c, st), 0.1));
  });
  /* legs: body colour at the top, ginger fronts, cream backs, white socks and paws */
  paint(RG.legF, (x, y, u, v) => {
    const d = dTop(u), st = nS(x * 0.7 + 60, y * 0.5);
    let c = v < 0.3 ? mixc(mixc(C.ash, C.ashL, st), C.gin, clamp(v / 0.3, 0, 1) * 0.6) : mixc(C.ginD, C.gin, st);
    if (d > 0.3 - v * 0.15) c = mixc(c, cream(st), 0.85);
    if (v > 0.66 + (nM(x / 2, 3) - 0.5) * 0.1) c = mixc(c, cream(st), clamp((v - 0.66) / 0.08, 0, 1));
    put(RG.legF, x, y, jit(fur(c, st), 0.1));
  });
  paint(RG.legH, (x, y, u, v) => {
    const d = dTop(u), st = nS(x * 0.7 + 90, y * 0.5);
    let c = v < 0.42 ? mixc(mixc(C.ash, C.ashL, st), C.gin, clamp((v - 0.1) / 0.32, 0, 1) * 0.55) : mixc(C.ginD, C.gin, st);
    if (v < 0.2 && d < 0.12) c = mixc(c, C.sad, 0.5);
    if (d > 0.3 - (v < 0.42 ? 0.04 : 0)) c = mixc(c, cream(st), 0.85); // pale "breeches"
    if (v > 0.74 + (nM(x / 2, 6) - 0.5) * 0.1) c = mixc(c, cream(st), clamp((v - 0.74) / 0.08, 0, 1));
    put(RG.legH, x, y, jit(fur(c, st), 0.1));
  });
  /* paw: toes (top half), pads + claws (bottom half) */
  paint(RG.paw, (x, y, u, v) => {
    let c;
    if (v >= 0.5) { c = cream(nS(x, y)); if (v > 0.62 && (x === 5 || x === 10) && r() < 0.8) c = mulc(C.creamD, 0.72); if (v > 0.93) c = C.claw; }
    else { c = C.pad; if (r() < 0.2) c = mulc(C.pad, 1.4); if (v > 0.42) c = C.claw; }
    put(RG.paw, x, y, jit(c, 0.08));
  });
  /* ears: inner pale fur with a dark rim / outer dark fur, ginger base */
  paint(RG.ear, (x, y, u, v) => {
    const hw = 0.5 * (1 - v), e = hw - Math.abs(u - 0.5);
    let c = e < 0.1 ? C.sad : mixc(mixc(C.cream, C.tongue, 0.18), C.creamD, nS(x * 2, y));
    if (e > 0.1 && (x + y) % 5 === 0) c = mulc(c, 0.86);
    put(RG.ear, x, y, jit(c, 0.08));
  });
  paint(RG.earB, (x, y, u, v) => {
    const st = nS(x * 2 + 3, y * 2);
    let c = mixc(C.sad, C.sadL, st);
    if (v < 0.3) c = mixc(c, C.ginD, (0.3 - v) / 0.3 * 0.7);
    put(RG.earB, x, y, jit(c, 0.08));
  });
  /* nose leather */
  paint(RG.nose, (x, y, u, v) => {
    let c = C.nose;
    if (v > 0.62 && Math.abs(u - 0.5) < 0.22) c = C.noseL;
    if (v > 0.3 && v < 0.46 && Math.abs(Math.abs(u - 0.5) - 0.17) < 0.08) c = [6, 5, 5];
    put(RG.nose, x, y, jit(c, 0.1));
  });
  /* jaw: chin fur below, mouth + tongue above */
  paint(RG.jaw, (x, y, u, v) => {
    let c;
    if (v < 0.5) c = cream(nS(x * 2 + 50, y * 2));
    else { const e = Math.abs(u - 0.5); c = e < 0.3 ? mixc(C.tongue, C.tongueD, r() * 0.4 + (e > 0.22 ? 0.4 : 0)) : C.mouth; if (Math.abs(u - 0.5) < 0.04 && v > 0.6) c = C.tongueD; }
    put(RG.jaw, x, y, jit(c, 0.08));
  });
  /* collar: worn leather with stitch rows and a small iron buckle on the nape */
  paint(RG.collar, (x, y, u) => {
    let c = mixc(C.lea, C.leaL, nS(x * 1.5, y * 3) * 0.7);
    if (y === 0 || y === 7) c = C.leaD;
    if ((y === 1 || y === 6) && x % 2 === 0) c = C.stitch;
    if (r() < 0.06) c = mulc(c, 0.75);
    if (Math.abs(u - 0.75) < 0.07) { c = Math.abs(u - 0.75) > 0.045 || y === 0 || y === 7 ? C.ironL : C.lea; if (Math.abs(u - 0.75) < 0.015) c = C.iron; }
    put(RG.collar, x, y, jit(c, 0.08));
  });
  /* end caps: cream brisket with ginger shoulders; ash rump with a dark saddle top and pale breeches */
  paint(RG.bris, (x, y, u, v) => {
    const st = nS(x * 1.6 + 70, y * 1.6), e = Math.abs(u - 0.5);
    let c = cream(st);
    if (v < 0.32 - e * 0.3) c = mixc(c, mixc(C.ginD, C.gin, st), 0.7);
    if (e > 0.36) c = mixc(c, C.gin, 0.5);
    put(RG.bris, x, y, jit(fur(c, st), 0.08));
  });
  paint(RG.rump, (x, y, u, v) => {
    const st = nS(x * 1.6 + 90, y * 1.6), e = Math.abs(u - 0.5);
    let c = mixc(C.ash, C.ashL, st);
    if (v < 0.22) c = mixc(C.sad, C.sadL, st);
    if (v > 0.45) c = mixc(c, mixc(C.ginD, C.gin, st), 0.4);
    if (v > 0.6 && e < 0.3) c = mixc(c, cream(st), 0.8);
    put(RG.rump, x, y, jit(fur(c, st), 0.08));
  });
  /* closed eyelid: grey fur ellipse with a dark lash line */
  paint(RG.lid, (x, y, u, v) => {
    const e = Math.hypot((u - 0.5) / 0.5, (v - 0.5) / 0.5), yl = x < 4 || x > 11 ? 4 : 3;
    const c = y === yl && x >= 2 && x <= 13 ? C.sadD : y === yl + 1 && x >= 4 && x <= 11 ? mixc(C.ashD, C.sadD, 0.4) : mixc(C.ash, C.ashD, 0.2 + r() * 0.2);
    put(RG.lid, x, y, c, e < 1.25 ? 255 : 0);
  });
  /* iron ring (alpha cut) */
  paint(RG.ring, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    const on = d > 4.6 && d < 7.1;
    put(RG.ring, x, y, on ? (d < 5.4 ? C.ironD : x + y < 13 ? C.ironL : C.iron) : C.ironD, on ? 255 : 0);
  });
  return { pc, tex: pc.texture(false) };
}
let ATLAS = null;
const atlas = () => (ATLAS ||= paintAtlas());

/* ================================================================ geometry helpers */
// Cross-section ring in the frame (e1, e2 = tangent, e3 = e1 x e2); a = 0 -> +e1, a = 90deg -> +e3.
// hp / hn = extent towards +e3 / -e3; ex < 1 makes the section slightly boxy.
function secRing(n, c, e1, e3, w, hp, hn, ex, phase) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const cx = Math.sign(ca) * Math.pow(Math.abs(ca), ex), sx = Math.sign(sa) * Math.pow(Math.abs(sa), ex);
    pts.push(c.clone().addScaledVector(e1, cx * w).addScaledVector(e3, sx * (sa > 0 ? hp : hn)));
  }
  return pts;
}
function tube(mb, secs, n, o = {}) {
  const ex = o.ex ?? 0.85, phase = o.phase ?? 0;
  const rings = secs.map((s) => ({ pts: secRing(n, s.c, s.e1 || AX, s.e3, s.w, s.hp, s.hn ?? s.hp, s.ex ?? ex, phase), hard: !!s.hard, s }));
  loft(mb, rings, { flat: !!o.flat, uv: (r, kk, p, f, cap) => o.uv(rings[r].s, kk / n, p, f, cap, r), capStart: o.capStart, capEnd: o.capEnd });
  return mb;
}
// Convex facet, fan-triangulated, wound so it faces away from `inside`.
function facet(mb, pts, inside, uvf) {
  const n = new V3().subVectors(pts[1], pts[0]).cross(new V3().subVectors(pts[2], pts[0]));
  const cen = pts.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / pts.length);
  if (n.dot(cen.sub(inside)) < 0) { pts = pts.slice().reverse(); n.negate(); }
  n.normalize();
  for (let i = 1; i < pts.length - 1; i++) {
    const P = [pts[0], pts[i], pts[i + 1]];
    mb.tri(P, [n, n, n], P.map((p) => uvf(p, n)), [W1, W1, W1]);
  }
}

/* ================================================================ part meshes (built in their joint frames) */
const torsoSecs = (list) => list.map(([z, yt, yb, w]) => ({ c: v3(0, (yt + yb) / 2, z), e3: v3(0, -1, 0), w, hp: (yt - yb) / 2 }));
const planar = (R, s) => (p) => uvR(R, 0.5 + p.x / (2.1 * s.w), 0.5 - (p.y - s.c.y) / (2.1 * s.hp));
const torsoUV = (R) => (s, u, p, f, cap) => (cap ? planar(R, s)(p) : uvR(RG.torso, u, (p.z - Z0) / (Z1 - Z0)));
function hipsMesh() {
  const mb = new MeshBuilder(), secs = torsoSecs(TORSO_H);
  tube(mb, secs, 8, { uv: torsoUV(RG.rump), capStart: { apex: RUMP.clone(), smooth: true, uv: planar(RG.rump, secs[0]) } });
  return { mb, off: HIP };
}
function chestMesh() {
  const mb = new MeshBuilder(), secs = torsoSecs(TORSO_C);
  tube(mb, secs, 8, { uv: torsoUV(RG.bris), capStart: {}, capEnd: { apex: BRISKET.clone(), smooth: true, uv: planar(RG.bris, secs[secs.length - 1]) } });
  return { mb, off: CHEST };
}
const neckSecs = (list, grow = 0) => list.map(([s, w, t, n]) => ({ c: v3(0, s, 0), e3: v3(0, 0, 1), w: w + grow, hp: t + grow, hn: n + grow, s }));
function neckMesh() {
  const mb = new MeshBuilder();
  tube(mb, neckSecs(NECK), 8, { uv: (s, u) => uvR(RG.neck, u, (s.s - NECK[0][0]) / (NECK[2][0] - NECK[0][0])) });
  return { mb };
}
function collarMesh() {
  const mb = new MeshBuilder();
  const S = [[0.008, 0.003], [0.027, 0.012], [0.046, 0.003]].map(([s, g]) => [...neckAt(s), g]);
  const secs = S.map(([s, w, t, n, g], i) => ({ c: v3(0, s, 0), e3: v3(0, 0, 1), w: w + g, hp: t + g, hn: n + g, v: i / 2 }));
  tube(mb, secs, 8, { uv: (s, u) => uvR(RG.collar, u, s.v) });
  // iron ring hanging under the throat (two quads, front + back)
  const down = v3(0, -Math.cos(NECK_A), Math.sin(NECK_A)), fwd = v3(0, Math.sin(NECK_A), Math.cos(NECK_A));
  const c = v3(0, 0.027, neckAt(0.027)[2] + 0.012).addScaledVector(down, 0.018).addScaledVector(fwd, 0.004), h = 0.016;
  const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => c.clone().addScaledVector(AX, a * h).addScaledVector(down, -b * h));
  const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => uvR(RG.ring, a, b));
  for (const sd of [1, -1]) {
    const n = fwd.clone().multiplyScalar(sd), idx = sd > 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
    const Q = idx.map((i) => P[i]), U = idx.map((i) => uvq[i]);
    const nn = new V3().subVectors(Q[1], Q[0]).cross(new V3().subVectors(Q[2], Q[0]));
    const ord = nn.dot(n) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (let t = 0; t < 6; t += 3) mb.tri([Q[ord[t]], Q[ord[t + 1]], Q[ord[t + 2]]], [n, n, n], [U[ord[t]], U[ord[t + 1]], U[ord[t + 2]]], [W1, W1, W1]);
  }
  return { mb };
}
function headMesh() {
  const mb = new MeshBuilder();
  const secs = HEAD.map(([z, yt, yb, w]) => ({ c: v3(0, (yt + yb) / 2, z), e3: v3(0, -1, 0), w, hp: (yt - yb) / 2 }));
  const last = secs.length - 1;
  tube(mb, secs, 8, {
    ex: 0.8,
    uv: (s, u, p, f, cap, r) => (cap && r === last ? uvR(RG.nose, 0.5 + p.x / 0.042, 0.5 + (p.y + 0.004) / 0.038) : uvR(RG.head, u, (p.z - HZ0) / (HZ1 - HZ0))),
    capStart: { apex: v3(0, 0.03, HZ0), smooth: true },
    capEnd: { apex: v3(0, -0.004, HZ1), smooth: true, blend: 0.9, uv: () => uvR(RG.nose, 0.5, 0.55) },
  });
  return { mb };
}
function jawMesh() {
  const mb = new MeshBuilder();
  const secs = [[0, 0.046, 0.0, -0.028], [0.118, 0.020, 0.008, -0.012]].map(([z, w, yt, yb]) => ({ c: v3(0, (yt + yb) / 2, z), e3: v3(0, -1, 0), w, hp: (yt - yb) / 2 }));
  const uv = (s, u, p, f) => (f.y > 0.5 ? uvR(RG.jaw, 0.5 + p.x / 0.095, 0.5 + 0.5 * clamp(p.z / 0.125, 0, 1)) : uvR(RG.jaw, u, 0.45 * clamp(p.z / 0.125, 0, 1)));
  tube(mb, secs, 4, { ex: 1, phase: Math.PI / 4, uv, capStart: {}, capEnd: { apex: v3(0, -0.003, 0.128) } });
  return { mb };
}
function lidMesh() { // closed eyelids: flat alpha-cut patches lying on the head facets over the painted eyes
  const mb = new MeshBuilder();
  const EZ = HZ0 + 0.53 * (HZ1 - HZ0), q = Math.pow(Math.SQRT1_2, 0.8);
  let j = 0; while (j < HEAD.length - 2 && HEAD[j + 1][0] < EZ) j++;
  const t = (EZ - HEAD[j][0]) / (HEAD[j + 1][0] - HEAD[j][0]);
  const edge = ([z, yt, yb, w], sd) => [v3(0, yt, z), v3(sd * w * q, (yt + yb) / 2 + ((yt - yb) / 2) * q, z)];
  for (const sd of [1, -1]) {
    const [ta, va] = edge(HEAD[j], sd), [tb, vb] = edge(HEAD[j + 1], sd);
    const Pa = ta.clone().lerp(va, 0.84), Pb = tb.clone().lerp(vb, 0.84), c = Pa.clone().lerp(Pb, t);
    const ez = new V3().subVectors(Pb, Pa).normalize();
    const eu0 = new V3().subVectors(va, ta).lerp(new V3().subVectors(vb, tb), t);
    const n = eu0.clone().cross(ez).normalize(), mid = v3(0, c.y - 0.03, c.z);
    if (n.dot(new V3().subVectors(c, mid)) < 0) n.negate();
    const eu = ez.clone().cross(n).normalize(); if (eu.dot(eu0) < 0) eu.negate();
    c.addScaledVector(n, 0.0018);
    const hu = 0.019, hz = 0.019;
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => c.clone().addScaledVector(eu, a * hu).addScaledVector(ez, b * hz));
    facet(mb, P, mid, (p) => { const d = new V3().subVectors(p, c); return uvR(RG.lid, 0.5 + d.dot(ez) / (2 * hz), 0.5 + d.dot(eu) / (2 * hu)); });
  }
  return { mb };
}
function tongueMesh() { // panting tongue: a thin double-sided strip over the lower lip
  const mb = new MeshBuilder();
  const P = [v3(-0.016, 0.002, 0.06), v3(0.016, 0.002, 0.06), v3(0.014, -0.032, 0.138), v3(-0.014, -0.032, 0.138)];
  const U = [[0.38, 0.62], [0.62, 0.62], [0.6, 0.98], [0.4, 0.98]].map(([a, b]) => uvR(RG.jaw, a, b));
  const n = new V3().subVectors(P[1], P[0]).cross(new V3().subVectors(P[2], P[0])).normalize();
  if (n.y < 0) n.negate();
  mb.tri([P[0], P[2], P[1]], [n, n, n], [U[0], U[2], U[1]]); mb.tri([P[0], P[3], P[2]], [n, n, n], [U[0], U[3], U[2]]);
  const m = n.clone().negate();
  mb.tri([P[0], P[1], P[2]], [m, m, m], [U[0], U[1], U[2]]); mb.tri([P[0], P[2], P[3]], [m, m, m], [U[0], U[2], U[3]]);
  return { mb };
}
function earMesh() {
  const mb = new MeshBuilder();
  const fl = v3(-0.025, -0.004, 0.011), fr = v3(0.025, -0.004, 0.011), br = v3(0.021, -0.004, -0.013), bl = v3(-0.021, -0.004, -0.013), ap = v3(0, 0.085, -0.008);
  const inside = v3(0, 0.02, -0.002);
  const pl = (R) => (p) => uvR(R, 0.5 + p.x / 0.05, (p.y + 0.004) / 0.089);
  facet(mb, [fl, fr, ap], inside, pl(RG.ear));
  facet(mb, [fr, br, ap], inside, pl(RG.earB));
  facet(mb, [br, bl, ap], inside, pl(RG.earB));
  facet(mb, [bl, fl, ap], inside, pl(RG.earB));
  return { mb };
}
function tailMesh() {
  const mb = new MeshBuilder();
  const curve = new THREE.CatmullRomCurve3(TAIL_PTS.map((p) => v3(...p)));
  const ts = [0, 0.15, 0.3, 0.46, 0.62, 0.78, 0.92];
  const secs = ts.map((t, i) => {
    const c = curve.getPointAt(t), tg = curve.getTangentAt(t).normalize();
    const e1 = AX.clone().addScaledVector(tg, -AX.dot(tg)).normalize(), e3 = e1.clone().cross(tg);
    return { c, e1, e3, w: TAIL_R[i] * 1.12, hp: TAIL_R[i] * 0.95, hn: TAIL_R[i], t };
  });
  tube(mb, secs, 6, { uv: (s, u) => uvR(RG.tail, u, s.t), capEnd: { apex: curve.getPointAt(1), smooth: true } });
  return { mb };
}
function legSegMesh(spec, i) {
  const mb = new MeshBuilder(), Ls = spec.L, tot = Ls[0] + Ls[1] + Ls[2], s0 = Ls.slice(0, i).reduce((a, b) => a + b, 0);
  const secs = spec.secs[i].map(([s, w, d]) => ({ c: v3(0, -s, 0), e3: v3(0, 0, -1), w, hp: d, s }));
  tube(mb, secs, 6, { uv: (s, u) => uvR(RG[spec.region], u, (s0 + s.s) / tot), capEnd: i === 0 ? { smooth: true } : undefined });
  return { mb };
}
function pawMesh(k) {
  const mb = new MeshBuilder();
  const yb = -0.03, ytB = 0.01, ytF = -0.012, zB = -0.024, zF = 0.046, wB = 0.019, wF = 0.023;
  const P = [v3(-wB, yb, zB), v3(wB, yb, zB), v3(wF, yb, zF), v3(-wF, yb, zF), v3(-wB, ytB, zB), v3(wB, ytB, zB), v3(wF * 0.92, ytF, zF), v3(-wF * 0.92, ytF, zF)].map((p) => p.multiplyScalar(k));
  const inside = v3(0, -0.01, 0.01).multiplyScalar(k);
  const top = (p) => uvR(RG.paw, 0.5 + p.x / (0.05 * k), 0.5 + 0.5 * clamp((p.z - zB * k) / ((zF - zB) * k), 0, 1));
  const bot = (p) => uvR(RG.paw, 0.5 + p.x / (0.05 * k), 0.5 * clamp((p.z - zB * k) / ((zF - zB) * k), 0, 1));
  for (const [ids, f] of [[[4, 5, 6, 7], top], [[0, 1, 2, 3], bot], [[3, 2, 6, 7], top], [[1, 2, 6, 5], top], [[0, 3, 7, 4], top], [[0, 1, 5, 4], top]]) facet(mb, ids.map((i) => P[i]), inside, f);
  return { mb };
}

/* ================================================================ poses */
const STAND_F = [0.185, 0.03, deg(-12), 0, 0], STAND_H = [-0.265, 0.03, deg(-8), 0, 0];
const P0 = () => ({
  hy: 0, hz: 0, hp: 0, hyaw: 0, hr: 0, cp: 0, cyaw: 0, cr: 0, np: 0, nyaw: 0, dp: 0, dyaw: 0, dr: 0,
  jaw: 0.015, tongue: 0, lid: 0, earL: 0, earR: 0, earS: 0, tp: 0, ty: 0, tr: 0, br: 0,
  FL: STAND_F.slice(), FR: STAND_F.slice(), HL: STAND_H.slice(), HR: STAND_H.slice(),
});
function lerpPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(b)) o[k] = Array.isArray(b[k]) ? b[k].map((x, i) => lerp(a[k][i], x, t)) : lerp(a[k], b[k], t);
  return o;
}
const flick = (t, period, off, len = 0.28) => { const x = (((t + off) % period) + period) % period / len; return x < 1 ? Math.sin(Math.PI * x) : 0; };
const pulse = (x, a, len) => (x >= a && x <= a + len ? Math.pow(Math.sin((Math.PI * (x - a)) / len), 0.7) : 0);
const TAU = Math.PI * 2;

function sitBase() {
  const P = P0();
  Object.assign(P, { hy: -0.272, hz: 0.045, hp: deg(-40), cp: deg(-9), np: deg(30), dp: deg(14), tp: deg(28), tr: deg(-12) });
  P.FL = [0.178, 0.03, deg(-6), 0, 0]; P.FR = P.FL.slice();
  P.HL = [0.03, 0.03, deg(-82), 0, 0.012]; P.HR = P.HL.slice(); P.HR[4] = -0.012;
  return P;
}
function stepLeg(ph, home, stride, lift, flexB, flexG) {
  const st = 0.64, out = home.slice();
  if (ph < st) {
    const k = ph / st;
    out[0] = home[0] + stride * (0.5 - k);
    out[2] = home[2] + deg(16) * smooth(clamp((k - 0.72) / 0.28, 0, 1));
  } else {
    const k = (ph - st) / (1 - st), e = 0.5 - 0.5 * Math.cos(Math.PI * k), s = Math.sin(Math.PI * k);
    out[0] = home[0] + stride * (e - 0.5);
    out[1] = home[1] + lift * s;
    out[2] = home[2] + flexB * Math.sin(Math.PI * Math.min(1, k * 1.2));
    out[3] = home[3] + flexG * s;
  }
  return out;
}
const WALK_T = 0.9, STRIDE = 0.22;

const ANIM = {
  stand(t) {
    const P = P0();
    P.br = 0.012 * Math.sin(t * 2.3);
    P.dyaw = 0.28 * Math.sin(t * 0.42) + 0.08 * Math.sin(t * 1.07 + 1); P.nyaw = 0.35 * P.dyaw;
    P.dp = 0.05 * Math.sin(t * 0.31 + 2); P.dr = 0.05 * Math.sin(t * 0.37);
    P.earL = 0.5 * flick(t, 3.7, 0); P.earR = 0.5 * flick(t, 5.1, 1.7); P.lid = flick(t, 4.3, 0.6, 0.16);
    P.ty = 0.1 * Math.sin(t * 1.4);
    return P;
  },
  sit(t) {
    const P = sitBase();
    P.br = 0.012 * Math.sin(t * 2.1);
    P.dyaw = 0.42 * Math.sin(t * 0.38) + 0.1 * Math.sin(t * 1.3); P.nyaw = 0.3 * P.dyaw;
    P.dr = 0.07 * Math.sin(t * 0.5 + 1); P.dp += 0.05 * Math.sin(t * 0.27);
    P.earL = 0.45 * flick(t, 4.3, 0.5); P.earR = 0.45 * flick(t, 3.3, 2.0); P.lid = flick(t, 3.9, 1.4, 0.16);
    P.ty = 0.06 * Math.sin(t * 1.1);
    return P;
  },
  walk(t) {
    const P = P0(), ph = (t / WALK_T) % 1, s1 = Math.sin(TAU * ph), s2 = Math.cos(2 * TAU * ph);
    P.HL = stepLeg(ph % 1, STAND_H, STRIDE, 0.05, deg(28), deg(35));
    P.FL = stepLeg((ph + 0.75) % 1, STAND_F, STRIDE, 0.06, deg(72), deg(45));
    P.HR = stepLeg((ph + 0.5) % 1, STAND_H, STRIDE, 0.05, deg(28), deg(35));
    P.FR = stepLeg((ph + 0.25) % 1, STAND_F, STRIDE, 0.06, deg(72), deg(45));
    P.hy = -0.008 + 0.007 * s2; P.hyaw = 0.04 * s1; P.hr = 0.03 * s1; P.cyaw = -0.06 * s1; P.cr = -0.02 * s1;
    P.dp = deg(6) + 0.035 * s2; P.np = deg(6); P.nyaw = 0.04 * s1;
    P.ty = 0.18 * s1; P.earL = P.earR = 0.12;
    return P;
  },
  bark(t) {
    const P = P0(), x = t % 1.5, b = Math.max(pulse(x, 0.0, 0.22), pulse(x, 0.36, 0.22));
    P.jaw = 0.04 + 0.44 * b;
    P.np = deg(-14) - 0.08 * b; P.dp = deg(-6) - 0.14 * b;
    P.hz = -0.012 * b; P.hy = -0.01 * b; P.cp = deg(-4) - 0.03 * b; P.br = 0.02 * b;
    P.FL = [0.236, 0.03, deg(-2), 0, 0.006]; P.FR = [0.236, 0.03, deg(-2), 0, -0.006];
    P.HL = [-0.282, 0.03, deg(-8), 0, 0.006]; P.HR = [-0.282, 0.03, deg(-8), 0, -0.006];
    P.earL = P.earR = -0.14; P.earS = -deg(5);
    P.tp = -0.18; P.ty = 0.05 * Math.sin(t * 9);
    return P;
  },
  sleep(t) {
    const P = P0();
    Object.assign(P, { hy: -0.378, hz: 0.02, hyaw: deg(-30), hr: deg(-10), cp: deg(2), cyaw: deg(58), cr: deg(6), np: deg(60), nyaw: deg(70), dp: deg(-52), dyaw: deg(50), dr: deg(-16) });
    P.br = 0.016 * Math.sin(t * 1.35);
    P.earL = 0.75 + 0.35 * flick(t, 6.2, 1); P.earR = 0.75; P.earS = deg(-6); P.lid = 1;
    P.jaw = 0.0; P.tp = deg(14); P.ty = deg(-52); P.tr = deg(-96) + 0.03 * Math.sin(t * 0.7);
    P.FL = [0.34, 0.025, deg(-84), 0, 0.03]; P.FR = [0.3, 0.025, deg(-84), 0, 0.0];
    P.HL = [-0.05, 0.03, deg(-86), 0, 0.03]; P.HR = [-0.08, 0.03, deg(-86), 0, -0.03];
    return P;
  },
  sniff(t) {
    const P = P0(), burst = 0.5 + 0.5 * Math.sin(t * 2.1);
    Object.assign(P, { hy: -0.035, hp: deg(5), cp: deg(14), np: deg(70), dp: deg(-12) });
    P.nyaw = 0.32 * Math.sin(t * 1.25); P.dyaw = 0.14 * Math.sin(t * 1.25 + 0.6); P.dr = -0.5 * P.dyaw;
    P.jaw = 0.02 + 0.03 * Math.abs(Math.sin(t * 19)) * burst;
    P.FL = [0.2, 0.03, deg(-22), 0, 0.004]; P.FR = [0.16, 0.03, deg(-20), 0, -0.004];
    P.earL = P.earR = -0.06; P.tp = 0.12; P.ty = 0.15 * Math.sin(t * 2.2);
    return P;
  },
  wag(t) {
    const P = P0(), w = Math.sin(t * TAU * 3.0);
    P.ty = 0.52 * w; P.tr = 0.15 * w; P.tp = -0.1;
    P.hyaw = -0.05 * w; P.cyaw = 0.04 * w; P.hr = 0.03 * w;
    P.earL = P.earR = 0.6; P.dr = 0.1 * Math.sin(t * 0.8); P.dp = -0.06; P.lid = flick(t, 3.1, 0.9, 0.16);
    P.jaw = 0.2 + 0.05 * Math.sin(t * 13); P.tongue = 1; P.br = 0.018 * Math.sin(t * 13);
    return P;
  },
  pet(t) { // sitting under the player's hand (first-person petting)
    const P = sitBase(), w = Math.sin(t * TAU * 2.2);
    P.dp = deg(-4) + 0.03 * Math.sin(t * 1.3); P.np = deg(22);
    P.earL = P.earR = 0.95; P.earS = deg(8); P.lid = flick(t, 2.6, 0.4, 1.1);
    P.jaw = 0.13 + 0.04 * Math.sin(t * 11); P.tongue = 1; P.br = 0.014 * Math.sin(t * 11);
    P.ty = 0.42 * w; P.tr = 0.1 * w;
    return P;
  },
};
export const DOG_ANIMS = [
  { id: 'stand', key: '1', label: 'Стоит', note: 'Спокойная стойка: дышит, оглядывается, поводит ушами.' },
  { id: 'sit', key: '2', label: 'Сидит', note: 'Сидит и вертит головой по сторонам.' },
  { id: 'walk', key: '3', label: 'Идёт', note: 'Цикл шага: лапы переставляются по очереди, корпус слегка качается.' },
  { id: 'bark', key: '4', label: 'Лает', note: 'Лает в темноту: упирается передними лапами, уши торчком, хвост поднят.' },
  { id: 'sleep', key: '5', label: 'Спит', note: 'Свернулась калачиком и укрылась хвостом, медленно дышит.' },
  { id: 'sniff', key: '6', label: 'Нюхает', note: 'Опустила нос к земле и водит им из стороны в сторону.' },
  { id: 'wag', key: '7', label: 'Виляет', note: 'Радуется хозяину: виляет хвостом, уши прижаты, дышит с открытой пастью.' },
  { id: 'pet', key: '8', label: 'Ласкается', note: 'Сидит под ладонью: жмурится, прижимает уши и метёт хвостом.' },
];
export const DOG_WALK_SPEED = STRIDE / (0.64 * WALK_T); // m/s when the walk cycle is played along a path

/* ================================================================ assembly */
export function makeDog() {
  const A = atlas();
  const mat = ps1Material({ map: A.tex });
  const group = new THREE.Group(); // placement in the world
  group.name = 'dog';
  const root = new THREE.Group(); // animation space (origin on the ground)
  group.add(root);
  const meshes = [], segs = {}, counts = {};
  let tris = 0;
  function seg(name, parent, pos, build, order = 'XYZ', count = name) {
    const g = new THREE.Group();
    g.name = 'dog-' + name; g.position.copy(pos); g.rotation.order = order;
    parent.add(g);
    g.userData.home = pos.clone();
    if (build) {
      const { mb, off } = build();
      const geo = mb.geometry();
      if (off) { geo.translate(-off.x, -off.y, -off.z); geo.computeBoundingSphere(); }
      const m = new THREE.Mesh(geo, mat);
      g.add(m); meshes.push(m); g.userData.mesh = m;
      tris += mb.tris; counts[count] = (counts[count] || 0) + mb.tris;
    }
    segs[name] = g;
    return g;
  }
  const hips = seg('hips', root, HIP, hipsMesh, 'YXZ', 'body');
  const chest = seg('chest', hips, CHEST.clone().sub(HIP), chestMesh, 'YXZ', 'body');
  const neck = seg('neck', chest, NECK0.clone().sub(CHEST), neckMesh, 'YXZ', 'body');
  const collar = seg('collar', neck, v3(0, 0, 0), collarMesh);
  const head = seg('head', neck, v3(0, NECK_L, 0), headMesh, 'XYZ');
  const jaw = seg('jaw', head, JAW0, jawMesh, 'XYZ', 'head');
  const tongue = seg('tongue', jaw, v3(0, 0, 0), tongueMesh, 'XYZ', 'head');
  const lids = seg('lids', head, v3(0, 0, 0), lidMesh, 'XYZ', 'head');
  const earL = seg('earL', head, EAR0, earMesh, 'XYZ', 'head');
  const earR = seg('earR', head, v3(-EAR0.x, EAR0.y, EAR0.z), earMesh, 'XYZ', 'head');
  const tail = seg('tail', hips, TAIL0.clone().sub(HIP), tailMesh, 'YXZ');
  const legs = {};
  for (const [id, kind, side] of [['FL', 'F', 1], ['FR', 'F', -1], ['HL', 'H', 1], ['HR', 'H', -1]]) {
    const S = LEG[kind], parent = kind === 'F' ? chest : hips, piv = kind === 'F' ? CHEST : HIP;
    const at = v3(S.at.x * side, S.at.y, S.at.z);
    const up = seg(id + '1', parent, at.clone().sub(piv), () => legSegMesh(S, 0), 'XYZ', 'legs');
    const lo = seg(id + '2', up, v3(0, -S.L[0], 0), () => legSegMesh(S, 1), 'XYZ', 'legs');
    const ft = seg(id + '3', lo, v3(0, -S.L[1], 0), () => legSegMesh(S, 2), 'XYZ', 'legs');
    const pw = seg(id + '4', ft, v3(0, -S.L[2], 0), () => pawMesh(S.paw), 'XYZ', 'legs');
    legs[id] = { id, front: kind === 'F', parent, up, lo, ft, pw, L: S.L, x: at.x, home: up.position.clone() };
  }
  for (const m of meshes) m.frustumCulled = false;

  /* explode offsets (parent space) + label anchors */
  const EX = [
    [chest, v3(0, 0.02, 0.11)], [neck, v3(0, 0.05, 0.07)], [head, v3(0, 0.1, 0)], [collar, v3(0, -0.01, 0.1)], [tail, v3(0, 0.1, -0.12)],
    [jaw, v3(0, -0.03, 0.01)], [earL, v3(0.02, 0.035, 0)], [earR, v3(-0.02, 0.035, 0)],
    ...Object.values(legs).map((L) => [L.up, v3(Math.sign(L.x) * 0.12, -0.05, 0)]),
  ];
  const parts = {
    head: { group: head, hw: 0.075, label: 'Голова', at: v3(0, 0.03, 0.06) },
    collar: { group: collar, hw: 0.09, label: 'Ошейник', at: v3(0, 0.03, 0) },
    chest: { group: chest, hw: 0.1, label: 'Грудь и лопатки', at: v3(0, 0.0, 0.12) },
    hips: { group: hips, hw: 0.09, label: 'Круп', at: v3(0, 0.0, -0.06) },
    legF: { group: legs.FL.lo, hw: 0.03, label: 'Передние лапы', at: v3(0, -0.1, 0) },
    legH: { group: legs.HL.lo, hw: 0.03, label: 'Задние лапы', at: v3(0, -0.08, 0) },
    tail: { group: tail, hw: 0.06, label: 'Хвост', at: v3(0.02, 0.17, 0.03) },
  };

  /* pose application + leg IK */
  const _Mh = new THREE.Matrix4(), _Mc = new THREE.Matrix4(), _Mi = new THREE.Matrix4(), _p = new V3(), _d = new V3();
  let explode = 0;
  function solveLeg(L, spec, Minv) {
    const [z, y, beta, gamma, dx = 0] = spec;
    const T = _p.set(L.x + dx, y, z).applyMatrix4(Minv);
    _d.set(0, -Math.cos(beta), -Math.sin(beta)).transformDirection(Minv);
    const bP = Math.atan2(-_d.z, -_d.y);
    _d.set(0, -Math.cos(gamma), -Math.sin(gamma)).transformDirection(Minv);
    const gP = Math.atan2(-_d.z, -_d.y);
    const S = L.home, [L1, L2, L3] = L.L;
    const Wy = T.y + L3 * Math.cos(bP), Wz = T.z + L3 * Math.sin(bP);
    const dy = Wy - S.y, dz = Wz - S.z;
    const d = clamp(Math.hypot(dy, dz), Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
    const tSW = Math.atan2(-dz, -dy);
    const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const t1 = tSW + (L.front ? al : -al);
    const Ey = S.y - L1 * Math.cos(t1), Ez = S.z - L1 * Math.sin(t1);
    const Wy2 = S.y - d * Math.cos(tSW), Wz2 = S.z - d * Math.sin(tSW);
    const t2 = Math.atan2(-(Wz2 - Ez), -(Wy2 - Ey));
    L.up.rotation.set(t1, 0, 0); L.lo.rotation.set(t2 - t1, 0, 0); L.ft.rotation.set(bP - t2, 0, 0); L.pw.rotation.set(gP - bP, 0, 0);
  }
  function applyPose(P) {
    hips.position.set(HIP.x, HIP.y + P.hy, HIP.z + P.hz); hips.rotation.set(P.hp, P.hyaw, P.hr);
    chest.position.copy(chest.userData.home); chest.rotation.set(P.cp, P.cyaw, P.cr);
    chest.userData.mesh.scale.set(1 + P.br * 0.6, 1 + P.br, 1 + P.br * 0.2);
    neck.rotation.set(NECK_A + P.np, P.nyaw, 0);
    head.rotation.set(-NECK_A + P.dp, P.dyaw, P.dr);
    jaw.rotation.set(P.jaw, 0, 0);
    tongue.visible = P.tongue > 0.5;
    lids.visible = P.lid > 0.5;
    earL.rotation.set(-P.earL, 0, -(EAR_SPLAY + P.earS)); earR.rotation.set(-P.earR, 0, EAR_SPLAY + P.earS);
    tail.rotation.set(P.tp, P.ty, P.tr);
    hips.updateMatrix(); chest.updateMatrix();
    _Mh.copy(hips.matrix); _Mc.multiplyMatrices(hips.matrix, chest.matrix);
    for (const L of Object.values(legs)) solveLeg(L, P[L.id], _Mi.copy(L.front ? _Mc : _Mh).invert());
    for (const [g, o] of EX) g.position.copy(g.userData.home).addScaledVector(o, explode);
    if (explode) hips.position.addScaledVector(v3(0, 0, -0.03), explode);
  }

  /* animation state */
  const st = { id: 'stand', t0: 0, from: null, bt: 0, blend: 0.35, pose: null, last: 0 };
  function setAnim(id, now = st.last, blend = 0.35) {
    if (!ANIM[id] || id === st.id) return;
    st.from = st.pose; st.id = id; st.bt = now; st.blend = blend;
  }
  function update(t) {
    st.last = t;
    let P = ANIM[st.id](t);
    if (st.from && st.blend > 0) {
      const k = (t - st.bt) / st.blend;
      if (k < 1 && k >= 0) P = lerpPose(st.from, P, smooth(k)); else st.from = null;
    }
    st.pose = P;
    applyPose(P);
    return P;
  }
  update(0);

  function setExplode(e) { explode = e; if (st.pose) applyPose(st.pose); }
  function addWire(wmat) {
    for (const m of meshes) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 1), wmat);
      l.visible = false; l.name = 'wire'; m.add(l);
    }
  }
  function setWire(on) { group.traverse((o) => { if (o.name === 'wire') o.visible = on; }); }
  const HEAD_TOP = v3(0, 0.094, 0.025);
  function headTop(out = new V3()) { head.updateWorldMatrix(true, false); return head.localToWorld(out.copy(HEAD_TOP)); }
  function headQuat(out = new THREE.Quaternion()) { head.updateWorldMatrix(true, false); return head.getWorldQuaternion(out); }

  return { group, root, segs, legs, parts, meshes, mat, tris, counts, setAnim, update, applyPose, setExplode, addWire, setWire, headTop, headQuat, state: st, atlasPx: A.pc };
}
