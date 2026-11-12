// "Believe It" — kerosene hurricane lantern ("летучая мышь"), PS1-style low-poly prop built from the approved concept sheet.
// Origin = centre of the wooden bail grip (grip along local X); the lantern hangs down along -Y, front = +Z.
// 8-sided round parts, wires/bail as thin prisms, one 128x128 painted atlas + a translucent sooty glass + flat flame sprite.
import * as THREE from 'three';
import { MeshBuilder, loft, ring, quad, mat4 } from '../engine/geo.js';
import { ps1Material, GFX } from '../engine/ps1.js';
import { PixelCanvas, valueNoise, rng, hex, mixc, mulc, clamp, lerp, smooth } from '../engine/util.js';

const V3 = THREE.Vector3;
const v3 = (x, y, z) => new V3(x, y, z);
const N = 8, PH = Math.PI / 8; // flat face towards the front (+Z) and the sides (±X)
const W1 = [1, 1, 1];

/* ================================================================ palette (concept sheet swatches) */
const C = {
  paint: hex('#33412f'), paintD: hex('#212a1f'), paintL: hex('#4b5a45'),
  tin: hex('#8b8a80'), tinD: hex('#5d5c55'), tinL: hex('#aba99d'),
  rust: hex('#713c20'), rustD: hex('#45230f'), rustL: hex('#985a2e'),
  soot: hex('#1b1917'),
  wood: hex('#6f4326'), woodD: hex('#47291a'), woodL: hex('#93603a'),
  brass: hex('#6a5e49'), brassD: hex('#39322a'),
};

/* ================================================================ atlas layout (px, row 0 = v 0) */
const AW = 128, AH = 128;
const RG = {
  tank: { x: 0, y: 0, w: 64, h: 32 }, hood: { x: 0, y: 32, w: 64, h: 32 }, tbot: { x: 0, y: 64, w: 32, h: 32 },
  tube: { x: 64, y: 0, w: 16, h: 64 }, burn: { x: 80, y: 0, w: 32, h: 16 }, btop: { x: 80, y: 16, w: 16, h: 16 },
  wire: { x: 96, y: 16, w: 12, h: 16 }, wood: { x: 112, y: 0, w: 16, h: 16 }, wend: { x: 112, y: 16, w: 8, h: 8 },
  knob: { x: 120, y: 16, w: 8, h: 8 }, capf: { x: 80, y: 32, w: 24, h: 8 }, lever: { x: 104, y: 32, w: 16, h: 8 },
};
const uvR = (R, fx, fy, tw = AW, th = AH) => [(R.x + 0.5 + clamp(fx, 0, 1) * (R.w - 1)) / tw, (R.y + 0.5 + clamp(fy, 0, 1) * (R.h - 1)) / th];

