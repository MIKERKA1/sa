// Hinterkaifeck — masonry shell, floors, ceilings, roofs, windows, doors, stairs and roof timbers of the farmstead.
// Walls are split around openings (rect subtraction) and at Y.cut / Y.attic into cutaway groups:
// base (ground floor), upper (wall tops + knee walls), attic (attic floor, timbers, attic contents), roof (slabs, rafters, gables).
import * as THREE from 'three';
import { Y, PITCH, HOUSE, BARN, ROOF_T, OVER, ROOMS, HATCH, STAIR, CHIMNEY, DOORS, WINDOWS } from './farm_plan.js';
import { Kit, slabGeo } from './farm_kit.js';
import { Frame, C, ladder, timber } from './farm_props.js';
import { makePadlock, makeHasp, makeBolt } from '../models/hardware.js';

const V3 = THREE.Vector3;
const VK = Math.sqrt(1 + PITCH * PITCH); // slope length per horizontal metre
const UNDER = ROOF_T * VK; // vertical thickness of a roof slab

/* ---------------------------------------------------------------- rect maths: r = [u0, v0, u1, v1] */
export function subtract(rects, h) {
  const out = [];
  for (const r of rects) {
    if (h[0] >= r[2] || h[2] <= r[0] || h[1] >= r[3] || h[3] <= r[1]) { out.push(r); continue; }
    if (h[0] > r[0]) out.push([r[0], r[1], h[0], r[3]]);
    if (h[2] < r[2]) out.push([h[2], r[1], r[2], r[3]]);
    const a = Math.max(r[0], h[0]), b = Math.min(r[2], h[2]);
    if (h[1] > r[1]) out.push([a, r[1], b, h[1]]);
    if (h[3] < r[3]) out.push([a, h[3], b, r[3]]);
  }
  return out.filter((r) => r[2] - r[0] > 1e-3 && r[3] - r[1] > 1e-3);
}
const cutAll = (r, holes) => holes.reduce((acc, h) => subtract(acc, h), [r]);
const splitAt = (v0, v1, cuts) => { const s = [v0, ...[...new Set(cuts)].filter((c) => c > v0 + 1e-4 && c < v1 - 1e-4).sort((a, b) => a - b), v1]; return s.slice(1).map((b, i) => [s[i], b]); };
export const grpOf = (v0, v1) => ((v0 + v1) / 2 < Y.cut ? 'base' : (v0 + v1) / 2 < Y.attic + 1.05 ? 'upper' : 'roof');

/* ---------------------------------------------------------------- openings from the plan */
function openingsFor(axis, a0, a1, c0, c1) {
  const ops = [];
  for (const d of DOORS) {
    const [hx, hy, hz] = d.hinge, along = Math.abs(Math.cos(d.yaw)) > 0.5;
    if ((axis === 'x') !== along) continue;
    const c = axis === 'x' ? hz : hx;
    if (c < c0 - 0.02 || c > c1 + 0.02) continue;
    const e = axis === 'x' ? hx + Math.cos(d.yaw) * d.w : hz - Math.sin(d.yaw) * d.w, h = axis === 'x' ? hx : hz;
    const u0 = Math.min(h, e), u1 = Math.max(h, e);
    if (u1 <= a0 || u0 >= a1) continue;
    ops.push({ r: [u0, hy > 0.01 ? -0.01 : hy, u1, hy + d.h], door: true, id: d.id, sill: hy });
  }
  return ops;
}
function windowOps(wall, barn = false) {
  return WINDOWS.filter((w) => w.wall === wall && !!w.barn === barn).map((w) => ({ r: [w.c - w.w / 2, w.y0, w.c + w.w / 2, w.y1] }));
}

/* ---------------------------------------------------------------- walls */
// full depth of the wall a door sits in (outer + inner skins), from the plan
const WALL_Z = [[-0.5, 0], [-8.6, -8.1], [-4.68, -4.52], [3.75, 4.2], [-15.3, -14.85], [-7.96, -7.8], [-3.5, -3.34]];
const WALL_X = [[-8.68, -8.52], [-5.68, -5.52], [-9.18, -9.02], [-3.68, -3.52], [-0.2, 0.2], [11, 11.45], [16.84, 17.0], [7.2, 7.36], [3.7, 4.0]];
function wallDepth(axis, id) {
  const d = DOORS.find((q) => q.id === id), c = axis === 'x' ? d.hinge[2] : d.hinge[0];
  const L = axis === 'x' ? WALL_Z : WALL_X, w = L.find(([a, b]) => c >= a - 0.08 && c <= b + 0.08);
  return w || [c - 0.08, c + 0.08];
}
// axis x: wall runs along x, c = z range; axis z: wall runs along z, c = x range. skins: [{ c0, c1, m, plinth, col }]
export function wallRun(ctx, { axis, a0, a1, y0 = 0, y1, skins, ops = [], floor = null, extraCuts = [] }) {
  const { kit } = ctx;
  let rects = [[a0, y0, a1, y1]];
  for (const o of ops) rects = subtract(rects, o.r);
  for (const [u0, v0, u1, v1] of rects) for (const s of skins) {
    const cuts = [Y.cut, Y.attic, ...extraCuts, ...(s.plinth ? [s.plinth] : [])];
    for (const [w0, w1] of splitAt(v0, v1, cuts)) {
      const m = s.plinth && w1 <= s.plinth + 1e-4 ? 'stone' : s.m, g = s.grp || grpOf(w0, w1), col = s.col || [1, 1, 1];
      if (axis === 'x') kit.box(g, m, u0, w0, s.c0, u1, w1, s.c1, col, { seg: 1.2 });
      else kit.box(g, m, s.c0, w0, u0, s.c1, w1, u1, col, { seg: 1.2 });
    }
  }
  for (const o of ops) if (o.door && o.sill > 0.01 && !ctx.thr.has(o.id)) { // wooden threshold across the whole wall depth
    ctx.thr.add(o.id);
    const W = wallDepth(axis, o.id);
    if (axis === 'x') kit.box('base', 'wood_i', o.r[0], 0, W[0] - 0.012, o.r[2], o.sill + 0.014, W[1] + 0.012, C.oak);
    else kit.box('base', 'wood_i', W[0] - 0.012, 0, o.r[0], W[1] + 0.012, o.sill + 0.014, o.r[2], C.oak);
  }
  if (floor !== null) { // colliders: the wall minus openings that reach down to the floor
    const c0 = Math.min(...skins.map((s) => s.c0)), c1 = Math.max(...skins.map((s) => s.c1));
    let segs = [[a0, a1]];
    for (const o of ops) if (o.r[1] < floor + 0.6) segs = segs.flatMap(([p, q]) => (o.r[0] >= q || o.r[2] <= p ? [[p, q]] : [[p, o.r[0]], [o.r[2], q]].filter(([x, y]) => y - x > 1e-3)));
    for (const [p, q] of segs) axis === 'x' ? kit.solid(p, c0, q, c1, 0) : kit.solid(c0, p, c1, q, 0);
  }
}
const ext = (c0, c1, t, flip = false) => { // outer (whitewash + stone plinth) and inner skin of an outer wall; flip: outside at the high c
  const m = (c0 + c1) / 2;
  return flip ? [{ c0: m, c1, m: 'wash', plinth: 0.62 }, { c0, c1: m, m: 'wash_i' }] : [{ c0, c1: m, m: 'wash', plinth: 0.62 }, { c0: m, c1, m: 'wash_i' }];
};
const part = (c0, c1, col) => [{ c0, c1, m: 'wash_i', col }];

