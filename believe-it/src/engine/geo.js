// Low-poly mesh construction: non-indexed triangles with explicit normals, UVs and vertex colours.
import * as THREE from 'three';

const W = [1, 1, 1];

export class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  v(p, n, uv, c = W) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z);
    this.uv.push(uv[0], uv[1]); this.c.push(c[0], c[1], c[2]);
  }
  tri(P, N, UV, C) { for (let i = 0; i < 3; i++) this.v(P[i], N[i], UV[i], C ? C[i] : W); }
  get tris() { return this.p.length / 9; }
  append(o, m) {
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < o.p.length; i += 3) {
      p.set(o.p[i], o.p[i + 1], o.p[i + 2]); n.set(o.n[i], o.n[i + 1], o.n[i + 2]);
      if (m) { p.applyMatrix4(m); n.applyMatrix3(nm).normalize(); }
      this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z);
    }
    for (const x of o.uv) this.uv.push(x);
    for (const x of o.c) this.c.push(x);
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Loft closed rings (all with n points, ordered from +X towards +Z, rings advancing along the local +Y axis).
 * opts.uv(r, kk, p, faceNormal) -> [u, v]   (kk runs 0..n so the seam can reach u = 1)
 * opts.color(r, kk, p) -> [r, g, b]
 * ring.hard -> hard shading edge across that ring; opts.flat -> faceted everywhere
 * opts.capStart / capEnd: { apex: Vector3, smooth: bool, uv: (p, fn) => [u, v] }
 */
export function loft(mb, rings, opts = {}) {
  const R = rings.length, n = rings[0].pts.length;
  const uvf = opts.uv || ((r, kk) => [kk / n, r / (R - 1)]);
  const colf = opts.color || (() => W);
  const inward = !!opts.inward;
  const fn = [];
  for (let b = 0; b < R - 1; b++) {
    fn[b] = [];
    for (let k = 0; k < n; k++) {
      const A = rings[b].pts[k], B = rings[b].pts[(k + 1) % n], C = rings[b + 1].pts[(k + 1) % n], D = rings[b + 1].pts[k];
      const nrm = new THREE.Vector3().subVectors(C, A).cross(new THREE.Vector3().subVectors(B, D)).normalize();
      if (inward) nrm.negate();
      fn[b][k] = nrm;
    }
  }
  const vn = (b, r, k) => {
    const acc = new THREE.Vector3();
    const add = (bb) => { if (bb < 0 || bb >= R - 1) return; acc.add(fn[bb][k % n]).add(fn[bb][(k - 1 + n) % n]); };
    add(b);
    if (!rings[r].hard && !opts.flat) add(r === b ? b - 1 : b + 1);
    return acc.normalize();
  };
  for (let b = 0; b < R - 1; b++) {
    for (let k = 0; k < n; k++) {
      const ids = [[b, k], [b, k + 1], [b + 1, k + 1], [b + 1, k]]; // A B C D
      const P = ids.map(([r, kk]) => rings[r].pts[kk % n]);
      const f = fn[b][k];
      const N = opts.flat ? [f, f, f, f] : ids.map(([r, kk]) => vn(b, r, kk));
      const UV = ids.map(([r, kk], i) => uvf(r, kk, P[i], f));
      const C = ids.map(([r, kk], i) => colf(r, kk, P[i]));
      const t1 = inward ? [0, 1, 2] : [0, 2, 1];
      const t2 = inward ? [0, 2, 3] : [0, 3, 2];
      mb.tri(t1.map((i) => P[i]), t1.map((i) => N[i]), t1.map((i) => UV[i]), t1.map((i) => C[i]));
      mb.tri(t2.map((i) => P[i]), t2.map((i) => N[i]), t2.map((i) => UV[i]), t2.map((i) => C[i]));
    }
  }
  const cap = (spec, r, atEnd) => {
    if (!spec) return;
    const ring = rings[r].pts;
    const cen = ring.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / n);
    const apex = spec.apex || cen;
    let axis = new THREE.Vector3().subVectors(apex, cen);
    if (axis.lengthSq() < 1e-12) {
      axis = new THREE.Vector3().subVectors(rings[atEnd ? R - 1 : 0].pts[0], rings[atEnd ? R - 2 : 1].pts[0]);
    }
    axis.normalize();
    const b = atEnd ? R - 2 : 0;
    for (let k = 0; k < n; k++) {
      const a = ring[k], c = ring[(k + 1) % n];
      const f = new THREE.Vector3().subVectors(atEnd ? apex : c, a).cross(new THREE.Vector3().subVectors(atEnd ? c : apex, a)).normalize();
      let N;
      if (spec.smooth) {
        const na = vn(b, r, k).clone().multiplyScalar(spec.blend ?? 0.6).add(axis).normalize();
        const nc = vn(b, r, k + 1).clone().multiplyScalar(spec.blend ?? 0.6).add(axis).normalize();
        N = [na, axis, nc];
      } else N = [f, f, f];
      const ua = uvf(r, k, a, f, true), uc = uvf(r, k + 1, c, f, true); // 5th arg: cap triangle
      const uapex = spec.uv ? spec.uv(apex, f, ua, uc) : [(ua[0] + uc[0]) / 2, ua[1]];
      let ca = colf(r, k, a), cc = colf(r, k + 1, c), cx = spec.color || ca;
      if (spec.colorAll) { ca = cc = cx = spec.colorAll; }
      if (atEnd) mb.tri([a, apex, c], [N[0], N[1], N[2]], [ua, uapex, uc], [ca, cx, cc]);
      else mb.tri([a, c, apex], [N[0], N[2], N[1]], [ua, uc, uapex], [ca, cc, cx]);
    }
  };
  cap(opts.capStart, 0, false);
  cap(opts.capEnd, R - 1, true);
  return mb;
}

