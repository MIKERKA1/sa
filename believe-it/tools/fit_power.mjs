// Fit the thumb of the power grip so it wraps the handle and rests on the index finger's middle phalanx.
import * as THREE from 'three';
import { createArm, applyHandPose, HAND_POSES, THUMB, FINGERS, anchors } from '../src/models/hands.js';
const V3 = THREE.Vector3;
let SEED = +(process.env.SEED || 7); const rnd = () => ((SEED = (SEED * 16807) % 2147483647) / 2147483647);
const arm = createArm('R');
const inv = new THREE.Matrix4();
function hp(obj, p) { arm.root.updateMatrixWorld(true); inv.copy(arm.wrist.matrixWorld).invert(); return obj.localToWorld(p.clone()).applyMatrix4(inv); }
function hd(obj, d) { return hp(obj, d).sub(hp(obj, new V3())).normalize(); }
const KEY = process.argv[2] || 'power';
const AP = anchors()[KEY];
const radial = (p) => { const d = p.clone().sub(AP.p); return d.sub(AP.axis.clone().multiplyScalar(d.dot(AP.axis))).length(); };
const segDist = (p, a, b) => { const ab = b.clone().sub(a); const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const base = HAND_POSES[KEY];
const pose = (x) => ({ ...base, t: { abd: x[0], flex: x[1], mcp: x[2], ip: x[3], twist: x[4] } });
const LIM = [[-45, 40], [0, 95], [-10, 75], [0, 85], [-70, 70]];
function measure() {
  const T = arm.thumb, F = arm.fingers;
  const pad = hp(T.ip, new V3(0, THUMB.len[2] * 0.6, -THUMB.dims[2][1] * 0.5));
  const padN = hd(T.ip, new V3(0, 0, -1));
  const q = hp(F[0].pip, new V3(0.006, FINGERS[0].len[1] * 0.5, FINGERS[0].t * 0.5));
  const qN = hd(F[0].pip, new V3(0, 0, 1));
  const d = q.clone().sub(pad), gap = d.length(), u = d.clone().divideScalar(gap || 1);
  // thumb centreline samples with half-thickness
  const samples = [];
  [[T.mcp, 1], [T.ip, 2]].forEach(([o, k]) => { for (const s of [0.15, 0.5, 0.85]) samples.push({ p: hp(o, new V3(0, THUMB.len[k] * s, 0)), h: THUMB.dims[k][1] * 0.5 }); });
  samples.push({ p: hp(T.ip, new V3(0, THUMB.len[2], 0)), h: THUMB.dims[2][1] * 0.4 });
  // finger capsules (segments) for collision
  const caps = [];
  F.forEach((f, i) => { const sp = FINGERS[i]; [[f.mcp, sp.len[0]], [f.pip, sp.len[1]], [f.dip, sp.len[2]]].forEach(([o, L]) => caps.push({ a: hp(o, new V3()), b: hp(o, new V3(0, L, 0)), h: Math.min(sp.w, sp.t) * 0.5 })); });
  return { pad, padN, q, qN, gap, u, samples, caps };
}
const S0 = (() => { applyHandPose(arm, base); const c0 = hp(arm.fingers[0].pip, new V3()); return c0.sub(AP.p).dot(AP.axis); })();
const axial = (p) => p.clone().sub(AP.p).dot(AP.axis);
const MODE = process.argv[3] || 'wrap'; // wrap: thumb hugs the handle; fist: thumb pad rests on the index/middle middle phalanges
function cost(x, x0) {
  applyHandPose(arm, pose(x));
  const m = measure();
  let c = 0;
  if (MODE === 'fist') {
    c += ((m.gap - 0.004) / 0.002) ** 2 + 4 * (1 - m.padN.dot(m.u)) + 4 * (1 + m.qN.dot(m.u));
    const td = hd(arm.thumb.ip, new V3(0, 1, 0)), along = -td.dot(AP.axis);
    if (along < 0.6) c += 8 * (0.6 - along) ** 2 / 0.04;
  }
  m.samples.forEach((s, i) => {
    const rd = radial(s.p) - AP.r - s.h;
    if (rd < 0) c += (rd / 0.0015) ** 2;
    if (MODE === 'wrap') {
      if (i >= 1) c += 0.6 * ((rd - 0.0015) / 0.003) ** 2;
      if (i >= 3) c += 0.4 * ((axial(s.p) - (S0 + 0.008)) / 0.006) ** 2;
    }
    for (const k of m.caps) { const pk = k.h + s.h - 0.003 - segDist(s.p, k.a, k.b); if (pk > 0) c += (pk / 0.0015) ** 2; }
  });
  let r = 0; x.forEach((v, i) => { r += ((v - x0[i]) / 40) ** 2; const [lo, hi] = LIM[i]; if (v < lo) r += ((lo - v) / 2) ** 2; if (v > hi) r += ((v - hi) / 2) ** 2; });
  return c + 0.2 * r;
}
const x0 = [base.t.abd, base.t.flex, base.t.mcp, base.t.ip, base.t.twist || 0];
let best = x0.slice(), bc = cost(best, x0);
console.log('start cost', bc.toFixed(2));
for (let restart = 0; restart < 30; restart++) {
  let x = restart === 0 ? x0.slice() : best.map((v) => v + (rnd() - 0.5) * 50), c = cost(x, x0);
  for (let step = 16; step > 0.25; step *= 0.6) {
    let improved = true;
    while (improved) { improved = false; for (let i = 0; i < x.length; i++) for (const s of [step, -step]) { const y = x.slice(); y[i] += s; const cy = cost(y, x0); if (cy < c - 1e-9) { x = y; c = cy; improved = true; } } }
  }
  if (c < bc) { bc = c; best = x; }
}
applyHandPose(arm, pose(best));
const m = measure();
const minR = Math.min(...m.samples.map((s) => radial(s.p) - AP.r - s.h));
console.log('cost', bc.toFixed(3), 'gap', m.gap.toFixed(4), 'padN.u', m.padN.dot(m.u).toFixed(2), 'qN.-u', (-m.qN.dot(m.u)).toFixed(2), 'min clearance', minR.toFixed(4), 'r', AP.r.toFixed(4), 'S0', S0.toFixed(4));
m.samples.forEach((s) => console.log(' rad', (radial(s.p) - AP.r - s.h).toFixed(4), 'ax', (axial(s.p) - S0).toFixed(4)));
console.log(JSON.stringify(pose(best.map((v) => Math.round(v))).t));