/* ================================================================ textures */
function atlasTexture() {
  const pc = new PixelCanvas(AW, AH, [40, 40, 40]);
  const nA = valueNoise(401, 32, 32), nB = valueNoise(402, 16, 16), r = rng(403);
  const put = (R, x, y, c, a) => pc.set(R.x + x, R.y + y, c.map((q) => clamp(Math.round(q), 0, 255)), a);
  const getc = (R, x, y) => pc.get(R.x + x, R.y + y);
  const mixp = (R, x, y, c, t) => pc.mix(R.x + ((x % R.w) + R.w) % R.w, R.y + clamp(y, 0, R.h - 1), c, t);

  // dull green paint over tin: chips to bare tin, rust along seams, shading painted per row
  function painted(R, { seed, shade = () => 1, seams = [], chips = 10, drips = 8, wrap = true }) {
    const rr = rng(seed);
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const m = nA((R.x + x) / 3, (R.y + y) / 3) * 0.6 + nB((R.x + x) / 6, (R.y + y) / 6) * 0.4;
      let c = mixc(C.paintD, C.paint, 0.35 + m * 0.7);
      if (m > 0.68) c = mixc(c, C.paintL, (m - 0.68) * 2.2);
      put(R, x, y, mulc(c, shade((y + 0.5) / R.h) * (0.94 + rr() * 0.12)));
    }
    for (let i = 0; i < chips; i++) { // chipped paint: bare tin, rusty halo
      const cx = rr() * R.w, cy = rr() * R.h, rad = 0.6 + rr() * 1.2;
      for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
        if (y < 0 || y >= R.h || (!wrap && (x < 0 || x >= R.w))) continue;
        const d = Math.hypot(x - cx, (y - cy) * 1.15), xx = ((x % R.w) + R.w) % R.w;
        if (d < rad) put(R, xx, y, mixc(mixc(C.tinD, C.tin, rr() * 0.55), C.rust, rr() < 0.35 ? 0.5 : 0.12));
        else if (d < rad + 0.9) mixp(R, xx, y, rr() < 0.6 ? C.rustD : C.paintL, 0.45);
      }
    }
    for (const s of seams) { // rust along a seam row + short drips down
      for (let x = 0; x < R.w; x++) for (let dy = -1; dy <= 1; dy++) {
        const y = s + dy;
        if (y < 0 || y >= R.h) continue;
        const k = nA((R.x + x) / 2, (R.y + y) / 2) * 0.7 + rr() * 0.3;
        if (k > 0.5 - (dy === 0 ? 0.1 : 0)) mixp(R, x, y, k > 0.74 ? C.rustL : C.rust, dy === 0 ? 0.62 : 0.32);
        if (dy === 0 && rr() < 0.2) mixp(R, x, y, C.rustD, 0.55);
      }
      for (let i = 0; i < drips; i++) {
        const x = Math.floor(rr() * R.w), len = 2 + Math.floor(rr() * 4);
        for (let j = 1; j <= len; j++) mixp(R, x, s - j, C.rust, 0.45 * (1 - j / (len + 1)) + 0.1);
      }
    }
  }

  // tank (u around 8 faces, v: flange 0-4, wall 4-16, shoulder 16-31)
  painted(RG.tank, { seed: 11, chips: 10, drips: 7, seams: [4, 16],
    shade: (v) => (v < 0.13 ? 0.78 : v < 0.5 ? 0.86 + v * 0.3 : 1.12 - (v - 0.5) * 0.5) });
  for (let x = 0; x < 64; x++) { // worn bottom edge, kerosene/soot ring near the burner
    put(RG.tank, x, 0, mixc(C.rustD, C.tinD, r()));
    if (r() < 0.6) mixp(RG.tank, x, 1, C.rust, 0.6);
    for (let y = 28; y < 32; y++) mixp(RG.tank, x, y, C.soot, 0.25 + (y - 28) * 0.15);
  }
  // hood (v: underside 0-9, skirt 9-14 with vents, dome 14-26, apex 26-31)
  painted(RG.hood, { seed: 12, chips: 7, drips: 5, seams: [9, 14],
    shade: (v) => (v < 0.28 ? 0.55 : v < 0.43 ? 0.95 : v < 0.8 ? 1.15 - (v - 0.43) * 0.35 : 0.8) });
  for (let x = 0; x < 64; x++) for (let y = 0; y < 9; y++) mixp(RG.hood, x, y, C.soot, 0.35 + (8 - y) * 0.05);
  for (let f = 0; f < 8; f++) for (const ox of [1, 4, 6]) { // small vent holes on the skirt
    const x = f * 8 + ox;
    put(RG.hood, x, 11, C.soot); put(RG.hood, x, 12, mixc(C.soot, C.rustD, 0.3));
    mixp(RG.hood, x, 10, C.rust, 0.35);
  }
  for (let x = 0; x < 64; x++) for (let y = 26; y < 32; y++) mixp(RG.hood, x, y, nA(x / 2 + 30, y / 2) > 0.62 ? C.rustD : C.soot, 0.25 + (y - 26) * 0.1);
  // tank bottom (planar disc)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5) / 16;
    let c = mixc(C.tinD, C.brassD, 0.5 + (nA(x / 3, y / 3 + 9) - 0.5));
    if (d > 0.8) c = mixc(c, C.rust, 0.6);
    put(RG.tbot, x, y, mulc(c, 0.7 + r() * 0.15));
  }
  // side tubes (u: 4 sides x 4 px, v along: vertical 0-54, bend 54-64)
  painted(RG.tube, { seed: 13, chips: 6, drips: 4, seams: [2, 54], shade: (v) => 0.92 + v * 0.18 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x += 4) mixp(RG.tube, x, y, C.paintD, 0.35); // folded edge line
  // burner (dark tin with rows of air holes)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    let c = mulc(mixc(C.brassD, C.brass, 0.25 + nA(x / 2 + 50, y / 2) * 0.55), 0.85);
    if ((y === 6 || y === 9) && x % 4 === 1) c = mixc(c, C.soot, 0.9);
    if (y >= 14) c = mixc(c, C.tinD, 0.35);
    if (y <= 1) c = mixc(c, C.soot, 0.5);
    put(RG.burn, x, y, mulc(c, 0.9 + r() * 0.15));
  }
  // burner top: perforated ring, wick slot in the middle
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    let c = mulc(mixc(C.brassD, C.brass, 0.3 + r() * 0.3), 0.8);
    if (d > 4.5 && d < 6.4 && (x + y) % 3 === 0) c = mixc(c, C.soot, 0.8);
    if (d > 6.9) c = mixc(C.tinD, C.brassD, r());
    if (Math.abs(x - 7.5) < 3.2 && Math.abs(y - 7.5) < 1.2) c = x % 2 ? C.soot : hex('#5b4a3a');
    put(RG.btop, x, y, c);
  }
  // wire, knob, filler cap, lever
  for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) {
    let c = mixc(C.tinD, C.brassD, r() * 0.6);
    if (r() < 0.18) c = mixc(c, C.rust, 0.7);
    if (x % 4 === 0) c = mulc(c, 1.25);
    put(RG.wire, x, y, c);
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const e = x === 0 || y === 0 || x === 7 || y === 7;
    put(RG.knob, x, y, mulc(e ? C.brassD : mixc(C.tinD, C.tin, r() * 0.7), 0.9));
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) {
    let c = mixc(C.brassD, C.tinD, 0.4 + r() * 0.5);
    if (x % 2 === 0) c = mulc(c, 0.72);
    if (y === 7) c = C.tin;
    if (y <= 1) c = mixc(c, C.rust, 0.55);
    put(RG.capf, x, y, c);
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) put(RG.lever, x, y, r() < 0.25 ? C.rust : mixc(C.tinD, C.paintD, 0.4 + r() * 0.3));
  // wooden grip (u around 8 faces x 2 px, v along the grip): grain along the length, polished middle
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = (y + 0.5) / 16, mid = 1 - Math.abs(v - 0.5) * 2;
    const g = nA(x * 3 + 70, y / 3) * 0.7 + (x % 3 === 0 ? 0.2 : 0);
    let c = mixc(C.woodD, C.wood, 0.3 + g * 0.6);
    c = mixc(c, C.woodL, smooth(clamp((mid - 0.35) * 1.8, 0, 1)) * 0.55 * (x % 2 ? 1 : 0.7));
    if (mid < 0.15) c = mixc(c, C.soot, 0.35);
    put(RG.wood, x, y, mulc(c, 0.92 + r() * 0.12));
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const d = Math.hypot(x - 3.5, y - 3.5);
    put(RG.wend, x, y, mixc(C.woodD, C.wood, Math.floor(d) % 2 ? 0.25 : 0.7));
  }
  return pc.texture(true);
}

