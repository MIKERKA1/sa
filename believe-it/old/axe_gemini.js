// "Believe It" — farm wood-chopping axe, PS1-style low-poly prop built from the concept specification.
// Origin = bottom of the handle knob (y = 0); handle extends along +Y (L = 0.70 m), blade points towards +X.
// 6-sided faceted handle, forged wedge head with rust, sharpened edge bevel, wooden wedge & twine wrap.
// One 128x128 painted atlas with nearest-neighbor filtering.
import * as THREE from 'three';
import { MeshBuilder, loft, ring, quad, mat4 } from '../engine/geo.js';
import { ps1Material } from '../engine/ps1.js';
import { PixelCanvas, valueNoise, rng, hex, mixc, mulc, clamp, lerp } from '../engine/util.js';

const V3 = THREE.Vector3;
const v3 = (x, y, z) => new V3(x, y, z);
const W1 = [1, 1, 1];

/* ================================================================ palette */
const C = {
  // Forged iron / steel
  iron: hex('#2e3033'), ironD: hex('#1c1d1f'), ironL: hex('#484b50'),
  rust: hex('#6e371d'), rustD: hex('#422010'), rustL: hex('#96512b'),
  edge: hex('#d4d8dd'), edgeD: hex('#9aa0a6'), edgeL: hex('#f0f3f6'),
  // Weathered farm wood
  wood: hex('#5e4e3f'), woodD: hex('#42352a'), woodL: hex('#7a6654'),
  // Polished grip areas (darkened by hand oil and friction)
  grip: hex('#3d2f24'), gripD: hex('#291e16'), gripL: hex('#524032'),
  // Twine / hemp wrap
  twine: hex('#887758'), twineD: hex('#584b34'), twineL: hex('#a69572'), twineShadow: hex('#322a1c'),
  // Wedge (fresh cut pine / birch)
  wedge: hex('#8a7155'), wedgeD: hex('#5c4934'), wedgeL: hex('#ab8f6e'),
};

/* ================================================================ atlas layout (128x128 px) */
const AW = 128, AH = 128;
const RG = {
  headSide: { x: 0, y: 0, w: 64, h: 48 },    // axe cheek sides (+Z and -Z)
  headEdge: { x: 64, y: 0, w: 32, h: 48 },    // sharpened edge & bevel strip
  headPoll: { x: 96, y: 0, w: 32, h: 48 },    // poll (back) & top/bottom flat faces
  handleWood: { x: 0, y: 48, w: 48, h: 80 },  // 6-sided shaft, weathered grain + wear
  knob: { x: 48, y: 48, w: 32, h: 32 },        // flared knob & end cap
  twine: { x: 48, y: 80, w: 48, h: 24 },       // wrapped twine cord
  wedge: { x: 48, y: 104, w: 32, h: 24 },      // wooden wedge in eye
  swatch: { x: 80, y: 104, w: 48, h: 24 },     // color swatch / spare
};

const uvR = (R, fx, fy, tw = AW, th = AH) => [
  (R.x + 0.5 + clamp(fx, 0, 1) * (R.w - 1)) / tw,
  (R.y + 0.5 + clamp(fy, 0, 1) * (R.h - 1)) / th,
];

