// "Believe It" — firewood splitter (farm splitting axe), PS1-style low-poly prop built from the approved
// "Firewood Splitter · Prop Model Sheet" concept.
// Origin = bottom of the haft knob (y = 0); the haft runs along +Y (L = 0.70 m), the bit points to +X, the cheeks face ±Z.
// 8-sided oval ash haft with a rounded knob, faceted cast-iron splitter head, weathered twine wrap below the head.
// ~212 triangles, one 128x128 painted atlas, nearest-neighbour sampling, flat (faceted) shading.
import * as THREE from 'three';
import { MeshBuilder, loft, ring } from '../engine/geo.js';
import { ps1Material } from '../engine/ps1.js';
import { PixelCanvas, valueNoise, rng, hex, mixc, mulc, clamp, lerp } from '../engine/util.js';

const V3 = THREE.Vector3;
const v3 = (x, y, z) => new V3(x, y, z);
const N = 8, PH = Math.PI / 8; // flat faces towards the bit (+X) and the cheeks (±Z)
const W1 = [1, 1, 1];

/* ================================================================ palette (concept sheet chips) */
export const AXE_PALETTE = [
  { id: 'iron', label: 'Железо', en: 'Iron gray', hex: '#3d3e41' },
  { id: 'rust', label: 'Ржавчина', en: 'Rust tone', hex: '#6b2f23' },
  { id: 'wood', label: 'Старое дерево', en: 'Aged wood', hex: '#9a8466' },
  { id: 'cord', label: 'Бечёвка', en: 'Cord wrap', hex: '#c2a47c' },
];
const C = {
  iron: hex('#3d3e41'), ironD: hex('#27282a'), ironL: hex('#57595d'), ironE: hex('#787b80'),
  rust: hex('#5a3125'), rustD: hex('#3e241c'), rustL: hex('#6c3d2d'),
  wood: hex('#927b60'), woodD: hex('#604e3d'), woodL: hex('#b09a7c'), woodG: hex('#8d887c'),
  end: hex('#b59c78'), endD: hex('#806849'), endK: hex('#33271d'),
  cord: hex('#b99b71'), cordD: hex('#836c4b'), cordL: hex('#d8c098'), cordS: hex('#4b3c29'),
};

/* ================================================================ dimensions (metres) */
export const AXE = {
  L: 0.70, rx: 0.0172, rz: 0.0152,
  haft: [[0, 0.62], [0.010, 1.22], [0.030, 1.16], [0.050, 0.95], [0.520, 1.0], [0.700, 1.04]], // [y, scale]
  wrap: [[0.528, 1.03], [0.533, 1.14], [0.589, 1.14], [0.594, 1.04]],
  head: [ // [x, yTop, yBot, half-thickness, forward bulge of the side ridge]
    [-0.034, 0.693, 0.623, 0.0200, 0],
    [-0.012, 0.696, 0.619, 0.0235, 0],
    [0.022, 0.697, 0.615, 0.0215, 0],
    [0.068, 0.699, 0.594, 0.0120, 0.002],
    [0.110, 0.705, 0.561, 0.0048, 0.005],
    [0.127, 0.709, 0.549, 0.0009, 0.007],
  ],
  grips: { R: 0.09, L: 0.38 }, // where the fists go, metres from the knob end
  edge: v3(0.13, 0.63, 0),       // middle of the cutting edge
};

/* ================================================================ atlas (128x128, row 0 = v 0) */
const AW = 128, AH = 128;
const RG = {
  haft: { x: 0, y: 0, w: 32, h: 128 },  // around x along: knob (v 0) -> eye (v 1)
  side: { x: 32, y: 0, w: 64, h: 48 },  // cheeks, planar XY: poll (u 0) -> edge (u 1)
  flat: { x: 96, y: 0, w: 32, h: 48 },  // top, bottom and poll faces
  cord: { x: 32, y: 48, w: 48, h: 32 }, // twine: 8 turns
  endT: { x: 80, y: 48, w: 16, h: 16 }, // end grain at the top of the eye (wedge kerf)
  endB: { x: 96, y: 48, w: 16, h: 16 }, // end grain under the knob
};
export const AXE_ATLAS_REGIONS = RG;
const uvR = (R, fx, fy) => [(R.x + 0.5 + clamp(fx, 0, 1) * (R.w - 1)) / AW, (R.y + 0.5 + clamp(fy, 0, 1) * (R.h - 1)) / AH];

