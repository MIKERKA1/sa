// "Believe It" — farm dog v2: northern village laika (wolf-grey agouti coat with a dark saddle, tan cheeks and legs,
// cream chest, belly and paws, thick neck ruff, bushy ring tail, warm brown eyes, leather collar with an iron ring).
// One continuous skinned body sculpted offline from smooth volumes (tools/dog_bake.mjs -> dog_mesh.gen.js),
// coat painted procedurally per pixel in the shader (zones from the bind-pose position/normal + fur strands),
// fur volume from alpha-tested shells, per-pixel lighting, baked ambient occlusion. Rig + animations: dog_rig.js.
import * as THREE from 'three';
import { LIGHTS, ps1Material, ENH_GLSL } from '../engine/ps1.js';
import { buildRig, makeAnimator, HEADP, FACE, TAIL0, EARS, DOG_ANIMS as ANIMS, DOG_WALK_SPEED as WS } from './dog_rig.js';
import { DOG_MESH, DOG_BONES } from './dog_mesh.gen.js';

export const DOG_ANIMS = ANIMS;
export const DOG_WALK_SPEED = WS;
export const DOG_SIZE = { withers: 0.55, length: 0.64, headTop: 0.7 };
export const DOG_PALETTE = [
  { id: 'ash', label: 'Пепельно-серый', hex: '#7a766f' },
  { id: 'ginger', label: 'Рыжий подпал', hex: '#c48b55' },
  { id: 'cream', label: 'Кремово-белый', hex: '#e6dccb' },
  { id: 'saddle', label: 'Тёмный чепрак', hex: '#3b3735' },
  { id: 'leather', label: 'Кожа ошейника', hex: '#6b3524' },
  { id: 'eye', label: 'Карие глаза', hex: '#6a3f1f' },
];
export const DOG_SHELLS = 10;

const V3 = THREE.Vector3;
const v3 = (x, y, z) => new V3(x, y, z);
const g3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

/* ================================================================ geometry (decoded once, shared by every dog) */
const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
let GEO = null;
function geometries() {
  if (GEO) return GEO;
  GEO = {};
  for (const P of DOG_MESH) {
    const q = new Int16Array(b64(P.pos)), pos = new Float32Array(P.n * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = q[i] / 32767;
    const nq = new Int8Array(b64(P.nrm)), nrm = new Float32Array(P.n * 3);
    for (let i = 0; i < P.n; i++) { const x = nq[i * 4] / 127, y = nq[i * 4 + 1] / 127, z = nq[i * 4 + 2] / 127, l = Math.hypot(x, y, z) || 1; nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(b64(P.skI)), 4));
    g.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(new Uint8Array(b64(P.skW)), 4, true));
    g.setAttribute('aux', new THREE.Uint8BufferAttribute(new Uint8Array(b64(P.aux)), 4, true));
    g.setAttribute('flow', new THREE.Int8BufferAttribute(new Int8Array(b64(P.flow)), 4, true));
    g.setIndex(new THREE.BufferAttribute(P.big ? new Uint32Array(b64(P.idx)) : new Uint16Array(b64(P.idx)), 1));
    g.computeBoundingSphere();
    GEO[P.name] = { geo: g, tris: P.tris };
  }
  return GEO;
}

/* ================================================================ shader */
const TAILC = TAIL0.clone().add(v3(0.02, 0.08, 0.02));
const EYE_M = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...FACE.eyeRot, 'XYZ')).invert());
const EARF = (() => { // bind-pose left-ear frame (rows = ear-local axes) for painting the sculpted ears
  const M = buildRig().bones.earL.matrixWorld, e = M.elements, o = new THREE.Vector3().setFromMatrixPosition(M);
  const ex = new THREE.Vector3(e[0], e[1], e[2]).normalize(), ey = new THREE.Vector3(e[4], e[5], e[6]).normalize(), ez = new THREE.Vector3(e[8], e[9], e[10]).normalize();
  return { o, m: [ex.x, ey.x, ez.x, ex.y, ey.y, ez.y, ex.z, ey.z, ez.z] };
})();
const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform vec2 uSnap; uniform float uSnapOn;
uniform float uFogNear; uniform float uFogFar; uniform float uFogAmt;
uniform float uShell;
attribute vec4 aux; attribute vec4 flow;
varying vec3 vRest; varying vec3 vRestN; varying vec3 vFlowR; varying vec3 vWP; varying vec3 vWN; varying vec4 vAux; varying float vFog;
void main() {
  #include <skinbase_vertex>
  vec3 objectNormal = normal;
  #include <skinnormal_vertex>
  vec3 transformed = position;
  #include <skinning_vertex>
  vec3 fl = flow.xyz;
#ifdef USE_SKINNING
  fl = (skinMatrix * vec4(fl, 0.0)).xyz;
#endif
  vec3 nn = normalize(objectNormal);
#ifdef SHELL
  float L = aux.y * 0.03 * uShell;
  transformed += nn * L * 0.8 + normalize(fl + 1e-5) * L * 0.6;
#endif
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
#ifdef SHELL
  wp.y -= aux.y * 0.03 * uShell * uShell * 0.35; // long fur sags a little
#endif
  vWP = wp.xyz; vWN = normalize(mat3(modelMatrix) * nn);
  vRest = position; vRestN = normal; vFlowR = flow.xyz; vAux = aux;
  vec4 mv = viewMatrix * wp;
  vec4 clip = projectionMatrix * mv;
  if (uSnapOn > 0.5 && clip.w > 0.0) clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
  gl_Position = clip;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z) * uFogAmt;
}`;

const FRAG = /* glsl */ `
#define NPT 2
uniform vec3 uSkyAmb; uniform vec3 uGroundAmb; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec3 uPtPos[NPT]; uniform vec3 uPtCol[NPT]; uniform float uPtRange[NPT];
uniform vec3 uFogCol; uniform float uShell; uniform float uLid; uniform vec3 uTint;
uniform float uFogNear; uniform float uFogFar; uniform float uFogAmt;
varying vec3 vRest; varying vec3 vRestN; varying vec3 vFlowR; varying vec3 vWP; varying vec3 vWN; varying vec4 vAux; varying float vFog;
${ENH_GLSL}
float gShS = 1.0, gShP = 1.0;

