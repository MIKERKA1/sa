// PS1-style rendering: vertex snapping, affine texture warp, per-vertex lighting, per-vertex fog,
// low-res render target + nearest upscale with 15-bit ordered dithering, optional VHS + tape OSD.
// "Enhanced" graphics (GFX.enh): same materials switch to per-pixel light, sun + lantern shadow maps, soft exp fog,
// snow glints, high-res filtered textures; 720-line HDR target with MSAA, bloom, cold grade, vignette, grain, light dither.
import * as THREE from 'three';
import { WHITE_TEX, hiOf } from './util.js';

export const GFX = { enh: true };

export const LIGHTS = {
  uSnap: { value: new THREE.Vector2(160, 120) },
  uSnapOn: { value: 1 },
  uAffine: { value: 0.85 },
  uSkyAmb: { value: new THREE.Color(0.55, 0.55, 0.6) },
  uGroundAmb: { value: new THREE.Color(0.3, 0.28, 0.27) },
  uSunDir: { value: new THREE.Vector3(0.35, 0.75, 0.55).normalize() },
  uSunCol: { value: new THREE.Color(0.6, 0.58, 0.55) },
  // 4 point lights: 0 = the player's lantern, 1..3 = scene lights (lit window, room lamps, stove glow)
  uPtPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uPtCol: { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] },
  uPtRange: { value: [1, 1, 1, 1] },
  // per-light xz clip box (x0, z0, x1, z1): room lights stop at their walls; in-scatter weight per light
  uPtBox: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(-1e4, -1e4, 1e4, 1e4)) },
  uPtScat: { value: [1, 0.7, 0.7, 0.7] },
  uFogCol: { value: new THREE.Color(0.5, 0.5, 0.5) },
  uFogNear: { value: 1000 },
  uFogFar: { value: 2000 },
  // enhanced
  uEnh: { value: 0 },
  uShTex: { value: null }, uShMat: { value: new THREE.Matrix4() }, uShOn: { value: 0 }, uShTx: { value: 1 / 2048 },
  uSpTex: { value: null }, uSpMat: { value: new THREE.Matrix4() }, uSpOn: { value: 0 }, uSpTx: { value: 1 / 1024 }, uSpNF: { value: new THREE.Vector2(0.08, 14) },
  uPxK: { value: 600 },
  uScat: { value: 0 },
  // snow lying on upward faces of outdoor materials (SNOWCOVER): global amount, xz boxes (x0, z0, x1, z1) below a height stay bare
  uSnowCov: { value: 0 },
  uNoSnow: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(1e4, 1e4, 1e4, 1e4)) },
  uNoSnowY: { value: [0, 0, 0, 0, 0, 0] },
};

// Shared GLSL for the enhanced path (needs uSunDir declared before it): shadow lookups + soft fog + hash.
export const ENH_GLSL = /* glsl */ `
uniform float uEnh;
uniform sampler2D uShTex; uniform mat4 uShMat; uniform float uShOn; uniform float uShTx;
uniform sampler2D uSpTex; uniform mat4 uSpMat; uniform float uSpOn; uniform float uSpTx; uniform vec2 uSpNF;
float eHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float eNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(eHash(i), eHash(i + vec2(1.0, 0.0)), f.x), mix(eHash(i + vec2(0.0, 1.0)), eHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float shTap(sampler2D t, vec2 uv, float z, float persp) {
  // Depth maps have one level: explicit LOD avoids undefined implicit derivatives inside PCF/light branches.
  // https://registry.khronos.org/OpenGL-Refpages/es3.0/html/textureLod.xhtml
  float d = textureLod(t, uv, 0.0).r;
  if (persp > 0.5) d = uSpNF.x * uSpNF.y / (uSpNF.y - d * (uSpNF.y - uSpNF.x));
  return z <= d ? 1.0 : 0.0;
}
// 3x3 bilinear-weighted PCF (16 taps) or 2x2 bilinear (4 taps) for the cheap variant
float shPCF(sampler2D t, vec2 uv, float z, float tx, float persp) {
  vec2 g = uv / tx - 0.5; vec2 f = fract(g); vec2 b = (floor(g) + 0.5) * tx;
  float s = 0.0;
#ifdef ENH_CHEAP
  s = mix(mix(shTap(t, b, z, persp), shTap(t, b + vec2(tx, 0.0), z, persp), f.x),
          mix(shTap(t, b + vec2(0.0, tx), z, persp), shTap(t, b + vec2(tx, tx), z, persp), f.x), f.y);
  return s;
#else
  for (int j = 0; j < 4; j++) { float wy = j == 0 ? 1.0 - f.y : (j == 3 ? f.y : 1.0);
    for (int i = 0; i < 4; i++) { float wx = i == 0 ? 1.0 - f.x : (i == 3 ? f.x : 1.0);
      s += wx * wy * shTap(t, b + vec2(float(i) - 1.0, float(j) - 1.0) * tx, z, persp); } }
  return s / 9.0;
#endif
}
float sunShadow(vec3 P, vec3 N) {
  if (uShOn < 0.5) return 1.0;
  float nl = dot(N, uSunDir);
  vec4 q = uShMat * vec4(P + N * (0.02 + 0.03 * (1.0 - abs(nl))), 1.0);
  vec3 s = q.xyz / q.w;
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  float sh = shPCF(uShTex, s.xy, s.z - 0.00035, uShTx, 0.0);
  vec2 e = min(s.xy, 1.0 - s.xy);
  return mix(1.0, sh, smoothstep(0.0, 0.08, min(e.x, e.y)));
}
float spotShadow(vec3 P, vec3 N) {
  if (uSpOn < 0.5) return 1.0;
  vec4 q0 = uSpMat * vec4(P, 1.0);
  float k = 0.012 + 0.012 * max(q0.w, 0.0);
  vec4 q = uSpMat * vec4(P + N * k, 1.0);
  if (q.w <= 0.0) return 1.0;
  vec3 s = q.xyz / q.w;
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0) return 1.0;
  float sh = shPCF(uSpTex, s.xy, q.w - 0.015 - q.w * 0.01, uSpTx, 1.0);
  vec2 e = min(s.xy, 1.0 - s.xy);
  return mix(1.0, sh, smoothstep(0.0, 0.06, min(e.x, e.y)));
}
// light scattered by the snowy air around the lantern / lit window: closed-form integral of 1/r^2 along the view ray
uniform float uScat; uniform float uPtScat[NPT];
vec3 inScatter(vec3 P) {
  if (uScat <= 0.0) return vec3(0.0);
  vec3 D = P - cameraPosition; float T = length(D); D /= max(T, 1e-4);
  vec3 s = vec3(0.0);
  for (int i = 0; i < NPT; i++) {
    vec3 L = uPtPos[i] - cameraPosition; float t0 = dot(L, D);
    float h = sqrt(max(dot(L, L) - t0 * t0, 0.0)) + 0.12;
    s += uPtCol[i] * (atan((T - t0) / h) - atan(-t0 / h)) / h * uPtScat[i];
  }
  return s * uScat;
}
// soft exponential fog: starts gently before uFogNear, thickens towards uFogFar (never a hard wall)
float fogE(float d, float near, float far) {
  float t = max(d - near * 0.4, 0.0) / max(far - near * 0.4, 1e-3);
  return clamp(1.0 - exp(-3.4 * t * t - 0.55 * t), 0.0, 1.0);
}
`;

