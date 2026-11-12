// Fit finger/thumb angles so the pinch (key) and paper grips actually close on the object.
import * as THREE from 'three';
import { createArm, applyHandPose, HAND_POSES, THUMB, FINGERS } from '../src/models/hands.js';
const V3 = THREE.Vector3;
const arm = createArm('R');
const inv = new THREE.Matrix4();
function hp(obj, p) { arm.root.updateMatrixWorld(true); inv.copy(arm.wrist.matrixWorld).invert(); return obj.localToWorld(p.clone()).applyMatrix4(inv); }
function hd(obj, d) { return hp(obj, d).sub(hp(obj, new V3())).normalize(); }
const D2R = Math.PI / 180;

function poseFrom(base, x, kind) {
  const P = JSON.parse(JSON.stringify(base));
  if (kind === 'pinch') {
    P.f[0] = [x[0], x[1], x[2]];
    P.t = { abd: x[3], flex: x[4], mcp: x[5], ip: x[6], twist: x[7] };
  } else {
    P.f[0] = [x[0], x[1], x[2]];
    P.f[1] = [x[3], x[4], x[5]];
    P.f[2] = [x[3] + 5, x[4] + 5, x[5] + 2];
    P.f[3] = [x[3] + 10, x[4] + 9, x[5] + 4];
    P.t = { abd: x[6], flex: x[7], mcp: x[8], ip: x[9], twist: x[10] };
  }
  return P;
}
function measure(kind) {
  const T = arm.thumb, F = arm.fingers;
  const pad = hp(T.ip, new V3(0, THUMB.len[2] * 0.6, -THUMB.dims[2][1] * 0.5));
  const padN = hd(T.ip, new V3(0, 0, -1));
  let q, qN;
  if (kind === 'pinch') {
    q = hp(F[0].pip, new V3(-FINGERS[0].w * 0.5, FINGERS[0].len[1] * 0.6, 0));
    qN = hd(F[0].pip, new V3(-1, 0, 0));
  } else {
    const a = hp(F[0].dip, new V3(0, FINGERS[0].len[2] * 0.5, -FINGERS[0].t * 0.45)), b = hp(F[1].dip, new V3(0, FINGERS[1].len[2] * 0.5, -FINGERS[1].t * 0.45));
    q = a.add(b).multiplyScalar(0.5);
    qN = hd(F[0].dip, new V3(0, 0, -1)).add(hd(F[1].dip, new V3(0, 0, -1))).normalize();
  }
  const d = q.clone().sub(pad), gap = d.length(), u = d.clone().divideScalar(gap);
  return { pad, padN, q, qN, gap, u };
}
const LIM = {
  pinch: [[0, 80], [10, 110], [0, 70], [-40, 60], [-30, 80], [-10, 60], [-10, 70], [-60, 60]],
  paper: [[0, 70], [0, 80], [0, 50], [0, 70], [0, 80], [0, 50], [-40, 60], [-30, 80], [-10, 60], [-10, 70], [-60, 60]],
};
const TARGET = { pinch: 0.0105, paper: 0.0045 };
function cost(kind, x, x0) {
  applyHandPose(arm, poseFrom(HAND_POSES[kind], x, kind));
  const m = measure(kind);
  let c = ((m.gap - TARGET[kind]) / 0.002) ** 2;
  c += 6 * (1 - m.padN.dot(m.u)) + 6 * (1 + m.qN.dot(m.u));
  let r = 0; x.forEach((v, i) => { r += ((v - x0[i]) / 35) ** 2; const [lo, hi] = LIM[kind][i]; if (v < lo) r += ((lo - v) / 2) ** 2; if (v > hi) r += ((v - hi) / 2) ** 2; });
  return c + 0.25 * r;
}
function fit(kind, x0) {
  let best = x0.slice(), bc = cost(kind, best, x0);
  for (let restart = 0; restart < 6; restart++) {
    let x = restart === 0 ? x0.slice() : best.map((v) => v + (Math.random() - 0.5) * 30), c = cost(kind, x, x0);
    for (let step = 16; step > 0.25; step *= 0.6) {
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < x.length; i++) for (const s of [step, -step]) {
          const y = x.slice(); y[i] += s; const cy = cost(kind, y, x0);
          if (cy < c - 1e-9) { x = y; c = cy; improved = true; }
        }
      }
    }
    if (c < bc) { bc = c; best = x; }
  }
  applyHandPose(arm, poseFrom(HAND_POSES[kind], best, kind));
  const m = measure(kind);
  console.log(kind, 'cost', bc.toFixed(3), 'gap', m.gap.toFixed(4), 'padN.u', m.padN.dot(m.u).toFixed(3), 'qN.-u', (-m.qN.dot(m.u)).toFixed(3));
  console.log(JSON.stringify(poseFrom(HAND_POSES[kind], best.map((v) => Math.round(v)), kind)));
}
const P0 = HAND_POSES.pinch, Q0 = HAND_POSES.paper;
fit('pinch', [...P0.f[0], P0.t.abd, P0.t.flex, P0.t.mcp, P0.t.ip, P0.t.twist || 0]);
fit('paper', [...Q0.f[0], ...Q0.f[1], Q0.t.abd, Q0.t.flex, Q0.t.mcp, Q0.t.ip, Q0.t.twist || 0]);
