// "Believe It" — the Hinterkaifeck farmstead, end of March 1922: house + stable + barn, attic, yard, fields and the forest.
// Assembles the builders (farm_house / farm_interior / farm_yard) into one scene with the material registry, presets,
// scene lights (3 best per frame into the shared PS1 point-light slots 1..3), cutaway groups, doors, ladders, stairs,
// colliders and floor heights for the first-person walk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ps1Material, ps1PointsMaterial, LIGHTS, GFX } from '../engine/ps1.js';
import { PixelCanvas, valueNoise, rng, hex, mixc, clamp, lerp, smooth, setHiTex, hiTexture } from '../engine/util.js';
import * as TX from './farm_tex.js';
import * as TX2 from './farm_tex2.js';
import { snowTex, plankTex, treelineTex, endsTex, barkTex, ringTex, tierHi, partSmooth, PRESETS as YP } from './yard.js';
import { snowHi, plankHi, endsHi, barkHi, ringHi, treelineHi } from './yard_hi.js';
import { part } from '../models/props.js';
import { makeAxe } from '../models/axe.js';
import { makeDog } from '../models/dog.js';
import { Y, PITCH, HOUSE, BARN, ROOMS, STAIR, YARD, SPOTS, DOORS } from './farm_plan.js';
import { Kit } from './farm_kit.js';
import { photoTwin, photoTex, hasPhoto } from '../engine/photo.js';
import { buildWalls, buildFloors, buildStairs, buildRoofs, buildChimney, buildWindows, buildDoors, stairY } from './farm_house.js';
import { furnish } from './farm_interior.js';
import { createAnimals } from './farm_animals.js';
import { createPrints, createTrail } from './farm_prints.js';
import { buildYard } from './farm_yard.js';
import { dressFarm } from './farm_details.js';
import { wearTexture, glazeTwin } from './farm_detail_tex.js';
import { spruceFoliage } from './farm_foliage.js';

const V3 = THREE.Vector3;
const hexf = (h) => hex(h).map((x) => x / 255);

/* ---------------------------------------------------------------- presets */
// yard presets + farm extras: indoor ambient scale, light levels per lamp, snowfall amount, smoke colour
export const FARM_PRESETS = {
  day: { ...YP.day, indoor: 0.42, flakes: 0, smoke: [0.7, 0.71, 0.74], terrain: [0.96, 0.96, 0.97], dog: 'sit', snowCov: 0.74,
    L: { stove: 0.35, r1: 0, r5: 0, kitchen: 0, stable: 0, fill: 1 }, adapt: 0.55,
    enh: { ...YP.day.enh, far: 160 } },
  dusk: { ...YP.dusk, indoor: 0.3, flakes: 0.4, smoke: [0.36, 0.38, 0.46], terrain: [0.82, 0.85, 0.94], dog: 'sit', snowCov: 0.78,
    L: { stove: 0.9, r1: 1, r5: 1, kitchen: 0.9, stable: 0.85, fill: 0.3 }, adapt: 0.35, far: 95,
    enh: { ...YP.dusk.enh, far: 105 } },
  night: { ...YP.night, indoor: 0.2, flakes: 1, smoke: [0.09, 0.1, 0.13], terrain: [0.7, 0.75, 0.85], dog: 'sleep', snowCov: 0.82,
    L: { stove: 0.5, r1: 0.7, r5: 0, kitchen: 0, stable: 0, fill: 0.03 }, adapt: 0.2 },
};

