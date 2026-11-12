// "Believe It" — the animals of the farmstead: three Simmental cows in the stable whose heads, ears and tails move
// (eating at the trough, chewing, looking round at the player, lowing) and the chickens — brown, white and black hens
// and a rooster — with jerky head turns, pecking, short walks, a startled flutter when the player comes close, and
// roosting on the perch ladder at dusk and at night. Sounds are reported through onSound(kind, worldPos).
import * as THREE from 'three';
import { Kit } from './farm_kit.js';
import { Frame, C } from './farm_props.js';
import { rng, clamp, lerp } from '../engine/util.js';
import { Y } from './farm_plan.js';

const V3 = THREE.Vector3, PI = Math.PI;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SPH = (w = 12, h = 8) => new THREE.SphereGeometry(1, w, h);

function build(mats, fn) { const k = new Kit(mats); fn(k); return k.build((m) => { m.layers.enable(1); m.frustumCulled = true; }); }
// rotate the parts of group g about point p (given in the animal's local frame)
function pivot(parent, g, p) {
  const n = new THREE.Group(); n.position.set(p[0], p[1], p[2]);
  if (g) { g.position.set(-p[0], -p[1], -p[2]); n.add(g); }
  parent.add(n); return n;
}

/* ================================================================ cow (local +z = forward, origin on the floor) */
const COW_NECK = [0, 1.2, 0.66], COW_TAIL = [0, 1.28, -0.86];
function cowParts(k, seed) {
  const r = rng(seed), W = [0.95, 0.92, 0.88], F = (g) => new Frame(k, g, 0, 0, 0, 0, true);
  const b = F('body'), t = F('tail'), h0 = F('head');
  b.part('hide', SPH(16, 12), { pos: [0, 1.05, 0], scale: [0.34, 0.37, 0.81], col: C.white, smooth: true });
  b.part('hide', SPH(), { pos: [0, 1.15, -0.55], scale: [0.31, 0.31, 0.35], col: C.white, smooth: true }); // hips
  b.part('hide', SPH(), { pos: [0, 1.12, 0.52], scale: [0.3, 0.36, 0.35], col: C.white, smooth: true }); // shoulders
  b.part('hide', SPH(10, 8), { pos: [0, 0.82, 0.05], scale: [0.29, 0.2, 0.65], col: W, smooth: true }); // belly
  b.part('hide', SPH(10, 7), { pos: [0, 0.95, 0.86], scale: [0.13, 0.18, 0.15], col: W, smooth: true }); // dewlap
  for (const s of [-1, 1]) b.part('hide', SPH(8, 6), { pos: [s * 0.17, 1.22, -0.78], scale: [0.07, 0.07, 0.07], col: W, smooth: true }); // hip bones
  for (const [x, z] of [[-0.19, 0.55], [0.19, 0.55], [-0.2, -0.6], [0.2, -0.6]]) {
    b.rod('hide', [x, 0.95, z], [x * 0.95, 0.42, z + (z < 0 ? -0.04 : 0.02)], 0.075, 8, W, { r2: 0.06, smooth: true });
    b.rod('hide', [x * 0.95, 0.42, z + (z < 0 ? -0.04 : 0.02)], [x * 0.95, 0.06, z], 0.045, 8, W, { r2: 0.04, smooth: true });
    b.cyl('plain', 0.05, 0.045, 0.07, 8, [x * 0.95, 0.035, z], [0, 0, 0], [0.22, 0.18, 0.16]);
  }
  b.part('plain', SPH(10, 7), { pos: [0, 0.64, -0.38], scale: [0.13, 0.1, 0.13], col: [0.92, 0.7, 0.66], smooth: true }); // udder
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part('plain', new THREE.ConeGeometry(0.018, 0.07, 5), { pos: [sx * 0.06, 0.55, -0.38 + sz * 0.06], rot: [PI, 0, 0], col: [0.9, 0.66, 0.62] });
  // tail
  t.rod('hide', [0, 1.28, -0.86], [0.0, 0.5, -0.95], 0.03, 5, C.white, { r2: 0.02 });
  t.part('hay', SPH(6, 5), { pos: [0.0, 0.45, -0.95], scale: [0.06, 0.11, 0.06], col: [0.95, 0.85, 0.7], smooth: true });
  // neck + head (white), pink-grey muzzle, nostrils, horns, eyes; the ears are separate groups (flicks)
  h0.rod('hide', [0, 1.2, 0.6], [0, 1.18, 1.02], 0.21, 10, C.white, { r2: 0.16, smooth: true });
  const HP = [0.32, (r() - 0.5) * 0.2, 0], h = h0.sub(0, 1.22, 1.08, 0, HP);
  h.part('hide', SPH(), { pos: [0, 0, 0.12], scale: [0.15, 0.16, 0.2], col: W, smooth: true });
  h.part('hide', SPH(10, 7), { pos: [0, 0.1, 0.02], scale: [0.14, 0.08, 0.1], col: W, smooth: true }); // poll
  h.part('plain', SPH(10, 7), { pos: [0, -0.02, 0.4], scale: [0.12, 0.11, 0.12], col: [0.86, 0.72, 0.68], smooth: true });
  for (const sx of [-1, 1]) {
    h.sph('plain', 0.03, [sx * 0.06, 0.0, 0.5], 1, [0.3, 0.24, 0.24]);
    h.rod('plain', [sx * 0.12, 0.13, 0.04], [sx * 0.24, 0.22, 0.08], 0.03, 6, [0.9, 0.86, 0.74], { r2: 0.008 });
    h.sph('plain', 0.025, [sx * 0.11, 0.05, 0.22], 1, [0.08, 0.06, 0.05]);
    const e = new Frame(k, sx < 0 ? 'earL' : 'earR', 0, 0, 0, 0, true).sub(0, 1.22, 1.08, 0, HP);
    e.part('hide', SPH(8, 5), { pos: [sx * 0.21, 0.05, -0.02], rot: [0, 0, sx * 0.5], scale: [0.1, 0.03, 0.06], col: W, smooth: true });
  }
  return { ears: [-1, 1].map((sx) => h.wpos(sx * 0.12, 0.05, -0.02).toArray()) };
}

