// Caecilia Gabriel v02 — parametric construction model.
// Every view is projected from one set of 3D measurements (cm, Y up, Z forward, +X = her left),
// so front / three-quarter / side / back cannot drift apart.

export const PAL = {
  skin: '#D0AE95', skinShade: '#B98F78', lips: '#B58478', hair: '#534033', hairDark: '#3B2C23', hairLight: '#7A614C',
  iris: '#75705D', eyeWhite: '#DBD6CB', wool: '#625F52', woolWorn: '#847C69', linen: '#B4AA92', collar: '#D6CDB8',
  stocking: '#726F62', leather: '#4A3A2E', sole: '#302A25', horn: '#3E362B', thread: '#A6987F', line: '#2B2520', paper: '#D9D5CC',
};

const { sin, cos, PI, hypot, max, min, abs, sqrt, atan2 } = Math;
export const rad = (d) => (d * PI) / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => max(a, min(b, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const f = (n) => String(Math.round(n * 1000) / 1000);
let UID = 0;
const uid = (p) => `${p}${++UID}`;

// Cubic Hermite through keyed rows [x, v1, v2, ...].
function interp(keys, x) {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0].slice(1);
  if (x >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0;
  while (keys[i + 1][0] < x) i++;
  const k0 = keys[max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[min(i + 2, n - 1)];
  const h = k2[0] - k1[0], u = (x - k1[0]) / h, u2 = u * u, u3 = u2 * u, out = [];
  for (let j = 1; j < k1.length; j++) {
    const m1 = ((k2[j] - k0[j]) / (k2[0] - k0[0] || 1)) * h, m2 = ((k3[j] - k1[j]) / (k3[0] - k1[0] || 1)) * h;
    out.push((2 * u3 - 3 * u2 + 1) * k1[j] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[j] + (u3 - u2) * m2);
  }
  return out;
}

// A body part as a stack of horizontal elliptical sections: rows [y, halfWidth a, halfDepth b, centreZ].
export class Loft {
  constructor(keys, cx = 0, cz = 0) { this.k = keys; this.cx = cx; this.dz = cz; this.y0 = keys[0][0]; this.y1 = keys[keys.length - 1][0]; }
  pt(y, t, off = 0) {
    const [a0, b0, cz] = interp(this.k, y), a = max(a0, 0.02) + off, b = max(b0, 0.02) + off;
    return { X: this.cx + a * sin(t), Y: y, Z: this.dz + cz + b * cos(t), nx: sin(t) / a, nz: cos(t) / b };
  }
}
export const P = (p, th) => ({ x: p.X * cos(th) + p.Z * sin(th), y: p.Y, d: -p.X * sin(th) + p.Z * cos(th) });
const vis = (p, th) => -p.nx * sin(th) + p.nz * cos(th) >= -1e-9;
const P3 = (X, Y, Z, th) => P({ X, Y, Z }, th);

// ---------- SVG primitives (all coordinates in cm; the caller flips Y) ----------
const ptsAttr = (pts) => pts.map((p) => f(p.x) + ',' + f(p.y)).join(' ');
const polyg = (pts, a = '') => (pts && pts.length > 2 ? `<polygon points="${ptsAttr(pts)}" ${a}/>` : '');
const pline = (pts, a = '') => (pts && pts.length > 1 ? `<polyline points="${ptsAttr(pts)}" fill="none" ${a}/>` : '');
export function spline(pts, closed = false) {
  const n = pts.length;
  if (n < 2) return '';
  const g = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    d += `C${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d + (closed ? 'Z' : '');
}
const path = (d, a = '') => (d ? `<path d="${d}" ${a}/>` : '');
const S = (col, w, extra = '') => `stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round" ${extra}`;
const NS = 'stroke="none"';
const ellipse = (x, y, rx, ry, a = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(max(rx, 0.001))}" ry="${f(max(ry, 0.001))}" ${a}/>`;
const fn = (v) => (typeof v === 'function' ? v : () => v);

// Visible part of a surface patch on a loft, as an outline polygon.
function patch(L, th, o = {}) {
  const yT = fn(o.yTop ?? L.y1), yB = fn(o.yBot ?? L.y0), t0 = fn(o.t0 ?? -PI), t1 = fn(o.t1 ?? PI);
  const off = o.off || 0, nu = o.nu || 90, nv = o.nv || 40, rows = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, row = [];
    for (let i = 0; i <= nu; i++) {
      const t = lerp(t0(v), t1(v), i / nu), p = L.pt(lerp(yT(t), yB(t), v), t, off);
      if (o.all || -p.nx * sin(th) + p.nz * cos(th) > 1e-6) row.push(P(p, th));
    }
    if (row.length) rows.push(row.sort((a, b) => a.x - b.x));
  }
  if (!rows.length) return null;
  const poly = [...rows[0]], last = rows[rows.length - 1];
  for (let j = 1; j < rows.length; j++) poly.push(rows[j][rows[j].length - 1]);
  poly.push(...last.slice(0, -1).reverse());
  for (let j = rows.length - 2; j > 0; j--) poly.push(rows[j][0]);
  return poly;
}
// Visible runs of a curve drawn on a loft surface; g(u) -> [t, y].
function scurve(L, th, g, n = 40, off = 0.03) {
  const runs = [];
  let cur = null;
  for (let i = 0; i <= n; i++) {
    const [t, y] = g(i / n), p = L.pt(y, t, off);
    if (vis(p, th)) (cur ??= []).push(P(p, th));
    else { if (cur && cur.length > 1) runs.push(cur); cur = null; }
  }
  if (cur && cur.length > 1) runs.push(cur);
  return runs;
}
const sline = (L, th, g, a, n, off) => scurve(L, th, g, n, off).map((r) => pline(r, a)).join('');
const spt = (L, th, t, y, off = 0.03) => { const p = L.pt(y, t, off), q = P(p, th); q.vis = vis(p, th); q.face = (-p.nx * sin(th) + p.nz * cos(th)) / hypot(p.nx, p.nz); return q; };

function resample(pts, n) {
  const keys = Object.keys(pts[0]), m = pts.length, out = [];
  const g = (i) => pts[clamp(i, 0, m - 1)];
  for (let s = 0; s <= n; s++) {
    const x = (s / n) * (m - 1), i = min(Math.floor(x), m - 2), u = x - i, o = {};
    for (const k of keys) {
      const p0 = g(i - 1)[k], p1 = g(i)[k], p2 = g(i + 1)[k], p3 = g(i + 2)[k];
      o[k] = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
    }
    out.push(o);
  }
  return out;
}
function tube2d(pts) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[max(i - 1, 0)], b = pts[min(i + 1, pts.length - 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    L.push({ x: pts[i].x - dy * pts[i].r, y: pts[i].y + dx * pts[i].r });
    R.push({ x: pts[i].x + dy * pts[i].r, y: pts[i].y - dx * pts[i].r });
  }
  return [...L, ...R.reverse()];
}
const tube = (pts3, th, n = 28) => tube2d(resample(pts3, n).map((p) => ({ ...P3(p.X, p.Y, p.Z, th), r: p.r })));
const shade = (poly, k = 1) => polyg(poly, `fill="url(#shadeH)" opacity="${k}" ${NS}`);
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// =====================================================================================
// MEASUREMENTS (cm, booted; ground = 0, crown = 122). Sources noted in ../design-notes.md
// =====================================================================================
export const M = {
  crown: 122, chin: 102, eye: 110, shoulder: 95.4, waistTop: 76.6, waistBot: 73.6, apronHem: 35.5, hem: 29, bootTop: 12.3,
  buttons: [94.6, 90.6, 86.6, 82.6, 78.6], wrist: 61.6, fingertip: 49, patch: [34.5, 40.5],
};
const DRESS = new Loft([[29, 20.5, 16, -0.3], [40, 19, 15, -0.2], [55, 16.4, 13.2, 0], [68, 13, 10.9, 0.3], [74, 10.8, 9.1, 0.5], [76.5, 10, 8.5, 0.5],
  [80, 10, 8.5, 0.5], [85, 10.3, 8.3, 0.3], [90, 10.4, 7.9, 0], [93.5, 11, 7.3, -0.3], [95.4, 11.9, 6.8, -0.4], [96.5, 11, 6.2, -0.45],
  [97.6, 8.4, 5.2, -0.5], [98.6, 4.8, 4, -0.5], [99.2, 3.8, 3.7, -0.5]]);
const COLLAR = new Loft([[95.2, 6.8, 7.2, 0.2], [96, 6.7, 6.8, 0], [97, 6.4, 6.2, -0.2], [98, 5.6, 5.4, -0.4], [98.9, 4.6, 4.5, -0.5], [99.7, 3.75, 3.8, -0.6]]);
const NECK = new Loft([[98.3, 3.35, 3.55, -1.0], [99.5, 3.3, 3.5, -0.8], [102, 3.3, 3.6, -0.2], [105.5, 3.5, 3.8, 0.3]]);
const legKeys = [[11, 2.75, 3.1, -0.8], [16, 2.85, 3.15, -0.8], [22, 3.5, 3.9, -1], [28, 4, 4.6, -1], [34, 4.3, 4.6, -0.3]];
const bootKeys = [[0.6, 3.7, 10.1, 3.75], [1.8, 3.8, 10.25, 3.75], [3, 3.8, 10.2, 3.7], [4.1, 3.7, 9.6, 3.2], [4.9, 3.5, 8.3, 2], [5.7, 3.4, 6.9, 0.8], [6.7, 3.4, 5.5, -0.3],
  [8.2, 3.45, 4.6, -0.7], [10.5, 3.55, 4.25, -0.8], [12.3, 3.7, 4.3, -0.8]];
const LEGX = 5.3;
const HEADZ = 0.6;
// Skull rows: [y above chin, half width, front Z, back Z]
const skullRaw = [[0, 0.5, 6, 4.6], [0.3, 1.9, 6.4, 2.6], [0.8, 3.1, 6.9, 0.8], [2, 4.6, 6.95, -2.2], [3.5, 5.55, 7.5, -4.8], [5, 6.15, 7.6, -6.5], [6.5, 6.4, 7.6, -7.5], [8, 6.45, 7.4, -8.2],
  [10, 6.65, 8, -8.75], [12, 7, 8.45, -8.9], [14, 7.2, 8.2, -8.6], [16, 6.8, 7.1, -7.7], [17.8, 5.4, 5, -5.7], [19, 3.2, 2.6, -3.2], [19.5, 0.3, 0.2, -0.4]];
const HEAD = new Loft(skullRaw.map(([y, a, zf, zb]) => [y, a, (zf - zb) / 2, (zf + zb) / 2]));
// Hair shell: skull plus loose volume, fullest over the ears where it is drawn back to the plaits.
const HAIR = new Loft([...skullRaw.map(([y, a, zf, zb]) => {
  const bump = sm(4, 8, y) * (1 - sm(14, 19.3, y)), sa = 0.55 + 0.5 * bump, sb = 0.7 + 0.4 * bump;
  return [y + 0.5 * sm(12, 19.5, y), a + sa, (zf + 0.35 - zb + sb) / 2, (zf + 0.35 + zb - sb) / 2];
}), [20.05, 0.05, 0.05, -0.1]]);
// Face profile (Z, y above chin) — the only place nose/lips/chin depth is defined.
const PROFILE = [[6, 0], [6.9, 0.45], [7.2, 1], [7, 1.7], [7.9, 2.15], [7.6, 2.5], [8.05, 2.9], [7.75, 3.5], [7.7, 3.9], [8.6, 4.25], [9.5, 4.9], [9.3, 5.5], [8.3, 6.6],
  [7.7, 7.6], [7.6, 8.4], [8.2, 9.9], [8.55, 11.5], [8.6, 12.5], [8.3, 14], [7.6, 15.3]];
// Hairline: surface angle (deg from front) where skin ends, by height above chin.
const hairlineKeys = [[3.4, 165], [4, 128], [5, 112], [6, 104], [7, 100], [8, 98], [9, 96], [9.4, 88], [9.8, 72], [11, 56], [12.5, 40], [13.6, 27], [14.2, 15], [14.6, 0]];
const hairline = (y) => (y >= 14.6 ? 0 : y <= 3.4 ? PI : rad(interp(hairlineKeys, y)[0]));

export const EXPR = {
  neutral: {},
  curious: { browIn: 0.22, browMid: 0.3, browOut: 0.16, open: 1.1, gaze: [0.2, 0.1], tilt: -6, part: 0.1, corner: 0.05 },
  thoughtful: { browIn: -0.14, browMid: -0.05, browOut: 0, pinch: 0.14, open: 0.78, gaze: [-0.28, -0.2], part: 0, corner: -0.03, purse: 0.9, shift: 0.1, tilt: 3 },
  frightened: { browIn: 0.5, browMid: 0.3, browOut: 0.02, pinch: 0.2, open: 1.3, gaze: [0, 0.04], part: 0.36, corner: -0.12, purse: 0.86, lowerLid: 0.8 },
};

// ----------------------------------- HEAD -----------------------------------
function head(c, E = {}) {
  const th = c.th, o = [], hx = HEADZ * sin(th);
  const lw = c.lw, OUT = S(PAL.line, 1.5 * lw), side = sin(th), front = cos(th);
  const lm = (X, Y, Z) => {
    const q = P3(X, Y, Z, th), [a, b, cz] = interp(HEAD.k, Y), t = atan2(X / a, (Z - cz) / b);
    q.vis = -(sin(t) / a) * sin(th) + (cos(t) / b) * cos(th) > 0.012;
    return q;
  };
  const earSide = (sg) => -sg * side; // >0 when that ear's outer face looks at the camera
  const ear = (sg) => {
    const A = P3(sg * 6.25, 8, 0.2, th), R = P3(sg * 7.35, 8, -2.1, th), w = R.x - A.x;
    const shp = [[0.1, 2.25], [0.55, 2.5], [0.92, 1.9], [1, 0.7], [0.9, -0.5], [0.66, -1.4], [0.4, -2.25], [0.16, -2.4], [0.02, -1.6], [0, 0.4]].map(([u, v]) => ({ x: A.x + u * w, y: 8 + v }));
    let s = path(spline(shp, true), `fill="${PAL.skin}" ${S(PAL.line, 1.2 * lw)}`);
    if (abs(w) > 1.2) {
      const q = (u, v) => ({ x: A.x + u * w, y: 8 + v });
      s += path(spline([q(0.3, 1.7), q(0.62, 1.95), q(0.82, 1.3), q(0.84, 0.2), q(0.7, -0.9)]), `fill="none" ${S(PAL.skinShade, 1.1 * lw)}`);
      s += path(spline([q(0.3, 0.9), q(0.52, 0.7), q(0.5, -0.3), q(0.3, -0.9), q(0.2, -0.3)]), `fill="${PAL.skinShade}" fill-opacity=".45" ${S(PAL.skinShade, 0.9 * lw)}`);
    }
    return s;
  };
  // hair mass behind the head and ears (shows as the rim that joins the plaits)
  for (const sg of [-1, 1]) o.push(polyg(patch(HAIR, th, { yTop: 20.05, yBot: 3.4, t0: (v) => sg * hairline(lerp(20.05, 3.4, v)), t1: sg * PI, nu: 60, nv: 50, all: true }), `fill="${PAL.hairDark}" ${OUT}`));
  for (const sg of [-1, 1]) if (earSide(sg) <= 0.25) o.push(ear(sg));

  // skin: profile ribbon (nose, lips, chin) unioned with the skull loft
  const skull = patch(HEAD, th, { nu: 120, nv: 60 });
  const prof = side > 0.3 ? [...PROFILE.map(([z, y]) => ({ x: z * side, y })), ...PROFILE.slice().reverse().map(([z, y]) => ({ x: (z - 2.2) * side, y: y + 0.01 }))] : null;
  const profD = prof ? spline(prof.slice(0, PROFILE.length)) + 'L' + prof.slice(PROFILE.length).map((p) => f(p.x) + ',' + f(p.y)).join('L') + 'Z' : '';
  if (prof) o.push(path(profD, `fill="${PAL.skin}" ${OUT}`));
  o.push(polyg(skull, `fill="${PAL.skin}" ${OUT}`));
  if (prof) o.push(path(profD, `fill="${PAL.skin}" ${NS}`));
  o.push(polyg(skull, `fill="url(#faceShade)" ${NS}`));
  const fclip = uid('face');
  o.push(`<clipPath id="${fclip}">${polyg(skull)}</clipPath><g clip-path="url(#${fclip})">`);

  // jaw line, camera-side only
  for (const sg of [-1, 1]) if (earSide(sg) > 0.85) o.push(sline(HEAD, th, (u) => [sg * rad(lerp(60, 93, sm(0, 1, u))), lerp(0.5, 5.4, u * u * 0.6 + u * 0.4)], S(PAL.skinShade, 1.2 * lw, `opacity="${f(clamp(abs(side) * 0.8, 0, 0.6))}"`), 24, 0));

  // cheeks, freckles
  for (const sg of [-1, 1]) {
    const q = lm(sg * 3.9, 5.3, 6.1);
    if (q.vis) { const w = abs(lm(sg * 5.4, 5.3, 4.6).x - lm(sg * 2.4, 5.3, 7).x) / 2; o.push(ellipse(q.x, q.y, max(w, 0.5) * 1.15, 1.75, `fill="url(#blush)" ${NS}`)); }
  }
  const r = rng(1922);
  for (let i = 0; i < 46; i++) {
    const X = (r() * 2 - 1) * 4.3, Y = 5.1 + r() * 2.5 - abs(X) * 0.12, sz = 0.045 + r() * 0.05, [a, b, cz] = interp(HEAD.k, Y);
    const q = lm(X, Y, cz + b * sqrt(max(0, 1 - (X * X) / (a * a))) + (abs(X) < 1.1 ? 0.5 : 0));
    if (q.vis && abs(X) > 0.25) o.push(ellipse(q.x, q.y, sz * max(0.5, abs(front) + 0.3), sz, `fill="#9C6F55" opacity="${f(0.22 + r() * 0.25)}" ${NS}`));
  }
  o.push('</g>');

  // nose
  const tip = P3(0, 4.9, 9.5, th);
  if (side > 0.3 && side < 0.95) {
    const ridge = [[7.65, 8.3], [7.75, 7.5], [8.3, 6.6], [9.25, 5.55], [9.5, 4.9], [9.1, 4.4], [8.2, 4.1]].map(([z, y]) => P3(0, y, z, th));
    o.push(path(spline(ridge), `fill="none" ${S(PAL.skinShade, 1.5 * lw, `opacity="${f(clamp(side * 1.4, 0, 0.9))}"`)}`));
  }
  if (front > 0.2) {
    o.push(ellipse(tip.x - 0.1 * side, 4.55, 1.0 * max(front, 0.5), 0.5, `fill="${PAL.skinShade}" opacity=".3" ${NS}`));
    for (const sg of [-1, 1]) {
      const nq = P3(sg * 0.72, 4.38, 8.25, th), al = [P3(sg * 1.0, 5.25, 7.9, th), P3(sg * 1.32, 4.75, 7.55, th), P3(sg * 1.12, 4.25, 7.6, th)];
      const hidden = side > 0.3 && sg > 0;
      if (!hidden) {
        o.push(ellipse(nq.x, nq.y, 0.3 * max(front, 0.45), 0.15, `fill="#7A5345" opacity=".85" ${NS}`));
        o.push(path(spline(al), `fill="none" ${S(PAL.skinShade, 1.2 * lw, 'opacity=".8"')}`));
      }
    }
    if (side < 0.3) o.push(path(spline([{ x: tip.x - 0.62, y: 4.42 }, { x: tip.x, y: 4.2 }, { x: tip.x + 0.62, y: 4.42 }]), `fill="none" ${S(PAL.skinShade, 1.1 * lw, 'opacity=".75"')}`));
    o.push(ellipse(tip.x - 0.25, 5.15, 0.3, 0.38, `fill="#fff" opacity=".2" ${NS}`));
  } else if (side > 0.9) {
    o.push(ellipse(8.25 * side, 4.42, 0.34, 0.16, `fill="#7A5345" opacity=".85" ${NS}`));
    o.push(path(spline([{ x: 7.95, y: 5.25 }, { x: 7.5, y: 4.8 }, { x: 7.6, y: 4.3 }]), `fill="none" ${S(PAL.skinShade, 1.2 * lw, 'opacity=".8"')}`));
  }

  // mouth
  if (front > -0.1) {
    const ps = E.purse ?? 1, cy = E.corner ?? 0, part = E.part ?? 0, sh = E.shift ?? 0;
    const mp = (X, Y, Z) => P3(X * ps + sh, Y, Z, th);
    const cL = mp(-1.68, 2.5 + cy, 6.8), cR = mp(1.68, 2.5 + cy, 6.8), pkL = mp(-0.5, 2.98, 8), pkR = mp(0.5, 2.98, 8), dip = mp(0, 2.85, 8.05);
    const lnL = mp(-0.9, 2.52 + cy * 0.4, 7.5), lnC = mp(0, 2.5, 7.75), lnR = mp(0.9, 2.52 + cy * 0.4, 7.5);
    const dn = (p) => ({ x: p.x, y: p.y - part });
    const loL = mp(-0.9, 2.12 - part, 7.6), loC = mp(0, 1.98 - part, 7.9), loR = mp(0.9, 2.12 - part, 7.6);
    const upper = spline([cL, mp(-1.2, 2.82, 7.5), pkL, dip, pkR, mp(1.2, 2.82, 7.5), cR]) + 'L' + [lnR, lnC, lnL].map((p) => f(p.x) + ',' + f(p.y)).join('L') + 'Z';
    const lower = spline([cL, dn(lnL), dn(lnC), dn(lnR), cR]) + spline([cR, loR, loC, loL, cL]).replace(/^M[^C]*/, '') + 'Z';
    if (part > 0.02) o.push(path(spline([cL, lnL, lnC, lnR, cR, dn(lnR), dn(lnC), dn(lnL)], true), `fill="#4A2C28" ${NS}`));
    o.push(path(lower, `fill="#BF9184" ${NS}`), path(upper, `fill="${PAL.lips}" ${NS}`));
    o.push(path(spline([cL, lnL, lnC, lnR, cR]), `fill="none" ${S('#8A5A50', 1.0 * lw)}`));
    o.push(path(spline([loL, loC, loR]), `fill="none" ${S(PAL.skinShade, 1.0 * lw, 'opacity=".7"')}`));
    o.push(ellipse(loC.x - 0.2, loC.y + 0.3, 0.42 * max(front, 0.4), 0.12, `fill="#fff" opacity=".22" ${NS}`));
  }

  // eyes and brows
  for (const sg of [-1, 1]) {
    const pc = lm(sg * 3.0, 8, 6.3);
    if (!pc.vis) continue;
    const open = E.open ?? 1, g = E.gaze ?? [0, 0];
    const pin = P3(sg * 1.75, 7.85, 6.45, th), pout = P3(sg * 4.25, 8.1, 5.35, th), pf = P3(sg * 3.0, 7.97, 6.72, th);
    let A = pin.x < pout.x ? pin : pout, B = pin.x < pout.x ? pout : pin;
    if (pf.x > B.x - 0.3) B = { x: pf.x + 0.1, y: pf.y };
    const w = B.x - A.x, wr = min(1, w / 2.5), hu = 0.86 * open, hl = 0.46 * (E.lowerLid ?? 0.75 + 0.25 * open);
    const up = `M${f(A.x)},${f(A.y)}C${f(A.x + 0.22 * w)},${f(A.y + hu * 1.3)} ${f(A.x + 0.72 * w)},${f(B.y + hu * 1.3)} ${f(B.x)},${f(B.y)}`;
    const shape = up + `C${f(B.x - 0.25 * w)},${f(B.y - hl * 1.3)} ${f(A.x + 0.3 * w)},${f(A.y - hl * 1.3)} ${f(A.x)},${f(A.y)}Z`;
    const id = uid('eye'), ix = pf.x - 0.12 * side + g[0] * wr, iy = 8 + g[1], rx = 0.6 * max(0.45, wr);
    o.push(`<clipPath id="${id}"><path d="${shape}"/></clipPath>`, path(shape, `fill="${PAL.eyeWhite}" ${NS}`));
    o.push(`<g clip-path="url(#${id})">` + ellipse(ix, iy, rx, 0.6, `fill="#3A3429" ${NS}`) + ellipse(ix, iy, rx * 0.88, 0.53, `fill="${PAL.iris}" ${NS}`) +
      ellipse(ix, iy, rx * 0.64, 0.39, `fill="#6B5338" opacity=".9" ${NS}`) + ellipse(ix, iy, rx * 0.4, 0.24, `fill="#17130F" ${NS}`) +
      ellipse(ix - 0.2 * rx, iy + 0.2, 0.13 * max(0.6, wr), 0.13, `fill="#fff" opacity=".9" ${NS}`) +
      path(up + `L${f(B.x)},${f(B.y + 1)}L${f(A.x)},${f(A.y + 1)}Z`, `fill="none" ${S('#000', 0.3, 'opacity=".14"')}`) + '</g>');
    o.push(path(up, `fill="none" ${S('#33261E', 2.1 * lw)}`));
    o.push(path(`M${f(B.x)},${f(B.y)}C${f(B.x - 0.25 * w)},${f(B.y - hl * 1.3)} ${f(A.x + 0.3 * w)},${f(A.y - hl * 1.3)} ${f(A.x)},${f(A.y)}`, `fill="none" ${S('#8B6654', 0.9 * lw, 'opacity=".7"')}`));
    const cr = 0.3 + 0.12 * (1 - open);
    o.push(path(`M${f(A.x + 0.1 * w)},${f(A.y + cr + 0.15)}C${f(A.x + 0.3 * w)},${f(A.y + hu * 1.3 + cr)} ${f(A.x + 0.72 * w)},${f(B.y + hu * 1.3 + cr)} ${f(B.x - 0.03 * w)},${f(B.y + cr * 0.8)}`, `fill="none" ${S('#A27A66', 0.9 * lw, 'opacity=".75"')}`));
    // brow
    const pi = E.pinch ?? 0;
    const b1 = P3(sg * (1.3 - pi), 9.5 + (E.browIn ?? 0), 7.35, th), b2 = P3(sg * 3.0, 9.92 + (E.browMid ?? 0), 7.05, th), b3 = P3(sg * 4.95, 9.5 + (E.browOut ?? 0), 5.5, th);
    const up2 = (p, k) => ({ x: p.x, y: p.y + k });
    o.push(path(spline([b1, b2, b3]) + 'L' + spline([up2(b3, 0.05), up2(b2, 0.36), up2(b1, 0.4)]).slice(1) + 'Z', `fill="#5A4435" opacity=".72" ${NS}`));
  }

  // hair: two halves of the hair shell, clipped by the hairline
  const hairHalf = (sg) => patch(HAIR, th, { yTop: 20.05, yBot: 3.4, t0: (v) => sg * hairline(lerp(20.05, 3.4, v)), t1: sg * PI, nu: 110, nv: 70 });
  const hl = `fill="${PAL.hair}" ${OUT}`;
  const strands = (sg) => {
    let s = '';
    const end = [sg * rad(112), 6.2];
    for (let k = 0; k < 27; k++) {
      const q = k / 26;
      const st = q < 0.42 ? [sg * 0.05, lerp(14.7, 19.9, q / 0.42)] : [sg * (PI - 0.05), lerp(19.9, 8.2, (q - 0.42) / 0.58)];
      const ct = q < 0.42 ? [sg * rad(lerp(62, 84, q / 0.42)), lerp(13.2, 16.5, q / 0.42)] : [sg * rad(lerp(100, 150, (q - 0.42) / 0.58)), lerp(15.5, 7.2, (q - 0.42) / 0.58)];
      const g = (u) => [(1 - u) * (1 - u) * st[0] + 2 * u * (1 - u) * ct[0] + u * u * end[0], (1 - u) * (1 - u) * st[1] + 2 * u * (1 - u) * ct[1] + u * u * end[1]];
      s += sline(HAIR, th, g, S(k % 3 === 1 ? PAL.hairLight : PAL.hairDark, (k % 3 === 1 ? 1.2 : 1.5) * lw, `opacity="${k % 3 === 1 ? 0.5 : 0.6}"`), 30, 0.02);
    }
    return s;
  };
  for (const sg of [-1, 1]) o.push(polyg(hairHalf(sg), hl), polyg(hairHalf(sg), `fill="url(#shadeH)" opacity=".7" ${NS}`), strands(sg));
  // centre parting, front hairline to nape
  o.push(sline(HAIR, th, (u) => [0, lerp(14.6, 20, u)], S('#B79A86', 1.5 * lw), 12, 0.03), sline(HAIR, th, (u) => [PI, lerp(20, 8.4, u)], S('#B79A86', 1.5 * lw), 20, 0.03));
  // loose wisps at the temples and nape
  for (const sg of [-1, 1]) {
    for (const [t0, y0, t1, y1, of1] of [[72, 10.7, 80, 8.6, 0.5], [66, 11.2, 70, 9.3, 0.25], [118, 6.4, 128, 4.6, 0.5], [150, 4.6, 160, 3.2, 0.4]]) {
      const a = spt(HAIR, th, sg * rad(t0), y0, 0.02), b = spt(HAIR, th, sg * rad((t0 + t1) / 2), (y0 + y1) / 2, of1 * 0.8), e = spt(HAIR, th, sg * rad(t1), y1, of1);
      if (a.vis) o.push(path(spline([a, b, e]), `fill="none" ${S(PAL.hair, 0.9 * lw, 'opacity=".75"')}`));
    }
  }
  for (const sg of [-1, 1]) if (earSide(sg) > 0.25) o.push(ear(sg));
  const tilt = E.tilt ? ` rotate(${E.tilt} 0 -3)` : '';
  return `<g transform="translate(${f(hx)},${M.chin})${tilt}">${o.join('')}</g>`;
}

// ----------------------------------- BRAIDS -----------------------------------
function bowGlyph(x, y, k, fx, lw) {
  const q = (u, v) => ({ x: x + u * k * fx, y: y + v * k });
  const loop = (s) => path(spline([q(0, 0), q(s * 1.3, 0.95), q(s * 2.6, 1.0), q(s * 2.9, -0.1), q(s * 2.3, -0.85), q(s * 1.1, -0.5)], true), `fill="url(#m-collar)" ${S(PAL.line, 1.1 * lw)}`);
  const tail = (s) => polyg([q(s * 0.1, -0.1), q(s * 1.15, -2.9), q(s * 0.7, -3.3), q(s * 0.25, -3.0), q(-s * 0.2, -0.4)], `fill="url(#m-collar)" ${S(PAL.line, 1.1 * lw)}`);
  return tail(-1) + tail(1) + loop(-1) + loop(1) + ellipse(x, y, 0.45 * k * max(fx, 0.6), 0.52 * k, `fill="${PAL.collar}" ${S(PAL.line, 1.1 * lw)}`) +
    path(spline([q(-2.2, 0.3), q(-1.2, 0.25), q(-0.5, 0.05)]), `fill="none" ${S('#A99F88', 0.8 * lw)}`) + path(spline([q(2.2, 0.3), q(1.2, 0.25), q(0.5, 0.05)]), `fill="none" ${S('#A99F88', 0.8 * lw)}`);
}
const braidPath = (sg) => [[6.7, 108.3, -2.8, 1.15], [7.1, 105.3, -1.9, 1.2], [7.5, 101.6, 0, 1.15], [7.7, 98.9, 2.2, 1.1], [7.6, 96.3, 5.4, 1.0]].map(([X, Y, Z, r]) => ({ X: sg * X, Y, Z, r }));
function braid(c, sg) {
  const th = c.th, lw = c.lw, o = [];
  const pts = resample(braidPath(sg), 60).map((p) => ({ ...P3(p.X, p.Y, p.Z, th), r: p.r }));
  // tail below the bow
  const b = pts[pts.length - 1], e = P3(sg * 7.5, 90.4, 6.7, th), dx = e.x - b.x;
  const tail = [{ x: b.x - 0.75, y: b.y + 0.3 }, { x: b.x - 0.95 + dx * 0.5, y: b.y - 3 }, { x: e.x - 0.5, y: e.y + 0.9 }, { x: e.x, y: e.y }, { x: e.x + 0.55, y: e.y + 1.1 }, { x: b.x + 0.95 + dx * 0.5, y: b.y - 3 }, { x: b.x + 0.75, y: b.y + 0.3 }];
  o.push(path(spline(tail, true), `fill="${PAL.hair}" ${S(PAL.line, 1.2 * lw)}`));
  for (const k of [-0.4, 0, 0.4]) o.push(pline([{ x: b.x + k, y: b.y - 0.5 }, { x: e.x + k * 0.6, y: e.y + 1.3 }], S(PAL.hairDark, 0.8 * lw, 'opacity=".6"')));
  // plait: alternating lobes walked along the projected centre line
  const lobes = [];
  let acc = 0, n = 0;
  for (let i = pts.length - 1; i > 0; i--) {
    const p = pts[i], q = pts[i - 1], l = hypot(p.x - q.x, p.y - q.y);
    acc += l;
    if (acc >= 1.55 || i === pts.length - 1) { acc = 0; lobes.push({ p, ang: atan2(q.y - p.y, q.x - p.x), s: n++ % 2 ? 1 : -1 }); }
  }
  for (const { p, ang, s } of lobes) {
    const nx = -sin(ang), ny = cos(ang), cx = p.x + nx * s * p.r * 0.3, cy = p.y + ny * s * p.r * 0.3, rot = ((ang - PI / 2) * 180) / PI + s * 30;
    o.push(`<g transform="translate(${f(cx)},${f(cy)}) rotate(${f(rot)})">` + ellipse(0, 0, p.r * 0.72, 1.35, `fill="${PAL.hair}" ${S(PAL.hairDark, 1.1 * lw)}`) + ellipse(p.r * 0.12, 0.1, p.r * 0.3, 0.8, `fill="${PAL.hairLight}" opacity=".3" ${NS}`) +
      path(`M${f(-p.r * 0.2)},-0.9Q${f(p.r * 0.15)},0 ${f(-p.r * 0.1)},0.9`, `fill="none" ${S(PAL.hairLight, 0.8 * lw, 'opacity=".55"')}`) + '</g>');
  }
  o.push(bowGlyph(b.x, b.y, 0.92, max(0.4, abs(cos(th - sg * rad(15)))), lw));
  return o.join('');
}

// ----------------------------------- BODY -----------------------------------
function dress(c) {
  const th = c.th, lw = c.lw, o = [], OUT = S(PAL.line, 1.5 * lw), FINE = S(PAL.line, 0.8 * lw, 'opacity=".55"');
  const STITCH = S(PAL.thread, 0.7 * lw, 'stroke-dasharray=".22 .2" opacity=".85"');
  const hem = (t) => M.hem + 0.16 * sin(7 * t + 0.6) + 0.07 * sin(17 * t);
  const body = patch(DRESS, th, { yTop: 99.2, yBot: hem, nu: 140, nv: 90 });
  o.push(polyg(body, `fill="url(#m-wool)" ${OUT}`), shade(body));
  // skirt gathers from the waist seam and soft folds to the hem
  const r = rng(7);
  for (let k = 0; k < 44; k++) {
    const t = -PI + (k + 0.5) * (2 * PI / 44) + (r() - 0.5) * 0.06, len = 6 + r() * 16;
    o.push(sline(DRESS, th, (u) => [t, lerp(73.4, 73.4 - len, u)], S('#2A2622', 1.0 * lw, `opacity="${f(0.22 + r() * 0.18)}"`), 8));
    if (k % 3 === 0) o.push(sline(DRESS, th, (u) => [t + 0.03, lerp(58 - r() * 8, hem(t) + 0.4, u)], S('#2A2622', 1.3 * lw, 'opacity=".2"'), 10));
    if (k % 3 === 1) o.push(sline(DRESS, th, (u) => [t, lerp(52 - r() * 8, hem(t) + 0.4, u)], S('#C9C0A8', 1.2 * lw, 'opacity=".12"'), 10));
  }
  o.push(sline(DRESS, th, (u) => [lerp(-PI, PI, u), hem(lerp(-PI, PI, u)) * 0.4 + M.hem * 0.6 + 3], STITCH, 160)); // deep let-down hem
  for (const sg of [-1, 1]) o.push(sline(DRESS, th, (u) => [sg * PI / 2, lerp(87, 30, u)], FINE, 30)); // side seams
  o.push(sline(DRESS, th, (u) => [lerp(-PI, PI, u), 76.5], FINE, 120)); // waist seam
  // front placket, buttons, pintucks
  const tx = (X, y) => Math.asin(clamp(X / interp(DRESS.k, y)[0], -1, 1));
  for (const X of [-1.15, 1.15]) o.push(sline(DRESS, th, (u) => [tx(X, lerp(98.3, 76.6, u)), lerp(98.3, 76.6, u)], S(PAL.line, 1.0 * lw, 'opacity=".8"'), 30));
  for (const X of [-0.85, 0.85]) o.push(sline(DRESS, th, (u) => [tx(X, lerp(98.3, 76.6, u)), lerp(98.3, 76.6, u)], STITCH, 30));
  for (const sg of [-1, 1]) for (const X of [2.7, 3.7, 4.7]) {
    const g = (dx) => (u) => [tx(sg * (X + dx), lerp(97.2, 77, u)), lerp(97.2, 77, u)];
    o.push(sline(DRESS, th, g(0), S('#2A2622', 1.0 * lw, 'opacity=".55"'), 24), sline(DRESS, th, g(0.14), S('#B9B09A', 0.8 * lw, 'opacity=".25"'), 24));
  }
  // back: yoke seam, centre inverted pleat, gathers under the yoke
  o.push(sline(DRESS, th, (u) => [lerp(rad(100), rad(260), u), 92.3], FINE, 40), sline(DRESS, th, (u) => [lerp(rad(100), rad(260), u), 92.0], STITCH, 40));
  for (const X of [-0.9, 0.9]) o.push(sline(DRESS, th, (u) => [PI - tx(X, lerp(92.3, 76.6, u)), lerp(92.3, 76.6, u)], S(PAL.line, 1.0 * lw, 'opacity=".7"'), 20));
  for (let k = -5; k <= 5; k++) if (abs(k) > 1) o.push(sline(DRESS, th, (u) => [PI + k * 0.085, lerp(92.2, 92.2 - 4 - (k * k % 3), u)], S('#2A2622', 0.9 * lw, 'opacity=".35"'), 6));
  for (const y of M.buttons) {
    const q = spt(DRESS, th, 0, y, 0.08);
    if (q.face > 0.05) {
      const rx = 0.55 * max(q.face, 0.3);
      if (q.face < 0.5) o.push(`<rect x="${f(q.x - 0.05)}" y="${f(y - 0.5)}" width="${f(0.3)}" height="1" rx=".12" fill="${PAL.horn}" ${S(PAL.line, 0.8 * lw)}/>`);
      else o.push(ellipse(q.x, y, rx, 0.55, `fill="${PAL.horn}" ${S('#1E1915', 0.9 * lw)}`), ellipse(q.x, y, rx * 0.62, 0.34, `fill="none" ${S('#6A5D4C', 0.7 * lw)}`),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ellipse(q.x + a * 0.13 * rx / 0.55, y + b * 0.13, 0.05, 0.05, `fill="#15110E" ${NS}`)));
    } else if (q.vis || abs(sin(th)) > 0.9) o.push(`<rect x="${f(q.x - 0.02)}" y="${f(y - 0.5)}" width=".3" height="1" rx=".12" fill="${PAL.horn}" ${S(PAL.line, 0.8 * lw)}/>`);
  }
  // darned patch, back of skirt, wearer's right
  const pp = patch(DRESS, th, { yTop: (t) => M.patch[1] + 0.25 * sin(t * 9), yBot: (t) => M.patch[0] - 0.2 * sin(t * 7), t0: rad(201), t1: rad(223), off: 0.08, nu: 16, nv: 10 });
  if (pp) {
    o.push(polyg(pp, `fill="url(#m-patch)" ${S(PAL.line, 0.9 * lw)}`));
    for (let i = 0; i < pp.length; i += 1) { const a = pp[i], cxp = pp.reduce((s, p) => s + p.x, 0) / pp.length, cyp = (M.patch[0] + M.patch[1]) / 2, l = hypot(a.x - cxp, a.y - cyp) || 1;
      if (i % 2 === 0) o.push(pline([{ x: a.x + (a.x - cxp) / l * 0.22, y: a.y + (a.y - cyp) / l * 0.22 }, { x: a.x - (a.x - cxp) / l * 0.3 + 0.08, y: a.y - (a.y - cyp) / l * 0.3 }], S(PAL.thread, 0.8 * lw))); }
  }
  return o.join('');
}
function apron(c) {
  const th = c.th, lw = c.lw, o = [], OUT = S(PAL.line, 1.4 * lw), STITCH = S('#8E8368', 0.7 * lw, 'stroke-dasharray=".22 .2"');
  const half = (v) => rad(lerp(80, 50, Math.pow(v, 0.8)));
  const bot = (t) => M.apronHem + 0.25 * sin(11 * t + 1);
  const panel = patch(DRESS, th, { yTop: M.waistBot, yBot: bot, t0: (v) => -half(v), t1: half, off: 0.45, nu: 80, nv: 50 });
  if (panel) {
    o.push(polyg(panel, `fill="url(#m-linen)" ${OUT}`), shade(panel, 0.8));
    const r = rng(11);
    for (let k = -9; k <= 9; k++) {
      const q = k / 9, len = 5 + r() * 12;
      o.push(sline(DRESS, th, (u) => [lerp(rad(78) * q, rad(64) * q, u * 0.4), lerp(M.waistBot, M.waistBot - len, u)], S('#5B523F', 0.9 * lw, `opacity="${f(0.3 + r() * 0.2)}"`), 8, 0.5));
      if (k % 2 === 0) o.push(sline(DRESS, th, (u) => [rad(lerp(64, 50, u)) * q, lerp(56, bot(0) + 0.5, u)], S('#5B523F', 1.1 * lw, 'opacity=".18"'), 10, 0.5));
    }
    o.push(sline(DRESS, th, (u) => [lerp(-rad(49), rad(49), u), bot(lerp(-rad(49), rad(49), u)) + 2], STITCH, 60, 0.5));
    for (const sg of [-1, 1]) o.push(sline(DRESS, th, (u) => [sg * (half(u) - 0.045), lerp(M.waistBot, M.apronHem + 0.4, u)], STITCH, 30, 0.5));
  }
  const band = patch(DRESS, th, { yTop: M.waistTop, yBot: M.waistBot, off: 0.5, nu: 120, nv: 4 });
  o.push(polyg(band, `fill="url(#m-linen)" ${OUT}`), shade(band, 0.8));
  for (const y of [M.waistTop - 0.3, M.waistBot + 0.3]) o.push(sline(DRESS, th, (u) => [lerp(-PI, PI, u), y], STITCH, 120, 0.52));
  return o.join('');
}
function apronBow(c) {
  const th = c.th, lw = c.lw, o = [], A = `fill="url(#m-linen)" ${S(PAL.line, 1.3 * lw)}`;
  const zb = (y) => { const [, b, cz] = interp(DRESS.k, y); return cz - b - 0.5; };
  const el = (X, Y, Z, rx, ry, rz) => { const q = P3(X, Y, Z, th); return ellipse(q.x, q.y, sqrt(rx * rx * cos(th) ** 2 + rz * rz * sin(th) ** 2), ry, A); };
  for (const sg of [-1, 1]) {
    const pts = [[0.3, 74.9, 0], [1.4, 68, 0.2], [2.6, 60.5, 0.3]].flatMap(([X, Y]) => [P3(sg * X, Y, zb(Y) - 0.3, th)]);
    const pts2 = [[2.2, 75.0], [3.6, 68], [4.9, 59.2]].map(([X, Y]) => P3(sg * X, Y, zb(Y) - 0.3, th));
    o.push(polyg([...pts, ...pts2.reverse()], A));
  }
  for (const sg of [-1, 1]) {
    o.push(el(sg * 3.9, 75.6, zb(75) - 0.9, 3.7, 1.75, 1.3));
    const a = P3(sg * 1.2, 75.5, zb(75) - 1.6, th), b = P3(sg * 5.6, 75.9, zb(75) - 1.6, th);
    if (cos(th) < -0.3) o.push(pline([a, b], S('#5B523F', 0.9 * lw, 'opacity=".5"')));
  }
  o.push(el(0, 75.3, zb(75) - 1.2, 1.15, 1.35, 1.2));
  return o.join('');
}
function collar(c) {
  const th = c.th, lw = c.lw, o = [];
  // lower edge by surface angle: hangs lowest on the chest, rides up over the shoulder slope, level across the back
  const kb = [[0, 97.7], [6, 96.5], [14, 95.85], [28, 95.6], [48, 95.95], [66, 96.7], [82, 97.4], [92, 97.6], [104, 97.3], [130, 96.7], [180, 96.5]];
  const yB = (t) => interp(kb, abs(t) * 180 / PI)[0], yT = (t) => 99.7 - 1.3 * ((0.5 + 0.5 * cos(t)) ** 2);
  for (const sg of [-1, 1]) {
    const p = patch(COLLAR, th, { yTop: yT, yBot: yB, t0: sg * 0.012, t1: sg * PI, nu: 100, nv: 14 });
    o.push(polyg(p, `fill="url(#m-collar)" ${S(PAL.line, 1.3 * lw)}`), shade(p, 0.45));
    o.push(sline(COLLAR, th, (u) => [sg * lerp(0.07, PI, u), yB(sg * lerp(0.07, PI, u)) + 0.32], S('#9C927B', 0.7 * lw, 'stroke-dasharray=".22 .2"'), 80, 0.03));
  }
  return o.join('');
}
const armPts = (sg) => [[10.2, 95.5, -0.4, 0.8], [10.8, 94.8, -0.4, 2.7], [11.6, 93.1, -0.45, 3.6], [12.4, 91, -0.5, 3.75], [13.4, 87, -0.7, 3.6], [15.4, 79.2, -1, 3.45], [17.6, 71, -0.2, 3.7], [19.3, 66.2, 0.5, 3.85], [19.85, 64.7, 0.75, 3.0]].map(([X, Y, Z, r]) => ({ X: sg * X, Y, Z, r }));
function hand(c, sg) {
  const th = c.th, lw = c.lw, W = P3(sg * 20.75, 61.4, 1.05, th), T = P3(sg * 23.4, 49, 2.4, th);
  const l = hypot(T.x - W.x, T.y - W.y), e = { x: (T.x - W.x) / l, y: (T.y - W.y) / l };
  let n = { x: e.y, y: -e.x };
  const s = sin(th), wide = abs(s);
  if (n.x * (wide > 0.3 ? s : -sg * cos(th)) < 0) n = { x: -n.x, y: -n.y };
  const k = (wide > 0.75 ? 1 : 0.74) * (l / 12.7), q = (u, w) => ({ x: W.x + e.x * u * (l / 12.7) + n.x * w * k, y: W.y + e.y * u * (l / 12.7) + n.y * w * k });
  const cap = (pts, w) => pline(pts, S(PAL.line, w * k + 2.2 * lw)) + pline(pts, S(PAL.skin, w * k));
  if (wide > 0.35) {
    const palm = [q(-3.2, -1.8), q(-0.6, -1.85), q(2.5, -2.25), q(5.5, -2.7), q(7.1, -2.5), q(7.4, 0), q(7.1, 2.5), q(5.3, 2.65), q(2.5, 2.3), q(-0.6, 1.85), q(-3.2, 1.8)];
    return cap([q(6.5, -2.1), q(10.2, -2.55)], 1.2) + cap([q(6.9, -0.75), q(12, -1.05)], 1.25) + cap([q(7, 0.6), q(12.6, 0.5)], 1.3) + cap([q(6.8, 1.9), q(11.8, 2.1)], 1.25) +
      cap([q(2.6, 2.2), q(5, 3.5), q(6.8, 3.9)], 1.4) + path(spline(palm, true), `fill="${PAL.skin}" ${S(PAL.line, 1.1 * lw)}`) + path(spline(palm, true), `fill="${PAL.skin}" ${NS} transform="translate(${f(e.x * 0.12)},${f(e.y * 0.12)})"`) +
      [-1.4, 0, 1.3].map((w) => pline([q(7.1, w), q(7.9, w)], S(PAL.skinShade, 0.9 * lw))).join('');
  }
  return cap([q(6.2, -0.5), q(9.5, -0.9), q(11.9, -0.7)], 1.3) + cap([q(-3.2, 0), q(6.3, 0)], 2.35) + cap([q(6.2, 0.15), q(9.6, 0.35), q(12.4, -0.1)], 1.35) + cap([q(2.4, 0.5), q(5, 1.0), q(6.9, 0.9)], 1.35) +
    pline([q(-3.2, 0), q(5.6, 0)], S(PAL.skin, 2.3 * k));
}
function arm(c, sg) {
  const th = c.th, lw = c.lw, o = [], OUT = S(PAL.line, 1.5 * lw);
  o.push(hand(c, sg));
  const sl = tube(armPts(sg), th, 40);
  o.push(path(spline(sl, true), `fill="url(#m-wool)" ${OUT}`), path(spline(sl, true), `fill="url(#shadeH)" ${NS}`));
  const cuffA = { X: sg * 19.8, Y: 64.9, Z: 0.75 }, cuffB = { X: sg * 20.55, Y: 61.8, Z: 1.0 };
  const cf = tube([{ ...cuffA, r: 2.75 }, { ...cuffB, r: 2.7 }], th, 3);
  o.push(polyg(cf, `fill="url(#m-wool)" ${OUT}`), polyg(cf, `fill="#000" opacity=".1" ${NS}`));
  const a2 = P3(cuffA.X, cuffA.Y, cuffA.Z, th), b2 = P3(cuffB.X, cuffB.Y, cuffB.Z, th), ex = (b2.x - a2.x) / hypot(b2.x - a2.x, b2.y - a2.y), ey = (b2.y - a2.y) / hypot(b2.x - a2.x, b2.y - a2.y);
  const at = (u, w) => ({ x: lerp(a2.x, b2.x, u) - ey * w, y: lerp(a2.y, b2.y, u) + ex * w });
  for (const u of [0.12, 0.88]) o.push(pline([at(u, -2.6), at(u, 2.6)], S(PAL.thread, 0.7 * lw, 'stroke-dasharray=".22 .2" opacity=".85"')));
  for (let k = -4; k <= 4; k++) o.push(pline([at(-0.05, k * 0.6), at(-0.05 - 0.75 - (abs(k) % 2) * 0.5, k * 0.74)], S('#2A2622', 0.9 * lw, 'opacity=".45"')));
  // cuff button on the outer-back side (surface angle 110 deg from front)
  const ta = sg * rad(110);
  const nx = sin(ta), nz = cos(ta), face = -nx * sin(th) + nz * cos(th);
  if (face > 0.15) { const m = P3((cuffA.X + cuffB.X) / 2 + nx * 2.72, (cuffA.Y + cuffB.Y) / 2, (cuffA.Z + cuffB.Z) / 2 + nz * 2.72, th); o.push(ellipse(m.x, m.y, 0.5 * max(face, 0.35), 0.5, `fill="${PAL.horn}" ${S('#1E1915', 0.9 * lw)}`), ellipse(m.x, m.y, 0.3 * max(face, 0.35), 0.3, `fill="none" ${S('#6A5D4C', 0.6 * lw)}`)); }
  // sleeve-head gathers and armscye seam
  // The armscye is a ring in the plane of the shoulder; only the camera-facing part is drawn.
  const ring = (a) => ({ X: sg * (10.6 + 0.9 * sin(a) * sin(a)), Y: 91.8 + 4.5 * cos(a), Z: -0.4 + 3.7 * sin(a) });
  const sideOn = -sg * sin(th), seam = [];
  for (let i = 0; i <= 30; i++) {
    const a = rad(lerp(-150, 150, i / 30)), p = ring(a);
    if (sideOn > 0.9 || (p.Z + 0.4) * cos(th) >= -0.01) seam.push(P3(p.X, p.Y, p.Z, th));
  }
  if (sideOn > -0.3) o.push(path(spline(seam), `fill="none" ${S(PAL.line, 0.85 * lw, 'opacity=".6"')}`));
  // sleeve-head gathers radiate from the seam
  for (let k = -3; k <= 3; k++) {
    const a = rad(k * 16), p = ring(a), A = P3(p.X + sg * 0.3, p.Y - 0.1, p.Z, th), B = P3(p.X + sg * (1.5 + (abs(k) % 2) * 0.5), p.Y - 1.7 - (abs(k) % 2) * 0.5, p.Z * 1.05, th);
    if (sideOn > 0.9 || p.Z * cos(th) >= -0.01) o.push(pline([A, B], S('#2A2622', 0.9 * lw, 'opacity=".42"')));
  }
  return o.join('');
}
function leg(c, sg) {
  const th = c.th, lw = c.lw, o = [], L = new Loft(legKeys, sg * LEGX);
  const p = patch(L, th, { nu: 60, nv: 20 });
  o.push(polyg(p, `fill="url(#m-stocking)" ${S(PAL.line, 1.4 * lw)}`), shade(p));
  for (let k = 0; k < 18; k++) o.push(sline(L, th, (u) => [k * (2 * PI / 18), lerp(34, 11, u)], S('#3E3C33', 0.7 * lw, 'opacity=".35"'), 10));
  for (const [y, t0] of [[14.2, -1.2], [15.4, 0.3], [16.8, -2.6]]) o.push(sline(L, th, (u) => [t0 + u * 1.5, y + 0.25 * sin(u * PI)], S('#3E3C33', 0.9 * lw, 'opacity=".45"'), 10));
  return o.join('');
}
function boot(c, sg) {
  const th = c.th, lw = c.lw, o = [], B = new Loft(bootKeys, sg * LEGX), OUT = S(PAL.line, 1.4 * lw);
  const STITCH = S('#9A8468', 0.65 * lw, 'stroke-dasharray=".2 .18" opacity=".9"'), SEAM = S('#221A14', 1.0 * lw, 'opacity=".8"');
  const slab = (keys, fill) => { const p = patch(new Loft(keys, sg * LEGX), th, { nu: 70, nv: 3 }); return polyg(p, `fill="${fill}" ${OUT}`); };
  // stacked leather heel 1.3 cm, single leather sole 0.6 cm (hobnailed underneath, see plate 3)
  o.push(slab([[0, 3.6, 3.25, -3.3], [1.3, 3.6, 3.25, -3.3]], '#241F1B'), slab([[0, 3.9, 7.35, 6.9], [0.6, 3.9, 7.35, 6.9]], PAL.sole));
  const tg = patch(B, th, { yTop: 12.9, yBot: 6.4, t0: rad(-13), t1: rad(13), off: -0.15, nu: 12, nv: 10 });
  const soleY = (t) => { const [, b, cz] = interp(bootKeys, 1); const Z = cz + b * cos(t); return lerp(1.3, 0.6, sm(-0.8, 1.2, Z)); };
  const up = patch(B, th, { yBot: soleY, nu: 110, nv: 44 });
  o.push(polyg(up, `fill="url(#m-leather)" ${OUT}`), shade(up));
  if (tg) o.push(polyg(tg, `fill="#43342A" ${S(PAL.line, 0.9 * lw)}`));
  o.push(sline(B, th, (u) => [lerp(-PI, PI, u), soleY(lerp(-PI, PI, u)) + 0.35], STITCH, 120)); // welt stitching
  const zplane = (Z) => (sgn) => (u) => { const y = lerp(0.9, 5.4, u), [, b, cz] = interp(bootKeys, y); return [sgn * Math.acos(clamp((Z - cz) / b, -1, 1)), y]; };
  for (const sgn of [-1, 1]) {
    o.push(sline(B, th, zplane(8.9)(sgn), SEAM, 24), sline(B, th, zplane(8.5)(sgn), STITCH, 24), sline(B, th, zplane(9.3)(sgn), STITCH, 24)); // toe cap
    const quarter = [[100, 1.1], [88, 2.6], [70, 4.0], [48, 5.0], [30, 5.9], [21, 6.9]], heelC = [[115, 1.5], [135, 3.8], [160, 5.4], [172, 5.6]];
    const along = (k) => (u) => { const v = interp(k.map((r, i) => [i / (k.length - 1), r[0], r[1]]), u); return [sgn * rad(v[0]), v[1]]; };
    o.push(sline(B, th, along(quarter), SEAM, 24), sline(B, th, along(quarter.map(([t, y]) => [t + 5, y - 0.15])), STITCH, 24), sline(B, th, along(heelC), SEAM, 20));
    o.push(sline(B, th, (u) => [sgn * rad(lerp(30, 40, u)), lerp(5.9, 12.25, u)], SEAM, 12), sline(B, th, (u) => [sgn * rad(lerp(34, 44, u)), lerp(6.1, 12.0, u)], STITCH, 12), sline(B, th, (u) => [sgn * rad(172), lerp(1.8, 12.2, u)], SEAM, 12));
    for (const y of [4.75, 5.2]) o.push(sline(B, th, (u) => [sgn * rad(lerp(8, 52, u)), y + 0.12 * sin(u * 9)], S('#221A14', 0.8 * lw, 'opacity=".3"'), 10));
  }
  o.push(sline(B, th, (u) => [lerp(-PI, PI, u), 11.85], STITCH, 90));
  // five eyelet pairs, criss-cross lacing, small bow
  const eyY = [6.9, 8.1, 9.3, 10.5, 11.7], ey = eyY.map((y) => [spt(B, th, rad(-28), y, 0.05), spt(B, th, rad(28), y, 0.05)]);
  const LACE = S(PAL.thread, 1.25 * lw);
  for (let i = 0; i < ey.length; i++) {
    const [a, b] = ey[i];
    if (i < ey.length - 1) for (const sgn of [-1, 1]) o.push(sline(B, th, (u) => [sgn * rad(lerp(-28, 28, u)), lerp(eyY[i], eyY[i + 1], u)], LACE, 10, 0.12));
    for (const e of [a, b]) if (e.vis) o.push(ellipse(e.x, e.y, 0.2 * max(e.face, 0.4), 0.2, `fill="#1A1512" ${S('#6B5A47', 0.6 * lw)}`));
  }
  const [ta, tb] = ey[4];
  if (ta.vis && tb.vis) { const m = { x: (ta.x + tb.x) / 2, y: 12.0 }, k = max(abs(tb.x - ta.x) / 2.9, 0.25);
    o.push(path(spline([m, { x: m.x - 1.7 * k, y: m.y + 0.5 }, { x: m.x - 1.9 * k, y: m.y - 0.7 }, m, { x: m.x + 1.7 * k, y: m.y + 0.5 }, { x: m.x + 1.9 * k, y: m.y - 0.7 }, m]), `fill="none" ${LACE}`), pline([{ x: m.x - 0.5 * k, y: m.y - 1.8 }, m, { x: m.x + 0.7 * k, y: m.y - 1.6 }], LACE)); }
  const pl = spt(B, th, PI, 12.3, 0);
  if (pl.face > 0.1 || abs(sin(th)) > 0.6) { const w = 0.55 * max(pl.face, 0.25), bx = pl.x - (pl.face < 0.3 ? 0.35 * Math.sign(sin(th) || 1) : 0); o.push(path(`M${f(bx - w)},12.2C${f(bx - w)},13.1 ${f(bx + w)},13.1 ${f(bx + w)},12.2`, `fill="none" ${S('#3B2E24', 2.2 * lw)}`)); }
  return o.join('');
}

// Draw the whole character for camera azimuth `deg` (0 front, 90 her right side, 180 back).
export function figure({ deg = 0, lw = 0.1, expr = 'neutral', only = null }) {
  const th = rad(deg), c = { th, lw }, o = [], E = typeof expr === 'string' ? EXPR[expr] : expr;
  const depth = (X, Z) => -X * sin(th) + Z * cos(th), want = (k) => !only || only.includes(k);
  const sides = [-1, 1].sort((a, b) => depth(a, 0) - depth(b, 0));
  const backFacing = cos(th) < -0.3;
  if (want('legs')) for (const sg of sides) o.push(leg(c, sg), boot(c, sg));
  if (want('braids') && backFacing) for (const sg of sides) o.push(braid(c, sg));
  if (want('arms')) for (const sg of sides) if (depth(sg * 15, 0) < -5) o.push(arm(c, sg));
  if (want('body')) {
    if (!backFacing) o.push(apronBow(c));
    const nk = patch(NECK, th, { nu: 50, nv: 10 });
    if (backFacing) o.push(polyg(nk, `fill="${PAL.skin}" ${S(PAL.line, 1.3 * lw)}`), polyg(nk, `fill="${PAL.skinShade}" opacity=".25" ${NS}`));
    o.push(dress(c), apron(c));
    if (backFacing) o.push(apronBow(c));
    if (!backFacing) o.push(polyg(nk, `fill="${PAL.skin}" ${S(PAL.line, 1.3 * lw)}`), polyg(nk, `fill="${PAL.skinShade}" opacity=".3" ${NS}`));
    o.push(collar(c));
  }
  if (want('arms')) for (const sg of sides) if (depth(sg * 15, 0) >= -5) o.push(arm(c, sg));
  if (want('braids') && !backFacing) for (const sg of sides) if (depth(sg * 6.4, -2.6) <= 4) o.push(braid(c, sg));
  if (want('head')) o.push(head(c, E));
  if (want('braids') && !backFacing) for (const sg of sides) if (depth(sg * 6.4, -2.6) > 4) o.push(braid(c, sg));
  return o.join('');
}
export { head, braid, bowGlyph, boot, leg, ellipse, path, pline, polyg, S, NS, f, patch, P3 };