const vec3 HEADP = ${g3(HEADP)};
const vec3 EYE = ${g3(FACE.eye)};
const vec3 EYER = ${g3(FACE.eyeSock)};
const mat3 EYEM = mat3(${EYE_M.elements.map((x) => x.toFixed(5)).join(', ')});
const vec3 EARO = ${g3(EARF.o)};
const mat3 EARM = mat3(${EARF.m.map((x) => x.toFixed(5)).join(', ')});
const vec4 EARA = vec4(${[EARS.y0, EARS.y1, EARS.r1, EARS.r2].map((x) => x.toFixed(4)).join(', ')});
const vec4 EARB = vec4(${[EARS.hy0, EARS.hy1, EARS.hr1, EARS.hr2].map((x) => x.toFixed(4)).join(', ')});
const vec3 EARC = vec3(${[EARS.zs, EARS.hz, EARS.hzs].map((x) => x.toFixed(4)).join(', ')});
const vec3 NOSE = ${g3(FACE.nose)};
const vec3 NOSER = ${g3(FACE.noseR)};
const vec3 TAILC = ${g3(TAILC)};
const float LIPY = ${FACE.lipY.toFixed(4)};

const vec3 cAsh = vec3(0.47, 0.45, 0.42), cAshL = vec3(0.64, 0.61, 0.57), cTip = vec3(0.12, 0.11, 0.105);
const vec3 cSad = vec3(0.22, 0.21, 0.2), cGin = vec3(0.72, 0.55, 0.38), cGinD = vec3(0.5, 0.4, 0.3);
const vec3 cCream = vec3(0.9, 0.87, 0.82), cBuff = vec3(0.8, 0.72, 0.61), cNose = vec3(0.06, 0.055, 0.055);
const vec3 cMouth = vec3(0.36, 0.13, 0.13), cTongue = vec3(0.78, 0.4, 0.4), cLeather = vec3(0.36, 0.19, 0.13);

float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 strandSpace(vec3 p, vec3 f, float k, float along) { vec3 q = p * k; return q - f * dot(q, f) * (1.0 - along); }
float ss(float a, float b, float x) { return smoothstep(a, b, x); }