/* ================================================================ chicken (local +z = forward, origin between the feet) */
const HEN = {
  brown: { body: [0.62, 0.38, 0.21], breast: [0.68, 0.43, 0.24], wing: [0.5, 0.29, 0.15], tail: [0.24, 0.15, 0.1], neck: [0.74, 0.48, 0.26], leg: [0.86, 0.7, 0.32] },
  white: { body: [0.95, 0.93, 0.88], breast: [0.97, 0.95, 0.9], wing: [0.88, 0.86, 0.8], tail: [0.9, 0.88, 0.83], neck: [0.97, 0.95, 0.9], leg: [0.9, 0.76, 0.36] },
  black: { body: [0.13, 0.13, 0.15], breast: [0.14, 0.14, 0.16], wing: [0.1, 0.12, 0.12], tail: [0.08, 0.1, 0.1], neck: [0.15, 0.15, 0.17], leg: [0.32, 0.32, 0.34] },
  speck: { body: [0.56, 0.56, 0.58], breast: [0.62, 0.62, 0.64], wing: [0.46, 0.46, 0.48], tail: [0.3, 0.3, 0.32], neck: [0.66, 0.66, 0.68], leg: [0.88, 0.74, 0.36] },
  rooster: { body: [0.4, 0.15, 0.08], breast: [0.1, 0.08, 0.07], wing: [0.55, 0.24, 0.1], tail: [0.06, 0.1, 0.09], neck: [0.88, 0.52, 0.18], leg: [0.86, 0.7, 0.32] },
};
const NECK = [0, 0.265, 0.085], HIP = 0.14;
function henParts(k, col, R, indoor) {
  const F = (g) => new Frame(k, g, 0, 0, 0, 0, indoor), b = F('body'), h = F('head');
  const red = [0.82, 0.12, 0.1];
  b.part('feather', SPH(14, 10), { pos: [0, 0.215, 0], rot: [R ? -0.42 : -0.22, 0, 0], scale: [0.118, 0.12, 0.175], col: col.body, smooth: true });
  b.part('feather', SPH(10, 8), { pos: [0, 0.205, 0.075], scale: [0.1, 0.105, 0.095], col: col.breast, smooth: true });
  b.part('feather', SPH(10, 8), { pos: [0, 0.18, -0.1], scale: [0.09, 0.085, 0.09], col: col.body, smooth: true });
  for (const s of [-1, 1]) b.part('feather', SPH(10, 7), { pos: [s * 0.1, 0.228, -0.015], rot: [-0.25, s * 0.12, 0], scale: [0.032, 0.075, 0.135], col: col.wing, smooth: true });
  if (!R) for (const i of [-1, 0, 1]) b.part('feather', SPH(8, 6), { pos: [i * 0.024, 0.325, -0.165], rot: [0.75, 0, i * 0.3], scale: [0.028, 0.105, 0.055], col: col.tail, smooth: true });
  else {
    for (const [dx, up, back, w] of [[0, 0.2, 0.3, 0.014], [-0.025, 0.16, 0.26, 0.012], [0.025, 0.17, 0.27, 0.012], [0, 0.12, 0.2, 0.011]]) {
      const curve = new THREE.CatmullRomCurve3([new V3(dx, 0.3, -0.15), new V3(dx, 0.3 + up, -0.18 - back * 0.3), new V3(dx * 1.4, 0.3 + up * 0.92, -0.17 - back * 0.85), new V3(dx * 1.6, 0.3 + up * 0.35, -0.15 - back * 1.15)]);
      b.part('feather', new THREE.TubeGeometry(curve, 10, w, 4), { scale: [0.6, 1, 1], col: col.tail, smooth: true, uv: 'planar' });
    }
    for (const s of [-1, 1]) b.part('feather', SPH(8, 6), { pos: [s * 0.06, 0.29, -0.1], rot: [0.5, 0, s * 0.3], scale: [0.05, 0.06, 0.08], col: col.neck, smooth: true }); // saddle hackles
  }
  // neck, head, beak, comb, wattles, eyes
  h.rod('feather', [0, 0.255, 0.08], [0, 0.38, 0.135], R ? 0.056 : 0.05, 8, col.neck, { r2: 0.034, smooth: true });
  h.part('feather', SPH(10, 8), { pos: [0, 0.405, 0.15], scale: [0.037, 0.04, 0.046], col: col.neck, smooth: true });
  h.part('plain', new THREE.ConeGeometry(0.012, 0.042, 5), { pos: [0, 0.398, 0.2], rot: [PI / 2 + 0.3, 0, 0], col: [0.9, 0.74, 0.34] });
  const n = R ? 5 : 3, sz = R ? 0.026 : 0.014;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5, hgt = sz * (1 + Math.sin(t * PI) * 0.5);
    h.part('plain', SPH(6, 5), { pos: [0, 0.438 + hgt * 0.5, 0.118 + t * (R ? 0.07 : 0.045)], scale: [0.006, hgt, sz * 0.62], col: red, smooth: true });
  }
  for (const s of [-1, 1]) {
    h.part('plain', SPH(6, 5), { pos: [s * 0.009, 0.37 - (R ? 0.012 : 0), 0.178], scale: [0.008, R ? 0.026 : 0.015, 0.012], col: red, smooth: true });
    h.sph('plain', 0.0085, [s * 0.031, 0.414, 0.164], 1, [0.06, 0.05, 0.04]);
    h.sph('plain', 0.011, [s * 0.034, 0.395, 0.145], [0.4, 1, 1], R ? [0.92, 0.9, 0.86] : red); // ear lobe
  }
  // legs (thigh feathers, scaly shank, three toes forward and one back)
  for (const s of [-1, 1]) {
    const l = F(s < 0 ? 'legL' : 'legR'), x = s * 0.042;
    l.part('feather', SPH(8, 6), { pos: [x, 0.15, -0.005], scale: [0.036, 0.05, 0.046], col: col.body, smooth: true });
    l.rod('plain', [x, 0.13, 0.0], [x, 0.012, 0.012], 0.0095, 5, col.leg);
    for (const a of [-0.45, 0, 0.45]) l.obox('plain', 0.007, 0.006, 0.058, [x + Math.sin(a) * 0.027, 0.004, 0.012 + Math.cos(a) * 0.027], [0, a, 0], col.leg);
    l.obox('plain', 0.007, 0.006, 0.03, [x, 0.004, -0.004], [0, 0, 0], col.leg);
  }
}

