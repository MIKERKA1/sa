// "Believe It" — test yard for the viewmodel: snowy farmstead (log house, barn, fence, spruces, snowfall).
// Everything is PS1-lit through the shared LIGHTS uniforms; presets switch dusk / night / overcast day.
// Firewood corner by the barn: woodpile, chopping block, sawhorse; the splitting axe sits in the block or leans on the barn wall.
// By the house: porch steps at the door, a plank kennel with a snowy roof, a tin bowl and the dog (laika mutt).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ps1Material, ps1PointsMaterial, LIGHTS } from '../engine/ps1.js';
import { part } from '../models/props.js';
import { MeshBuilder } from '../engine/geo.js';
import { makeAxe } from '../models/axe.js';
import { makeDog } from '../models/dog.js';
import { PixelCanvas, valueNoise, rng, hex, mixc, mulc, clamp, lerp, smooth } from '../engine/util.js';

const V3 = THREE.Vector3;
const hexf = (h) => hex(h).map((x) => x / 255);
const deg2rad = (d) => (d * Math.PI) / 180;

/* ---------------------------------------------------------------- textures */
function snowTex() {
  const pc = new PixelCanvas(64, 64), n = valueNoise(11, 8, 8), m = valueNoise(12, 4, 4), r = rng(13);
  pc.each((x, y) => {
    const v = 228 + (n(x / 8, y / 8) - 0.5) * 16 + (m(x / 16, y / 16) - 0.5) * 14 + (r() - 0.5) * 6;
    pc.set(x, y, [v * 0.97, v * 0.985, v]);
    if (r() < 0.012) pc.set(x, y, [255, 255, 255]);
  });
  return pc.texture(true);
}
function logTex() { // horizontal logs, 4 per tile (tile = 1 m)
  const pc = new PixelCanvas(32, 64), n = valueNoise(21, 4, 16), r = rng(22);
  pc.each((x, y) => {
    const k = (y % 16) / 15, round = Math.sin(Math.PI * k);
    let c = mixc([52, 40, 31], [104, 84, 64], 0.25 + 0.75 * round);
    c = mulc(c, 0.9 + (n(x / 8, y / 4) - 0.5) * 0.3 + (r() - 0.5) * 0.08);
    if (y % 16 === 0) c = [30, 24, 20];
    if (y % 16 === 15 || y % 16 === 1) c = mulc(c, 0.75);
    pc.set(x, y, c);
  });
  return pc.texture(true);
}
function plankTex() { // vertical weathered boards (tile = 1 m)
  const pc = new PixelCanvas(32, 64), n = valueNoise(31, 16, 4), r = rng(32);
  const tone = Array.from({ length: 6 }, () => 0.86 + r() * 0.2);
  pc.each((x, y) => {
    const b = Math.floor(x / 6);
    let c = mulc([96, 84, 72], tone[b % 6] * (0.92 + (n(x / 2, y / 16) - 0.5) * 0.35) + (r() - 0.5) * 0.06);
    if (x % 6 === 0) c = [34, 29, 25];
    if ((y + b * 13) % 64 === 3) c = mulc(c, 0.6);
    pc.set(x, y, c);
  });
  return pc.texture(true);
}
function needleTex() { // spruce tiers: dark needles, snow clumps on the upper part
  const pc = new PixelCanvas(32, 32), n = valueNoise(41, 8, 8), r = rng(42);
  pc.each((x, y) => {
    const v = 0.8 + (n(x / 4, y / 4) - 0.5) * 0.6 + (r() - 0.5) * 0.2;
    pc.set(x, y, mulc([40, 56, 48], v));
    const s = n((x + 7) / 4, (y + 3) / 4) + (y / 32) * 0.55 - 0.62;
    if (s > 0.05) pc.set(x, y, mulc([226, 232, 240], 0.9 + r() * 0.1));
  });
  return pc.texture(true);
}
function windowTex() { // 4 panes in a dark frame, warm glass with a curtain hint
  const pc = new PixelCanvas(16, 16), r = rng(51);
  pc.each((x, y) => {
    let c = mixc([255, 214, 140], [236, 160, 84], y / 15 * 0.6 + r() * 0.1);
    if (y > 11 && (x < 4 || x > 11)) c = mulc(c, 0.72);
    if (x <= 1 || x >= 14 || y <= 1 || y >= 14 || x === 7 || x === 8 || y === 8) c = [44, 34, 26];
    pc.set(x, y, c);
  });
  return pc.texture(false);
}
function printTex() { // boot print, alpha cut
  const pc = new PixelCanvas(16, 32, [150, 162, 186]);
  pc.each((x, y) => {
    const fx = (x - 7.5) / 6.5, sole = (y - 20) / 10, heel = (y - 6) / 5;
    const inSole = fx * fx + sole * sole < 1 && y > 11, inHeel = fx * fx * 1.4 + heel * heel < 1;
    const a = inSole || inHeel ? 255 : 0;
    const edge = (inSole && fx * fx + sole * sole > 0.6) || (inHeel && fx * fx * 1.4 + heel * heel > 0.55);
    pc.set(x, y, edge ? [160, 172, 198] : [112, 124, 154], a);
  });
  return pc.texture(false);
}
function treelineTex() { // jagged spruce-top silhouette, alpha cut
  const pc = new PixelCanvas(128, 32, [255, 255, 255]), r = rng(61);
  const top = new Float32Array(128);
  for (let i = 0; i < 128; i++) top[i] = 10;
  let x = 0;
  while (x < 128) {
    const w = 3 + Math.floor(r() * 5), h = 10 + r() * 20, cx = x + w;
    for (let i = -w * 2; i <= w * 2; i++) { const xx = (cx + i + 128) % 128; top[xx] = Math.max(top[xx], h - Math.abs(i) * (h / (w * 2.2))); }
    x += w + Math.floor(r() * 4);
  }
  pc.each((x2, y) => pc.set(x2, y, [255, 255, 255], y < top[x2] ? 255 : 0));
  return pc.texture(true);
}