export function buildWalls(ctx) {
  const H = HOUSE, B = BARN, T = H.t / 2, BT = B.t / 2, YE = Y.eave;
  const stab = [0.9, 0.88, 0.84];
  // house: outer skins form a ring (south / north full length, west between them); inner skins stop at the outer ones
  const S = [...windowOps('S'), ...openingsFor('x', H.x0, H.x1, -0.5, 0), { r: [4.55, 3.05, 5.45, 3.86] }];
  wallRun(ctx, { axis: 'x', a0: H.x0, a1: H.x1, y1: YE, skins: [{ c0: -T, c1: 0, m: 'wash', plinth: 0.62 }], ops: S, floor: 0 });
  wallRun(ctx, { axis: 'x', a0: H.x0 + T, a1: -0.2, y1: YE, skins: [{ c0: -0.5, c1: -T, m: 'wash_i' }], ops: S, floor: 0 });
  wallRun(ctx, { axis: 'x', a0: -0.2, a1: H.x1, y1: YE, skins: [{ c0: -0.5, c1: -T, m: 'wash_i', col: stab }], ops: S, floor: 0 });
  const N = [...windowOps('N'), ...openingsFor('x', H.x0, H.x1, -8.6, -8.1)];
  wallRun(ctx, { axis: 'x', a0: H.x0, a1: H.x1, y1: YE, skins: [{ c0: -8.6, c1: -8.6 + T, m: 'wash', plinth: 0.62 }], ops: N, floor: 0 });
  wallRun(ctx, { axis: 'x', a0: H.x0 + T, a1: -0.2, y1: YE, skins: [{ c0: -8.6 + T, c1: -8.1, m: 'wash_i' }], ops: N, floor: 0 });
  wallRun(ctx, { axis: 'x', a0: -0.2, a1: H.x1, y1: YE, skins: [{ c0: -8.6 + T, c1: -8.1, m: 'wash_i', col: stab }], ops: N, floor: 0 });
  const W = windowOps('W');
  wallRun(ctx, { axis: 'z', a0: -8.6 + T, a1: -T, y1: YE, skins: [{ c0: H.x0, c1: H.x0 + T, m: 'wash', plinth: 0.62 }], ops: W, floor: 0 });
  wallRun(ctx, { axis: 'z', a0: -8.1, a1: -0.5, y1: YE, skins: [{ c0: H.x0 + T, c1: -13.5, m: 'wash_i' }], ops: W, floor: 0 });
  // barn: west wall in three runs (outside / between stable and threshing floor / outside)
  const bw0 = B.x0, bw1 = B.x0 + B.t;
  wallRun(ctx, { axis: 'z', a0: B.z0, a1: -8.6, y1: YE, skins: [{ c0: bw0, c1: bw0 + BT, m: 'wash', plinth: 0.62 }], floor: 0 });
  wallRun(ctx, { axis: 'z', a0: B.z0 + BT, a1: -8.6, y1: YE, skins: [{ c0: bw0 + BT, c1: bw1, m: 'wash_i' }], floor: 0 });
  wallRun(ctx, { axis: 'z', a0: -8.6, a1: 0, y1: YE, skins: part(bw0, bw1, stab), ops: [...openingsFor('z', -8.6, 0, bw0, bw1), { r: [-8.1, Y.ceil, -0.5, YE + 0.01] }], floor: 0 });
  wallRun(ctx, { axis: 'z', a0: 0, a1: B.z1, y1: YE, skins: [{ c0: bw0, c1: bw0 + BT, m: 'wash', plinth: 0.62 }], floor: 0 });
  wallRun(ctx, { axis: 'z', a0: 0, a1: B.z1 - BT, y1: YE, skins: [{ c0: bw0 + BT, c1: bw1, m: 'wash_i' }], floor: 0 });
  const BN = openingsFor('x', B.x0, B.x1, B.z0, B.z0 + B.t), BS = openingsFor('x', B.x0, B.x1, B.z1 - B.t, B.z1);
  wallRun(ctx, { axis: 'x', a0: bw0 + BT, a1: B.x1, y1: YE, skins: [{ c0: B.z0, c1: B.z0 + BT, m: 'wash', plinth: 0.62 }], ops: BN, floor: 0 });
  wallRun(ctx, { axis: 'x', a0: bw1, a1: B.x1 - BT, y1: YE, skins: [{ c0: B.z0 + BT, c1: B.z0 + B.t, m: 'wash_i' }], ops: BN, floor: 0 });
  wallRun(ctx, { axis: 'x', a0: bw0 + BT, a1: B.x1, y1: YE, skins: [{ c0: B.z1 - BT, c1: B.z1, m: 'wash', plinth: 0.62 }], ops: BS, floor: 0 });
  wallRun(ctx, { axis: 'x', a0: bw1, a1: B.x1 - BT, y1: YE, skins: [{ c0: B.z1 - B.t, c1: B.z1 - BT, m: 'wash_i' }], ops: BS, floor: 0 });
  const E = windowOps('E', true);
  wallRun(ctx, { axis: 'z', a0: B.z0 + BT, a1: B.z1 - BT, y1: YE, skins: [{ c0: B.x1 - BT, c1: B.x1, m: 'wash', plinth: 0.62 }], ops: E, floor: 0 });
  wallRun(ctx, { axis: 'z', a0: B.z0 + B.t, a1: B.z1 - B.t, y1: YE, skins: [{ c0: B.x1 - B.t, c1: B.x1 - BT, m: 'wash_i' }], ops: E, floor: 0 });
  // partitions (to the ceiling)
  const pc = Y.ceil, P = (axis, a0, a1, c0, c1, y0 = 0, col) => wallRun(ctx, { axis, a0, a1, y0, y1: pc, skins: part(c0, c1, col), ops: openingsFor(axis, a0, a1, c0, c1), floor: 0 });
  P('x', -13.5, -0.2, -4.68, -4.52);
  P('z', -4.52, -0.5, -8.68, -8.52); P('z', -4.52, -0.5, -5.68, -5.52);
  P('z', -8.1, -4.68, -9.18, -9.02); P('z', -8.1, -4.68, -3.68, -3.52);
  P('z', -8.1, -0.5, -0.2, 0.2, 0, stab);
  P('z', -8.1, -4.68, 7.2, 7.36, 0, stab); P('x', 7.2, 11, -4.68, -4.52, 0, stab);
  // barn rooms 10 / 11 (walls up to their plank ceiling at the loft level)
  const bp = (axis, a0, a1, c0, c1) => wallRun(ctx, { axis, a0, a1, y1: Y.ceil, skins: part(c0, c1, stab), ops: openingsFor(axis, a0, a1, c0, c1), floor: 0 });
  bp('z', -7.96, 3.75, 16.84, 17.0); bp('x', 17.0, 19.15, -7.96, -7.8); bp('x', 17.0, 19.15, -3.5, -3.34);
  // wall plates on the knee walls (close the wedge under the roof)
  const k = ctx.kit;
  k.box('upper', 'wood_i', H.x0 + T, YE, -0.5, 11, YE + 0.12, -0.26, C.dark);
  k.box('upper', 'wood_i', H.x0 + T, YE, -8.34, 11, YE + 0.12, -8.1, C.dark);
  k.box('upper', 'wood_i', bw1, YE, B.z0 + B.t, bw1 + 0.24, YE + 0.12, -8.6, C.dark);
  k.box('upper', 'wood_i', bw1, YE, 0, bw1 + 0.24, YE + 0.12, B.z1 - B.t, C.dark);
  k.box('upper', 'wood_i', B.x1 - B.t - 0.24, YE, B.z0 + B.t, B.x1 - B.t, YE + 0.12, B.z1 - B.t, C.dark);
}

