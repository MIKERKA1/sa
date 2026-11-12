// Offline bake of the farm-dog mesh: SDF sculpt (bind pose) -> surface nets -> meshopt simplification ->
// SDF normals, ambient occlusion, skin weights, fur length + fur flow. Writes src/models/dog_mesh.gen.js
// Usage: node tools/dog_bake.mjs
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
import { buildRig, HEADP, FACE, NECK0, NECK_A } from '../src/models/dog_rig.js';

const V3 = THREE.Vector3, v3 = (x, y, z) => new V3(x, y, z);
const rig = buildRig();
const BONES = rig.list.map((b) => b.name), BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const jp = (n) => new V3().setFromMatrixPosition(rig.bones[n].matrixWorld);
const H = (x, y, z) => v3(x, y, z).add(HEADP); // head-local -> root
const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------------------------------------------------------------- SDF primitives */
function sdEll(px, py, pz, P) {
  let x = px - P.c.x, y = py - P.c.y, z = pz - P.c.z;
  if (P.m) { const m = P.m; const X = m[0] * x + m[1] * y + m[2] * z, Y = m[3] * x + m[4] * y + m[5] * z, Z = m[6] * x + m[7] * y + m[8] * z; x = X; y = Y; z = Z; }
  const r = P.r, k0 = Math.hypot(x / r.x, y / r.y, z / r.z), k1 = Math.hypot(x / (r.x * r.x), y / (r.y * r.y), z / (r.z * r.z));
  return k1 < 1e-9 ? -Math.min(r.x, r.y, r.z) : (k0 * (k0 - 1)) / k1;
}
function sdRCone(px, py, pz, P) { // iq round cone a->b, radii r1, r2 (+ optional squash of the cross-section)
  const ax = P.a.x, ay = P.a.y, az = P.a.z, bx = P.b.x - ax, by = P.b.y - ay, bz = P.b.z - az;
  let qx = px - ax, qy = py - ay, qz = pz - az;
  if (P.sq) { const t = clamp((qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz), 0, 1); const cx = ax + bx * t, cy = ay + by * t, cz = az + bz * t; qx = (px - cx) * P.sq.x + cx - ax; qy = (py - cy) * P.sq.y + cy - ay; qz = (pz - cz) * P.sq.z + cz - az; }
  const l2 = bx * bx + by * by + bz * bz, rr = P.r1 - P.r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const y = qx * bx + qy * by + qz * bz, z = y - l2;
  const wx = qx * l2 - bx * y, wy = qy * l2 - by * y, wz = qz * l2 - bz * y, x2 = wx * wx + wy * wy + wz * wz;
  const y2 = y * y * l2, z2 = z * z * l2, k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - P.r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - P.r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - P.r1;
}
const sdPrim = (x, y, z, P) => (P.kind === 'e' ? sdEll(x, y, z, P) : sdRCone(x, y, z, P));
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const rotM = (rx, ry, rz) => { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')).invert().elements; return [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]]; };

const E = (bone, c, r, o = {}) => ({ kind: 'e', bone, c, r, k: 0.03, fur: 0.012, flow: v3(0, -0.35, -1), ...o, m: o.rot ? rotM(...o.rot) : null });
const C = (bone, a, b, r1, r2, o = {}) => ({ kind: 'c', bone, a, b, r1, r2, k: 0.03, fur: 0.012, flow: v3(0, -0.35, -1), ...o });
const mir = (p, s) => v3(p.x * s, p.y, p.z);

/* ---------------------------------------------------------------- the sculpt (bind pose, root space) */
const DOWN = v3(0, -1, 0), BACK = v3(0, -0.35, -1), NECKF = v3(0, -Math.cos(NECK_A), -Math.sin(NECK_A));
function bodyPrims() {
  const P = [];
  // torso
  P.push(E('ribs', v3(0, 0.428, 0.085), v3(0.097, 0.124, 0.16), { k: 0.05, fur: 0.012 }));
  P.push(E('chest', v3(0, 0.41, 0.212), v3(0.079, 0.094, 0.088), { k: 0.05, fur: 0.018, flow: v3(0, -1, 0.2) }));
  P.push(C('chest', v3(0, 0.493, 0.165), v3(0, 0.488, -0.01), 0.056, 0.054, { k: 0.05, fur: 0.012 }));
  P.push(E('chest', v3(0, 0.47, -0.03), v3(0.085, 0.07, 0.09), { k: 0.05 }));
  P.push(E('hips', v3(0, 0.472, -0.125), v3(0.085, 0.067, 0.09), { k: 0.05 }));
  P.push(E('hips', v3(0, 0.474, -0.212), v3(0.087, 0.074, 0.1), { k: 0.05, fur: 0.012 }));
  // neck + ruff + forechest fur
  P.push(C('neck', NECK0.clone().add(v3(0, -0.025, -0.01)), HEADP.clone().add(v3(0, -0.012, -0.012)), 0.088, 0.064, { k: 0.04, fur: 0.016, flow: NECKF }));
  P.push(E('neck', v3(0, 0.515, 0.215), v3(0.104, 0.118, 0.098), { k: 0.05, fur: 0.02, flow: NECKF }));
  P.push(E('chest', v3(0, 0.445, 0.268), v3(0.072, 0.098, 0.058), { k: 0.05, fur: 0.02, flow: v3(0, -1, 0.15) }));
  for (const s of [1, -1]) {
    const F = (n) => mir(jp('F' + (s > 0 ? 'L' : 'R') + n), 1), Hh = (n) => jp('H' + (s > 0 ? 'L' : 'R') + n);
    const FL = (n) => (s > 0 ? 'FL' : 'FR') + n, HL = (n) => (s > 0 ? 'HL' : 'HR') + n;
    // front leg: scapula, upper arm, forearm (+ feathering), pastern, paw
    P.push(C('chest', v3(0.046 * s, 0.512, 0.15), F(1).clone().add(v3(0.004 * s, 0, 0.012)), 0.036, 0.044, { k: 0.04, fur: 0.01 }));
    P.push(C(FL(1), F(1).clone().add(v3(0.002 * s, 0, 0.008)), F(2), 0.043, 0.031, { k: 0.035, fur: 0.008, flow: DOWN }));
    P.push(C(FL(2), F(2), F(3), 0.026, 0.0185, { k: 0.02, fur: 0.004, flow: DOWN }));
    P.push(E(FL(2), F(2).clone().lerp(F(3), 0.32).add(v3(0, 0, -0.014)), v3(0.018, 0.06, 0.02), { k: 0.02, fur: 0.008, flow: v3(0, -1, -0.4) }));
    P.push(C(FL(3), F(3), F(4), 0.0185, 0.0175, { k: 0.012, fur: 0.003, flow: DOWN }));
    P.push(E(FL(4), F(4).clone().add(v3(0, -0.012, 0.02)), v3(0.026, 0.019, 0.036), { k: 0.014, fur: 0.003, flow: v3(0, -0.3, 1) }));
    // hind leg: thigh, pants, shin, hock, metatarsus, paw
    P.push(C(HL(1), Hh(1).clone().add(v3(0.004 * s, 0.0, -0.004)), Hh(2), 0.06, 0.04, { k: 0.04, fur: 0.012, flow: v3(0, -1, -0.3) }));
    P.push(E(HL(1), v3(0.05 * s, 0.395, -0.275), v3(0.046, 0.075, 0.052), { k: 0.04, fur: 0.02, flow: v3(0, -1, -0.5) }));
    P.push(C(HL(2), Hh(2), Hh(3), 0.034, 0.02, { k: 0.025, fur: 0.008, flow: DOWN }));
    P.push(E(HL(2), Hh(2).clone().lerp(Hh(3), 0.3).add(v3(0, 0, -0.022)), v3(0.026, 0.055, 0.03), { k: 0.025, fur: 0.014, flow: v3(0, -1, -0.5) }));
    P.push(C(HL(3), Hh(3), Hh(4), 0.019, 0.0165, { k: 0.012, fur: 0.003, flow: DOWN }));
    P.push(E(HL(4), Hh(4).clone().add(v3(0, -0.012, 0.018)), v3(0.025, 0.019, 0.034), { k: 0.014, fur: 0.003, flow: v3(0, -0.3, 1) }));
  }
  // head
  P.push(E('head', H(0, 0.03, 0.028), v3(0.056, 0.053, 0.068), { k: 0.03, fur: 0.006, flow: v3(0, -0.15, -1) }));
  for (const s of [1, -1]) {
    P.push(E('head', H(0.039 * s, 0.004, 0.056), v3(0.035, 0.036, 0.046), { k: 0.03, fur: 0.008, flow: v3(0.3 * s, -0.4, -1) }));
    P.push(E('head', H(0.044 * s, -0.022, -0.002), v3(0.04, 0.052, 0.046), { k: 0.035, fur: 0.016, flow: v3(0.2 * s, -0.7, -0.7) }));
    P.push(E('head', H(0.027 * s, 0.046, 0.082), v3(0.017, 0.01, 0.016), { k: 0.012, fur: 0.003, flow: v3(0, 0.2, -1) }));
  }
  P.push(E('head', H(0, 0.002, 0.128), v3(0.033, 0.029, 0.062), { k: 0.022, fur: 0.002, flow: v3(0, 0, -1) }));
  P.push(E('head', H(0, -0.002, 0.166), v3(0.021, 0.021, 0.024), { k: 0.012, fur: 0.0015, flow: v3(0, 0, -1) }));
  P.push(E('head', H(FACE.nose.x, FACE.nose.y, FACE.nose.z), FACE.noseR.clone(), { k: 0.007, fur: 0, zone: 'nose' }));
  // carving: eye sockets (almond, outer corner a bit higher) + nostrils
  for (const s of [1, -1]) {
    P.push(E('head', H(FACE.eye.x * s, FACE.eye.y, FACE.eye.z), v3(0.0135, 0.0082, 0.012), { sub: true, k: 0.004, rot: [0, 0.42 * s, -0.22 * s] }));
    P.push(E('head', H(0.0072 * s, FACE.nose.y - 0.003, FACE.nose.z + 0.011), v3(0.0042, 0.003, 0.0045), { sub: true, k: 0.002 }));
  }
  return P;
}
function jawPrims() {
  return [
    C('jaw', H(0, -0.03, 0.035), H(0, -0.036, 0.15), 0.026, 0.0145, { k: 0.02, fur: 0.004, flow: v3(0, -0.4, -1), sq: v3(1, 1.25, 1) }),
    E('jaw', H(0, -0.04, 0.115), v3(0.022, 0.012, 0.05), { k: 0.02, fur: 0.005, flow: v3(0, -0.6, -1) }),
  ];
}
function sdfOf(prims) {
  const add = prims.filter((p) => !p.sub), sub = prims.filter((p) => p.sub);
  return (x, y, z) => {
    let d = 1e9;
    for (const P of add) d = smin(d, sdPrim(x, y, z, P), P.k);
    for (const P of sub) d = smax(d, -sdPrim(x, y, z, P), P.k);
    return d;
  };
}
// tail: fluffy tube along the bind-pose centre line
const TAIL_PROF = [[0, 0.032], [0.12, 0.046], [0.3, 0.056], [0.55, 0.058], [0.75, 0.052], [0.9, 0.042], [1, 0.03]];
const tailR = (t) => { for (let i = 0; i < TAIL_PROF.length - 1; i++) { const [a, ra] = TAIL_PROF[i], [b, rb] = TAIL_PROF[i + 1]; if (t <= b) return mix(ra, rb, (t - a) / (b - a)); } return 0.03; };
const TAILN = 48, tailPts = [], tailTs = [];
for (let i = 0; i <= TAILN; i++) { const t = i / TAILN; tailTs.push(t); tailPts.push(rig.curve.getPointAt(t).add(new V3().setFromMatrixPosition(rig.bones.tail0.matrixWorld)).sub(rig.curve.getPointAt(0))); }
const tailSegs = tailPts.slice(0, -1).map((a, i) => ({ kind: 'c', a, b: tailPts[i + 1], r1: tailR(tailTs[i]), r2: tailR(tailTs[i + 1]), t0: tailTs[i], t1: tailTs[i + 1] }));
const sdTail = (x, y, z) => { let d = 1e9; for (const S of tailSegs) d = Math.min(d, sdRCone(x, y, z, S)); return d; };
function tailParam(x, y, z) { let best = 1e9, bt = 0; for (const S of tailSegs) { const d = sdRCone(x, y, z, S); if (d < best) { best = d; const ab = new V3().subVectors(S.b, S.a), ap = v3(x, y, z).sub(S.a); bt = mix(S.t0, S.t1, clamp(ap.dot(ab) / ab.lengthSq(), 0, 1)); } } return bt; }

/* ---------------------------------------------------------------- surface nets */
function surfaceNets(f, bmin, bmax, h) {
  const nx = Math.ceil((bmax.x - bmin.x) / h) + 1, ny = Math.ceil((bmax.y - bmin.y) / h) + 1, nz = Math.ceil((bmax.z - bmin.z) / h) + 1;
  const N = nx * ny * nz, val = new Float32Array(N).fill(1), id = (i, j, k) => i + nx * (j + ny * k);
  const X = (i) => bmin.x + i * h, Y = (j) => bmin.y + j * h, Z = (k) => bmin.z + k * h;
  const S = 4, band = S * h * 1.8;
  for (let k = 0; k < nz; k += S) for (let j = 0; j < ny; j += S) for (let i = 0; i < nx; i += S) {
    const d = f(X(i + S / 2), Y(j + S / 2), Z(k + S / 2));
    if (Math.abs(d) > band) { for (let c = k; c <= Math.min(nz - 1, k + S); c++) for (let b = j; b <= Math.min(ny - 1, j + S); b++) for (let a = i; a <= Math.min(nx - 1, i + S); a++) val[id(a, b, c)] = d; continue; }
    for (let c = k; c <= Math.min(nz - 1, k + S); c++) for (let b = j; b <= Math.min(ny - 1, j + S); b++) for (let a = i; a <= Math.min(nx - 1, i + S); a++) val[id(a, b, c)] = f(X(a), Y(b), Z(c));
  }
  const vid = new Int32Array(N).fill(-1), pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let m = 0;
    for (let q = 0; q < 8; q++) { cv[q] = val[id(i + co[q][0], j + co[q][1], k + co[q][2])]; if (cv[q] < 0) m |= 1 << q; }
    if (m === 0 || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += co[a][0] + (co[b][0] - co[a][0]) * t; sy += co[a][1] + (co[b][1] - co[a][1]) * t; sz += co[a][2] + (co[b][2] - co[a][2]) * t; n++;
    }
    vid[id(i, j, k)] = pos.length / 3;
    pos.push(X(i) + (sx / n) * h, Y(j) + (sy / n) * h, Z(k) + (sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[id(i, j, k)] < 0;
    if (v0 !== (val[id(i + 1, j, k)] < 0)) quad(vid[id(i, j - 1, k - 1)], vid[id(i, j, k - 1)], vid[id(i, j, k)], vid[id(i, j - 1, k)], !v0);
    if (v0 !== (val[id(i, j + 1, k)] < 0)) quad(vid[id(i - 1, j, k - 1)], vid[id(i - 1, j, k)], vid[id(i, j, k)], vid[id(i, j, k - 1)], !v0);
    if (v0 !== (val[id(i, j, k + 1)] < 0)) quad(vid[id(i - 1, j - 1, k)], vid[id(i, j - 1, k)], vid[id(i, j, k)], vid[id(i - 1, j, k)], !v0);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}
const grad = (f, x, y, z, e = 0.0006) => { const g = v3(f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)); return g.lengthSq() > 0 ? g.normalize() : v3(0, 1, 0); };
function project(f, pos, h) { // pull the net vertices onto the zero set (bounded to the cell)
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const x0 = x, y0 = y, z0 = z;
    for (let it = 0; it < 3; it++) { const d = f(x, y, z), g = grad(f, x, y, z); x -= g.x * d; y -= g.y * d; z -= g.z * d; }
    const dx = x - x0, dy = y - y0, dz = z - z0, L = Math.hypot(dx, dy, dz);
    const s = L > h * 0.7 ? (h * 0.7) / L : 1;
    pos[i] = x0 + dx * s; pos[i + 1] = y0 + dy * s; pos[i + 2] = z0 + dz * s;
  }
}
async function simplify(mesh, tris, err = 0.0025) {
  await MeshoptSimplifier.ready;
  const [out] = MeshoptSimplifier.simplify(mesh.idx, mesh.pos, 3, tris * 3, err, ['ErrorAbsolute']);
  const remap = new Int32Array(mesh.pos.length / 3).fill(-1), pos = [];
  const idx = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) { let r = remap[out[i]]; if (r < 0) { r = remap[out[i]] = pos.length / 3; pos.push(mesh.pos[out[i] * 3], mesh.pos[out[i] * 3 + 1], mesh.pos[out[i] * 3 + 2]); } idx[i] = r; }
  return { pos: new Float32Array(pos), idx };
}