/* ---------------------------------------------------------------- geometry helpers */
function endsTex() { // woodpile face: staggered log ends, 4 per row (tile = 0.64 m)
  const pc = new PixelCanvas(32, 32, [24, 19, 15]), n = valueNoise(61, 8, 8), r = rng(62);
  const tone = Array.from({ length: 64 }, () => 0.78 + r() * 0.36), rad = Array.from({ length: 64 }, () => 3.0 + r() * 0.7);
  pc.each((x, y) => {
    const row = Math.floor(y / 8), ox = row % 2 ? 4 : 0, col = Math.floor(((x + ox) % 32) / 8), id = row * 4 + col;
    const lx = ((x + ox) % 8) - 3.5, ly = (y % 8) - 3.5, d = Math.hypot(lx, ly * 1.08);
    let c = [24, 19, 15];
    if (d < rad[id]) {
      c = mulc((d * 1.5 + n(x / 2, y / 2)) % 2 < 0.65 ? [132, 104, 74] : [168, 138, 100], tone[id]);
      if (Math.abs(lx + ly * 0.3) < 0.5 && tone[id] > 1.0) c = mulc(c, 0.55); // split crack
    } else if (d < rad[id] + 0.9) c = mulc([62, 48, 37], tone[id]);
    pc.set(x, y, mulc(c, 0.94 + r() * 0.12));
  });
  return pc.texture(true);
}
function barkTex() { // dark grey-brown bark, vertical furrows (tile = 0.5 m)
  const pc = new PixelCanvas(32, 32), n = valueNoise(71, 16, 4), r = rng(72);
  pc.each((x, y) => {
    const f = n(x / 1.5, y / 6);
    let c = mixc([46, 38, 32], [92, 80, 68], f);
    if (f < 0.3) c = [30, 25, 21];
    pc.set(x, y, mulc(c, 0.92 + r() * 0.16));
  });
  return pc.texture(true);
}
function ringTex() { // chopping-block top: growth rings, radial checks, axe marks
  const pc = new PixelCanvas(32, 32), n = valueNoise(81, 8, 8), r = rng(82);
  pc.each((x, y) => {
    const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    let c = (d * 0.9 + n(x / 3, y / 3) * 1.5) % 2 < 0.7 ? [118, 92, 66] : [150, 122, 90];
    if (d > 14.5) c = [58, 46, 36];
    if (Math.abs(((a + 3.4) % 1.3) - 0.65) < 0.025 && d > 4 && d < 14) c = mulc(c, 0.5);
    if ((Math.abs(dx * 0.6 - dy - 3) < 0.6 || Math.abs(dx + dy * 0.4 + 5) < 0.5) && d < 12) c = mulc(c, 0.62); // axe marks
    pc.set(x, y, mulc(c, 0.93 + r() * 0.14));
  });
  return pc.texture(true);
}