// ---------------------------------------------------------------- coat zones (bind-pose position p, normal n)
vec3 bodyCoat(vec3 p, vec3 n, float cl, out float agouti) {
  float bel = ss(-0.2, -0.62, n.y);
  float pn = vnoise(p * 17.0 + 3.1), pn2 = vnoise(p * 41.0 + 7.7);
  // base: warm grey-brown, warmer + lighter on the lower flanks and shoulders
  vec3 c = mix(vec3(0.47, 0.41, 0.34), vec3(0.63, 0.52, 0.39), ss(0.5, 0.3, p.y) * 0.65 + pn * 0.35);
  c = mix(c, cGin * 0.9, ss(0.44, 0.32, p.y) * (1.0 - bel) * 0.45);
  // dark saddle withers -> croup with a ragged lower edge
  float sadE = 0.475 - 0.05 * pn - 0.03 * pn2;
  float sad = ss(sadE - 0.03, sadE + 0.025, p.y) * ss(-0.3, 0.4, n.y) * (1.0 - ss(0.17, 0.3, p.z)) * ss(-0.37, -0.3, p.z);
  c = mix(c, mix(cSad, vec3(0.33, 0.31, 0.29), cl * 0.8), clamp(sad, 0.0, 0.95));
  agouti = 0.45 + 0.45 * sad;
  // legs: ginger-tan outsides below the elbow/stifle
  float leg = ss(0.31, 0.24, p.y);
  c = mix(c, mix(cGinD, cGin, 0.45 + 0.55 * cl), leg * 0.88);
  // cream: belly, inner legs, chest bib, backs of the forelegs, breeches, white feet
  float inner = ss(0.1, 0.6, -n.x * sign(p.x + 1e-5)) * ss(0.42, 0.3, p.y);
  float bib = ss(0.15, 0.24, p.z) * ss(-0.15, 0.4, n.z) * ss(0.09, 0.05, abs(p.x)) * ss(0.6, 0.5, p.y);
  float backF = ss(-0.1, -0.6, n.z) * step(0.0, p.z) * leg;
  float pants = ss(-0.1, -0.6, n.z) * step(p.z, -0.17) * ss(0.12, 0.22, p.y) * ss(0.48, 0.4, p.y);
  float sock = ss(0.18, 0.12, p.y + 0.025 * pn);
  float cr = max(max(bel, inner), max(bib, max(backF * 0.85, max(pants * 0.9, sock))));
  c = mix(c, mix(cBuff, cCream, 0.55 + 0.45 * cl), cr);
  agouti *= 1.0 - cr;
  return c;
}
vec3 headCoat(vec3 q, vec3 n, float cl, out float agouti) {
  // concept sheet: grey-brown mottled crown with a dark centre stripe, cream brows, warm grey forehead plane,
  // tan under the eyes, dark-grey mask patch behind the eyes, cream cheeks + muzzle sides, grey-tan bridge
  vec3 qm = vec3(abs(q.x), q.y, q.z), nm = vec3(abs(n.x), n.y, n.z);
  float bl = vnoise(q * 38.0 + 11.0) * 0.65 + vnoise(q * 90.0 + 5.0) * 0.35;          // painterly blotches
  vec3 c = mix(vec3(0.5, 0.47, 0.41), vec3(0.63, 0.58, 0.5), 0.25 + 0.55 * cl);
  c = mix(c, vec3(0.29, 0.27, 0.25), ss(0.55, 0.75, bl) * 0.7 * ss(0.05, 0.085, q.y + 0.03 * (1.0 - ss(0.04, 0.08, q.z))) * (1.0 - 0.85 * ss(0.055, 0.08, q.z) * ss(0.11, 0.075, q.y)));   // dark grey mottling (upper head)
  agouti = 0.45;
  c = mix(c, vec3(0.3, 0.28, 0.25), ss(0.07, 0.12, q.y) * 0.35);                       // darker crown
  float stripe = ss(0.016, 0.005, qm.x + 0.004 * bl) * ss(0.07, 0.095, q.y) * ss(0.112, 0.085, q.z);
  c = mix(c, vec3(0.24, 0.22, 0.2), stripe * 0.8);                                      // centre stripe
  float fore = ss(0.2, 0.7, n.z) * ss(0.06, 0.09, q.z) * ss(0.015, 0.035, q.y) * (1.0 - stripe * 0.7);
  c = mix(c, vec3(0.71, 0.62, 0.51), fore * 0.8);                                      // warm grey forehead plane
  // cheeks: cream-tan below the eye line, lighter towards the jaw; ruff ginger-cream
  float cheek = ss(0.035, 0.0, q.y) * ss(-0.06, 0.0, q.z) * ss(0.2, 0.6, nm.x + 0.4 * n.z);
  c = mix(c, mix(vec3(0.78, 0.66, 0.52), vec3(0.88, 0.81, 0.7), ss(0.0, -0.05, q.y)), cheek * 0.92);
  float ruff = ss(0.02, -0.03, q.z) * ss(0.4, 0.9, nm.x) * ss(0.02, -0.04, q.y);
  c = mix(c, mix(cGin, cBuff, 0.5), ruff * 0.5);
  // dark grey mask patch behind/outside the eye
  vec3 de = qm - EYE;
  float mask = (1.0 - ss(0.35, 1.0, length((de - vec3(0.036, -0.01, -0.03)) / vec3(0.028, 0.03, 0.036)) - 0.45 * bl)) * ss(0.25, 0.55, bl);
  c = mix(c, vec3(0.31, 0.3, 0.29), mask * 0.7);
  // muzzle: cream sides, white at the lips, grey-tan bridge
  float muz = ss(0.1, 0.122, q.z) * ss(0.045, 0.025, q.y);
  float top = ss(0.3, 0.7, n.y);
  vec3 side = mix(vec3(0.8, 0.73, 0.63), vec3(0.88, 0.85, 0.8), ss(-0.01, -0.03, q.y));
  c = mix(c, side, muz * (1.0 - top));
  c = mix(c, mix(vec3(0.62, 0.56, 0.5), vec3(0.72, 0.66, 0.6), ss(0.13, 0.17, q.z)), muz * top);
  float lowF = ss(-0.03, -0.045, q.y) * ss(0.06, 0.1, q.z);
  c = mix(c, vec3(0.86, 0.83, 0.78), lowF * 0.8);                                       // white upper-lip flews
  c = mix(c, cCream, ss(-0.25, -0.6, n.y) * ss(0.12, 0.0, q.z) * 0.9);                 // throat
  agouti *= 1.0 - max(muz, cheek * 0.6);
  // eyes: cream "brows" above the inner corner, tan patch below, thin dark rim
  // light warm tan all around the eye (concept: the eyes sit in a soft light face, no dark brow shadow)
  float peri = (1.0 - ss(0.5, 1.0, length((de - vec3(-0.004, 0.008, 0.002)) / vec3(0.03, 0.026, 0.03)) - 0.2 * bl)) * ss(0.2, 0.5, n.z + 0.3);
  c = mix(c, vec3(0.7, 0.6, 0.49), peri * 0.75);
  agouti *= 1.0 - peri * 0.8;
  vec2 bv = qm.xy - vec2(0.039, 0.064);
  float brow = (1.0 - ss(0.35, 1.0, length(vec2(dot(bv, vec2(0.95, -0.31)), dot(bv, vec2(0.31, 0.95))) / vec2(0.0175, 0.0125)) - 0.15 * bl)) * ss(0.07, 0.09, q.z) * ss(0.0, 0.4, n.z + n.y);
  c = mix(c, vec3(0.87, 0.8, 0.69), brow);
  float under = 1.0 - ss(0.4, 1.0, length((de - vec3(-0.002, -0.02, 0.004)) / vec3(0.022, 0.012, 0.02)));
  c = mix(c, vec3(0.64, 0.5, 0.37), under * 0.7);
  float k = length((EYEM * de) / EYER);
  float rim = ss(1.16, 1.0, k);
  c = mix(c, vec3(0.09, 0.08, 0.075), rim);
  agouti *= 1.0 - max(max(brow, rim), under);
  // soft 'smile': the lip line curls up behind the mouth corner
  float tS = clamp((0.062 - q.z) / 0.017, 0.0, 1.0);
  float yS = -0.0595 + 0.0135 * tS * tS;
  float smile = ss(0.0036 - 0.0016 * tS, 0.0008, abs(q.y - yS)) * ss(0.072, 0.064, q.z) * ss(0.04, 0.047, q.z) * ss(0.55, 0.8, nm.x);
  c = mix(c, vec3(0.08, 0.07, 0.065), smile * 0.92);
  agouti *= 1.0 - smile;
  // nose leather
  float kn = length((q - NOSE) / (NOSER * 1.06));
  float nose = ss(1.05, 0.92, kn);
  vec3 nc = cNose + vec3(0.02) * ss(0.2, 0.9, n.y);
  c = mix(c, nc, nose);
  // black lips + mouth inside
  float lip = vAux.w < 0.55 ? vAux.w * 2.0 : 0.0, inM = ss(0.6, 0.9, vAux.w);
  c = mix(c, vec3(0.07, 0.06, 0.06), ss(0.25, 0.75, lip));
  c = mix(c, mix(cMouth, vec3(0.1, 0.06, 0.06), ss(0.02, 0.035, qm.x)), inM);
  agouti *= 1.0 - max(nose, lip);
  return c;
}
vec3 lightAt(vec3 N, vec3 P, float wrap) {
  vec3 L = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5);
  L += uSunCol * max((dot(N, uSunDir) + wrap) / (1.0 + wrap), 0.0) * gShS;
  for (int i = 0; i < NPT; i++) {
    vec3 d = uPtPos[i] - P; float dist = max(length(d), 1e-4);
    float att = clamp(1.0 - dist / max(uPtRange[i], 1e-3), 0.0, 1.0); att *= att;
    L += uPtCol[i] * att * (0.2 + 0.8 * max((dot(N, d / dist) + wrap) / (1.0 + wrap), 0.0)) * (i == 0 ? mix(0.1, 1.0, gShP) : 1.0);
  }
  return L;
}
float specAt(vec3 N, vec3 P, float pw) {
  vec3 V = normalize(cameraPosition - P);
  float s = pow(max(dot(N, normalize(uSunDir + V)), 0.0), pw) * dot(uSunCol, vec3(0.33));
  for (int i = 0; i < NPT; i++) {
    vec3 d = uPtPos[i] - P; float dist = max(length(d), 1e-4);
    float att = clamp(1.0 - dist / max(uPtRange[i], 1e-3), 0.0, 1.0); att *= att;
    s += pow(max(dot(N, normalize(d / dist + V)), 0.0), pw) * att * dot(uPtCol[i], vec3(0.33));
  }
  return s;
}

