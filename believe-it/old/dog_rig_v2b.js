// "Believe It" — farm dog rig: skeleton, pose model, planar leg IK and the procedural animation set.
// Shared by the runtime (src/models/dog.js) and the offline mesh bake (tools/dog_bake.mjs).
// Root space: origin = ground under the middle of the body, nose towards +Z, up +Y, the dog's left side is +X.
import * as THREE from 'three';
import { clamp, lerp, smooth, deg } from '../engine/util.js';

const V3 = THREE.Vector3;
const v3 = (x, y, z) => new V3(x, y, z);

/* ================================================================ joints (bind pose = neutral stand) */
export const HIP = v3(0, 0.46, -0.21), CHEST = v3(0, 0.46, -0.05), RIBS = v3(0, 0.4, 0.08);
export const NECK0 = v3(0, 0.5, 0.2), NECK_A = deg(41), NECK_L = 0.152;
export const HEADP = NECK0.clone().add(v3(0, Math.cos(NECK_A) * NECK_L, Math.sin(NECK_A) * NECK_L)); // head pivot (atlas joint)
export const JAW0 = v3(0, -0.038, 0.045);                      // head-local hinge of the lower jaw
export const EAR0 = v3(0.068, 0.086, 0.006), EAR_SPLAY = deg(9), EAR_YAW = deg(18); // head-local ear base (left)
export const TAIL0 = v3(0, 0.485, -0.31);
// tail centre line (relative to TAIL0): up from the croup, over the back and down the left hip -> ring
export const TAIL_PTS = [[0, 0, 0], [0, 0.035, 0.055], [0, 0.09, 0.082], [0.004, 0.14, 0.062], [0.01, 0.158, 0.008], [0.018, 0.128, -0.045], [0.028, 0.065, -0.064], [0.04, 0.0, -0.05]];
export const TAIL_BONE_T = [0, 0.17, 0.34, 0.52, 0.7, 0.86];
// face landmarks (head-local, left side; mirrored for the right)
export const FACE = {
  eye: v3(0.05, 0.036, 0.088), eyeR: 0.0125, eyeDir: v3(0.45, 0.1, 0.89).normalize(),
  eyeSock: v3(0.0165, 0.0088, 0.012), eyeRot: [0, 0.45, -0.18],
  nose: v3(0, -0.004, 0.165), noseR: v3(0.025, 0.019, 0.017),
  stopZ: 0.1, lipY: -0.047,
};
export const LEG = { // segment lengths [upper, lower, foot], joint in root space, paw scale
  F: { L: [0.15, 0.21, 0.055], at: v3(0.072, 0.42, 0.225), paw: 1.0 },
  H: { L: [0.175, 0.2, 0.13], at: v3(0.07, 0.45, -0.255), paw: 1.0 },
};
export const STAND_F = [0.24, 0.03, deg(-12), 0, 0], STAND_H = [-0.345, 0.03, deg(-16), 0, 0];

/* ================================================================ poses */
export const P0 = () => ({
  hy: 0, hz: 0, hp: 0, hyaw: 0, hr: 0, cp: 0, cyaw: 0, cr: 0, np: 0, nyaw: 0, dp: 0, dyaw: 0, dr: 0,
  jaw: 0.0, tongue: 0, lid: 0, earL: 0, earR: 0, earS: 0, tp: 0, ty: 0, tr: 0, tc: 0, br: 0,
  FL: STAND_F.slice(), FR: STAND_F.slice(), HL: STAND_H.slice(), HR: STAND_H.slice(),
});
export function lerpPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(b)) o[k] = Array.isArray(b[k]) ? b[k].map((x, i) => lerp(a[k][i], x, t)) : lerp(a[k] ?? 0, b[k], t);
  return o;
}
const flick = (t, period, off, len = 0.28) => { const x = (((t + off) % period) + period) % period / len; return x < 1 ? Math.sin(Math.PI * x) : 0; };
const pulse = (x, a, len) => (x >= a && x <= a + len ? Math.pow(Math.sin((Math.PI * (x - a)) / len), 0.7) : 0);
const TAU = Math.PI * 2;