function glassTexture() { // 64x32: u = 8 faces x 8 px, v bottom -> top; alpha = opacity
  const pc = new PixelCanvas(64, 32, [190, 196, 188]), n = valueNoise(411, 16, 8), m = valueNoise(413, 8, 4), r = rng(412);
  pc.each((x, y) => {
    const v = (y + 0.5) / 32, sm = n(x / 2, y / 2) * 0.6 + m(x / 4, y / 4) * 0.4, f = x % 8;
    let c = [186 + (r() - 0.5) * 8, 194 + (r() - 0.5) * 8, 186 + (r() - 0.5) * 8], a = 58;
    const soot = clamp(smooth(clamp((v - 0.46) / 0.44, 0, 1)) * 1.1 + (sm - 0.5) * 0.7, 0, 1); // soot darkens the top
    c = mixc(c, [30, 26, 22], soot * 0.96); a = lerp(a, 236, soot);
    if (v > 0.25 && v < 0.55 && sm > 0.66) { c = mixc(c, [90, 84, 74], 0.45); a += 34; } // smudges
    if (v < 0.09) { c = mixc(c, [110, 124, 112], 0.5); a = 110; } // thick bottom rim
    if (x === 19 && v > 0.22 && v < 0.48) { c = mixc(c, [228, 232, 224], 0.6); a = Math.max(a, 84); } // painted highlight
    if (r() < 0.02) { c = mulc(c, 0.6); a = Math.min(255, a + 50); }
    pc.set(x, y, c.map((q) => clamp(Math.round(q), 0, 255)), clamp(Math.round(a), 0, 255));
  });
  return pc.texture(true);
}