/* ---------------------------------------------------------------- floors and ceilings */
export function buildFloors(ctx) {
  const k = ctx.kit, R = ROOMS;
  const fl = (r, m, col = [1, 1, 1], y = r.y) => k.box('base', m, r.x0, 0, r.z0, r.x1, y, r.z1, col, { seg: 1.5 });
  fl(R.r1, 'board_i'); fl(R.r2, 'board_i', [0.92, 0.9, 0.86]); fl(R.r3, 'flag_i'); fl(R.r4, 'flag_i', [0.95, 0.93, 0.9]); fl(R.r5, 'board_i'); fl(R.r6, 'flag_i', [0.9, 0.88, 0.84]);
  k.box('base', 'flag_i', 0.2, 0, -8.1, 11, Y.stab, -0.5, [0.72, 0.68, 0.62], { seg: 1.5 }); // stable cobbles
  k.box('base', 'board_i', 11.45, 0, -14.85, 19.15, Y.stab, 3.75, [0.78, 0.72, 0.64], { seg: 1.5 }); // threshing floor planks
  // thresholds under the outside doors: stone sills
  ctx.floors.push(
    { x0: -13.5, x1: -0.2, z0: -8.1, z1: -0.5, y: Y.live, lvl: 0 },
    { x0: -7.6, x1: -6.6, z0: -0.5, z1: 0.02, y: Y.live, lvl: 0 }, // front door threshold
    { x0: -7.85, x1: -6.35, z0: 0.0, z1: 0.62, y: 0.18, lvl: 0 }, // stone step
    { x0: -5.7, x1: -4.7, z0: -8.62, z1: -8.1, y: Y.live, lvl: 0 },
    { x0: -0.2, x1: 0.2, z0: -5.8, z1: -4.85, y: Y.live, lvl: 0 }, // pantry -> stable threshold (step down)
    { x0: 0.2, x1: 11, z0: -8.1, z1: -0.5, y: Y.stab, lvl: 0 },
    { x0: 11.0, x1: 19.15, z0: -14.85, z1: 3.75, y: Y.stab, lvl: 0 },
    { x0: 12.4, x1: 15.9, z0: 3.7, z1: 4.25, y: Y.stab, lvl: 0 }, { x0: 12.4, x1: 15.9, z0: -15.35, z1: -14.8, y: Y.stab, lvl: 0 },
    { x0: 4.4, x1: 5.6, z0: -0.52, z1: 0.02, y: Y.stab, lvl: 0 },
  );
  k.box('base', 'stone', -7.85, 0, 0.0, -6.35, 0.18, 0.62, [0.86, 0.84, 0.82]);
  k.solid(-7.95, 0.0, -7.85, 0.62); k.solid(-6.35, 0.0, -6.25, 0.62);
  // ceiling beams + attic floor boards (with the hatch and the stair hole)
  const holes = [[HATCH.x0, HATCH.z0, HATCH.x1, HATCH.z1], [STAIR.x0, STAIR.z0, STAIR.x1, STAIR.z1]];
  for (const [x0, z0, x1, z1] of cutAll([-13.5, -8.1, 11.0, -0.5], holes)) k.box('attic', 'board_i', x0, Y.ceil, z0, x1, Y.attic, z1, [0.86, 0.8, 0.72], { seg: 1.5 });
  k.box('attic', 'board_i', 11.0, Y.ceil, -8.1, 11.45, Y.attic, -0.5, [0.86, 0.8, 0.72]); // over the barn wall top
  for (let x = -13.0; x < 10.9; x += 0.95) {
    if (x > HATCH.x0 - 0.1 && x < HATCH.x1 + 0.1) continue;
    const zz = x > STAIR.x0 - 0.12 && x < STAIR.x1 + 0.1 ? [[-4.95, -0.5]] : [[-8.1, -0.5]];
    for (const [z0, z1] of zz) k.box('attic', 'wood_i', x - 0.09, Y.beam, z0, x + 0.09, Y.ceil, z1, [0.7, 0.6, 0.52]);
  }
  // hatch frame + stair hole trimmers
  k.box('attic', 'wood_i', HATCH.x0 - 0.08, Y.beam, HATCH.z0 - 0.08, HATCH.x1 + 0.08, Y.ceil, HATCH.z0, C.dark);
  k.box('attic', 'wood_i', HATCH.x0 - 0.08, Y.beam, HATCH.z1, HATCH.x1 + 0.08, Y.ceil, HATCH.z1 + 0.08, C.dark);
  // barn: west loft (planks on beams) and the ceilings of rooms 10 / 11
  k.box('attic', 'board_i', 11.45, Y.ceil, -14.85, 14.0, Y.attic, 3.75, [0.82, 0.76, 0.68], { seg: 1.5 });
  for (let z = -14.4; z < 3.6; z += 1.0) k.box('attic', 'wood_i', 11.45, Y.beam, z - 0.09, 13.9, Y.ceil, z + 0.09, [0.7, 0.6, 0.52]);
  k.box('attic', 'wood_i', 13.9, Y.beam - 0.06, -14.85, 14.1, Y.ceil, 3.75, C.dark); // edge beam
  for (const z of [-12.4, -7.6, -2.8]) { // loft posts on the threshing floor (clear of both gates)
    k.box('base', 'wood_i', 13.88, Y.stab, z - 0.1, 14.08, Y.beam - 0.06, z + 0.1, C.dark); k.solid(13.85, z - 0.13, 14.11, z + 0.13, 0);
  }
  k.box('attic', 'plank_i', 16.84, Y.ceil, -7.96, 19.15, Y.attic, 3.75, [0.78, 0.72, 0.64]);
  k.box('attic', 'wood_i', 16.8, Y.ceil - 0.1, -7.99, 16.88, Y.ceil + 0.005, 3.75, C.dark); // ceiling edge trim
  // loft railing (gap at the ladder, z -10.4 +- 0.33)
  const G0 = -10.73, G1 = -10.07;
  for (const z of [-14.6, -13.0, -11.4, G0, G1, -8.6, -7.0, -5.4, -3.8, -2.2, -0.6, 1.0, 2.6]) k.box('attic', 'wood_i', 13.935, Y.attic, z - 0.04, 14.025, Y.attic + 1.0, z + 0.04, C.dark);
  for (const [z0, z1] of [[-14.85, G0 - 0.04], [G1 + 0.04, 3.75]]) {
    k.box('attic', 'wood_i', 13.92, Y.attic + 0.9, z0, 14.04, Y.attic + 0.985, z1, C.dark);
    k.box('attic', 'wood_i', 13.945, Y.attic + 0.45, z0, 14.015, Y.attic + 0.51, z1, C.dark);
    k.solid(13.9, z0, 14.06, z1, 1);
  }
  ctx.floors.push({ x0: -13.5, x1: 14.0, z0: -14.85, z1: 3.75, y: Y.attic, lvl: 1 });
}

