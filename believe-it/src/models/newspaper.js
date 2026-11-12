// "Believe It" — the newspaper: Münchner Neueste Nachrichten, Mittwoch 29. März 1922 (Nr. 87), built from the approved
// Gemini concept sheet + flat scan. A broadsheet page 38 x 57 cm folded in half across the middle, front page outwards.
// One deformable mid-surface: setFold(1) = folded (as it lies on the bench), setFold(0) = opened for reading
// (a residual crease remains). Two skins (front page / back page 4) offset by the paper thickness, stacked-sheet edges.
// Clues left by "him" (baked + modelled): a dirty thumbprint on the front, a fainter index-finger smudge on the back
// of the folded paper, damp wavy corners on the left, a dry hay stalk caught between the layers at the fold (pokes out on the left).
// The clues sit on the left so Andreas' right hand (holding the right edge) never covers them.
// Local frame: right edge of the page at x = 0 (page runs to -W), fold line at y = 0, top half up (+Y), front = +Z.
// ~340 triangles, 4-bit CLUT page textures (256x384 PS1 / 512x768 enhanced), nearest-neighbour, flat shading.
import * as THREE from 'three';
import { ps1Material } from '../engine/ps1.js';
import { PixelCanvas, setHiTex, hiTexture, rng, clamp, lerp } from '../engine/util.js';
import { NEWS_TEX } from './newspaper_tex.gen.js';

const V3 = THREE.Vector3;
export const NEWS = {
  W: 0.38, H: 0.57, // page (m)
  t: 0.0012, // thickness of the stack of sheets (exaggerated for the low-res look)
  R: 0.0014, // radius of the closed fold
  open: 0.16, // residual crease angle (rad) when opened
  U: [0, 0.12, 0.24, 0.4, 0.6, 0.8, 1], // grid columns (denser at the damp left side)
  VT: [0, 0.07, 0.2, 0.35, 0.5], // top half rows
  VB: [0.64, 0.79, 0.93, 1], // bottom half rows (after the bend rows)
  bendSeg: 3,
  clues: { thumb: [0.095, 0.405], finger: [0.085, 0.612], damp: [0.025, 0.03] }, // page (u, v from top-left)
};

/* ================================================================ textures */
function decode(T) {
  const pc = new PixelCanvas(T.w, T.h), bin = atob(T.data), p = T.pal;
  for (let i = 0; i < T.w * T.h; i++) {
    const b = bin.charCodeAt(i >> 1), k = i & 1 ? b & 15 : b >> 4, x = i % T.w, y = (i / T.w) | 0;
    pc.set(x, T.h - 1 - y, [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]]);
  }
  return pc;
}
function miscTexture() { // 32x32: x 0..15 stacked sheet edge (v across thickness), x 16..31 hay stalk (v along the stalk)
  const pc = new PixelCanvas(32, 32, [200, 188, 160]), r = rng(1922);
  pc.each((x, y) => {
    if (x < 16) {
      const layer = y % 6, n = (r() - 0.5) * 14;
      const c = layer === 0 ? [118, 108, 90] : layer === 5 ? [168, 156, 130] : [206 + n, 193 + n, 163 + n];
      pc.set(x, y, c.map((v) => clamp(v, 0, 255)));
    } else {
      const cx = 23.5, hw = y > 27 ? 2.2 - (y - 27) * 0.35 : 2.6, dx = Math.abs(x - cx);
      if (dx > hw) { pc.set(x, y, [150, 120, 70], 0); return; }
      const n = (r() - 0.5) * 18, rim = dx > hw - 1 ? 0.78 : 1, node = Math.abs(y - 11) < 1 ? 0.7 : 1;
      const split = y > 28 && Math.abs(x - cx) < 0.6 ? 0 : 255;
      pc.set(x, y, [(196 + n) * rim * node, (166 + n) * rim * node, (100 + n * 0.5) * rim * node].map((v) => clamp(Math.round(v), 0, 255)), split);
    }
  });
  return pc.texture(false);
}
let TX = null;
function textures() {
  if (TX) return TX;
  const front = decode(NEWS_TEX.frontLo).texture(false), back = decode(NEWS_TEX.back).texture(false);
  setHiTex(front, () => hiTexture(decode(NEWS_TEX.front), false));
  TX = { front, back, misc: miscTexture() };
  return TX;
}