// World-space planar UVs per triangle (dominant normal axis), `texel` metres per texture tile.
function autoUV(g, texel = 1) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    for (let k = i; k < i + 3; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      if (ay >= ax && ay >= az) uv.setXY(k, x / texel, z / texel);
      else if (ax >= az) uv.setXY(k, z / texel, y / texel);
      else uv.setXY(k, x / texel, y / texel);
    }
  }
  return g;
}
const B = (sx, sy, sz, o) => part(new THREE.BoxGeometry(sx, sy, sz), o);
function mesh(parts, map, opts = {}, texel = 1) {
  const g = autoUV(mergeGeometries(parts), texel);
  const m = new THREE.Mesh(g, ps1Material({ map, ...opts }));
  m.frustumCulled = false;
  return m;
}
// Triangular prism for a gable: base width W (x), height H, length D (z), base at y0.
const gable = (W, H, D, cx, y0, cz, col) => part(new THREE.CylinderGeometry(1, 1, D, 3, 1), { pos: [cx, y0 + H / 3, cz], rot: [-Math.PI / 2, 0, 0], scale: [W / 1.732, 1, H / 1.5], col });
// Two roof slabs over a ridge along z.
function roof(W, H, D, cx, y0, cz, over = 0.45, th = 0.22) {
  const phi = Math.atan2(H, W / 2), s = Math.hypot(W / 2, H) + over;
  return [-1, 1].map((sd) => {
    const mx = cx + sd * (W / 4 + (over / 2) * Math.cos(phi)) - sd * Math.sin(phi) * 0, my = y0 + H / 2 - (over / 2) * Math.sin(phi) + th / 2 / Math.cos(phi);
    return B(s, th, D + over * 2, { pos: [mx, my, cz], rot: [0, 0, -sd * phi], col: [1, 1, 1] });
  });
}

/* ---------------------------------------------------------------- the yard */
export const PRESETS = {
  dusk: {
    zen: '#1c2539', hor: '#58607a', glow: '#7a6f7c', fog: '#4f5770', near: 9, far: 85,
    sky: [0.4, 0.45, 0.6], ground: [0.28, 0.31, 0.42], sunDir: [-0.55, 0.16, -0.82], sun: [0.15, 0.12, 0.14],
    window: 1, winLight: [0.9, 0.55, 0.26], snow: [0.82, 0.86, 0.95], tree: 0.62,
  },
  night: {
    zen: '#03050a', hor: '#0b0f18', glow: '#0e121c', fog: '#090c14', near: 2.5, far: 30,
    sky: [0.1, 0.12, 0.18], ground: [0.07, 0.08, 0.12], sunDir: [0.4, 0.6, -0.6], sun: [0.06, 0.07, 0.1],
    window: 0.9, winLight: [0.75, 0.45, 0.2], snow: [0.7, 0.75, 0.85], tree: 0.6,
  },
  day: {
    zen: '#8c96a2', hor: '#c6cbd0', glow: '#cfd2d4', fog: '#bfc4c9', near: 14, far: 125,
    sky: [0.9, 0.92, 0.96], ground: [0.62, 0.63, 0.67], sunDir: [0.3, 0.8, 0.45], sun: [0.24, 0.23, 0.21],
    window: 0, winLight: [0, 0, 0], snow: [0.95, 0.96, 0.98], tree: 0.72,
  },
};

