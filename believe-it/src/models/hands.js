// "Believe It" — the hero's first-person forearms and hands.
// Rigid PS1-style segments (no skinning): sleeve + sweater cuff on the forearm, palm + 3-segment digits on the wrist.
// Local frames: forearm root at the elbow, +Y towards the wrist; hand at the wrist, +Y distal, +Z dorsal,
// -X radial (thumb side) for the RIGHT hand. The left arm is the same rig under a parent with scale.x = -1.
import * as THREE from 'three';
import { MeshBuilder, loft, ring } from '../engine/geo.js';
import { ps1Material } from '../engine/ps1.js';
import { PixelCanvas, valueNoise, rng, hex, mixc, mulc, clamp, lerp, deg } from '../engine/util.js';

const V3 = THREE.Vector3;
export const FOREARM = 0.265;
export const UPPER_ARM = 0.30;

/* ================================================================ palette (from the approved concept sheet) */
const JK = { base: hex('#423d31'), dark: hex('#29261f'), light: hex('#5a5444'), groove: hex('#1a1814'), thread: hex('#6b6553'),
  patch: hex('#33271d'), patchSt: hex('#857455') };
const SW = { base: hex('#b4a896'), dark: hex('#81776a'), light: hex('#d3cab8'), dirt: hex('#8e7e68') };
const SK = { base: hex('#ad6c5c'), red: hex('#9b5045'), dark: hex('#6b3b33'), light: hex('#c88f78'), palm: hex('#be8a73'),
  nail: hex('#c49488'), nailEdge: hex('#cfb2a2'), cuticle: hex('#8c5248'), scar: hex('#e0b9a6'), scarEdge: hex('#8e4b42'),
  vein: hex('#7c5a5e'), callus: hex('#cca383') };

/* ================================================================ layout constants */
const SLEEVE_Y0 = -0.06, SLEEVE_Y1 = 0.222, PUFFS = 4;
const CUFF_Y0 = 0.17, CUFF_Y1 = 0.262;
export const PALM_X0 = -0.046, PALM_XW = 0.092, PALM_Y0 = -0.015, PALM_YH = 0.125, PALM_S = 0.9;
const BAND = { P: [0.0, 0.17], M: [0.17, 0.32], D: [0.32, 0.5] };

export const FINGERS = [
  { name: 'index', pos: [-0.0275, 0.0865, 0.0], len: [0.042, 0.024, 0.02], w: 0.0194, t: 0.0184, spread: 3 },
  { name: 'middle', pos: [-0.009, 0.09, 0.001], len: [0.045, 0.027, 0.021], w: 0.0199, t: 0.0187, spread: 0 },
  { name: 'ring', pos: [0.0095, 0.0875, 0.0], len: [0.042, 0.025, 0.02], w: 0.0189, t: 0.0178, spread: -3 },
  { name: 'pinky', pos: [0.0265, 0.0795, -0.002], len: [0.033, 0.019, 0.018], w: 0.0163, t: 0.0154, spread: -6 },
];
export const THUMB = {
  pos: [-0.021, 0.012, -0.009],
  len: [0.044, 0.032, 0.027],
  dims: [[0.026, 0.022], [0.0215, 0.019], [0.021, 0.0175]],
  y: new V3(-0.62, 0.74, -0.26).normalize(),
  zHint: new V3(-0.55, 0.0, 0.83),
};

/* ================================================================ textures */
function sleeveTexture(withPatch) {
  const W = 64, H = 128, pc = new PixelCanvas(W, H, JK.base);
  const nA = valueNoise(31, 16, 32), nB = valueNoise(32, 8, 16), r = rng(withPatch ? 33 : 34);
  pc.each((x, y) => {
    const v = (y + 0.5) / H;
    const t = v * PUFFS - Math.floor(v * PUFFS);
    const puff = Math.pow(Math.sin(Math.PI * t), 0.55);
    let c = mixc(JK.dark, JK.base, 0.28 + 0.72 * puff);
    c = mixc(c, JK.light, Math.pow(puff, 5) * 0.22);
    const m = nA(x / 4, y / 4) * 0.55 + nB(x / 8, y / 8) * 0.45;
    c = mixc(c, JK.light, clamp((m - 0.58) * 2.0, 0, 1) * 0.45);
    c = mixc(c, JK.dark, clamp((0.36 - m) * 2.0, 0, 1) * 0.4);
    if ((x + 2 * y) % 5 === 0) c = mulc(c, 0.94);
    pc.set(x, y, mulc(c, 0.92 + r() * 0.14));
  });
  for (let i = 1; i < PUFFS; i++) {
    const yr = Math.round((i / PUFFS) * H);
    for (let x = 0; x < W; x++) {
      pc.mix(x, yr, JK.groove, 0.85); pc.mix(x, yr - 1, JK.groove, 0.45); pc.mix(x, yr + 1, JK.groove, 0.25);
      if (x % 3 === 1) pc.mix(x, yr, JK.thread, 0.7);
    }
  }
  // sleeve seam on the ulnar-palmar side
  for (let y = 0; y < H; y++) { pc.mix(57, y, JK.groove, 0.55); if (y % 3 === 0) pc.mix(57, y, JK.thread, 0.45); }
  // hem line + frayed edge (alpha cut-outs) at the cuff end
  const hem = Math.round(0.935 * H);
  for (let x = 0; x < W; x++) { pc.mix(x, hem, JK.groove, 0.65); if (x % 3 === 0) pc.mix(x, hem, JK.thread, 0.5); }
  for (let x = 0; x < W; x++) {
    const fr = Math.floor(r() * r() * 7);
    for (let k = 0; k < fr; k++) pc.alpha(x, H - 1 - k, 0);
    pc.mix(x, H - 1 - fr, JK.thread, 0.5);
    pc.mix(x, H - 2 - fr, JK.thread, 0.2);
  }
  for (let y = 0; y < 3; y++) for (let x = 0; x < W; x++) pc.mul(x, y, 0.8);
  if (withPatch) {
    // darker patch near the elbow, outer (dorsal-ulnar) side, sewn on by hand
    for (let y = 13; y <= 37; y++) for (let x = 4; x <= 19; x++) {
      const yy = y + Math.round((x - 4) / 6);
      const edge = y === 13 || y === 37 || x === 4 || x === 19;
      let c = mulc(mixc(JK.patch, JK.dark, 0.15), 0.88 + r() * 0.16);
      if (edge) c = (x + y) % 2 === 0 ? JK.patchSt : JK.groove;
      pc.set(x, yy, c);
    }
  }
  return pc.texture(true);
}

