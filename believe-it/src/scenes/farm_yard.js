// Hinterkaifeck — the yard and surroundings: wagon shed, engine hut (12), cellar entrance, house bench + milk cans + handcart,
// well with pump and trough, kennel, starling pole with three cast-iron posts, manure heap, woodpile + chopping block,
// split-rail fences, bare fruit trees. Everything goes into the "world" group (never cut away).
import * as THREE from 'three';
import { Y, YARD } from './farm_plan.js';
import { slabGeo } from './farm_kit.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as P from './farm_props.js';
import { stackedWood } from './farm_details.js';
import { rng, lerp, clamp, valueNoise } from '../engine/util.js';

const { Frame, C } = P;
const V3 = THREE.Vector3, PI = Math.PI, H = PI / 2;

function orient(pts, n) { const a = pts[0], b = pts[1], c = pts[2]; return new V3().subVectors(b, a).cross(new V3().subVectors(c, a)).dot(n) < 0 ? pts.slice().reverse() : pts; }
function slab(k, pts, n, th, mTop, mBot, mSide, uv, colTop = [1, 1, 1], colBot = [0.7, 0.62, 0.55]) {
  const g = slabGeo(orient(pts, n), n.clone().normalize(), th, uv);
  k.raw('world', mTop, g.top, colTop); k.raw('world', mBot, g.bottom, colBot); k.raw('world', mSide, g.side, C.dark);
}

