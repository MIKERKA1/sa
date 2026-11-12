// Props for the hand poses and world (lamp and axe are final models).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ps1Material } from '../engine/ps1.js';
import { PixelCanvas, valueNoise, rng, mulc, mixc, clamp } from '../engine/util.js';
import { makeLamp } from './lamp.js';
import { makeAxe } from './axe.js';
export { makeLamp, makeAxe };

const V3 = THREE.Vector3;
export const CLAY = {
  wood: [0.78, 0.74, 0.68], woodDark: [0.6, 0.57, 0.53], metal: [0.6, 0.62, 0.66], metalDark: [0.42, 0.43, 0.46],
  paper: [0.96, 0.95, 0.92], hole: [0.08, 0.08, 0.09],
};

function clayTexture() {
  const pc = new PixelCanvas(32, 32), n = valueNoise(71, 8, 8), r = rng(72);
  pc.each((x, y) => { const v = 150 + (n(x / 4, y / 4) - 0.5) * 22 + (r() - 0.5) * 12; pc.set(x, y, [v, v, v * 0.99]); });
  return pc.texture(true);
}
function plankTexture() {
  const pc = new PixelCanvas(32, 64), n = valueNoise(73, 4, 16), r = rng(74);
  pc.each((x, y) => {
    let v = 150 + (n(x / 8, y / 4) - 0.5) * 30 + (r() - 0.5) * 10;
    if (x % 16 === 0) v *= 0.55;
    if ((x * 7 + Math.floor(y / 9)) % 11 === 0) v *= 0.86;
    pc.set(x, y, [v, v * 0.98, v * 0.95]);
  });
  return pc.texture(true);
}
function paperTexture() {
  const pc = new PixelCanvas(64, 64, [236, 232, 220]), r = rng(75);
  pc.each((x, y) => { const v = 232 + (r() - 0.5) * 10; pc.set(x, y, [v, v * 0.985, v * 0.94]); });
  for (let y = 53; y <= 58; y++) for (let x = 6; x <= 49; x++) pc.mix(x, y, [70, 70, 70], 0.8);
  for (let y = 28; y <= 48; y++) for (let x = 6; x <= 27; x++) pc.mix(x, y, [120, 120, 118], 0.65);
  for (let col = 0; col < 3; col++) for (let y = 6; y <= 48; y += 2) {
    const x0 = col === 0 ? 6 : col === 1 ? 31 : 44, x1 = col === 0 ? (y > 27 ? 27 : 27) : col === 1 ? 41 : 49;
    if (col === 0 && y > 26) continue;
    for (let x = x0; x <= x1; x++) if (r() > 0.18) pc.mix(x, y, [128, 128, 126], 0.55);
  }
  return pc.texture(false);
}
let TX = null;
const tex = () => (TX ||= { clay: clayTexture(), plank: plankTexture(), paper: paperTexture() });

function boxUV(g, sx, sy, sz, texel) {
  const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / texel, uv.getY(k) * dims[f][1] / texel); }
  return g;
}
export function part(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, col = [1, 1, 1], m = null } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const mm = m || new THREE.Matrix4().compose(new V3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    Array.isArray(scale) ? new V3(...scale) : new V3(scale, scale, scale));
  g.applyMatrix4(mm);
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const box = (sx, sy, sz, o = {}, texel = 0.3) => part(boxUV(new THREE.BoxGeometry(sx, sy, sz), sx, sy, sz, texel), o);
const cyl = (r0, r1, h, seg, o = {}, open = false) => part(new THREE.CylinderGeometry(r1, r0, h, seg, 1, open), o);
const mesh = (parts, map, opts = {}) => new THREE.Mesh(mergeGeometries(parts), ps1Material({ map, ...opts }));