function cuffTexture() {
  const W = 32, H = 32, pc = new PixelCanvas(W, H, SW.base);
  const n = valueNoise(41, 8, 8), r = rng(42);
  pc.each((x, y) => {
    const rib = x % 4;
    let c;
    if (rib < 2) c = (rib === 0) === (y % 2 === 0) ? mixc(SW.light, SW.base, 0.25) : SW.base;
    else c = mixc(SW.dark, SW.base, rib === 2 ? 0.45 : 0.15);
    c = mixc(c, SW.dirt, clamp((n(x / 4, y / 4) - 0.55) * 2.2, 0, 1) * 0.6);
    pc.set(x, y, mulc(c, 0.93 + r() * 0.1));
  });
  return pc.texture(true);
}

function skinTexture(withScar) {
  const W = 64, H = 64, pc = new PixelCanvas(W, H, SK.base);
  const nA = valueNoise(21, 16, 16), nB = valueNoise(22, 8, 8), r = rng(withScar ? 23 : 24);
  pc.each((x, y) => {
    const m = nA(x / 4, y / 4) * 0.6 + nB(x / 8, y / 8) * 0.4;
    let c = mixc(SK.base, SK.red, clamp((m - 0.48) * 2.2, 0, 1) * 0.6);
    c = mixc(c, SK.light, clamp((0.42 - m) * 2.2, 0, 1) * 0.45);
    if (x >= 32) c = mixc(c, SK.palm, 0.5);
    pc.set(x, y, mulc(c, 0.93 + r() * 0.12));
  });
  // ---- fingers (rows 0..31): dorsal face = columns 11..21, palmar face = columns 43..53
  for (let y = 0; y <= 2; y++) for (let x = 11; x <= 21; x++) pc.mix(x, y, SK.red, 0.35);
  for (let y = 10; y <= 13; y++) for (let x = 11; x <= 21; x++) pc.mix(x, y, SK.red, 0.22);
  for (const row of [11, 12, 21]) for (let x = 12; x <= 20; x++) if ((x + row) % 2 === 0) pc.mix(x, row, SK.dark, row === 21 ? 0.35 : 0.5);
  // nail plate on the dorsal face of the distal band (rows 26..30), fingertip skin beyond it (row 31)
  for (let y = 26; y <= 31; y++) for (let x = 12; x <= 20; x++) {
    const side = x === 12 || x === 20;
    if (y === 31) { pc.mix(x, y, SK.red, 0.3); continue; }
    let c = y === 26 ? SK.cuticle : y === 30 ? SK.nailEdge : SK.nail;
    if (side) c = mixc(c, SK.cuticle, 0.5);
    pc.set(x, y, mulc(c, 0.95 + r() * 0.08));
  }
  for (let y = 27; y <= 31; y++) for (let x = 34; x <= 60; x++) pc.mix(x, y, SK.red, 0.25);
  for (const row of [1, 10, 20]) for (let x = 38; x <= 57; x++) if (r() < 0.85) pc.mix(x, row, SK.dark, 0.45);
  // ---- back of the hand (rows 32..63, columns 0..31)
  const BX = (x) => ((x - PALM_X0) / PALM_XW) * 32, BY = (y) => 32 + ((y - PALM_Y0) / PALM_YH) * 32;
  const mcpX = FINGERS.map((f) => f.pos[0]);
  mcpX.forEach((mx, i) => pc.line(BX(-0.012 + i * 0.006), BY(0.0), BX(mx), BY(0.086), SK.light, 0.2));
  mcpX.forEach((mx) => {
    const cx = BX(mx), cy = BY(0.093);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) pc.mix(cx + dx, cy + dy, SK.red, 0.4);
    pc.mix(cx, cy + 1, SK.dark, 0.3); pc.mix(cx - 1, cy, SK.dark, 0.25);
  });
  pc.line(BX(0.012), BY(0.0), BX(0.002), BY(0.04), SK.vein, 0.3);
  pc.line(BX(0.002), BY(0.04), BX(-0.012), BY(0.07), SK.vein, 0.26);
  pc.line(BX(0.002), BY(0.04), BX(0.018), BY(0.068), SK.vein, 0.22);
  for (let i = 0; i < 70; i++) pc.mix(r() * 32, 32 + r() * 32, SK.dark, 0.16);
  if (withScar) {
    const x0 = BX(-0.026), y0 = BY(0.036), x1 = BX(-0.008), y1 = BY(0.062);
    pc.line(x0 + 1, y0, x1 + 1, y1, SK.scarEdge, 0.4);
    pc.line(x0 - 1, y0 + 1, x1 - 1, y1 + 1, SK.scarEdge, 0.25);
    pc.line(x0, y0, x1, y1, SK.scar, 0.95);
  }
  // ---- palm (rows 32..63, columns 32..63)
  const PX = (x) => 32 + BX(x);
  mcpX.forEach((mx) => { const cx = PX(mx), cy = BY(0.09); for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) pc.mix(cx + dx, cy + dy, SK.callus, 0.45); });
  pc.line(PX(0.044), BY(0.07), PX(0.01), BY(0.078), SK.dark, 0.5);
  pc.line(PX(0.01), BY(0.078), PX(-0.016), BY(0.088), SK.dark, 0.45);
  pc.line(PX(-0.04), BY(0.07), PX(-0.005), BY(0.062), SK.dark, 0.45);
  pc.line(PX(-0.005), BY(0.062), PX(0.03), BY(0.052), SK.dark, 0.35);
  for (let s = 0; s <= 1.0001; s += 0.04) pc.mix(PX(-0.034 + Math.sin(s * Math.PI * 0.5) * 0.026), BY(0.07 - s * 0.065), SK.dark, 0.45);
  pc.line(PX(-0.022), BY(0.004), PX(0.022), BY(0.004), SK.dark, 0.3);
  return pc.texture(false);
}

