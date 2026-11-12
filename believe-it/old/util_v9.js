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
    return t;
  }
}

export const WHITE_TEX = new PixelCanvas(1, 1, [255, 255, 255]).texture();
