// "Believe It" — first-person viewmodel: both arms + held props, all in camera space
// (camera at the origin looking down -Z, +X right, +Y up). The kerosene lamp is the final model, other props are grey clay.
import * as THREE from 'three';
import { createArms, applyHandPose, anchors, alignQuat, mirrorV, solveArm } from './hands.js';
import { makeDoor, makeLock, makeBucket, makeLamp, makePaper, makeBarnLatch, makeAxe } from './props.js';
import { deg } from '../engine/util.js';

const V3 = THREE.Vector3;
const v = (x, y, z) => new V3(x, y, z);
const nv = (x, y, z) => new V3(x, y, z).normalize();
export const SHOULDER = v(0.19, -0.24, 0.07); // right shoulder; the left one is its mirror image
export const POLE = v(0.22, -1.0, 0.05); // elbows drop down and slightly outwards
const HY = v(0, 1, 0), HZ = v(0, 0, 1), DOWN = v(0, -1, 0);
const LAMP_COL = [1.0, 0.62, 0.3];

export const POSE_LIST = [
  { id: 'door', key: '1', label: 'Дверь', note: 'Правая ладонь толкает дверь' },
  { id: 'key', key: '2', label: 'Ключ', note: 'Щипок за головку ключа, поворот' },
  { id: 'bucket', key: '3', label: 'Ведро', note: 'Ручка дужки зажата в кулаке' },
  { id: 'paper', key: '4', label: 'Газета', note: 'Большой палец спереди, остальные сзади' },
  { id: 'lamp', key: '5', label: 'Лампа', note: 'Левая рука — только ночная лампа' },
  { id: 'latch', key: '6', label: 'Засов', note: 'Правая тянет засов, левая держит лампу' },
  { id: 'axe', key: '7', label: 'Топор', note: 'Двуручный предмет — обе руки' },
];


