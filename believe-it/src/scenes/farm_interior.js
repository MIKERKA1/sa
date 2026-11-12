// Hinterkaifeck — furnishing of the rooms, the stable, the barn, the attic (grain, hay, smokehouse, the hidden nest) and the engine hut.
import * as THREE from 'three';
import { Y, ROOMS, HATCH, STAIR, CHIMNEY } from './farm_plan.js';
import * as P from './farm_props.js';
import { rng } from '../engine/util.js';

const { Frame, C, lathe } = P;
const PI = Math.PI, H = PI / 2;

export function furnish(ctx) {
  const k = ctx.kit, L = ctx.lightPts;
  const F = (x, y, z, yaw = 0, g = 'base') => new Frame(k, g, x, y, z, yaw, true);
  const yl = Y.live, ys = Y.stab, ya = Y.attic;
  const flame = (p, id) => ctx.flames.push({ p: p.clone(), id });

  /* ---------------- 1: Andreas and Cäzilia Gruber (old couple)
     Herrgottswinkel in the SW corner between the two window walls: corner bench, table, crucifix; tiled stove in the NE corner
     (fired from the kitchen side, oven bench round it); the two beds heads to the north wall with the chest at their foot;
     wardrobe on the east wall between the door and the stove; clock on the south wall between the windows */
  P.bed(F(-12.92, yl, -3.48, 0), { w: 1.0, check: 'checkB' });
  P.bed(F(-11.84, yl, -3.48, 0), { w: 1.0, check: 'checkB', r: rng(3) });
  P.kachelofen(F(-9.3, yl, -4.0, 0)); // tile grid: body x -9.8..-8.8, z -4.4..-3.6
  P.chest(F(-12.4, yl, -2.24, 0), { w: 1.0, d: 0.44 }); // at the foot of the beds
  P.wardrobe(F(-8.97, yl, -2.68, -H), { w: 1.05 });
  P.bench(F(-13.31, yl, -1.38, H), { l: 1.55 }); // corner bench: west wall ...
  P.bench(F(-12.48, yl, -0.69, 0), { l: 1.24 }); // ... and south wall (butts against the west bench)
  P.table(F(-12.6, yl, -1.42, 0), { w: 1.0, d: 0.75 });
  P.chair(F(-11.76, yl, -1.42, -H));
  L.r1 = P.tableLamp(F(-12.55, yl + 0.76, -1.36, 0)); P.lampGlass(F(-12.55, yl + 0.76, -1.36, 0)); flame(L.r1, 'r1');
  const holyCorner = F(-13.38, yl + 1.75, -0.62, PI * 0.75), cw = .12 * Math.SQRT2;
  // A diagonal mounting board reaches both window walls in the Herrgottswinkel.
  holyCorner.box('wood', -cw, -.32, -.028, cw, .32, 0, C.dark);
  for (const x of [-.148, .148]) holyCorner.cyl('iron', .004, .004, .003, 8, [x, .23, .0015], [H, 0, 0], C.iron);
  P.crucifix(holyCorner, { s: 1.1 });
  P.picture(F(-13.5, yl + 1.62, -1.75, H), { w: 0.22, h: 0.3 });
  P.picture(F(-12.92, yl + 1.65, -4.52, 0)); P.picture(F(-11.88, yl + 1.65, -4.52, 0), { w: 0.22, h: 0.3 });
  P.clock(F(-11.3, yl + 1.78, -0.5, PI));
  P.paperSheet(F(-8.672, yl + 1.45, -0.83, -H), { w: 0.22, h: 0.3 }); // sheet offset leaves 1 mm in front of the wall
  k.box('base', 'linen_i', -11.3, yl, -4.25, -10.55, yl + 0.01, -2.75, [0.62, 0.42, 0.36]); // bedside rag rug
  P.chair(F(-10.75, yl, -4.2, 0.35)); // clothes chair by the bed

  /* ---------------- 2: maid's room (also a storeroom) */
  P.bed(F(-12.5, yl, -5.2, H), { w: 0.9, l: 1.9, check: 'checkR' });
  P.bundle(F(-11.95, yl + 0.59, -5.05, 0.4)); // the new maid's bundle (she came that very day)
  P.chest(F(-10.4, yl, -5.0, PI), { w: 0.9, d: 0.45 });
  P.table(F(-11.3, yl, -7.68, 0), { w: 0.8, d: 0.55 });
  P.chair(F(-11.3, yl, -7.1, PI));
  const sh2 = P.shelf(F(-9.95, yl, -7.92, 0), { w: 0.95, d: 0.3, h: 1.7 });
  const r2 = rng(21);
  for (const y of sh2.slice(1)) for (let x = -10.3; x < -9.6; x += 0.17 + r2() * 0.08) P.jar(F(x, yl + y, -7.92, 0), { h: 0.12 + r2() * 0.08, seed: Math.floor(r2() * 30) });
  P.sack(F(-13.1, yl, -7.65, 0.4), { seed: 21 }); P.sack(F(-12.72, yl, -7.78, -0.3), { s: 0.9, seed: 22 }); P.sack(F(-13.05, yl, -7.1, 1.5), { s: 0.8, lie: true, seed: 23 });
  P.crock(F(-12.35, yl, -7.85, 0), { r: 0.15, h: 0.36, seed: 1 }); P.crock(F(-12.02, yl, -7.85, 0), { seed: 2 });
  P.barrel(F(-9.55, yl, -5.06, 0), { r: 0.25, h: 0.65 }); // clear of the door swing
  { // peg rack on the east wall (clear of the bed head): the maid's Sunday jacket, a shawl, a kerchief
    const pr = F(-9.18, yl + 1.66, -5.5, -H), tips = P.pegRack(pr, { l: 0.78, n: 3 });
    P.jacket(pr.sub(...tips[0]), { col: [0.4, 0.37, 0.42], l: 0.66, seed: 21 });
    P.shawl(pr.sub(...tips[1]), { col: [0.52, 0.22, 0.2], seed: 22 });
    P.shawl(pr.sub(...tips[2]), { col: [0.3, 0.36, 0.52], seed: 23 });
  }

  /* ---------------- 3: hallway */
  P.bench(F(-5.92, yl, -3.15, H), { l: 1.5 });
  { // coat pegs by the front door: Andreas' long coat and felt hat, a work jacket
    const pr = F(-8.1, yl + 1.7, -0.5, PI), tips = P.pegRack(pr, { l: 0.7, n: 3 });
    P.jacket(pr.sub(...tips[0]), { col: [0.26, 0.25, 0.25], l: 0.98, seed: 31, long: true });
    P.hat(pr.sub(...tips[1]));
    P.jacket(pr.sub(...tips[2]), { col: [0.4, 0.32, 0.26], l: 0.72, seed: 32 });
  }
  P.bucketWood(F(-6.0, yl, -0.85, 0.6), { water: true }); P.bucketWood(F(-6.25, yl, -0.75, 2.0), { col: C.dark });
  P.boots(F(-8.21, yl, -0.88, -H + 0.2)); // boots by the door
  P.crucifix(F(-5.68, yl + 1.7, -3.3, -H), { s: 0.8 });

  /* ---------------- 4: kitchen */
  const st = P.kitchenStove(F(-7.67, yl, -5.055, PI));
  L.stove = st.fire; ctx.stoveFire = st.fire;
  P.pot(F(-7.35, yl + st.top, -5.0, 0), { r: 0.15, h: 0.2 }); P.pot(F(-7.95, yl + st.top, -4.98, 1.2), { r: 0.12, h: 0.14, col: [0.3, 0.3, 0.32] });
  const fk = F(0, 0, 0);
  fk.rod('iron', [-8.0, yl + st.top + 0.05, -4.82], [-8.0, yl + 1.55, -4.82], 0.065, 8, [0.22, 0.22, 0.24]); // flue pipe into the chimney
  fk.rod('iron', [-8.0, yl + 1.55, -4.82], [-8.32, yl + 1.55, -4.82], 0.065, 8, [0.22, 0.22, 0.24]);
  for (const [x, r] of [[-8.1, 0.13], [-7.75, 0.1], [-7.4, 0.15]]) P.wallPan(F(x, yl + 2.03, -4.70, PI), { r }); // nail backs meet the wall
  P.table(F(-7.4, yl, -7.3, 0), { w: 1.4, d: 0.8 });
  P.bench(F(-7.4, yl, -7.88, 0), { l: 1.6 });
  P.chair(F(-7.9, yl, -6.65, PI)); P.chair(F(-6.9, yl, -6.65, PI));
  for (const [x, z] of [[-7.85, -7.45], [-7.3, -7.45], [-6.9, -7.05]]) { P.plate(F(x, yl + 0.76, z, 0), { r: 0.11, flat: true }); F(0, 0, 0).box('iron', x + 0.13, yl + 0.76, z - 0.06, x + 0.145, yl + 0.765, z + 0.08, [0.6, 0.6, 0.62]); }
  P.bowl(F(-7.55, yl + 0.76, -7.1, 0), { r: 0.13, h: 0.08, m: 'earthen' }); P.jug(F(-7.0, yl + 0.76, -7.55, 2.5), { r: 0.065, h: 0.2 });
  P.pot(F(-7.95, yl + 0.76, -7.0, 0.5), { r: 0.1, h: 0.12, col: [0.62, 0.6, 0.55] });
  P.loaf(F(-7.55, yl + 0.76, -7.5, 0.3)); // loaf on its board
  L.kitchen = new THREE.Vector3(-7.4, yl + 1.9, -7.3);
  flame(P.hangingLamp(F(-7.4, Y.beam, -7.3, 0), { drop: Y.beam - (yl + 1.89) }), 'kitchen'); // lamp over the table
  P.dresser(F(-3.95, yl, -5.75, -H), { w: 1.0, d: 0.5, h: 0.9 });
  const pr = F(-3.75, yl + 1.25, -5.75, -H);
  pr.box('wood', -0.5, 0, -0.08, 0.5, 0.03, 0.1, C.dark); pr.box('wood', -0.5, 0.42, -0.08, 0.5, 0.45, 0.1, C.dark); pr.box('wood', -0.5, 0, -0.1, 0.5, 0.6, -0.08, C.dark);
  pr.box('wood', -0.5, 0.11, 0.06, 0.5, 0.13, 0.08, C.dark); // plate rail
  for (let i = 0; i < 4; i++) P.plate(pr.sub(-0.36 + i * 0.24, 0.03, 0.0), { r: 0.105 });
  P.jug(pr.sub(-0.36, 0.45, 0.0, 0.3), { r: 0.06, h: 0.17 }); P.jug(pr.sub(0.36, 0.45, 0.0, -0.4), { r: 0.05, h: 0.14, m: 'earthen' });
  for (const x of [-0.16, -0.04]) P.mug(pr.sub(x, 0.45, 0.02, 0.8));
  for (let i = 0; i < 3; i++) P.bowl(pr.sub(0.14, 0.45 + i * 0.012, 0.0), { r: 0.085 - i * 0.008, h: 0.05 });
  { const cm = F(-3.95, yl + 0.94, -5.45, -H - 0.3); // coffee mill on the dresser: dovetailed box, drawer with a brass knob, brass hopper, crank
    cm.box('wood', -0.075, 0, -0.075, 0.075, 0.012, 0.075, C.dark); cm.box('wood', -0.068, 0.012, -0.068, 0.068, 0.115, 0.068, C.oak, { rotUV: true });
    cm.box('wood', -0.074, 0.112, -0.074, 0.074, 0.122, 0.074, C.dark); cm.box('wood', -0.05, 0.025, 0.066, 0.05, 0.075, 0.074, C.dark);
    cm.sph('brass', 0.008, [0, 0.05, 0.08], 1, C.brass); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cm.box('wood', sx * 0.068 - 0.006, 0.02, sz * 0.068 - 0.006, sx * 0.068 + 0.006, 0.11, sz * 0.068 + 0.006, C.dark);
    lathe(cm, 'brass', [[0.05, 0.12], [0.07, 0.15], [0.06, 0.16], [0.02, 0.14], [0, 0.14]], 12); cm.rod('iron', [0, 0.17, 0], [0.1, 0.19, 0], 0.005, 4, C.black); cm.rod('iron',[.1,.19,0],[.1,.215,0],.004,8,C.black); cm.sph('wood', 0.015, [0.1, 0.22, 0], 1, C.dark); }
  P.barrel(F(-4.25, yl, -7.75, 0), { r: 0.28, h: 0.75 }); // water
  P.bucketWood(F(-4.85, yl, -7.85, 0.4), { water: true });
  const wb = F(-8.65, yl, -5.8, 0); // firewood basket next to the chimney
  P.logBasket(wb);
  P.crucifix(F(-6.3, yl + 1.75, -8.1, 0), { s: 0.8 }); // over the table, clear of the pantry door
  P.sack(F(-8.7, yl, -7.75, 0.3), { s: 0.75, seed: 41 });

  /* ---------------- 5: Viktoria Gabriel with Cäzilia (7) and Josef (2) */
  P.bed(F(-2.0, yl, -3.48, 0), { w: 1.3, check: 'checkB', r: rng(7) });
  P.childBed(F(-0.65, yl, -3.85, 0));
  P.ragDoll(F(-0.62, yl + 0.458, -3.6, 0.3));
  P.pram(F(-3.2, yl, -3.55, 0));
  P.wardrobe(F(-5.21, yl, -3.4, H), { w: 1.2 });
  P.table(F(-2.9, yl, -0.83, 0), { w: 0.9, d: 0.6 });
  P.chair(F(-2.9, yl, -1.5, 0)); P.chair(F(-3.7, yl, -1.3, 0.6));
  L.r5 = P.tableLamp(F(-2.65, yl + 0.76, -0.8, 0)); P.lampGlass(F(-2.65, yl + 0.76, -0.8, 0)); flame(L.r5, 'r5');
  P.paperSheet(F(-2.87, yl + 0.761, -0.85, 0), { w: 0.2, h: 0.28, rot: [-H, 0, 0.2] });
  P.sewingBasket(F(-3.6, yl, -1.95, 0));
  P.dresser(F(-0.47, yl, -2.4, -H));
  P.crucifix(F(-2.0, yl + 1.75, -4.52, 0));
  P.picture(F(-0.65, yl + 1.55, -4.52, 0), { w: 0.2, h: 0.26 });
  k.box('base', 'linen_i', -3.0, yl, -2.8, -1.4, yl + 0.01, -2.0, [0.52, 0.5, 0.62]);

  /* ---------------- 6: pantry */
  const s6 = P.shelf(F(-2.2, yl, -4.88, PI), { w: 1.6, d: 0.35, h: 1.8, n: 5 });
  const r6 = rng(61);
  for (const y of s6) for (let x = -2.85; x < -1.6; x += 0.2 + r6() * 0.1) {
    const f = F(x, yl + y, -4.88 - (r6() - 0.5) * 0.1, 0);
    r6() < 0.4 ? P.crock(f, { r: 0.06 + r6() * 0.04, h: 0.14 + r6() * 0.1, seed: Math.floor(r6() * 9) }) : P.jar(f, { r: 0.05, h: 0.12 + r6() * 0.06, seed: Math.floor(r6() * 30) });
  }
  P.barrel(F(-0.65, yl, -7.6, 0), { r: 0.32, h: 0.85 }); P.barrel(F(-1.4, yl, -7.68, 0), { r: 0.26, h: 0.7, col: C.dark });
  P.crock(F(-2.15, yl, -7.75, 0), { r: 0.21, h: 0.5, lid: true, seed: 3 }); // sauerkraut crock with its board and stone
  P.sack(F(-3.15, yl, -5.6, 0.2), { seed: 61 }); P.sack(F(-3.1, yl, -5.15, -0.3), { s: 0.9, seed: 62, full: 0.8 });
  P.chest(F(-0.6, yl, -6.3, -H), { w: 1.0, d: 0.5, h: 0.6 }); // flour bin

  /* ---------------- 7: stable */
  const fs = F(0, 0, 0);
  P.manger(F(4.2, ys, -7.79, 0), { l: 6, d: 0.62, h: 0.62, rings: [-2.0, 0, 2.0] }); // manger along the north wall
  k.solid(1.2, -8.1, 7.2, -7.45, 0);
  for (const x of [1.2, 3.2, 5.2]) { // stall boards
    fs.box('plank', x - 0.04, ys, -7.48, x + 0.04, ys + 1.25, -5.2, [0.78, 0.7, 0.6]);
    fs.box('wood', x - 0.07, ys, -5.28, x + 0.07, ys + 1.45, -5.14, C.dark);
    k.solid(x - 0.06, -7.48, x + 0.06, -5.14, 0);
  }
  for (const [i, x] of [2.2, 4.2, 6.2].entries()) {
    k.solid(x - 0.4, -7.65, x + 0.4, -5.35, 0); // cow body (animated cows: farm_animals.js)
    P.strawBed(F(0, ys, 0), x - 0.93, -7.45, x + 0.93, -5.3, { h: 0.08, seed: 70 + i, m: 'hay', spill: 0.06 }); // straw bedding
  }
  k.box('base', 'plain_i', 1.2, ys, -5.15, 7.2, ys + 0.008, -4.75, [0.2, 0.17, 0.13]); // manure gutter
  // chickens: roost ladder + nest boxes by the chicken window
  const fc = F(0.9, ys, -1.0, 0);
  for (let i = 0; i < 3; i++) fc.rod('wood', [-0.55, 0.5 + i * 0.35, -0.55 + i * 0.12], [0.6, 0.5 + i * 0.35, -0.55 + i * 0.12], 0.03, 6, C.pine);
  for (const sx of [-0.6, 0.65]) fc.rod('wood', [sx, 0, -0.75], [sx, 1.3, -0.25], 0.035, 6, C.dark);
  fc.box('wood', -0.65, 0, 0.15, 0.65, 0.3, 0.48, C.dark); for (const x of [-0.65, -0.22, 0.22, 0.61]) fc.box('wood', x, 0.3, 0.15, x + 0.04, 0.52, 0.48, C.dark); fc.box('wood', -0.65, 0.3, 0.15, 0.65, 0.52, 0.18, C.dark); fc.box('wood', -0.65, 0.3, 0.44, 0.65, 0.36, 0.48, C.dark); // nest boxes
  for (const x of [-0.43, 0, 0.42]) { P.hayHeap(fc.sub(x, 0.3, 0.31), { rx: 0.17, rz: 0.13, h: 0.07, seed: 11 + Math.round(x * 10), m: 'hay', tufts: 6 }); fc.sph('plain', 0.022, [x + 0.03, 0.37, 0.33], [1, 1.3, 1], [0.95, 0.88, 0.78]); }
  fc.solid(-0.7, -0.8, 0.7, 0.5, 0);
  P.pitchfork(F(7.62, ys, -4.25, 0).sub(0, 0, 0, 0, [-0.2, 0, 0])); // leaning on the feed-room wall
  P.bucketWood(F(6.6, ys, -1.0, 0.7)); P.milkStool(F(7.1, ys, -1.05, 0.3));
  P.trough(F(9.6, ys, -0.95, 0), { l: 1.6, w: 0.5, h: 0.45 });
  L.stable = new THREE.Vector3(4.2, 2.25, -3.6);
  flame(P.hangingLamp(F(4.2, Y.beam, -3.6, 0), { drop: Y.beam - 2.17, shade: false }), 'stable');
  P.hayHeap(F(10.0, ys, -3.85, 0.1), { rx: 0.9, rz: 0.6, h: 0.75, seed: 14, m: 'hay_i' }); k.solid(9.25, -4.4, 10.75, -3.4, 0); // clear of the feed-room door

  /* ---------------- 8: feed room: feed bin along the west wall, sacks in the NW corner, root crate by the door; the way
     from the door to the foot of the loft stair (west side of its low end) stays clear */
  P.feedBin(F(7.72, ys, -6.55, H), { w: 1.5, d: 0.62, h: 0.78 });
  P.sack(F(7.68, ys, -7.82, 0.3), { seed: 81 }); P.sack(F(8.12, ys, -7.86, -0.2), { s: 0.95, seed: 82 }); P.sack(F(8.55, ys, -7.84, 0.5), { s: 0.9, seed: 83, lean: 0.15 });
  P.sack(F(8.45, ys, -7.38, 0.1), { s: 0.95, lie: true, seed: 84 });
  k.solid(7.4, -8.1, 8.85, -7.15, 0);
  P.rootCrate(F(9.45, ys, -5.0, 0), { w: 0.85, d: 0.5, h: 0.45, seed: 85 }); // potatoes
  P.bucketWood(F(8.95, ys, -5.05, 0.5));
  { const sv = F(7.38, ys + 1.45, -6.55, H); sv.rod('iron', [0, 0.1, 0], [0, 0.1, 0.06], 0.004, 3, C.black); // sieve on a nail above the bin
    sv.cyl('wood', 0.2, 0.2, 0.06, 18, [0, 0, 0.035], [H, 0, 0], C.oak, { open: true }); sv.cyl('iron', 0.195, 0.195, 0.004, 18, [0, 0, 0.03], [H, 0, 0], [0.45, 0.45, 0.47]); }
  P.strawLitter(F(0, ys, 0), 8.1, -7.1, 9.3, -5.4, { n: 10, seed: 86 });

  /* ---------------- 9: threshing floor */
  P.fodderCutter(F(12.4, ys, -3.4, H));
  P.hayHeap(F(12.6, ys, -12.6, 0), { rx: 1.2, rz: 1.8, h: 1.6, seed: 9, m: 'hay_i' }); k.solid(11.6, -14.2, 13.6, -11.0, 0);
  P.toolWall(F(11.45, ys, -7.0, H), { l: 2.0 });
  P.rake(F(11.84, ys, -8.6, H).sub(0, 0, 0, 0, [-0.2, 0, 0])); P.scythe(F(11.8, ys, -5.4, H).sub(0, 0, 0, 0, [-0.2, 0, 0]));
  P.sled(F(15.6, ys, -13.2, 0.2));
  for (const [i, [x, z]] of [[16.2, -9.8], [16.4, -10.4], [15.9, -10.2]].entries()) P.sack(F(x, ys, z, x * 3), { s: 1.05, seed: 90 + i });
  P.sack(F(16.1, ys, -11.0, 0.3), { lie: true, seed: 94 });
  P.barrel(F(16.3, ys, -12.0, 0), { r: 0.3, h: 0.8 });
  P.wheelbarrow(F(15.6, ys, 2.4, -0.6));
  P.strawBed(F(0, ys, 0), 11.45, -10.6, 13.3, -7.1, { h: 0.12, seed: 95, spill: 0.4 }); // loose straw

  /* ---------------- 10 / 11 */
  P.workbench(F(18.8, ys, -5.6, -H), { l: 1.8 }); // back edge 3 cm off the wall
  P.toolWall(F(19.15, ys, -6.1, -H), { l: 1.4 });
  P.barrel(F(17.5, ys, -7.3, 0), { r: 0.26, h: 0.7 }); P.bucketWood(F(17.4, ys, -3.95, 1.1));
  P.thresher(F(18.42, ys, 1.45, -H)); // drive side towards the way in; the gap along the west wall stays walkable
  

  /* ---------------- engine hut 12 */
  P.engine(F(2.5, ys, -13.9, 0));

  /* ---------------- attic: smokehouse at the chimney, grain over the dwelling, hay over the stable */
  const fa = (x, z, yaw = 0) => F(x, ya, z, yaw, 'attic');
  const sm = F(0, 0, 0, 0, 'attic'); // smokehouse x[-9.8, -8.2] z[-6.3, -4.5] round the chimney, clear of the hatch landing
  const sx0 = -9.8, sx1 = -8.2, sz0 = -6.3, sz1 = -4.5, sh = 2.1, y0 = ya, y1 = ya + sh, pc = [0.5, 0.44, 0.38], T = 0.04;
  sm.box('plank', sx0, y0, sz0, sx1, y1, sz0 + T, pc); sm.box('plank', sx0, y0, sz1 - T, sx1, y1, sz1, pc);
  sm.box('plank', sx0, y0, sz0 + T, sx0 + T, y1, sz1 - T, pc);
  sm.box('plank', sx1 - T, y0, sz0 + T, sx1, y1, -5.75, pc); sm.box('plank', sx1 - T, y0, -4.95, sx1, y1, sz1 - T, pc);
  sm.box('plank', sx1 - T, y0 + 1.85, -5.75, sx1, y1, -4.95, pc);
  sm.box('plank', sx0, y1, sz0, sx1, y1 + T, sz1, [0.45, 0.4, 0.34]);
  for (const x of [sx0 + 0.02, sx1 - 0.02]) for (const z of [sz0 + 0.02, sz1 - 0.02]) sm.box('wood', x - 0.045, y0, z - 0.045, x + 0.045, y1, z + 0.045, C.dark); // corner posts
  sm.box('plank', sx1 - 0.01, y0 + 0.01, -5.73, sx1 + 0.025, y0 + 1.83, -4.97, [0.4, 0.34, 0.3]); // its door
  sm.box('iron', sx1 + 0.025, y0 + 1.0, -5.1, sx1 + 0.045, y0 + 1.05, -5.0, C.black);
  for (const z of [-5.9, -5.0]) { sm.rod('wood', [-9.76, y0 + 1.95, z], [-8.95, y0 + 1.95, z], 0.02, 6, C.dark); for (const [i, x] of [-9.5, -9.2].entries()) P.ham(sm.sub(x, y0 + 1.95, z), { seed: i + (z < -5.5 ? 3 : 7) }); } // hams (seen through cracks)
  k.solid(sx0, sz0, sx1 + 0.05, sz1, 1);
  k.solid(CHIMNEY.x0, CHIMNEY.z0, CHIMNEY.x1, CHIMNEY.z1, 1);
  // grain heaps + sacks + junk over the dwelling
  const grain = (x, z, rx, rz, h, seed) => { P.hayHeap(fa(x, z), { rx, rz, h, col: [0.95, 0.8, 0.48], seed, m: 'grain' }); k.solid(x - rx * 0.75, z - rz * 0.75, x + rx * 0.75, z + rz * 0.75, 1); };
  grain(-12.0, -2.4, 1.2, 0.8, 0.42, 31); grain(-11.6, -6.6, 1.3, 0.75, 0.45, 32); grain(-4.6, -2.3, 1.4, 0.75, 0.38, 33); grain(-2.6, -6.7, 1.1, 0.7, 0.4, 34);
  const ra = rng(41);
  for (let i = 0; i < 9; i++) P.sack(fa(-7.2 + (i % 5) * 0.42 + ra() * 0.1, -6.95 - Math.floor(i / 5) * 0.4, ra() * 3), { s: 0.95 + ra() * 0.15, lean: (ra() - 0.5) * 0.2, seed: 100 + i });
  k.solid(-7.45, -7.5, -5.2, -6.65, 1);
  P.barrel(fa(-13.0, -4.3), { r: 0.28, h: 0.75 }); P.barrel(fa(-12.95, -5.0), { r: 0.25, h: 0.65, col: C.dark });
  P.chest(fa(-10.4, -1.75, PI), { w: 0.9, d: 0.45 });
  const cr = fa(-1.2, -1.9, 0.3); cr.box('wood', -0.4, 0, -0.3, 0.4, 0.45, 0.3, C.dark); cr.solid(-0.4, -0.3, 0.4, 0.3, 1);
  P.chair(fa(-0.4, -6.6, 2.4)); P.ladder(fa(-13.4, -6.0, H).sub(0, 0, 0, 0, [0, 0, -1.25]), { len: 2.2 });
  // hay over the stable: big heaps along both slopes, a path in the middle
  const hay = (x, z, rx, rz, h, seed, g = 'attic') => { P.hayHeap(F(x, ya, z, seed, g), { rx, rz, h, seed, m: 'hay_i' }); k.solid(x - rx * 0.8, z - rz * 0.7, x + rx * 0.8, z + rz * 0.7, 1); };
  for (const [i, x] of [1.6, 4.4, 7.2].entries()) { hay(x, -2.0, 1.6, 1.2, 1.35, 50 + i); hay(x + 0.5, -6.75, 1.7, 1.15, 1.45, 60 + i); }
  hay(9.4, -2.1, 1.0, 1.0, 1.2, 66);
  P.strawBed(F(0, ya, 0, 0, 'attic'), 0.4, -7.7, 9.8, -1.0, { h: 0.08, seed: 99, n: 260 });
  // barn loft: hay up under the roof, the hidden nest in the far corner
  hay(12.7, -12.8, 1.2, 1.9, 1.7, 71); hay(12.7, -9.6, 1.1, 1.2, 1.5, 72); hay(12.7, 1.6, 1.15, 1.9, 1.6, 73); hay(12.6, -1.8, 1.0, 1.0, 1.3, 74);
  hay(12.15, -6.5, 0.75, 0.8, 1.1, 75);
  const ns = F(12.75, ya, -7.55, 0.3, 'attic'); // the nest: trampled hollow, horse blanket, tin, crusts
  P.hayHeap(ns.sub(-0.55, 0, 0.0), { rx: 0.5, rz: 0.9, h: 0.75, seed: 81, m: 'hay_i' });
  P.hayHeap(ns.sub(0.0, 0, -0.55), { rx: 0.8, rz: 0.4, h: 0.6, seed: 82, m: 'hay_i' });
  ns.part('hay', new THREE.CircleGeometry(0.62, 12), { pos: [0, 0.07, 0], rot: [-H, 0, 0], col: [0.62, 0.55, 0.42] });
  ns.part('linen', new THREE.PlaneGeometry(0.95, 1.2, 4, 4), { pos: [0.05, 0.1, 0.05], rot: [-H + 0.08, 0, 0.25], col: [0.36, 0.28, 0.22] });
  ns.cyl('iron', 0.045, 0.045, 0.11, 8, [0.42, 0.12, 0.4], [0, 0, 0], [0.5, 0.48, 0.44]);
  ns.sph('plain', 0.04, [0.3, 0.1, 0.52], [1.4, 0.6, 1], [0.6, 0.45, 0.3]);
  ns.sph('plain', 0.03, [0.2, 0.1, 0.6], [1.6, 0.6, 1], [0.6, 0.45, 0.3]);
  k.solid(12.1, -8.3, 13.3, -6.95, 1);
  ctx.nest = ns.wpos(0, 0.3, 0);
}
