// Geometry kit for the farmstead: parts are transformed into world space right away, get vertex colours and planar
// world UVs (texel = metres per texture tile of their material) and are merged per (cutaway group, material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Y, PITCH, HOUSE, BARN, ROOF_T, ROOMS } from './farm_plan.js';

const V3 = THREE.Vector3;
const KEEP = ['position', 'normal', 'uv', 'color'];

// world-space planar UVs by dominant normal axis; per triangle
export function planarUV(g, texel = 1, rotate = false) {
  const p = g.attributes.position, n = g.attributes.normal;
  let uv = g.attributes.uv;
  if (!uv || uv.count !== p.count) { uv = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2); g.setAttribute('uv', uv); }
  const a = new V3(), b = new V3(), c = new V3(), fn = new V3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    fn.subVectors(b, a).cross(c.clone().sub(a));
    if (fn.lengthSq() < 1e-12 && n) fn.fromBufferAttribute(n, i);
    const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
    for (let k = i; k < i + 3; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      if (rotate) [u, v] = [v, u];
      uv.setXY(k, u / texel, v / texel);
    }
  }
  return g;
}

// geometry -> world-space non-indexed part with colour; uv: 'planar' | 'keep' | [su, sv] (scale kept UVs)
export function prep(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, col = [1, 1, 1], m = null, smooth = false, uv = 'planar', texel = 1, rotUV = false } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const mm = m || new THREE.Matrix4().compose(new V3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    Array.isArray(scale) ? new V3(...scale) : new V3(scale, scale, scale));
  if (smooth) { // keep the generator's smooth normals
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(mm);
    g.normalizeNormals();
  } else {
    g.applyMatrix4(mm);
    g.deleteAttribute('normal');
    g.computeVertexNormals();
  }
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (uv === 'planar') planarUV(g, texel, rotUV);
  else if (Array.isArray(uv)) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * uv[0], a.getY(i) * uv[1]); }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  return g;
}

// convex polygon slab in an arbitrary plane: outline pts (V3, counter-clockwise seen from the outside), extruded by -n * th
export function slabGeo(pts, nrm, th, uvFn) {
  const off = nrm.clone().multiplyScalar(-th), nn = nrm.clone().negate();
  const top = { P: [], N: [], U: [] }, bot = { P: [], N: [], U: [] }, side = { P: [], N: [], U: [] };
  const into = (T, v, n, uv) => { T.P.push(v.x, v.y, v.z); T.N.push(n.x, n.y, n.z); T.U.push(uv[0], uv[1]); };
  for (let i = 1; i < pts.length - 1; i++) {
    for (const k of [0, i, i + 1]) into(top, pts[k], nrm, uvFn(pts[k]));
    for (const k of [0, i + 1, i]) { const v = pts[k].clone().add(off); into(bot, v, nn, uvFn(v)); }
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], a2 = a.clone().add(off), b2 = b.clone().add(off);
    const sn = new V3().subVectors(b, a).cross(off).normalize().negate();
    const L = a.distanceTo(b);
    for (const [v, uv] of [[a, [0, 0]], [a2, [0, th]], [b2, [L, th]], [a, [0, 0]], [b2, [L, th]], [b, [L, 0]]]) into(side, v, sn, uv);
  }
  const mk = (T) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(T.N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(T.U, 2)); return g; };
  return { top: mk(top), bottom: mk(bot), side: mk(side) };
}

// ---- envelope for loose hay / straw: nothing may poke through walls, ceilings or the roof
const ENV_MATS = new Set(['hay', 'hay_i', 'straw', 'straw_i', 'grain', 'grain_i']);
const UNDER = ROOF_T * Math.sqrt(1 + PITCH * PITCH) + 0.19; // slab + rafters
const RM = Object.values(ROOMS);
const inR = (r, x, z, e = 0) => x >= r.x0 - e && x <= r.x1 + e && z >= r.z0 - e && z <= r.z1 + e;
const inFoot = (x, z) => inR(HOUSE, x, z, 0.05) || inR(BARN, x, z, 0.05);
function roofUnder(x, z) {
  if (x >= BARN.x0) return Y.eave + PITCH * Math.min(x - BARN.x0, BARN.x1 - x) - UNDER;
  return Y.eave + PITCH * Math.min(z - HOUSE.z0, HOUSE.z1 - z) - UNDER;
}
function roomFor(x, y, z) {
  const up = y > Y.attic - 0.05;
  let best = null, ba = 1e9, nd = 1e9, near = null;
  for (const r of RM) {
    if ((r.y >= Y.attic) !== up) continue;
    const a = (r.x1 - r.x0) * (r.z1 - r.z0);
    if (inR(r, x, z)) { if (a < ba) { ba = a; best = r; } continue; }
    const d = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
    if (d < nd) { nd = d; near = r; }
  }
  return { r: best || near, inside: !!best, up };
}
export function envClamp(g) {
  const p = g.attributes.position, n = p.count;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); }
  cx /= n; cy /= n; cz /= n;
  if (!inFoot(cx, cz)) return g;
  const { r, inside, up } = roomFor(cx, cy, cz);
  if (!r) return g;
  if (!inside && n <= 36) return null; // a stray tuft inside a wall
  const card = /^straw/.test(g.userData.mat || '');
  const m = 0.03;
  let moved = false;
  for (let i = 0; i < n; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const x2 = Math.min(Math.max(x, r.x0 + m), r.x1 - m), z2 = Math.min(Math.max(z, r.z0 + m), r.z1 - m);
    const top = up ? roofUnder(x2, z2) : Y.beam - 0.03;
    const y2 = Math.min(y, top);
    if (x2 !== x || y2 !== y || z2 !== z) { if (card) return null; p.setXYZ(i, x2, y2, z2); moved = true; } // stalk cards: drop, never flatten
  }
  if (moved) { g.deleteAttribute('normal'); g.computeVertexNormals(); }
  return g;
}

