// Small shared helpers: seeded RNG, tileable noise, pixel canvases -> nearest-filtered textures.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const deg = (d) => (d * Math.PI) / 180;

export function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mulc = (a, f) => [a[0] * f, a[1] * f, a[2] * f];

// Tileable value noise on an integer lattice with period (px, py).
export function valueNoise(seed, px, py) {
  const r = rng(seed);
  const g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = smooth(x - xi), fy = smooth(y - yi);
    const i0 = ((xi % px) + px) % px, i1 = (i0 + 1) % px;
    const j0 = ((yi % py) + py) % py, j1 = (j0 + 1) % py;
    return lerp(lerp(g[j0 * px + i0], g[j0 * px + i1], fx), lerp(g[j1 * px + i0], g[j1 * px + i1], fx), fy);
  };
}

// Row 0 of the canvas is v = 0 (bottom of the texture), like a DataTexture.
export class PixelCanvas {
  constructor(w, h, fill = [128, 128, 128]) {
    this.w = w; this.h = h;
    this.d = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { this.d[i * 4] = fill[0]; this.d[i * 4 + 1] = fill[1]; this.d[i * 4 + 2] = fill[2]; this.d[i * 4 + 3] = 255; }
  }
  i(x, y) {
    x = ((Math.round(x) % this.w) + this.w) % this.w;
    y = ((Math.round(y) % this.h) + this.h) % this.h;
    return (y * this.w + x) * 4;
  }
  set(x, y, c, a = 255) { const i = this.i(x, y); this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; }
  get(x, y) { const i = this.i(x, y); return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  mix(x, y, c, t) { const i = this.i(x, y); for (let k = 0; k < 3; k++) this.d[i + k] = clamp(Math.round(this.d[i + k] + (c[k] - this.d[i + k]) * t), 0, 255); }
  mul(x, y, f) { const i = this.i(x, y); for (let k = 0; k < 3; k++) this.d[i + k] = clamp(Math.round(this.d[i + k] * f), 0, 255); }
  alpha(x, y, a) { this.d[this.i(x, y) + 3] = a; }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y); }
  line(x0, y0, x1, y1, c, t = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let s = 0; s <= n; s++) this.mix(lerp(x0, x1, s / n), lerp(y0, y1, s / n), c, t);
  }
  texture(repeat = true) {
    const t = new THREE.DataTexture(this.d, this.w, this.h, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    t.userData.pc = this;
    return t;
  }
}

/* ---------------------------------------------------------------- "enhanced" graphics: high-res texture twins */
// Every PixelCanvas texture can get a smooth high-res twin (256-512 px): a hand-written generator registered with
// setHiTex(lo, fn), or a generic bicubic upscale with fine grain. Twins are built lazily and cached.
const HI = new Map();
export const TEX_OPT = { aniso: 8 };
export function setHiTex(lo, fn) { HI.set(lo, { fn, tex: null }); return lo; }
export function hiTexture(pc, repeat = true) {
  const t = new THREE.DataTexture(pc.d, pc.w, pc.h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = TEX_OPT.aniso;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
const cubic = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
export function upscale(pc, k, repeat = true, grain = 5) {
  const W = pc.w * k, H = pc.h * k, out = new PixelCanvas(W, H), r = rng(pc.w * 131 + pc.h * 7 + k);
  const at = (x, y, c) => {
    if (repeat) { x = ((x % pc.w) + pc.w) % pc.w; y = ((y % pc.h) + pc.h) % pc.h; } else { x = clamp(x, 0, pc.w - 1); y = clamp(y, 0, pc.h - 1); }
    return pc.d[(y * pc.w + x) * 4 + c];
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = (x + 0.5) / k - 0.5, fy = (y + 0.5) / k - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const o = (y * W + x) * 4, g = (r() - 0.5) * grain;
    for (let c = 0; c < 4; c++) {
      const row = (j) => cubic(at(x0 - 1, y0 + j, c), at(x0, y0 + j, c), at(x0 + 1, y0 + j, c), at(x0 + 2, y0 + j, c), tx);
      let v = cubic(row(-1), row(0), row(1), row(2), ty);
      if (c < 3) v += g * (0.4 + v / 255);
      out.d[o + c] = clamp(Math.round(v), 0, 255);
    }
  }
  return out;
}
export function hiOf(lo) {
  if (!lo || !lo.userData || !lo.userData.pc || lo.userData.pc.w * lo.userData.pc.h < 16) return lo;
  let e = HI.get(lo);
  if (!e) { e = { fn: null, tex: null }; HI.set(lo, e); }
  if (!e.tex) {
    const repeat = lo.wrapS === THREE.RepeatWrapping;
    if (e.fn) e.tex = e.fn();
    else {
      const pc = lo.userData.pc, k = clamp(2 ** Math.ceil(Math.log2(256 / Math.min(pc.w, pc.h))), 1, 16);
      e.tex = k > 1 ? hiTexture(upscale(pc, k, repeat), repeat) : hiTexture(pc, repeat);
    }
  }
  return e.tex;
}

export const WHITE_TEX = new PixelCanvas(1, 1, [255, 255, 255]).texture();
