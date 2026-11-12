// "Believe It" — first-person viewmodel: both arms + held props, all in camera space
// (camera at the origin looking down -Z, +X right, +Y up). The kerosene lamp, the splitting axe and the newspaper are final models, other props are grey clay.
// `free` holds things that must not ride the hands' raise animation (the dog being petted).
import * as THREE from 'three';
import { createArms, applyHandPose, anchors, alignQuat, mirrorV, solveArm } from './hands.js';
import { makeDoor, makeLock, makeBucket, makeLamp, makeBarnLatch, makeAxe } from './props.js';
import { makeNewspaper, NEWS } from './newspaper.js';
import { makeDog } from './dog.js';
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
  { id: 'paper', key: '4', label: 'Газета', note: 'Сложенная газета: щипок за правый край, улики слева остаются на виду' },
  { id: 'read', key: '0', label: 'Читать газету', note: 'Развёрнута обеими руками: большие пальцы спереди, остальные сзади' },
  { id: 'lamp', key: '5', label: 'Лампа', note: 'Левая рука — только ночная лампа' },
  { id: 'latch', key: '6', label: 'Засов', note: 'Правая тянет засов, левая держит лампу' },
  { id: 'axe', key: '7', label: 'Топор', note: 'Колун наизготовку поперёк кадра — обе руки' },
  { id: 'axeUp', key: '8', label: 'Топор у плеча', note: 'Колун поднят к левому плечу — обе руки' },
  { id: 'pet', key: '9', label: 'Собака', note: 'Присел и гладит собаку по голове — ладонь скользит ото лба к затылку' },
];

// Petting: the camera is crouched and pitched down by PET.phi; the dog sits in front, turned to the left (PET.yaw),
// so that its head top lands at PET.at (camera space) and its face stays clear of the right forearm.
// reading pose: page centre (camera space), grip height on the page, inset from the side edges, hand roll (deg), elbow pole
export const READ = { c: [0, -0.14, -0.37], y: 0.1, inset: 0.035, ang: 30, pole: [0.22, -1.0, 0.05] };

