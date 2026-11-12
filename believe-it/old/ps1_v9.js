// PS1-style rendering: vertex snapping, affine texture warp, per-vertex lighting, per-vertex fog,
// low-res render target + nearest upscale with 15-bit ordered dithering, optional VHS + tape OSD.
import * as THREE from 'three';
import { WHITE_TEX } from './util.js';

export const LIGHTS = {
  uSnap: { value: new THREE.Vector2(160, 120) },
  uSnapOn: { value: 1 },
  uAffine: { value: 0.85 },
  uSkyAmb: { value: new THREE.Color(0.55, 0.55, 0.6) },
  uGroundAmb: { value: new THREE.Color(0.3, 0.28, 0.27) },
  uSunDir: { value: new THREE.Vector3(0.35, 0.75, 0.55).normalize() },
  uSunCol: { value: new THREE.Color(0.6, 0.58, 0.55) },
  uPtPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uPtCol: { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] },
  uPtRange: { value: [1, 1] },
  uFogCol: { value: new THREE.Color(0.5, 0.5, 0.5) },
  uFogNear: { value: 1000 },
  uFogFar: { value: 2000 },
};

const VERT = /* glsl */ `
#define NPT 2
uniform vec2 uSnap; uniform float uSnapOn;
uniform vec3 uSkyAmb; uniform vec3 uGroundAmb; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec3 uPtPos[NPT]; uniform vec3 uPtCol[NPT]; uniform float uPtRange[NPT];
uniform float uFogNear; uniform float uFogFar; uniform float uFogAmt;
uniform vec3 uEmissive; uniform float uLit; uniform vec3 uTint;
varying vec3 vLight; varying vec3 vUvW; varying vec2 vUv; varying float vFog;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
#ifdef LINE
  vec3 L = uTint;
#else
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  vec3 L = mix(uGroundAmb, uSkyAmb, wn.y * 0.5 + 0.5);
  L += uSunCol * max(dot(wn, uSunDir), 0.0);
  for (int i = 0; i < NPT; i++) {
    vec3 d = uPtPos[i] - wp.xyz;
    float dist = max(length(d), 1e-4);
    float att = clamp(1.0 - dist / max(uPtRange[i], 1e-3), 0.0, 1.0);
    att *= att;
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
uniform sampler2D map; uniform float uAffine; uniform float uAffineK; uniform vec3 uFogCol; uniform float uAlphaCut; uniform float uOpacity;
varying vec3 vLight; varying vec3 vUvW; varying vec2 vUv; varying float vFog;
void main() {
  vec2 uvA = vUvW.xy / vUvW.z;
  vec2 uvT = mix(vUv, uvA, clamp(uAffine * uAffineK, 0.0, 1.0));
  vec4 tex = texture2D(map, uvT);
  if (tex.a < uAlphaCut) discard;
  vec3 c = tex.rgb * vLight;
  c = mix(c, uFogCol, vFog);
#ifdef TRANSLUCENT
  gl_FragColor = vec4(c, clamp(tex.a * uOpacity, 0.0, 1.0));
#else
  gl_FragColor = vec4(c, 1.0);
#endif
}`;

export function ps1Material({
  map = null, lit = 1, emissive = [0, 0, 0], tint = [1, 1, 1], alphaCut = 0.5, side = THREE.FrontSide,
  fog = 1, affineK = 1, vertexColors = true, line = false, transparent = false, depthWrite = true, blending, opacity = 1,
} = {}) {
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
  return m;
}

// Snow / dust points: fixed small pixel size in the low-res buffer.
export function ps1PointsMaterial(color = [0.92, 0.94, 1.0]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSnap: LIGHTS.uSnap, uFogCol: LIGHTS.uFogCol, uFogNear: LIGHTS.uFogNear, uFogFar: LIGHTS.uFogFar,
      uColor: { value: new THREE.Color(...color) }, uPx: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform vec2 uSnap; uniform float uFogNear; uniform float uFogFar; uniform float uPx;
      varying float vFog;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec4 clip = projectionMatrix * mv;
        if (clip.w > 0.0) clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
        gl_Position = clip;
        float dist = -mv.z;
        gl_PointSize = (dist < 3.0 ? 3.0 : 2.0) * uPx;
        vFog = smoothstep(uFogNear, uFogFar, dist);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uFogCol; varying float vFog;
      void main() { gl_FragColor = vec4(mix(uColor, uFogCol, vFog * 0.85), 1.0); }`,
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

  setSize(outW, outH, lowH = 240, snapH = 240) {
    const aspect = outW / Math.max(1, outH);
    const lw = Math.max(2, Math.round((lowH * aspect) / 2) * 2);
    if (lw !== this.lowW || lowH !== this.lowH) {
      this.lowW = lw; this.lowH = lowH;
      this.rt.setSize(lw, lowH);
      this.osdCanvas.width = lw; this.osdCanvas.height = lowH;
      this.osdKey = '';
      this.osdTex.dispose();
      this.osdTex = new THREE.CanvasTexture(this.osdCanvas);
      this.osdTex.magFilter = this.osdTex.minFilter = THREE.NearestFilter;
      this.osdTex.generateMipmaps = false;
      this.u.tOsd.value = this.osdTex;
    }
    this.u.uLow.value.set(lw, lowH);
    LIGHTS.uSnap.value.set((snapH * aspect) / 2, snapH / 2);
  }

  // osd: { play: bool, time: 'HH:MM:SS', dot: bool }
  drawOSD(osd) {
    const key = osd ? JSON.stringify(osd) : '';
    if (key === this.osdKey) return;
    this.osdKey = key;
    const ctx = this.osd, W = this.lowW, H = this.lowH;
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
        const cx = Math.floor(W / 2) - 1, cy = Math.floor(H / 2) - 1;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(cx - 1, cy - 1, 4, 4);
        ctx.fillStyle = 'rgba(240,240,236,0.9)';
        ctx.fillRect(cx, cy, 2, 2);
      }
    }
    this.osdTex.needsUpdate = true;
  }

  render(scene, camera, { vhs = 0, dither = 1, osd = null, time = 0 } = {}) {
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