export function buildYard(ctx) {
  const k = ctx.kit, r = rng(501);
  const F = (x, y, z, yaw = 0) => new Frame(k, 'world', x, y, z, yaw, false);
  const pv = (x, y, z) => new V3(x, y, z);

  /* ---------------- wagon shed: open to the east, mono-pitch board roof with snow */
  const S = YARD.shed, yl = 2.3, yh = 3.05;
  const rf = (x) => lerp(yl, yh, (x - S.x0) / (S.x1 - S.x0));
  const fs = F(0, 0, 0);
  for (const z of [S.z0, (S.z0 + S.z1) / 2, S.z1]) { fs.box('wood', S.x1 - 0.18, 0, z - 0.09, S.x1, rf(S.x1) - 0.05, z + 0.09, C.dark); k.solid(S.x1 - 0.2, z - 0.11, S.x1 + 0.02, z + 0.11, 0); }
  fs.box('plank', S.x0, 0, S.z0, S.x0 + 0.06, yl, S.z1, [0.66, 0.6, 0.54]); k.solid(S.x0 - 0.05, S.z0, S.x0 + 0.1, S.z1, 0);
  for (const z of [S.z0, S.z1]) {
    const g = slabGeo(orient([pv(S.x0 + 0.06, 0, z), pv(S.x1 - 0.18, 0, z), pv(S.x1 - 0.18, rf(S.x1 - 0.18), z), pv(S.x0 + 0.06, rf(S.x0 + 0.06), z)], new V3(0, 0, z > S.z0 ? 1 : -1)), new V3(0, 0, z > S.z0 ? 1 : -1), 0.05, (p) => [p.x, p.y]);
    k.raw('world', 'plank', g.top, [0.66, 0.6, 0.54]); k.raw('world', 'plank', g.bottom, [0.5, 0.45, 0.4]); k.raw('world', 'plank', g.side, C.dark);
    k.solid(S.x0, z - 0.06, S.x1 - 0.18, z + 0.06, 0);
  }
  fs.box('wood', S.x1 - 0.2, rf(S.x1) - 0.2, S.z0 - 0.1, S.x1, rf(S.x1) - 0.04, S.z1 + 0.1, C.dark); // header beam
  const rn = new V3(-(yh - yl) / (S.x1 - S.x0), 1, 0);
  slab(k, [pv(S.x0 - 0.35, rf(S.x0 - 0.35) + 0.06, S.z0 - 0.4), pv(S.x1 + 0.45, rf(S.x1 + 0.45) + 0.06, S.z0 - 0.4), pv(S.x1 + 0.45, rf(S.x1 + 0.45) + 0.06, S.z1 + 0.4), pv(S.x0 - 0.35, rf(S.x0 - 0.35) + 0.06, S.z1 + 0.4)], rn, 0.07, 'plank', 'plank', 'wood', (p) => [p.z, p.x], [0.6, 0.56, 0.52]);
  slab(k, [pv(S.x0 - 0.3, rf(S.x0 - 0.3) + 0.1, S.z0 - 0.3), pv(S.x0 + 3.4, rf(S.x0 + 3.4) + 0.1, S.z0 - 0.1), pv(S.x0 + 4.4, rf(S.x0 + 4.4) + 0.1, S.z1 - 1.2), pv(S.x0 - 0.3, rf(S.x0 - 0.3) + 0.1, S.z1 + 0.3)], rn, 0.03, 'snow', 'snow', 'snow', (p) => [p.x / 2, p.z / 2], [0.95, 0.96, 1.0], [0.9, 0.9, 0.95]);
  P.cart(F(-16.5, 0, 6.3, H));
  stackedWood(F(S.x0+.4,0,S.z0+1.38,H),{cols:13,rows:7,r:.085,l:.56,seed:721});
  k.solid(S.x0 + 0.1, S.z0 + 0.15, S.x0 + 0.7, S.z0 + 2.6, 0);
  P.ladder(F(S.x0 + 0.2, 0, S.z1 - 0.4, H).sub(0, 0, 0, 0, [0.08, 0, 0]), { len: 2.1 });

  /* ---------------- engine hut (12): brick, tiled gable roof, door only from outside (east) */
  const hx0 = 1, hx1 = 4, hz0 = -15.5, hz1 = -12.3, he = 2.5, hp = 0.7, hrz = (hz0 + hz1) / 2, hrY = he + hp * (hz1 - hz0) / 2;
  const B = (x0, z0, x1, z1, y1, y0 = 0) => { k.box('world', 'brick', x0, y0, z0, x1, y1, z1, [0.92, 0.88, 0.86], { seg: 1 }); };
  B(hx0, hz0, hx1, hz0 + 0.3, he); B(hx0, hz1 - 0.3, hx1, hz1, he);
  B(hx0, hz0 + 0.3, hx0 + 0.3, hz1 - 0.3, he);
  B(hx1 - 0.3, hz0 + 0.3, hx1, -14.35, he); B(hx1 - 0.3, -13.45, hx1, hz1 - 0.3, he); B(hx1 - 0.3, -14.35, hx1, -13.45, he, 1.95 + 0.05);
  // Wall colliders leave the real east doorway open; the old solid rectangle prevented entering the hut.
  k.solid(hx0,hz0,hx1,hz0+.3,0);k.solid(hx0,hz1-.3,hx1,hz1,0);
  k.solid(hx0,hz0+.3,hx0+.3,hz1-.3,0);
  k.solid(hx1-.3,hz0+.3,hx1,-14.35,0);k.solid(hx1-.3,-13.45,hx1,hz1-.3,0);
  k.box('world','flag',hx0+.3,0,hz0+.3,hx1-.3,Y.stab,hz1-.3,[.64,.60,.53]);
  ctx.floors.push({x0:hx0+.3,z0:hz0+.3,x1:hx1-.3,z1:hz1-.3,y:Y.stab,lvl:0});
  k.box('world', 'plain', 2.2, 1.3, hz1 - 0.05, 2.8, 1.8, hz1 + 0.005, [0.1, 0.1, 0.11]); // small dark window towards the house
  k.box('world', 'wood', 2.15, 1.25, hz1, 2.85, 1.31, hz1 + 0.06, C.dark);
  const flueX = 1.6, flueZ = -14.6, hole = .10;
  for (const [z0, z1, n] of [[hz1 + 0.35, hrz, new V3(0, 1, hp)], [hrz, hz0 - 0.35, new V3(0, 1, -hp)]]) {
    const roofY = z => hrY - hp * Math.abs(z - hrz);
    const patch = (x0,x1,za,zb) => slab(k, [pv(x0,roofY(za),za),pv(x1,roofY(za),za),pv(x1,roofY(zb),zb),pv(x0,roofY(zb),zb)], n, .18, 'roof', 'wood', 'wood', p => [p.x,p.y*1.7]);
    if (z1 < hrz) { // actual opening through the rear roof slope, covered by the flashing below
      patch(hx0-.3,flueX-hole,z0,z1); patch(flueX+hole,hx1+.3,z0,z1);
      // The slab's underside shifts +z by .18*sin(atan(hp)); reserve that thickness too.
      const undersideShift = .18*hp/Math.sqrt(1+hp*hp);
      patch(flueX-hole,flueX+hole,z0,flueZ+hole); patch(flueX-hole,flueX+hole,flueZ-hole-undersideShift,z1);
    } else patch(hx0-.3,hx1+.3,z0,z1);
  }
  for (const x of [hx0, hx1 - 0.3]) {
    const g = slabGeo(orient([pv(x, he, hz0), pv(x, hrY - 0.06, hrz), pv(x, he, hz1)], new V3(x < 2 ? -1 : 1, 0, 0)), new V3(x < 2 ? -1 : 1, 0, 0), 0.3, (p) => [p.z, p.y]);
    k.raw('world', 'brick', g.top, [0.92, 0.88, 0.86]); k.raw('world', 'brick', g.bottom, [0.92, 0.88, 0.86]); k.raw('world', 'brick', g.side, [0.9, 0.86, 0.84]);
  }
  const fh = F(0, 0, 0);
  // Use the motor's local outlet to join its exhaust to the hut flue without a gap.
  const motor = F(2.5,Y.stab,-13.9), outlet = motor.wpos(...P.ENGINE_EXHAUST_END);
  const elbowTop = new V3(flueX,outlet.y+.15,flueZ), iron = [.25,.24,.24];
  const elbow = new THREE.QuadraticBezierCurve3(outlet,new V3(flueX,outlet.y,flueZ),elbowTop);
  fh.part('iron',new THREE.TubeGeometry(elbow,12,.035,8,false),{col:iron,uv:'keep',smooth:true});
  fh.cyl('iron',.041,.041,.055,10,outlet.toArray(),[0,0,H],iron); // socket at the engine outlet
  const stackBase = elbowTop.y+.16;
  fh.cyl('iron',.035,.06,.16,10,[flueX,elbowTop.y+.08,flueZ],[0,0,0],iron,{open:true}); // reducer
  fh.rod('iron',[flueX,stackBase,flueZ],[flueX,3.9,flueZ],.06,12,iron,{open:true});
  // Bolted wall clamp carries the stack; the pipe stays clear of the brick and shelf.
  fh.box('iron',1.298,2.06,flueZ-.08,1.32,2.24,flueZ+.08,iron);
  fh.rod('iron',[1.31,2.15,flueZ],[flueX,2.15,flueZ],.013,8,iron);
  fh.part('iron',new THREE.TorusGeometry(.065,.008,6,16),{pos:[flueX,2.15,flueZ],rot:[H,0,0],col:iron,uv:'keep'});
  for(const y of [2.085,2.215])fh.cyl('iron',.01,.01,.008,6,[1.324,y,flueZ],[0,0,H],C.black);
  const roofAtFlue = hrY-hp*Math.abs(flueZ-hrz);
  fh.part('iron',new THREE.RingGeometry(.08,.30,20),{pos:[flueX,roofAtFlue+.004,flueZ],rot:[-H-Math.atan(hp),0,0],col:iron,uv:'keep'});
  P.lathe(fh,'iron',[[.11,0],[.11,.02],[.068,.19],[.06,.19]],16,{pos:[flueX,roofAtFlue-.035,flueZ],col:iron}); // raised flashing collar
  for(const a of [0,2*PI/3,4*PI/3])fh.rod('iron',[flueX+Math.cos(a)*.057,3.86,flueZ+Math.sin(a)*.057],[flueX+Math.cos(a)*.057,4.015,flueZ+Math.sin(a)*.057],.004,6,iron);
  fh.cyl('iron',.11,.025,.035,12,[flueX,4.03,flueZ],[0,0,0],iron); // rain cap leaves an open vent below

  /* ---------------- cellar entrance under Viktoria's windows: low lean-to with a plank lid, little fence */
  const c = YARD.cellar;
  for (const x of [c.x0, c.x1 - 0.25]) { k.box('world', 'stone', x, 0, c.z0, x + 0.25, 0.75, c.z1 - 0.3, [0.86, 0.84, 0.82]); }
  slab(k, [pv(c.x0 - 0.08, 1.12, c.z0), pv(c.x1 + 0.08, 1.12, c.z0), pv(c.x1 + 0.08, 0.66, c.z1 - 0.2), pv(c.x0 - 0.08, 0.66, c.z1 - 0.2)], new V3(0, 1, 0.46 / 2.1), 0.06, 'plank', 'plank', 'wood', (p) => [p.x, p.z], [0.62, 0.56, 0.5]);
  const fc = F((c.x0 + c.x1) / 2, 0, c.z1 - 0.2, 0);
  fc.box('plank', -0.95, 0, -0.06, 0.95, 0.66, 0.0, [0.55, 0.5, 0.45]);
  fc.box('iron', -0.02, 0.25, 0.0, 0.02, 0.45, 0.03, C.black);
  for (let x = c.x0 - 0.25; x <= c.x1 + 0.26; x += 0.16) { const f = F(x, 0, c.z1 + 0.25, 0); f.box('wood', -0.025, 0, -0.012, 0.025, 0.85 + Math.sin(x * 7) * 0.03, 0.012, [0.62, 0.58, 0.52]); }
  for (const y of [0.25, 0.65]) k.box('world', 'wood', c.x0 - 0.3, y, c.z1 + 0.2, c.x1 + 0.3, y + 0.05, c.z1 + 0.23, C.dark);
  k.solid(c.x0 - 0.3, c.z0, c.x1 + 0.3, c.z1 + 0.3, 0);

  /* ---------------- house bench under the old couple's windows, milk cans waiting for the dairy cart, a handcart */
  const [sx, sz] = YARD.sand;
  P.bench(F(sx, 0, 0.3, 0), { l: 1.9 });
  for (const [dx, dz, a] of [[-1.35, 0.42, 0.3], [-1.0, 0.5, 1.4]]) milkCan(F(sx + dx, 0, dz, a));
  k.solid(sx - 1.55, 0.2, sx - 0.8, 0.72, 0);
  handcart(F(sx + 0.6, 0, sz + 0.75, -0.35));
  k.solid(sx - 0.15, sz + 0.05, sx + 1.35, sz + 1.45, 0);

  /* ---------------- well with pump, trough, buckets */
  const [wx, wz] = YARD.well;
  P.wellPump(F(wx, 0, wz, 0));
  P.trough(F(wx + 1.45, 0, wz + 0.15, 0), { l: 1.6, w: 0.55, h: 0.5, m: 'stone', col: [0.8, 0.78, 0.76] });
  k.box('world', 'snow', wx + 0.7, 0.5, wz - 0.07, wx + 2.2, 0.51, wz + 0.37, [0.75, 0.8, 0.88]); // ice in the trough
  P.bucketWood(F(wx - 0.4, 0, wz + 0.85, 0)); P.bucketWood(F(wx + 0.45, 0.76, wz + 0.15, 0), { col: C.dark });

  /* ---------------- kennel (dog is placed by the scene) */
  const [kx, kz] = YARD.kennel, fk = F(kx, 0, kz, -0.5), KW = 0.86, KD = 1.05, KH = 0.7;
  for (const x of [-0.33, 0.33]) fk.box('wood', x - 0.035, 0, -KD / 2 - 0.05, x + 0.035, 0.07, KD / 2 + 0.05, C.dark);
  fk.box('plank', -KW / 2, 0.07, -KD / 2, KW / 2, 0.07 + KH, KD / 2, [0.92, 0.84, 0.74]);
  for (const s of [-1, 1]) fk.obox('plank', KW / 2 + 0.12, 0.04, KD + 0.2, [s * 0.24, 0.07 + KH + 0.2, 0], [0, 0, -s * 0.72], [0.78, 0.72, 0.65]);
  const gab = slabGeo(orient([new V3(-KW / 2, 0, 0), new V3(KW / 2, 0, 0), new V3(0, 0.34, 0)], new V3(0, 0, 1)), new V3(0, 0, 1), KD, (p) => [p.x, p.y]);
  for (const g of [gab.top, gab.bottom, gab.side]) { g.applyMatrix4(fk.M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.07 + KH, KD / 2))); k.raw('world', 'plank', g, [0.86, 0.78, 0.69]); }
  fk.part('plain', new THREE.PlaneGeometry(0.42, 0.42), { pos: [0, 0.07 + 0.21, KD / 2 + 0.004], col: [0.05, 0.045, 0.04] });
  fk.part('plain', new THREE.CircleGeometry(0.21, 8, 0, PI), { pos: [0, 0.07 + 0.42, KD / 2 + 0.004], col: [0.05, 0.045, 0.04] });
  fk.cyl('iron', 0.12, 0.09, 0.06, 8, [-0.62, 0.03, KD / 2 + 0.3], [0, 0, 0], [0.55, 0.58, 0.63]); // tin bowl
  fk.box('wood', -0.18, 0.07, KD / 2 - 0.02, 0.18, 0.1, KD / 2 + 0.12, [1.1, 0.95, 0.6]); // straw at the door
  fk.solid(-KW / 2 - 0.05, -KD / 2 - 0.05, KW / 2 + 0.05, KD / 2 + 0.05, 0);
  ctx.dogAt = fk.wpos(0.15, 0, KD / 2 + 0.55); ctx.dogYaw = -0.5;

  /* ---------------- starling box on a pole + three cast-iron posts */
  const [px, pz] = YARD.pole, fp = F(px, 0, pz, 0.4);
  fp.cyl('wood', 0.07, 0.055, 5.4, 7, [0, 2.7, 0], [0, 0, 0], [0.62, 0.56, 0.5]);
  fp.box('plank', -0.13, 5.25, -0.12, 0.13, 5.6, 0.12, [0.66, 0.6, 0.52]);
  for (const s of [-1, 1]) fp.obox('plank', 0.2, 0.025, 0.32, [s * 0.085, 5.67, 0], [0, 0, -s * 0.6], [0.55, 0.5, 0.45]);
  fp.part('plain', new THREE.CircleGeometry(0.035, 8), { pos: [0, 5.47, 0.122], col: [0.05, 0.05, 0.05] });
  k.solid(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12, 0);
  for (const dx of [-1.2, 0.0, 1.2]) {
    const f = F(px + dx, 0, pz - 1.1, 0);
    f.cyl('iron', 0.075, 0.065, 0.95, 10, [0, 0.475, 0], [0, 0, 0], [0.24, 0.24, 0.25]);
    f.cyl('iron', 0.09, 0.09, 0.05, 10, [0, 0.95, 0], [0, 0, 0], [0.22, 0.22, 0.23]);
    f.sph('iron', 0.065, [0, 1.0, 0], 1, [0.22, 0.22, 0.23]);
    f.part('iron', new THREE.TorusGeometry(0.06, 0.012, 4, 10), { pos: [0, 0.78, 0.08], col: [0.2, 0.18, 0.17], uv: 'keep' });
    k.solid(px + dx - 0.09, pz - 1.19, px + dx + 0.09, pz - 1.01, 0);
  }

  /* ---------------- manure heap: stone curb on three sides, paved base, a stacked, lumpy heap of straw dung with loose stalks,
     a plank ramp for the barrow from the stable side, the pitchfork stuck in the top, the slurry pit lid beside it */
  const M = YARD.manure, mx = (M.x0 + M.x1) / 2, mz = (M.z0 + M.z1) / 2;
  k.box('world', 'flag', M.x0, -0.02, M.z0 - 0.3, M.x1, 0.025, M.z1, [0.46, 0.42, 0.38]);
  k.box('world', 'stone', M.x0 - 0.28, 0, M.z0 - 0.3, M.x0, 0.46, M.z1 + 0.28, [0.8, 0.78, 0.76]);
  k.box('world', 'stone', M.x1, 0, M.z0 - 0.3, M.x1 + 0.28, 0.46, M.z1 + 0.28, [0.8, 0.78, 0.76]);
  k.box('world', 'stone', M.x0, 0, M.z1, M.x1, 0.46, M.z1 + 0.28, [0.8, 0.78, 0.76]);
  k.solid(M.x0 - 0.28, M.z0 - 0.3, M.x1 + 0.28, M.z1 + 0.28, 0);
  manureHeap(k, M, mx, mz + 0.1, r);
  const ramp = F(mx - 0.55, 0, M.z0 - 0.75, 0).sub(0, 0, 0, 0, [-0.62, 0, 0]);
  ramp.box('plank', -0.17, 0, 0, 0.17, 0.045, 1.75, [0.6, 0.54, 0.48]);
  for (const z of [0.4, 0.85, 1.3]) ramp.box('wood', -0.17, 0.045, z, 0.17, 0.07, z + 0.04, C.dark);
  P.pitchfork(F(mx + 0.55, 2.4, mz + 0.25, 0.4).sub(0, 0, 0, 0, [PI - 0.3, 0, 0.12])); // tines down in the heap
  const lid = F(M.x1 + 0.95, 0, M.z0 + 0.2, 0.1); // slurry pit (Odelgrube) lid
  lid.box('plank', -0.48, 0, -0.48, 0.48, 0.06, 0.48, [0.52, 0.46, 0.4]);
  for (const x of [-0.3, 0.3]) lid.box('wood', x - 0.05, 0.06, -0.45, x + 0.05, 0.1, 0.45, C.dark);
  lid.part('iron', new THREE.TorusGeometry(0.06, 0.012, 4, 10), { pos: [0, 0.075, 0.2], rot: [-H, 0, 0], col: C.black, uv: 'keep' });
  k.solid(M.x1 + 0.45, M.z0 - 0.3, M.x1 + 1.45, M.z0 + 0.7, 0);

  /* ---------------- woodpile under a board roof, chopping block (axe added by the scene) */
  const [wpx, wpz] = YARD.wood;
  stackedWood(F(wpx,0,wpz),{cols:14,rows:8,r:.085,l:.55,seed:722});
  const fw = F(wpx, 0, wpz, 0);
  for (const dx of [-1.38, 1.38]) for (const dz of [-0.36, 0.36]) fw.box('wood', dx - 0.045, 0, dz - 0.045, dx + 0.045, 1.42, dz + 0.045, [0.5, 0.46, 0.42]);
  fw.obox('plank', 2.9, 0.06, 0.95, [0, 1.47, 0], [0.12, 0, 0], [0.6, 0.55, 0.5]);
  fw.obox('snow', 2.8, 0.05, 0.85, [0, 1.52, 0.0], [0.12, 0, 0], [1, 1, 1]);
  k.solid(wpx - 1.45, wpz - 0.42, wpx + 1.45, wpz + 0.42, 0);
  const [bx, bz] = YARD.block, fb = F(bx, 0, bz, 0);
  fb.cyl('bark', 0.31, 0.27, 0.48, 9, [0, 0.24, 0], [0, 0, 0], [1, 1, 1], { open: true });
  fb.part('ring', new THREE.CircleGeometry(0.27, 9), { pos: [0, 0.481, 0], rot: [-H, 0, 0], col: [1, 1, 1], uv: 'keep' });
  for (const [dx, dz, a] of [[0.55, 0.3, 0.4], [-0.5, 0.42, 1.9], [0.3, -0.55, 2.6], [0.75, -0.1, 1.0]]) fb.obox('bark', 0.13, 0.12, 0.4, [dx, 0.06, dz], [0, a, 0.12], [1, 1, 1]);
  k.solid(bx - 0.3, bz - 0.3, bx + 0.3, bz + 0.3, 0);
  ctx.blockTop = new V3(bx, 0.48, bz);

  /* ---------------- split-rail fences with snow on the posts */
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4)), ang = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) {
      const x = lerp(x0, x1, i / n), z = lerp(z0, z1, i / n), h = 1.12 + (r() - 0.5) * 0.14, f = F(x, 0, z, r() * 0.5);
      f.box('wood', -0.06, -0.1, -0.06, 0.06, h, 0.06, [0.52, 0.48, 0.44], { rot: [0, 0, (r() - 0.5) * 0.06] });
      f.box('snow', -0.075, h - 0.02, -0.075, 0.075, h + 0.03, 0.075, [1, 1, 1]);
    }
    for (const y of [0.45, 0.88]) F((x0 + x1) / 2, y + (r() - 0.5) * 0.04, (z0 + z1) / 2, -ang).box('wood', -len / 2, -0.035, -0.03, len / 2, 0.035, 0.03, [0.5, 0.46, 0.42]);
    k.solid(Math.min(x0, x1) - 0.08, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, Math.max(z0, z1) + 0.08, 0);
  };
  const Y0 = YARD;
  fence(Y0.fenceW, Y0.fenceS, 7.5, Y0.fenceS); fence(13.5, Y0.fenceS, Y0.fenceE, Y0.fenceS);
  fence(Y0.fenceW, Y0.fenceN, -1.5, Y0.fenceN); fence(6.0, Y0.fenceN, 10.6, Y0.fenceN); fence(20.0, Y0.fenceN, Y0.fenceE, Y0.fenceN);
  fence(Y0.fenceW, Y0.fenceN, Y0.fenceW, -2.0); fence(Y0.fenceW, 2.0, Y0.fenceW, Y0.fenceS);
  fence(Y0.fenceE, Y0.fenceN, Y0.fenceE, Y0.fenceS);

  /* ---------------- bare fruit trees (orchard round the house) */
  for (const [x, z, s, h] of [[-17.8, -3.6, 1, 4.6], [-20.6, 1.2, 2, 4.0], [-19.2, 12.4, 3, 4.8], [-10.2, 13.0, 4, 4.2], [-1.8, 13.2, 5, 3.8], [22.3, -4.6, 6, 4.6], [21.8, 8.6, 7, 4.2], [-6.4, -11.3, 8, 4.4], [7.3, -11.9, 9, 3.9], [-20.2, -8.6, 10, 4.5], [-14.6, -10.4, 11, 4.1]]) {
    P.fruitTree(F(x, 0, z, s), { seed: s, h });
  }
}