const VERT = /* glsl */ `
#define NPT 4
uniform vec2 uSnap; uniform float uSnapOn;
uniform vec3 uSkyAmb; uniform vec3 uGroundAmb; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec3 uPtPos[NPT]; uniform vec3 uPtCol[NPT]; uniform float uPtRange[NPT]; uniform vec4 uPtBox[NPT];
uniform float uFogNear; uniform float uFogFar; uniform float uFogAmt;
uniform vec3 uEmissive; uniform float uLit; uniform vec3 uTint; uniform float uAmb; uniform float uSunK;
float boxK(vec4 b, vec2 p) { return step(b.x, p.x) * step(p.x, b.z) * step(b.y, p.y) * step(p.y, b.w); }
varying vec3 vLight; varying vec3 vUvW; varying vec2 vUv; varying float vFog;
varying vec3 vWP; varying vec3 vWN; varying vec3 vCol;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
#ifdef USE_COLOR
  vCol = color;
#else
  vCol = vec3(1.0);
#endif
#ifdef LINE
  vec3 L = uTint;
  vWN = vec3(0.0, 1.0, 0.0);
#else
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  vWN = wn;
  vec3 L = mix(uGroundAmb, uSkyAmb, wn.y * 0.5 + 0.5) * uAmb;
  L += uSunCol * max(dot(wn, uSunDir), 0.0) * uSunK;
  for (int i = 0; i < NPT; i++) {
    vec3 d = uPtPos[i] - wp.xyz;
    float dist = max(length(d), 1e-4);
    float att = clamp(1.0 - dist / max(uPtRange[i], 1e-3), 0.0, 1.0);
    att *= att * boxK(uPtBox[i], wp.xz);
    L += uPtCol[i] * att * (0.2 + 0.8 * max(dot(wn, d / dist), 0.0));
  }
  L = mix(vec3(1.0), L, uLit) * uTint + uEmissive;
#endif
#ifdef USE_COLOR
  L *= color;
#endif
  vLight = L;
  vec4 mv = viewMatrix * wp;
  vec4 clip = projectionMatrix * mv;
  if (uSnapOn > 0.5 && clip.w > 0.0) {
    clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
  }
#ifdef LINE
  clip.z -= 0.004 * clip.w;
#endif
  gl_Position = clip;
  vUv = uv;
  vUvW = vec3(uv * clip.w, clip.w);
  vFog = smoothstep(uFogNear, uFogFar, -mv.z) * uFogAmt;
}`;