function paintAtlas() {
  const pc = new PixelCanvas(AW, AH, [36, 34, 32]);
  const r = rng(731);
  const nF = valueNoise(701, 32, 32), nM = valueNoise(702, 8, 8), nL = valueNoise(703, 4, 4), nG = valueNoise(704, 32, 16);
  const put = (R, x, y, c) => pc.set(R.x + x, R.y + y, c.map((q) => clamp(Math.round(q), 0, 255)));
  const jit = (c, a = 0.1) => mulc(c, 1 - a / 2 + r() * a);

  /* haft: dry grey-brown ash, long grain streaks, checks, two small knots, hand-worn grip spots */
  {
    const R = RG.haft, cracks = [], knots = [[9, 70], [25, 31]];
    for (let i = 0; i < 6; i++) cracks.push([Math.floor(r() * R.w), 8 + Math.floor(r() * 100), 6 + Math.floor(r() * 14)]);
    const gR = AXE.grips.R / AXE.L, gL = AXE.grips.L / AXE.L;
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const v = y / (R.h - 1);
      const g = nG(x * 0.95, y * 0.12), g2 = nF(x * 1.6, y * 0.45);
      let c = mixc(C.woodD, C.wood, clamp(0.2 + g * 0.95, 0, 1));
      if (g2 > 0.66) c = mixc(c, C.woodL, (g2 - 0.66) * 2.2);
      c = mixc(c, C.woodG, clamp((nL(x / 8, y / 20) - 0.4) * 1.1, 0, 0.42)); // weathered grey patches
      const wear = Math.max(0, 1 - Math.abs(v - gR) / 0.055) + Math.max(0, 1 - Math.abs(v - gL) / 0.05);
      if (wear > 0) c = mixc(c, mulc(C.wood, 0.86), clamp(wear, 0, 1) * 0.55);
      if (v < 0.07) c = mulc(c, 0.86 + v); // grubby knob end
      if (v > 0.885) c = mulc(c, 0.72); // inside the eye
      for (const [cx, cy, len] of cracks) if (x === cx && y >= cy && y < cy + len) c = mulc(C.woodD, 0.62);
      for (const [kx, ky] of knots) {
        const d = Math.hypot((x - kx) / 1.4, (y - ky) / 2.6);
        if (d < 1.0) c = mulc(C.woodD, 0.55); else if (d < 1.9) c = mixc(c, C.woodD, 0.6);
      }
      put(R, x, y, jit(c, 0.09));
    }
  }
  /* cheeks: oxidised cast iron, hammer facets, rust freckles by the eye and along the beard, blunt worn edge */
  {
    const R = RG.side;
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const u = x / (R.w - 1), v = y / (R.h - 1);
      const m = nF(x * 0.9, y * 0.9) * 0.55 + nM(x / 3, y / 3) * 0.45;
      let c = mixc(C.ironD, C.iron, clamp(0.15 + m, 0, 1));
      if (m > 0.68) c = mixc(c, C.ironL, (m - 0.68) * 2.6);
      c = mulc(c, 0.9 + (nL(x / 9, y / 9) - 0.5) * 0.28);
      const rn = nM(x / 2 + 11, y / 2 + 5);
      const zone = clamp((0.42 - u) * 2.4, 0, 1) * 0.6 + clamp((0.24 - v) * 3, 0, 1) * 0.5 + 0.08;
      if (rn > 1 - zone * 0.5) c = mixc(c, rn > 0.88 ? C.rustL : r() < 0.5 ? C.rust : C.rustD, clamp(0.35 + (rn - 0.7) * 1.5, 0, 0.75));
      if (u > 0.85) c = mixc(c, C.ironE, clamp((u - 0.85) / 0.15, 0, 1) * 0.7 * (0.8 + nF(x * 2, y) * 0.4));
      if (Math.abs(u - 0.333) < 0.01) c = mulc(c, 0.8); // forge seam in front of the eye
      if (r() < 0.035) c = mulc(c, 0.68); // pitting
      put(R, x, y, jit(c, 0.08));
    }
  }
  /* top / bottom / poll: darker, more rust (struck face) */
  {
    const R = RG.flat;
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const m = nF(x * 1.1 + 40, y * 1.1) * 0.6 + nM(x / 3 + 7, y / 3) * 0.4;
      let c = mixc(C.ironD, C.iron, clamp(0.1 + m * 0.9, 0, 1));
      if (m > 0.7) c = mixc(c, C.rust, (m - 0.7) * 1.8);
      if (r() < 0.05) c = mulc(c, 0.7);
      put(R, x, y, jit(c, 0.1));
    }
  }
  /* twine: 8 wound turns, twisted strands, grime */
  {
    const R = RG.cord, offs = Array.from({ length: 8 }, () => Math.floor(r() * 3));
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const t = y % 4, turn = Math.floor(y / 4);
      let c = [C.cordS, C.cordL, C.cord, C.cordD][t];
      if (t && (x + offs[turn] + t) % 3 === 0) c = mulc(c, 0.76);
      c = mixc(c, mulc(C.cordD, 0.85), clamp((nM(x / 3, y / 3) - 0.45) * 1.2, 0, 0.45));
      if (t && r() < 0.025) c = C.cordL;
      put(R, x, y, jit(c, 0.08));
    }
  }
  /* end grain: rings, dirty rim; the top one has the wedge kerf along the bit */
  for (const [R, kerf] of [[RG.endT, true], [RG.endB, false]]) {
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      let c = (d * 1.25 + nM(x / 2, y / 2) * 1.2) % 2 < 0.7 ? C.endD : C.end;
      if (d > 6.2) c = mulc(C.endD, 0.7);
      if (kerf && Math.abs(y - 7.5) < 0.9 && d < 6.5) c = C.endK;
      if (!kerf) c = mulc(c, 0.82);
      put(R, x, y, jit(c, 0.08));
    }
  }
  return { pc, tex: pc.texture(true) };
}
let ATLAS = null;
const atlas = () => (ATLAS ||= paintAtlas());