/* ---------------------------------------------------------------- per-vertex attributes */
const BODY = bodyPrims(), JAW = jawPrims();
const sdBody = sdfOf(BODY), sdJaw = sdfOf(JAW);
const sdAll = (x, y, z) => Math.min(sdBody(x, y, z), sdJaw(x, y, z), sdTail(x, y, z));
const boneFlow = (bone, f) => f.clone().normalize(); // flows are given in root space
function primWeights(prims, x, y, z, tau = 0.011) {
  const ds = prims.filter((p) => !p.sub).map((P) => [P, sdPrim(x, y, z, P)]);
  const dmin = Math.min(...ds.map((d) => d[1]));
  const wb = new Map(); let fur = 0, ws = 0; const flow = v3(0, 0, 0);
  for (const [P, d] of ds) {
    const w = Math.exp(-(d - dmin) / tau);
    if (w < 1e-4) continue;
    wb.set(P.bone, (wb.get(P.bone) || 0) + w); fur += P.fur * w; ws += w; flow.addScaledVector(boneFlow(P.bone, P.flow), w);
  }
  return { wb, fur: fur / ws, flow, zone: ds.find((d) => d[1] === dmin)[0].zone || '' };
}
function top4(wb) {
  const arr = [...wb.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = arr.reduce((q, e) => q + e[1], 0);
  const I = [0, 0, 0, 0], W = [0, 0, 0, 0];
  arr.forEach(([b, w], i) => { I[i] = BI[b]; W[i] = w / s; });
  return { I, W };
}
function aoAt(p, n) {
  let o = 0;
  for (let i = 1; i <= 5; i++) { const hh = i * 0.011; o += (hh - sdAll(p.x + n.x * hh, p.y + n.y * hh, p.z + n.z * hh)) / Math.pow(2, i); }
  return clamp(1 - o * 9, 0, 1);
}
const neckAxis = v3(0, Math.cos(NECK_A), Math.sin(NECK_A)), COLLAR_S = 0.05;
const neckS = (p) => new V3().subVectors(p, NECK0).dot(neckAxis);
function finish(name, mesh, f, attrs) {
  const n = mesh.pos.length / 3, nrm = new Float32Array(n * 3), skI = new Uint8Array(n * 4), skW = new Uint8Array(n * 4), aux = new Uint8Array(n * 4), flow = new Int8Array(n * 4);
  const p = new V3();
  for (let i = 0; i < n; i++) {
    p.fromArray(mesh.pos, i * 3);
    const g = grad(f, p.x, p.y, p.z); g.toArray(nrm, i * 3);
    const A = attrs(p, g);
    const { I, W } = top4(A.wb);
    let wsum = 0; for (let k = 0; k < 4; k++) { skI[i * 4 + k] = I[k]; skW[i * 4 + k] = Math.round(W[k] * 255); wsum += skW[i * 4 + k]; }
    skW[i * 4] += 255 - wsum;
    const fl = A.flow.clone().addScaledVector(g, -A.flow.dot(g)); if (fl.lengthSq() < 1e-8) fl.set(0, -1, 0); fl.normalize();
    flow[i * 4] = Math.round(fl.x * 127); flow[i * 4 + 1] = Math.round(fl.y * 127); flow[i * 4 + 2] = Math.round(fl.z * 127);
    aux[i * 4] = Math.round(aoAt(p, g) * 255);
    aux[i * 4 + 1] = Math.round(clamp(A.fur / 0.03, 0, 1) * 255);
    aux[i * 4 + 2] = A.zone === 'nose' ? 255 : 0;
    aux[i * 4 + 3] = A.mask ? Math.round(A.mask * 255) : 0;
  }
  return { name, n, tris: mesh.idx.length / 3, pos: mesh.pos, nrm, skI, skW, aux, flow, idx: mesh.idx };
}
const bodyAttrs = (p) => {
  const A = primWeights(BODY, p.x, p.y, p.z);
  const s = neckS(p); // no long fur under the collar
  if (p.y > 0.42 && p.z > 0.12) A.fur *= mix(0.15, 1, sstep(0.008, 0.026, Math.abs(s - COLLAR_S)));
  return A;
};
const jawAttrs = (p) => primWeights(JAW, p.x, p.y, p.z);
const tailAttrs = (p) => {
  const t = tailParam(p.x, p.y, p.z), T = [0.0, 0.17, 0.34, 0.52, 0.7, 0.86];
  const wb = new Map();
  let i = 0; while (i < T.length - 1 && t > T[i + 1]) i++;
  if (i >= T.length - 1) wb.set('tail' + (T.length - 1), 1);
  else { const u = (t - T[i]) / (T[i + 1] - T[i]); wb.set('tail' + i, 1 - u); if (u > 0.001) wb.set('tail' + (i + 1), u); }
  const k = Math.min(TAILN - 1, Math.floor(t * TAILN)), tg = new V3().subVectors(tailPts[k + 1], tailPts[k]).normalize();
  return { wb, fur: 0.02 * (1 - 0.4 * t), flow: tg, zone: '' };
};

/* ---------------------------------------------------------------- ears, eyes, collar, ring, tongue (procedural) */
function earMesh(side) {
  const b = rig.bones[side > 0 ? 'earL' : 'earR'], M = b.matrixWorld;
  const NH = 9, NU = 8, pos = [], inner = [];
  const W0 = 0.029, HT = 0.074;
  const at = (h, u, face) => { // face: +1 inner (front), -1 outer (back)
    const w = W0 * Math.pow(1 - h, 0.85) + 0.0025, x = u * w;
    const cup = 0.011 * (1 - h) * (1 - u * u);
    const thick = 0.0032 + 0.009 * (1 - h) * (1 - Math.abs(u));
    const zc = -0.004 - cup * 0.9 + 0.003 * h;
    const z = face > 0 ? zc + 0.0015 + (1 - u * u) * 0.002 * (1 - h) : zc - thick;
    const y = -0.012 + h * (HT + 0.012) - 0.004 * u * u * (1 - h);
    return v3(x * side, y, z).applyMatrix4(M);
  };
  const grid = (face) => { const base = pos.length / 3; for (let i = 0; i <= NH; i++) for (let j = 0; j <= NU; j++) { const h = Math.pow(i / NH, 0.9), u = (j / NU) * 2 - 1; at(h, u, face).toArray(pos, pos.length); inner.push(face > 0 ? 1 : 0); } return base; };
  const bi = grid(1), bo = grid(-1), idx = [];
  const Q = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  for (let i = 0; i < NH; i++) for (let j = 0; j < NU; j++) {
    const a = i * (NU + 1) + j, bq = a + 1, c = a + NU + 2, d = a + NU + 1;
    if (side > 0) { Q(bi + a, bi + bq, bi + c, bi + d); Q(bo + a, bo + d, bo + c, bo + bq); }
    else { Q(bi + a, bi + d, bi + c, bi + bq); Q(bo + a, bo + bq, bo + c, bo + d); }
  }
  for (let i = 0; i < NH; i++) for (const j of [0, NU]) { // rims
    const a = i * (NU + 1) + j, d = a + NU + 1;
    const fl = (j === 0) === side > 0;
    if (fl) Q(bi + a, bi + d, bo + d, bo + a); else Q(bi + a, bo + a, bo + d, bi + d);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx), inner };
}
function sphereMesh(c, r, nu = 14, nv = 10, frame = null) {
  const pos = [], loc = [], idx = [];
  for (let i = 0; i <= nv; i++) for (let j = 0; j <= nu; j++) {
    const th = (i / nv) * Math.PI, ph = (j / nu) * Math.PI * 2;
    const l = v3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)); // local: y up
    const w = frame ? l.clone().applyMatrix3(frame) : l.clone();
    pos.push(c.x + w.x * r, c.y + w.y * r, c.z + w.z * r); loc.push(l.x, l.y, l.z);
  }
  for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) { const a = i * (nu + 1) + j, b = a + 1, cc = a + nu + 2, d = a + nu + 1; idx.push(a, b, cc, a, cc, d); }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx), loc };
}
function eyeFrame(s) { // columns: local x (towards the outer corner), y (up), z (gaze)
  const z = mir(FACE.eyeDir, s).normalize(), x = new V3().crossVectors(v3(0, 1, 0), z).normalize().multiplyScalar(s), y = new V3().crossVectors(z, x).normalize().multiplyScalar(s);
  return new THREE.Matrix3().set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z);
}
function collarMesh() {
  const NA = 28, prof = [[-0.011, 0.0], [-0.011, 0.0055], [0.011, 0.0055], [0.011, 0.0]]; // [along neck, out]
  const up = neckAxis, e1 = v3(1, 0, 0), e2 = new V3().crossVectors(up, e1).normalize(); // e2 ~ throat side
  const pos = [], uv = [], idx = [], c0 = NECK0.clone().addScaledVector(up, COLLAR_S);
  const radius = (dir, c) => { const f = (r) => { const p = c.clone().addScaledVector(dir, r); return sdBody(p.x, p.y, p.z); }; let a = 0.0, b = 0.0; while (b < 0.3 && f(b) < 0) { a = b; b += 0.002; } for (let it = 0; it < 24; it++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; } return (a + b) / 2; };
  for (let k = 0; k <= NA; k++) {
    const a = (k / NA) * Math.PI * 2, dir = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
    for (let q = 0; q < prof.length; q++) {
      const c = c0.clone().addScaledVector(up, prof[q][0]);
      const r = radius(dir, c) * 0.93 + prof[q][1];
      c.addScaledVector(dir, r).toArray(pos, pos.length); uv.push(k / NA, q / (prof.length - 1));
    }
  }
  const P = prof.length;
  for (let k = 0; k < NA; k++) for (let q = 0; q < P - 1; q++) { const a = k * P + q, b = a + P, c = b + 1, d = a + 1; idx.push(a, b, c, a, c, d); }
  // inner face closing the band
  for (let k = 0; k < NA; k++) { const a = k * P + P - 1, b = a + P, c = k * P + P, d = k * P; idx.push(a, b, c, a, c, d); }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx), uv, c0, e2 };
}
function torus(c, R, r, axisA, axisB, nu = 16, nv = 6) {
  const n = new V3().crossVectors(axisA, axisB).normalize(), pos = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = (i / nu) * Math.PI * 2, w = (j / nv) * Math.PI * 2;
    const d = axisA.clone().multiplyScalar(Math.cos(u)).addScaledVector(axisB, Math.sin(u));
    c.clone().addScaledVector(d, R + r * Math.cos(w)).addScaledVector(n, r * Math.sin(w)).toArray(pos, pos.length);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1, cc = b + 1, d = a + 1; idx.push(a, b, cc, a, cc, d); }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}