export class Kit {
  static DBG = typeof location !== 'undefined' && /[?&]dev=1/.test(location.search) && /[?&]zf=1/.test(location.search);
  // mats: name -> { mat, texel }; groups: names of the cutaway groups
  constructor(mats, o = {}) { this.env = !!o.env; this.mats = mats; this.b = new Map(); this.solids = []; this.casts = new Set(); this.dbg = []; }
  texel(m) { const d = this.mats[m]; if (!d) throw new Error('no material ' + m); return d.texel; }
  add(grp, m, g) {
    if (this.env && ENV_MATS.has(m)) { g.userData.mat = m; g = envClamp(g); if (!g) return null; }
    const k = grp + '|' + m; if (!this.b.has(k)) this.b.set(k, []); this.b.get(k).push(g); return g; }
  part(grp, m, geo, o = {}) {
    const g = this.add(grp, m, prep(geo, { texel: this.texel(m), ...o }));
    if (g && geo.type === 'BoxGeometry' && Kit.DBG) { // QA: world AABB of axis-aligned boxes (z-fight visibility check)
      const n = g.attributes.normal, p = g.attributes.position;
      let aligned = true;
      for (let i = 0; i < n.count && aligned; i++) { const a = Math.abs(n.getX(i)), b = Math.abs(n.getY(i)), c = Math.abs(n.getZ(i)); if (Math.max(a, b, c) < 0.9999) aligned = false; }
      if (aligned) { g.computeBoundingBox(); const bb = g.boundingBox; this.dbg.push([bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]); }
    }
    return g;
  }
  raw(grp, m, g, col = [1, 1, 1]) { // world-space geometry with its own normals / uvs
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(col, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return this.add(grp, m, g);
  }
  // axis-aligned box from min / max corners
  box(grp, m, x0, y0, z0, x1, y1, z1, col = [1, 1, 1], o = {}) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return null;
    const sg = (d) => (o.seg ? Math.max(1, Math.ceil(d / o.seg - 0.01)) : 1); // subdivide big walls / floors for the per-vertex (retro) light
    return this.part(grp, m, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, sg(x1 - x0), sg(y1 - y0), sg(z1 - z0)), { pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], col, ...o });
  }
  // centred, rotated box
  obox(grp, m, sx, sy, sz, pos, rot = [0, 0, 0], col = [1, 1, 1], o = {}) {
    return this.part(grp, m, new THREE.BoxGeometry(sx, sy, sz), { pos, rot, col, ...o });
  }
  cyl(grp, m, rBot, rTop, h, seg, pos, rot = [0, 0, 0], col = [1, 1, 1], o = {}) {
    return this.part(grp, m, new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!o.open), { pos, rot, col, ...o });
  }
  // 2D collider (xz rectangle) on a level: 0 = ground floor / outside, 1 = attic
  solid(x0, z0, x1, z1, lvl = 0, tag = null) { const s = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), lvl, tag, on: true }; this.solids.push(s); return s; }
  build(onMesh) {
    const groups = {};
    for (const [k, parts] of this.b) {
      const [grp, m] = k.split('|');
      const g = mergeGeometries(parts);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, this.mats[m].mat);
      mesh.frustumCulled = false;
      mesh.userData.mat = m;
      if (!groups[grp]) { groups[grp] = new THREE.Group(); groups[grp].name = grp; }
      groups[grp].add(mesh);
      if (onMesh) onMesh(mesh, grp, m);
    }
    this.b.clear();
    return groups;
  }
}