/* ================================================================ geometry */
const endUV = (p, R) => uvR(R, 0.5 + p.x / 0.048, 0.5 + p.z / 0.048);
const oval = (y, s) => ring(N, y, AXE.rx * s, AXE.rz * s, { phase: PH });

function haftMesh() {
  const mb = new MeshBuilder();
  const rings = AXE.haft.map(([y, s]) => ({ pts: oval(y, s), hard: true }));
  loft(mb, rings, {
    flat: true,
    uv: (r, kk, p, f) => (Math.abs(f.y) > 0.9 ? endUV(p, p.y > 0.3 ? RG.endT : RG.endB) : uvR(RG.haft, kk / N, p.y / AXE.L)),
    capStart: { apex: v3(0, -0.003, 0), uv: (a) => endUV(a, RG.endB) },
    capEnd: { apex: v3(0, AXE.L + 0.003, 0), uv: (a) => endUV(a, RG.endT) },
  });
  return mb;
}

function wrapMesh() {
  const mb = new MeshBuilder();
  const y0 = AXE.wrap[0][0], y1 = AXE.wrap[AXE.wrap.length - 1][0];
  loft(mb, AXE.wrap.map(([y, s]) => ({ pts: oval(y, s), hard: true })), {
    flat: true,
    uv: (r, kk, p) => uvR(RG.cord, kk / N, (p.y - y0) / (y1 - y0)),
  });
  return mb;
}