/* ---------------------------------------------------------------- door (front face at local z = 0) */
export function makeDoor({ w = 1.12, h = 2.1, n = 7, dark = false, brace = false, seed = 7 } = {}) {
  const r = rng(seed), parts = [], pw = w / n, base = dark ? CLAY.woodDark : CLAY.wood;
  for (let i = 0; i < n; i++) parts.push(box(pw - 0.005, h + (r() - 0.5) * 0.02, 0.04, { pos: [-w / 2 + pw * (i + 0.5), 0, -0.02 + (r() - 0.5) * 0.006], col: mulc(base, 0.9 + r() * 0.14) }, 0.25));
  if (brace) {
    for (const y of [-h * 0.36, h * 0.36]) parts.push(box(w * 0.94, 0.13, 0.03, { pos: [0, y, 0.015], col: mulc(base, 0.86) }, 0.25));
    const len = Math.hypot(w * 0.8, h * 0.62);
    parts.push(box(0.12, len, 0.028, { pos: [0, 0, 0.014], rot: [0, 0, Math.atan2(w * 0.8, h * 0.62)], col: mulc(base, 0.84) }, 0.25));
  }
  const g = new THREE.Group();
  g.add(mesh(parts, tex().plank));
  return { group: g };
}

/* ---------------------------------------------------------------- lock plate + key */
export function makeLock() {
  const g = new THREE.Group();
  g.add(mesh([
    box(0.075, 0.13, 0.008, { pos: [0, 0, 0.004], col: CLAY.metalDark }, 0.1),
    box(0.009, 0.022, 0.002, { pos: [0, -0.02, 0.0085], col: CLAY.hole }, 0.1),
  ], tex().clay));
  const key = new THREE.Group();
  key.position.set(0, -0.02, 0.008);
  key.add(mesh([
    box(0.0075, 0.0075, 0.085, { pos: [0, 0, 0.0425], col: CLAY.metal }, 0.1),
    box(0.012, 0.012, 0.008, { pos: [0, 0, 0.075], col: CLAY.metal }, 0.1),
    part(new THREE.TorusGeometry(0.0165, 0.0045, 4, 8), { pos: [0, 0, 0.097], rot: [0, Math.PI / 2, 0], col: CLAY.metal }),
  ], tex().clay));
  g.add(key);
  return { group: g, key, bow: new V3(0, -0.02, 0.008 + 0.097) };
}

/* ---------------------------------------------------------------- bucket */
export function makeBucket() {
  const R0 = 0.13, R1 = 0.106, H = 0.26, top = -0.13;
  const g = new THREE.Group();
  g.add(mesh([
    cyl(R1, R0, H, 12, { pos: [0, top - H / 2, 0], col: CLAY.metal }, true),
    cyl(R1 * 0.985, R0 * 0.985, H, 12, { pos: [0, top - H / 2, 0], scale: [-1, 1, 1], col: mulc(CLAY.metal, 0.55) }, true),
    part(new THREE.CircleGeometry(R1 * 0.985, 12), { pos: [0, top - H + 0.004, 0], rot: [-Math.PI / 2, 0, 0], col: mulc(CLAY.metal, 0.5) }),
    part(new THREE.CircleGeometry(R1, 12), { pos: [0, top - H, 0], rot: [Math.PI / 2, 0, 0], col: mulc(CLAY.metal, 0.7) }),
    part(new THREE.CircleGeometry(R0 - 0.008, 12), { pos: [0, top - 0.065, 0], rot: [-Math.PI / 2, 0, 0], col: [0.34, 0.42, 0.5] }),
    part(new THREE.TorusGeometry(R0, 0.0055, 3, 12), { pos: [0, top], rot: [Math.PI / 2, 0, 0], col: CLAY.metal }),
    part(new THREE.TorusGeometry(R0 - 0.022, 0.004, 3, 12), { pos: [0, top - 0.09, 0], rot: [Math.PI / 2, 0, 0], col: mulc(CLAY.metal, 0.85) }),
    part(new THREE.TorusGeometry(R1 + 0.006, 0.004, 3, 12), { pos: [0, top - 0.22, 0], rot: [Math.PI / 2, 0, 0], col: mulc(CLAY.metal, 0.85) }),
    box(0.012, 0.03, 0.022, { pos: [R0 + 0.002, top - 0.012, 0], col: CLAY.metalDark }, 0.1),
    box(0.012, 0.03, 0.022, { pos: [-R0 - 0.002, top - 0.012, 0], col: CLAY.metalDark }, 0.1),
    part(new THREE.TorusGeometry(R0, 0.0035, 3, 12, Math.PI), { pos: [0, top, 0], col: CLAY.metalDark }),
    cyl(0.0118, 0.0118, 0.095, 6, { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2], col: CLAY.wood }),
  ], tex().clay));
  return { group: g, gripR: 0.0118 };
}