function tongueMesh() {
  const pos = [], idx = [], NL = 7, NW = 4;
  for (let i = 0; i <= NL; i++) for (let j = 0; j <= NW; j++) for (const f of [0, 1]) {
    const t = i / NL, u = (j / NW) * 2 - 1, w = 0.016 * (1 - 0.25 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.8) / 0.2, 2) * u * u * 0)) ;
    const z = 0.06 + t * 0.105, y = -0.03 - 0.06 * Math.pow(Math.max(0, t - 0.45), 1.6) - 0.004 * (1 - u * u) * (f ? 0 : 1);
    H(u * w, y + (f ? 0.0035 : 0), z).toArray(pos, pos.length);
  }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NW; j++) {
    const a = (i * (NW + 1) + j) * 2, b = a + 2, c = a + 2 * (NW + 1) + 2, d = a + 2 * (NW + 1);
    idx.push(a + 1, b + 1, c + 1, a + 1, c + 1, d + 1); idx.push(a, c, b, a, d, c);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}
function faceNormals(pos, idx) {
  const n = new Float32Array(pos.length), a = new V3(), b = new V3(), c = new V3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromArray(pos, idx[i] * 3); b.fromArray(pos, idx[i + 1] * 3); c.fromArray(pos, idx[i + 2] * 3);
    const f = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
    for (const k of [idx[i], idx[i + 1], idx[i + 2]]) { n[k * 3] += f.x; n[k * 3 + 1] += f.y; n[k * 3 + 2] += f.z; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
function rigidPart(name, mesh, weightsAt, nrm = null, extra = () => [0, 0, 0, 0]) {
  const n = mesh.pos.length / 3, N = nrm || faceNormals(mesh.pos, mesh.idx);
  const skI = new Uint8Array(n * 4), skW = new Uint8Array(n * 4), aux = new Uint8Array(n * 4), flow = new Int8Array(n * 4), p = new V3();
  for (let i = 0; i < n; i++) {
    p.fromArray(mesh.pos, i * 3);
    const { I, W } = top4(weightsAt(p, i));
    let s = 0; for (let k = 0; k < 4; k++) { skI[i * 4 + k] = I[k]; skW[i * 4 + k] = Math.round(W[k] * 255); s += skW[i * 4 + k]; } skW[i * 4] += 255 - s;
    const e = extra(p, i); for (let k = 0; k < 4; k++) aux[i * 4 + k] = e[k];
    flow[i * 4 + 1] = -127;
  }
  return { name, n, tris: mesh.idx.length / 3, pos: mesh.pos, nrm: N, skI, skW, aux, flow, idx: mesh.idx };
}

/* ---------------------------------------------------------------- run */
const t0 = Date.now();
const parts = [];
{
  const f = sdBody, h = 0.0034;
  let m = surfaceNets(f, v3(-0.16, -0.012, -0.37), v3(0.16, 0.73, 0.52), h);
  console.log('body net', m.pos.length / 3, 'v', m.idx.length / 3, 't', (Date.now() - t0) / 1000);
  project(f, m.pos, h);
  m = await simplify(m, +(process.env.BODY_TRIS || 14000));
  project(f, m.pos, h);
  parts.push(finish('body', m, f, bodyAttrs));
}
{
  const f = sdJaw, h = 0.0026;
  let m = surfaceNets(f, H(-0.04, -0.07, 0.0), H(0.04, -0.005, 0.18), h);
  project(f, m.pos, h); m = await simplify(m, 1100, 0.0012); project(f, m.pos, h);
  parts.push(finish('jaw', m, f, jawAttrs));
}
{
  const f = sdTail, h = 0.0036, bb = new THREE.Box3().setFromPoints(tailPts).expandByScalar(0.07);
  let m = surfaceNets(f, bb.min, bb.max, h);
  project(f, m.pos, h); m = await simplify(m, 2600); project(f, m.pos, h);
  parts.push(finish('tail', m, f, tailAttrs));
}
for (const s of [1, -1]) {
  const m = earMesh(s), b = s > 0 ? 'earL' : 'earR';
  parts.push(rigidPart(s > 0 ? 'earL' : 'earR', m, () => new Map([[b, 1]]), null, (p, i) => [Math.round(aoAt(p, v3(0, 0, 0)) * 0 + 255), 40, 0, m.inner[i] * 255]));
}
for (const s of [1, -1]) {
  const fr = eyeFrame(s), c = H(FACE.eye.x * s, FACE.eye.y, FACE.eye.z).addScaledVector(mir(FACE.eyeDir, s).normalize(), -0.0042);
  const m = sphereMesh(c, FACE.eyeR, 14, 10, fr);
  const N = new Float32Array(m.pos.length); for (let i = 0; i < m.pos.length; i += 3) { const d = v3(m.pos[i] - c.x, m.pos[i + 1] - c.y, m.pos[i + 2] - c.z).normalize(); d.toArray(N, i); }
  const part = rigidPart(s > 0 ? 'eyeL' : 'eyeR', m, () => new Map([['head', 1]]), N, (p, i) => [Math.round((m.loc[i * 3] * 0.5 + 0.5) * 255), Math.round((m.loc[i * 3 + 1] * 0.5 + 0.5) * 255), Math.round((m.loc[i * 3 + 2] * 0.5 + 0.5) * 255), 0]);
  parts.push(part);
}
{
  const m = collarMesh();
  parts.push(rigidPart('collar', m, (p) => primWeights(BODY, p.x, p.y, p.z, 0.02).wb, null, (p, i) => [Math.round(m.uv[i * 2] * 255), Math.round(m.uv[i * 2 + 1] * 255), 0, 0]));
  // iron ring under the throat
  const ringC = m.c0.clone().addScaledVector(m.e2, 0).add(v3(0, 0, 0));
  const throat = (() => { let best = null; for (let i = 0; i < m.pos.length; i += 3) { const p = v3(m.pos[i], m.pos[i + 1], m.pos[i + 2]); if (!best || p.dot(m.e2) > best.dot(m.e2)) best = p; } return best; })();
  const down = v3(0, -1, 0.15).normalize(), side = v3(1, 0, 0);
  const rc = throat.clone().addScaledVector(down, 0.013).addScaledVector(m.e2, 0.003);
  const tr = torus(rc, 0.0125, 0.0026, side, down);
  parts.push(rigidPart('ring', tr, (p) => primWeights(BODY, throat.x, throat.y, throat.z, 0.02).wb));
}
{
  const m = tongueMesh();
  parts.push(rigidPart('tongue', m, () => new Map([['jaw', 1]])));
}
console.log(parts.map((p) => `${p.name}:${p.tris}`).join(' '), 'total', parts.reduce((s, p) => s + p.tris, 0), 'time', (Date.now() - t0) / 1000);

/* ---------------------------------------------------------------- write */
const B64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const out = parts.map((p) => {
  const q = new Int16Array(p.n * 3); for (let i = 0; i < p.n * 3; i++) q[i] = Math.round(clamp(p.pos[i] / 1.0, -1, 1) * 32767);
  const nq = new Int8Array(p.n * 4); for (let i = 0; i < p.n; i++) for (let k = 0; k < 3; k++) nq[i * 4 + k] = Math.round(p.nrm[i * 3 + k] * 127);
  const big = p.n > 65535, ix = big ? new Uint32Array(p.idx) : new Uint16Array(p.idx);
  return { name: p.name, n: p.n, tris: p.tris, big, pos: B64(q), nrm: B64(nq), skI: B64(p.skI), skW: B64(p.skW), aux: B64(p.aux), flow: B64(p.flow), idx: B64(ix) };
});
const js = `// GENERATED by tools/dog_bake.mjs — do not edit. Farm-dog bind-pose meshes (root space, metres).\nexport const DOG_BONES = ${JSON.stringify(BONES)};\nexport const DOG_MESH = ${JSON.stringify(out)};\n`;
fs.writeFileSync(new URL('../src/models/dog_mesh.gen.js', import.meta.url), js);
console.log('wrote', (js.length / 1024).toFixed(0), 'KB');