/* ================================================================ procedural atlas texture */
function atlasTexture() {
  const pc = new PixelCanvas(AW, AH, [35, 35, 35]);
  const nA = valueNoise(501, 32, 32), nB = valueNoise(502, 16, 16), nC = valueNoise(503, 8, 8), r = rng(504);
  const put = (R, x, y, c, a) => pc.set(R.x + x, R.y + y, c.map((q) => clamp(Math.round(q), 0, 255)), a);

  // 1. AXE CHEEK SIDES (headSide: 64x48)
  for (let y = 0; y < RG.headSide.h; y++) {
    for (let x = 0; x < RG.headSide.w; x++) {
      const u = x / RG.headSide.w;
      // Dark forged iron base with hammer marks
      const m = nA(x / 4, y / 4) * 0.6 + nB(x / 2, y / 2) * 0.4;
      let c = mixc(C.ironD, C.iron, 0.3 + m * 0.7);
      if (m > 0.7) c = mixc(c, C.ironL, (m - 0.7) * 2.0);

      // Rust patches towards the poll and eye (left half)
      const rustNoise = nC(x / 3, y / 3);
      if (u < 0.7 && rustNoise > 0.48) {
        const rustAmt = clamp((0.7 - u) * 1.5 * (rustNoise - 0.48) * 3.5, 0, 0.9);
        c = mixc(c, rustNoise > 0.7 ? C.rustL : C.rust, rustAmt);
      }

      // Sharpened grind line on the far right (u > 0.75)
      if (u > 0.75) {
        const grindU = (u - 0.75) / 0.25;
        const grindStreak = (nA(x * 2, y * 0.5) - 0.5) * 0.25;
        let sc = mixc(C.edgeD, C.edge, grindU + grindStreak);
        if (grindU > 0.65) sc = mixc(sc, C.edgeL, (grindU - 0.65) * 2.5);
        c = mixc(c, sc, clamp(grindU * 1.4, 0, 1));
      }

      // Forge scale pitting
      if (r() < 0.04) c = mulc(c, 0.65);
      put(RG.headSide, x, y, mulc(c, 0.94 + r() * 0.12));
    }
  }

  // Small nicks on the cutting edge (rightmost pixels)
  for (let i = 0; i < 4; i++) {
    const ny = Math.floor(r() * RG.headSide.h);
    put(RG.headSide, RG.headSide.w - 1, ny, C.ironD);
    put(RG.headSide, RG.headSide.w - 2, ny, C.rust);
  }

  // 2. SHARPENED EDGE & BEVEL (headEdge: 32x48)
  for (let y = 0; y < RG.headEdge.h; y++) {
    for (let x = 0; x < RG.headEdge.w; x++) {
      const u = x / RG.headEdge.w;
      const grind = (nA(x, y * 0.75) - 0.5) * 0.3;
      let c = mixc(C.edgeD, C.edge, 0.4 + grind);
      if (u > 0.35 && u < 0.65) c = mixc(c, C.edgeL, 0.6);
      if (r() < 0.03) c = C.ironD; // tiny nick
      put(RG.headEdge, x, y, mulc(c, 0.95 + r() * 0.1));
    }
  }

  // 3. POLL & TOP/BOTTOM FLATS (headPoll: 32x48)
  for (let y = 0; y < RG.headPoll.h; y++) {
    for (let x = 0; x < RG.headPoll.w; x++) {
      const m = nA(x / 3, y / 3) * 0.7 + nB(x / 2, y / 2) * 0.3;
      let c = mixc(C.ironD, C.iron, 0.4 + m * 0.6);
      if (m > 0.65) c = mixc(c, C.rust, (m - 0.65) * 2.2);
      if (r() < 0.05) c = C.ironD;
      put(RG.headPoll, x, y, mulc(c, 0.92 + r() * 0.14));
    }
  }

  // 4. HANDLE WOOD SHAFT (handleWood: 48x80)
  for (let y = 0; y < RG.handleWood.h; y++) {
    const v = y / RG.handleWood.h;
    // Lower grip area (v: 0.05 - 0.25) & Upper grip area (v: 0.45 - 0.65)
    const isLowerGrip = v > 0.04 && v < 0.28;
    const isUpperGrip = v > 0.42 && v < 0.66;
    const gripFactor = isLowerGrip ? 1 - Math.abs(v - 0.16) / 0.12 : isUpperGrip ? 1 - Math.abs(v - 0.54) / 0.12 : 0;

    for (let x = 0; x < RG.handleWood.w; x++) {
      // Wood grain lines running vertically
      const grain = nA(x / 2.5, y / 12) * 0.65 + nB(x * 1.5, y / 4) * 0.35;
      let c = mixc(C.woodD, C.wood, 0.35 + grain * 0.65);
      if (grain > 0.72) c = mixc(c, C.woodL, (grain - 0.72) * 2.2);

      // Darken and smooth the grip areas (hand polish & oils)
      if (gripFactor > 0) {
        const smoothGrip = mixc(C.gripD, C.grip, grain);
        c = mixc(c, smoothGrip, clamp(gripFactor * 0.85, 0, 1));
      }

      // Vertical cracks and splits in old dry wood
      if (x % 16 === 7 && grain < 0.4) {
        c = mulc(C.woodD, 0.6);
      }
      put(RG.handleWood, x, y, mulc(c, 0.95 + r() * 0.1));
    }
  }

  // 5. KNOB (knob: 32x32)
  for (let y = 0; y < RG.knob.h; y++) {
    for (let x = 0; x < RG.knob.w; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      let c = mixc(C.woodD, C.wood, nA(x / 3, y / 3));
      // End grain rings
      if (d < 0.85 && Math.sin(d * 22) > 0.3) c = mulc(c, 0.82);
      if (d > 0.75) c = mixc(c, C.gripD, 0.6);
      put(RG.knob, x, y, mulc(c, 0.93 + r() * 0.14));
    }
  }

  // 6. TWINE WRAP (twine: 48x24)
  for (let y = 0; y < RG.twine.h; y++) {
    const cordPhase = (y % 4) / 3; // 4 px per cord turn
    for (let x = 0; x < RG.twine.w; x++) {
      const fiber = nC(x * 2, y * 3);
      let c = mixc(C.twineD, C.twine, 0.4 + fiber * 0.6);
      if (cordPhase < 0.25 || cordPhase > 0.85) c = mixc(c, C.twineShadow, 0.7); // groove between cord turns
      if (cordPhase > 0.4 && cordPhase < 0.7) c = mixc(c, C.twineL, 0.5); // highlight on top of cord
      put(RG.twine, x, y, mulc(c, 0.94 + r() * 0.12));
    }
  }

  // 7. WEDGE (wedge: 32x24)
  for (let y = 0; y < RG.wedge.h; y++) {
    for (let x = 0; x < RG.wedge.w; x++) {
      const grain = nA(x * 2, y / 4);
      let c = mixc(C.wedgeD, C.wedge, 0.4 + grain * 0.6);
      if (x === 0 || x === RG.wedge.w - 1 || y === 0) c = mulc(c, 0.65);
      put(RG.wedge, x, y, mulc(c, 0.95 + r() * 0.1));
    }
  }

  return pc.texture(false);
}