function flameTexture() { // 16x32 flat flame sprite with a hard pixel edge
  const pc = new PixelCanvas(16, 32, [0, 0, 0]);
  pc.each((x, y) => {
    const fx = (x + 0.5) / 16 - 0.5, fy = (y + 0.5) / 32;
    const w = 0.46 * Math.pow(Math.sin(Math.PI * clamp(fy * 0.95 + 0.04, 0, 1)), 0.7) * (1 - fy * 0.55);
    const d = Math.abs(fx) / Math.max(w, 1e-3);
    if (d > 1 || fy > 0.97) { pc.set(x, y, [0, 0, 0], 0); return; }
    let c = [235, 118, 34];
    if (d < 0.78) c = [255, 176, 66];
    if (d < 0.46 && fy > 0.12 && fy < 0.66) c = [255, 236, 176];
    if (fy < 0.1) c = [70, 64, 120];
    pc.set(x, y, c, 255);
  });
  return pc.texture(false);
}

function glowTexture() { // soft pixel halo, dithered by the PS1 pipeline anyway
  const pc = new PixelCanvas(32, 32, [0, 0, 0]);
  pc.each((x, y) => {
    const d = Math.hypot(x - 15.5, y - 15.5) / 16;
    const a = Math.pow(clamp(1 - d, 0, 1), 2.8);
    pc.set(x, y, [255, 178 + 50 * a, 96 + 80 * a].map(Math.round), Math.round(a * 255));
  });
  const t = pc.texture(false);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  return t;
}

let TX = null;
const tex = () => (TX ||= { atlas: atlasTexture(), glass: glassTexture(), flame: flameTexture(), glow: glowTexture() });

