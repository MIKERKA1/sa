// Hinterkaifeck — the player's boot prints in the snow and mud behind him: a ring buffer of decals on the ground,
// multiply-blended (they darken whatever lies below: blue-grey dents in snow, wet dark prints in mud), fading slowly.
import * as THREE from 'three';
import { clamp, smooth } from '../engine/util.js';

// hobnailed boot sole, toe up (+v): forefoot + heel, tread bars, a ring of nails
function bootTexture() {
  const W = 32, Hh = 80, d = new Uint8Array(W * Hh * 4);
  const ell = (u, v, cu, cv, ru, rv) => Math.hypot((u - cu) / ru, (v - cv) / rv);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W - 0.5, v = (y + 0.5) / Hh;
    const fore = ell(u, v, 0.02, 0.66, 0.39, 0.3), heel = ell(u, v, -0.02, 0.17, 0.33, 0.15);
    const waist = Math.abs(u + 0.06) < 0.24 - Math.abs(v - 0.38) * 0.2 && v > 0.27 && v < 0.45 ? 0.55 : 0;
    let a = Math.max(smooth(clamp((1.0 - fore) / 0.3, 0, 1)), smooth(clamp((1.0 - heel) / 0.32, 0, 1)), waist * 0.6);
    if (a > 0) {
      const tread = v > 0.42 ? 0.9 + 0.1 * Math.sin(v * 70) : 0.92, deep = 0.78 + 0.22 * Math.max(1 - fore, 1 - heel) ;
      a *= tread * Math.min(1, deep);
      const nf = Math.abs(fore - 0.78), nh = Math.abs(heel - 0.72);
      if ((nf < 0.09 && Math.sin(Math.atan2(v - 0.66, u) * 9) > 0.55) || (nh < 0.12 && Math.sin(Math.atan2(v - 0.17, u) * 7) > 0.6)) a = Math.min(1, a * 1.25);
    }
    const i = (y * W + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(clamp(a, 0, 1) * 255);
  }
  const t = new THREE.DataTexture(d, W, Hh, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

const VERT = /* glsl */ `
attribute float aBorn; attribute vec4 aTint;
uniform float uTime; uniform float uLife;
varying vec2 vUv; varying float vA; varying vec3 vTint;
void main() {
  vUv = uv;
  float age = uTime - aBorn;
  vA = aBorn < -1.0 ? 0.0 : aTint.a * (1.0 - smoothstep(uLife * 0.45, uLife, age)) * smoothstep(-0.05, 0.25, age);
  vTint = aTint.rgb;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vA *= 1.0 - smoothstep(22.0, 40.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv; varying float vA; varying vec3 vTint;
void main() {
  float a = texture2D(map, vUv).a * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(1.0), vTint, a), 1.0);
}`;

/* trampled snow: a world-space depth map (R8, ~7 cm texels) the terrain shader reads to bend its normals into a trench
   and shade it a little bluer; every boot print presses an oriented dent into it. Fresh dents fill back in slowly (fast
   in falling snow) down to a permanent base layer (the old, snowed-over track). */
export function createTrail({ x0 = -34, z0 = -46, size = 72, n = 1024 } = {}) {
  const d = new Uint8Array(n * n), base = new Uint8Array(n * n), px = n / size;
  const tex = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  let bb = null, dirty = false, acc = 0, upd = 0;
  // oriented ellipse (half length a along (ux, uz), half width b, metres), depth k 0..1 with a soft rim
  function stamp(x, z, ux, uz, a, b, k, perm = false) {
    const R = Math.max(a, b) + 0.1, i0 = Math.max(0, Math.floor((x - R - x0) * px)), i1 = Math.min(n - 1, Math.ceil((x + R - x0) * px));
    const j0 = Math.max(0, Math.floor((z - R - z0) * px)), j1 = Math.min(n - 1, Math.ceil((z + R - z0) * px));
    if (i0 > i1 || j0 > j1) return;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = (i + 0.5) / px + x0 - x, wz = (j + 0.5) / px + z0 - z, s = (wx * ux + wz * uz) / a, t = (-wx * uz + wz * ux) / b, q = s * s + t * t;
      if (q >= 1) continue;
      const v = Math.round(255 * k * (1 - q * q)), o = j * n + i;
      if (v > d[o]) d[o] = Math.min(255, v);
      if (perm && v > base[o]) base[o] = Math.min(255, v);
    }
    bb = bb ? [Math.min(bb[0], i0), Math.min(bb[1], j0), Math.max(bb[2], i1), Math.max(bb[3], j1)] : [i0, j0, i1, j1];
    dirty = true;
  }
  function update(dt, life = 320) {
    acc += dt; upd += dt;
    if (acc > 1.5 && bb) { // fill back in towards the base layer
      const f = Math.exp(-acc / (life * 0.45));
      for (let j = bb[1]; j <= bb[3]; j++) for (let o = j * n + bb[0], e = j * n + bb[2]; o <= e; o++) if (d[o] > base[o]) d[o] = Math.max(base[o], Math.floor(d[o] * f));
      acc = 0; dirty = true;
    }
    if (dirty && upd > 0.2) { tex.needsUpdate = true; dirty = false; upd = 0; }
  }
  function clear() { d.set(base); dirty = true; }
  return { tex, rect: [x0, z0, size, size], stamp, update, clear };
}

export function createPrints(scene, height, maskTex, N = 520, { trail = null, perm = false } = {}) {
  const md = maskTex && maskTex.userData.maskData;
  const pos = new Float32Array(N * 12), uv = new Float32Array(N * 8), born = new Float32Array(N * 4).fill(-9), tint = new Float32Array(N * 16), idx = [];
  for (let i = 0; i < N; i++) {
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aBorn', new THREE.BufferAttribute(born, 1)); g.setAttribute('aTint', new THREE.BufferAttribute(tint, 4));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: { map: { value: bootTexture() }, uTime: { value: 0 }, uLife: { value: perm ? 1e9 : 240 } },
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1;
  scene.add(mesh);
  let head = 0, time = 0;

  // ground under a point from the painted mask: [snow, mud, wet] 0..1
  function groundAt(x, z) {
    if (!md) return [1, 0, 0];
    const i = clamp(Math.floor(((x + md.half) / (2 * md.half)) * md.size), 0, md.size - 1), j = clamp(Math.floor(((z + md.half) / (2 * md.half)) * md.size), 0, md.size - 1);
    const o = (j * md.size + i) * 4;
    return [md.d[o] / 255, md.d[o + 1] / 255, md.d[o + 2] / 255];
  }

  // one print: centre x, z, facing yaw (camera convention: forward = (-sin, -cos)), side -1 left / +1 right
  function add(x, z, yaw, side, o = {}) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cx = x + rx * side * (o.gauge ?? 0.1), cz = z + rz * side * (o.gauge ?? 0.1), L = (o.run ? 0.31 : 0.29) * (o.old ? 1.12 : 1), W = 0.115 * (o.old ? 1.2 : 1);
    const a = side * 0.06; // toes turned slightly out
    const ca = Math.cos(a), sa = Math.sin(a), ux = fx * ca - fz * sa, uz = fx * sa + fz * ca; // forward, rotated
    const vx = -uz, vz = ux; // across
    const y = height(cx, cz) + 0.012;
    const P = [[-W / 2, -L / 2], [W / 2, -L / 2], [W / 2, L / 2], [-W / 2, L / 2]];
    for (let k = 0; k < 4; k++) {
      const [s, t] = P[k];
      pos.set([cx + vx * s + ux * t, y, cz + vz * s + uz * t], head * 12 + k * 3);
    }
    const [snow, mud, wet] = groundAt(cx, cz), sk = smooth(clamp((snow - 0.36) / 0.28, 0, 1));
    const col = [0.42 - 0.06 * (1 - sk), 0.49 - 0.17 * (1 - sk), 0.66 - 0.4 * (1 - sk)], al = (sk * 0.82 + (1 - sk) * (0.6 + mud * 0.2 + wet * 0.15)) * (o.old ? 0.42 : 1);
    if (trail && sk > 0.15) { // press the boot into the snow: the print itself, a shallower scuffed hollow round it
      if (o.old) { trail.stamp(cx, cz, ux, uz, 0.26, 0.15, 0.5 * sk, true); }
      else { trail.stamp(cx + ux * 0.02, cz + uz * 0.02, ux, uz, o.run ? 0.34 : 0.28, 0.18, 0.55 * sk); trail.stamp(cx, cz, ux, uz, 0.17, 0.075, 1.0 * sk); }
    }
    for (let k = 0; k < 4; k++) { tint.set([...col, al], head * 16 + k * 4); born[head * 4 + k] = time; }
    head = (head + 1) % N;
    for (const at of ['position', 'aBorn', 'aTint']) g.attributes[at].needsUpdate = true;
  }

  function update(t, life) { time = t; mat.uniforms.uTime.value = t; if (life) mat.uniforms.uLife.value = life; }
  function clear() { born.fill(-9); g.attributes.aBorn.needsUpdate = true; }
  return { mesh, add, update, clear, groundAt };
}