// stacked manure heap as a height field over a rounded-rectangle footprint: steep sides with layer bands, a lumpy domed top,
// darker wet foot; loose straw stalks poke out; two forkfuls of fresh bedding on top
function manureHeap(k, M, cx, cz, r) {
  const a = (M.x1 - M.x0) / 2 - 0.12, b = (M.z1 - M.z0) / 2 - 0.12, H0 = 1.18, n1 = valueNoise(951, 16, 16), n2 = valueNoise(952, 32, 32);
  const hAt = (x, z) => {
    const u = (x - cx) / a, v = (z - cz) / b, d = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
    const lumpy = (n1(x * 1.4 + 3, z * 1.4 + 3) - 0.5) * 0.26 + (n2(x * 4.2, z * 4.2) - 0.5) * 0.13 + (n2(x * 9 + 5, z * 9 + 2) - 0.5) * 0.06;
    const e = clamp((1.0 + lumpy * 0.35 - d) / 0.3, 0, 1);
    if (e <= 0) return 0;
    const dome = 1 - d * d * 0.12, front = z < cz - b * 0.6 ? 1 - clamp((cz - b * 0.6 - z) / (b * 0.5), 0, 0.35) : 1; // trampled ramp side
    return H0 * Math.pow(e, 0.6) * dome * front + lumpy * e * 0.9;
  };
  const S = 0.1, xs = [], zs = [];
  for (let x = M.x0 - 0.02; x <= M.x1 + 0.021; x += S) xs.push(Math.min(x, M.x1));
  for (let z = M.z0 - 0.3; z <= M.z1 + 0.001; z += S) zs.push(Math.min(z, M.z1));
  const hs = zs.map((z) => xs.map((x) => hAt(x, z)));
  const Pp = [], Cc = [];
  const col = (y, x, z) => { const band = 0.94 + Math.sin(y * 21 + n1(x * 3, z * 3) * 3) * 0.06, foot = y < 0.25 ? 0.72 + y * 1.1 : 1, top = y > H0 * 0.92 ? 1.12 : 1; const t = band * foot * top; return [0.6 * t, 0.5 * t, 0.42 * t]; };
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    if (q.every(([ii, jj]) => hs[jj][ii] <= 0.001)) continue;
    const V = q.map(([ii, jj]) => [xs[ii], hs[jj][ii] - 0.015, zs[jj]]);
    for (const t of [[0, 2, 1], [0, 3, 2]]) for (const ix of t) { Pp.push(...V[ix]); Cc.push(...col(V[ix][1], V[ix][0], V[ix][2])); }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3));
  g = mergeVertices(g, 1e-4); g.computeVertexNormals();
  const out = k.part('world', 'dung', g, { smooth: true, texel: 1.5 });
  // per-vertex colours (part() painted one colour)
  const op = out.attributes.position, oc = out.attributes.color;
  for (let i = 0; i < op.count; i++) { const c = col(op.getY(i), op.getX(i), op.getZ(i)); oc.setXYZ(i, c[0], c[1], c[2]); }
  // straw stalks sticking out of the flanks and the top
  const f = new Frame(k, 'world', 0, 0, 0, 0, false);
  for (let i = 0; i < 90; i++) {
    const x = cx + (r() - 0.5) * a * 1.9, z = cz + (r() - 0.5) * b * 1.9, y = hAt(x, z);
    if (y < 0.08) continue;
    const L = 0.1 + r() * 0.22, ax = (r() - 0.5) * 2.2, az = (r() - 0.5) * 2.2, t = r();
    const c = t < 0.5 ? [0.55, 0.44, 0.3] : t < 0.85 ? [0.72, 0.6, 0.4] : [0.4, 0.32, 0.22];
    f.rod('hay', [x, y - 0.03, z], [x + Math.sin(ax) * L, y - 0.03 + Math.cos(Math.max(Math.abs(ax), Math.abs(az))) * L * 0.6, z + Math.sin(az) * L], 0.006, 3, c);
  }
  for (const [dx, dz, s] of [[-0.35, 0.2, 0.55], [0.5, -0.3, 0.42]]) P.hayHeap(new Frame(k, 'world', cx + dx, hAt(cx + dx, cz + dz) - 0.06, cz + dz, r() * 6, false), { rx: s, rz: s * 0.75, h: 0.16, col: [0.66, 0.55, 0.38], seed: 960 + Math.round(s * 100), m: 'hay' });
}