/* ================================================================ mid-surface */
// fold f in [0,1]: bend angle th = lerp(open, PI); the bend zone keeps its arc length b = PI * R.
function surface(f) {
  const { W, H, R, open } = NEWS, th = lerp(open, Math.PI, f), b = Math.PI * R, Rb = b / th;
  const ye = -Rb * Math.sin(th), ze = -Rb * (1 - Math.cos(th)), ct = Math.cos(th), st = Math.sin(th);
  const bow = 0.018 * (1 - f); // opened page bows away from the reader between the hands
  const wave = (u, v) => { // damp corners on the left edge (top-left and bottom-left of the page)
    let w = 0;
    for (const [cv, s] of [[0, 1], [1, -1]]) {
      const d = Math.hypot(u * W, (v - cv) * H), k = clamp(1 - d / 0.075, 0, 1);
      w += k * k * (0.0045 + 0.0025 * Math.sin(u * 41 + v * 23)) * s * (cv ? -1 : 1);
    }
    return w;
  };
  return (u, v) => {
    const x = -W * (1 - u);
    let y, z, ny, nz;
    if (v <= 0.5) { y = (0.5 - v) * H; z = 0; ny = 0; nz = 1; }
    else {
      const d = (v - 0.5) * H;
      if (d <= b) { const p = d / Rb; y = -Rb * Math.sin(p); z = -Rb * (1 - Math.cos(p)); ny = -Math.sin(p); nz = Math.cos(p); }
      else { y = ye - (d - b) * ct; z = ze - (d - b) * st; ny = -st; nz = ct; }
    }
    const arch = 0.0022 * Math.sin(Math.PI * u) * (1 - Math.abs(v - 0.5) * 1.6) * f + 0.0005 * Math.sin(u * 17 + v * 9);
    const off = arch + wave(u, v) - bow * (1 - (2 * u - 1) ** 2);
    return { p: new V3(x, y + ny * off, z + nz * off), n: new V3(0, ny, nz) };
  };
}

function rows() {
  const { VT, VB, R, H, bendSeg } = NEWS, b = (Math.PI * R) / H, V = [...VT];
  for (let i = 1; i <= bendSeg; i++) V.push(0.5 + (b * i) / bendSeg);
  return V.concat(VB);
}