let TEX = null;
function textures() {
  if (!TEX) TEX = { sleeveR: sleeveTexture(false), sleeveL: sleeveTexture(true), cuff: cuffTexture(), skinR: skinTexture(true), skinL: skinTexture(false) };
  return TEX;
}

/* ================================================================ geometry */
function sleeveGeometry() {
  const mb = new MeshBuilder();
  const N = 8, nR = PUFFS * 2 + 1, rings = [], jr = rng(51);
  for (let i = 0; i < nR; i++) {
    const t = i / (nR - 1), y = lerp(SLEEVE_Y0, SLEEVE_Y1, t);
    const stitch = i % 2 === 0;
    let s = stitch ? 0.93 : 1.035;
    if (i === 0) s = 0.97;
    if (i === nR - 1) s = 0.965;
    const pts = ring(N, y, lerp(0.066, 0.056, t) * s, lerp(0.06, 0.051, t) * s, {
      phase: Math.PI / 8,
      warp: (p) => { const k = 1 + (jr() - 0.5) * 0.05; p.x *= k; p.z *= k; p.y += (jr() - 0.5) * 0.004; },
    });
    rings.push({ pts, hard: stitch && i > 0 && i < nR - 1 });
  }
  loft(mb, rings, {
    uv: (r, kk, p) => [kk / N, clamp((p.y - SLEEVE_Y0) / (SLEEVE_Y1 - SLEEVE_Y0), 0, 1)],
    capStart: { colorAll: [0.18, 0.17, 0.15] },
  });
  // lining: from the hem back inside the sleeve
  const hemPts = rings[nR - 1].pts;
  const inner = hemPts.map((p) => new V3(p.x * 0.86, SLEEVE_Y1 - 0.03, p.z * 0.86));
  loft(mb, [{ pts: hemPts }, { pts: inner }], { uv: (r, kk) => [kk / N, 0.86], color: () => [0.3, 0.29, 0.27] });
  return mb;
}

function cuffGeometry() {
  const mb = new MeshBuilder(), N = 8, ph = Math.PI / 8;
  const rings = [
    { pts: ring(N, CUFF_Y0, 0.041, 0.035, { phase: ph }) },
    { pts: ring(N, 0.256, 0.0385, 0.0325, { phase: ph }), hard: true },
    { pts: ring(N, CUFF_Y1, 0.034, 0.029, { phase: ph }), hard: true },
    { pts: ring(N, 0.254, 0.0292, 0.0248, { phase: ph }) },
  ];
  loft(mb, rings, { uv: (r, kk, p) => [(kk / N) * 3, (p.y - CUFF_Y0) / 0.08 + (r === 3 ? 0.1 : 0)], color: (r) => (r === 3 ? [0.6, 0.58, 0.55] : [1, 1, 1]) });
  return mb;
}

const supc = (a, e = 0.62) => { const c = Math.cos(a), s = Math.sin(a); return [Math.sign(c) * Math.pow(Math.abs(c), e), Math.sign(s) * Math.pow(Math.abs(s), e)]; };

function palmUV(r, kk, p, f) {
  const u = clamp((p.x - PALM_X0) / PALM_XW, 0, 0.999) * 0.5;
  const v = 0.5 + clamp((p.y / PALM_S - PALM_Y0) / PALM_YH, 0, 0.999) * 0.5; // texture painted for the original, 10% longer palm
  return [f.z >= 0 ? u : 0.5 + u, v];
}