const FRAG = /* glsl */ `
#define NPT 4
uniform sampler2D map; uniform float uAffine; uniform float uAffineK; uniform vec3 uFogCol; uniform float uAlphaCut; uniform float uOpacity;
uniform vec3 uSkyAmb; uniform vec3 uGroundAmb; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec3 uPtPos[NPT]; uniform vec3 uPtCol[NPT]; uniform float uPtRange[NPT]; uniform vec4 uPtBox[NPT];
uniform float uFogNear; uniform float uFogFar; uniform float uFogAmt;
uniform vec3 uEmissive; uniform float uLit; uniform vec3 uTint; uniform float uAO; uniform float uSparkle; uniform float uSkyFx; uniform float uAmb; uniform float uSunK;
float boxK(vec4 b, vec2 p) { return step(b.x, p.x) * step(p.x, b.z) * step(b.y, p.y) * step(p.y, b.w); }
varying vec3 vLight; varying vec3 vUvW; varying vec2 vUv; varying float vFog;
varying vec3 vWP; varying vec3 vWN; varying vec3 vCol;
${ENH_GLSL}
float gSnow = 1.0; // terrain: how much of this pixel is snow (glints only there)
float gTrail = 0.0; // terrain: how deep the snow is trampled here (0..1)
#ifdef TERRAIN
// ground of the farm: grass / mud base, patchy melting snow on top; mask (world rect) r = snow, g = mud, b = wet
uniform sampler2D map2; uniform sampler2D map3; uniform sampler2D uMask; uniform vec4 uMaskRect;
uniform sampler2D uTrail; uniform vec4 uTrailRect;
uniform sampler2D map4; uniform sampler2D nmap1; uniform sampler2D nmap2; uniform sampler2D nmap3; uniform sampler2D nmap4;
uniform vec4 uTerrS; uniform float uTerrN; // metres per tile: snow, mud, grass, litter; 1 = photo layers with normal maps
vec3 gTN = vec3(0.0, 0.0, 1.0); float gTGloss = 0.3; float gTSpec = 0.05;
// texture without visible repetition: two copies with hashed offsets, picked by a slow noise, blended (I. Quilez)
vec2 ntA, ntB; float ntF;
void ntSetup(vec2 p) {
  float k = eNoise(p * 0.13) * 0.62 + eNoise(p * 0.41 + 3.1) * 0.38, idx = k * 7.0, i = floor(idx);
  ntA = fract(sin(vec2(3.0, 7.0) * i) * 43.7); ntB = fract(sin(vec2(3.0, 7.0) * (i + 1.0)) * 43.7);
  ntF = smoothstep(0.25, 0.75, fract(idx));
}
vec4 ntex(sampler2D s, vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  return mix(textureGrad(s, uv + ntA, dx, dy), textureGrad(s, uv + ntB, dx, dy), ntF);
}
vec4 terrainEnh() {
  vec4 m = texture2D(uMask, clamp((vWP.xz - uMaskRect.xy) / uMaskRect.zw, 0.001, 0.999));
  vec2 p = vWP.xz;
  ntSetup(p);
  vec2 u1 = p / uTerrS.x, u2 = p / uTerrS.y, u3 = p / uTerrS.z, u4 = p / uTerrS.w;
  vec3 snow = ntex(map, u1).rgb, mud = ntex(map2, u2).rgb, grass = ntex(map3, u3).rgb, lit = ntex(map4, u4).rgb;
  float wm = smoothstep(0.25, 0.75, m.g + (eNoise(p * 0.9) - 0.5) * 0.35);
  float wl = smoothstep(0.2, 0.8, m.a + (eNoise(p * 0.7 + 2.0) - 0.5) * 0.4) * (1.0 - wm * 0.6) * uTerrN;
  vec3 base = mix(mix(grass, lit, wl), mud, wm);
  base *= 1.0 - m.b * 0.38;
  float n = eNoise(p * 0.55) * 0.55 + eNoise(p * 2.3 + 4.0) * 0.3 + eNoise(p * 9.0 + 1.0) * 0.15;
  float s = smoothstep(0.47, 0.53, m.r + (n - 0.5) * 0.55);
  gSnow = s;
  if (uTerrN > 0.5) {
    vec4 n1 = ntex(nmap1, u1), n2 = ntex(nmap2, u2), n3 = ntex(nmap3, u3), n4 = ntex(nmap4, u4);
    vec4 nb = mix(mix(n3, n4, wl), n2, wm);
    vec4 nn = mix(nb, n1, s);
    gTN = nn.xyz * 2.0 - 1.0; gTGloss = nn.a;
    gTGloss = mix(gTGloss, 0.75, m.b * (1.0 - s) * 0.8); // wet ground shines
    gTSpec = mix(mix(0.04, 0.12 + m.b * 0.25, wm), 0.08, s);
  }
  return vec4(mix(base, snow * mix(0.86, 1.0, s), s), 1.0);
}
vec4 baseTex(vec2 uv) {
  vec4 m = texture2D(uMask, clamp((vWP.xz - uMaskRect.xy) / uMaskRect.zw, 0.001, 0.999));
  vec3 grass = texture2D(map3, uv * 0.75).rgb, mud = texture2D(map2, uv).rgb;
  vec3 base = mix(grass, mud, smoothstep(0.25, 0.75, m.g + (eNoise(vWP.xz * 0.9) - 0.5) * 0.35));
  base *= 1.0 - m.b * 0.38;
  float n = eNoise(vWP.xz * 0.55) * 0.55 + eNoise(vWP.xz * 2.3 + 4.0) * 0.3 + eNoise(vWP.xz * 9.0 + 1.0) * 0.15;
  float s = smoothstep(0.47, 0.53, m.r + (n - 0.5) * 0.55);
  gSnow = s;
  vec3 snow = texture2D(map, uv).rgb * mix(0.86, 1.0, s);
  return vec4(mix(base, snow, s), 1.0);
}
#else
vec4 baseTex(vec2 uv) { return texture2D(map, uv); }
#endif
uniform float uBump;
uniform float uHiUV; uniform float uSpec; uniform float uGloss; uniform float uMetal; uniform float uNrm;
#ifdef NMAP
uniform sampler2D nmap;
#endif
// tangent frame from screen derivatives (no tangents in the merged geometry): perturb N by a tangent-space normal
vec3 perturb(vec3 N, vec2 uv, vec3 tn) {
  vec3 dp1 = dFdx(vWP), dp2 = dFdy(vWP); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
  vec3 T = dp2p * du1.x + dp1p * du2.x, B = dp2p * du1.y + dp1p * du2.y;
  float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-24));
  vec3 r = T * (im * tn.x) + B * (im * tn.y) + N * tn.z;
  return dot(r, r) > 1e-12 ? normalize(r) : N;
}
// Blinn-Phong lobe, normalised, Schlick fresnel towards grazing angles (only for glossy surfaces)
float specL(vec3 N, vec3 Ld, vec3 V, float pw, float f0, float g) {
  vec3 H = normalize(Ld + V);
  float nl = max(dot(N, Ld), 0.0);
  float fr = mix(f0, 1.0, pow(1.0 - max(dot(V, H), 0.0), 5.0) * g * g);
  return nl * pow(max(dot(N, H), 0.0), pw) * (pw + 8.0) * 0.0398 * fr;
}
#ifdef SNOWCOVER
uniform float uSnowCov; uniform float uSnowK; uniform vec4 uNoSnow[6]; uniform float uNoSnowY[6];
// fraction of snow on this pixel: upward faces, patchy noise, more on shaded north slopes, thawed strip above the eaves
float snowAmt(vec3 N) {
  float up = smoothstep(0.38, 0.72, N.y);
  if (up <= 0.0 || uSnowCov <= 0.0) return 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 b = uNoSnow[i];
    if (vWP.x > b.x && vWP.x < b.z && vWP.z > b.y && vWP.z < b.w && vWP.y < uNoSnowY[i]) return 0.0;
  }
  vec2 q = vWP.xz + vWP.y * vec2(0.37, -0.23);
  float n = eNoise(q * 0.33) * 0.55 + eNoise(q * 1.6 + 3.0) * 0.3 + eNoise(q * 7.0 + 9.0) * 0.15;
  float cov = uSnowCov * uSnowK + (N.z < -0.25 ? 0.2 : 0.0) - step(3.9, vWP.y) * smoothstep(4.75, 4.05, vWP.y) * 0.32;
  return up * smoothstep(0.47, 0.55, n + cov - 0.5);
}
vec3 snowOn(vec3 c, vec3 N) {
  float s = snowAmt(N);
  vec2 q = vWP.xz * 3.1 + vWP.y;
  vec3 sc = vec3(0.9, 0.93, 0.98) * (0.93 + 0.07 * eNoise(q)) / max(vCol, vec3(0.35)); // snow is not tinted by the vertex colour
  return mix(c, sc, s);
}
#endif
float snowH(vec2 q) { return eNoise(q * 0.42) * 0.16 + eNoise(q * 2.6 + 5.0) * 0.022 + eNoise(vec2(q.x * 6.0, q.y * 1.8) + 11.0) * 0.006; }
void main() {
  if (uEnh > 0.5) {
    vec2 uvE = vUv * uHiUV;
#ifdef TERRAIN
    vec4 tex = terrainEnh();
#else
    vec4 tex = baseTex(uvE);
#endif
    float gGloss = uGloss, gSpec = uSpec;
    if (tex.a < uAlphaCut) discard;
    float dist = distance(cameraPosition, vWP);
#ifdef LINE
    vec3 L = uTint;
#else
    vec3 N = normalize(vWN) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 Ng = N;
#ifdef SNOWCOVER
    float sAmt = snowAmt(N);
    tex.rgb = snowOn(tex.rgb, N);
#else
    float sAmt = 0.0;
#endif
#ifdef NMAP
    {
      vec4 nm = texture2D(nmap, uvE);
      vec3 tn = nm.xyz * 2.0 - 1.0;
      tn.xy *= uNrm * (1.0 - sAmt * 0.85);
      N = perturb(N, uvE, tn);
      gGloss = mix(nm.a, 0.45, sAmt);
    }
#elif defined(BUMP)
    { // relief from the texture's luminance (screen-space derivative bump, no tangents needed); fades out with distance
      float hb = dot(tex.rgb, vec3(0.3, 0.59, 0.11)) * uBump * (1.0 - sAmt * 0.8) * smoothstep(22.0, 5.0, dist);
      vec3 dpx = dFdx(vWP), dpy = dFdy(vWP);
      vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
      float det = dot(dpx, r1);
      vec3 gr = sign(det) * (dFdx(hb) * r1 + dFdy(hb) * r2);
      vec3 Nb = abs(det) * N - gr;
      if (dot(Nb, Nb) > 1e-12) N = normalize(mix(N, normalize(Nb), 0.85));
    }
#endif
    if (uSparkle > 0.0) { // wind-blown undulations + ripples catch the low sun
      vec2 q = vWP.xz + vWP.y * 0.7; float e = 0.04;
      float h0 = snowH(q), hx = snowH(q + vec2(e, 0.0)), hz = snowH(q + vec2(0.0, e));
      N = normalize(N + vec3(h0 - hx, 0.0, h0 - hz) / e * uSparkle * gSnow * smoothstep(40.0, 8.0, dist));
    }
#ifdef TERRAIN
    if (uTerrN > 0.5) { N = perturb(N, vWP.xz, vec3(gTN.xy * uNrm * (1.0 - gTrail * 0.7), gTN.z)); gGloss = gTGloss; gSpec = gTSpec; }
    { // trampled snow: the depth map bends the normals into the trench walls (lit rim on one side, shade on the other)
      vec2 tq = (vWP.xz - uTrailRect.xy) / uTrailRect.zw;
      if (tq.x > 0.002 && tq.x < 0.998 && tq.y > 0.002 && tq.y < 0.998) {
        float e = 1.0 / 1024.0, cell = uTrailRect.z * e;
        float d0 = texture2D(uTrail, tq).r, dx = texture2D(uTrail, tq + vec2(e, 0.0)).r, dz = texture2D(uTrail, tq + vec2(0.0, e)).r;
        gTrail = d0 * gSnow;
        N = normalize(N + vec3(dx - d0, 0.0, dz - d0) * (0.08 / cell) * gSnow * smoothstep(32.0, 6.0, dist));
      }
    }
#endif
    float shS = uLit > 0.0 && dot(Ng, uSunDir) > -0.05 ? sunShadow(vWP, Ng) : 1.0;
    vec3 E = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5) * uAmb;
    E += uSunCol * max(dot(N, uSunDir), 0.0) * shS * uSunK;
    float shP = uLit > 0.0 && dot(uPtCol[0], vec3(1.0)) > 0.0 ? spotShadow(vWP, Ng) : 1.0;
    vec3 glintL = vec3(0.0);
    vec3 V = normalize(cameraPosition - vWP);
    vec3 S = vec3(0.0);
    float gl = clamp(gGloss, 0.0, 1.0), pw = exp2(2.0 + 10.0 * gl), f0 = mix(gSpec, 0.6, uMetal);
    bool doSpec = gSpec > 0.0 && uLit > 0.0;
    if (doSpec) {
      S += uSunCol * uSunK * shS * specL(N, uSunDir, V, pw, f0, gl);
      vec3 R = reflect(-V, N);
      vec3 env = mix(uGroundAmb, uSkyAmb, smoothstep(-0.3, 0.5, R.y)) * uAmb;
      S += env * mix(f0, 1.0, pow(1.0 - max(dot(N, V), 0.0), 5.0) * gl * gl) * (0.3 + 0.7 * gl);
    }
    for (int i = 0; i < NPT; i++) {
      vec3 d = uPtPos[i] - vWP;
      float dl = max(length(d), 1e-4);
      float att = clamp(1.0 - dl / max(uPtRange[i], 1e-3), 0.0, 1.0);
      att *= att * boxK(uPtBox[i], vWP.xz);
      float sh = i == 0 ? mix(0.1, 1.0, shP) * mix(0.62, 1.0, smoothstep(0.15, 1.4, dl)) : 1.0; // lantern: tame the hot spot right next to it
      E += uPtCol[i] * att * (0.2 + 0.8 * max(dot(N, d / dl), 0.0)) * sh;
      glintL += uPtCol[i] * att * sh * pow(max(dot(N, normalize(d / dl + V)), 0.0), 6.0);
      if (doSpec) S += uPtCol[i] * att * sh * specL(N, d / dl, V, pw, f0, gl);
    }
    // contact darkening where walls / posts meet the snow
    float ao = 1.0 - uAO * 0.3 * (1.0 - smoothstep(0.0, 0.55, vWP.y)) * (1.0 - abs(N.y));
    vec3 L = mix(vec3(1.0), E * ao, uLit) * uTint + uEmissive;
#endif
    L *= vCol;
    vec3 c = tex.rgb * L;
#ifndef LINE
    if (doSpec) c = c * (1.0 - 0.55 * uMetal) + S * mix(vec3(1.0), tex.rgb * 2.2, uMetal) * ao * clamp(dot(vCol, vec3(0.4)), 0.0, 1.0) * uTint;
#endif
#ifdef TERRAIN
    c *= mix(vec3(1.0), vec3(0.74, 0.81, 0.95), gTrail); // packed snow in the dents: a little darker and bluer
#endif
#ifndef LINE
    if (uSparkle > 0.0) {
      // break the tiling with broad drifts, then sparse crystal glints that twinkle as the view moves
      c *= 0.95 + 0.09 * eNoise(vWP.xz * 0.21) - 0.04 * eNoise(vWP.xz * 1.3 + 7.0);
      vec2 g = vWP.xz * 34.0 + vWP.y * 13.0;
      vec2 cell = floor(g);
      float h = eHash(cell);
      if (h > 0.62) {
        vec3 fn = normalize(vec3(eHash(cell + 3.1) - 0.5, 0.75, eHash(cell + 7.7) - 0.5));
        vec2 f = fract(g) - 0.5 - (vec2(eHash(cell + 1.7), eHash(cell + 9.3)) - 0.5) * 0.5;
        float spot = smoothstep(0.24, 0.0, length(f));
        float sp = pow(max(dot(fn, normalize(uSunDir + V)), 0.0), 300.0) * dot(uSunCol, vec3(1.0)) * 4.0 * shS;
        sp += pow(max(dot(fn, normalize(normalize(uPtPos[0] - vWP) + V)), 0.0), 200.0) * dot(glintL, vec3(1.0)) * 7.0;
        sp += step(0.999, eHash(cell + floor(V.xz * 40.0))) * 0.25 * dot(E, vec3(0.33));
        c += vec3(0.92, 0.96, 1.0) * sp * spot * smoothstep(20.0, 4.0, dist) * uSparkle * gSnow * (1.0 - gTrail * 0.85);
      }
    }
#endif
    if (uSkyFx > 0.0) { // soft overcast cloud mottling on the sky dome
      vec3 D = normalize(vWP - cameraPosition);
      vec2 cp = D.xz / (abs(D.y) + 0.12) * 1.4;
      float cl = eNoise(cp) * 0.55 + eNoise(cp * 2.3 + 3.0) * 0.3 + eNoise(cp * 5.1 + 1.0) * 0.15;
      c *= mix(1.0, 0.9 + 0.2 * cl, smoothstep(-0.02, 0.2, D.y));
    }
    c = mix(c, uFogCol, fogE(dist, uFogNear, uFogFar) * uFogAmt);
#ifndef TRANSLUCENT
    c += inScatter(vWP);
#endif
#ifdef TRANSLUCENT
    gl_FragColor = vec4(c, clamp(tex.a * uOpacity, 0.0, 1.0));
#else
    gl_FragColor = vec4(c, 1.0);
#endif
    return;
  }
  vec2 uvA = vUvW.xy / vUvW.z;
  vec2 uvT = mix(vUv, uvA, clamp(uAffine * uAffineK, 0.0, 1.0));
  vec4 tex = baseTex(uvT);
  if (tex.a < uAlphaCut) discard;
#ifdef SNOWCOVER
  tex.rgb = snowOn(tex.rgb, normalize(vWN));
#endif
  vec3 c = tex.rgb * vLight;
  c = mix(c, uFogCol, vFog);
#ifdef TRANSLUCENT
  gl_FragColor = vec4(c, clamp(tex.a * uOpacity, 0.0, 1.0));
#else
  gl_FragColor = vec4(c, 1.0);
#endif
}`;