function sitBase() {
  const P = P0();
  Object.assign(P, { hy: -0.262, hz: 0.04, hp: deg(-40), cp: deg(-8), np: deg(26), dp: deg(14), tp: deg(26), tr: deg(-10) });
  P.FL = [0.2, 0.03, deg(-6), 0, 0]; P.FR = P.FL.slice();
  P.HL = [0.03, 0.03, deg(-82), 0, 0.016]; P.HR = P.HL.slice(); P.HR[4] = -0.016;
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

export const ANIM = {
  bind() { return P0(); },
  stand(t) {
    const P = P0();
    P.br = 0.012 * Math.sin(t * 2.3);
    P.dyaw = 0.28 * Math.sin(t * 0.42) + 0.08 * Math.sin(t * 1.07 + 1); P.nyaw = 0.35 * P.dyaw;
    P.dp = 0.05 * Math.sin(t * 0.31 + 2); P.dr = 0.05 * Math.sin(t * 0.37);
    P.earL = 0.4 * flick(t, 3.7, 0); P.earR = 0.4 * flick(t, 5.1, 1.7); P.lid = flick(t, 4.3, 0.6, 0.16);
    P.ty = 0.1 * Math.sin(t * 1.4);
    return P;
  },
  sit(t) {
    const P = sitBase();
    P.br = 0.012 * Math.sin(t * 2.1);
    P.dyaw = 0.42 * Math.sin(t * 0.38) + 0.1 * Math.sin(t * 1.3); P.nyaw = 0.3 * P.dyaw;
    P.dr = 0.07 * Math.sin(t * 0.5 + 1); P.dp += 0.05 * Math.sin(t * 0.27);
    P.earL = 0.4 * flick(t, 4.3, 0.5); P.earR = 0.4 * flick(t, 3.3, 2.0); P.lid = flick(t, 3.9, 1.4, 0.16);
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
    P.jaw = 0.03 + 0.42 * b;
    P.np = deg(-14) - 0.08 * b; P.dp = deg(-6) - 0.14 * b;
    P.hz = -0.012 * b; P.hy = -0.01 * b; P.cp = deg(-4) - 0.03 * b; P.br = 0.02 * b;
    P.FL = [0.236, 0.03, deg(-2), 0, 0.006]; P.FR = [0.236, 0.03, deg(-2), 0, -0.006];
    P.HL = [-0.282, 0.03, deg(-8), 0, 0.006]; P.HR = [-0.282, 0.03, deg(-8), 0, -0.006];
    P.earL = P.earR = -0.12; P.earS = -deg(4);
    P.tp = -0.16; P.ty = 0.05 * Math.sin(t * 9);
    return P;
  },
  sleep(t) {
    const P = P0();
    Object.assign(P, { hy: -0.37, hz: 0.02, hyaw: deg(-30), hr: deg(-10), cp: deg(2), cyaw: deg(58), cr: deg(6), np: deg(60), nyaw: deg(70), dp: deg(-52), dyaw: deg(50), dr: deg(-16) });
    P.br = 0.016 * Math.sin(t * 1.35);
    P.earL = 0.7 + 0.3 * flick(t, 6.2, 1); P.earR = 0.7; P.earS = deg(-6); P.lid = 1;
    P.jaw = 0.0; P.tp = deg(14); P.ty = deg(-52); P.tr = deg(-96) + 0.03 * Math.sin(t * 0.7);
    P.FL = [0.34, 0.025, deg(-84), 0, 0.03]; P.FR = [0.3, 0.025, deg(-84), 0, 0.0];
    P.HL = [-0.05, 0.03, deg(-86), 0, 0.03]; P.HR = [-0.08, 0.03, deg(-86), 0, -0.03];
    return P;
  },
  sniff(t) {
    const P = P0(), burst = 0.5 + 0.5 * Math.sin(t * 2.1);
    Object.assign(P, { hy: -0.035, hp: deg(5), cp: deg(14), np: deg(70), dp: deg(-12) });
    P.nyaw = 0.32 * Math.sin(t * 1.25); P.dyaw = 0.14 * Math.sin(t * 1.25 + 0.6); P.dr = -0.5 * P.dyaw;
    P.jaw = 0.01 + 0.025 * Math.abs(Math.sin(t * 19)) * burst;
    P.FL = [0.2, 0.03, deg(-22), 0, 0.004]; P.FR = [0.16, 0.03, deg(-20), 0, -0.004];
    P.earL = P.earR = -0.05; P.tp = 0.12; P.ty = 0.15 * Math.sin(t * 2.2);
    return P;
  },
  wag(t) {
    const P = P0(), w = Math.sin(t * TAU * 3.0);
    P.ty = 0.5 * w; P.tr = 0.14 * w; P.tp = -0.1;
    P.hyaw = -0.05 * w; P.cyaw = 0.04 * w; P.hr = 0.03 * w;
    P.earL = P.earR = 0.5; P.dr = 0.1 * Math.sin(t * 0.8); P.dp = -0.06; P.lid = flick(t, 3.1, 0.9, 0.16);
    P.jaw = 0.16 + 0.04 * Math.sin(t * 13); P.tongue = 1; P.br = 0.018 * Math.sin(t * 13);
    return P;
  },
  pet(t) { // sitting under the player's hand (first-person petting)
    const P = sitBase(), w = Math.sin(t * TAU * 2.2);
    P.dp = deg(-4) + 0.03 * Math.sin(t * 1.3); P.np = deg(22);
    P.earL = P.earR = 0.85; P.earS = deg(8); P.lid = flick(t, 2.6, 0.4, 1.1);
    P.jaw = 0.1 + 0.03 * Math.sin(t * 11); P.tongue = 1; P.br = 0.014 * Math.sin(t * 11);
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

/* ================================================================ skeleton */
export function buildRig() {
  const bones = {}, list = [];
  const B = (name, parent, pos, order = 'XYZ') => {
    const b = new THREE.Bone();
    b.name = name; b.position.copy(pos); b.rotation.order = order; b.userData.home = pos.clone();
    if (parent) parent.add(b);
    bones[name] = b; list.push(b);
    return b;
  };
  const root = B('root', null, v3(0, 0, 0));
  const hips = B('hips', root, HIP, 'YXZ');
  const chest = B('chest', hips, CHEST.clone().sub(HIP), 'YXZ');
  const ribs = B('ribs', chest, RIBS.clone().sub(CHEST));
  const neck = B('neck', chest, NECK0.clone().sub(CHEST), 'YXZ');
  const head = B('head', neck, v3(0, NECK_L, 0));
  const jaw = B('jaw', head, JAW0);
  const earL = B('earL', head, EAR0), earR = B('earR', head, v3(-EAR0.x, EAR0.y, EAR0.z));
  const curve = new THREE.CatmullRomCurve3(TAIL_PTS.map((p) => v3(...p)));
  const tail = [];
  let prev = hips, prevP = HIP;
  TAIL_BONE_T.forEach((t, i) => {
    const wp = TAIL0.clone().add(curve.getPointAt(t));
    const b = B('tail' + i, prev, wp.clone().sub(prevP), 'YXZ');
    b.userData.t = t; tail.push(b); prev = b; prevP = wp;
  });
  const legs = {};
  for (const [id, kind, side] of [['FL', 'F', 1], ['FR', 'F', -1], ['HL', 'H', 1], ['HR', 'H', -1]]) {
    const S = LEG[kind], parent = kind === 'F' ? chest : hips, piv = kind === 'F' ? CHEST : HIP;
    const at = v3(S.at.x * side, S.at.y, S.at.z);
    const up = B(id + '1', parent, at.clone().sub(piv));
    const lo = B(id + '2', up, v3(0, -S.L[0], 0));
    const ft = B(id + '3', lo, v3(0, -S.L[1], 0));
    const pw = B(id + '4', ft, v3(0, -S.L[2], 0));
    legs[id] = { id, kind, side, front: kind === 'F', parent, up, lo, ft, pw, L: S.L, x: at.x, home: up.position.clone() };
  }

  const _Mh = new THREE.Matrix4(), _Mc = new THREE.Matrix4(), _Mi = new THREE.Matrix4(), _p = new V3(), _d = new V3();
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
  const TW = [0.5, 0.16, 0.14, 0.12, 0.1, 0.08]; // share of the tail swing per joint (whip)
  function applyPose(P) {
    hips.position.set(HIP.x, HIP.y + P.hy, HIP.z + P.hz); hips.rotation.set(P.hp, P.hyaw, P.hr);
    chest.position.copy(chest.userData.home); chest.rotation.set(P.cp, P.cyaw, P.cr);
    ribs.scale.set(1 + P.br * 0.6, 1 + P.br, 1 + P.br * 0.2);
    neck.rotation.set(NECK_A + P.np, P.nyaw, 0);
    head.rotation.set(-NECK_A + P.dp, P.dyaw, P.dr);
    jaw.rotation.set(P.jaw, 0, 0);
    earL.rotation.set(-P.earL, EAR_YAW, -(EAR_SPLAY + P.earS)); earR.rotation.set(-P.earR, -EAR_YAW, EAR_SPLAY + P.earS);
    tail.forEach((b, i) => b.rotation.set(i === 0 ? P.tp : P.tc * 0.2, P.ty * TW[i] * 1.6, i === 0 ? P.tr : 0));
    for (const L of Object.values(legs)) { L.up.position.copy(L.home); }
    hips.updateMatrix(); chest.updateMatrix();
    _Mh.copy(hips.matrix); _Mc.multiplyMatrices(hips.matrix, chest.matrix);
    for (const L of Object.values(legs)) solveLeg(L, P[L.id], _Mi.copy(L.front ? _Mc : _Mh).invert());
  }
  applyPose(P0());
  root.updateMatrixWorld(true);
  return { root, bones, list, legs, tail, curve, applyPose };
}

/* ================================================================ animation state machine */
export function makeAnimator(applyPose) {
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
  return { st, setAnim, update };
}