/* ---------------------------------------------------------------- stairs (feed room) and the hallway ladder */
export const stairY = (z) => STAIR.y0 + (THREE.MathUtils.clamp((z - STAIR.z0) / (STAIR.z1 - STAIR.z0), 0, 1)) * (STAIR.y1 - STAIR.y0);
export function buildStairs(ctx) {
  const k = ctx.kit, n = 11, run = (STAIR.z1 - STAIR.z0) / n, rise = (STAIR.y1 - STAIR.y0) / n;
  for (let i = 0; i < n; i++) {
    const z = STAIR.z0 + i * run, y = STAIR.y0 + (i + 1) * rise;
    k.box('base', 'wood_i', STAIR.x0 + 0.04, y - 0.05, z, STAIR.x1 - 0.02, y, z + run + 0.03, C.oak);
  }
  const f = new Frame(k, 'base', 0, 0, 0, 0, true);
  f.beam('wood', [STAIR.x0, STAIR.y0, STAIR.z0], [STAIR.x0, STAIR.y1 - 0.1, STAIR.z1], 0.06, 0.25, C.dark);
  // hand rail on the open (west) side
  f.beam('wood', [STAIR.x0 - 0.02, stairY(STAIR.z0 + 0.5) + 0.92, STAIR.z0 + 0.5], [STAIR.x0 - 0.02, STAIR.y1 + 0.92, STAIR.z1], 0.05, 0.05, C.dark);
  for (let i = 1; i <= 4; i++) { const z = STAIR.z0 + 0.5 + (i / 4) * (STAIR.z1 - STAIR.z0 - 0.5); f.beam('wood', [STAIR.x0 - 0.02, stairY(z), z], [STAIR.x0 - 0.02, stairY(z) + 0.95, z], 0.05, 0.05, C.dark); }
  k.solid(STAIR.x0 - 0.1, STAIR.z0 + 0.7, STAIR.x0, STAIR.z1, 0);
  k.solid(STAIR.x0, STAIR.z1, STAIR.x1, -4.68, 0);
  // attic: railing round the stair hole (open towards the south = the landing)
  const fa = f.grp('attic');
  fa.box('wood', STAIR.x0 - 0.06, Y.attic, STAIR.z0 - 0.06, STAIR.x0, Y.attic + 0.95, STAIR.z1 - 0.1, C.dark);
  k.solid(STAIR.x0 - 0.1, STAIR.z0 - 0.1, STAIR.x0, STAIR.z1, 1); k.solid(STAIR.x1, STAIR.z0 - 0.1, 11.1, STAIR.z1, 1);
  ctx.floors.push({ x0: STAIR.x0, x1: STAIR.x1, z0: STAIR.z0, z1: STAIR.z1, y: 'stair', lvl: 0 }, { x0: STAIR.x0, x1: STAIR.x1, z0: STAIR.z0, z1: STAIR.z1, y: 'stair', lvl: 1 });
  // hallway ladder up to the hatch: leans on the hatch's north edge and sticks up ~0.9 m above the attic floor as a hand hold;
  // you climb it facing north and step off forwards (between the rails) onto the attic floor
  const lx = (HATCH.x0 + HATCH.x1) / 2, SL = 0.25; // horizontal run per metre of rise
  const lz = (y) => HATCH.z0 + 0.05 + (Y.attic - y) * SL; // ladder line (rail centres) at height y
  const lb = new V3(lx, Y.live, lz(Y.live)), lt = new V3(lx, Y.attic + 0.92, lz(Y.attic + 0.92));
  const tilt = Math.atan2(lt.z - lb.z, lt.y - lb.y);
  ladder(new Frame(k, 'base', lb.x, lb.y, lb.z, 0, true).sub(0, 0, 0, 0, [tilt, 0, 0]), { len: lb.distanceTo(lt) });
  for (const sx of [-1, 1]) k.box('base', 'wood_i', lx + sx * 0.21 - 0.035, Y.live, lb.z - 0.05, lx + sx * 0.21 + 0.035, Y.live + 0.015, lb.z + 0.05, C.dark); // feet pads
  k.solid(lx - 0.27, HATCH.z0 - 0.05, lx + 0.27, lb.z + 0.06, 0);
  // hatch lid: hinged on the south edge, stands open leaning back against a strut; coaming round the hole
  const fl = new Frame(k, 'attic', lx, Y.attic, HATCH.z1 + 0.02, 0, true).sub(0, 0, 0, 0, [0.22, 0, 0]);
  fl.box('plank', -(HATCH.x1 - HATCH.x0) / 2, 0, -0.045, (HATCH.x1 - HATCH.x0) / 2, HATCH.z1 - HATCH.z0, 0, C.oak);
  for (const y of [0.12, 0.62]) fl.box('wood', -(HATCH.x1 - HATCH.x0) / 2 + 0.05, y, 0, (HATCH.x1 - HATCH.x0) / 2 - 0.05, y + 0.08, 0.03, C.dark);
  fa.beam('wood', [HATCH.x1 - 0.06, Y.attic, HATCH.z1 + 0.62], [HATCH.x1 - 0.06, Y.attic + 0.72, HATCH.z1 + 0.18], 0.04, 0.04, C.dark); // strut
  for (const [x0, z0, x1, z1] of [[HATCH.x0 - 0.06, HATCH.z0 - 0.06, HATCH.x1 + 0.06, HATCH.z0], [HATCH.x0 - 0.06, HATCH.z1, HATCH.x1 + 0.06, HATCH.z1 + 0.06], [HATCH.x0 - 0.06, HATCH.z0, HATCH.x0, HATCH.z1], [HATCH.x1, HATCH.z0, HATCH.x1 + 0.06, HATCH.z1]])
    fa.box('wood', x0, Y.attic, z0, x1, Y.attic + 0.045, z1, C.dark);
  k.solid(HATCH.x0 - 0.06, HATCH.z0 - 0.06, HATCH.x1 + 0.06, HATCH.z1 + 0.72, 1, 'hatch');
  const off = 0.18; // climber's feet stand this far south of the ladder line
  const upH = [[lx, Y.live, lb.z + 0.62], [lx, Y.live, lb.z + off], [lx, Y.attic, lz(Y.attic) + off], [lx, Y.attic, HATCH.z0 - 0.5]];
  ctx.ladders.push(
    { id: 'hatch', at: new V3(lx, Y.live + 1.1, lb.z), lvl: 0, up: true, path: upH, yaw: 0, label: 'подняться на чердак' },
    { id: 'hatchDown', at: new V3(lx, Y.attic + 0.45, HATCH.z0 - 0.1), lvl: 1, up: false, path: upH.slice().reverse(), yaw: 0, label: 'спуститься в сени' },
  );
  // barn ladder to the loft: leans on the loft's edge beam, the railing has a gap there
  const bz = -10.4, BS = 0.3, bxl = (y) => 14.13 + (Y.attic - y) * BS;
  const bb = new V3(bxl(Y.stab), Y.stab, bz), bt = new V3(bxl(Y.attic + 0.95), Y.attic + 0.95, bz);
  const btilt = Math.atan2(bb.x - bt.x, bt.y - bb.y);
  ladder(new Frame(k, 'base', bb.x, bb.y, bb.z, -Math.PI / 2, true).sub(0, 0, 0, 0, [btilt, 0, 0]), { len: bb.distanceTo(bt) });
  k.solid(14.1, bz - 0.27, bb.x + 0.06, bz + 0.27, 0);
  const upL = [[bb.x + 0.6, Y.stab, bz], [bb.x + off, Y.stab, bz], [bxl(Y.attic) + off, Y.attic, bz], [13.35, Y.attic, bz]];
  ctx.ladders.push(
    { id: 'loft', at: new V3(bb.x - 0.1, 1.2, bz), lvl: 0, up: true, path: upL, yaw: Math.PI / 2, label: 'забраться на сеновал' },
    { id: 'loftDown', at: new V3(13.9, Y.attic + 0.45, bz), lvl: 1, up: false, path: upL.slice().reverse(), yaw: Math.PI / 2, label: 'спуститься в гумно' },
  );
}