const MATS = [];
// Switch every PS1 material between the low-res pixel texture and its filtered high-res twin.
export function setGfx(enh) {
  GFX.enh = !!enh;
  LIGHTS.uEnh.value = GFX.enh ? 1 : 0;
  LIGHTS.uSnapOn.value = GFX.enh ? 0 : 1;
  for (const m of MATS) {
    const los = m.userData.los || { map: m.userData.lo };
    for (const [k, lo] of Object.entries(los)) if (lo && lo.userData && lo.userData.pc) m.uniforms[k].value = GFX.enh ? hiOf(lo) : lo;
  }
}
export function ps1Material({
  map = null, lit = 1, emissive = [0, 0, 0], tint = [1, 1, 1], alphaCut = 0.5, side = THREE.FrontSide,
  fog = 1, affineK = 1, vertexColors = true, line = false, transparent = false, depthWrite = true, blending, opacity = 1,
  ao = 0, sparkle = 0, skyFx = 0, amb = 1, terrain = null, sunk = 1, snow = 0, bump = 0,
  nmap = undefined, nrm = 1, spec = undefined, gloss = undefined, metal = undefined,
} = {}) {
  // photo twin of the map (enhanced): normal map + specular parameters ride along in its userData
  const hiMap = map && map.userData && map.userData.pc ? hiOf(map) : map, hu = (hiMap && hiMap.userData) || {};
  const nm = nmap !== undefined ? nmap : hu.nmap || null;
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...LIGHTS,
      map: { value: map || WHITE_TEX },
      uLit: { value: lit },
      uEmissive: { value: new THREE.Color(...emissive) },
      uTint: { value: new THREE.Color(...tint) },
      uAlphaCut: { value: alphaCut },
      uFogAmt: { value: fog },
      uAffineK: { value: affineK },
      uOpacity: { value: opacity },
      uAO: { value: ao },
      uSparkle: { value: sparkle },
      uSkyFx: { value: skyFx },
      uSnowK: { value: snow }, uBump: { value: bump },
      uHiUV: { value: (map && map.userData && map.userData.hiUV) || 1 }, uNrm: { value: nrm },
      uSpec: { value: spec ?? hu.spec ?? 0 }, uGloss: { value: gloss ?? hu.gloss ?? 0.3 }, uMetal: { value: metal ?? hu.metal ?? 0 },
      ...(nm ? { nmap: { value: nm } } : {}),
      uAmb: amb && typeof amb === 'object' ? amb : { value: amb },
      uSunK: sunk && typeof sunk === 'object' ? sunk : { value: sunk }, // sun scale (shared object: retro interiors get no direct sun)
      ...(terrain ? { map4: { value: terrain.map4 || WHITE_TEX }, nmap1: { value: terrain.nmaps ? terrain.nmaps[0] : WHITE_TEX }, nmap2: { value: terrain.nmaps ? terrain.nmaps[1] : WHITE_TEX }, nmap3: { value: terrain.nmaps ? terrain.nmaps[2] : WHITE_TEX }, nmap4: { value: terrain.nmaps ? terrain.nmaps[3] : WHITE_TEX },
        uTerrS: { value: new THREE.Vector4(...(terrain.tiles || [3, 3, 4, 3])) }, uTerrN: { value: terrain.nmaps ? 1 : 0 }, map2: { value: terrain.map2 }, map3: { value: terrain.map3 }, uMask: { value: terrain.mask }, uMaskRect: { value: new THREE.Vector4(...terrain.rect) }, uTrail: { value: terrain.trail ? terrain.trail.tex : WHITE_TEX }, uTrailRect: { value: new THREE.Vector4(...(terrain.trail ? terrain.trail.rect : [0, 0, 0.001, 0.001])) } } : {}),
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors,
    side,
    transparent,
    depthWrite,
  });
  if (blending !== undefined) m.blending = blending;
  if (line) m.defines = { LINE: 1 };
  if (transparent && !line) m.defines = { ...(m.defines || {}), TRANSLUCENT: 1 }; // alpha from the texture (glass)
  if (terrain) m.defines = { ...(m.defines || {}), TERRAIN: 1 };
  if (snow > 0) m.defines = { ...(m.defines || {}), SNOWCOVER: 1 };
  if (bump > 0) m.defines = { ...(m.defines || {}), BUMP: 1 };
  if (nm) m.defines = { ...(m.defines || {}), NMAP: 1 };
  m.userData.lo = map;
  m.userData.los = terrain ? { map, map2: terrain.map2, map3: terrain.map3, uMask: terrain.mask, ...(terrain.map4 ? { map4: terrain.map4 } : {}) } : { map };
  if (GFX.enh) for (const [k, lo] of Object.entries(m.userData.los)) if (lo && lo.userData && lo.userData.pc) m.uniforms[k].value = hiOf(lo);
  MATS.push(m);
  return m;
}