/* ---------------------------------------------------------------- folded newspaper */
export function makePaper() {
  const W = 0.3, H = 0.21, nx = 4, ny = 2;
  const pos = [], nrm = [], uv = [], col = [];
  const P = (i, j, s) => { const x = -W * (i / nx), y = H * (j / ny); return new V3(x, y, 0.012 * Math.sin(Math.PI * (i / nx)) * (0.6 + 0.4 * (j / ny)) + s); };
  const push = (a, b, c, uva, uvb, uvc) => {
    const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a)).normalize();
    for (const [p, t] of [[a, uva], [b, uvb], [c, uvc]]) { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(t[0], t[1]); col.push(...CLAY.paper); }
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = P(i, j, 0.001), b = P(i + 1, j, 0.001), c = P(i + 1, j + 1, 0.001), d = P(i, j + 1, 0.001);
    const U = (ii, jj) => [1 - ii / nx, jj / ny];
    push(a, c, b, U(i, j), U(i + 1, j + 1), U(i + 1, j));
    push(a, d, c, U(i, j), U(i, j + 1), U(i + 1, j + 1));
    const a2 = P(i, j, -0.001), b2 = P(i + 1, j, -0.001), c2 = P(i + 1, j + 1, -0.001), d2 = P(i, j + 1, -0.001);
    const B = [0.98, 0.02];
    push(a2, b2, c2, B, B, B);
    push(a2, c2, d2, B, B, B);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(g, ps1Material({ map: tex().paper })));
  return { group: grp, W, H };
}

/* ---------------------------------------------------------------- barn door with latch */
export function makeBarnLatch() {
  const door = makeDoor({ w: 1.7, h: 2.4, n: 10, dark: true, brace: true, seed: 9 });
  const beam = new THREE.Group();
  beam.add(mesh([
    box(0.66, 0.056, 0.046, { pos: [0, 0, 0], col: CLAY.wood }, 0.25),
    ...[-0.2, 0.24].flatMap((x) => [
      box(0.05, 0.008, 0.07, { pos: [x, 0.032, -0.012], col: CLAY.metalDark }, 0.1),
      box(0.05, 0.008, 0.07, { pos: [x, -0.032, -0.012], col: CLAY.metalDark }, 0.1),
      box(0.05, 0.072, 0.008, { pos: [x, 0, 0.026], col: CLAY.metalDark }, 0.1),
    ]),
    box(0.03, 0.03, 0.07, { pos: [0.2, 0, 0.055], col: CLAY.woodDark }, 0.25),
    cyl(0.016, 0.016, 0.12, 6, { pos: [0.2, 0, 0.1], col: CLAY.wood }),
  ], tex().plank));
  beam.position.set(0.08, -0.1, 0.06);
  door.group.add(beam);
  return { group: door.group, beam, grip: new V3(0.2, 0, 0.1) };
}

export function makeProps() {
  return { door: makeDoor(), lock: makeLock(), bucket: makeBucket(), lamp: makeLamp(), paper: makePaper(), barn: makeBarnLatch(), axe: makeAxe() };
}
