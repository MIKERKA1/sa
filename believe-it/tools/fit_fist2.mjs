// Analytic fist: every finger segment is laid tangent to an explicit handle cylinder (no penetration),
// then the thumb is fitted to hug the handle with its nail outwards.
// Usage: node tools/fit_fist2.mjs <pose> <R> <yc> <zgap>
import * as THREE from 'three';
import { createArm, applyHandPose, HAND_POSES, FINGERS, THUMB } from '../src/models/hands.js';
const V3 = THREE.Vector3, D = 180 / Math.PI;
const KEY = process.argv[2] || 'carry', R = +(process.argv[3] || 0.0125), YC = +(process.argv[4] || 0.078), ZGAP = +(process.argv[5] || 0.001);
let SEED = 5; const rnd = () => ((SEED = (SEED * 16807) % 2147483647) / 2147483647);
const arm = createArm('R');
const inv = new THREE.Matrix4();
const hp = (o, p) => { arm.root.updateMatrixWorld(true); inv.copy(arm.wrist.matrixWorld).invert(); return o.localToWorld(p.clone()).applyMatrix4(inv); };
const hd = (o, d) => hp(o, d).sub(hp(o, new V3())).normalize();
const PZ = [[0.0, -0.018], [0.027, -0.018], [0.064, -0.017], [0.0855, -0.0127], [0.1, -0.009]];
const palmZ = (y) => { for (let i = 1; i < PZ.length; i++) if (y <= PZ[i][0]) { const [y0, z0] = PZ[i - 1], [y1, z1] = PZ[i]; return z0 + ((y - y0) / (y1 - y0)) * (z1 - z0); } return PZ[PZ.length - 1][1]; };
const mcpP = FINGERS.map((f) => new V3(...f.pos));
const AX = mcpP[0].clone().sub(mcpP[3]).normalize();
const C = new V3(0, YC, palmZ(YC) - R - ZGAP);
const base = JSON.parse(JSON.stringify(HAND_POSES[KEY]));
const P = JSON.parse(JSON.stringify(base));
const segT = (i, s) => FINGERS[i].t * [1, 0.95, 0.9][s];
const LIMS = [[0, 98], [0, 112], [0, 85]];
const report = [];
FINGERS.forEach((spec, i) => {
  P.f[i] = [0, 0, 0]; applyHandPose(arm, P);
  const F = arm.fingers[i];
  // cylinder axis in the (unflexed) MCP frame
  arm.root.updateMatrixWorld(true);
  const toM = F.mcp.matrixWorld.clone().invert().multiply(arm.wrist.matrixWorld);
  const c = C.clone().applyMatrix4(toM), a = AX.clone().transformDirection(toM);
  const tq = -c.x / a.x, Q = c.clone().addScaledVector(a, tq); // axis ∩ plane x = 0
  const stretch = 1 / Math.max(0.5, Math.abs(a.x));
  let J = new V3(0, 0, 0), phi = 0; const ang = [];
  for (let s = 0; s < 3; s++) {
    const rho = (R + segT(i, s) / 2 + 0.0004) * (1 + (stretch - 1) * 0.5);
    const v = Q.clone().sub(J), d = Math.hypot(v.y, v.z);
    let phiV = Math.atan2(-v.z, v.y);
    phiV = phi + Math.atan2(Math.sin(phiV - phi), Math.cos(phiV - phi));
    let phiS = d > rho ? phiV - Math.asin(rho / d) : phi + 0.6;
    let th = (phiS - phi) * D;
    th = Math.min(LIMS[s][1], Math.max(LIMS[s][0], th));
    ang.push(Math.round(th));
    phi += th / D;
    J = J.clone().add(new V3(0, Math.cos(phi) * spec.len[s], -Math.sin(phi) * spec.len[s]));
  }
  P.f[i] = ang;
  applyHandPose(arm, P);
  // clearance check along the palmar surface + fingertip vs palm
  let minD = 1;
  [[F.mcp, 0], [F.pip, 1], [F.dip, 2]].forEach(([o, s]) => { for (let k = 0; k <= 12; k++) for (const ex of [-0.5, 0, 0.5]) { const p = hp(o, new V3(ex * spec.w * 0.45, spec.len[s] * k / 12, -segT(i, s) * 0.5)); const dd = p.clone().sub(C); const r = dd.sub(AX.clone().multiplyScalar(dd.dot(AX))).length(); minD = Math.min(minD, r - R); } });
  const tip = hp(F.dip, new V3(0, spec.len[2], -segT(i, 2) * 0.3));
  report.push(`${spec.name}: [${ang.join(', ')}] clearance ${(minD * 1000).toFixed(1)}mm tip y ${tip.y.toFixed(3)} z ${tip.z.toFixed(3)} palmZ ${palmZ(tip.y).toFixed(3)}`);
});
console.log(report.join('\n'));
// ---- thumb
applyHandPose(arm, P);
const rel = (p) => { const d = p.clone().sub(C); const ax = d.dot(AX); const rv = d.sub(AX.clone().multiplyScalar(ax)); return { r: rv.length(), ax, rv }; };
const S0 = rel(hp(arm.fingers[0].pip, new V3())).ax;
const segDist = (p, a, b) => { const ab = b.clone().sub(a); const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const caps = [];
arm.fingers.forEach((f, i) => { const sp = FINGERS[i]; [[f.mcp, sp.len[0]], [f.pip, sp.len[1]], [f.dip, sp.len[2]]].forEach(([o, L]) => caps.push({ a: hp(o, new V3()), b: hp(o, new V3(0, L, 0)), h: Math.min(sp.w, sp.t) * 0.47 })); });
const T = arm.thumb;
const tpose = (x) => ({ ...P, t: { abd: x[0], flex: x[1], mcp: x[2], ip: x[3], twist: x[4] } });
const LIM = [[-50, 40], [-10, 95], [-10, 80], [-5, 85], [-40, 40]];
const tcost = (x) => {
  applyHandPose(arm, tpose(x));
  let c = 0;
  const samples = [];
  [[T.mcp, 1], [T.ip, 2]].forEach(([o, k]) => { for (const s of [0.2, 0.5, 0.85]) samples.push({ p: hp(o, new V3(0, THUMB.len[k] * s, 0)), h: THUMB.dims[k][1] * 0.5 }); });
  samples.forEach((s, i) => {
    const d = rel(s.p).r - R - s.h;
    if (d < 0) c += 10 * (d / 0.0008) ** 2;
    if (i >= 2) c += 0.8 * ((d - 0.001) / 0.003) ** 2;
    for (const k of caps) { const pk = k.h + s.h - 0.002 - segDist(s.p, k.a, k.b); if (pk > 0) c += 4 * (pk / 0.0012) ** 2; }
  });
  for (const [o, k] of [[T.ip, 2], [T.mcp, 1]]) {
    const q = rel(hp(o, new V3(0, THUMB.len[k] * 0.5, 0)));
    c += 6 * (1 - hd(o, new V3(0, 0, 1)).dot(q.rv.clone().normalize())) ** 2;
  }
  const tipAx = rel(hp(T.ip, new V3(0, THUMB.len[2] * 0.8, 0))).ax;
  c += 0.5 * ((tipAx - (S0 + 0.004)) / 0.006) ** 2;
  x.forEach((v, i) => { if (v < LIM[i][0]) c += ((LIM[i][0] - v) / 2) ** 2; if (v > LIM[i][1]) c += ((v - LIM[i][1]) / 2) ** 2; });
  return c;
};
function descend(f, x0) {
  let best = x0.slice(), bc = f(best);
  for (let rs = 0; rs < 16; rs++) {
    let x = rs === 0 ? x0.slice() : best.map((v) => v + (rnd() - 0.5) * 40), c = f(x);
    for (let step = 12; step > 0.2; step *= 0.6) { let imp = true; while (imp) { imp = false; for (let i = 0; i < x.length; i++) for (const s of [step, -step]) { const y = x.slice(); y[i] += s; const cy = f(y); if (cy < c - 1e-9) { x = y; c = cy; imp = true; } } } }
    if (c < bc) { bc = c; best = x; }
  }
  return { x: best, c: bc };
}
let best = null;
for (const st of [[-24, -4, -1, 60, 2], [-20, 40, 30, 40, 0], [-35, 20, 40, 50, 10], [-10, 50, 20, 30, -10], [-40, 10, 20, 70, 20]]) { const r = descend(tcost, st); if (!best || r.c < best.c) best = r; }
const tt = best.x.map((v) => Math.round(v));
console.log('thumb cost', best.c.toFixed(2));
console.log(JSON.stringify({ f: P.f, s: P.s, t: tpose(tt).t, cyl: { p: C.toArray().map((v) => +v.toFixed(4)), axis: AX.toArray().map((v) => +v.toFixed(4)), r: R } }));