export const PET = { phi: deg(50), yaw: deg(-90), at: v(0.03, -0.02, -0.36), eye: 1.0 };


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
    paper: makeNewspaper(),
    barn: makeBarnLatch(),
    axe: makeAxe(),
  };
  for (const k of Object.keys(P)) { P[k].group.visible = false; root.add(P[k].group); }
  const free = new THREE.Group();
  free.name = 'viewmodel-free';
  const dog = makeDog();
  dog.group.visible = false;
  free.add(dog.group);
  // place the sitting dog once: head top -> PET.at, body upright in the world (camera pitched down by PET.phi)
  {
    dog.setAnim('pet', 0, 0); dog.state.from = null; dog.update(0);
    dog.group.updateMatrixWorld(true);
    const hd = dog.group.worldToLocal(dog.headTop());
    const q = new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), PET.phi).multiply(new THREE.Quaternion().setFromAxisAngle(HY, PET.yaw));
    dog.group.quaternion.copy(q);
    dog.group.position.copy(PET.at).sub(hd.applyQuaternion(q));
    PET.eye = -dog.group.position.clone().applyQuaternion(q.clone().invert()).y; // camera height above the snow
  }
  const lampPivot = new THREE.Group(); // lamp hangs from this point (bail top), swings in game mode
  root.add(lampPivot);
  lampPivot.add(P.lamp.group);
  P.lamp.group.visible = true;
  lampPivot.visible = false;

  // Put grip anchor `key` of hand `side` at `point`; the anchor axis goes exactly along `axis`,
  // hand-local vector `a2` as close as possible to `b2` (all real camera-space directions).
  function grip(side, key, point, axis, a2, b2, pole = POLE) {
    const a = A[key], arm = side === 'R' ? arms.R : arms.L;
    const M = side === 'L' ? mirrorV : (x) => x.clone();
    const q = alignQuat(a.axis, a2, M(axis), M(b2));
    const wrist = M(point).sub(a.p.clone().applyQuaternion(q));
    return solveArm(arm, { shoulder: SHOULDER, wrist, hand: q, pole });
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
    // folded newspaper (fold line at the bottom) pinched near its lower-right corner, held up to look at it
    paper() {
      P.paper.setFold(1);
      const pt = v(0.15, -0.17, -0.44), n = nv(-0.18, 0.4, 0.9);
      const pq = alignQuat(HZ, HY, n, v(0.16, 1, 0));
      const pg = P.paper.group;
      pg.quaternion.copy(pq);
      pg.position.copy(pt).sub(v(-0.03, 0.04, 0.0006 - NEWS.R).applyQuaternion(pq));
      const res = grip('R', 'pinch', pt, n, HY, v(-0.62, 0.78, 0).applyQuaternion(pq));
      return { R: 'pinch', props: ['paper'], focus: pt.clone().add(v(-0.14, 0.08, 0)), res };
    },
    // opened for reading: both hands on the side edges of the top half, thumbs on the front page
    read() {
      P.paper.setFold(0);
      const R = READ, c = v(...R.c), n = c.clone().negate().normalize();
      const pq = alignQuat(HZ, HY, n, HY);
      const pg = P.paper.group;
      pg.quaternion.copy(pq);
      pg.position.copy(c).sub(v(-NEWS.W / 2, 0, 0).applyQuaternion(pq));
      const at = (x) => v(x, R.y, 0.0006).applyQuaternion(pq).add(pg.position);
      const [bx, by] = [Math.sin(deg(R.ang)), Math.cos(deg(R.ang))], pole = v(...R.pole);
      const res = grip('R', 'pinch', at(-R.inset), n, HY, v(-bx, by, 0).applyQuaternion(pq), pole);
      const resL = grip('L', 'pinch', at(-NEWS.W + R.inset), n, HY, v(bx, by, 0).applyQuaternion(pq), pole);
      return { R: 'pinch', L: 'pinch', props: ['paper'], focus: c, res, resL };
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
    // hands ~30 cm apart, low in frame: short left forearm, straight right wrist, haft ~38° on screen
    axe() { return holdAxe(v(0.256, -0.27, -0.43), nv(-0.794, 0.583, -0.175), v(0.5, 0.75, -0.2), AXE_G.R, 0.394, { rb: [0, 0, 1], rr: 50, lb: [0, 0, 1], lr: 240 }); },
    axeUp() { return holdAxe(v(0.15, -0.3, -0.34), nv(-0.5, 0.75, -0.43), v(0.55, 0.45, -0.6), AXE_G.R, 0.45); },
    pet() {
      dog.group.visible = true;
      dog.setAnim('pet', 0, 0); dog.state.from = null;
      return { R: 'pet', focus: PET.at.clone().add(v(0, -0.06, 0.02)), res: petGrip(0) };
    },
  };

  // Right palm on the dog's crown, fingers diagonally over the skull (the arm comes in from the right, the dog looks left);
// strokes brow -> nape, lifts slightly on the way forward.
  const _q = new THREE.Quaternion(), _qf = new THREE.Quaternion();
  function petGrip(t) {
    dog.update(t);
    free.updateWorldMatrix(true, true);
    const top = free.worldToLocal(dog.headTop());
    _qf.copy(free.getWorldQuaternion(_q)).invert().multiply(dog.headQuat());
    const fwd = v(0, 0, 1).applyQuaternion(_qf), up = v(0, 1, 0).applyQuaternion(_qf);
    const ph = t * Math.PI * 2 * 0.5, s = 0.5 - 0.5 * Math.cos(ph), back = Math.max(0, Math.sin(ph));
    const pt = top.addScaledVector(fwd, 0.004 - 0.04 * s).addScaledVector(up, 0.001 + 0.012 * back);
    const f = v(-0.62, -0.1, -0.78).applyAxisAngle(v(1, 0, 0), PET.phi); // forward-left: diagonally over the crown, fingertips past the far side
    f.addScaledVector(up, -f.dot(up)).normalize().addScaledVector(up, -0.12).normalize();
    return grip('R', 'palm', pt, f, HZ, up, v(1, -0.7, 0.1));
  }
  function update(t) {
    if (state.pose === 'pet') state.info.res = petGrip(t);
  }

  // Both fists on the haft: knob position, haft direction (knob -> head), rough bit direction, grip spots (m from the knob).
  const AXE_G = P.axe.grips;
  function holdAxe(knob, dir, bitHint, sR, sL, o = {}) {
    const ax = P.axe.group;
    ax.quaternion.copy(alignQuat(HY, v(1, 0, 0), dir, bitHint));
    ax.position.copy(knob);
    const at = (s) => knob.clone().addScaledVector(dir, s);
    const res = grip('R', 'power', at(sR), dir, HZ, v(...(o.rb || [0.1, 1, 0.45])).applyAxisAngle(dir, deg(o.rr ?? -25)));
    const resL = grip('L', 'power', at(sL), dir, HZ, v(...(o.lb || [0.1, -1, -0.3])).applyAxisAngle(dir, deg(o.lr ?? 0)));
    return { R: 'power', L: 'power', props: ['axe'], focus: at((sR + sL) / 2), res, resL };
  }

  const state = { pose: null, info: null };
  function setPose(id) {
    for (const k of Object.keys(P)) if (k !== 'lamp') P[k].group.visible = false;
    lampPivot.visible = false;
    dog.group.visible = false;
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

  return { root, free, dog, arms, props: P, lampPivot, setPose, update, flameWorld, state, LAMP_COL, READ };
}