// Snow / dust points: fixed small pixel size in the low-res buffer.
// Enhanced: perspective-sized soft round flakes (about 1.4 cm), alpha-blended, no snapping.
export function ps1PointsMaterial(color = [0.92, 0.94, 1.0]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSnap: LIGHTS.uSnap, uFogCol: LIGHTS.uFogCol, uFogNear: LIGHTS.uFogNear, uFogFar: LIGHTS.uFogFar, uEnh: LIGHTS.uEnh, uPxK: LIGHTS.uPxK,
      uPtPos: LIGHTS.uPtPos, uPtCol: LIGHTS.uPtCol, uPtRange: LIGHTS.uPtRange,
      uColor: { value: new THREE.Color(...color) }, uPx: { value: 1 },
    },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform vec2 uSnap; uniform float uFogNear; uniform float uFogFar; uniform float uPx; uniform float uEnh; uniform float uPxK;
      uniform vec3 uColor; uniform vec3 uPtPos[2]; uniform vec3 uPtCol[2]; uniform float uPtRange[2];
      varying float vFog; varying float vA; varying vec3 vCol;
      void main() {
        vCol = uColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec4 clip = projectionMatrix * mv;
        float dist = -mv.z;
        vA = 1.0;
        if (uEnh > 0.5) {
          float px = uPxK * 0.014 / max(dist, 0.05);
          vA = clamp(px / 2.0, 0.42, 1.0) * smoothstep(0.3, 0.9, dist);
          gl_PointSize = clamp(px, 2.2, 14.0);
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          for (int i = 0; i < 2; i++) { float att = clamp(1.0 - distance(uPtPos[i], wp) / max(uPtRange[i] * 0.8, 1e-3), 0.0, 1.0); vCol += uPtCol[i] * att * att * 1.1; }
          float t = max(dist - uFogNear * 0.4, 0.0) / max(uFogFar - uFogNear * 0.4, 1e-3);
          vFog = clamp(1.0 - exp(-3.4 * t * t - 0.55 * t), 0.0, 1.0);
        } else {
          if (clip.w > 0.0) clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
          gl_PointSize = (dist < 3.0 ? 3.0 : 2.0) * uPx;
          vFog = smoothstep(uFogNear, uFogFar, dist);
        }
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogCol; uniform float uEnh; varying float vFog; varying float vA; varying vec3 vCol;
      void main() {
        float a = 1.0;
        if (uEnh > 0.5) { vec2 q = gl_PointCoord - 0.5; a = smoothstep(0.5, 0.12, length(q)) * vA * 0.85; if (a < 0.01) discard; }
        gl_FragColor = vec4(mix(vCol, uFogCol, vFog * 0.85), a);
      }`,
  });
}

/* ------------------------------------------------------------ tape OSD font (5x7) */
const GLYPHS = {
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  '>': ['#....', '##...', '###..', '####.', '###..', '##...', '#....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function drawText(ctx, text, x, y, color = '#f2f2ee') {
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? 'rgba(0,0,0,0.55)' : color;
      const o = pass === 0 ? 1 : 0;
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '#') ctx.fillRect(cx + c + o, y + r + o, 1, 1);
    }
    cx += 6;
  }
  return cx;
}


/* ------------------------------------------------------------ enhanced: shadow maps */
// Sun / moon: orthographic depth map around the player (texel-snapped, no shimmer). Lantern: one wide perspective
// "spot" depth map from the flame towards where the player looks. Casters are objects on layer 1.
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function depthRT(size) {
  const rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  rt.depthTexture = new THREE.DepthTexture(size, size);
  rt.depthTexture.type = THREE.UnsignedIntType;
  rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
  return rt;
}
export class Shadows {
  constructor(renderer, sunSize = 2048, spotSize = 1024) {
    this.r = renderer;
    this.sun = depthRT(sunSize); this.spot = depthRT(spotSize);
    this.sunSize = sunSize; this.spotSize = spotSize;
    this.sunCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 160);
    this.sunCam.layers.set(1);
    this.spotCam = new THREE.PerspectiveCamera(128, 1, 0.08, 14);
    this.spotCam.layers.set(1);
    this.mat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    LIGHTS.uShTex.value = this.sun.depthTexture; LIGHTS.uSpTex.value = this.spot.depthTexture;
    LIGHTS.uShTx.value = 1 / sunSize; LIGHTS.uSpTx.value = 1 / spotSize;
    this._v = new THREE.Vector3(); this._c = new THREE.Vector3();
  }
  off() { LIGHTS.uShOn.value = 0; LIGHTS.uSpOn.value = 0; }
  _pass(scene, cam, rt) {
    const r = this.r, ov = scene.overrideMaterial, bg = scene.background;
    scene.overrideMaterial = this.mat; scene.background = null;
    r.setRenderTarget(rt);
    r.clear(true, true, true);
    r.render(scene, cam);
    scene.overrideMaterial = ov; scene.background = bg;
  }
  // center: world point the sun map is centred on; half: half extent (m); spot: { pos, dir } or null
  render(scene, { center, half = 24, sun = true, spot = null }) {
    const prevRT = this.r.getRenderTarget();
    if (sun) {
      const C = this.sunCam, dir = LIGHTS.uSunDir.value, c = this._c.copy(center);
      C.left = -half; C.right = half; C.top = half; C.bottom = -half;
      C.position.copy(c).addScaledVector(dir, 70); C.lookAt(c); C.updateMatrixWorld(true);
      // snap the centre to whole texels in light space
      const tx = (2 * half) / this.sunSize, lv = this._v.copy(c).applyMatrix4(C.matrixWorldInverse);
      lv.x = Math.round(lv.x / tx) * tx; lv.y = Math.round(lv.y / tx) * tx;
      c.copy(lv).applyMatrix4(C.matrixWorld);
      C.position.copy(c).addScaledVector(dir, 70); C.lookAt(c);
      C.updateProjectionMatrix(); C.updateMatrixWorld(true);
      this._pass(scene, C, this.sun);
      LIGHTS.uShMat.value.copy(BIAS).multiply(C.projectionMatrix).multiply(C.matrixWorldInverse);
      LIGHTS.uShOn.value = 1;
    } else LIGHTS.uShOn.value = 0;
    if (spot) {
      const C = this.spotCam;
      C.position.copy(spot.pos); C.lookAt(this._v.copy(spot.pos).add(spot.dir));
      C.updateProjectionMatrix(); C.updateMatrixWorld(true);
      this._pass(scene, C, this.spot);
      LIGHTS.uSpMat.value.copy(BIAS).multiply(C.projectionMatrix).multiply(C.matrixWorldInverse);
      LIGHTS.uSpNF.value.set(C.near, C.far);
      LIGHTS.uSpOn.value = 1;
    } else LIGHTS.uSpOn.value = 0;
    this.r.setRenderTarget(prevRT);
  }
}

/* ------------------------------------------------------------ pipeline */
export class PS1Pipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(320, 240, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true,
    });
    this.osdCanvas = document.createElement('canvas');
    this.osdCanvas.width = 320; this.osdCanvas.height = 240;
    this.osd = this.osdCanvas.getContext('2d');
    this.osdTex = new THREE.CanvasTexture(this.osdCanvas);
    this.osdTex.magFilter = this.osdTex.minFilter = THREE.NearestFilter;
    this.osdTex.generateMipmaps = false;
    this.osdKey = '';
    this.u = {
      tLow: { value: this.rt.texture }, tOsd: { value: this.osdTex },
      uLow: { value: new THREE.Vector2(320, 240) }, uTime: { value: 0 },
      uDither: { value: 1 }, uVHS: { value: 0 }, uOsdOn: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, depthTest: false, depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tLow; uniform sampler2D tOsd; uniform vec2 uLow; uniform float uTime;
        uniform float uDither; uniform float uVHS; uniform float uOsdOn;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float bayer(vec2 p) {
          int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
          float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          return m[x + y * 4] / 16.0;
        }
        void main() {
          vec2 uv = vUv;
          float line = floor(uv.y * uLow.y);
          float tf = floor(uTime * 24.0);
          float band = smoothstep(0.07, 0.0, uv.y);
          if (uVHS > 0.0) {
            float j = (hash(vec2(line, tf)) - 0.5) * 0.0022;
            j += band * (hash(vec2(line * 1.7, tf)) - 0.5) * 0.028;
            j += sin(uv.y * 31.0 + uTime * 1.7) * 0.0007;
            uv.x += j * uVHS;
          }
          vec2 px = floor(uv * uLow);
          vec2 suv = (px + 0.5) / uLow;
          vec3 c = texture2D(tLow, suv).rgb;
          if (uVHS > 0.0) {
            float o = 1.0 / uLow.x;
            float r = texture2D(tLow, suv + vec2(o, 0.0)).r;
            float b = texture2D(tLow, suv - vec2(o * 1.5, 0.0)).b;
            c = mix(c, vec3(r, c.g, b), 0.65 * uVHS);
            c += (hash(px + fract(uTime * 7.13) * 91.0) - 0.5) * 0.045 * uVHS;
            float streak = step(0.82, hash(vec2(floor(px.x / 3.0), line + tf)));
            c = mix(c, vec3(0.75), band * streak * 0.55 * uVHS);
          }
          vec4 o = texture2D(tOsd, (floor(vUv * uLow) + 0.5) / uLow);
          c = mix(c, o.rgb, o.a * uOsdOn);
          if (uDither > 0.0) {
            c += (bayer(px) - 0.5) / 31.0 * uDither;
            c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
          }
          if (uVHS > 0.0) {
            float sl = fract(vUv.y * uLow.y) < 0.34 ? 0.84 : 1.0;
            c *= mix(1.0, sl, uVHS);
            vec2 q = vUv - 0.5;
            c *= 1.0 - dot(q, q) * 0.85 * uVHS;
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g, mat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.lowW = 320; this.lowH = 240;
  }

  _osdSize(w, h) {
    if (this.osdCanvas.width === w && this.osdCanvas.height === h) return;
    this.osdCanvas.width = w; this.osdCanvas.height = h; this.osdKey = '';
    this.osdTex.dispose();
    this.osdTex = new THREE.CanvasTexture(this.osdCanvas);
    this.osdTex.magFilter = this.osdTex.minFilter = THREE.NearestFilter;
    this.osdTex.generateMipmaps = false;
    this.u.tOsd.value = this.osdTex;
  }

  setSize(outW, outH, lowH = 240, snapH = 240) {
    if (GFX.enh) return this.setSizeEnh(outW, outH, GFX.maxH || 1080);
    const aspect = outW / Math.max(1, outH);
    const lw = Math.max(2, Math.round((lowH * aspect) / 2) * 2);
    if (lw !== this.lowW || lowH !== this.lowH) {
      this.lowW = lw; this.lowH = lowH;
      this.rt.setSize(lw, lowH);
    }
    this._osdSize(lw, lowH);
    this.u.uLow.value.set(lw, lowH);
    LIGHTS.uSnap.value.set((snapH * aspect) / 2, snapH / 2);
  }

  // osd: { play: bool, time: 'HH:MM:SS', dot: bool }
  drawOSD(osd) {
    const key = osd ? JSON.stringify(osd) : '';
    if (key === this.osdKey) return;
    this.osdKey = key;
    const ctx = this.osd, W = this.osdCanvas.width, H = this.osdCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (osd) {
      const s = Math.max(1, Math.round(H / 240));
      ctx.save();
      ctx.scale(s, s);
      const w = W / s, h = H / s;
      if (osd.play) drawText(ctx, 'PLAY >', 12, 10);
      if (osd.time) drawText(ctx, osd.time, w - 12 - osd.time.length * 6, h - 20);
      ctx.restore();
      if (osd.dot) {
        const d = Math.max(1, Math.round(s * 0.67)), cx = Math.floor(W / 2) - d, cy = Math.floor(H / 2) - d;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(cx - d / 2, cy - d / 2, 3 * d, 3 * d);
        ctx.fillStyle = 'rgba(240,240,236,0.9)';
        ctx.fillRect(cx, cy, 2 * d, 2 * d);
      }
    }
    this.osdTex.needsUpdate = true;
  }


  /* ---------------- enhanced path: HDR MSAA target -> dual-filter bloom -> grade / vignette / grain / dither / VHS */
  _initEnh() {
    if (this.E) return this.E;
    const r = this.renderer, gl = r.getContext();
    const half = r.capabilities.isWebGL2 && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float'));
    const type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const samples = Math.min(4, r.capabilities.maxSamples || 0);
    const mk = (ms) => new THREE.WebGLRenderTarget(4, 4, { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: ms, samples: ms ? samples : 0 });
    const E = { hdr: mk(true), down: [], up: [], w: 0, h: 0 };
    for (let i = 0; i < 5; i++) { E.down.push(mk(false)); E.up.push(mk(false)); }
    const quad = (frag, uniforms) => {
      const m = new THREE.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false, vertexShader: this.quad.material.vertexShader, fragmentShader: frag });
      const q = new THREE.Mesh(this.quad.geometry, m); q.frustumCulled = false;
      const sc = new THREE.Scene(); sc.add(q);
      return { m, sc, u: uniforms };
    };
    E.dn = quad(/* glsl */ `
      uniform sampler2D t; uniform vec2 uTx; uniform float uFirst; uniform float uThr; uniform float uKnee; varying vec2 vUv;
      vec3 pre(vec3 c) { if (uFirst < 0.5) return c; c = min(c, vec3(8.0)); float l = max(c.r, max(c.g, c.b)); return c * smoothstep(uThr, uThr + uKnee, l); }
      void main() {
        vec3 s = pre(texture2D(t, vUv).rgb) * 4.0;
        s += pre(texture2D(t, vUv + vec2(-1.0, -1.0) * uTx).rgb) + pre(texture2D(t, vUv + vec2(1.0, -1.0) * uTx).rgb);
        s += pre(texture2D(t, vUv + vec2(-1.0, 1.0) * uTx).rgb) + pre(texture2D(t, vUv + vec2(1.0, 1.0) * uTx).rgb);
        gl_FragColor = vec4(s / 8.0, 1.0);
      }`, { t: { value: null }, uTx: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uThr: { value: 0.8 }, uKnee: { value: 0.35 } });
    E.upq = quad(/* glsl */ `
      uniform sampler2D t; uniform sampler2D tAdd; uniform vec2 uTx; uniform float uAddK; varying vec2 vUv;
      void main() {
        vec3 s = texture2D(t, vUv + vec2(-2.0, 0.0) * uTx).rgb + texture2D(t, vUv + vec2(2.0, 0.0) * uTx).rgb;
        s += texture2D(t, vUv + vec2(0.0, -2.0) * uTx).rgb + texture2D(t, vUv + vec2(0.0, 2.0) * uTx).rgb;
        s += (texture2D(t, vUv + vec2(-1.0, 1.0) * uTx).rgb + texture2D(t, vUv + vec2(1.0, 1.0) * uTx).rgb) * 2.0;
        s += (texture2D(t, vUv + vec2(1.0, -1.0) * uTx).rgb + texture2D(t, vUv + vec2(-1.0, -1.0) * uTx).rgb) * 2.0;
        gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb * uAddK, 1.0);
      }`, { t: { value: null }, tAdd: { value: null }, uTx: { value: new THREE.Vector2() }, uAddK: { value: 1 } });
    E.fin = quad(/* glsl */ `
      uniform sampler2D tHdr; uniform sampler2D tBloom; uniform sampler2D tOsd; uniform vec2 uRes; uniform vec2 uOsdRes; uniform float uTime;
      uniform float uBloom; uniform float uVHS; uniform float uOsdOn; uniform float uDither; uniform float uGrain; uniform float uVig;
      uniform float uSat; uniform float uContrast; uniform vec3 uShadowTint; uniform vec3 uHiTint; uniform float uExpo;
      varying vec2 vUv;
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float bayer(vec2 p) {
        int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
        float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
        return m[x + y * 4] / 16.0;
      }
      void main() {
        vec2 uv = vUv;
        float L240 = floor(uv.y * 240.0);
        float tf = floor(uTime * 24.0);
        float band = smoothstep(0.07, 0.0, uv.y);
        if (uVHS > 0.0) {
          float j = (hash(vec2(L240, tf)) - 0.5) * 0.0022;
          j += band * (hash(vec2(L240 * 1.7, tf)) - 0.5) * 0.028;
          j += sin(uv.y * 31.0 + uTime * 1.7) * 0.0007;
          uv.x += j * uVHS;
        }
        vec3 c = texture2D(tHdr, uv).rgb;
        if (uVHS > 0.0) {
          float o = 1.0 / 320.0;
          float r = texture2D(tHdr, uv + vec2(o, 0.0)).r;
          float b = texture2D(tHdr, uv - vec2(o * 1.5, 0.0)).b;
          c = mix(c, vec3(r, c.g, b), 0.65 * uVHS);
        }
        c += texture2D(tBloom, uv).rgb * uBloom;
        c *= uExpo;
        // cold grade: gentle filmic shoulder, desaturate, blue shadows / neutral-warm highlights, soft contrast
        vec3 hx = max(c - 0.8, 0.0); c = min(c, 0.8) + hx / (1.0 + hx / 0.36); // soft highlight shoulder
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        float sh = 1.0 - smoothstep(0.0, 0.55, l);
        c *= mix(vec3(1.0), uShadowTint, sh) * mix(vec3(1.0), uHiTint, smoothstep(0.45, 1.0, l));
        c = clamp(c, 0.0, 1.2);
        vec3 sc = c * c * (3.0 - 2.0 * min(c, 1.0));
        c = mix(c, sc, uContrast);
        vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
        c *= 1.0 - smoothstep(0.35, 1.05, length(q)) * uVig;
        vec2 px = floor(vUv * uRes);
        float n = hash(px + fract(uTime * 7.13) * 917.0) + hash(px * 1.31 + fract(uTime * 3.7) * 311.0) - 1.0;
        c += n * uGrain * (0.35 + 0.65 * (1.0 - l));
        if (uVHS > 0.0) {
          vec2 vp = floor(vUv * vec2(320.0, 240.0));
          c += (hash(vp + fract(uTime * 7.13) * 91.0) - 0.5) * 0.045 * uVHS;
          float streak = step(0.82, hash(vec2(floor(vp.x / 3.0), L240 + tf)));
          c = mix(c, vec3(0.75), band * streak * 0.55 * uVHS);
        }
        vec4 o = texture2D(tOsd, (floor(vUv * uOsdRes) + 0.5) / uOsdRes);
        c = mix(c, o.rgb, o.a * uOsdOn);
        if (uDither > 0.0) {
          c += (bayer(px) - 0.5) / 63.0 * uDither;
          c = mix(c, floor(clamp(c, 0.0, 1.0) * 63.0 + 0.5) / 63.0, uDither);
        }
        if (uVHS > 0.0) {
          float sl = fract(vUv.y * 240.0) < 0.34 ? 0.86 : 1.0;
          c *= mix(1.0, sl, uVHS);
          c *= 1.0 - dot(vUv - 0.5, vUv - 0.5) * 0.85 * uVHS;
        }
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`, {
      tHdr: { value: E.hdr.texture }, tBloom: { value: null }, tOsd: { value: this.osdTex }, uRes: { value: new THREE.Vector2(1, 1) }, uOsdRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 }, uBloom: { value: 0.5 }, uVHS: { value: 0 }, uOsdOn: { value: 0 }, uDither: { value: 0.35 }, uGrain: { value: 0.022 }, uVig: { value: 0.38 },
      uSat: { value: 0.88 }, uContrast: { value: 0.22 }, uShadowTint: { value: new THREE.Vector3(0.9, 0.97, 1.1) }, uHiTint: { value: new THREE.Vector3(1.02, 1.0, 0.97) }, uExpo: { value: 1 },
    });
    // per-scene look (set by the yard presets); the viewer modes use the neutral defaults
    this.look = { bloom: 0.5, thr: 0.8, knee: 0.35, sat: 0.88, contrast: 0.22, vig: 0.38, grain: 0.022, expo: 1, shadowTint: [0.9, 0.97, 1.1], hiTint: [1.02, 1.0, 0.97] };
    this.E = E;
    return E;
  }

  setSizeEnh(outW, outH, maxH = 720) {
    const E = this._initEnh();
    const h = Math.max(2, Math.min(outH, maxH)), w = Math.max(2, Math.round(h * outW / Math.max(1, outH)));
    if (w !== E.w || h !== E.h) {
      E.w = w; E.h = h;
      E.hdr.setSize(w, h);
      let dw = w, dh = h;
      for (let i = 0; i < 5; i++) { dw = Math.max(2, dw >> 1); dh = Math.max(2, dh >> 1); E.down[i].setSize(dw, dh); E.up[i].setSize(dw, dh); }
    }
    this._osdSize(w, h);
    E.fin.u.tOsd.value = this.osdTex;
    E.fin.u.uRes.value.set(w, h); E.fin.u.uOsdRes.value.set(w, h);
    LIGHTS.uSnap.value.set(w / 2, h / 2);
  }

  renderEnh(scene, camera, { vhs = 0, dither = 0.35, osd = null, time = 0 } = {}) {
    const r = this.renderer, E = this._initEnh(), L = this.look;
    this.drawOSD(osd);
    if (camera.isPerspectiveCamera) LIGHTS.uPxK.value = E.h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    else LIGHTS.uPxK.value = E.h * 0.5;
    r.setRenderTarget(E.hdr);
    r.clear(true, true, true);
    r.render(scene, camera);
    // bloom: 5 downsamples (first one thresholds), 4 upsamples
    let src = E.hdr;
    for (let i = 0; i < 5; i++) {
      E.dn.u.t.value = src.texture; E.dn.u.uTx.value.set(0.5 / src.width, 0.5 / src.height);
      E.dn.u.uFirst.value = i === 0 ? 1 : 0; E.dn.u.uThr.value = L.thr; E.dn.u.uKnee.value = L.knee;
      r.setRenderTarget(E.down[i]); r.render(E.dn.sc, this.quadCam);
      src = E.down[i];
    }
    for (let i = 3; i >= 0; i--) {
      E.upq.u.t.value = src.texture; E.upq.u.tAdd.value = E.down[i].texture; E.upq.u.uTx.value.set(0.5 / src.width, 0.5 / src.height);
      r.setRenderTarget(E.up[i]); r.render(E.upq.sc, this.quadCam);
      src = E.up[i];
    }
    const u = E.fin.u;
    u.tBloom.value = src.texture; u.uTime.value = time; u.uVHS.value = vhs; u.uOsdOn.value = osd ? 1 : 0; u.uDither.value = dither;
    u.uBloom.value = L.bloom; u.uSat.value = L.sat; u.uContrast.value = L.contrast; u.uVig.value = L.vig; u.uGrain.value = L.grain; u.uExpo.value = L.expo;
    u.uShadowTint.value.set(...L.shadowTint); u.uHiTint.value.set(...L.hiTint);
    r.setRenderTarget(null);
    r.clear(true, true, true);
    r.render(E.fin.sc, this.quadCam);
  }

  render(scene, camera, opts = {}) {
    if (GFX.enh) return this.renderEnh(scene, camera, { ...opts, dither: opts.enhDither ?? 0.35 });
    return this.renderRetro(scene, camera, opts);
  }

  renderRetro(scene, camera, { vhs = 0, dither = 1, osd = null, time = 0 } = {}) {
    const r = this.renderer;
    this.drawOSD(osd);
    this.u.uVHS.value = vhs;
    this.u.uDither.value = dither;
    this.u.uOsdOn.value = osd ? 1 : 0;
    this.u.uTime.value = time;
    r.setRenderTarget(this.rt);
    r.clear(true, true, true);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.clear(true, true, true);
    r.render(this.quadScene, this.quadCam);
  }
}