/* ---------------------------------------------------------------- roofs */
function orient(pts, n) { const a = pts[0], b = pts[1], c = pts[2]; return new V3().subVectors(b, a).cross(new V3().subVectors(c, a)).dot(n) < 0 ? pts.slice().reverse() : pts; }
function slab(ctx, pts, n, uvFn, grp = 'roof', th = ROOF_T) {
  const P = orient(pts, n), g = slabGeo(P, n, th, uvFn), k = ctx.kit;
  k.raw(grp, 'roof', g.top, [1, 1, 1]); k.raw(grp, 'board_i', g.bottom, [0.62, 0.54, 0.46]); k.raw(grp, 'wood', g.side, C.dark);
}
export function buildRoofs(ctx) {
  const H = HOUSE, B = BARN, E = Y.eave, k = ctx.kit, x0 = H.x0 - OVER;
  const hS = (z) => E + PITCH * (H.z1 - z), hN = (z) => E + PITCH * (z - H.z0), bW = (x) => E + PITCH * (x - B.x0), bE = (x) => E + PITCH * (B.x1 - x);
  const P = (x, y, z) => new V3(x, y, z);
  const ns = new V3(0, 1, PITCH).normalize(), nn = new V3(0, 1, -PITCH).normalize(), nw = new V3(-PITCH, 1, 0).normalize(), ne = new V3(PITCH, 1, 0).normalize();
  const uvH = (p) => [p.x, p.y * VK / PITCH], uvB = (p) => [p.z, p.y * VK / PITCH];
  const zs = H.z1 + OVER, zn = H.z0 - OVER, rz = H.ridgeZ, rx = B.ridgeX, xe = B.x0 - OVER;
  slab(ctx, [P(x0, hS(zs), zs), P(xe, hS(zs), zs), P(rx, Y.ridge, rz), P(x0, Y.ridge, rz)], ns, uvH);
  slab(ctx, [P(x0, Y.ridge, rz), P(rx, Y.ridge, rz), P(xe, hN(zn), zn), P(x0, hN(zn), zn)], nn, uvH);
  const bz0 = B.z0 - OVER, bz1 = B.z1 + OVER, bxe = B.x1 + OVER;
  slab(ctx, [P(xe, bW(xe), bz1), P(rx, Y.ridge, bz1), P(rx, Y.ridge, rz), P(xe, bW(xe), zs)], nw, uvB);
  slab(ctx, [P(xe, bW(xe), zn), P(rx, Y.ridge, rz), P(rx, Y.ridge, bz0), P(xe, bW(xe), bz0)], nw, uvB);
  slab(ctx, [P(rx, Y.ridge, bz1), P(bxe, bE(bxe), bz1), P(bxe, bE(bxe), bz0), P(rx, Y.ridge, bz0)], ne, uvB);
  // ridge caps
  const f = new Frame(k, 'roof', 0, 0, 0, 0, false);
  f.obox('roof', rx - x0 + 0.1, 0.24, 0.24, [(x0 + rx) / 2, Y.ridge - 0.06, rz], [Math.PI / 4, 0, 0], [0.62, 0.42, 0.34]);
  f.obox('roof', 0.24, 0.24, bz1 - bz0 + 0.1, [rx, Y.ridge - 0.06, (bz0 + bz1) / 2], [0, 0, Math.PI / 4], [0.62, 0.42, 0.34]);
  // gables: house west (masonry), barn north + south (boards above the masonry)
  const gable = (pts, n, mo, mi, t, col = [1, 1, 1]) => { const g = slabGeo(orient(pts, n), n, t, (p) => (Math.abs(n.x) > 0.5 ? [p.z, p.y] : [p.x, p.y])); k.raw('roof', mo, g.top, col); k.raw('roof', mi, g.bottom, col); k.raw('roof', mo, g.side, [0.9 * col[0], 0.9 * col[1], 0.9 * col[2]]); };
  const gy = Y.ridge - 0.06;
  const ge = E, gb = E - 0.14;
  gable([P(H.x0, ge, H.z1), P(H.x0, gy, rz), P(H.x0, ge, H.z0)], new V3(-1, 0, 0), 'wash', 'wash_i', H.t);
  gable([P(B.x0 - 0.03, gb, B.z1 + 0.035), P(rx, gy, B.z1 + 0.035), P(B.x1 + 0.03, gb, B.z1 + 0.035)], new V3(0, 0, 1), 'plank', 'plank_i', 0.08, [0.6, 0.5, 0.42]);
  gable([P(B.x0 - 0.03, gb, B.z0 - 0.035), P(rx, gy, B.z0 - 0.035), P(B.x1 + 0.03, gb, B.z0 - 0.035)], new V3(0, 0, -1), 'plank', 'plank_i', 0.08, [0.6, 0.5, 0.42]);
  // gable dressing: house attic windows (dark, framed), barn hay door + vent
  const fo = new Frame(k, 'roof', 0, 0, 0, 0, false);
  for (const z of [-2.7, -5.9]) {
    fo.box('wood', H.x0 - 0.04, 4.55, z - 0.3, H.x0 + 0.02, 5.25, z + 0.3, C.dark);
    fo.box('plain', H.x0 - 0.05, 4.6, z - 0.25, H.x0 - 0.03, 5.2, z + 0.25, [0.12, 0.13, 0.15]);
    fo.box('wood', H.x0 - 0.06, 4.6, z - 0.015, H.x0 - 0.04, 5.2, z + 0.015, C.dark);
  }
  fo.box('plank', 14.6, 4.4, B.z1 + 0.04, 16.0, 5.6, B.z1 + 0.075, [0.62, 0.56, 0.5]);
  fo.box('wood', 14.55, 5.6, B.z1 + 0.04, 16.05, 5.68, B.z1 + 0.12, C.dark);
  for (const zz of [B.z1 + 0.062, B.z0 - 0.062]) for (let x = B.x0 + 0.3; x < B.x1; x += 0.62) { // battens over the board joints
    const top = Math.min(bW(x), bE(x)) - 0.1;
    if (top > E + 0.1 && (x < 14.5 || x > 16.1 || zz < 0)) fo.box('wood', x - 0.03, gb, zz - 0.02, x + 0.03, top, zz + 0.02, [0.5, 0.45, 0.4]);
  }
  // rafters (roof group) — house slopes incl. the jack rafters that run into the valleys
  const fr = new Frame(k, 'roof', 0, 0, 0, 0, true), dr = 0.17;
  const rafter = (a, b) => fr.beam('wood', a, b, 0.11, dr, [0.66, 0.56, 0.48]);
  const yuS = (z) => hS(z) - UNDER - dr * VK / 2, yuN = (z) => hN(z) - UNDER - dr * VK / 2, yuW = (x) => bW(x) - UNDER - dr * VK / 2, yuE = (x) => bE(x) - UNDER - dr * VK / 2;
  for (let x = H.x0 + 0.35; x < rx - 0.2; x += 0.95) {
    if (x > CHIMNEY.x0 - 0.15 && x < CHIMNEY.x1 + 0.15) continue;
    const za = Math.min(-0.3, B.x0 - x), zb = Math.max(-8.3, x - (B.x0 + 8.6));
    if (za > rz + 0.2) rafter([x, yuS(za), za], [x, yuS(rz + 0.05), rz + 0.05]);
    if (zb < rz - 0.2) rafter([x, yuN(zb), zb], [x, yuN(rz - 0.05), rz - 0.05]);
  }
  for (let z = B.z0 + 0.5; z < B.z1 - 0.3; z += 0.95) {
    const valley = z > rz ? B.x0 - z : B.x0 + (z - H.z0);
    const xa = z < H.z1 && z > H.z0 ? Math.max(B.x0 + 0.5, valley) : B.x0 + 0.5;
    if (xa < rx - 0.2) rafter([xa, yuW(xa), z], [rx - 0.05, yuW(rx - 0.05), z]);
    rafter([B.x1 - 0.5, yuE(B.x1 - 0.5), z], [rx + 0.05, yuE(rx + 0.05), z]);
  }
  // purlins on posts with braces and collar ties (attic group: they stay visible in the attic cutaway)
  const fa = new Frame(k, 'attic', 0, 0, 0, 0, true), PW = 0.2, col = [0.6, 0.5, 0.42];
  const pyS = (z) => hS(z) - UNDER - dr * VK, pyN = (z) => hN(z) - UNDER - dr * VK;
  const pzS = -1.9, pzN = -6.7, ptop = pyS(pzS);
  for (const [pz, py] of [[pzS, ptop], [pzN, pyN(pzN)]]) {
    fa.box('wood', H.x0 + 0.5, py - 0.22, pz - PW / 2, pz > rz ? B.x0 - pz - 0.2 : B.x0 + (pz - H.z0) - 0.2, py, pz + PW / 2, col);
  }
  for (const x of [-12.2, -6.6, -2.6, 1.4, 5.4, 9.2]) {
    for (const pz of [pzS, pzN]) {
      fa.box('wood', x - 0.1, Y.attic, pz - 0.1, x + 0.1, ptop - 0.22, pz + 0.1, col);
      for (const s of [-1, 1]) fa.beam('wood', [x, ptop - 1.0, pz], [x + s * 0.8, ptop - 0.24, pz], 0.1, 0.1, col);
      ctx.kit.solid(x - 0.13, pz - 0.13, x + 0.13, pz + 0.13, 1);
    }
    fa.box('wood', x - 0.07, ptop - 0.38, pzN - 0.3, x + 0.07, ptop - 0.22, pzS + 0.3, col); // collar tie under the purlins
  }
  // barn purlins and posts
  const bpy = bW(13.6) - UNDER - dr * VK;
  fa.box('wood', 13.5, bpy - 0.22, B.z0 + B.t, 13.7, bpy, B.z1 - B.t, col);
  fa.box('wood', 16.9, bpy - 0.22, B.z0 + B.t, 17.1, bpy, B.z1 - B.t, col);
  for (const z of [-13.2, -9.4, -5.6, -1.8, 2.0]) {
    fa.box('wood', 13.5, Y.attic, z - 0.1, 13.7, bpy - 0.22, z + 0.1, col); ctx.kit.solid(13.47, z - 0.13, 13.73, z + 0.13, 1);
    const y0 = z < -7.96 ? Y.stab : Y.attic, g = z < -7.96 ? 'base' : 'attic';
    new Frame(k, g, 0, 0, 0, 0, true).box('wood', 16.9, y0, z - 0.1, 17.1, bpy - 0.22, z + 0.1, col);
    if (z < -7.96) ctx.kit.solid(16.87, z - 0.13, 17.13, z + 0.13, 0);
    fa.box('wood', 13.6, bpy - 0.75, z - 0.07, 17.0, bpy - 0.57, z + 0.07, col); // tie beam
    for (const [x, s] of [[13.6, 1], [17.0, -1]]) fa.beam('wood', [x, bpy - 1.1, z], [x + s * 0.8, bpy - 0.24, z], 0.1, 0.1, col);
  }
}