export function createViewmodel() {
  const root = new THREE.Group();
  root.name = 'viewmodel';
  const arms = createArms();
  root.add(arms.group);
  const A = anchors();
  const P = {
    door: makeDoor({ w: 0.98, h: 2.05, n: 6, seed: 3 }),
    lockDoor: makeDoor({ w: 1.0, h: 2.1, n: 7, dark: true, seed: 5 }),
    lock: makeLock(),
    bucket: makeBucket(),
    lamp: makeLamp(),
    paper: makePaper(),
    barn: makeBarnLatch(),
    axe: makeAxe(),
  };
  for (const k of Object.keys(P)) { P[k].group.visible = false; root.add(P[k].group); }
  const lampPivot = new THREE.Group(); // lamp hangs from this point (bail top), swings in game mode
  root.add(lampPivot);
  lampPivot.add(P.lamp.group);
  P.lamp.group.visible = true;
  lampPivot.visible = false;

  // Put grip anchor `key` of hand `side` at `point`; the anchor axis goes exactly along `axis`,
  // hand-local vector `a2` as close as possible to `b2` (all real camera-space directions).
  function grip(side, key, point, axis, a2, b2) {
    const a = A[key], arm = side === 'R' ? arms.R : arms.L;
    const M = side === 'L' ? mirrorV : (x) => x.clone();
    const q = alignQuat(a.axis, a2, M(axis), M(b2));
    const wrist = M(point).sub(a.p.clone().applyQuaternion(q));
    return solveArm(arm, { shoulder: SHOULDER, wrist, hand: q, pole: POLE });
  }

  // Fist closed around a horizontal bail grip at `point` (hole centre). The wrist stays straight:
  // the bail turns to lie across the forearm, `idx` = rough index-side direction, `flex` = slight droop (deg).
  function carry(side, point, idx, { flex = 0, pole = POLE } = {}) {
    const a = A.carry, arm = side === 'R' ? arms.R : arms.L;
    const M = side === 'L' ? mirrorV : (x) => x.clone();
    const p = M(point), hint = M(idx);
    let y = p.clone().sub(SHOULDER).normalize(), palm = null, res, ax, q;
    for (let i = 0; i < 8; i++) {
      const yh = v(y.x, 0, y.z).normalize();
      ax = v(-yh.z, 0, yh.x);
      if (ax.dot(hint) < 0) ax.negate();
      const yb = y.clone();
      if (palm && flex) yb.addScaledVector(palm, Math.tan(deg(flex))).normalize();
      q = alignQuat(a.axis, HY, ax, yb);
      palm = v(0, 0, -1).applyQuaternion(q);
      const wrist = p.clone().sub(a.p.clone().applyQuaternion(q));
      res = solveArm(arm, { shoulder: SHOULDER, wrist, hand: q, pole });
      y = wrist.clone().sub(res.elbow).normalize();
    }
    return { res, ax: M(ax) };
  }

  // Left hand holding the kerosene lamp by the wooden grip on its bail (fist, lamp hangs straight down).
  function holdLamp(pt, opt = { pole: v(0.9, -0.55, 0.1) }) {
    const { res, ax } = carry('L', pt, v(1, 0, 0), opt);
    lampPivot.position.copy(pt);
    lampPivot.rotation.set(0, Math.atan2(-ax.z, ax.x), 0);
    P.lamp.group.rotation.set(0, 0, 0);
    lampPivot.visible = true;
    return res;
  }

  const POSES = {
    door() {
      const d = P.door.group;
      d.position.set(0.2, -0.5, -0.46);
      d.rotation.set(0, -0.2, 0);
      const n = HZ.clone().applyEuler(d.rotation);
      const onDoor = (x, y) => v(x, y, d.position.z - ((x - d.position.x) * n.x + (y - d.position.y) * n.y) / n.z);
      const pt = onDoor(0.1, -0.05).addScaledVector(n, 0.004);
      const f = v(-0.25, 1, 0); f.sub(n.clone().multiplyScalar(f.dot(n))).normalize();
      const res = grip('R', 'palm', pt, f, HZ, n);
      return { R: 'push', props: ['door'], focus: pt, res };
    },
    key() {
      P.lockDoor.group.position.set(0.18, -0.62, -0.56);
      P.lockDoor.group.rotation.set(0, 0, 0);
      const L = P.lock;
      L.group.position.set(0.11, -0.14, -0.56);
      const t = deg(-28);
      L.key.rotation.z = t;
      const bow = L.bow.clone().add(L.group.position);
      const res = grip('R', 'pinch', bow, v(-Math.cos(t), -Math.sin(t), 0), HY, v(-0.1, 0.1, -1));
      return { R: 'pinch', props: ['lockDoor', 'lock'], focus: bow, res };
    },
    bucket() {
      const pt = v(0.13, -0.06, -0.44);
      const { res, ax } = carry('R', pt, v(-1, 0, 0), { pole: v(0.9, -0.55, 0.1) });
      const b = P.bucket.group;
      b.position.copy(pt);
      b.rotation.set(0, Math.atan2(-ax.z, ax.x), 0);
      return { R: 'carry', props: ['bucket'], focus: pt.clone().add(v(0, -0.1, 0)), res };
    },
    paper() {
      const pt = v(0.12, -0.13, -0.38), n = nv(-0.15, 0.42, 0.9);
      const pq = alignQuat(HZ, HY, n, v(0.12, 1, 0));
      const pg = P.paper.group;
      pg.quaternion.copy(pq);
      pg.position.copy(pt).sub(v(-0.03, 0.035, 0.0025).applyQuaternion(pq));
      const res = grip('R', 'pinch', pt, n, HY, v(-0.62, 0.78, 0).applyQuaternion(pq));
      return { R: 'pinch', props: ['paper'], focus: pt.clone().add(v(-0.1, 0.06, 0)), res };
    },
    lamp() {
      const pt = v(-0.13, -0.01, -0.46);
      const res = holdLamp(pt);
      return { L: 'carry', lamp: true, focus: pt.clone().add(v(0, -0.12, 0)), res };
    },
    latch() {
      const g = P.barn.group;
      g.position.set(-0.11, -0.02, -0.56); // grip handle in the right third of the view, not cut by the frame edge
      g.rotation.set(0, 0, 0);
      const pt = P.barn.beam.position.clone().add(P.barn.grip).add(g.position);
      const res = grip('R', 'power', pt, nv(-0.12, 1, 0.1), HZ, v(1, 0.1, 0.7)); // upright fist, hand continues the cuff
      const resL = holdLamp(v(-0.2, -0.13, -0.42));
      return { R: 'power', L: 'carry', lamp: true, props: ['barn'], focus: pt, res, resL };
    },
    axe() {
      const knob = v(0.21, -0.17, -0.37), dir = nv(-0.85, 0.32, -0.42);
      const ax = P.axe.group;
      ax.quaternion.copy(alignQuat(HY, v(1, 0, 0), dir, v(0.35, 0.8, -0.3)));
      ax.position.copy(knob);
      const at = (s) => knob.clone().addScaledVector(dir, s);
      const res = grip('R', 'power', at(0.08), dir, HZ, v(0.1, 1, 0.45).applyAxisAngle(dir, deg(-25))); // straighter wrist
      const resL = grip('L', 'power', at(0.36), dir, HZ, v(0.1, -1, -0.3));
      return { R: 'power', L: 'power', props: ['axe'], focus: at(0.25), res, resL };
    },
  };

  const state = { pose: null, info: null };
  function setPose(id) {
    for (const k of Object.keys(P)) if (k !== 'lamp') P[k].group.visible = false;
    lampPivot.visible = false;
    if (!id) {
      arms.R.root.visible = arms.L.root.visible = false;
      state.pose = null; state.info = { focus: v(0, -0.1, -0.4) };
      return state.info;
    }
    const info = POSES[id]();
    if (info.R) applyHandPose(arms.R, info.R);
    if (info.L) applyHandPose(arms.L, info.L);
    arms.R.root.visible = !!info.R;
    arms.L.root.visible = !!info.L;
    for (const k of info.props || []) P[k].group.visible = true;
    state.pose = id; state.info = info;
    return info;
  }

  // Flame position in world space (for the warm point light), or null.
  const _fl = new V3();
  function flameWorld() {
    if (!lampPivot.visible || P.lamp.state === 'off') return null;
    return P.lamp.flameWorld(_fl);
  }

  return { root, arms, props: P, lampPivot, setPose, flameWorld, state, LAMP_COL };
}