// Wrist skin: a short tube from inside the sweater cuff to the heel of the palm. It is rebuilt for every
// wrist bend (each ring takes a share `w` of the wrist rotation), so the hand never separates from the arm.
const PALM_BASE = { y: 0.006, hw: 0.0314, ht: 0.0174, zc: -0.003 };
const WRIST_RINGS = [
  { u: -0.022, w: 0, hw: 0.0262, ht: 0.0188, zc: -0.002 },
  { u: -0.009, w: 0.22, hw: 0.0262, ht: 0.0182, zc: -0.002 },
  { u: -0.001, w: 0.56, hw: 0.0276, ht: 0.0178, zc: -0.0025 },
  { u: PALM_BASE.y, w: 1, ...PALM_BASE },
];
const WRIST_N = 8, WRIST_TRIS = (WRIST_RINGS.length - 1) * WRIST_N * 2;

function palmGeometry() {
  const mb = new MeshBuilder(), N = 8;
  const mk = (y, hw, ht, zc, mods = {}) => {
    const pts = [];
    for (let k = 0; k < N; k++) {
      const [cx, sz] = supc((k / N) * Math.PI * 2);
      const p = new V3(cx * hw, y, zc + sz * ht);
      if (mods[k]) { p.x += mods[k][0]; p.y += mods[k][1]; p.z += mods[k][2]; }
      pts.push(p);
    }
    return pts;
  };
  const rings = [
    { pts: mk(PALM_BASE.y, PALM_BASE.hw, PALM_BASE.ht, PALM_BASE.zc) }, // open: the wrist tube closes it
    { pts: mk(0.027, 0.0375, 0.0172, -0.004, { 4: [-0.003, 0, -0.002], 5: [-0.005, 0, -0.006], 6: [0, 0, -0.002], 7: [0, 0, -0.003] }) },
    { pts: mk(0.064, 0.0425, 0.0158, -0.001, { 6: [0, 0, 0.002] }) },
    { pts: mk(0.0855, 0.0415, 0.0132, 0.0005, { 0: [0, -0.007, 0], 1: [0, 0.001, 0], 2: [0, 0.004, 0], 3: [0, 0.003, 0], 4: [0, -0.001, 0], 5: [0, 0.004, 0], 6: [0, 0.005, 0], 7: [0, 0.002, 0] }) },
  ];
  const last = rings[3].pts, cen = last.reduce((a, p) => a.add(p), new V3()).multiplyScalar(1 / N);
  loft(mb, rings, { uv: palmUV, capEnd: { apex: cen.add(new V3(0, 0.004, 0)) } });
  return mb;
}

// One rigid digit segment: hexagonal tube with a rounded base (fills the knuckle gap when the joint bends)
// and a rounded end. Distal segments get a blunt fingertip; the nail sits on the dorsal face just behind the tip.
function digitSegment(w, t, L, distal, band, taper = 0.9) {
  const mb = new MeshBuilder(), N = 6;
  const hexr = (y, s, zoff = 0) => {
    const pts = [];
    for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; pts.push(new V3(Math.cos(a) * (w / 2) * s, y, (Math.sin(a) / 0.866) * (t / 2) * s + zoff)); }
    return pts;
  };
  const bv = (f) => lerp(band[0], band[1], f);
  const rings = distal
    ? [{ pts: hexr(0, 0.95), v: bv(0) }, { pts: hexr(L * 0.6, 0.9, -t * 0.03), v: bv(0.55) }, { pts: hexr(L * 0.86, 0.74, -t * 0.09), v: bv(0.83) }]
    : [{ pts: hexr(0, 1.0), v: bv(0) }, { pts: hexr(L, taper), v: bv(1) - 0.006 }];
  const apex = distal ? new V3(0, L, -t * 0.15) : new V3(0, L + t * 0.32, -t * 0.05);
  loft(mb, rings, {
    uv: (r, kk) => [kk / N, rings[r].v],
    capStart: { apex: new V3(0, -t * 0.45, t * 0.04), smooth: true, blend: 0.8, uv: (p, f, ua, uc) => [(ua[0] + uc[0]) / 2, band[0] + 0.004] },
    capEnd: { apex, smooth: true, blend: 0.7, uv: (p, f, ua, uc) => [(ua[0] + uc[0]) / 2, band[1] - 0.004] },
  });
  return mb;
}

let GEO = null;
function geometries() {
  if (GEO) return GEO;
  const fingerGeos = FINGERS.map((f) => [0, 1, 2].map((s) => digitSegment(f.w * (s === 0 ? 1 : s === 1 ? 0.94 : 0.9), f.t * (s === 0 ? 1 : s === 1 ? 0.95 : 0.9), f.len[s], s === 2, [BAND.P, BAND.M, BAND.D][s]).geometry()));
  const thumbGeos = [0, 1, 2].map((s) => digitSegment(THUMB.dims[s][0], THUMB.dims[s][1], THUMB.len[s], s === 2, [BAND.P, BAND.M, BAND.D][s], 0.88).geometry());
  GEO = { sleeve: sleeveGeometry().geometry(), cuff: cuffGeometry().geometry(), palm: palmGeometry().geometry(), fingers: fingerGeos, thumb: thumbGeos };
  return GEO;
}