/* ---------------------------------------------------------------- chimney */
export function buildChimney(ctx) {
  const k = ctx.kit, c = CHIMNEY, roofAt = Y.eave + PITCH * (c.z0 - HOUSE.z0) - UNDER;
  for (const [y0, y1, g] of [[Y.live, Y.cut, 'base'], [Y.cut, Y.attic, 'upper'], [Y.attic, roofAt, 'attic'], [roofAt, c.top, 'roof']]) {
    k.box(g, g === 'roof' ? 'brick' : 'wash_i', c.x0, y0, c.z0, c.x1, y1, c.z1, g === 'roof' ? [0.9, 0.8, 0.76] : [0.95, 0.93, 0.9]);
  }
  k.box('roof', 'brick', c.x0 - 0.05, c.top - 0.1, c.z0 - 0.05, c.x1 + 0.05, c.top + 0.04, c.z1 + 0.05, [0.7, 0.62, 0.58]);
  k.box('roof', 'plain', c.x0 + 0.08, c.top + 0.035, c.z0 + 0.08, c.x1 - 0.08, c.top + 0.045, c.z1 - 0.08, [0.06, 0.05, 0.05]);
  k.solid(c.x0, c.z0, c.x1, c.z1, 0);
  ctx.smokeAt = new V3((c.x0 + c.x1) / 2, c.top + 0.1, (c.z0 + c.z1) / 2);
}