/* ================================================================ the herd */
export function createAnimals(mats, parentIn, parentOut) {
  const out = { onSound: null, cows: [], hens: [] };
  const emit = (kind, obj, o) => { if (out.onSound) out.onSound(kind, obj.getWorldPosition(new V3()), o || {}); };
  let night = false, preset = 'day';

  /* cows in their stalls, facing the trough on the north wall */
  for (const [i, x] of [2.2, 4.2, 6.2].entries()) {
    let ears;
    const G = build(mats, (k) => { ears = cowParts(k, 11 + i).ears; });
    const root = new THREE.Group(); root.position.set(x, Y.stab, -6.35); root.rotation.y = PI + (i - 1) * 0.06;
    root.add(G.body);
    const head = pivot(root, G.head, COW_NECK), tail = pivot(root, G.tail, COW_TAIL);
    const earP = [pivot(G.head, G.earL, ears[0]), pivot(G.head, G.earR, ears[1])];
    parentIn.add(root);
    const r = rng(300 + i);
    out.cows.push({ root, head, tail, earP, body: G.body, r, ph: r() * 10, mode: 'eat', t: 0, dur: 3 + r() * 6, p: 0.55, y: 0, swish: -1, flick: [-1, -1], nextMoo: 25 + i * 40 + r() * 60, nextSwish: r() * 4, nextFlick: r() * 3 });
  }

  /* chickens: four hens in the stable; the rooster and two hens scratch in the yard by day; all roost at dusk / night */
  const AREA = { in: { x0: 0.55, x1: 3.4, z0: -4.45, z1: -2.05, y: Y.stab }, out: { x0: 2.3, x1: 5.6, z0: 1.0, z1: 3.6, y: 0 } };
  const ROOST = [[0.62, 0, PI + 0.1], [1.2, 0, PI - 0.15], [0.48, 1, PI], [0.95, 1, PI + 0.2], [1.38, 1, PI - 0.1], [0.78, 2, PI + 0.05], [1.3, 2, PI - 0.2]];
  const LIST = [['brown', 'in'], ['white', 'in'], ['black', 'in'], ['speck', 'in'], ['rooster', 'out'], ['brown', 'out'], ['white', 'out']];
  for (const [i, [kind, home]] of LIST.entries()) {
    const R = kind === 'rooster', indoor = home === 'in';
    const G = build(mats, (k) => henParts(k, HEN[kind], R, indoor));
    const root = new THREE.Group(), s = R ? 1.12 : 0.95 + (i % 3) * 0.04;
    root.scale.setScalar(s);
    const bodyP = pivot(root, null, [0, HIP, 0]), bodyOff = new THREE.Group(); bodyOff.position.set(0, -HIP, 0); bodyP.add(bodyOff); bodyOff.add(G.body);
    const head = pivot(bodyOff, G.head, NECK);
    const legs = [pivot(root, G.legL, [-0.042, HIP, 0]), pivot(root, G.legR, [0.042, HIP, 0])];
    const r = rng(400 + i), A = AREA[home];
    const pos = new V3(lerp(A.x0, A.x1, r()), A.y, lerp(A.z0, A.z1, r()));
    (indoor ? parentIn : parentOut).add(root);
    const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    out.hens.push({ root, bodyP, head, legs, R, home, A, pos, yaw: r() * 6.28, r, mode: 'idle', t: 0, dur: 1, tgt: pos.clone(), hy: 0, hp: 0, thy: 0, thp: 0, jerk: 0, step: 0, tilt: 0, low: 0, roost: ROOST[i], parentOut: !indoor, meshes, indoorMat: indoor, nextCluck: 6 + r() * 60, nextCrow: 30 + r() * 60, scare: 0 });
  }
  const setMat = (h, indoor) => { if (h.indoorMat === indoor) return; h.indoorMat = indoor; for (const m of h.meshes) { const key = m.userData.mat.replace(/_i$/, '') + (indoor ? '_i' : ''); if (mats[key]) m.material = mats[key].mat; } };

  function setPreset(name) {
    preset = name; night = name !== 'day';
    for (const h of out.hens) {
      const inside = night || h.home === 'in';
      const want = inside ? parentIn : parentOut;
      if (h.root.parent !== want) want.add(h.root);
      setMat(h, inside);
      h.A = AREA[inside ? 'in' : h.home];
      if (!night) { h.pos.set(lerp(h.A.x0, h.A.x1, h.r()), h.A.y, lerp(h.A.z0, h.A.z1, h.r())); h.tgt.copy(h.pos); h.mode = 'idle'; h.t = 0; }
      for (const l of h.legs) l.visible = !night;
    }
  }

  const tmp = new V3(), tmp2 = new V3();
  function updateCow(c, dt, time, pl) {
    const r = c.r;
    c.t += dt;
    let near = null;
    if (pl && pl.lvl === 0) { const hw = c.head.getWorldPosition(tmp); const d = Math.hypot(pl.pos.x - hw.x, pl.pos.z - hw.z); if (d < 5.5) near = d; }
    if (c.t > c.dur) {
      c.t = 0;
      const q = r();
      if (near !== null && q < 0.55) { c.mode = 'look'; c.dur = 2 + r() * 3.5; } else if (q < 0.18) { c.mode = 'look'; c.dur = 1.5 + r() * 2.5; c.lookY = (r() - 0.5) * 1.0; } else { c.mode = 'eat'; c.dur = 4 + r() * 9; }
    }
    c.nextMoo -= dt * (near !== null && near < 3 ? 1.6 : 1);
    if (c.nextMoo <= 0 && c.mode !== 'moo') {
      c.mode = 'moo'; c.t = 0; c.dur = 1.9 + r() * 0.9; c.mooAt = 0.35;
      c.nextMoo = night ? 240 + r() * 360 : 110 + r() * 220;
    }
    let tp = 0.62 + Math.sin(time * 2.3 + c.ph) * 0.035, ty = Math.sin(time * 0.37 + c.ph) * 0.14;
    if (c.mode === 'look') {
      tp = -0.02 + Math.sin(time * 0.8 + c.ph) * 0.03;
      if (near !== null) { c.root.worldToLocal(tmp2.set(pl.pos.x, 1.4, pl.pos.z)); ty = clamp(Math.atan2(tmp2.x, tmp2.z - COW_NECK[2]), -0.6, 0.6); } else ty = c.lookY || 0;
    } else if (c.mode === 'moo') {
      tp = -0.32; ty = c.y * 0.5;
      if (c.mooAt >= 0 && c.t > c.mooAt) { c.mooAt = -1; emit('moo', c.head, { dur: c.dur - 0.5, seed: c.ph }); }
    }
    const k = Math.min(1, dt * (c.mode === 'moo' ? 3.2 : 1.8));
    c.p += (tp - c.p) * k; c.y += (ty - c.y) * k;
    c.head.rotation.set(c.p, c.y, c.y * -0.25, 'YXZ');
    // chewing: a small jaw-like bob of the head while eating
    c.head.position.y = COW_NECK[1] + (c.mode === 'eat' ? Math.max(0, Math.sin(time * 6.5 + c.ph)) * 0.012 : 0);
    // tail: slow sway + occasional swish; ears: flicks
    c.nextSwish -= dt;
    if (c.nextSwish <= 0) { c.swish = 0; c.nextSwish = 2.5 + r() * 6; }
    let sw = 0;
    if (c.swish >= 0) { c.swish += dt; const u = c.swish / 1.1; sw = u < 1 ? Math.sin(u * PI * 2.5) * (1 - u) * 0.6 : 0; if (u >= 1) c.swish = -1; }
    c.tail.rotation.set(0.05 + Math.abs(sw) * 0.25, 0, Math.sin(time * 0.9 + c.ph) * 0.07 + sw);
    c.nextFlick -= dt;
    if (c.nextFlick <= 0) { c.flick[r() < 0.5 ? 0 : 1] = 0; c.nextFlick = 1.5 + r() * 5; }
    for (let e = 0; e < 2; e++) {
      let a = 0;
      if (c.flick[e] >= 0) { c.flick[e] += dt; const u = c.flick[e] / 0.35; a = u < 1 ? Math.sin(u * PI) * 0.6 : 0; if (u >= 1) c.flick[e] = -1; }
      c.earP[e].rotation.set(a * 0.4, 0, (e ? -1 : 1) * (a + (c.mode === 'look' ? -0.15 : 0.1)));
    }
    c.body.scale.y = 1 + Math.sin(time * 1.7 + c.ph) * 0.005;
  }

  function newMode(h, pl) {
    const r = h.r, q = r();
    h.t = 0;
    if (q < 0.34) { h.mode = 'peck'; h.dur = 1.2 + r() * 2.6; }
    else if (q < 0.7) { h.mode = 'walk'; h.dur = 6; h.speed = 0.28 + r() * 0.12; h.tgt.set(clamp(h.pos.x + (r() - 0.5) * 1.8, h.A.x0, h.A.x1), h.A.y, clamp(h.pos.z + (r() - 0.5) * 1.8, h.A.z0, h.A.z1)); }
    else { h.mode = 'idle'; h.dur = 0.8 + r() * 2.2; }
    void pl;
  }
  function updateHen(h, dt, time, pl, all) {
    const r = h.r;
    h.t += dt;
    if (night) {
      const [x, bar, yaw] = h.roost;
      h.pos.set(x, Y.stab + 0.53 + bar * 0.35, -1.55 + bar * 0.12); h.yaw = yaw;
      h.low += (1 - h.low) * Math.min(1, dt * 4);
      if (h.t > h.dur) { h.t = 0; h.dur = 2 + r() * 6; h.thy = (r() - 0.5) * 0.9; h.thp = 0.1 + r() * 0.25; if (r() < 0.25) { h.thy = 0; h.thp = 0.55; } }
      h.hy += (h.thy - h.hy) * Math.min(1, dt * 3); h.hp += (h.thp - h.hp) * Math.min(1, dt * 3);
      h.tilt = 0;
    } else {
      h.low += (0 - h.low) * Math.min(1, dt * 4);
      // startled by the player: flutter away with a loud cackle
      const same = pl && (h.A === AREA.in ? pl.lvl === 0 && pl.inside : !pl.inside);
      if (same) {
        const dx = h.pos.x - pl.pos.x, dz = h.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.9 && h.mode !== 'flee') {
          h.mode = 'flee'; h.t = 0; h.dur = 1.2; h.speed = 1.5;
          h.tgt.set(clamp(h.pos.x + (dx / (d || 1)) * 1.4, h.A.x0, h.A.x1), h.A.y, clamp(h.pos.z + (dz / (d || 1)) * 1.4, h.A.z0, h.A.z1));
          if (h.scare <= 0) { emit('bawk', h.head, { rooster: h.R }); h.scare = 2.5; }
        }
      }
      h.scare -= dt;
      if (h.t > h.dur && h.mode !== 'crow') newMode(h, pl);
      if (h.mode === 'crow' && h.t > h.dur) newMode(h, pl);
      // jerky head: the target changes in steps, the head snaps to it
      h.jerk -= dt;
      if (h.jerk <= 0) { h.jerk = 0.25 + r() * 0.7; h.thy = (r() - 0.5) * 1.5; h.thp = -0.25 + r() * 0.4; }
      let tp = h.thp, ty = h.thy, tilt = 0;
      if (h.mode === 'peck') {
        const u = (h.t % 0.38) / 0.38, pk = u < 0.35 ? u / 0.35 : u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5;
        tp = 1.25 * pk + 0.25; ty = h.thy * 0.3; tilt = 0.5 * pk + 0.15;
      } else if (h.mode === 'crow') {
        tp = -0.75; ty = 0; tilt = -0.3;
      } else if (h.mode === 'walk' || h.mode === 'flee') {
        const dx = h.tgt.x - h.pos.x, dz = h.tgt.z - h.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { newMode(h, pl); }
        else {
          const want = Math.atan2(dx, dz), da = wrapA(want - h.yaw);
          h.yaw += clamp(da, -dt * 5, dt * 5);
          if (Math.abs(da) < 0.7) {
            const sp = h.speed * dt;
            h.pos.x += Math.sin(h.yaw) * Math.min(sp, d); h.pos.z += Math.cos(h.yaw) * Math.min(sp, d);
            h.step += dt * (h.mode === 'flee' ? 16 : 9);
          }
          ty = 0; tp = -0.05; tilt = h.mode === 'flee' ? 0.25 : 0.05;
        }
      }
      // keep apart from the others
      for (const o of all) {
        if (o === h || o.A !== h.A) continue;
        const dx = h.pos.x - o.pos.x, dz = h.pos.z - o.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.26 && d > 1e-4) { h.pos.x += (dx / d) * (0.26 - d) * 0.5; h.pos.z += (dz / d) * (0.26 - d) * 0.5; }
      }
      h.pos.x = clamp(h.pos.x, h.A.x0, h.A.x1); h.pos.z = clamp(h.pos.z, h.A.z0, h.A.z1); h.pos.y = h.A.y;
      const snap = Math.min(1, dt * (h.mode === 'peck' ? 22 : 26));
      h.hy += (ty - h.hy) * snap; h.hp += (tp - h.hp) * snap;
      h.tilt += (tilt - h.tilt) * Math.min(1, dt * 14);
      // sounds: clucks now and then; the rooster crows in the daytime
      h.nextCluck -= dt;
      if (h.nextCluck <= 0) { h.nextCluck = 50 + r() * 100; emit('cluck', h.head, { rooster: h.R, n: 1 + Math.floor(r() * 3) }); }
      if (h.R) {
        h.nextCrow -= dt;
        if (h.nextCrow <= 0 && h.mode !== 'flee') { h.nextCrow = 150 + r() * 250; h.mode = 'crow'; h.t = 0; h.dur = 2.4; emit('crow', h.head, {}); }
      }
    }
    // pose
    h.root.position.copy(h.pos); h.root.rotation.y = h.yaw;
    const walking = h.mode === 'walk' || h.mode === 'flee';
    const bob = walking ? Math.abs(Math.sin(h.step)) * 0.012 : 0;
    h.bodyP.position.y = HIP + bob - h.low * 0.085;
    h.bodyP.rotation.set(h.tilt, 0, walking ? Math.sin(h.step) * 0.06 : 0);
    h.head.rotation.set(h.hp, h.hy, 0, 'YXZ');
    h.head.position.z = NECK[2] + (walking ? ((h.step / PI) % 1) * 0.03 - 0.015 : 0); // head thrusts forward with every step
    for (let i = 0; i < 2; i++) h.legs[i].rotation.x = walking ? Math.sin(h.step + i * PI) * 0.55 : 0;
  }

  function update(dt, time, pl) {
    for (const c of out.cows) updateCow(c, dt, time, pl);
    for (const h of out.hens) updateHen(h, dt, time, pl, out.hens);
  }
  out.update = update; out.setPreset = setPreset;
  return out;
}