// galvanised milk can (Milchkanne): body, shoulder, neck, lid, two handles
function milkCan(f) {
  const col = [0.78, 0.8, 0.82];
  f.cyl('iron', 0.17, 0.17, 0.46, 12, [0, 0.23, 0], [0, 0, 0], col);
  f.cyl('iron', 0.17, 0.09, 0.1, 12, [0, 0.51, 0], [0, 0, 0], col);
  f.cyl('iron', 0.09, 0.09, 0.08, 10, [0, 0.6, 0], [0, 0, 0], col);
  f.cyl('iron', 0.105, 0.1, 0.035, 10, [0, 0.655, 0], [0, 0, 0], [0.7, 0.72, 0.74]);
  f.cyl('iron', 0.175, 0.175, 0.03, 12, [0, 0.03, 0], [0, 0, 0], [0.62, 0.62, 0.64]);
  for (const s of [-1, 1]) f.part('iron', new THREE.TorusGeometry(0.045, 0.008, 4, 8, Math.PI), { pos: [s * 0.17, 0.42, 0], rot: [0, s * H, 0], col: [0.6, 0.6, 0.62], uv: 'keep' });
}

// small wooden handcart (Handwagen): box on four spoked wheels, drawbar resting on the ground (front +z)
function handcart(f) {
  const bc = [0.62, 0.55, 0.48];
  const wheelY = (.2 + .025) * Math.cos(PI / 14);
  f.box('plank', -0.32, 0.42, -0.55, 0.32, 0.46, 0.55, bc);
  for (const s of [-1, 1]) f.box('plank', s * 0.32 - 0.02, 0.46, -0.55, s * 0.32 + 0.02, 0.68, 0.55, bc);
  for (const s of [-1, 1]) f.box('plank', -0.32, 0.46, s * 0.55 - 0.02, 0.32, 0.66, s * 0.55 + 0.02, bc);
  for (const sx of [-1, 1]) for (const z of [-0.38, 0.38]) {
    f.part('wood', new THREE.TorusGeometry(0.2, 0.025, 4, 14), { pos: [sx * 0.38, wheelY, z], rot: [0, H, 0], col: C.dark, uv: 'keep' });
    for (let i = 0; i < 3; i++) { const t = (i / 3) * PI; f.rod('wood', [sx * 0.38, wheelY + Math.cos(t) * 0.19, z + Math.sin(t) * 0.19], [sx * 0.38, wheelY - Math.cos(t) * 0.19, z - Math.sin(t) * 0.19], 0.012, 4, C.dark); }
  }
  for (const z of [-0.38, 0.38]) f.rod('iron', [-0.4, wheelY, z], [0.4, wheelY, z], 0.015, 5, C.black);
  f.beam('wood', [0, 0.36, 0.55], [0, 0.0187, 1.45], 0.04, 0.04, C.dark);
  f.rod('wood', [-0.14, 0.0187, 1.45], [0.14, 0.0187, 1.45], 0.018, 5, C.dark);
}
