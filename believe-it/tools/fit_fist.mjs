// Fit a fist (power / carry) around an explicit cylinder: every finger wraps it without passing through,
// and the thumb hugs the handle with its nail facing outwards. Usage: node tools/fit_fist.mjs <pose> <radius>
import * as THREE from 'three';
import { createArm, applyHandPose, HAND_POSES, FINGERS, THUMB, anchors } from '../src/models/hands.js';
const V3 = THREE.Vector3;
const KEY = process.argv[2] || 'carry', R = +(process.argv[3] || 0.0125);
let SEED = 11; const rnd = () => ((SEED = (SEED * 16807) % 2147483647) / 2147483647);
const arm = createArm('R');
const inv = new THREE.Matrix4();
const hp = (o, p) => { arm.root.updateMatrixWorld(true); inv.copy(arm.wrist.matrixWorld).invert(); return o.localToWorld(p.clone()).applyMatrix4(inv); };
const hd = (o, d) => hp(o, d).sub(hp(o, new V3())).normalize();
const A0 = anchors()[KEY];
const AX = A0.axis.clone();
let C = A0.p.clone();
const rel = (p) => { const d = p.clone().sub(C); const ax = d.dot(AX); const rv = d.sub(AX.clone().multiplyScalar(ax)); return { r: rv.length(), ax, rv }; };
// palmar surface height of the palm along y (from palmGeometry rings), the handle must stay below it
const PZ = [[0.0, -0.018], [0.027, -0.018], [0.064, -0.017], [0.0855, -0.0127], [0.1, -0.009]];
const palmZ = (y) => { for (let i = 1; i < PZ.length; i++) if (y <= PZ[i][0]) { const [y0, z0] = PZ[i - 1], [y1, z1] = PZ[i]; return z0 + ((y - y0) / (y1 - y0)) * (z1 - z0); } return PZ[PZ.length - 1][1]; };
const base = JSON.parse(JSON.stringify(HAND_POSES[KEY]));
const segScale = [[1, 1], [0.94, 0.95], [0.9, 0.9]];
function descend(f, x0, lim, iters = 1) {
  let best = x0.slice(), bc = f(best);
  for (let rs = 0; rs < 12 * iters; rs++) {
    let x = rs === 0 ? x0.slice() : best.map((v, i) => Math.min(lim[i][1], Math.max(lim[i][0], v + (rnd() - 0.5) * 40))), c = f(x);
    for (let step = 12; step > 0.2; step *= 0.6) {
      let imp = true;
      while (imp) { imp = false; for (let i = 0; i < x.length; i++) for (const s of [step, -step]) { const y = x.slice(); y[i] = Math.min(lim[i][1], Math.max(lim[i][0], y[i] + s)); const cy = f(y); if (cy < c - 1e-9) { x = y; c = cy; imp = true; } } }
    }
    if (c < bc) { bc = c; best = x; }
  }
  return { x: best, c: bc };
}
// ---- fingers
function fitFingers() {
const P = JSON.parse(JSON.stringify(base));
const fingerReport = []; let total = 0;
FINGERS.forEach((spec, fi) => {
  const F = arm.fingers[fi];
  const cost = (x) => {
    P.f[fi] = x; applyHandPose(arm, P);
    let c = 0;
    [[F.mcp, 0, [0.35, 0.65, 0.95]], [F.pip, 1, [0.2, 0.5, 0.85]], [F.dip, 2, [0.25, 0.55, 0.85]]].forEach(([o, s, ys]) => {
      const t = spec.t * segScale[s][1];
      ys.forEach((yf, j) => {
        const d = rel(hp(o, new V3(0, spec.len[s] * yf, -t * 0.45))).r - R;
        if (d < 0) c += 10 * (d / 0.0008) ** 2;
        if ((s > 0 && j === 1) || (s === 0 && j === 2)) c += 0.4 * (d / 0.002) ** 2;
      });
    });
    x.forEach((v, i) => { c += 0.05 * ((v - base.f[fi][i]) / 30) ** 2; });
    return c;
  };
  const r = descend(cost, base.f[fi], [[20, 100], [40, 125], [10, 95]]);
  P.f[fi] = r.x.map((v) => Math.round(v)); total += r.c;
  applyHandPose(arm, P);
  let minD = 1;
  [[F.mcp, 0], [F.pip, 1], [F.dip, 2]].forEach(([o, s]) => { for (let k = 0; k <= 10; k++) minD = Math.min(minD, rel(hp(o, new V3(0, spec.len[s] * k / 10, -spec.t * segScale[s][1] * 0.45))).r - R); });
  fingerReport.push(`${spec.name}: ${P.f[fi].join(',')} cost ${r.c.toFixed(2)} min clearance ${(minD * 1000).toFixed(1)}mm`);
});
return { P, fingerReport, total };
}
let bestG = null;
for (const yc of [0.068, 0.074, 0.08]) for (const dz of [0, 0.003]) {
  C = new V3(0, yc, palmZ(yc) - R - 0.0008 - dz);
  const g = fitFingers();
  console.log('yc', yc, 'z', C.z.toFixed(4), 'cost', g.total.toFixed(2), g.fingerReport.map((l) => l.split('clearance ')[1]).join(' '));
  if (!bestG || g.total < bestG.total) bestG = { ...g, C: C.clone() };
}
C = bestG.C; const P = bestG.P; const fingerReport = bestG.fingerReport;
console.log(fingerReport.join('\n'));
// ---- thumb: hug the handle next to/over the index finger, nail outwards, no penetration of handle or fingers
applyHandPose(arm, P);
const S0 = rel(hp(arm.fingers[0].pip, new V3())).ax;
const segDist = (p, a, b) => { const ab = b.clone().sub(a); const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const caps = [];
arm.fingers.forEach((f, i) => { const sp = FINGERS[i]; [[f.mcp, sp.len[0]], [f.pip, sp.len[1]], [f.dip, sp.len[2]]].forEach(([o, L]) => caps.push({ a: hp(o, new V3()), b: hp(o, new V3(0, L, 0)), h: Math.min(sp.w, sp.t) * 0.47 })); });
const tpose = (x) => ({ ...P, t: { abd: x[0], flex: x[1], mcp: x[2], ip: x[3], twist: x[4] } });
const T = arm.thumb;
const tcost = (x) => {
  applyHandPose(arm, tpose(x));
  let c = 0;
  const samples = [];
  [[T.mcp, 1], [T.ip, 2]].forEach(([o, k]) => { for (const s of [0.2, 0.5, 0.85]) samples.push({ p: hp(o, new V3(0, THUMB.len[k] * s, 0)), h: THUMB.dims[k][1] * 0.5, k }); });
  samples.forEach((s, i) => {
    const q = rel(s.p), d = q.r - R - s.h;
    if (d < 0) c += 10 * (d / 0.0008) ** 2;
    if (i >= 2) c += 0.8 * ((d - 0.001) / 0.003) ** 2;
    for (const k of caps) { const pk = k.h + s.h - 0.002 - segDist(s.p, k.a, k.b); if (pk > 0) c += 4 * (pk / 0.0012) ** 2; }
  });
  // nail (thumb +Z) points away from the handle axis on the distal and proximal phalanges
  for (const [o, k] of [[T.ip, 2], [T.mcp, 1]]) {
    const q = rel(hp(o, new V3(0, THUMB.len[k] * 0.5, 0)));
    const out = q.rv.clone().normalize(), nz = hd(o, new V3(0, 0, 1));
    c += 6 * (1 - nz.dot(out)) ** 2;
  }
  // thumb wraps across the handle (perpendicular to the axis), close to the index side
  const tipAx = rel(hp(T.ip, new V3(0, THUMB.len[2] * 0.8, 0))).ax;
  c += 0.5 * ((tipAx - (S0 + 0.004)) / 0.006) ** 2;
  const lim = [[-50, 40], [-10, 95], [-10, 80], [-5, 85], [-40, 40]];
  x.forEach((v, i) => { if (v < lim[i][0]) c += ((lim[i][0] - v) / 2) ** 2; if (v > lim[i][1]) c += ((v - lim[i][1]) / 2) ** 2; });
  return c;
};
const t0 = [base.t.abd, base.t.flex, base.t.mcp, base.t.ip, base.t.twist || 0];
let best = null;
for (const start of [t0, [-20, 40, 30, 40, 0], [-35, 20, 40, 50, 10], [-10, 50, 20, 30, -10]]) {
  const r = descend(tcost, start, [[-50, 40], [-10, 95], [-10, 80], [-5, 85], [-40, 40]], 1);
  if (!best || r.c < best.c) best = r;
}
const tt = best.x.map((v) => Math.round(v));
console.log('thumb cost', best.c.toFixed(2));
const out = tpose(tt);
console.log(JSON.stringify({ f: out.f, s: out.s, t: out.t, cyl: { p: C.toArray().map((v) => +v.toFixed(4)), axis: AX.toArray().map((v) => +v.toFixed(4)), r: R } }));