/* ================================================================ rig */
let MATS = null;
function materials() {
  if (MATS) return MATS;
  const T = textures();
  MATS = {
    R: { sleeve: ps1Material({ map: T.sleeveR }), cuff: ps1Material({ map: T.cuff }), skin: ps1Material({ map: T.skinR }) },
    L: { sleeve: ps1Material({ map: T.sleeveL }), cuff: ps1Material({ map: T.cuff }), skin: ps1Material({ map: T.skinL }) },
  };
  return MATS;
}

const thumbBaseQuat = (() => {
  const y = THUMB.y.clone();
  const z = THUMB.zHint.clone().sub(y.clone().multiplyScalar(THUMB.zHint.dot(y))).normalize();
  const x = y.clone().cross(z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();

export function createArm(side = 'R') {
  const G = geometries(), M = materials()[side];
  const root = new THREE.Group();
  root.name = `arm${side}`;
  const meshes = [];
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); parent.add(m); meshes.push(m); return m; };
  add(root, G.sleeve, M.sleeve);
  add(root, G.cuff, M.cuff);
  const wrist = new THREE.Object3D();
  wrist.position.set(0, FOREARM, 0);
  root.add(wrist);
  add(wrist, G.palm, M.skin);
  const fingers = FINGERS.map((f, i) => {
    const mcp = new THREE.Object3D(); mcp.position.set(...f.pos); mcp.rotation.order = 'ZXY'; wrist.add(mcp);
    add(mcp, G.fingers[i][0], M.skin);
    const pip = new THREE.Object3D(); pip.position.y = f.len[0]; mcp.add(pip); add(pip, G.fingers[i][1], M.skin);
    const dip = new THREE.Object3D(); dip.position.y = f.len[1]; pip.add(dip); add(dip, G.fingers[i][2], M.skin);
    return { mcp, pip, dip, spec: f };
  });
  const tbase = new THREE.Object3D(); tbase.position.set(...THUMB.pos); tbase.quaternion.copy(thumbBaseQuat); wrist.add(tbase);
  const cmc = new THREE.Object3D(); cmc.rotation.order = 'ZXY'; tbase.add(cmc); add(cmc, G.thumb[0], M.skin);
  const tm = new THREE.Object3D(); tm.position.y = THUMB.len[0]; cmc.add(tm); add(tm, G.thumb[1], M.skin);
  const ti = new THREE.Object3D(); ti.position.y = THUMB.len[1]; tm.add(ti); add(ti, G.thumb[2], M.skin);
  // thenar web: a small skin wedge between the thumb and the index side of the palm, re-shaped for every pose
  const webGeo = new THREE.BufferGeometry();
  const NV = WEB_TRIS * 3;
  webGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NV * 3), 3));
  webGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(NV * 3), 3));
  webGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(NV * 2), 2));
  webGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(NV * 3).fill(1), 3));
  const webMesh = add(wrist, webGeo, M.skin);
  webMesh.name = 'web';
  const wristGeo = new THREE.BufferGeometry();
  const WV = WRIST_TRIS * 3;
  wristGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(WV * 3), 3));
  wristGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(WV * 3), 3));
  wristGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(WV * 2), 2));
  wristGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(WV * 3).fill(1), 3));
  const wristMesh = add(root, wristGeo, M.skin);
  wristMesh.name = 'wristSkin';
  const tris = meshes.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0);
  const arm = { side, root, wrist, fingers, thumb: { base: tbase, cmc, mcp: tm, ip: ti }, web: webMesh, wristSkin: wristMesh, meshes, tris };
  updateWeb(arm);
  updateWrist(arm);
  return arm;
}