/* ---------------------------------------------------------------- windows */
const WALLF = { S: [0, 0, 0], N: [0, -8.6, Math.PI], W: [-14, 0, -Math.PI / 2], E: [19.6, 0, Math.PI / 2] };
export function buildWindows(ctx) {
  const k = ctx.kit;
  for (const w of WINDOWS) {
    const [a, b, yaw] = WALLF[w.wall], t = w.barn ? BARN.t : HOUSE.t;
    const pos = w.wall === 'S' || w.wall === 'N' ? [w.c, 0, b] : [a, 0, w.c];
    const grp = w.y1 > Y.cut + 0.1 ? 'upper' : 'base';
    const fo = new Frame(k, grp, pos[0], 0, pos[2], yaw, false), fi = new Frame(k, grp, 0, 0, 0, 0, true, fo.M.clone());
    const hw = w.w / 2, y0 = w.y0, y1 = w.y1, zf = -0.17, fw = 0.06;
    const dark = w.kind === 'stable' ? [0.5, 0.45, 0.4] : [0.86, 0.8, 0.7];
    fo.box('wood', -hw, y0, zf - 0.04, hw, y0 + fw, zf + 0.04, dark); fo.box('wood', -hw, y1 - fw, zf - 0.04, hw, y1, zf + 0.04, dark);
    fo.box('wood', -hw, y0, zf - 0.04, -hw + fw, y1, zf + 0.04, dark); fo.box('wood', hw - fw, y0, zf - 0.04, hw, y1, zf + 0.04, dark);
    const cols = w.kind === 'knee' ? 2 : 2, rows = w.kind === 'live' ? 3 : w.kind === 'knee' ? 1 : 2;
    for (let i = 1; i < cols; i++) { const x = -hw + (i * w.w) / cols; fo.box('wood', x - 0.022, y0, zf - 0.02, x + 0.022, y1, zf + 0.02, dark); }
    for (let j = 1; j < rows; j++) { const y = y0 + (j * (y1 - y0)) / rows; fo.box('wood', -hw, y - 0.018, zf - 0.02, hw, y + 0.018, zf + 0.02, dark); }
    fo.part('glass', new THREE.PlaneGeometry(w.w - 2 * fw, y1 - y0 - 2 * fw), { pos: [0, (y0 + y1) / 2, zf], col: [1, 1, 1], uv: [cols, rows] });
    if (w.room && ctx.glowRooms.includes(w.room)) fo.part('glow_' + w.room, new THREE.PlaneGeometry(w.w - 2 * fw, y1 - y0 - 2 * fw), { pos: [0, (y0 + y1) / 2, zf + 0.012], col: [1, 1, 1], uv: 'keep' });
    if (w.kind !== 'knee') {
      fo.box('stone', -hw - 0.07, y0 - 0.07, zf, hw + 0.07, y0 + 0.018, 0.075, [0.82, 0.8, 0.78]); // outside sill
      fi.box('wood', -hw - 0.05, y0 - 0.04, -t - 0.035, hw + 0.05, y0 + 0.016, zf - 0.04, C.oak); // inside window board
    }
    if (w.kind === 'live') { // shutters folded back against the facade
      for (const s of [-1, 1]) {
        const sx = s * (hw + 0.035 + hw / 2);
        fo.box('wood', sx - hw / 2, y0 - 0.02, 0.005, sx + hw / 2, y1 + 0.02, 0.045, C.shutter);
        for (let yy = y0 + 0.12; yy < y1; yy += 0.13) fo.box('wood', sx - hw / 2 + 0.04, yy - 0.012, 0.04, sx + hw / 2 - 0.04, yy + 0.012, 0.055, [C.shutter[0] * 0.8, C.shutter[1] * 0.8, C.shutter[2] * 0.8]);
        fo.box('iron', s * (hw + 0.01) - 0.02, y0 + 0.2, 0.0, s * (hw + 0.01) + 0.02, y0 + 0.24, 0.05, C.black);
        fo.box('iron', s * (hw + 0.01) - 0.02, y1 - 0.24, 0.0, s * (hw + 0.01) + 0.02, y1 - 0.2, 0.05, C.black);
      }
      // curtain inside (linen, half drawn)
      for (const s of [-1, 1]) for (const back of [0, 1]) fi.part('linen', new THREE.PlaneGeometry(hw * 0.7, y1 - y0 - 0.06, 3, 1), { pos: [s * hw * 0.66, (y0 + y1) / 2 + 0.02, -t - 0.05 - back * 0.002], rot: [0, back * Math.PI, 0], col: [0.95, 0.92, 0.84] });
      fi.box('wood', -hw - 0.1, y1 + 0.02, -t - 0.08, hw + 0.1, y1 + 0.05, -t - 0.02, C.dark); // curtain rod
    }
    if (w.kind === 'stable') for (let i = 1; i < 4; i++) fo.box('iron', -hw + (i * w.w) / 4 - 0.01, y0, -0.1, -hw + (i * w.w) / 4 + 0.01, y1, -0.08, C.black); // bars
    if (w.chickens) { // chicken ladder up to the stable window
      const f2 = fo.sub(0, 0, 0.0);
      f2.beam('wood', [0, y0 - 0.05, 0.05], [0, 0.0, 1.5], 0.24, 0.03, [0.7, 0.64, 0.56]);
      for (let i = 1; i < 8; i++) { const tt = i / 8; f2.box('wood', -0.12, (1 - tt) * (y0 - 0.05) + 0.02, 0.05 + tt * 1.45 - 0.015, 0.12, (1 - tt) * (y0 - 0.05) + 0.045, 0.05 + tt * 1.45 + 0.015, C.dark); }
      fo.solid(-0.2, 0.0, 0.2, 1.5, 0);
    }
  }
  // hay hatch above the stable door (closed boards) and the barn room windows' opposite: cellar etc. live in the yard builder
  const fh = new Frame(k, 'upper', 5, 0, 0, 0, false);
  fh.box('plank', -0.45, 3.05, -0.12, 0.45, 3.86, -0.06, [0.6, 0.54, 0.48]);
  fh.box('wood', -0.5, 3.875, -0.14, 0.5, 3.95, 0.02, C.dark);
  fh.box('iron', -0.4, 3.3, -0.06, 0.1, 3.34, -0.04, C.black); fh.box('iron', -0.4, 3.6, -0.06, 0.1, 3.64, -0.04, C.black);
}