// Elliptical ring of n points at height y (angles from +X towards +Z), optional per-point offset fn.
export function ring(n, y, rx, rz, { cx = 0, cz = 0, phase = 0, warp = null } = {}) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2;
    const p = new THREE.Vector3(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
    if (warp) warp(p, k, a);
    pts.push(p);
  }
  return pts;
}

// Lathe-like solid from a profile [[radius, y], ...] (bottom -> top).
export function lathe(mb, profile, sides, { flat = true, capStart = true, capEnd = true, uv, color, rz = 1, phase = 0 } = {}) {
  const rings = profile.map(([r, y, hard]) => ({ pts: ring(sides, y, r, r * rz, { phase }), hard: hard ?? false }));
  const y0 = profile[0][1], y1 = profile[profile.length - 1][1];
  return loft(mb, rings, {
    flat,
    uv: uv || ((r, kk, p) => [kk / sides, (p.y - y0) / Math.max(1e-6, y1 - y0)]),
    color,
    capStart: capStart ? { apex: new THREE.Vector3(0, y0, 0) } : null,
    capEnd: capEnd ? { apex: new THREE.Vector3(0, y1, 0) } : null,
  });
}

// Quad a-b-c-d counter-clockwise seen from the front.
export function quad(mb, a, b, c, d, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]], col = W, nrm = null) {
  const n = nrm || new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  const cols = Array.isArray(col[0]) ? col : [col, col, col, col];
  mb.tri([a, b, c], [n, n, n], [uvs[0], uvs[1], uvs[2]], [cols[0], cols[1], cols[2]]);
  mb.tri([a, c, d], [n, n, n], [uvs[0], uvs[2], uvs[3]], [cols[0], cols[2], cols[3]]);
}

// Axis-aligned box centred at (cx, cy, cz). texel: world units per texture repeat (for UVs).
export function box(mb, sx, sy, sz, { c = [0, 0, 0], texel = 1, col = W, skip = [] } = {}) {
  const [x, y, z] = c, hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const V = (a, b, d) => new THREE.Vector3(x + a, y + b, z + d);
  const faces = {
    px: [V(hx, -hy, hz), V(hx, -hy, -hz), V(hx, hy, -hz), V(hx, hy, hz), sz, sy],
    nx: [V(-hx, -hy, -hz), V(-hx, -hy, hz), V(-hx, hy, hz), V(-hx, hy, -hz), sz, sy],
    py: [V(-hx, hy, hz), V(hx, hy, hz), V(hx, hy, -hz), V(-hx, hy, -hz), sx, sz],
    ny: [V(-hx, -hy, -hz), V(hx, -hy, -hz), V(hx, -hy, hz), V(-hx, -hy, hz), sx, sz],
    pz: [V(-hx, -hy, hz), V(hx, -hy, hz), V(hx, hy, hz), V(-hx, hy, hz), sx, sy],
    nz: [V(hx, -hy, -hz), V(-hx, -hy, -hz), V(-hx, hy, -hz), V(hx, hy, -hz), sx, sy],
  };
  for (const [k, f] of Object.entries(faces)) {
    if (skip.includes(k)) continue;
    const u = f[4] / texel, v = f[5] / texel;
    quad(mb, f[0], f[1], f[2], f[3], [[0, 0], [u, 0], [u, v], [0, v]], typeof col === 'function' ? col(k) : col);
  }
  return mb;
}

export function mat4(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, order = 'XYZ') {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order)),
    typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale));
  return m;
}