const WEB_TRIS = 10;
const _wInv = new THREE.Matrix4();
function updateWeb(arm) {
  const g = arm.web.geometry, T = arm.thumb;
  arm.wrist.updateMatrixWorld(true);
  _wInv.copy(arm.wrist.matrixWorld).invert();
  const at = (obj, x, y, z) => new V3(x, y, z).applyMatrix4(obj.matrixWorld).applyMatrix4(_wInv);
  const [w0, t0] = THUMB.dims[0], [w1, t1] = THUMB.dims[1];
  // palm edge (index knuckle -> thenar) and the matching thumb line (MCP joint -> metacarpal base), dorsal/palmar
  const P = [[-0.036, 0.077, 0.006, -0.011], [-0.04, 0.05, 0.004, -0.013], [-0.033, 0.022, 0.002, -0.015]];
  const Pd = P.map(([x, y, zd]) => new V3(x, y, zd)), Pp = P.map(([x, y, , zp]) => new V3(x, y, zp));
  const Td = [at(T.mcp, w1 * 0.3, 0.003, t1 * 0.28), at(T.cmc, w0 * 0.38, THUMB.len[0] * 0.62, t0 * 0.3), at(T.cmc, w0 * 0.38, THUMB.len[0] * 0.22, t0 * 0.3)];
  const Tp = [at(T.mcp, w1 * 0.3, 0.003, -t1 * 0.28), at(T.cmc, w0 * 0.38, THUMB.len[0] * 0.62, -t0 * 0.3), at(T.cmc, w0 * 0.38, THUMB.len[0] * 0.22, -t0 * 0.3)];
  // per-vertex normals that match the neighbouring palm / thumb surfaces, so the web shades seamlessly
  const dirIn = (obj, x, y, z) => new V3(x, y, z).transformDirection(obj.matrixWorld).transformDirection(_wInv).normalize();
  const tdn = dirIn(T.cmc, 0.25, 0, 1), tpn = dirIn(T.cmc, 0.25, 0, -1);
  const pdn = new V3(-0.3, 0, 1).normalize(), ppn = new V3(-0.3, 0, -1).normalize();
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv.array;
  let i = 0;
  const tri = (a, b, c, na, nb, nc, out, u0, v0) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.dot(out) < 0) { let t = b; b = c; c = t; t = nb; nb = nc; nc = t; }
    for (const [p, q] of [[a, na], [b, nb], [c, nc]]) {
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      nor[i * 3] = q.x; nor[i * 3 + 1] = q.y; nor[i * 3 + 2] = q.z;
      const [pu, pv] = palmUV(0, 0, p, out); uv[i * 2] = pu; uv[i * 2 + 1] = pv; // same skin pixels as the palm edge
      i++;
    }
  };
  const quad = (a, b, c, d, na, nb, nc, nd, out, u0, v0) => { tri(a, b, c, na, nb, nc, out, u0, v0); tri(a, c, d, na, nc, nd, out, u0, v0); };
  const up = new V3(0, 0, 1), dn = new V3(0, 0, -1);
  for (let k = 0; k < 2; k++) {
    quad(Pd[k], Td[k], Td[k + 1], Pd[k + 1], pdn, tdn, tdn, pdn, up, 0.06, 0.56);
    quad(Pp[k], Tp[k], Tp[k + 1], Pp[k + 1], ppn, tpn, tpn, ppn, dn, 0.56, 0.56);
  }
  const edgeOut = Pd[0].clone().add(Td[0]).sub(Pd[1]).sub(Td[1]).normalize();
  const en = (v) => v.clone().add(edgeOut).normalize();
  quad(Pd[0], Pp[0], Tp[0], Td[0], en(pdn), en(ppn), en(tpn), en(tdn), edgeOut, 0.06, 0.56);
  g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = g.attributes.uv.needsUpdate = true;
  g.computeBoundingSphere();
}

const _qI = new THREE.Quaternion(), _qw = new THREE.Quaternion();
function updateWrist(arm) {
  const g = arm.wristSkin.geometry, base = arm.wrist.position, qW = arm.wrist.quaternion;
  const rings = WRIST_RINGS.map((R) => {
    _qw.copy(_qI).slerp(qW, R.w);
    const pts = [], nrm = [], loc = [];
    for (let k = 0; k < WRIST_N; k++) {
      const [cx, sz] = supc((k / WRIST_N) * Math.PI * 2);
      const l = new V3(cx * R.hw, R.u, R.zc + sz * R.ht);
      loc.push(l);
      pts.push(l.clone().applyQuaternion(_qw).add(base));
      nrm.push(new V3(cx / R.hw, 0, sz / R.ht).normalize().applyQuaternion(_qw));
    }
    return { pts, nrm, loc, zc: R.zc };
  });
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv.array;
  let i = 0;
  const put = (r, k, dorsal) => {
    const p = r.pts[k], n = r.nrm[k], l = r.loc[k];
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z;
    const [pu, pv] = palmUV(0, 0, l, { z: dorsal ? 1 : -1 });
    uv[i * 2] = pu; uv[i * 2 + 1] = pv;
    i++;
  };
  const tri = (ra, ka, rb, kb, rc, kc, dorsal) => {
    const A = ra.pts[ka], B = rb.pts[kb], C = rc.pts[kc];
    const fn = B.clone().sub(A).cross(C.clone().sub(A));
    const out = ra.nrm[ka].clone().add(rb.nrm[kb]).add(rc.nrm[kc]);
    if (fn.dot(out) >= 0) { put(ra, ka, dorsal); put(rb, kb, dorsal); put(rc, kc, dorsal); }
    else { put(ra, ka, dorsal); put(rc, kc, dorsal); put(rb, kb, dorsal); }
  };
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r], b = rings[r + 1];
    for (let k = 0; k < WRIST_N; k++) {
      const k1 = (k + 1) % WRIST_N;
      const dorsal = a.loc[k].z + a.loc[k1].z >= 2 * a.zc;
      tri(a, k, a, k1, b, k1, dorsal);
      tri(a, k, b, k1, b, k, dorsal);
    }
  }
  g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = g.attributes.uv.needsUpdate = true;
  g.computeBoundingSphere();
}

// Left + right pair. The left rig lives under `mirror` (scale.x = -1); give it targets in mirrored space.
export function createArms() {
  const group = new THREE.Group();
  const R = createArm('R'), L = createArm('L');
  const mirror = new THREE.Group();
  mirror.scale.set(-1, 1, 1);
  mirror.add(L.root);
  group.add(R.root, mirror);
  return { group, R, L, mirror };
}