/* ================================================================ model */
export function makeNewspaper() {
  const T = textures();
  const U = NEWS.U, V = rows(), nu = U.length, nv = V.length;
  const group = new THREE.Group();
  group.name = 'newspaper';
  const mk = (mat, nTris) => {
    const g = new THREE.BufferGeometry();
    for (const [k, n] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(nTris * 3 * n), n));
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  const quads = (nu - 1) * (nv - 1), edgeQ = 2 * (nu - 1) + 2 * (nv - 1);
  const mFront = mk(ps1Material({ map: T.front }), quads * 2);
  const mBack = mk(ps1Material({ map: T.back }), quads * 2);
  const mEdge = mk(ps1Material({ map: T.misc }), edgeQ * 2);
  const mStraw = mk(ps1Material({ map: T.misc, side: THREE.DoubleSide, alphaCut: 0.5 }), 12);
  const meshes = [mFront, mBack, mEdge, mStraw];
  const tris = (quads * 4 + edgeQ * 2 + 12);
  const state = { fold: 1, straw: true };
  const _a = new V3(), _b = new V3(), _n = new V3();

  function writer(mesh) {
    const g = mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, UV = g.attributes.uv.array, C = g.attributes.color.array;
    let i = 0;
    return {
      tri(a, b, c, ta, tb, tc, want, col = [1, 1, 1]) {
        _a.subVectors(b, a); _b.subVectors(c, a); _n.crossVectors(_a, _b).normalize();
        if (want && _n.dot(want) < 0) { [b, c] = [c, b]; [tb, tc] = [tc, tb]; _n.negate(); }
        for (const [p, t] of [[a, ta], [b, tb], [c, tc]]) {
          P.set([p.x, p.y, p.z], i * 3); N.set([_n.x, _n.y, _n.z], i * 3); UV.set(t, i * 2); C.set(col, i * 3); i++;
        }
      },
      quad(a, b, c, d, ta, tb, tc, td, want, col) { this.tri(a, b, c, ta, tb, tc, want, col); this.tri(a, c, d, ta, tc, td, want, col); },
      done() { for (const k of ['position', 'normal', 'uv', 'color']) g.attributes[k].needsUpdate = true; g.computeBoundingSphere(); },
    };
  }

  function build() {
    const S = surface(state.fold), h = NEWS.t / 2;
    const G = V.map((v) => U.map((u) => S(u, v)));
    const F = G.map((r) => r.map((s) => s.p.clone().addScaledVector(s.n, h)));
    const B = G.map((r) => r.map((s) => s.p.clone().addScaledVector(s.n, -h)));
    const wf = writer(mFront), wb = writer(mBack), we = writer(mEdge), ws = writer(mStraw);
    const jb = NEWS.VT.length - 1; // first bend row
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const n = G[j][i].n.clone().add(G[j + 1][i + 1].n).normalize();
      const tf = (ii, jj) => [U[ii], 1 - V[jj]], tb = (ii, jj) => [1 - U[ii], 1 - V[jj]];
      const c = j >= jb && j < jb + NEWS.bendSeg ? [0.9, 0.9, 0.9] : [1, 1, 1]; // the crease reads a touch darker
      wf.quad(F[j][i], F[j][i + 1], F[j + 1][i + 1], F[j + 1][i], tf(i, j), tf(i + 1, j), tf(i + 1, j + 1), tf(i, j + 1), n, c);
      wb.quad(B[j][i], B[j][i + 1], B[j + 1][i + 1], B[j + 1][i], tb(i, j), tb(i + 1, j), tb(i + 1, j + 1), tb(i, j + 1), n.clone().negate(), c);
    }
    // stacked-sheet edges, outward = away from the page centre along the surface
    const E = 0.86, eu = (k, n) => [((k % 2) * 15 + 0.5) / 32, n];
    const side = (pts, out) => { for (let k = 0; k < pts.length - 1; k++) { const [a, b] = [pts[k], pts[k + 1]]; we.quad(F[a[0]][a[1]], F[b[0]][b[1]], B[b[0]][b[1]], B[a[0]][a[1]], eu(k, 1), eu(k + 1, 1), eu(k + 1, 0), eu(k, 0), out(a, b), [E, E, E]); } };
    const colL = V.map((_, j) => [j, 0]), colR = V.map((_, j) => [j, nu - 1]), rowT = U.map((_, i) => [0, i]), rowB = U.map((_, i) => [nv - 1, i]);
    side(colL, () => new V3(-1, 0, 0));
    side(colR, () => new V3(1, 0, 0));
    side(rowT, ([j, i]) => G[0][i].p.clone().sub(G[1][i].p).normalize());
    side(rowB, ([j, i]) => G[nv - 1][i].p.clone().sub(G[nv - 2][i].p).normalize());
    // hay stalk: lies between the two layers along the fold, pokes out of the left side
    const x0 = -NEWS.W, z0 = -NEWS.R;
    const pts = [[0.016, 0.016, 0], [-0.016, 0.012, 0], [-0.052, 0.003, 0.0025], [-0.092, -0.01, 0.0065]].map(([x, y, z]) => new V3(x0 + x, y, z0 + z));
    if (state.straw && state.fold > 0.9) {
      const wv = [0.0021, 0.0007]; // half-widths: in the page plane / across it (fits the gap between the layers)
      for (let k = 0; k < 3; k++) {
        const a = pts[k], b = pts[k + 1], dir = b.clone().sub(a).normalize(), s1 = new V3(-dir.y, dir.x, 0).normalize(), s2 = new V3(0, 0, 1);
        const v0 = (k / 3) * 0.9 + 0.05, v1 = ((k + 1) / 3) * 0.9 + 0.05;
        for (const [s, hw] of [[s1, wv[0]], [s2, wv[1]]]) {
          ws.quad(a.clone().addScaledVector(s, -hw), b.clone().addScaledVector(s, -hw), b.clone().addScaledVector(s, hw), a.clone().addScaledVector(s, hw),
            [17 / 32, v0], [17 / 32, v1], [30 / 32, v1], [30 / 32, v0], null);
        }
      }
    } else for (let k = 0; k < 12; k++) ws.tri(new V3(), new V3(), new V3(), [0, 0], [0, 0], [0, 0], null);
    for (const w of [wf, wb, we, ws]) w.done();
    state.S = S;
  }

  // clue anchor (local) for callouts: thumb / finger / damp / straw
  function clue(k) { // { p, n }: n = outward normal of the skin the clue is on
    if (k === 'straw') return { p: new V3(-NEWS.W - 0.055, 0.002, -NEWS.R + 0.003), n: null };
    const [u, v] = NEWS.clues[k], s = state.S(u, v);
    return { p: s.p.clone().addScaledVector(s.n, NEWS.t * 0.5), n: s.n.clone() };
  }
  function setFold(f) { f = clamp(f, 0, 1); if (f === state.fold && state.S) return; state.fold = f; build(); }
  function setStraw(on) { state.straw = on; build(); }
  function addWire(wmat) {
    for (const m of meshes) {
      const g = new THREE.BufferGeometry(), n = m.geometry.attributes.position.count, idx = [];
      g.setAttribute('position', m.geometry.attributes.position);
      for (let i = 0; i < n; i += 3) idx.push(i, i + 1, i + 1, i + 2, i + 2, i);
      g.setIndex(idx);
      const l = new THREE.LineSegments(g, wmat);
      l.visible = false; l.name = 'wire'; l.frustumCulled = false; m.add(l);
    }
  }
  function setWire(on) { group.traverse((o) => { if (o.name === 'wire') o.visible = on; }); }
  build();
  return { group, meshes, tris, state, setFold, setStraw, clue, addWire, setWire, W: NEWS.W, H: NEWS.H, Hf: NEWS.H / 2, tex: T };
}