/* ---------------------------------------------------------------- small helpers */
function glowTex() { // lit window seen from outside: warm, brighter in the middle, curtain shadows at the sides
  const pc = new PixelCanvas(16, 16);
  pc.each((x, y) => {
    const u = (x + 0.5) / 16, v = (y + 0.5) / 16, side = smooth(clamp(Math.abs(u - 0.5) * 2.6 - 0.55, 0, 1));
    const k = (0.78 + 0.22 * Math.sin(v * Math.PI)) * (1 - side * 0.55);
    pc.set(x, y, [Math.round(255 * k), Math.round(214 * k), Math.round(150 * k)], 255);
  });
  const t = pc.texture(false);
  setHiTex(t, () => hiTexture(pc, false));
  return t;
}
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
const polyDist = (px, pz, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, ...pts[i], ...pts[i + 1])); return d; };
const inRect = (x, z, r, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

// tracks in the yard: [points, half width, mud, ruts]
const TRACKS = [
  [[[14.15, 3.6], [13.6, 8.5], [11.2, 14.5], [13.5, 24], [22, 40], [34, 58], [50, 80]], 1.45, 1, true], // barn gate -> south-east cart road
  [[[14.15, -15.4], [14.8, -19], [11, -28], [4, -40]], 1.3, 0.85, true], // north gate -> forest track
  [[[-7.1, 0.7], [-4.6, 3.6], [-1.6, 6.4], [1.8, 5.2], [4.9, 1.0], [5.0, 0.2]], 0.75, 1, false], // front door -> well -> stable door
  [[[-0.5, 7.4], [4.5, 9.6], [9.0, 11.2], [11.6, 13.0]], 0.7, 0.85, false],
  [[[-7.4, 0.8], [-10.5, 2.6], [-13.4, 5.6]], 0.65, 0.8, false], // to the wagon shed
  [[[-6.0, 1.2], [-6.6, 5.5], [-6.4, 8.6]], 0.55, 0.7, false], // to the woodpile
  [[[2.2, -11.3], [3.2, -12.4], [4.6, -13.0]], 0.55, 0.7, false], // to the engine hut
  [[[4.2, 7.3], [4.9, 3.0]], 0.5, 0.6, false],
];

export function createFarm() {
  const scene = new THREE.Scene();
  const r = rng(7301);

  /* ---------------------------------------------------------------- textures */
  const T = {
    wash: TX.whitewash(), washI: TX.whitewash(true), stone: TX.stone(), roof: TX.rooftile(), board: TX.floorboard(), wood: TX.wood(), flag: TX.flagstone(), brick: TX.brick(),
    kachel: TX.kachel(), hay: TX.hay(), mud: TX.mud(), grass: TX.grass(), linen: TX.linen(), checkB: TX.checkBlue(), checkR: TX.checkRed(), hide: TX.hide(),
    iron: TX.iron(), needle: TX.needleDark(), glass: TX.glass(), paint: TX.paintedPanel(), holy: TX.holyPicture(), print: TX.printed(), clock: TX.clockFace(),
    puff: TX.puff(), dung: TX.dung(), wicker: TX.wicker(), burlap: TX.burlap(), strawC: TX.strawCard(), brass: TX.brass(), ceramic: TX.ceramic(), stoneware: TX.stoneware(), earthen: TX.earthen(), enamel: TX.enamel(), preserve: TX.preserve(), rope: TX.rope(), grainT: TX.grain(), machine: TX.machine(), leather: TX.leather(), feather: TX.feather(), snow: snowTex(), plank: plankTex(), line: treelineTex(), ends: endsTex(), bark: barkTex(), ring: ringTex(), glow: glowTex(),
  };
  setHiTex(T.snow, snowHi); setHiTex(T.plank, plankHi); setHiTex(T.line, treelineHi);
  // v4 texture pass: seamless, detailed replacements
  Object.assign(T, { kachel: TX2.kachel(), stone: TX2.stone(), linen: TX2.linen(), checkB: TX2.checkBlue(), checkR: TX2.checkRed(), hide: TX2.hide(), iron: TX2.iron(), brass: TX2.brass(), enamel: TX2.enamel(), leather: TX2.leather(), rope: TX2.rope(), bark: TX2.bark(), ends: TX2.ends(), ring: TX2.ring(), holy: TX2.holyPicture(), plainT: TX2.plain(), earthen: TX2.earthen() });
  glazeTwin(T.ceramic);glazeTwin(T.stoneware,true);
  // v5: photographed surfaces (with normal maps + gloss) as the enhanced twins; the retro pixel textures stay
  for (const [k, n, tile] of [['board', 'floor', 1], ['plank', 'plank', 1], ['wash', 'wash', 2], ['washI', 'washI', 2], ['wood', 'wood', 1], ['stone', 'stone', 1.2],
    ['brick', 'brick', 1], ['flag', 'flag', 2], ['roof', 'roof', 1], ['hay', 'hay', 1], ['bark', 'bark', 0.5], ['burlap', 'burlap', 0.5], ['iron', 'iron', 0.5],
    ['snow', 'snow', 2], ['mud', 'mud', 1.5], ['grass', 'grass', 1.2]]) photoTwin(T[k], n, tile);

  /* ---------------------------------------------------------------- materials: exterior + indoor ("_i": dimmer ambient, no sun in retro) */
  const INDOOR = { value: 0.4 }, SUNK_I = { value: GFX.enh ? 1 : 0 };
  const mats = {}, glowMats = {};
  // relief (metres per unit of texture luminance, enhanced only) and snow on the upward faces of the outdoor variants
  const BUMP = { wash: 0.006, stone: 0.02, brick: 0.012, wood: 0.009, plank: 0.011, board: 0.009, roof: 0.016, bark: 0.022, hay: 0.014, grain: 0.01, flag: 0.016, kachel: 0.004, ends: 0.012, mud: 0.012, hide: 0.004, linen: 0.003, ring: 0.008, iron: 0.005, dung: 0.02, wicker: 0.006, burlap: 0.004, machine: 0.004, rope: 0.004, leather: 0.003, brass: 0.002, earthen: 0.002, stoneware: 0.002 };
  const SNOW = { wash: 1, stone: 1, roof: 1, board: 1, wood: 1, plank: 1, brick: 1, bark: 1, ends: 1, ring: 1, iron: 0.6 };
  const def = (name, map, texel, o = {}, indoor = true) => {
    mats[name] = { mat: ps1Material({ map, ao: 1, bump: BUMP[name] || 0, snow: SNOW[name] || 0, ...o }), texel };
    if (indoor) mats[name + '_i'] = { mat: ps1Material({ map, ao: 1, amb: INDOOR, sunk: SUNK_I, bump: BUMP[name] || 0, ...o }), texel };
  };
  def('wash', T.wash, 2); mats.wash_i = { mat: ps1Material({ map: T.washI, ao: 1, amb: INDOOR, sunk: SUNK_I, bump: BUMP.wash }), texel: 2 }; def('stone', T.stone, 1.2); def('roof', T.roof, 1, {}, false); def('board', T.board, 1); def('wood', T.wood, 1);
  def('plank', T.plank, 1); def('flag', T.flag, 2); def('brick', T.brick, 1); def('kachel', T.kachel, 0.4); def('hay', T.hay, 1);
  def('grain', T.grainT, 0.4); def('linen', T.linen, 0.5); def('checkB', T.checkB, 0.4); def('checkR', T.checkR, 0.4); def('hide', T.hide, 1);
  def('iron', T.iron, 0.5); def('plain', T.plainT, 1); def('paint', T.paint, 1); def('holy', T.holy, 1); def('print', T.print, 1); def('clock', T.clock, 1);
  def('bark', T.bark, 0.5); def('ends', T.ends, 0.64); def('ring', T.ring, 1); def('snow', T.snow, 2, { sparkle: 1, ao: 0 }); def('mud', T.mud, 1.5);
  def('dung', T.dung, 1.5); def('feather', T.feather, 0.12); def('wicker', T.wicker, 0.25); def('burlap', T.burlap, 0.5);
  def('brass', T.brass, 0.25); def('ceramic', T.ceramic, 1); def('stoneware', T.stoneware, 1); def('earthen', T.earthen, 1); def('enamel', T.enamel, 1);
  def('preserve', T.preserve, 0.2); def('rope', T.rope, 0.1); def('machine', T.machine, 1); def('leather', T.leather, 0.3);
  def('wear',wearTexture(),1,{transparent:true,depthWrite:false,ao:0,snow:0});
  def('straw', T.strawC, 1, { side: THREE.DoubleSide, alphaCut: 0.5, ao: 0 }); // alpha-tested stalk cards (uv kept)
  mats.glass = { mat: ps1Material({ map: T.glass, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: 0.8 }), texel: 1 };
  mats.glassc = { mat: ps1Material({ map: T.glass, transparent: true, depthWrite: false, side: THREE.DoubleSide, amb: INDOOR, sunk: SUNK_I }), texel: 1 };
  for (const id of ['r1', 'r4', 'r5']) {
    const m = ps1Material({ map: T.glow, lit: 0, fog: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mats['glow_' + id] = { mat: m, texel: 1 }; glowMats[id] = m;
  }
  const NOCAST = new Set(['straw', 'straw_i', 'glass', 'glassc', 'wear','wear_i','glow_r1', 'glow_r4', 'glow_r5']);

  /* ---------------------------------------------------------------- build */
  const kit = new Kit(mats, { env: true });
  const ctx = { kit, floors: [], ladders: [], doors: [], lightPts: {}, flames: [], glowRooms: ['r1', 'r4', 'r5'], thr: new Set() };
  buildWalls(ctx); buildFloors(ctx); buildStairs(ctx); buildRoofs(ctx); buildChimney(ctx); buildWindows(ctx);
  furnish(ctx); buildYard(ctx); dressFarm(ctx);
  let tris = 0;
  const groups = kit.build((mesh, grp, m) => { if (!NOCAST.has(m)) mesh.layers.enable(1); if(m.startsWith('wear'))mesh.renderOrder=1; tris += mesh.geometry.attributes.position.count / 3; });
  for (const g of Object.values(groups)) scene.add(g);
  const glowMesh = {};
  for (const g of Object.values(groups)) for (const m of g.children) if (m.userData.mat.startsWith('glow_')) { (glowMesh[m.userData.mat.slice(5)] ||= []).push(m); m.renderOrder = 2; }
  buildDoors(ctx, mats, scene);
  const animals = createAnimals(mats, groups.base, scene);
  {
    const S = YARD.shed || {}, ns = [[-14.5, -9.1, 11.5, 0.55, 3.95], [10.5, -15.8, 20.1, 4.7, 3.95], [0.7, -15.85, 4.3, -11.95, 2.45]];
    if (S.x0 !== undefined) ns.push([S.x0 - 0.4, S.z0 - 0.4, S.x1 + 0.5, S.z1 + 0.4, 2.25]);
    if (YARD.wood) ns.push([YARD.wood[0] - 1.5, YARD.wood[1] - 0.5, YARD.wood[0] + 1.5, YARD.wood[1] + 0.5, 1.44]);
    ns.forEach((b, i) => { LIGHTS.uNoSnow.value[i].set(b[0], b[1], b[2], b[3]); LIGHTS.uNoSnowY.value[i] = b[4]; });
  }
  for (const d of ctx.doors) d.g.traverse((o) => { if (o.isMesh) { o.layers.enable(1); tris += o.geometry.attributes.position.count / 3; } });
  const solids = kit.solids;

  /* ---------------------------------------------------------------- sky dome (follows the camera) */
  const skyGeo = new THREE.SphereGeometry(150, 18, 10).toNonIndexed();
  skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const sky = new THREE.Mesh(skyGeo, ps1Material({ lit: 0, fog: 0, side: THREE.BackSide, depthWrite: false, skyFx: 1 }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  /* ---------------------------------------------------------------- terrain: flat yard, gentle fields, snow / mud / grass from a painted mask */
  const hn = valueNoise(7303, 16, 16), fn = valueNoise(7304, 32, 32), gn = valueNoise(7305, 64, 64);
  const H = (x, z) => { const d = Math.max(Math.abs(x) * 0.85, Math.abs(z + 4)); const k = smooth(clamp((d - 36) / 30, 0, 1)); return k * ((hn(x / 24 + 8, z / 24 + 8) - 0.5) * 3.2 + 0.5); };
  const field = (x, z) => fn(x / 9 + 3, z / 9 + 3) * 0.6 + gn(x / 3.2 + 1, z / 3.2 + 7) * 0.4;
  const MASK_HALF = 64;
  const forestEdge = (x) => -34 - (hn(x / 18 + 2, 4) - 0.5) * 8 - Math.max(0, Math.abs(x) - 55) * 0.25;
  const mask = TX.groundMask(512, MASK_HALF, (x, z) => {
    const n = field(x, z);
    let snow = 0.7 + (n - 0.5) * 0.9, mud = 0.08 + (n < 0.35 ? 0.25 : 0), wet = 0;
    // inside the yard fence: trampled and mostly melted
    const yard = smooth(clamp(1 - Math.max((Math.abs(x - 0.5) - 21) / 3, (Math.abs(z - 1.8) - 12.5) / 3, 0), 0, 1));
    snow = lerp(snow, 0.66 + (n - 0.5) * 0.6, yard); mud = lerp(mud, 0.42 + (n - 0.5) * 0.4, yard);
    // shade north of the buildings keeps its snow; the sunny south fronts and the eaves drip lines are bare and wet
    if (x > -15 && x < 12 && z < -8.6 && z > -12.5) snow = Math.max(snow, 0.78 - (-8.6 - z) * 0.05);
    if (x > 19.6 && x < 22 && z > -15 && z < 4) snow = Math.max(snow, 0.62);
    if (x > -14.6 && x < 11.5 && z > 0 && z < 1.1) { snow = 0; wet = 0.55; mud = Math.max(mud, 0.6); }
    // drifts along the fences
    const fd = Math.min(Math.abs(z - YARD.fenceS), Math.abs(z - YARD.fenceN), Math.abs(x - YARD.fenceW), Math.abs(x - YARD.fenceE));
    if (fd < 0.9 && x > YARD.fenceW - 1 && x < YARD.fenceE + 1 && z > YARD.fenceN - 1 && z < YARD.fenceS + 1) snow = Math.max(snow, 0.75 - fd * 0.3);
    // tracks: mud, wet ruts, no snow
    for (const [pts, hw, mk, ruts] of TRACKS) {
      const d = polyDist(x, z, pts);
      if (d > hw + 0.8) continue;
      const k = smooth(clamp((hw + 0.8 - d) / 0.8, 0, 1));
      snow = Math.min(snow, lerp(snow, 0.05, k)); mud = Math.max(mud, mk * k);
      if (ruts) { const rr = Math.abs(d - hw * 0.55); if (rr < 0.28) wet = Math.max(wet, (1 - rr / 0.28) * 0.85); } else wet = Math.max(wet, k * 0.25);
    }
    // manure heap seepage, wet ground at the well trough
    const M = YARD.manure;
    if (inRect(x, z, M, 1.4)) { const k = inRect(x, z, M, 0.2) ? 1 : 0.6; snow = 0; mud = Math.max(mud, k); wet = Math.max(wet, 0.75 * k); }
    const dw = Math.hypot(x - YARD.well[0] - 0.9, z - YARD.well[1]);
    if (dw < 2.6) { snow = Math.min(snow, dw / 2.6 * 0.3); mud = Math.max(mud, 0.8); wet = Math.max(wet, (1 - dw / 2.6) * 0.8); }
    // spruce wood: needle litter under thin, patchy snow (the canopy holds most of it)
    const fk = smooth(clamp((forestEdge(x) + 3 - z) / 7, 0, 1));
    const litter = fk * (0.55 + 0.45 * n);
    if (fk > 0) snow = lerp(snow, 0.42 + (n - 0.5) * 1.1, fk * 0.85);
    return [snow, mud, wet, litter];
  });
  const trail = createTrail();
  const TP = ['snow', 'mud', 'grass', 'litter'].every(hasPhoto);
  const terrainMat = ps1Material({ map: T.snow, sparkle: 1, terrain: { map2: T.mud, map3: T.grass, mask, rect: [-MASK_HALF, -MASK_HALF, 2 * MASK_HALF, 2 * MASK_HALF], trail,
    ...(TP ? { map4: photoTex('litter'), nmaps: ['snow', 'mud', 'grass', 'litter'].map((n) => photoTex(n).userData.nmap), tiles: [2.2, 1.6, 1.25, 2.1] } : {}) } });
  {
    const P = [], N = [], U = [], Cc = [];
    const cell = (x0, z0, s) => {
      const Q = [[x0, z0], [x0 + s, z0], [x0 + s, z0 + s], [x0, z0 + s]].map(([x, z]) => new V3(x, H(x, z), z));
      const tri = (a, b, c) => {
        const nn = new V3().subVectors(Q[b], Q[a]).cross(new V3().subVectors(Q[c], Q[a])).normalize();
        for (const i of [a, b, c]) { P.push(Q[i].x, Q[i].y, Q[i].z); N.push(nn.x, nn.y, nn.z); U.push(Q[i].x / 3, Q[i].z / 3); const t = 0.96 + (gn(Q[i].x / 2, Q[i].z / 2) - 0.5) * 0.08; Cc.push(t, t, t); }
      };
      tri(0, 2, 1); tri(0, 3, 2);
    };
    for (let x = -39; x < 39; x += 1.5) for (let z = -39; z < 39; z += 1.5) cell(x, z, 1.5);
    for (let i = 0; i < 50; i++) for (let j = 0; j < 50; j++) { if (i >= 19 && i < 31 && j >= 19 && j < 31) continue; cell(-162.5 + i * 6.5, -162.5 + j * 6.5, 6.5); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    var terrain = new THREE.Mesh(g, terrainMat);
    terrain.frustumCulled = false; scene.add(terrain);
    tris += P.length / 9;
  }
  const prints = createPrints(scene, H, mask, 520, { trail });
  /* the stranger's track: one line of prints out of the wood to the north-east corner of the barn, none going back;
     a few days old, half filled with snow (permanent: never fades, pressed into the trail's base layer) */
  const track = createPrints(scene, H, mask, 120, { trail, perm: true });
  {
    const pts = [[25.2, -38.5], [24.3, -33.5], [23.4, -29.0], [22.6, -24.8], [21.6, -20.6], [20.7, -17.6], [20.05, -15.75]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new V3(x, 0, z))), Ltot = curve.getLength(), stride = 0.38;
    let side = 1, k = 0;
    for (let d = 0.2; d < Ltot - 0.15; d += stride * (0.93 + ((k * 7919) % 13) / 13 * 0.14), k++) {
      const u = d / Ltot, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      const yaw = Math.atan2(-tg.x, -tg.z) + Math.sin(k * 1.7) * 0.05;
      track.add(p.x, p.z, yaw, side, { old: true, gauge: 0.12 });
      side = -side;
    }
    // where he stood at the corner, shifting his weight, looking along the wall
    track.add(20.12, -15.62, Math.atan2(0.6, 0.8), 1, { old: true, gauge: 0.12 }); track.add(19.98, -15.7, Math.atan2(0.9, 0.4), -1, { old: true, gauge: 0.12 });
  }

  /* ---------------------------------------------------------------- spruce forest to the north, a few loners in the fields */
  const trees = [], treesHi = [], treeRecords=[];
  const spruce = (x, z, s) => {
    const y0 = H(x, z) - 0.1, tiers = [[1.9, 3.2, 1.0], [1.45, 2.7, 2.6], [0.95, 2.3, 4.0], [0.5, 1.5, 5.3]];
    trees.push(part(new THREE.CylinderGeometry(0.16 * s, 0.2 * s, 1.4 * s, 5, 1), { pos: [x, y0 + 0.5 * s, z], col: [0.45, 0.36, 0.3] }));
    treesHi.push(partSmooth(new THREE.CylinderGeometry(0.025 * s, 0.21 * s, 7.0 * s, 10, 1), { pos: [x, y0 + 3.4 * s, z], col: [.64,.61,.55] }));
    treeRecords.push({x,z,s,y:y0,seed:9236+treeRecords.length*17});
    const tint = 0.8 + r() * 0.3, rot = r() * 6, sl = 0.85 + r() * 0.2; // slimmer, taller forest spruces
    for (const [rr, hh, yy] of tiers) {
      trees.push(part(new THREE.CylinderGeometry(0, rr * s * sl, hh * s, 7, 1, false, rot), { pos: [x, y0 + (yy + hh / 2) * s, z], col: [tint, tint, tint] }));
    }
  };
  for (let i = 0; i < 260; i++) { // dense stand: the edge runs 34-40 m north of the yard, clumped
    const x = -110 + r() * 220, edge = -34 - (hn(x / 18 + 2, 4) - 0.5) * 8 - Math.max(0, Math.abs(x) - 55) * 0.25;
    const z = edge - Math.pow(r(), 1.4) * 58;
    spruce(x, z, 1.2 + r() * 0.9);
  }
  for (let i = 0; i < 22; i++) { // edge of the wood bending round the west and east
    const side = i % 2 ? 1 : -1, x = side * (62 + r() * 40), z = -40 + r() * 70;
    spruce(x, z, 1.0 + r() * 0.8);
  }
  // Younger spruces fill gaps beneath the tall trees instead of forming a uniform wall.
  for (let i=0;i<145;i++) {
    const x=-80+r()*160, edge=-31-(hn(x/18+2,4)-.5)*8;
    const z=edge-r()*45; if(Math.abs(x)<8 && z>-38) continue;
    spruce(x,z,.27+r()*.48);
  }
  for (const [x, z, s] of [[-31, -24, 1.3], [-36, -30, 1.1], [33, -26, 1.4], [38, -33, 1.2], [-44, 12, 1.0], [46, 6, 1.2], [29, -36, 1.0]]) spruce(x, z, s);
  const treeMat = ps1Material({ map: T.needle, ao: 1, snow: 0.85 }), treeMatHi = ps1Material({ map: T.needle, ao: 1, side: THREE.DoubleSide, snow: 0.85, bump: 0.02 });
  const treeMesh = new THREE.Mesh(mergeGeometries(trees), treeMat), treeMeshHi = new THREE.Mesh(mergeGeometries(treesHi), treeMatHi);
  const foliage=spruceFoliage(treeRecords);scene.add(foliage.mesh);
  ctx.detailAreas.push(`Лес: ${foliage.trees} елей с отдельными ветвями и хвоей`);
  for (const tm of [treeMesh, treeMeshHi]) {
    tm.frustumCulled = false; tm.layers.enable(1);
    const tuv = tm.geometry.attributes.uv;
    for (let i = 0; i < tuv.count; i++) tuv.setX(i, tuv.getX(i) * 3);
    scene.add(tm);
  }

  /* ---------------------------------------------------------------- winter undergrowth: dormant grass, brush, fallen wood */
  {
    const grass=[], brush=[], wood=[], crowns=[];
    const add=(arr,g,o)=>arr.push(part(g,o));
    const blade=new THREE.ConeGeometry(.018,1,3,1), twig=new THREE.CylinderGeometry(.006,.014,1,5), log=new THREE.CylinderGeometry(1,1,1,8), bush=new THREE.ConeGeometry(1,1,7,1);
    for(let i=0;i<730;i++) {
      let x,z;
      if(i<330) { x=-82+r()*164; z=-29-r()*60; }
      else if(i<430) { const side=r()<.5?-1:1; x=side*(30+r()*45); z=-24+r()*56; }
      else { const side=r()<.5?-1:1; x=side*(5+Math.pow(r(),1.3)*34); z=-24-r()*28; }
      if (Math.abs(x)<23 && z>-24) continue; // keep yard and gates clear
      const y=H(x,z), tint=.65+r()*.35;
      // Sparse clumps of last year's dry stalks emerge through snow.
      const n=3+Math.floor(r()*4);
      for(let k=0;k<n;k++) { const a=r()*Math.PI*2, h=.22+r()*.52, off=r()*.13;
        add(grass,blade,{pos:[x+Math.cos(a)*off,y+h*.46,z+Math.sin(a)*off],rot:[(r()-.5)*.5,a,(r()-.5)*.6],scale:[1,h,1],col:[tint*.77,tint*.7,tint*.48]}); }
      if(i%4===0) { // twiggy leafless shrubs, appropriate for late March
        const h=.55+r()*.8;
        for(let k=0;k<5;k++){const a=k*Math.PI*2/5+r()*.4,lean=.3+r()*.3;
          add(brush,twig,{pos:[x+Math.cos(a)*.09,y+h*.43,z+Math.sin(a)*.09],rot:[Math.sin(a)*lean,0,Math.cos(a)*lean],scale:[1,h,1],col:[.62,.55,.46]});}
      }
      if(i%9===0) { // small uneven evergreen regrowth
        const h=.5+r()*.7, rad=.18+r()*.2;
        add(crowns,bush,{pos:[x,y+h*.57,z],rot:[0,r()*6.28,0],scale:[rad,h,rad],col:[.6+tint*.2,.7+tint*.2,.63+tint*.18]});
      }
      if(i%28===0) { const radius=.12+r()*.12,h=.2+r()*.18;
        add(wood,log,{pos:[x,y+h/2,z],scale:[radius,h,radius],col:[.7,.62,.54]});
        if(i%56===0) add(wood,log,{pos:[x+.8,y+.13,z+.3],rot:[0,r()*6.28,Math.PI/2],scale:[.11,1.4+r(),.11],col:[.7,.64,.55]});
      }
    }
    const groups2=[[grass,ps1Material({map:T.hay,ao:.8})],[brush,ps1Material({map:T.bark,ao:.8})],[wood,ps1Material({map:T.bark,ao:1,snow:.7})],[crowns,treeMatHi]];
    for(const [parts,mat] of groups2) if(parts.length) { const m=new THREE.Mesh(mergeGeometries(parts),mat); m.frustumCulled=false; scene.add(m); }
  }

  /* Fine conifer bough cards: irregular needle silhouettes soften the young trees at the forest edge.
     Batches are alpha-tested and intentionally do not cast solid rectangular shadows. */
  {
    const pc=new PixelCanvas(256,256,[40,47,42]); pc.each((x,y)=>pc.alpha(x,y,0));
    const rr=rng(8080);
    const stroke=(x0,y0,x1,y1,col,th=1)=>{const n=Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0)));for(let j=0;j<=n;j++){const t=j/Math.max(1,n),x=Math.round(lerp(x0,x1,t)),y=Math.round(lerp(y0,y1,t)); for(let a=-th;a<=th;a++)for(let b=-th;b<=th;b++) if(x+a>=0&&x+a<256&&y+b>=0&&y+b<256)pc.set(x+a,y+b,col,255);}};
    stroke(128,3,128,246,[46,49,43],2);
    for(let i=0;i<35;i++) { const y=14+i*6.5, len=(1-y/265)*(65+rr()*40), col=[43+rr()*15,49+rr()*17,43+rr()*15];
      for(const sign of [-1,1]) { const ex=128+sign*len, ey=y-8-rr()*9; stroke(128,y,ex,ey,col,1);
        for(let j=1;j<=8;j++) {const u=j/9,px=lerp(128,ex,u),py=lerp(y,ey,u),h=3+rr()*7; stroke(px,py,px+sign*(3+rr()*5),py+h,col,1);stroke(px,py,px-sign*(2+rr()*4),py-h,col,1); if(rr()<.11)stroke(px,py+h,px+sign*4,py+h-1,[95,103,100],1);}
      }
    }
    const tex=pc.texture(false); setHiTex(tex,()=>hiTexture(pc,false));
    const mat=ps1Material({map:tex,ao:.9,side:THREE.DoubleSide,alphaCut:.48,snow:.4}); const parts=[]; const veg=rng(8081);
    for(let i=0;i<105;i++){const x=-75+veg()*150,z=-33-veg()*47,y=H(x,z),h=1.1+veg()*1.5,w=h*.52,ang=veg()*Math.PI;
      for(let k=0;k<3;k++) parts.push(part(new THREE.PlaneGeometry(w,h),{pos:[x,y+h*.5-.03,z],rot:[0,ang+k*Math.PI/3,0],col:[.76+veg()*.18,.8+veg()*.18,.74+veg()*.18]}));
    }
    const mesh=new THREE.Mesh(mergeGeometries(parts),mat);mesh.frustumCulled=false;scene.add(mesh);
  }

  /* ---------------------------------------------------------------- distant tree line */
  const lineGeo = part(new THREE.CylinderGeometry(118, 118, 20, 48, 1, true), { pos: [0, 6, 0], scale: [-1, 1, 1] });
  const luv = lineGeo.attributes.uv;
  for (let i = 0; i < luv.count; i++) luv.setX(i, luv.getX(i) * 7);
  const lineMat = ps1Material({ map: T.line, lit: 0, fog: 0.42 });
  const treeline = new THREE.Mesh(lineGeo, lineMat);
  treeline.frustumCulled = false; scene.add(treeline);

  /* ---------------------------------------------------------------- the dog at its kennel, the axe in the chopping block */
  const dog = makeDog();
  dog.group.position.copy(ctx.dogAt || new V3(4.2, 0, 9)); dog.group.position.y = 0; dog.group.rotation.y = ctx.dogYaw ?? 0;
  scene.add(dog.group);
  for (const m of dog.meshes) m.layers.enable(1);
  let dogAnim = null;
  const setDog = (anim, t = 0) => { if (anim === dogAnim) return; dogAnim = anim; dog.setAnim(anim, t, 0); dog.state.from = null; };
  setDog('sit');
  // the dog barks now and then — rarely by day, more often after dark — synced to the bark pose (cycle 1.5 s); its chain rattles
  const DOG = { base: 'sit', night: false, next: 90 + Math.random() * 120, chain: 40 + Math.random() * 80, left: 0, ph: 0, on: false };
  {
    const bt = ctx.blockTop || new V3(YARD.block[0], 0.48, YARD.block[1]);
    const ax = makeAxe(), up = new V3(0, 1, 0), hd = new V3(0.989, 0, 0.145).normalize(), tilt = (22 * Math.PI) / 180;
    const toKnob = hd.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(up, Math.sin(tilt));
    const bitDown = up.clone().negate().addScaledVector(toKnob, up.dot(toKnob)).normalize();
    const X = bitDown.clone().normalize(), Yh = toKnob.clone().negate().normalize(), Z = new V3().crossVectors(X, Yh);
    ax.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Yh, Z));
    ax.group.position.copy(bt).addScaledVector(bitDown, 0.028).sub(new V3(0.13, 0.63, 0).applyQuaternion(ax.group.quaternion));
    ax.group.traverse((o) => { if (o.isMesh) o.layers.enable(1); });
    scene.add(ax.group);
  }

  /* ---------------------------------------------------------------- flames, stove glow, chimney smoke, snowfall */
  const fx = new THREE.Group(); scene.add(fx);
  const fireMat = ps1Material({ map: T.puff, lit: 0, fog: 0.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, tint: [1.0, 0.62, 0.25] });
  const flames = ctx.flames.map((f) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.1), fireMat);
    m.position.copy(f.p).add(new V3(0, 0.03, 0)); m.renderOrder = 3; m.frustumCulled = false;
    fx.add(m);
    return { ...f, m, ph: r() * 10 };
  });
  const stoveMat = ps1Material({ map: T.puff, lit: 0, fog: 0.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, tint: [0.7, 0.28, 0.06] });
  const stoveGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), stoveMat);
  if (ctx.stoveFire) stoveGlow.position.copy(ctx.stoveFire); else stoveGlow.visible = false;
  stoveGlow.renderOrder = 3; fx.add(stoveGlow);
  const smokeAt = ctx.smokeAt || new V3(-8.67, 8.85, -5.03), NP = 16;
  const puffs = Array.from({ length: NP }, (_, i) => {
    const m = ps1Material({ map: T.puff, lit: 0, fog: 1, transparent: true, depthWrite: false, opacity: 0, tint: [0.7, 0.7, 0.72] });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.frustumCulled = false; mesh.renderOrder = 4; fx.add(mesh);
    return { mesh, m, age: (i / NP) * 8, life: 8, seed: r() * 6.28 };
  });
  const NS = 1400, box = new V3(26, 12, 26);
  const spos = new Float32Array(NS * 3), seeds = new Float32Array(NS * 2), fpos = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) { spos[i * 3] = r() * box.x; spos[i * 3 + 1] = r() * box.y; spos[i * 3 + 2] = r() * box.z; seeds[i * 2] = r() * 6.28; seeds[i * 2 + 1] = 0.7 + r() * 0.6; }
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const flakeMat = ps1PointsMaterial([0.9, 0.92, 0.98]);
  const flakes = new THREE.Points(flakeGeo, flakeMat);
  flakes.frustumCulled = false; scene.add(flakes);

  /* ---------------------------------------------------------------- scene lights: lamps, stove, window spill outside, daylight fills */
  const LT = [];
  const rbox = (R, m = 0.06) => [R.x0 - m, R.z0 - m, R.x1 + m, R.z1 + m];
  const addL = (id, key, pos, col, range, box, o = {}) => LT.push({ id, key, pos: pos.clone ? pos.clone() : new V3(...pos), col, range, box, scat: o.scat ?? 0, lvl: o.lvl ?? 0, out: !!o.out, flick: o.flick ?? 0, k: 0, fade: 0, ph: r() * 10 });
  const LP = ctx.lightPts, R = ROOMS, WARM = [1.0, 0.64, 0.3];
  if (LP.stove) addL('stove', 'stove', LP.stove.clone().add(new V3(0, 0.1, 0.25)), [1.0, 0.45, 0.14], 3.8, rbox(R.r4), { flick: 0.22 });
  if (LP.r1) addL('r1', 'r1', LP.r1.clone().add(new V3(0, 0.08, 0)), WARM, 6.5, rbox(R.r1), { flick: 0.05 });
  if (LP.r5) addL('r5', 'r5', LP.r5.clone().add(new V3(0, 0.08, 0)), WARM, 6.5, rbox(R.r5), { flick: 0.05 });
  if (LP.kitchen) addL('kitchen', 'kitchen', LP.kitchen, WARM, 6.0, rbox(R.r4), { flick: 0.05 });
  if (LP.stable) addL('stable', 'stable', LP.stable, [0.95, 0.6, 0.28], 7.0, rbox(R.r7), { flick: 0.06 });
  // light falling out of the lit windows onto the snow / the yard (outside only, scatters in the haze)
  addL('w_r1', 'r1', [-11.3, 1.4, 1.1], [0.85, 0.52, 0.22], 6.0, [-16, 0.02, -6.5, 14], { out: true, scat: 0.6 });
  addL('w_r5', 'r5', [-2.9, 1.4, 1.1], [0.85, 0.52, 0.22], 6.0, [-7.2, 0.02, 1.5, 14], { out: true, scat: 0.6 });
  addL('w_r4', 'kitchen', [-7.6, 1.5, -9.6], [0.85, 0.52, 0.22], 5.0, [-12, -24, -3, -8.62], { out: true, scat: 0.5 });
  // daylight through the windows (sky fill; the enhanced sun comes in through the shadow map)
  const SKY = [0.34, 0.34, 0.35];
  const fill = (id, room, pos, k = 1, range = 5.5, lvl = 0) => addL('f_' + id, 'fill', pos, SKY.map((c) => c * k), range, rbox(room), { lvl });
  fill('r1', R.r1, [-11.3, 1.9, -1.3]); fill('r1w', R.r1, [-12.9, 1.9, -2.5], 0.6, 4.5); fill('r2', R.r2, [-11.6, 1.9, -7.2], 0.7, 4.5);
  fill('r3', R.r3, [-7.1, 1.9, -1.0], 0.45, 4.5); fill('r4', R.r4, [-7.0, 1.9, -7.2], 0.75); fill('r5', R.r5, [-2.9, 1.9, -1.3]);
  fill('r6', R.r6, [-1.9, 1.8, -7.3], 0.4, 4); fill('r7a', R.r7, [2.8, 1.8, -1.6], 0.55, 6); fill('r7b', R.r7, [8.4, 1.8, -1.6], 0.5, 6);
  fill('r9', R.r9, [15.2, 2.4, 1.6], 0.8, 9); fill('r9m', R.r9, [15.2, 2.4, -5.5], 0.5, 8); fill('r9n', R.r9, [15.2, 2.4, -12.5], 0.6, 8); fill('r10', R.r10, [18.4, 1.7, -5.6], 0.4, 4); fill('r11', R.r11, [18.4, 1.7, 1.2], 0.45, 5);
  fill('att1', R.attic, [-6, 4.2, -1.8], 0.32, 8, 1); fill('att2', R.attic, [5, 4.2, -1.8], 0.3, 8, 1); fill('loft', { x0: 11.0, x1: 14.0, z0: -14.85, z1: 3.75 }, [12.6, 4.4, -4], 0.25, 9, 1);

  /* ---------------------------------------------------------------- walking: floors, headroom, colliders */
  const ATTIC_WALK = [{ x0: -13.5, x1: 11.45, z0: -8.1, z1: -0.5 }, { x0: 11.45, x1: 13.92, z0: -14.85, z1: 3.75 }];
  const UNDER = 0.25 * Math.sqrt(1 + PITCH * PITCH) + 0.14; // roof slab + rafters below the roof surface
  function roofUnder(x, z) {
    let y = -1e9;
    if (x <= 11.6 + 3 && z >= HOUSE.z0 && z <= HOUSE.z1 && x >= HOUSE.x0) y = Math.max(y, Y.eave + PITCH * Math.min(z - HOUSE.z0, HOUSE.z1 - z) - UNDER);
    if (x >= BARN.x0 && x <= BARN.x1) y = Math.max(y, Y.eave + PITCH * Math.min(x - BARN.x0, BARN.x1 - x) - UNDER);
    return y;
  }
  function floorAt(x, z, lvl) {
    let y = lvl === 0 ? H(x, z) : null;
    for (const f of ctx.floors) {
      if (f.lvl !== lvl || x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      y = f.y === 'stair' ? stairY(z) : f.y;
    }
    if (lvl === 1 && !(inRect(x, z, STAIR) || ATTIC_WALK.some((a) => inRect(x, z, a)))) return null;
    return y;
  }
  // what the player walks on (footstep sounds): boards, flagstones, straw, snow, mud
  const WOOD = ['r1', 'r2', 'r5', 'r9', 'r10', 'r11', 'hut'], STONE = ['r3', 'r4', 'r6'];
  function surfaceAt(x, z, lvl) {
    if (lvl === 1) return 'wood';
    if (WOOD.some((id) => inRect(x, z, ROOMS[id]))) return 'wood';
    if (STONE.some((id) => inRect(x, z, ROOMS[id]))) return 'stone';
    if (inRect(x, z, ROOMS.r7) || inRect(x, z, ROOMS.r8)) return (z < -5.15 && x > 1.2 && x < 7.2) || (x < 3.6 && z > -4.6 && z < -1.9) ? 'straw' : 'stone';
    if (inRect(x, z, HOUSE) || inRect(x, z, BARN)) return 'wood';
    const [sn, md] = prints.groundAt(x, z);
    return sn > 0.5 ? 'snow' : md > 0.55 ? 'mud' : 'snow';
  }
  // head room: eye height under the roof slopes (auto crouch); null = no head room at all
  function eyeAt(x, z, lvl, feet) {
    if (lvl !== 1) return 1.62;
    const h = roofUnder(x, z) - feet - 0.12;
    return h < 1.0 ? null : Math.min(1.62, h);
  }
  function collide(p, rad, lvl) {
    for (let it = 0; it < 3; it++) for (const s of solids) {
      if (!s.on || s.lvl !== lvl) continue;
      if (p.x < s.x0 - rad || p.x > s.x1 + rad || p.z < s.z0 - rad || p.z > s.z1 + rad) continue;
      const cx = clamp(p.x, s.x0, s.x1), cz = clamp(p.z, s.z0, s.z1), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (rad - d) / d; p.x += dx * k; p.z += dz * k; } else {
        const l = p.x - s.x0, rr = s.x1 - p.x, b = p.z - s.z0, t = s.z1 - p.z, m = Math.min(l, rr, b, t);
        if (m === l) p.x = s.x0 - rad; else if (m === rr) p.x = s.x1 + rad; else if (m === b) p.z = s.z0 - rad; else p.z = s.z1 + rad;
      }
    }
    return p;
  }
  // can the player (radius rad) stand here on this level?
  function standOK(x, z, lvl, feet, rad = 0.22) {
    if (lvl === 0) return Math.abs(x) < 150 && Math.abs(z) < 150;
    for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) if (floorAt(x + dx, z + dz, 1) === null) return false;
    return eyeAt(x, z, 1, feet) !== null;
  }
  // stair level switch with hysteresis
  function levelAfter(p, lvl, feet) {
    if (!inRect(p.x, p.z, STAIR)) return lvl;
    if (lvl === 0 && feet > 2.5) return 1;
    if (lvl === 1 && feet < 2.3) return 0;
    return lvl;
  }
  const insideAt = (p) => (inRect(p.x, p.z, HOUSE) || inRect(p.x, p.z, BARN) || inRect(p.x, p.z, ROOMS.hut)) && p.y < Y.eave + 4;

  /* ---------------------------------------------------------------- doors + ladders: E to use */
  const byId = Object.fromEntries(ctx.doors.map((d) => [d.d.id, d]));
  let msg = { text: '', t: 0 };
  function canReachBolt(D, eye) {
    if (!eye) return false;
    // Use the closed doorway's plane: the pantry bolt cannot be operated from the barn.
    const [hx, , hz] = D.d.hinge;
    const z = (eye.x - hx) * Math.sin(D.d.yaw) + (eye.z - hz) * Math.cos(D.d.yaw);
    return z * Math.sign(D.bolt.group.position.z) > 0.05;
  }
  function boltBlocked(D, eye) {
    return D.bolt && D.t <= 1e-4 && (D.boltT < 1 || D.boltTarget === 0) && !canReachBolt(D, eye);
  }
  function nearest(eye, dir, lvl) {
    let best = null, bs = 1e9;
    const consider = (pt, maxD, item) => {
      const v = new V3().subVectors(pt, eye), d = v.length();
      if (d > maxD) return;
      const a = Math.acos(clamp(v.dot(dir) / Math.max(d, 1e-4), -1, 1));
      if (a > 0.95) return;
      const s = d + a * 1.6;
      if (s < bs) { bs = s; best = item; }
    };
    if (lvl === 0) for (const D of ctx.doors) { // aim point on the leaf's middle line at eye height
      const [hx, hy, hz] = D.d.hinge, cx = Math.cos(D.d.yaw), cz = -Math.sin(D.d.yaw);
      const u = clamp(((eye.x - hx) * cx + (eye.z - hz) * cz) / D.d.w, 0.2, 0.8) * D.d.w;
      const pt = tmpV.set(hx + cx * u, clamp(eye.y, hy + 0.4, hy + D.d.h - 0.3), hz + cz * u);
      const R0 = D.d.into && ROOMS[D.d.into], lab = R0 && inRect(eye.x, eye.z, R0, 0.05) ? D.d.back : D.d.label;
      const label = boltBlocked(D, eye) ? lab + ': засов с другой стороны'
        : (D.target || D.pendingOpen ? 'закрыть ' : 'открыть ') + lab;
      consider(pt.clone(), 2.1, { kind: 'door', D, label });
    }
    for (const L of ctx.ladders) if (L.lvl === lvl) consider(L.at, 2.0, { kind: 'ladder', L, label: L.label });
    return best;
  }
  function use(item, eye) {
    if (!item) return null;
    if (item.kind === 'door') {
      const D = item.D;
      if (D.d.locked && !(D.d.id === 'd16' && D.broken)) { msg = { text: D.d.locked, t: 3 }; return { msg: D.d.locked }; }
      if (D.bolt) {
        // Recheck the actor at the action, even when the hint was obtained from the other side.
        if (boltBlocked(D, eye)) {
          msg = { text: 'Дверь закрыта на засов со стороны кладовой.', t: 3 };
          return { msg: msg.text };
        }
        msg = { text: '', t: 0 };
        if (D.target || D.pendingOpen) {
          D.pendingOpen=false; D.target=0;
          D.boltReturn=canReachBolt(D, eye) ? 0 : 1;
        }
        else { D.boltTarget=1; D.pendingOpen=true; }
        return { door:D.d.id, open:D.pendingOpen, bolt:true };
      }
      if (D.hardware && D.broken) {
        if (D.target || D.pendingOpen) { D.pendingOpen=false; D.target=0; }
        else { D.releaseTarget=1; D.pendingOpen=true; }
        return { door:D.d.id, open:D.pendingOpen, hasp:true };
      }
      const tg = D.target ? 0 : 1;
      D.target = tg;
      if (D.d.pair && byId[D.d.pair]) byId[D.d.pair].target = tg;
      return { door: D.d.id, open: !!tg };
    }
    if (item.kind === 'ladder') return { ladder: item.L };
    return null;
  }

  /* ---------------------------------------------------------------- cutaway */
  let cut = 'none';
  function setCutaway(mode) {
    cut = mode;
    if (groups.roof) groups.roof.visible = mode === 'none';
    if (groups.attic) groups.attic.visible = mode !== 'ground';
    if (groups.upper) groups.upper.visible = mode !== 'ground';
    for (const D of ctx.doors) if (D.d.h > Y.cut + 0.5) D.pivot.visible = mode !== 'ground' || true;
  }

  /* ---------------------------------------------------------------- presets */
  let cur = null, lk = {};
  function setPreset(name) {
    const P0 = FARM_PRESETS[name], p = GFX.enh ? { ...P0, ...(P0.enh || {}) } : P0;
    cur = { ...p, name };
    lk = P0.L;
    treeMesh.visible = !GFX.enh; treeMeshHi.visible = GFX.enh;
    foliage.mesh.visible=GFX.enh;
    SUNK_I.value = GFX.enh ? 1 : 0;
    INDOOR.value = P0.indoor;
    LIGHTS.uScat.value = GFX.enh ? p.scat || 0 : 0;
    const zen = hexf(p.zen), hor = hexf(p.hor), glow = hexf(p.glow);
    const sp = skyGeo.attributes.position, sc = skyGeo.attributes.color;
    for (let i = 0; i < sp.count; i++) {
      const e = sp.getY(i) / 150;
      let c = e <= 0 ? hor : mixc(hor, zen, Math.pow(clamp(e / 0.75, 0, 1), 0.7));
      if (e > -0.05 && e < 0.2) c = mixc(c, glow, (1 - Math.abs(e - 0.03) / 0.17) * 0.6);
      sc.setXYZ(i, c[0], c[1], c[2]);
    }
    sc.needsUpdate = true;
    LIGHTS.uSkyAmb.value.setRGB(...p.sky);
    LIGHTS.uGroundAmb.value.setRGB(...p.ground);
    LIGHTS.uSunDir.value.set(...p.sunDir).normalize();
    LIGHTS.uSunCol.value.setRGB(...p.sun);
    LIGHTS.uFogCol.value.setRGB(...hexf(p.fog));
    fogBase = { near: p.near, far: p.far };
    applyFog();
    terrainMat.uniforms.uTint.value.setRGB(...P0.terrain);
    treeMat.uniforms.uTint.value.setRGB(p.tree, p.tree, p.tree); treeMatHi.uniforms.uTint.value.setRGB(p.tree, p.tree, p.tree);
    foliage.mat.uniforms.uTint.value.setRGB(p.tree,p.tree,p.tree);
    lineMat.uniforms.uTint.value.setRGB(...mixc(hexf(p.fog), [0, 0, 0], name === 'day' ? 0.32 : 0.55));
    flakeMat.uniforms.uColor.value.setRGB(...(name === 'night' ? [0.55, 0.58, 0.66] : name === 'day' ? [0.97, 0.98, 1.0] : [0.82, 0.85, 0.93]));
    flakeGeo.setDrawRange(0, Math.round(NS * P0.flakes));
    for (const pf of puffs) pf.m.uniforms.uTint.value.setRGB(...P0.smoke);
    // lit windows + flames
    const wk = GFX.enh ? 1.45 : 1;
    const gk = { r1: lk.r1, r5: lk.r5, r4: Math.max(lk.kitchen, lk.stove * 0.35) };
    for (const id of ['r1', 'r4', 'r5']) {
      const k = gk[id] * wk;
      glowMats[id].uniforms.uTint.value.setRGB(k * 0.95, k * 0.8, k * 0.6);
      for (const m of glowMesh[id] || []) m.visible = gk[id] > 0;
    }
    for (const f of flames) f.m.visible = (lk[f.id] || 0) > 0;
    stoveGlow.visible = !!ctx.stoveFire && lk.stove > 0;
    stoveMat.uniforms.uTint.value.setRGB(0.75 * lk.stove, 0.3 * lk.stove, 0.07 * lk.stove);
    for (const L of LT) L.k = L.key === 'fill' ? lk.fill : lk[L.key] || 0;
    setDog(P0.dog, 0); DOG.base = P0.dog; DOG.night = name !== 'day'; DOG.left = 0; DOG.on = false;
    LIGHTS.uSnowCov.value = P0.snowCov ?? 0.62;
    animals.setPreset(name);
    return cur;
  }
  let fogBase = { near: 10, far: 100 }, fogWide = false;
  function applyFog() {
    LIGHTS.uFogNear.value = fogWide ? Math.max(fogBase.near, 70) : fogBase.near;
    LIGHTS.uFogFar.value = fogWide ? Math.max(fogBase.far, 280) : fogBase.far;
  }
  function setWideFog(on) { fogWide = !!on; applyFog(); }

  /* ---------------------------------------------------------------- per frame */
  let inside = 0;
  const tmpV = new V3(), slots = [];
  function update(dt, time, camera, opts = {}) {
    const cp = camera.position;
    sky.position.copy(cp);
    const lvlCam = opts.lvl ?? (cp.y > Y.attic + 0.3 && insideAt(cp) ? 1 : 0);
    const isIn = opts.orbit ? 0 : insideAt(cp) ? 1 : 0;
    inside += (isIn - inside) * Math.min(1, dt * 3);
    if (opts.snap) inside = isIn;
    // snowfall around the camera (not indoors, not in the overview)
    flakes.visible = !isIn && !opts.orbit && cur && cur.flakes > 0;
    if (flakes.visible) {
      for (let i = 0; i < NS; i++) {
        const sp2 = seeds[i * 2 + 1];
        spos[i * 3 + 1] -= dt * 0.85 * sp2;
        spos[i * 3] += dt * (0.25 + Math.sin(time * 0.7 + seeds[i * 2]) * 0.22);
        spos[i * 3 + 2] += dt * Math.cos(time * 0.5 + seeds[i * 2]) * 0.12;
        const wrap = (v, size, c) => c + ((((v - c) % size) + size * 1.5) % size) - size / 2;
        fpos[i * 3] = wrap(spos[i * 3], box.x, cp.x);
        fpos[i * 3 + 1] = (((spos[i * 3 + 1] % box.y) + box.y) % box.y) - 1.0 + Math.max(0, cp.y - 6);
        fpos[i * 3 + 2] = wrap(spos[i * 3 + 2], box.z, cp.z);
      }
      flakeGeo.attributes.position.needsUpdate = true;
    }
    // chimney smoke
    const smokeOn = cut === 'none';
    for (const pf of puffs) {
      pf.age += dt; if (pf.age > pf.life) pf.age -= pf.life;
      const a = pf.age / pf.life, m = pf.mesh;
      m.visible = smokeOn;
      m.position.set(smokeAt.x + a * a * 3.2 + Math.sin(time * 0.6 + pf.seed) * 0.15 * a, smokeAt.y + a * 4.2, smokeAt.z + Math.sin(pf.seed) * 0.4 * a);
      const s = 0.45 + a * 2.1; m.scale.set(s, s, s);
      m.quaternion.copy(camera.quaternion);
      pf.m.uniforms.uOpacity.value = smooth(clamp(a / 0.12, 0, 1)) * (1 - smooth(a)) * 0.55;
    }
    // flames face the camera and flicker
    for (const f of flames) {
      if (!f.m.visible) continue;
      f.m.quaternion.copy(camera.quaternion);
      const fl = 1 + Math.sin(time * 13 + f.ph) * 0.06 + Math.sin(time * 31 + f.ph * 2) * 0.04;
      f.m.scale.set(1, fl, 1);
    }
    if (stoveGlow.visible) { stoveGlow.quaternion.copy(camera.quaternion); stoveMat.uniforms.uOpacity.value = 0.75 + Math.sin(time * 5.3) * 0.12 + Math.sin(time * 11.7) * 0.08; }
    // doors
    for (const D of ctx.doors) {
      if (D.hardware && D.broken) {
        D.releaseT += clamp(D.releaseTarget-D.releaseT,-dt*1.3,dt*1.3);
        D.hardware.lock.setRelease(D.releaseT);
        if(D.pendingOpen && D.releaseT>.999) D.haspTarget=1;
        D.haspT += clamp(D.haspTarget-D.haspT,-dt*2,dt*2);
        D.hardware.leafHasp.setOpen(D.haspT);
        if (D.pendingOpen && D.haspT > .99) { D.pendingOpen=false; D.target=1; }
        if (!D.pendingOpen && D.target===0 && D.t<.02) D.haspTarget=0;
        if (!D.pendingOpen && D.target===0 && D.t<.02 && D.haspT<.001) D.releaseTarget=0;
      }
      if (D.bolt) {
        D.boltT += clamp(D.boltTarget-D.boltT,-dt*2.5,dt*2.5); D.bolt.setOpen(D.boltT);
        if (D.pendingOpen && D.boltT >= 1) { D.pendingOpen=false; D.target=1; }
        if (!D.pendingOpen && D.target===0 && D.t<=1e-4) D.boltTarget=D.boltReturn;
      }
      if (Math.abs(D.t - D.target) > 1e-4) {
        D.t += clamp(D.target - D.t, -dt * 1.5, dt * 1.5);
        D.pivot.rotation.y = D.d.yaw + D.d.swing * smooth(D.t) * 1.62;
      }
      D.solid.on = D.t < 0.12;
    }
    // dog
    if (dog.group.visible && cp.distanceTo(dog.group.position) < 45) dog.update(time);
    if (!opts.snap && animals.onSound) {
      const at = () => dog.group.position.clone().setY(0.45), ph = time % 1.5, wrap = ph < DOG.ph; DOG.ph = ph;
      DOG.next -= dt; DOG.chain -= dt;
      if (!DOG.on && DOG.left === 0 && DOG.next <= 0) { DOG.left = 1 + Math.floor(Math.random() * 2.4); DOG.next = DOG.night ? 70 + Math.random() * 150 : 240 + Math.random() * 360; }
      if (wrap) { // a bark cycle starts: first one gets the pose (and a jerk of the chain), the cycle after the last one ends it
        if (DOG.left > 0) {
          if (!DOG.on) { DOG.on = true; dogAnim = 'bark'; dog.setAnim('bark', time, 0.25); if (Math.random() < 0.6) animals.onSound('chain', at(), {}); }
          animals.onSound('bark', at(), {}); DOG.left--;
        } else if (DOG.on) { DOG.on = false; dogAnim = DOG.base; dog.setAnim(DOG.base, time, 0.5); }
      }
      if (DOG.chain <= 0) { DOG.chain = 50 + Math.random() * 140; if (!DOG.on) animals.onSound('chain', at(), { vol: 0.55 }); }
    }
    animals.update(dt, time, opts.player || { pos: cp, lvl: lvlCam, inside: !!isIn });
    prints.update(time, cur && cur.flakes > 0.5 ? 140 : 320);
    track.update(time); trail.update(dt, cur && cur.flakes > 0.5 ? 140 : 320);
    // pick the 3 strongest scene lights for this view
    slots.length = 0;
    for (const L of LT) {
      if (L.k <= 0) { L.fade = 0; continue; }
      const d = cp.distanceTo(L.pos), lum = (L.col[0] + L.col[1] + L.col[2]) * L.k;
      let s = lum * Math.max(0, 1 - d / (L.range + 9));
      const inBox = L.box && cp.x > L.box[0] && cp.x < L.box[2] && cp.z > L.box[1] && cp.z < L.box[3];
      if (L.out) s *= isIn ? 0.15 : 1.2; else s *= isIn ? (inBox ? 3 : 0.6) : 0.12;
      if (!L.out && L.lvl !== lvlCam) s *= 0.08;
      if (s > 0.004) slots.push([s, L]);
    }
    slots.sort((a, b) => b[0] - a[0]);
    for (let i = 1; i <= 3; i++) {
      const e = slots[i - 1];
      if (!e) { LIGHTS.uPtCol.value[i].setRGB(0, 0, 0); continue; }
      const L = e[1];
      L.fade = Math.min(1, L.fade + dt * 4);
      const f = L.k * (opts.snap ? 1 : L.fade) * (1 + (L.flick ? (Math.sin(time * 9.7 + L.ph) * 0.6 + Math.sin(time * 23.1 + L.ph * 3) * 0.4) * L.flick : 0));
      LIGHTS.uPtPos.value[i].copy(L.pos);
      LIGHTS.uPtCol.value[i].setRGB(L.col[0] * f, L.col[1] * f, L.col[2] * f);
      LIGHTS.uPtRange.value[i] = L.range;
      if (L.box) LIGHTS.uPtBox.value[i].set(...L.box); else LIGHTS.uPtBox.value[i].set(-1e4, -1e4, 1e4, 1e4);
      LIGHTS.uPtScat.value[i] = L.scat;
    }
    for (const L of LT) if (!slots.slice(0, 3).some((e) => e[1] === L)) L.fade = Math.max(0, L.fade - dt * 4);
    // eye adaptation indoors: retro raises the indoor ambient, the enhanced look gets more exposure (main.js)
    if (cur) INDOOR.value = FARM_PRESETS[cur.name].indoor * (GFX.enh ? 1 : 1 + 0.6 * inside);
    if (msg.t > 0) msg.t -= dt;
    return { inside, lvlCam };
  }

  return {
    scene, groups, ctx, setPreset, update, setCutaway, setWideFog, floorAt, eyeAt, collide, standOK, levelAfter, nearest, use, insideAt,
    get preset() { return cur; }, get message() { return msg.t > 0 ? msg.text : ''; }, get cut() { return cut; },
    spots: SPOTS, doors: ctx.doors, ladders: ctx.ladders, dog, terrain, info: () => ({ tris: Math.round(tris), solids: solids.length, lights: LT.length, doors: ctx.doors.length }),
    setHutLock: (state) => { const d=byId.d16; if(d && d.setBroken) { d.setBroken(state === 'broken'); d.target=0; d.t=0; d.pivot.rotation.y=d.d.yaw; d.solid.on=true; } },
    height: H, animals, prints, track, trail, surfaceAt, barkNow: () => { DOG.next = 0; },
  };
}
