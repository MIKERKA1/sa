// Photo surfaces for the enhanced renderer: WebP albedo (+ half-res structure height for jointed surfaces) embedded by
// tools/photo_tex.py, decoded once at startup into repeat-wrapped mipmapped DataTextures. Each albedo carries its
// tangent-space normal map (alpha = gloss) and specular parameters in userData, which ps1Material picks up.
// Row 0 of every DataTexture is v = 0 (the bottom of the photo), like the PixelCanvas textures.
import * as THREE from 'three';
import { PHOTO_DATA } from './photo_data.gen.js';
import { PHOTO_HW } from './photo_hw.gen.js';
const ALL_PHOTOS = { ...PHOTO_DATA, ...PHOTO_HW };
import { TEX_OPT, setHiTex } from './util.js';

// tile: metres covered by one photo tile; depth: relief (mm) of a full 0..1 height step; big/fine: high-pass sigmas (px of a
// 1024 tile) and fine weight of the albedo-derived relief; st: weight of the shipped structure height; spec / gloss / metal:
// specular level, glossiness (0..1, modulated by height: worn tops shinier), metal tint
export const PHOTO_CFG = {
  floor: { tile: 2, depth: 2.6, big: 12, fine: 2, wf: 0.5, hk: 0.5, st: 1, spec: 0.07, gloss: 0.42, gh: 0.25 },
  plank: { tile: 2, depth: 3.2, big: 12, fine: 2, wf: 0.6, hk: 0.6, st: 1, spec: 0.035, gloss: 0.2, gh: 0.15 },
  wash: { tile: 2, depth: 2.2, big: 40, fine: 3, wf: 0.6, spec: 0.02, gloss: 0.12 },
  washI: { tile: 2, depth: 1.8, big: 40, fine: 3, wf: 0.6, spec: 0.025, gloss: 0.16 },
  wood: { tile: 1, depth: 0.5, big: 16, fine: 2, wf: 0.5, spec: 0.09, gloss: 0.58, gh: 0.15 },
  stone: { tile: 1.2, depth: 16, big: 24, fine: 3, wf: 0.45, hk: 0.45, st: 1, spec: 0.04, gloss: 0.25 },
  brick: { tile: 1, depth: 7, big: 8, fine: 2, wf: 0.5, hk: 0.3, st: 1, spec: 0.03, gloss: 0.22 },
  flag: { tile: 2, depth: 9, big: 30, fine: 3, wf: 0.4, hk: 0.4, st: 1, spec: 0.07, gloss: 0.5, gh: 0.3 },
  roof: { tile: 1, depth: 9, big: 20, fine: 2.5, wf: 0.4, hk: 0.45, st: 1, spec: 0.05, gloss: 0.32 },
  mud: { tile: 1.5, depth: 9, big: 20, fine: 2, wf: 0.5, spec: 0.14, gloss: 0.55, gh: -0.4 },
  grass: { tile: 1.2, depth: 7, big: 12, fine: 2, wf: 0.6, spec: 0.03, gloss: 0.22 },
  snow: { tile: 2, depth: 9, big: 30, fine: 2, wf: 0.4, spec: 0.09, gloss: 0.42 },
  litter: { tile: 2, depth: 10, big: 12, fine: 2, wf: 0.6, spec: 0.05, gloss: 0.35 },
  hay: { tile: 1, depth: 10, big: 10, fine: 2, wf: 0.6, spec: 0.03, gloss: 0.28 },
  bark: { tile: 0.5, depth: 9, big: 10, fine: 2, wf: 0.5, spec: 0.03, gloss: 0.2 },
  burlap: { tile: 0.5, depth: 1.6, big: 6, fine: 1.5, wf: 0.8, spec: 0.01, gloss: 0.1 },
  iron: { tile: 0.5, depth: 1.4, big: 10, fine: 2, wf: 0.6, spec: 0.35, gloss: 0.55, gh: 0.2, metal: 1 },
  // Concept-sourced close-up hardware. Clamp projected faces, repeat the generic iron and steel strips.
  lockF: { tile: .069, depth: .32, big: 18, fine: 2, wf: .5, spec: .34, gloss: .53, metal: 1, clamp: true },
  lockB: { tile: .069, depth: .32, big: 18, fine: 2, wf: .5, spec: .34, gloss: .53, metal: 1, clamp: true },
  lockBand: { tile: .0134, depth: .2, big: 12, fine: 2, wf: .4, spec: .32, gloss: .5, metal: 1 },
  shackle: { tile: .0713, depth: .3, big: 12, fine: 2, wf: .5, spec: .38, gloss: .58, metal: 1, clamp: true },
  frac: { tile: .024, depth: .25, big: 12, fine: 2, wf: .5, spec: .48, gloss: .72, metal: 1, clamp: true },
  keyF: { tile: .0715, depth: .22, big: 12, fine: 2, wf: .5, spec: .38, gloss: .58, metal: 1, clamp: true },
  boltF: { tile: .365, depth: .4, big: 20, fine: 2, wf: .5, spec: .36, gloss: .58, metal: 1, clamp: true },
  keeperF: { tile: .033, depth: .25, big: 12, fine: 2, wf: .5, spec: .32, gloss: .5, metal: 1, clamp: true },
  hwIron: { tile: .033, depth: .22, big: 12, fine: 2, wf: .5, spec: .32, gloss: .52, metal: 1 },
  hwSteel: { tile: .122, depth: .15, big: 12, fine: 2, wf: .4, spec: .48, gloss: .75, metal: 1 },
  hwPlate: { tile: .132, depth: .25, big: 12, fine: 2, wf: .5, spec: .32, gloss: .52, metal: 1 },
};