void main() {
  vec3 p = vRest, n = normalize(vRestN), N = normalize(vWN);
  if (!gl_FrontFacing) N = -N;
  vec3 col; float spec = 0.0, ao = vAux.x, wrap = 0.35;
#if defined(PART_FUR)
  vec3 f = normalize(vFlowR + vec3(1e-5));
  float cl = vnoise(strandSpace(p, f, 70.0, 0.35));
  float st = vnoise(strandSpace(p, f, 520.0, 0.12)) * 0.65 + vnoise(strandSpace(p, f, 1300.0, 0.1)) * 0.35;
  float agouti;
  vec3 q = p - HEADP;
  float hw = ss(-0.07, -0.035, q.z) * ss(0.5, 0.56, p.y);
  #ifdef PART_JAW
    vec3 cj = mix(mix(vec3(0.62, 0.59, 0.55), vec3(0.84, 0.8, 0.74), max(ss(0.3, 0.7, abs(n.x)), ss(0.4, 0.9, n.z)) * ss(-0.6, 0.0, n.y)), cBuff, 0.15 * cl); agouti = 0.1;
    // closed mouth reads as one clean black lip line: upper side of the jaw = black lip, top = mouth floor
    float fr = ss(0.05, 0.075, q.z);
    float topj = ss(0.5, 0.72, n.y) * fr;
    float lipj = ss(0.2, 0.4, n.y) * fr * (1.0 - topj);
    cj = mix(cj, vec3(0.07, 0.06, 0.06), lipj);
    cj = mix(cj, mix(vec3(0.3, 0.1, 0.1), cTongue, ss(0.014, 0.006, abs(q.x))), topj);
    col = cj;
  #elif defined(PART_TAIL)
    float outer = ss(-0.25, 0.45, dot(n, normalize(p - TAILC)));
    float topT = ss(0.0, 0.8, n.y) * outer;
    col = mix(mix(cBuff, cCream, 0.45 + 0.35 * cl), mix(cAshL, cAsh, 0.3 + 0.4 * cl), topT * 0.85);
    col = mix(col, mix(cGinD, cAsh, 0.5), (1.0 - outer) * 0.55);
    agouti = 0.1 + 0.55 * topT;
  #elif defined(PART_EAR)
    float hE = vAux.z, uE = vAux.y * 2.0 - 1.0, edge = ss(0.62, 0.95, abs(uE) + hE * 0.25);
    float hairI = vnoise(vec3(uE * 9.0, hE * 30.0, 3.0)) * 0.6 + vnoise(vec3(uE * 22.0, hE * 70.0, 7.0)) * 0.4;
    if (vAux.w > 0.5) {
      vec3 hollow = mix(vec3(0.2, 0.15, 0.13), vec3(0.4, 0.32, 0.26), ss(0.35, 1.0, hE));
      float tuft = ss(0.2, 0.7, abs(uE)) * ss(0.98, 0.2, hE) + ss(0.3, 0.0, hE) * 0.9;
      col = mix(hollow, mix(cBuff, cCream, hairI), clamp(tuft * (0.55 + 0.6 * hairI), 0.0, 1.0));
      col = mix(col, vec3(0.5, 0.39, 0.29), edge * 0.85); agouti = 0.0; st = hairI;
    } else {
      col = mix(vec3(0.58, 0.46, 0.34), vec3(0.4, 0.33, 0.27), ss(0.2, 0.9, hE));
      col = mix(col, vec3(0.25, 0.21, 0.18), edge * 0.6); agouti = 0.35;
    }
  #else
    float ab, ah;
    vec3 cb = bodyCoat(p, n, cl, ab), ch = headCoat(q, n, cl, ah);
    col = mix(cb, ch, hw); agouti = mix(ab, ah, hw);
    // sculpted ears (concept): tan-brown backs with darker tips + rims, dark hollow with cream tufts
    {
      float sx = p.x < 0.0 ? -1.0 : 1.0;
      vec3 pe = EARM * (vec3(p.x * sx, p.y, p.z) - EARO), ne = EARM * vec3(n.x * sx, n.y, n.z);
      float hE = clamp((pe.y - EARA.x) / (EARA.y - EARA.x), 0.0, 1.0), rad = mix(EARA.z, EARA.w, hE);
      float radial = length(vec2(pe.x, pe.z / EARC.x)) / rad;
      float earM = ss(0.014, 0.034, pe.y) * ss(1.6, 1.15, radial);
      if (earM > 0.0) {
        float hH = clamp((pe.y - EARB.x) / (EARB.y - EARB.x), 0.0, 1.0), hr = mix(EARB.z, EARB.w, hH), hB = clamp((pe.y - EARB.x + EARB.z) / (EARB.y - EARB.x + EARB.z), 0.0, 1.0);
        float rin = length(vec2(pe.x, (pe.z - EARC.y) / EARC.z)) / hr;
        float inner = ss(1.3, 1.0, rin) * ss(-0.1, 0.35, ne.z) * ss(EARB.x - EARB.z - 0.004, EARB.x - EARB.z + 0.01, pe.y);
        float hairI = vnoise(vec3(pe.x * 320.0, pe.y * 110.0, 3.0)) * 0.6 + vnoise(vec3(pe.x * 800.0, pe.y * 260.0, 7.0)) * 0.4;
        vec3 outer = mix(vec3(0.62, 0.5, 0.37), vec3(0.47, 0.38, 0.29), ss(0.25, 0.85, hE));
        outer = mix(outer, vec3(0.27, 0.22, 0.18), ss(0.78, 1.0, hE) * 0.7);                      // dark tip
        outer = mix(outer, vec3(0.36, 0.29, 0.23), ss(0.55, 0.95, abs(pe.x) / rad) * ss(0.0, 0.5, ne.z + 0.3) * 0.6); // rims
        vec3 hollow = mix(vec3(0.17, 0.125, 0.105), vec3(0.34, 0.26, 0.2), ss(0.45, 1.0, hB));
        float tuft = ss(0.35, 0.85, abs(pe.x) / hr) * ss(0.95, 0.15, hB) + ss(0.22, 0.0, hB) * 0.6;
        vec3 inC = mix(hollow, mix(cBuff, cCream, hairI), clamp(tuft * (0.5 + 0.65 * hairI), 0.0, 1.0));
        vec3 ec = mix(outer, inC, inner);
        col = mix(col, ec, earM); agouti = mix(agouti, 0.3 * (1.0 - inner), earM);
        st = mix(st, mix(st, hairI, 0.6), earM * inner);
      }
    }
  #endif
  // strands: dark guard-hair tips on agouti fur, light/dark streaks everywhere
  float tipd = ss(0.5, 0.85, st), streak = ss(0.55, 0.85, vnoise(strandSpace(p, f, 150.0, 0.2)));
  col = mix(col, cTip, clamp(tipd * (0.55 + 0.45 * uShell) + streak * 0.7, 0.0, 1.0) * agouti);
  col *= 0.86 + 0.28 * st;
  #ifdef SHELL
    float hair = st * 0.75 + cl * 0.35;
    if (vAux.y < 0.04 || hair < 0.42 + uShell * 0.48) discard;
    ao = mix(ao, 1.0, uShell * 0.7);
    col *= mix(0.78, 1.04, uShell);
  #else
    col *= mix(1.0, 0.78, ss(0.1, 0.6, vAux.y));
  #endif
  #if !defined(PART_JAW) && !defined(PART_TAIL) && !defined(PART_EAR)
    vec3 qn = q - NOSE;
    float noseK = length(qn / (NOSER * 1.06));
    float noseM = ss(1.05, 0.92, noseK) * hw;
    col = mix(col, cNose * (0.75 + 0.6 * ss(0.2, 0.9, n.y)), noseM * 0.85);   // clean wet black leather
    spec = ss(1.0, 0.85, noseK) * 0.8 * hw;
  #endif
  wrap = 0.45;
#elif defined(PART_EYE)
  vec3 e = vAux.xyz * 2.0 - 1.0;                       // eye-local unit sphere, z = gaze
  float r = length(e.xy);
  vec3 iris = mix(vec3(0.86, 0.56, 0.2), vec3(0.4, 0.2, 0.06), ss(0.3, 0.82, r));
  iris *= 0.85 + 0.3 * vnoise(vec3(atan(e.y, e.x) * 6.0, r * 8.0, 1.0));
  col = mix(iris, vec3(0.035, 0.025, 0.02), ss(0.33, 0.29, r));        // pupil
  col = mix(col, vec3(0.05, 0.035, 0.03), ss(0.8, 0.88, r));         // limbal ring / dark sclera
  float glint = ss(0.982, 0.993, dot(normalize(e), normalize(vec3(-0.32, 0.42, 0.85))));
  float glint2 = ss(0.985, 0.995, dot(normalize(e), normalize(vec3(0.22, -0.18, 0.96))));
  spec = 1.6;
  float lidY = mix(0.58, -0.75, uLid) - 0.12 * e.x * e.x - 0.09 * e.x;
  float lowY = mix(-0.7, -0.62, uLid);
  float lid = max(ss(lidY - 0.04, lidY + 0.04, e.y), ss(lowY + 0.04, lowY - 0.04, e.y));
  col = mix(col, vec3(0.97), max(glint, glint2 * 0.7) * (1.0 - lid));
  vec3 lidc = mix(vec3(0.55, 0.47, 0.38), vec3(0.08, 0.07, 0.065), max(ss(lidY + 0.1, lidY + 0.015, e.y), ss(lowY - 0.08, lowY - 0.01, e.y)));
  col = mix(col, lidc, lid);
  spec *= 1.0 - lid; ao = 1.0; wrap = 0.1;
#elif defined(PART_LEATHER)
  float u = vAux.x, w = vAux.y;
  float g = vnoise(vec3(u * 90.0, w * 6.0, 1.0));
  col = cLeather * (0.8 + 0.35 * g);
  col *= mix(0.6, 1.0, ss(0.0, 0.18, w) * ss(1.0, 0.82, w));
  float stitch = step(0.5, fract(u * 64.0)) * (ss(0.18, 0.22, w) * ss(0.3, 0.26, w) + ss(0.7, 0.74, w) * ss(0.82, 0.78, w));
  col = mix(col, vec3(0.66, 0.55, 0.42), stitch * 0.8);
  spec = 0.18; ao = 1.0; wrap = 0.2;
#elif defined(PART_IRON)
  col = vec3(0.3, 0.3, 0.31); spec = 0.9; ao = 1.0; wrap = 0.1;
#elif defined(PART_TONGUE)
  col = mix(cTongue, vec3(0.58, 0.26, 0.27), ss(0.004, 0.0, abs(p.x))); spec = 0.5; ao = 1.0; wrap = 0.3;
#endif
  if (uEnh > 0.5) {
    vec3 gN = normalize(vWN);
    gShS = sunShadow(vWP, gN);
    gShP = dot(uPtCol[0], vec3(1.0)) > 0.0 ? spotShadow(vWP, gN) : 1.0;
  }
  vec3 c = col * lightAt(N, vWP, wrap) * mix(0.42, 1.0, ao) * uTint;
  c += spec * specAt(N, vWP, 48.0) * vec3(0.9, 0.92, 1.0) * min(gShS, mix(1.0, gShP, 0.9));
  c = mix(c, uFogCol, uEnh > 0.5 ? fogE(distance(cameraPosition, vWP), uFogNear, uFogFar) * uFogAmt : vFog);
  if (uEnh > 0.5) c += inScatter(vWP);
  gl_FragColor = vec4(c, 1.0);
}`;
const PART_DEF = { body: 'PART_FUR', jaw: 'PART_FUR PART_JAW', tail: 'PART_FUR PART_TAIL', earL: 'PART_FUR PART_EAR', earR: 'PART_FUR PART_EAR', eyeL: 'PART_EYE', eyeR: 'PART_EYE', collar: 'PART_LEATHER', ring: 'PART_IRON', tongue: 'PART_TONGUE' };
const FUR_PARTS = { body: 1, tail: 1, jaw: 1 };
function dogMaterial(part, shell = 0, wire = false) {
  const defines = {};
  for (const d of PART_DEF[part].split(' ')) defines[d] = 1;
  if (shell > 0) defines.SHELL = 1;
  defines.ENH_CHEAP = 1;
  const m = new THREE.ShaderMaterial({
    uniforms: { ...LIGHTS, uFogAmt: { value: 1 }, uShell: { value: shell }, uLid: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: VERT,
    fragmentShader: wire ? FRAG.replace(/void main\(\) \{[\s\S]*$/, 'void main() { gl_FragColor = vec4(uTint, 1.0); }') : FRAG,
    defines,
    side: part === 'earL' || part === 'earR' || part === 'tongue' ? THREE.DoubleSide : THREE.FrontSide,
    wireframe: wire,
  });
  return m;
}

/* ================================================================ assembly */
export function makeDog({ shells = DOG_SHELLS } = {}) {
  const G = geometries();
  const group = new THREE.Group(); group.name = 'dog';
  const root = new THREE.Group(); group.add(root); // animation space (origin on the ground)
  const rig = buildRig();
  root.add(rig.root);
  const skeleton = new THREE.Skeleton(DOG_BONES.map((n) => rig.bones[n]));
  const I4 = new THREE.Matrix4();
  const meshes = [], shellMeshes = [], wires = [], lidMats = [], counts = {};
  let tris = 0;
  const add = (name, mat, list, order = 0) => {
    const m = new THREE.SkinnedMesh(G[name].geo, mat);
    m.name = 'dog-' + name; m.frustumCulled = false; m.renderOrder = order;
    m.bind(skeleton, I4);
    root.add(m); list.push(m);
    return m;
  };
  for (const name of Object.keys(G)) {
    const mat = dogMaterial(name);
    const m = add(name, mat, meshes);
    if (name === 'eyeL' || name === 'eyeR') lidMats.push(mat);
    if (name === 'tongue') m.userData.tongue = true;
    tris += G[name].tris;
    const k = name.startsWith('ear') ? 'ears' : name.startsWith('eye') ? 'eyes' : name === 'ring' ? 'collar' : name;
    counts[k] = (counts[k] || 0) + G[name].tris;
  }
  const tongue = meshes.find((m) => m.userData.tongue);
  function buildShells(n) {
    for (const s of shellMeshes) { root.remove(s); s.material.dispose(); }
    shellMeshes.length = 0;
    for (let i = 1; i <= n; i++) for (const name of Object.keys(FUR_PARTS)) {
      const s = add(name, dogMaterial(name, i / n), shellMeshes, i);
      if (name === 'jaw') s.userData.jaw = true;
    }
  }
  buildShells(shells);

  /* labels (skeleton view) */
  const B = rig.bones;
  const parts = {
    head: { group: B.head, hw: 0.075, label: 'Голова', at: v3(0, 0.03, 0.06) },
    collar: { group: B.neck, hw: 0.1, label: 'Ошейник', at: v3(0, 0.05, 0) },
    chest: { group: B.chest, hw: 0.11, label: 'Грудь и лопатки', at: v3(0, 0.0, 0.2) },
    hips: { group: B.hips, hw: 0.1, label: 'Круп', at: v3(0, 0.02, -0.04) },
    legF: { group: B.FL2, hw: 0.035, label: 'Передние лапы', at: v3(0, -0.1, 0) },
    legH: { group: B.HL2, hw: 0.035, label: 'Задние лапы', at: v3(0, -0.08, 0) },
    tail: { group: B.tail3, hw: 0.06, label: 'Хвост', at: v3(0, 0.02, 0) },
  };

  /* skeleton overlay */
  const pairs = rig.list.filter((b) => b.parent && b.parent.isBone && b.parent !== rig.root && b.name !== 'ribs').map((b) => [b.parent, b]);
  const skelGeo = new THREE.BufferGeometry();
  skelGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pairs.length * 6), 3));
  const skelMat = ps1Material({ line: true, tint: [1.0, 0.82, 0.35], vertexColors: false, fog: 0 });
  skelMat.depthTest = false;
  const skelLines = new THREE.LineSegments(skelGeo, skelMat);
  skelLines.visible = false; skelLines.frustumCulled = false; skelLines.renderOrder = 50;
  root.add(skelLines);
  const _a = new V3(), _b = new V3(), _Mi = new THREE.Matrix4();
  function syncSkeleton() {
    root.updateMatrixWorld(true);
    _Mi.copy(root.matrixWorld).invert();
    const arr = skelGeo.attributes.position.array;
    pairs.forEach(([a, b], i) => { a.getWorldPosition(_a).applyMatrix4(_Mi); b.getWorldPosition(_b).applyMatrix4(_Mi); _a.toArray(arr, i * 6); _b.toArray(arr, i * 6 + 3); });
    skelGeo.attributes.position.needsUpdate = true;
  }

  /* pose + animation */
  let skel = 0, wireOn = false;
  function applyPose(P) {
    rig.applyPose(P);
    for (const m of lidMats) m.uniforms.uLid.value = P.lid;
    tongue.visible = P.tongue > 0.5 && !skel;
    if (skel) syncSkeleton();
  }
  const A = makeAnimator(applyPose);
  A.update(0);

  function setExplode(e) { skel = e > 0.5 ? 1 : 0; skelLines.visible = !!skel; refresh(); if (skel) syncSkeleton(); }
  function addWire(wmat) {
    for (const name of ['body', 'jaw', 'tail', 'eyeL', 'eyeR', 'collar']) {
      const mat = dogMaterial(name, 0, true);
      mat.uniforms.uTint.value.setRGB(...(wmat && wmat.uniforms && wmat.uniforms.uTint ? wmat.uniforms.uTint.value.toArray() : [0.62, 0.86, 1.0]));
      add(name, mat, wires, 40);
    }
    refresh();
  }
  function refresh() {
    // normal: solid + fur shells · wire: solid + wire overlay · skeleton: wire + bones only
    const show = !!(wireOn || skel);
    for (const w of wires) w.visible = show;
    for (const s of shellMeshes) s.visible = !show;
    for (const m of meshes) m.visible = !skel;
    tongue.visible = (A.st.pose ? A.st.pose.tongue > 0.5 : false) && !skel;
  }
  function setWire(on) { wireOn = on; refresh(); }
  function setShells(n) { buildShells(n); refresh(); }
  const HEAD_TOP = v3(0, 0.09, 0.03);
  function headTop(out = new V3()) { B.head.updateWorldMatrix(true, false); return B.head.localToWorld(out.copy(HEAD_TOP)); }
  function headQuat(out = new THREE.Quaternion()) { B.head.updateWorldMatrix(true, false); return B.head.getWorldQuaternion(out); }

  return {
    group, root, rig, bones: B, segs: B, legs: rig.legs, parts, meshes, tris, counts, skeleton,
    setAnim: A.setAnim, update: A.update, applyPose, setExplode, addWire, setWire, setShells, headTop, headQuat, state: A.st,
    shells: () => shellMeshes.length / Object.keys(FUR_PARTS).length,
  };
}