/* ================================================================ geometry helpers */
function triOut(mb, a, b, c, hint, uvs, col = W1) {
  const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
  if (n.dot(hint) < 0) { [b, c] = [c, b]; uvs = [uvs[0], uvs[2], uvs[1]]; n.negate(); }
  n.normalize();
  mb.tri([a, b, c], [n, n, n], uvs, [col, col, col]);
}
function cumV(profile) {
  const d = [0];
  for (let i = 1; i < profile.length; i++) d.push(d[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  return d.map((x) => x / d[d.length - 1]);
}
// Faceted lathe band(s) from [[radius, y, dentAmount?], ...]; returns the rings.
function lathePart(mb, profile, R, { n = N, phase = PH, jitter = 0, seed = 1, vSpan = [0, 1], cx = 0, cz = 0, tw = AW, th = AH } = {}) {
  const rr = rng(seed);
  const rings = profile.map(([rad, y, dent = 0]) => ({
    pts: ring(n, y, rad, rad, { cx, cz, phase, warp: dent || jitter ? (p) => { const f = 1 + (rr() - 0.5) * (dent || jitter); p.x = cx + (p.x - cx) * f; p.z = cz + (p.z - cz) * f; } : null }),
  }));
  const vv = cumV(profile).map((t) => lerp(vSpan[0], vSpan[1], t));
  loft(mb, rings, { flat: true, uv: (ri, kk) => uvR(R, kk / n, vv[ri], tw, th) });
  return rings;
}
// Flat polygon cap with planar UVs (n-2 triangles), facing `out`.
function capFlat(mb, pts, out, R) {
  const c = pts.reduce((a, p) => a.add(p), new V3()).multiplyScalar(1 / pts.length);
  const e1 = Math.abs(out.y) > 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  e1.addScaledVector(out, -e1.dot(out)).normalize();
  const e2 = new V3().crossVectors(out, e1);
  let rm = 1e-6; for (const p of pts) rm = Math.max(rm, p.distanceTo(c));
  const uv = (p) => { const d = new V3().subVectors(p, c); return uvR(R, 0.5 + d.dot(e1) / (2 * rm), 0.5 + d.dot(e2) / (2 * rm)); };
  for (let i = 1; i < pts.length - 1; i++) triOut(mb, pts[0], pts[i], pts[i + 1], out, [uv(pts[0]), uv(pts[i]), uv(pts[i + 1])]);
}
// Pointed cap: fan to an apex, UVs continue the band texture up to vApex.
function capApex(mb, pts, apex, R, vRing, vApex) {
  const n = pts.length, cen = pts.reduce((a, p) => a.add(p), new V3()).multiplyScalar(1 / n), up = new V3().subVectors(apex, cen).normalize();
  for (let k = 0; k < n; k++) triOut(mb, pts[k], pts[(k + 1) % n], apex, up, [uvR(R, k / n, vRing), uvR(R, (k + 1) / n, vRing), uvR(R, (k + 0.5) / n, vApex)]);
}
// Thin prism along a polyline (wires, bail, tubes). sides = 3 (wire) or 4 (box, half extents r x rz).
function strut(mb, path, R, { r = 0.002, rz = null, sides = 3, hint = v3(0, 0, 1) } = {}) {
  const rings = [], L = [0], box = sides === 4, ph = box ? Math.PI / 4 : Math.PI / 2, s = box ? Math.SQRT2 : 1;
  for (let i = 0; i < path.length; i++) {
    const t = new V3();
    if (i > 0) t.add(new V3().subVectors(path[i], path[i - 1]).normalize());
    if (i < path.length - 1) t.add(new V3().subVectors(path[i + 1], path[i]).normalize());
    t.normalize();
    const e1 = hint.clone().addScaledVector(t, -hint.dot(t)).normalize(), e2 = new V3().crossVectors(e1, t);
    const pts = [];
    for (let k = 0; k < sides; k++) {
      const a = ph + (k / sides) * Math.PI * 2;
      pts.push(path[i].clone().addScaledVector(e1, Math.cos(a) * r * s).addScaledVector(e2, Math.sin(a) * (rz ?? r) * s));
    }
    rings.push({ pts });
    if (i > 0) L.push(L[i - 1] + path[i].distanceTo(path[i - 1]));
  }
  const tot = L[L.length - 1];
  loft(mb, rings, { flat: true, uv: (ri, kk) => uvR(R, kk / sides, L[ri] / tot) });
}
// Box with every face mapped to region R, transformed by matrix m.
function boxR(mb, sx, sy, sz, m, R, skip = []) {
  const t = new MeshBuilder(), hx = sx / 2, hy = sy / 2, hz = sz / 2, V = (a, b, c) => v3(a, b, c);
  const F = {
    px: [V(hx, -hy, hz), V(hx, -hy, -hz), V(hx, hy, -hz), V(hx, hy, hz)], nx: [V(-hx, -hy, -hz), V(-hx, -hy, hz), V(-hx, hy, hz), V(-hx, hy, -hz)],
    py: [V(-hx, hy, hz), V(hx, hy, hz), V(hx, hy, -hz), V(-hx, hy, -hz)], ny: [V(-hx, -hy, -hz), V(hx, -hy, -hz), V(hx, -hy, hz), V(-hx, -hy, hz)],
    pz: [V(-hx, -hy, hz), V(hx, -hy, hz), V(hx, hy, hz), V(-hx, hy, hz)], nz: [V(hx, -hy, -hz), V(-hx, -hy, -hz), V(-hx, hy, -hz), V(hx, hy, -hz)],
  };
  for (const [k, f] of Object.entries(F)) if (!skip.includes(k)) quad(t, f[0], f[1], f[2], f[3], [uvR(R, 0, 0), uvR(R, 1, 0), uvR(R, 1, 1), uvR(R, 0, 1)]);
  mb.append(t, m);
}
const polar = (deg, r, y) => v3(Math.cos((deg * Math.PI) / 180) * r, y, Math.sin((deg * Math.PI) / 180) * r);

/* ================================================================ dimensions (metres) */
export const LAMP = {
  gripR: 0.0115, gripHalf: 0.046,
  tank: [[0.074, -0.306], [0.075, -0.296], [0.068, -0.268, 0.035], [0.036, -0.246, 0.02]],
  burner: [[0.036, -0.2475], [0.045, -0.224]],
  glass: [[0.031, -0.2235], [0.043, -0.198], [0.043, -0.14], [0.031, -0.1135]],
  hood: [[0.033, -0.1135], [0.053, -0.098, 0.03], [0.051, -0.084, 0.03], [0.021, -0.0685]], hoodApex: -0.062,
  tubeX: 0.057, wickY: -0.222,
};
// part centres (assembled) and exploded-view offsets
const PARTS = {
  bail: { c: [0, -0.057, 0], ex: [0, 0.17, 0], hw: 0.07, label: 'Дужка и ручка' },
  hood: { c: [0, -0.088, 0], ex: [0, 0.09, 0], hw: 0.055, label: 'Колпак' },
  guard: { c: [0, -0.164, 0], ex: [0, 0.04, 0], hw: 0.058, label: 'Сетка' },
  glass: { c: [0, -0.168, 0], ex: [0, -0.1, 0], hw: 0.045, label: 'Стекло' },
  burner: { c: [0, -0.236, 0], ex: [0, -0.13, 0], hw: 0.064, label: 'Горелка' },
  tank: { c: [0, -0.276, 0], ex: [0, -0.16, 0], hw: 0.077, label: 'Бак' },
  tubeL: { c: [-0.057, -0.18, 0], ex: [-0.115, -0.04, 0], hw: 0.01, label: null },
  tubeR: { c: [0.057, -0.18, 0], ex: [0.115, -0.04, 0], hw: 0.012, label: 'Трубки' },
};

/* ================================================================ light states */
export const LAMP_STATES = {
  off: { flame: 0, glow: 0, glowA: 0, glass: [0, 0, 0], col: [0, 0, 0], range: 0 },
  on: { flame: 1, glow: 0.46, glowA: 0.5, glass: [0.95, 0.52, 0.17], tint: 0.45, alpha: 2.4, col: [1.35, 0.78, 0.34], range: 1 },
  low: { flame: 0.55, glow: 0.28, glowA: 0.32, glass: [0.5, 0.26, 0.08], tint: 0.7, alpha: 1.7, col: [1.1, 0.56, 0.21], range: 0.7 },
};

export function makeLamp() {
  const T = tex(), A = RG;
  const bodyMat = ps1Material({ map: T.atlas });
  const glassMat = ps1Material({ map: T.glass, transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaCut: 0, opacity: 1 });
  const B = {}; for (const k of Object.keys(PARTS)) B[k] = new MeshBuilder();

  /* --- tank + filler cap + glass lever */
  const tr = lathePart(B.tank, LAMP.tank, A.tank, { seed: 21 });
  capFlat(B.tank, tr[0].pts, v3(0, -1, 0), A.tbot);
  {
    const th = 120, rd = polar(th, 1, 0), tg = v3(-rd.z, 0, rd.x);
    const nrm = rd.clone().multiplyScalar(0.567).add(v3(0, 0.824, 0)).normalize();
    const m = new THREE.Matrix4().makeBasis(tg, nrm, new V3().crossVectors(tg, nrm)).setPosition(polar(th, 0.05, -0.2556));
    const t = new MeshBuilder();
    const rg = lathePart(t, [[0.0085, -0.005], [0.0085, 0.0075]], A.capf, { n: 6, phase: 0 });
    capFlat(t, rg[1].pts, v3(0, 1, 0), A.knob);
    B.tank.append(t, m);
  }
  strut(B.tank, [polar(160, 0.036, -0.2315), polar(160, 0.066, -0.2445)], A.lever, { sides: 4, r: 0.0016, rz: 0.0032, hint: v3(0, 1, 0) });

  /* --- burner + wick knob */
  const br = lathePart(B.burner, LAMP.burner, A.burn, { seed: 22 });
  capFlat(B.burner, br[1].pts, v3(0, 1, 0), A.btop);
  {
    const th = 60;
    strut(B.burner, [polar(th, 0.03, -0.2365), polar(th, 0.06, -0.2365)], A.wire, { r: 0.0021, hint: v3(0, 1, 0) });
    const d = polar(th, 1, 0);
    boxR(B.burner, 0.014, 0.014, 0.0045, mat4(polar(th, 0.0615, -0.2365).toArray(), [0, Math.atan2(d.x, d.z), Math.PI / 4], 1, 'YXZ'), A.knob);
  }

  /* --- glass globe (own translucent texture) */
  lathePart(B.glass, LAMP.glass, { x: 0, y: 0, w: 64, h: 32 }, { tw: 64, th: 32 });

  /* --- wire guard: four bowed wires crossing in an X at the front and the back */
  for (const [t0, tc, t1, rc] of [[135, 90, 45, 0.0566], [45, 90, 135, 0.0546], [225, 270, 315, 0.0566], [315, 270, 225, 0.0546]]) {
    strut(B.guard, [polar(t0, 0.043, -0.1045), polar(tc, rc, -0.165), polar(t1, 0.0445, -0.2235)], A.wire, { r: 0.0019, hint: polar(tc, 1, 0) });
  }

  /* --- side tubes (flat, from the tank shoulder up into the hood) */
  for (const [k, s] of [['tubeL', -1], ['tubeR', 1]]) {
    strut(B[k], [v3(s * LAMP.tubeX, -0.27, 0), v3(s * LAMP.tubeX, -0.118, 0), v3(s * 0.043, -0.0945, 0)], A.tube, { sides: 4, r: 0.005, rz: 0.008, hint: v3(1, 0, 0) });
  }

  /* --- hood / ventilated top cap */
  const hr = lathePart(B.hood, LAMP.hood, A.hood, { seed: 23, vSpan: [0, 0.8] });
  capApex(B.hood, hr[3].pts, v3(0, LAMP.hoodApex, 0), A.hood, 0.8, 1);

  /* --- wire bail + wooden grip */
  for (const s of [-1, 1]) strut(B.bail, [v3(s * 0.044, 0, 0), v3(s * 0.058, -0.012, 0), v3(s * 0.0635, -0.125, 0)], A.wire, { r: 0.0022, hint: v3(0, 0, 1) });
  {
    const t = new MeshBuilder();
    const gr = lathePart(t, [[LAMP.gripR, -LAMP.gripHalf], [LAMP.gripR, LAMP.gripHalf]], A.wood, { seed: 24 });
    capFlat(t, gr[0].pts, v3(0, -1, 0), A.wend);
    capFlat(t, gr[1].pts, v3(0, 1, 0), A.wend);
    B.bail.append(t, mat4([0, 0, 0], [0, 0, -Math.PI / 2]));
  }

  /* --- assemble: one group per part so the sheet's exploded view works */
  const group = new THREE.Group();
  group.name = 'lamp';
  const parts = {}, meshes = [];
  let tris = 0;
  for (const [k, P] of Object.entries(PARTS)) {
    const g = new THREE.Group();
    g.name = 'lamp-' + k;
    g.position.set(...P.c);
    const geo = B[k].geometry();
    geo.translate(-P.c[0], -P.c[1], -P.c[2]);
    const m = new THREE.Mesh(geo, k === 'glass' ? glassMat : bodyMat);
    if (k === 'glass') m.renderOrder = 11;
    g.add(m);
    group.add(g);
    parts[k] = { group: g, home: new V3(...P.c), ex: new V3(...P.ex), hw: P.hw, label: P.label };
    meshes.push(m);
    tris += B[k].tris;
  }

  /* --- flame sprite + halo (children of the burner, so they follow it in the exploded view) */
  const flameLocal = v3(0, LAMP.wickY + 0.016, 0);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flame, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flame.renderOrder = 10;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
  glow.renderOrder = 12;
  for (const s of [flame, glow]) parts.burner.group.add(s);
  const toBurner = (p) => p.clone().sub(parts.burner.home);

  let state = 'on', k = 1;
  function setLight(s) {
    state = LAMP_STATES[s] ? s : 'on';
    const S = LAMP_STATES[state];
    flame.visible = S.flame > 0; glow.visible = S.glow > 0;
    update(0, true);
  }
  // Flicker; returns the light factor k (1 = steady). Call once per frame.
  function update(time, still = false) {
    const S = LAMP_STATES[state];
    if (state === 'off') { k = 0; glassMat.uniforms.uEmissive.value.setRGB(0, 0, 0); glassMat.uniforms.uTint.value.setRGB(1, 1, 1); glassMat.uniforms.uOpacity.value = 1; return 0; }
    if (still) k = state === 'low' ? 0.85 : 1;
    else if (state === 'on') k = 0.92 + Math.sin(time * 13.1) * 0.045 + Math.sin(time * 29.7 + 1.3) * 0.03 + (Math.random() - 0.5) * 0.04;
    else {
      k = 0.78 + Math.sin(time * 9.3) * 0.12 + Math.sin(time * 23.1 + 0.7) * 0.08 + (Math.random() - 0.5) * 0.12;
      if (Math.sin(time * 1.7) * Math.sin(time * 0.63 + 2) > 0.62) k *= 0.55; // almost goes out
    }
    const f = S.flame, fh = 0.032 * f * (0.78 + 0.22 * k), fw = 0.017 * f * (0.9 + 0.1 * k);
    flame.scale.set(fw, fh, 1);
    flame.position.copy(toBurner(v3(0, LAMP.wickY + fh * 0.45, 0)));
    glow.scale.setScalar(S.glow * (0.85 + 0.15 * k));
    glow.position.copy(toBurner(v3(0, LAMP.wickY + 0.02, 0)));
    glow.material.opacity = S.glowA * k;
    glassMat.uniforms.uEmissive.value.setRGB(S.glass[0] * k, S.glass[1] * k, S.glass[2] * k);
    glassMat.uniforms.uTint.value.setScalar(S.tint * (GFX.enh ? 0.62 : 1)); // the inner glow, not the room light, colours a lit globe (enhanced: bloom adds the rest)
    glassMat.uniforms.uOpacity.value = S.alpha; // a lit globe reads as glowing, not see-through
    return k;
  }
  // Point-light colour/range multiplier for the current state (null when unlit).
  function lightInfo() {
    if (state === 'off') return null;
    const S = LAMP_STATES[state];
    return { col: S.col.map((c) => c * k), range: S.range };
  }
  function flameWorld(target = new V3()) { glow.updateWorldMatrix(true, false); return target.setFromMatrixPosition(glow.matrixWorld); }
  function setExplode(t) { for (const p of Object.values(parts)) p.group.position.copy(p.home).addScaledVector(p.ex, t); }
  function addWire(mat) {
    for (const m of meshes) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 1), mat);
      l.visible = false; l.name = 'wire'; m.add(l);
    }
  }
  function setWire(on) { group.traverse((o) => { if (o.name === 'wire') o.visible = on; }); }

  setLight('on');
  return {
    group, parts, meshes, flame: flameLocal, flameSprite: flame, glow, glass: meshes[3], glassMat, gripR: LAMP.gripR, tris,
    setLight, update, lightInfo, flameWorld, setExplode, addWire, setWire, get state() { return state; },
  };
}