function headMesh() {
  const mb = new MeshBuilder(), H = AXE.head;
  const X0 = H[0][0], X1 = H[H.length - 1][0] + H[H.length - 1][4], Y0 = Math.min(...H.map((h) => h[2])), Y1 = Math.max(...H.map((h) => h[1])), Z = 0.024;
  const rings = H.map(([x, yt, yb, hz, bul]) => {
    const ym = lerp(yb, yt, 0.47);
    return { c: v3(x, ym, 0), pts: [v3(x, yt, hz * 0.7), v3(x + bul, ym, hz), v3(x, yb, hz * 0.7), v3(x, yb, -hz * 0.7), v3(x + bul, ym, -hz), v3(x, yt, -hz * 0.7)] };
  });
  const uvOf = (p, n) => {
    if (Math.abs(n.z) > 0.42 || n.x > 0.7) return uvR(RG.side, (p.x - X0) / (X1 - X0), (p.y - Y0) / (Y1 - Y0));
    if (Math.abs(n.y) > 0.6) return uvR(RG.flat, (p.x - X0) / (X1 - X0), 0.5 + p.z / (2 * Z));
    return uvR(RG.flat, 0.5 + p.z / (2 * Z), (p.y - Y0) / (Y1 - Y0));
  };
  // convex polygon, fan-triangulated, wound so it faces away from `inside`
  const poly = (pts, inside) => {
    const n = new V3();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
    }
    const cen = pts.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / pts.length);
    if (n.dot(cen.sub(inside)) < 0) { pts = pts.slice().reverse(); n.negate(); }
    n.normalize();
    for (let i = 1; i < pts.length - 1; i++) {
      const P = [pts[0], pts[i], pts[i + 1]];
      mb.tri(P, [n, n, n], P.map((p) => uvOf(p, n)), [W1, W1, W1]);
    }
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], mid = A.c.clone().add(B.c).multiplyScalar(0.5);
    for (let k = 0; k < 6; k++) poly([A.pts[k], A.pts[(k + 1) % 6], B.pts[(k + 1) % 6], B.pts[k]], mid);
  }
  poly(rings[0].pts, rings[0].c.clone().add(v3(0.05, 0, 0)));
  const E = rings[rings.length - 1];
  poly(E.pts, E.c.clone().add(v3(-0.05, 0, 0)));
  return mb;
}

/* ================================================================ parts + assembly */
const PARTS = {
  head: { c: [0.05, 0.655, 0], ex: [0, 0.15, 0], hw: 0.095, label: 'Железный обух', build: headMesh },
  wrap: { c: [0, 0.561, 0], ex: [0.085, 0.03, 0], hw: 0.024, label: 'Обмотка бечёвкой', build: wrapMesh },
  haft: { c: [0, 0.35, 0], ex: [0, 0, 0], hw: 0.024, label: 'Топорище (ясень)', build: haftMesh },
};

export function makeAxe() {
  const A = atlas();
  const mat = ps1Material({ map: A.tex });
  const group = new THREE.Group();
  group.name = 'axe';
  const parts = {}, meshes = [];
  let tris = 0;
  for (const [k, P] of Object.entries(PARTS)) {
    const mb = P.build();
    const g = new THREE.Group();
    g.name = 'axe-' + k;
    g.position.set(...P.c);
    const geo = mb.geometry();
    geo.translate(-P.c[0], -P.c[1], -P.c[2]);
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    group.add(g);
    parts[k] = { group: g, home: new V3(...P.c), ex: new V3(...P.ex), hw: P.hw, label: P.label };
    meshes.push(m);
    tris += mb.tris;
  }
  function setExplode(t) { for (const p of Object.values(parts)) p.group.position.copy(p.home).addScaledVector(p.ex, t); }
  function addWire(wmat) {
    for (const m of meshes) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 1), wmat);
      l.visible = false; l.name = 'wire'; m.add(l);
    }
  }
  function setWire(on) { group.traverse((o) => { if (o.name === 'wire') o.visible = on; }); }
  return { group, parts, meshes, mat, tris, setExplode, addWire, setWire, grips: AXE.grips, length: AXE.L, edge: AXE.edge, atlasPx: A.pc };
}