/* ================================================================ hand shapes (degrees) */
// f: [mcp, pip, dip] flexion per finger, s: extra spread, t: thumb { abd, flex, mcp, ip, twist }
export const HAND_POSES = {
  relaxed: { f: [[12, 20, 10], [14, 22, 11], [16, 24, 12], [18, 26, 13]], s: [-1, 0, 1, 2], t: { abd: -10, flex: 16, mcp: 10, ip: 14 } },
  push: { f: [[-8, 4, 1], [-7, 3, 1], [-6, 4, 1], [-4, 6, 3]], s: [1, 0, 0, -1], t: { abd: 10, flex: 0, mcp: 0, ip: 4 } },
  power: { f: [[57, 77, 18], [72, 70, 38], [72, 62, 41], [61, 46, 39]], s: [-2, 0, 2, 4], t: { abd: -28, flex: -3, mcp: -9, ip: 53, twist: 11 }, cyl: { p: [0, 0.072, -0.0332], axis: [-0.991, 0.1285, 0.0367], r: 0.0168 } },
  carry: { f: [[46, 101, 7], [64, 96, 19], [64, 90, 23], [51, 75, 23]], s: [-2, 0, 2, 4], t: { abd: -29, flex: -5, mcp: -7, ip: 44, twist: -6 }, cyl: { p: [0, 0.078, -0.0277], axis: [-0.991, 0.1285, 0.0367], r: 0.0125 } },
  hook: { f: [[24, 96, 62], [26, 98, 64], [28, 98, 62], [32, 96, 60]], s: [-1, 0, 1, 3], t: { abd: 4, flex: 22, mcp: 10, ip: 12 } },
  pinch: { f: [[67, 82, 34], [62, 96, 50], [70, 98, 48], [76, 94, 44]], s: [0, 0, 1, 2], t: { abd: -6, flex: 11, mcp: 2, ip: 17, twist: -49 } },
  paper: { f: [[24, 70, 50], [50, 76, 50], [55, 81, 52], [60, 85, 54]], s: [3, 0, -2, -4], t: { abd: -32, flex: 24, mcp: -10, ip: -10, twist: 29 } },
  pet: { f: [[30, 34, 16], [28, 32, 16], [30, 34, 17], [33, 37, 19]], s: [-3, 0, 2, 5], t: { abd: 4, flex: 12, mcp: 10, ip: 14 } }, // open hand, fingers softly following the skull
};

export function applyHandPose(arm, pose) {
  const P = typeof pose === 'string' ? HAND_POSES[pose] : pose;
  arm.fingers.forEach((F, i) => {
    const f = P.f[i];
    F.mcp.rotation.set(-deg(f[0]), 0, deg((P.s ? P.s[i] : 0) + F.spec.spread));
    F.pip.rotation.set(-deg(f[1]), 0, 0);
    F.dip.rotation.set(-deg(f[2]), 0, 0);
  });
  const t = P.t;
  arm.thumb.cmc.rotation.set(-deg(t.flex), deg(t.twist || 0), deg(t.abd));
  arm.thumb.mcp.rotation.set(-deg(t.mcp), 0, 0);
  arm.thumb.ip.rotation.set(-deg(t.ip), 0, 0);
  if (arm.web) updateWeb(arm);
}

/* ================================================================ anchors (hand-local, computed from the posed fingers) */
function circumcenter(a, b, c) {
  const ab = b.clone().sub(a), ac = c.clone().sub(a), n = ab.clone().cross(ac);
  const d = 2 * n.lengthSq();
  if (d < 1e-14) return a.clone().add(c).multiplyScalar(0.5);
  const t1 = n.clone().cross(ab).multiplyScalar(ac.lengthSq());
  const t2 = ac.clone().cross(n).multiplyScalar(ab.lengthSq());
  return a.clone().add(t1.add(t2).multiplyScalar(1 / d));
}

let ANCHORS = null;
export function anchors() {
  if (ANCHORS) return ANCHORS;
  const probe = createArm('R');
  const local = (obj, p = new V3()) => {
    probe.root.updateMatrixWorld(true);
    const inv = probe.wrist.matrixWorld.clone().invert();
    return obj.localToWorld(p.clone()).applyMatrix4(inv);
  };
  const tip = (F) => local(F.dip, new V3(0, F.spec.len[2], -F.spec.t * 0.18));
  const A = {};
  A.palm = { p: new V3(0.0, 0.047, -0.019), axis: new V3(0, 1, 0) };
  let cc;
  // fists: the fingers were laid tangent to an explicit handle cylinder (tools/fit_fist2.mjs)
  for (const k of ['power', 'carry']) {
    const c = HAND_POSES[k].cyl;
    A[k] = { p: new V3(...c.p), axis: new V3(...c.axis).normalize(), r: c.r };
  }
  applyHandPose(probe, 'hook');
  cc = probe.fingers.map((F) => circumcenter(local(F.pip), local(F.dip), tip(F)));
  A.hook = { p: cc[1].clone().add(cc[2]).multiplyScalar(0.5), axis: cc[0].clone().sub(cc[3]).normalize(), r: cc[1].distanceTo(local(probe.fingers[1].dip)) - probe.fingers[1].spec.t / 2 };
  // thumb-pad contact points (fitted in tools/fit_grips.mjs so the pads close on the object)
  const pad = () => local(probe.thumb.ip, new V3(0, THUMB.len[2] * 0.6, -THUMB.dims[2][1] * 0.5));
  applyHandPose(probe, 'pinch');
  const tp = pad(), idxSide = local(probe.fingers[0].pip, new V3(-FINGERS[0].w * 0.5, FINGERS[0].len[1] * 0.6, 0));
  A.pinch = { p: tp.clone().add(idxSide).multiplyScalar(0.5), axis: tp.clone().sub(idxSide).normalize(), gap: tp.distanceTo(idxSide) };
  applyHandPose(probe, 'paper');
  const tp2 = pad();
  const fp = [0, 1].map((i) => local(probe.fingers[i].dip, new V3(0, FINGERS[i].len[2] * 0.5, -FINGERS[i].t * 0.45)));
  const fpads = fp[0].add(fp[1]).multiplyScalar(0.5);
  A.paper = { p: tp2.clone().add(fpads).multiplyScalar(0.5), axis: tp2.clone().sub(fpads).normalize(), gap: tp2.distanceTo(fpads) };
  ANCHORS = A;
  return A;
}