const PX = {}, TEX = {};

async function decode(b64) {
  const img = new Image();
  img.src = 'data:image/webp;base64,' + b64;
  await img.decode();
  const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const src = g.getImageData(0, 0, w, h).data, d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) d.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // bottom row first
  return { w, h, d };
}

// decode every embedded surface (call once before building scenes); resolves even if decoding fails (falls back to procedural)
export async function loadPhotos(names = Object.keys(ALL_PHOTOS)) {
  await Promise.all(names.map(async (n) => {
    const e = ALL_PHOTOS[n];
    if (!e || PX[n]) return;
    try { PX[n] = { a: await decode(e.a), h: e.h ? await decode(e.h) : null }; } catch (err) { console.warn('photo', n, err); }
  }));
}
export const hasPhoto = (n) => !!PX[n];

/* ---------------------------------------------------------------- height -> normal (+ gloss) */
// wrap-around box blur (3 passes ~ gaussian sigma s)
function blurWrap(src, w, h, s) {
  const r = Math.max(1, Math.round(s * 0.9)), n = 2 * r + 1;
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let acc = 0;
      for (let k = -r; k <= r; k++) acc += a[o + ((k % w) + w) % w];
      for (let x = 0; x < w; x++) { b[o + x] = acc / n; acc += a[o + (x + r + 1) % w] - a[o + ((x - r) % w + w) % w]; }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += b[(((k % h) + h) % h) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = acc / n; acc += b[((y + r + 1) % h) * w + x] - b[(((y - r) % h + h) % h) * w + x]; }
    }
  }
  return a;
}
function heightOf(n) {
  const { a, h: hs } = PX[n], c = PHOTO_CFG[n], w = a.w, h = a.h, N = w * h, k = w / 1024;
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = (a.d[i * 4] * 0.299 + a.d[i * 4 + 1] * 0.587 + a.d[i * 4 + 2] * 0.114) / 255;
  const big = blurWrap(L, w, h, c.big * k), fine = blurWrap(L, w, h, c.fine * k), H = new Float32Array(N);
  for (let i = 0; i < N; i++) H[i] = (L[i] - big[i]) + (L[i] - fine[i]) * c.wf;
  // normalise the albedo relief to roughly 0..1 (2nd..98th percentile)
  const sm = Float32Array.from(H.filter((_, i) => i % 7 === 0)).sort(), lo = sm[Math.floor(sm.length * 0.02)], hi = sm[Math.floor(sm.length * 0.98)];
  for (let i = 0; i < N; i++) H[i] = Math.min(1, Math.max(0, (H[i] - lo) / Math.max(hi - lo, 1e-4)));
  if (hs) { // structure height (half res, bilinear, wrapped) + albedo detail
    const hk = c.hk ?? 0.4, sw = hs.w, sh = hs.h;
    for (let y = 0; y < h; y++) {
      const fy = ((y + 0.5) * sh) / h - 0.5, y0 = Math.floor(fy), ty = fy - y0, ya = ((y0 % sh) + sh) % sh, yb = (ya + 1) % sh;
      for (let x = 0; x < w; x++) {
        const fx = ((x + 0.5) * sw) / w - 0.5, x0 = Math.floor(fx), tx = fx - x0, xa = ((x0 % sw) + sw) % sw, xb = (xa + 1) % sw;
        const v = (hs.d[(ya * sw + xa) * 4] * (1 - tx) + hs.d[(ya * sw + xb) * 4] * tx) * (1 - ty) + (hs.d[(yb * sw + xa) * 4] * (1 - tx) + hs.d[(yb * sw + xb) * 4] * tx) * ty;
        const i = y * w + x;
        H[i] = (v / 255) * c.st * (1 - hk) + H[i] * hk;
      }
    }
  }
  return H;
}
function makeTex(d, w, h, mips = true) {
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  t.anisotropy = TEX_OPT.aniso;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
function normalTex(n) {
  const c = PHOTO_CFG[n], { w, h } = PX[n].a, H = heightOf(n), d = new Uint8Array(w * h * 4);
  // slope per pixel step of a unit height = relief depth / pixel size
  const s = (c.depth / 1000) / (c.tile / w);
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yo = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (H[yo + xp] - H[yo + xm]) * 0.5 * s, dy = (H[yp + x] - H[ym + x]) * 0.5 * s;
      const il = 1 / Math.hypot(dx, dy, 1), i = (yo + x) * 4;
      d[i] = Math.round((-dx * il * 0.5 + 0.5) * 255); d[i + 1] = Math.round((-dy * il * 0.5 + 0.5) * 255); d[i + 2] = Math.round((il * 0.5 + 0.5) * 255);
      d[i + 3] = Math.round(Math.min(1, Math.max(0, c.gloss + (c.gh || 0) * (H[yo + x] - 0.5))) * 255);
    }
  }
  return makeTex(d, w, h);
}

// albedo DataTexture of a photo surface (cached), with userData { nmap, spec, gloss, metal, tile }; null if not loaded
export function photoTex(n) {
  if (TEX[n]) return TEX[n];
  const p = PX[n];
  if (!p) return null;
  const t = makeTex(p.a.d, p.a.w, p.a.h), c = PHOTO_CFG[n];
  const nm = normalTex(n);
  if (c.clamp) { t.wrapS = t.wrapT = nm.wrapS = nm.wrapT = THREE.ClampToEdgeWrapping; }
  t.userData = { photo: n, nmap: nm, spec: c.spec, gloss: c.gloss, metal: c.metal || 0, tile: c.tile };
  return (TEX[n] = t);
}
// make photo n the enhanced twin of the procedural texture lo (whose tile is loTile metres; the shader rescales the uv)
export function photoTwin(lo, n, loTile = PHOTO_CFG[n] ? PHOTO_CFG[n].tile : 1) {
  if (!lo || !PX[n]) return lo;
  setHiTex(lo, () => photoTex(n));
  lo.userData.hiUV = loTile / PHOTO_CFG[n].tile;
  return lo;
}