/* ---------------------------------------------------------------- doors (separate pivots, opened with E) */
export function buildDoors(ctx, mats, scene) {
  for (const d of DOORS) {
    const k = new Kit(mats), f = new Frame(k, 'door', 0, 0, 0, 0, !d.ext), w = d.w - 0.02, h = d.h - 0.02, gate = w > 1.2;
    const m = 'plank', col = gate ? [0.66, 0.58, 0.5] : d.ext ? [0.62, 0.52, 0.44] : [0.82, 0.7, 0.58];
    const boards=Math.max(5,Math.round(w/.145));
    for(let i=0;i<boards;i++)timber(f,.01+i*(w-.01)/boards,0,-.025,.01+(i+1)*(w-.01)/boards-.0007,h,.025,col.map(c=>c*(.97+(i%3)*.02)),1);
    const back = d.ext ? -1 : 1; // ledges + brace on the inner face
    for (const y of gate ? [0.3, h / 2, h - 0.3] : [0.25, h - 0.3]) f.box('wood', 0.05, y - 0.06, back * 0.025, w - 0.04, y + 0.06, back * 0.055, [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85]);
    f.beam('wood', [0.12, gate ? 0.36 : 0.31, back * 0.039], [w - 0.12, h - (gate ? 0.36 : 0.36), back * 0.039], 0.024, 0.1, [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85]);
    for (const y of gate ? [0.3, h - 0.3] : [0.25, h - 0.3]) f.box('iron', 0.0, y - 0.025, -back * 0.03, gate ? 0.9 : 0.42, y + 0.025, -back * 0.022, C.black); // strap hinges outside
    for(const y of gate?[.3,h-.3]:[.25,h-.3]){
      f.cyl('iron',.012,.012,.17,12,[.018,y,-back*.038],[0,0,0],C.iron);
      for(const x of [.065,.23,gate?.73:.37])f.sph('iron',.006,[x,y,-back*.032],[1,1,.45],C.iron);
    }
    if (!gate) { f.box('iron', w - 0.13, 1.0, -0.05, w - 0.09, 1.04, 0.05, C.black); f.cyl('iron', 0.02, 0.02, 0.12, 6, [w - 0.11, 1.02, 0.07], [Math.PI / 2, 0, 0], C.black); }

    const g = k.build().door;
    const pivot = new THREE.Group();
    pivot.position.set(...d.hinge); pivot.rotation.y = d.yaw; pivot.add(g);
    scene.add(pivot);
    const ca = Math.cos(d.yaw), sa = -Math.sin(d.yaw), ex = d.hinge[0] + ca * d.w, ez = d.hinge[2] + sa * d.w;
    const solid = ctx.kit.solid(Math.min(d.hinge[0], ex) - 0.07, Math.min(d.hinge[2], ez) - 0.07, Math.max(d.hinge[0], ex) + 0.07, Math.max(d.hinge[2], ez) + 0.07, 0, 'door');
    const D = { d, pivot, g, solid, t: 0, target: 0, mid: new V3((d.hinge[0] + ex) / 2, d.hinge[1] + 1.1, (d.hinge[2] + ez) / 2) };
    if (d.id === 'd16') {
      // Door strap and fixed jamb eye are independent. Remove the broken lock before folding the strap.
      const leafHasp = makeHasp(); leafHasp.staple.visible=false; leafHasp.group.position.set(w+.030,1.12,.030); pivot.add(leafHasp.group);
      const fixed=new THREE.Group(); fixed.position.set(...d.hinge); fixed.rotation.y=d.yaw; scene.add(fixed);
      const fixedHasp=makeHasp(); fixedHasp.leaf.visible=false; fixedHasp.group.position.copy(leafHasp.group.position); fixed.add(fixedHasp.group);
      const lock=makePadlock(); lock.group.position.set(w+.0329,1.116,.048); fixed.add(lock.group);
      const shelfKit=new Kit(mats), shelf=new Frame(shelfKit,'shelf');
      shelf.box('wood',w+.075,.895,.005,w+.20,.915,.098,C.dark);
      for(const x of [w+.09,w+.185]) shelf.beam('iron',[x,.83,.005],[x,.89,.078],.012,.012,C.iron);
      fixed.add(shelfKit.build().shelf);
      D.hardware={leafHasp,fixedHasp,lock,fixed}; D.haspT=0; D.haspTarget=0; D.releaseT=0; D.releaseTarget=0; D.pendingOpen=false;
      D.setBroken=(b)=>{D.broken=!!b;lock.setBroken(b);D.haspT=0;D.haspTarget=0;D.releaseT=0;D.releaseTarget=0;D.pendingOpen=false;leafHasp.setOpen(0);}; D.setBroken(false);
    }
    if (d.id === 'd7') {
      // Plate follows the door; the keeper is fixed to the jamb, facing the pantry (-local Z).
      const bolt=makeBolt(), fixedBolt=makeBolt(); bolt.keeper.visible=false;
      bolt.group.position.set(w-.19,1.05,-.058); bolt.group.scale.z=-.001; pivot.add(bolt.group);
      const fixed=new THREE.Group(); fixed.position.set(...d.hinge); fixed.rotation.y=d.yaw; scene.add(fixed);
      for(const child of fixedBolt.group.children) child.visible=child===fixedBolt.keeper;
      fixedBolt.group.position.copy(bolt.group.position); fixedBolt.group.scale.z=-.001; fixed.add(fixedBolt.group);
      D.bolt=bolt; D.boltT=0; D.boltTarget=0; D.boltReturn=0; D.pendingOpen=false;
    }
    ctx.doors.push(D);
  }
}