export function createYard() {
  const scene = new THREE.Scene();
  const T = { snow: snowTex(), log: logTex(), plank: plankTex(), needle: needleTex(), win: windowTex(), print: printTex(), line: treelineTex(), ends: endsTex(), bark: barkTex(), ring: ringTex() };
  const r = rng(101);

  /* sky dome (follows the camera) */
  const skyGeo = new THREE.SphereGeometry(150, 18, 10).toNonIndexed();
  skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const sky = new THREE.Mesh(skyGeo, ps1Material({ lit: 0, fog: 0, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  /* ground: fine grid near the yard, coarse outside */
  const ground = new MeshBuilder();
  const hn = valueNoise(103, 16, 16);
  const H = (x, z) => { const d = Math.max(Math.abs(x), Math.abs(z)); const k = smooth(clamp((d - 26) / 20, 0, 1)); return k * ((hn(x / 20 + 8, z / 20 + 8) - 0.5) * 2.4 + 0.4); };
  const gcol = (x, z) => { const t = 0.95 + (hn(x / 3 + 1, z / 3 + 2) - 0.5) * 0.1; return [t, t, t]; };
  const cell = (x0, z0, s) => {
    const P = [[x0, z0], [x0 + s, z0], [x0 + s, z0 + s], [x0, z0 + s]].map(([x, z]) => new V3(x, H(x, z), z));
    const tri = (a, b, c) => {
      const nn = new V3().subVectors(P[b], P[a]).cross(new V3().subVectors(P[c], P[a])).normalize();
      for (const i of [a, b, c]) ground.v(P[i], nn, [P[i].x / 4, P[i].z / 4], gcol(P[i].x, P[i].z));
    };
    tri(0, 2, 1); tri(0, 3, 2);
  };
  for (let x = -26; x < 26; x += 1) for (let z = -26; z < 26; z += 1) cell(x, z, 1);
  for (let i = 0; i < 50; i++) for (let j = 0; j < 50; j++) {
    const x = -162.5 + i * 6.5, z = -162.5 + j * 6.5;
    if (i >= 21 && i < 29 && j >= 21 && j < 29) continue;
    cell(x, z, 6.5);
  }
  const groundMat = ps1Material({ map: T.snow });
  const groundMesh = new THREE.Mesh(ground.geometry(), groundMat);
  groundMesh.frustumCulled = false;
  scene.add(groundMesh);

  /* log house (front faces +X) */
  const HX = -9, HZ = -5, HW = 6, HD = 8.4, HH = 3.0;
  const house = new THREE.Group();
  house.add(mesh([
    B(HW, HH, HD, { pos: [HX, HH / 2, HZ] }),
    gable(HW, 2.3, HD - 0.05, HX, HH, HZ, [0.86, 0.86, 0.86]),
  ], T.log));
  house.add(mesh(roof(HW, 2.3, HD, HX, HH, HZ), T.snow, {}, 3));
  house.add(mesh([B(0.62, 1.9, 0.62, { pos: [HX + 0.9, HH + 2.0, HZ - 1.6], col: [0.5, 0.46, 0.44] }), B(0.72, 0.12, 0.72, { pos: [HX + 0.9, HH + 2.99, HZ - 1.6], col: [2.4, 2.45, 2.6] })], T.plank));
  house.add(mesh([
    B(0.1, 2.0, 1.0, { pos: [HX + HW / 2 + 0.05, 1.0, HZ + 2.6], col: [0.55, 0.5, 0.46] }),
    B(0.16, 0.12, 1.2, { pos: [HX + HW / 2 + 0.08, 2.06, HZ + 2.6], col: [0.45, 0.42, 0.4] }),
    ...[-2.4, 0.2].flatMap((z) => [B(0.16, 0.1, 1.15, { pos: [HX + HW / 2 + 0.08, 0.96, HZ + z], col: [0.5, 0.46, 0.42] }), B(0.16, 0.1, 1.15, { pos: [HX + HW / 2 + 0.08, 2.0, HZ + z], col: [0.5, 0.46, 0.42] })]),
  ], T.plank));
  const winMat = ps1Material({ map: T.win, lit: 0, fog: 0.6 });
  const winParts = [-2.4, 0.2].map((z) => part(new THREE.PlaneGeometry(0.95, 0.95), { pos: [HX + HW / 2 + 0.02, 1.48, HZ + z], rot: [0, Math.PI / 2, 0] }));
  winParts.push(part(new THREE.PlaneGeometry(0.8, 0.8), { pos: [HX + 1.2, 1.5, HZ + HD / 2 + 0.02], rot: [0, 0, 0] }));
  const windows = new THREE.Mesh(mergeGeometries(winParts), winMat);
  house.add(windows);
  scene.add(house);
  const winLightPos = new V3(HX + HW / 2 + 0.9, 1.3, HZ - 1.1);

  /* barn (doors on the +Z gable) */
  const BX = 5, BZ = -19, BW = 8, BD = 10, BH = 4.0;
  const barn = new THREE.Group();
  const front = BZ + BD / 2;
  barn.add(mesh([
    B(BW, BH, BD, { pos: [BX, BH / 2, BZ] }),
    gable(BW, 3.1, BD - 0.05, BX, BH, BZ, [0.92, 0.92, 0.92]),
  ], T.plank, {}, 1.4));
  barn.add(mesh(roof(BW, 3.1, BD, BX, BH, BZ, 0.5), T.snow, {}, 3));
  barn.add(mesh([
    B(1.55, 3.0, 0.1, { pos: [BX - 0.8, 1.5, front + 0.06], col: [0.62, 0.56, 0.5] }),
    B(1.55, 3.0, 0.1, { pos: [BX + 0.8, 1.5, front + 0.06], col: [0.58, 0.53, 0.48] }),
    ...[-0.8, 0.8].flatMap((x) => [0.55, 2.45].map((y) => B(1.45, 0.16, 0.06, { pos: [BX + x, y, front + 0.13], col: [0.46, 0.42, 0.38] }))),
    ...[-0.8, 0.8].map((x) => B(0.16, 2.2, 0.05, { pos: [BX + x, 1.5, front + 0.13], rot: [0, 0, x < 0 ? -0.6 : 0.6], col: [0.46, 0.42, 0.38] })),
    B(1.9, 0.14, 0.12, { pos: [BX, 1.45, front + 0.2], col: [0.72, 0.66, 0.58] }),
    B(1.0, 0.95, 0.08, { pos: [BX, BH + 0.9, front + 0.05], col: [0.42, 0.38, 0.35] }),
  ], T.plank));
  scene.add(barn);

  /* fence */
  const fence = [];
  const fenceLine = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.2)), ang = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) {
      const x = lerp(x0, x1, i / n), z = lerp(z0, z1, i / n), h = 1.15 + (r() - 0.5) * 0.15;
      fence.push(B(0.12, h, 0.12, { pos: [x, h / 2 - 0.15, z], rot: [0, r() * 0.4, (r() - 0.5) * 0.08], col: [0.55, 0.52, 0.5] }));
      fence.push(B(0.16, 0.06, 0.16, { pos: [x, h - 0.12, z], col: [2.6, 2.65, 2.8] }));
    }
    for (const y of [0.42, 0.86]) fence.push(B(len, 0.07, 0.05, { pos: [(x0 + x1) / 2, y + (r() - 0.5) * 0.05, (z0 + z1) / 2], rot: [0, -ang, (r() - 0.5) * 0.02], col: [0.5, 0.47, 0.45] }));
  };
  fenceLine(-16, 10, 16, 10); fenceLine(14, 10, 14, -12); fenceLine(14, -12, 10.5, -14.5); fenceLine(-16, 10, -16, -14);
  scene.add(mesh(fence, T.plank));

  /* spruces */
  const trees = [];
  const spruce = (x, z, s) => {
    const tiers = [[1.9, 3.2, 1.0], [1.45, 2.7, 2.6], [0.95, 2.3, 4.0], [0.5, 1.5, 5.3]];
    trees.push(part(new THREE.CylinderGeometry(0.16 * s, 0.2 * s, 1.4 * s, 5, 1), { pos: [x, 0.5 * s, z], col: [0.45, 0.36, 0.3] }));
    const tint = 0.85 + r() * 0.3, rot = r() * 6;
    for (const [rr, hh, yy] of tiers) {
      const g = new THREE.CylinderGeometry(0, rr * s, hh * s, 7, 1, false, rot);
      trees.push(part(g, { pos: [x, (yy + hh / 2) * s, z], col: [tint, tint, tint] }));
    }
  };
  for (let i = 0; i < 95; i++) {
    const a = r() * Math.PI * 2, d = 27 + r() * 50, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 6 && Math.abs(x) < 20) continue;
    spruce(x, z, 0.9 + r() * 0.9);
  }
  for (const [x, z, s] of [[-3, -29, 1.4], [9.5, -27, 1.2], [16, -24, 1.0], [-15, -18, 1.3], [-19, -6, 1.1], [19, -9, 1.3], [21, 3, 1.0], [-22, 6, 1.2]]) spruce(x, z, s);
  const treeMesh = new THREE.Mesh(mergeGeometries(trees), ps1Material({ map: T.needle }));
  treeMesh.frustumCulled = false;
  // per-tier UVs (cylinder UVs: u around, v up) -> scale so the needle texture repeats a few times around
  const tuv = treeMesh.geometry.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setX(i, tuv.getX(i) * 3);
  scene.add(treeMesh);

  /* firewood corner, left of the barn doors: woodpile, chopping block, sawhorse */
  const WP = { x: -1.6, z: -13.55 }, BLK = { x: -1.0, z: -11.8, r: 0.27, h: 0.48 }, SH = { x: -2.85, z: -11.95 };
  scene.add(mesh([B(2.6, 1.25, 0.6, { pos: [WP.x, 0.625, WP.z], col: [1, 1, 1] })], T.ends, {}, 0.64));
  scene.add(mesh([
    ...[-1.38, 1.38].flatMap((dx) => [-0.36, 0.36].map((dz) => B(0.09, 1.38, 0.09, { pos: [WP.x + dx, 0.66, WP.z + dz], rot: [0, 0, dx * 0.02], col: [0.5, 0.46, 0.42] }))),
    B(0.08, 0.06, 0.84, { pos: [WP.x - 1.38, 1.3, WP.z], col: [0.46, 0.42, 0.38] }), B(0.08, 0.06, 0.84, { pos: [WP.x + 1.38, 1.3, WP.z], col: [0.46, 0.42, 0.38] }),
    // sawhorse: two X frames, a stretcher and a log in the crotch
    ...[-0.45, 0.45].flatMap((dx) => [-0.5, 0.5].map((a) => B(0.07, 1.02, 0.07, { pos: [SH.x + dx, 0.43, SH.z], rot: [a, 0, 0], col: [0.62, 0.55, 0.47] }))),
    B(0.96, 0.06, 0.06, { pos: [SH.x, 0.36, SH.z], col: [0.55, 0.49, 0.43] }),
  ], T.plank));
  scene.add(mesh([
    part(new THREE.CylinderGeometry(BLK.r, BLK.r + 0.04, BLK.h, 8, 1, true), { pos: [BLK.x, BLK.h / 2, BLK.z], col: [1, 1, 1] }),
    part(new THREE.CylinderGeometry(0.1, 0.1, 1.25, 7), { pos: [SH.x + 0.05, 0.7, SH.z], rot: [0, 0.08, Math.PI / 2], col: [1, 1, 1] }),
    ...[[-0.35, -11.35, 0.4], [-1.55, -11.25, 1.9], [-0.55, -12.35, 2.6]].map(([x, z, a]) => B(0.13, 0.12, 0.4, { pos: [x, 0.05, z], rot: [0, a, 0.12], col: [1, 1, 1] })),
  ], T.bark, {}, 0.5));
  const blockTop = new THREE.Mesh(part(new THREE.CircleGeometry(BLK.r, 8), { pos: [BLK.x, BLK.h + 0.001, BLK.z], rot: [-Math.PI / 2, 0, 0] }), ps1Material({ map: T.ring }));
  scene.add(blockTop);
  scene.add(mesh([
    B(2.72, 0.09, 0.72, { pos: [WP.x, 1.3, WP.z], col: [1, 1, 1] }),
    B(1.0, 0.05, 0.16, { pos: [SH.x + 0.05, 0.8, SH.z], col: [1, 1, 1] }),
  ], T.snow, {}, 2));

  /* the splitting axe in the world: bit sunk in the chopping block / leaning on the barn wall by the doors */
  const placeAxe = (bit, haft, anchor, at) => {
    const ax = makeAxe(), X = bit.clone().normalize(), Y = haft.clone().normalize(), Z = new V3().crossVectors(X, Y);
    ax.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    ax.group.position.copy(at).sub(anchor.clone().applyQuaternion(ax.group.quaternion));
    scene.add(ax.group);
    return ax;
  };
  const up = new V3(0, 1, 0), hd = new V3(0.989, 0, 0.145).normalize(), tilt = deg2rad(22);
  const toKnob = hd.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(up, Math.sin(tilt));
  const bitDown = up.clone().negate().addScaledVector(toKnob, up.dot(toKnob)).normalize();
  const blockAxe = placeAxe(bitDown, toKnob.clone().negate(), new V3(0.13, 0.63, 0), new V3(BLK.x, BLK.h, BLK.z).addScaledVector(bitDown, 0.028));
  const lean = new V3(0, Math.sqrt(0.7 * 0.7 - 0.29 * 0.29), -0.29);
  const wallAxe = placeAxe(new V3(1, 0, 0), lean, new V3(0, 0, 0), new V3(BX + 2.25, -0.01, front + 0.315));
  function setAxe(where) {
    blockAxe.group.visible = where === 'block' || where === 'both';
    wallAxe.group.visible = where === 'wall' || where === 'both';
  }
  setAxe('block');

  /* porch steps at the house door (front wall x = HX + HW / 2) */
  const FX = HX + HW / 2, DZ = HZ + 2.6;
  scene.add(mesh([
    B(0.8, 0.2, 1.5, { pos: [FX + 0.4, 0.1, DZ], col: [0.6, 0.55, 0.49] }),
    B(0.36, 0.1, 1.3, { pos: [FX + 0.98, 0.05, DZ], col: [0.56, 0.51, 0.46] }),
    ...[-0.7, 0.7].map((dz) => B(0.08, 0.24, 0.08, { pos: [FX + 0.76, 0.12, DZ + dz], col: [0.46, 0.42, 0.38] })),
  ], T.plank, {}, 0.6));
  scene.add(mesh([
    B(0.74, 0.03, 1.0, { pos: [FX + 0.42, 0.214, DZ - 0.18], col: [1, 1, 1] }),
    B(0.3, 0.025, 0.85, { pos: [FX + 1.0, 0.11, DZ - 0.12], col: [1, 1, 1] }),
    B(0.2, 0.03, 1.4, { pos: [FX + 0.12, 0.214, DZ], col: [1, 1, 1] }),
  ], T.snow, {}, 2));

  /* dog kennel (local: door on +Z), turned to face the yard (+X) at the house corner */
  const KX = -4.9, KZ = 0.95, KW = 0.86, KD = 1.05, KH = 0.7, KR = 0.36, K0 = 0.07;
  const kennel = new THREE.Group();
  kennel.position.set(KX, 0, KZ); kennel.rotation.y = Math.PI / 2;
  kennel.add(mesh([
    ...[-0.33, 0.33].map((x) => B(0.07, 0.07, KD + 0.1, { pos: [x, 0.035, 0], col: [0.42, 0.38, 0.34] })),
    B(KW, KH, KD, { pos: [0, K0 + KH / 2, 0], col: [0.72, 0.65, 0.57] }),
    gable(KW, KR, KD - 0.02, 0, K0 + KH, 0, [0.66, 0.6, 0.53]),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => B(0.06, KH, 0.06, { pos: [sx * (KW / 2 - 0.01), K0 + KH / 2, sz * (KD / 2 - 0.01)], col: [0.5, 0.45, 0.4] }))),
    ...[-1, 1].map((sx) => B(0.05, 0.5, 0.03, { pos: [sx * 0.235, K0 + 0.25, KD / 2 + 0.012], col: [0.52, 0.47, 0.42] })),
    B(0.54, 0.05, 0.03, { pos: [0, K0 + 0.54, KD / 2 + 0.012], col: [0.52, 0.47, 0.42] }),
    B(0.04, 0.04, 0.12, { pos: [0.36, K0 + 0.18, KD / 2 + 0.05], col: [0.35, 0.34, 0.33] }), // chain peg
    B(0.34, 0.025, 0.12, { pos: [0, K0 + 0.012, KD / 2 - 0.02], rot: [0, 0.08, 0], col: [1.25, 1.05, 0.55] }), // straw at the door
  ], T.plank, {}, 0.55));
  kennel.add(mesh([
    ...roof(KW, KR, KD, 0, K0 + KH - 0.012, 0, 0.12, 0.04),
  ], T.plank, {}, 0.5));
  kennel.add(mesh([
    ...roof(KW, KR, KD, 0, K0 + KH + 0.03, 0, 0.09, 0.05),
    B(KW + 0.3, 0.06, KD + 0.3, { pos: [0, 0.0, -0.03], col: [1, 1, 1] }),
  ], T.snow, {}, 2));
  kennel.add(mesh([
    part(new THREE.PlaneGeometry(0.42, 0.4), { pos: [0, K0 + 0.2 + 0.01, KD / 2 + 0.004], col: [0.06, 0.05, 0.045] }),
    part(new THREE.CircleGeometry(0.21, 6, 0, Math.PI), { pos: [0, K0 + 0.41, KD / 2 + 0.004], col: [0.06, 0.05, 0.045] }),
  ], T.plank));
  // tin bowl with frozen water
  kennel.add(mesh([
    part(new THREE.CylinderGeometry(0.12, 0.09, 0.06, 8), { pos: [-0.62, 0.03, KD / 2 + 0.3], col: [0.55, 0.58, 0.63] }),
    part(new THREE.CircleGeometry(0.104, 8), { pos: [-0.62, 0.051, KD / 2 + 0.3], rot: [-Math.PI / 2, 0, 0], col: [0.34, 0.37, 0.42] }),
  ], T.snow, {}, 0.5));
  scene.add(kennel);

  /* the dog */
  const dog = makeDog();
  scene.add(dog.group);
  const DOG_SPOTS = {
    kennel: { at: [KX + 0.98, KZ + 0.08], yaw: Math.PI / 2 + 0.5 },
    porch: { at: [FX + 1.45, DZ + 0.55], yaw: 2.46 },
  };
  let dogClock = 0;
  function setDog({ at = null, h = 0, spot = null, yaw = null, anim = null, visible = true } = {}) {
    const S = spot ? DOG_SPOTS[spot] : null;
    const p = at || (S && S.at), y = yaw ?? (S && S.yaw);
    if (p) dog.group.position.set(p[0], h, p[1]);
    if (y !== null && y !== undefined) dog.group.rotation.y = y;
    if (anim) { dog.setAnim(anim, dogClock, 0); dog.state.from = null; }
    dog.group.visible = visible;
  }
  setDog({ spot: 'kennel', anim: 'sleep' });

  /* distant tree line */
  const lineGeo = part(new THREE.CylinderGeometry(118, 118, 20, 48, 1, true), { pos: [0, 6, 0], scale: [-1, 1, 1] });
  const luv = lineGeo.attributes.uv;
  for (let i = 0; i < luv.count; i++) luv.setX(i, luv.getX(i) * 7);
  const lineMat = ps1Material({ map: T.line, lit: 0, fog: 0.42 });
  const treeline = new THREE.Mesh(lineGeo, lineMat);
  treeline.frustumCulled = false;
  scene.add(treeline);

  /* footprints from the house door to the barn */
  const prints = [];
  const path = new THREE.CatmullRomCurve3([new V3(HX + HW / 2 + 0.8, 0, HZ + 2.6), new V3(-3, 0, -6.5), new V3(1.5, 0, -9.5), new V3(4.6, 0, front + 1.0)]);
  const L = path.getLength(), step = 0.68;
  for (let i = 0, s = 0.4; s < L - 0.2; i++, s += step) {
    const u = s / L, p = path.getPointAt(u), t = path.getTangentAt(u), side = i % 2 ? 1 : -1;
    const nx = -t.z, nz = t.x, ang = Math.atan2(t.x, t.z);
    prints.push(part(new THREE.PlaneGeometry(0.17, 0.36), { pos: [p.x + nx * 0.13 * side, 0.016, p.z + nz * 0.13 * side], rot: [-Math.PI / 2, 0, ang + Math.PI + (r() - 0.5) * 0.2], col: [1, 1, 1] }));
  }
  const printMesh = new THREE.Mesh(mergeGeometries(prints), ps1Material({ map: T.print }));
  printMesh.frustumCulled = false;
  scene.add(printMesh);

  /* snowfall */
  const NS = 1400, box = new V3(26, 12, 26);
  const spos = new Float32Array(NS * 3), seeds = new Float32Array(NS * 2);
  for (let i = 0; i < NS; i++) { spos[i * 3] = r() * box.x; spos[i * 3 + 1] = r() * box.y; spos[i * 3 + 2] = r() * box.z; seeds[i * 2] = r() * 6.28; seeds[i * 2 + 1] = 0.7 + r() * 0.6; }
  const flakeGeo = new THREE.BufferGeometry();
  const fpos = new Float32Array(NS * 3);
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const flakeMat = ps1PointsMaterial([0.9, 0.92, 0.98]);
  const flakes = new THREE.Points(flakeGeo, flakeMat);
  flakes.frustumCulled = false;
  scene.add(flakes);

  /* presets */
  let cur = null;
  const tmpC = new THREE.Color();
  function setPreset(name) {
    const p = PRESETS[name];
    cur = { ...p, name };
    const zen = hexf(p.zen), hor = hexf(p.hor), glow = hexf(p.glow);
    const sp = skyGeo.attributes.position, sc = skyGeo.attributes.color;
    for (let i = 0; i < sp.count; i++) {
      const e = sp.getY(i) / 150;
      let c = e <= 0 ? hor : mixc(hor, zen, Math.pow(clamp(e / 0.75, 0, 1), 0.7));
      if (e > -0.05 && e < 0.2) c = mixc(c, glow, (1 - Math.abs(e - 0.03) / 0.17) * 0.6 * (e < 0.2 ? 1 : 0));
      sc.setXYZ(i, c[0], c[1], c[2]);
    }
    sc.needsUpdate = true;
    LIGHTS.uSkyAmb.value.setRGB(...p.sky);
    LIGHTS.uGroundAmb.value.setRGB(...p.ground);
    LIGHTS.uSunDir.value.set(...p.sunDir).normalize();
    LIGHTS.uSunCol.value.setRGB(...p.sun);
    LIGHTS.uFogCol.value.setRGB(...hexf(p.fog));
    LIGHTS.uFogNear.value = p.near;
    LIGHTS.uFogFar.value = p.far;
    groundMat.uniforms.uTint.value.setRGB(...p.snow);
    treeMesh.material.uniforms.uTint.value.setRGB(p.tree, p.tree, p.tree);
    const fc = hexf(p.fog);
    lineMat.uniforms.uTint.value.setRGB(...mixc(fc, [0, 0, 0], name === 'day' ? 0.3 : 0.55));
    winMat.uniforms.uTint.value.setRGB(...(p.window ? [p.window, p.window * 0.96, p.window * 0.9] : [0.3, 0.3, 0.32]));
    flakeMat.uniforms.uColor.value.setRGB(...(name === 'night' ? [0.55, 0.58, 0.66] : name === 'day' ? [0.97, 0.98, 1.0] : [0.82, 0.85, 0.93]));
    LIGHTS.uPtPos.value[1].copy(winLightPos);
    LIGHTS.uPtCol.value[1].setRGB(...p.winLight);
    LIGHTS.uPtRange.value[1] = 6.5;
    return cur;
  }

  function update(dt, time, camera) {
    sky.position.copy(camera.position);
    const cp = camera.position;
    for (let i = 0; i < NS; i++) {
      const sp2 = seeds[i * 2 + 1];
      spos[i * 3 + 1] -= dt * 0.85 * sp2;
      spos[i * 3] += dt * (0.25 + Math.sin(time * 0.7 + seeds[i * 2]) * 0.22);
      spos[i * 3 + 2] += dt * Math.cos(time * 0.5 + seeds[i * 2]) * 0.12;
      const wrap = (v, size, c) => c + ((((v - c) % size) + size * 1.5) % size) - size / 2;
      fpos[i * 3] = wrap(spos[i * 3], box.x, cp.x);
      fpos[i * 3 + 1] = (((spos[i * 3 + 1] % box.y) + box.y) % box.y) - 1.0;
      fpos[i * 3 + 2] = wrap(spos[i * 3 + 2], box.z, cp.z);
    }
    flakeGeo.attributes.position.needsUpdate = true;
    dogClock = time;
    if (dog.group.visible) dog.update(time);
  }

  return { scene, setPreset, update, setAxe, setDog, dog, axes: { block: blockAxe, wall: wallAxe }, height: H, landmarks: { kennel: new V3(KX, 0.5, KZ), porch: new V3(FX + 0.4, 0.2, DZ), barnDoor: new V3(BX, 1.5, front), houseDoor: new V3(HX + HW / 2, 1.2, HZ + 2.6), window: winLightPos, block: new V3(BLK.x, BLK.h, BLK.z), wallAxe: new V3(BX + 2.25, 0.4, front + 0.2) } };
}