/* ================================================================ targets + IK */
export const mirrorV = (v) => new V3(-v.x, v.y, v.z);

// Rotation q with q*a1 = b1 exactly and q*a2 as close as possible to b2.
export function alignQuat(a1, a2, b1, b2) {
  const e1 = a1.clone().normalize(), e2 = a2.clone().sub(e1.clone().multiplyScalar(a2.dot(e1))).normalize(), e3 = e1.clone().cross(e2);
  const f1 = b1.clone().normalize(), f2 = b2.clone().sub(f1.clone().multiplyScalar(b2.dot(f1))).normalize(), f3 = f1.clone().cross(f2);
  const E = new THREE.Matrix4().makeBasis(e1, e2, e3), F = new THREE.Matrix4().makeBasis(f1, f2, f3);
  return new THREE.Quaternion().setFromRotationMatrix(F.multiply(E.transpose()));
}

// Place hand anchor `a` at `point` with its axis along `axis` and the back of the hand towards `dorsal`.
export function handTarget(a, point, axis, dorsal) {
  const hand = alignQuat(a.axis, new V3(0, 0, 1), axis, dorsal);
  const wrist = point.clone().sub(a.p.clone().applyQuaternion(hand));
  return { wrist, hand };
}

// Same, but give the hand's finger direction instead of an anchor axis (open-hand poses).
export function handTargetDir(a, point, fingersDir, dorsal) {
  const hand = alignQuat(new V3(0, 1, 0), new V3(0, 0, 1), fingersDir, dorsal);
  const wrist = point.clone().sub(a.p.clone().applyQuaternion(hand));
  return { wrist, hand };
}

export function mirrorTarget(t) {
  const q = t.hand;
  return { wrist: mirrorV(t.wrist), hand: new THREE.Quaternion(q.x, -q.y, -q.z, q.w) };
}

// Two-bone IK: shoulder -> elbow (not modelled) -> wrist. Sets the forearm root and the wrist rotation.
export function solveArm(arm, { shoulder, wrist, hand, pole }) {
  const S = shoulder, d = wrist.clone().sub(S), L0 = d.length(), dn = d.clone().divideScalar(L0);
  const L = clamp(L0, Math.abs(UPPER_ARM - FOREARM) + 1e-3, UPPER_ARM + FOREARM - 1e-4);
  const cosA = clamp((UPPER_ARM * UPPER_ARM + L * L - FOREARM * FOREARM) / (2 * UPPER_ARM * L), -1, 1);
  const A = Math.acos(cosA);
  const p = pole.clone().sub(dn.clone().multiplyScalar(pole.dot(dn))).normalize();
  const E = S.clone().add(dn.clone().multiplyScalar(Math.cos(A) * UPPER_ARM)).add(p.multiplyScalar(Math.sin(A) * UPPER_ARM));
  const W = S.clone().add(dn.clone().multiplyScalar(L));
  const y = W.clone().sub(E).normalize();
  const hz = new V3(0, 0, 1).applyQuaternion(hand);
  let z = hz.clone().sub(y.clone().multiplyScalar(hz.dot(y)));
  if (z.lengthSq() < 1e-6) z = new V3(0, 1, 0).applyQuaternion(hand).negate().sub(y.clone().multiplyScalar(-y.dot(new V3(0, 1, 0).applyQuaternion(hand))));
  z.normalize();
  const x = y.clone().cross(z);
  const qf = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  arm.root.position.copy(E);
  arm.root.quaternion.copy(qf);
  arm.wrist.quaternion.copy(qf.clone().invert().multiply(hand));
  if (arm.wristSkin) updateWrist(arm);
  const hy = new V3(0, 1, 0).applyQuaternion(hand);
  return { elbow: E, reach: L0 - L, wristBend: THREE.MathUtils.radToDeg(Math.acos(clamp(hy.dot(y), -1, 1))) };
}

// Hanging pose for the turnaround: elbow at `pos`, forearm straight down, back of the hand towards +Z.
export function hangArm(arm, pos = new V3()) {
  arm.root.position.copy(pos);
  arm.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3(-1, 0, 0), new V3(0, -1, 0), new V3(0, 0, 1)));
  arm.wrist.quaternion.identity();
  if (arm.wristSkin) updateWrist(arm);
}

// Wireframe overlay (child line meshes, hidden by default).
export function addWire(arm, mat) {
  for (const m of arm.meshes) {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 1), mat);
    l.visible = false;
    l.name = 'wire';
    m.add(l);
  }
}
export function setWire(arm, on) { arm.root.traverse((o) => { if (o.name === 'wire') o.visible = on; }); }