let AT_TEX = null;
const atlas = () => (AT_TEX ||= atlasTexture());

/* ================================================================ Axe Geometry */
const AXE_DIMS = {
  length: 0.70,
  headY: 0.64,
  gripR: 0.0175,
};

export function makeAxe() {
  const tex = atlas();
  const mat = ps1Material({ map: tex });

  // Parts dictionary for exploded view
  const PARTS = {
    handle: { c: [0, 0.35, 0], ex: [0, 0, 0], hw: 0.02, label: 'Топорище' },
    knob: { c: [0, 0.018, 0], ex: [0, -0.07, 0], hw: 0.025, label: 'Грибок' },
    head: { c: [0.035, 0.64, 0], ex: [0.09, 0.04, 0], hw: 0.09, label: 'Обух и лезвие' },
    wedge: { c: [0.005, 0.693, 0], ex: [0, 0.09, 0], hw: 0.015, label: 'Клин' },
    wrap: { c: [0, 0.58, 0], ex: [0, 0, 0.06], hw: 0.022, label: 'Обмотка' },
  };

  const B = {
    handle: new MeshBuilder(),
    knob: new MeshBuilder(),
    head: new MeshBuilder(),
    wedge: new MeshBuilder(),
    wrap: new MeshBuilder(),
  };

  /* --- 1. HANDLE (6-sided lofted shaft from y = 0.032 to y = 0.692) */
  const N = 6;
  const handleRings = [
    { y: 0.032, rx: 0.019, rz: 0.014 },
    { y: 0.12,  rx: 0.017, rz: 0.013 },
    { y: 0.35,  rx: 0.0155, rz: 0.0115 },
    { y: 0.55,  rx: 0.0165, rz: 0.0125 },
    { y: 0.61,  rx: 0.0175, rz: 0.013 },
    { y: 0.692, rx: 0.0165, rz: 0.012 },
  ];
  const hRings = handleRings.map((hr) => ({
    pts: ring(N, hr.y, hr.rx, hr.rz, { cx: 0, cz: 0, phase: Math.PI / 6 }),
    hard: false,
  }));
  loft(B.handle, hRings, {
    flat: true,
    uv: (r, kk, p) => {
      const u = kk / N;
      const v = (p.y - 0.032) / (0.692 - 0.032);
      return uvR(RG.handleWood, u, v);
    },
    capEnd: {
      apex: v3(0, 0.695, 0),
      uv: () => uvR(RG.knob, 0.5, 0.5),
    },
  });

  /* --- 2. KNOB (flared bottom base) */
  const knobRings = [
    { y: 0.002, rx: 0.024, rz: 0.018 },
    { y: 0.012, rx: 0.022, rz: 0.0165 },
    { y: 0.032, rx: 0.019, rz: 0.014 },
  ];
  const kRings = knobRings.map((kr) => ({
    pts: ring(N, kr.y, kr.rx, kr.rz, { cx: 0, cz: 0, phase: Math.PI / 6 }),
    hard: false,
  }));
  loft(B.knob, kRings, {
    flat: true,
    uv: (r, kk, p) => {
      const u = kk / N;
      const v = (p.y - 0.002) / (0.032 - 0.002);
      return uvR(RG.knob, u, v);
    },
    capStart: {
      apex: v3(0, 0.0, 0),
      uv: () => uvR(RG.knob, 0.5, 0.5),
    },
  });

  /* --- 3. TWINE WRAP (under the head, y = 0.552 to 0.608) */
  const wrapRings = [
    { y: 0.552, rx: 0.0175, rz: 0.0135 },
    { y: 0.558, rx: 0.0188, rz: 0.0148 },
    { y: 0.602, rx: 0.0195, rz: 0.0152 },
    { y: 0.608, rx: 0.0182, rz: 0.0140 },
  ];
  const wRings = wrapRings.map((wr) => ({
    pts: ring(N, wr.y, wr.rx, wr.rz, { cx: 0, cz: 0, phase: Math.PI / 6 }),
    hard: false,
  }));
  loft(B.wrap, wRings, {
    flat: true,
    uv: (r, kk, p) => {
      const u = kk / N;
      const v = (p.y - 0.552) / (0.608 - 0.552);
      return uvR(RG.twine, u, v);
    },
  });

  /* --- 4. AXE HEAD (Poll at -X, Eye around x=0, Blade expanding to +X) */
  const mbH = B.head;
  const sections = [
    { x: -0.052, y0: 0.612, y1: 0.668, hz: 0.016,  u: 0.0 },   // Poll
    { x: -0.018, y0: 0.598, y1: 0.682, hz: 0.015,  u: 0.2 },   // Eye rear
    { x:  0.022, y0: 0.595, y1: 0.685, hz: 0.014,  u: 0.42 },  // Eye front
    { x:  0.075, y0: 0.585, y1: 0.692, hz: 0.009,  u: 0.68 },  // Cheek mid
    { x:  0.108, y0: 0.578, y1: 0.700, hz: 0.0045, u: 0.85 },  // Bevel line
    { x:  0.124, y0: 0.572, y1: 0.704, hz: 0.0008, u: 1.0 },   // Edge
  ];

  // Cheek +Z (+z side) and -Z (-z side)
  for (let s = 0; s < sections.length - 1; s++) {
    const s0 = sections[s], s1 = sections[s + 1];
    const y0_bot = s0.y0, y0_mid = (s0.y0 + s0.y1) * 0.5, y0_top = s0.y1;
    const y1_bot = s1.y0, y1_mid = (s1.y0 + s1.y1) * 0.5, y1_top = s1.y1;

    // +Z cheek face
    const pz0 = v3(s0.x, y0_bot, s0.hz), pz1 = v3(s1.x, y1_bot, s1.hz);
    const pz2 = v3(s1.x, y1_mid, s1.hz), pz3 = v3(s0.x, y0_mid, s0.hz);
    const pz4 = v3(s1.x, y1_top, s1.hz), pz5 = v3(s0.x, y0_top, s0.hz);

    quad(mbH, pz0, pz1, pz2, pz3, [
      uvR(RG.headSide, s0.u, 0.0), uvR(RG.headSide, s1.u, 0.0),
      uvR(RG.headSide, s1.u, 0.5), uvR(RG.headSide, s0.u, 0.5),
    ]);
    quad(mbH, pz3, pz2, pz4, pz5, [
      uvR(RG.headSide, s0.u, 0.5), uvR(RG.headSide, s1.u, 0.5),
      uvR(RG.headSide, s1.u, 1.0), uvR(RG.headSide, s0.u, 1.0),
    ]);

    // -Z cheek face (reverse winding)
    const nz0 = v3(s0.x, y0_bot, -s0.hz), nz1 = v3(s1.x, y1_bot, -s1.hz);
    const nz2 = v3(s1.x, y1_mid, -s1.hz), nz3 = v3(s0.x, y0_mid, -s0.hz);
    const nz4 = v3(s1.x, y1_top, -s1.hz), nz5 = v3(s0.x, y0_top, -s0.hz);

    quad(mbH, nz1, nz0, nz3, nz2, [
      uvR(RG.headSide, s1.u, 0.0), uvR(RG.headSide, s0.u, 0.0),
      uvR(RG.headSide, s0.u, 0.5), uvR(RG.headSide, s1.u, 0.5),
    ]);
    quad(mbH, nz2, nz3, nz5, nz4, [
      uvR(RG.headSide, s1.u, 0.5), uvR(RG.headSide, s0.u, 0.5),
      uvR(RG.headSide, s0.u, 1.0), uvR(RG.headSide, s1.u, 1.0),
    ]);

    // Top spine face (pz5, pz4, nz4, nz5)
    quad(mbH, pz5, pz4, nz4, nz5, [
      uvR(RG.headPoll, s0.u, 0.0), uvR(RG.headPoll, s1.u, 0.0),
      uvR(RG.headPoll, s1.u, 1.0), uvR(RG.headPoll, s0.u, 1.0),
    ]);

    // Bottom beard face (pz0, nz0, nz1, pz1)
    quad(mbH, pz0, nz0, nz1, pz1, [
      uvR(RG.headPoll, s0.u, 0.0), uvR(RG.headPoll, s0.u, 1.0),
      uvR(RG.headPoll, s1.u, 1.0), uvR(RG.headPoll, s1.u, 0.0),
    ]);
  }

  // Poll back face (at x = -0.052)
  const sp = sections[0];
  const poll_bl = v3(sp.x, sp.y0, sp.hz), poll_br = v3(sp.x, sp.y0, -sp.hz);
  const poll_tr = v3(sp.x, sp.y1, -sp.hz), poll_tl = v3(sp.x, sp.y1, sp.hz);
  quad(mbH, poll_bl, poll_tl, poll_tr, poll_br, [
    uvR(RG.headPoll, 0.0, 0.0), uvR(RG.headPoll, 0.0, 1.0),
    uvR(RG.headPoll, 1.0, 1.0), uvR(RG.headPoll, 1.0, 0.0),
  ]);

  // Front cutting edge bevel seam (at x = 0.124)
  const se = sections[sections.length - 1];
  const edge_b_z = v3(se.x, se.y0, se.hz), edge_b_nz = v3(se.x, se.y0, -se.hz);
  const edge_t_nz = v3(se.x, se.y1, -se.hz), edge_t_z = v3(se.x, se.y1, se.hz);
  quad(mbH, edge_b_z, edge_b_nz, edge_t_nz, edge_t_z, [
    uvR(RG.headEdge, 0.0, 0.0), uvR(RG.headEdge, 1.0, 0.0),
    uvR(RG.headEdge, 1.0, 1.0), uvR(RG.headEdge, 0.0, 1.0),
  ]);

  /* --- 5. WOODEN WEDGE IN EYE (top of head, y = 0.69 to 0.697) */
  const mbW = B.wedge;
  const w_p0 = v3(-0.008, 0.693,  0.003), w_p1 = v3( 0.016, 0.693,  0.003);
  const w_p2 = v3( 0.016, 0.693, -0.003), w_p3 = v3(-0.008, 0.693, -0.003);
  const w_t0 = v3(-0.007, 0.698,  0.0015), w_t1 = v3( 0.015, 0.698,  0.0015);
  const w_t2 = v3( 0.015, 0.698, -0.0015), w_t3 = v3(-0.007, 0.698, -0.0015);

  // Wedge top face
  quad(mbW, w_t0, w_t1, w_t2, w_t3, [
    uvR(RG.wedge, 0.0, 0.0), uvR(RG.wedge, 1.0, 0.0),
    uvR(RG.wedge, 1.0, 1.0), uvR(RG.wedge, 0.0, 1.0),
  ]);
  // Wedge sides
  quad(mbW, w_p0, w_p1, w_t1, w_t0, [
    uvR(RG.wedge, 0.0, 0.0), uvR(RG.wedge, 1.0, 0.0),
    uvR(RG.wedge, 1.0, 0.5), uvR(RG.wedge, 0.0, 0.5),
  ]);
  quad(mbW, w_p2, w_p3, w_t3, w_t2, [
    uvR(RG.wedge, 0.0, 0.0), uvR(RG.wedge, 1.0, 0.0),
    uvR(RG.wedge, 1.0, 0.5), uvR(RG.wedge, 0.0, 0.5),
  ]);

  /* --- ASSEMBLE GROUPS */
  const group = new THREE.Group();
  group.name = 'axe';
  const parts = {}, meshes = [];
  let tris = 0;

  for (const [k, P] of Object.entries(PARTS)) {
    const g = new THREE.Group();
    g.name = 'axe-' + k;
    g.position.set(...P.c);
    const geo = B[k].geometry();
    geo.translate(-P.c[0], -P.c[1], -P.c[2]);
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    group.add(g);
    parts[k] = { group: g, home: new V3(...P.c), ex: new V3(...P.ex), hw: P.hw, label: P.label };
    meshes.push(m);
    tris += B[k].tris;
  }

  function setExplode(t) {
    for (const p of Object.values(parts)) {
      p.group.position.copy(p.home).addScaledVector(p.ex, t);
    }
  }

  function addWire(wireMat) {
    for (const m of meshes) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 1), wireMat);
      l.visible = false;
      l.name = 'wire';
      m.add(l);
    }
  }

  function setWire(on) {
    group.traverse((o) => {
      if (o.name === 'wire') o.visible = on;
    });
  }

  return {
    group,
    parts,
    meshes,
    length: AXE_DIMS.length,
    gripR: AXE_DIMS.gripR,
    tris,
    setExplode,
    addWire,
    setWire,
  };
}
