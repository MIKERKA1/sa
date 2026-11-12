// "Believe It" — stage 3: walk the Hinterkaifeck farmstead (first person, lantern) or look at it from above with cutaways.
import * as THREE from 'three';
import { PS1Pipeline, LIGHTS, GFX, setGfx, Shadows } from '../engine/ps1.js';
import { TEX_OPT, clamp, lerp, smooth } from '../engine/util.js';
import { createViewmodel } from '../models/viewmodel.js';
import { createFarm, FARM_PRESETS } from '../scenes/farm.js';
import { createAudio, SYNTH } from './audio.js';
import { ROOMS, YARD, Y } from '../scenes/farm_plan.js';
import { loadPhotos } from '../engine/photo.js';

THREE.ColorManagement.enabled = false;
const V3 = THREE.Vector3;
const Q = new URLSearchParams(location.search);
const DEV = Q.has('dev'), STILL = Q.has('still');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const stage = $('#stage'), canvas = $('#c');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: DEV, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
TEX_OPT.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const GFX_KEY = 'believeit.gfx';
let gfx0 = 'enh';
try { gfx0 = localStorage.getItem(GFX_KEY) || 'enh'; } catch (e) { /* private mode */ }
if (Q.get('gfx')) gfx0 = Q.get('gfx');
setGfx(gfx0 !== 'retro');
const pipe = new PS1Pipeline(renderer);
const shadows = new Shadows(renderer);

await loadPhotos(); // photographed surfaces for the enhanced graphics (decoded once, ~1 s)
const farm = createFarm();
let hutBroken = Q.get('lock') === 'broken';
function setHutLock(b) { hutBroken=!!b; farm.setHutLock(b?'broken':'intact'); const el=$('#b-hut-lock'); el.textContent='Замок будки: '+(b?'взломан':'целый'); el.setAttribute('aria-pressed',b); }
setHutLock(hutBroken);
$('#b-hut-lock').addEventListener('click',()=>setHutLock(!hutBroken));
const scene = farm.scene;
const cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.03, 260);
cam.rotation.order = 'YXZ';
scene.add(cam);
const audio = createAudio();
farm.animals.onSound = (k, p, o) => audio.play(k, p, { ...o, inside: farm.insideAt(p) });
const unlockAudio = () => { if (audio.enabled) audio.unlock(); };
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlockAudio, { passive: true });
const vm = createViewmodel();
cam.add(vm.root, vm.free);
vm.setPose(null);
const base = { lamp: null };

/* ================================================================ state */
const S = { time: 0, last: performance.now(), frames: 0, mode: 'walk', preset: 'day', lantern: false, cut: 'none' };
const P = { pos: new V3(17.5, 0, 21), feet: 0, lvl: 0, yaw: 0, pitch: 0, eye: 1.62, vel: new V3(), bob: 0, climb: null };
const O = { yaw: 0.35, pitch: 0.42, dist: 46, target: new V3(0, 1.5, -4) }; // orbit view
const swing = { x: 0, z: 0, vx: 0, vz: 0 };
const keys = new Set();
const joy = { on: false, id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };

function lookAt(pos, look) {
  const d = new V3(...look).sub(pos);
  P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
}
function goSpot(id) {
  const s = farm.spots.find((x) => x.id === id);
  if (!s) return;
  P.climb = null;
  P.pos.set(s.pos[0], 0, s.pos[2]); P.lvl = s.lvl;
  P.feet = farm.floorAt(s.pos[0], s.pos[2], s.lvl) ?? s.pos[1];
  P.eye = farm.eyeAt(P.pos.x, P.pos.z, P.lvl, P.feet) ?? 1.4;
  lookAt(new V3(s.pos[0], P.feet + P.eye, s.pos[2]), s.look);
  P.vel.set(0, 0, 0);
  if (S.mode !== 'walk') setMode('walk');
  document.querySelectorAll('#spots button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.spot === id));
}
function setPreset(name) {
  S.preset = name;
  farm.setPreset(name);
  document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === name));
}
function setMode(m) {
  S.mode = m;
  stage.dataset.mode = m;
  $('#bar-cut').hidden = m !== 'orbit';
  farm.setWideFog(m === 'orbit');
  if (m === 'walk') setCut('none');
  vm.root.visible = m === 'walk';
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m));
}
function setCut(c) {
  S.cut = c;
  farm.setCutaway(c);
  document.querySelectorAll('[data-cut]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cut === c));
}
function setLantern(on) {
  S.lantern = !!on;
  vm.setPose(S.lantern ? 'lamp' : null);
  if (S.lantern) { vm.props.lamp.setLight('on'); base.lamp = vm.lampPivot.quaternion.clone(); swing.vz = 0.6; }
  $('#b-lamp').setAttribute('aria-pressed', S.lantern);
}
function setQuality(q) {
  const enh = q === 'enh';
  setGfx(enh);
  try { localStorage.setItem(GFX_KEY, enh ? 'enh' : 'retro'); } catch (e) { /* ignore */ }
  farm.setPreset(S.preset);
  if (!enh) shadows.off();
  document.querySelectorAll('[data-gfx]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.gfx === q));
}

/* ================================================================ UI */
const spotsBar = $('#spots');
for (const s of farm.spots) {
  const b = document.createElement('button');
  b.className = 'chip'; b.dataset.spot = s.id; b.textContent = s.label; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => goSpot(s.id));
  spotsBar.appendChild(b);
}
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => setPreset(b.dataset.preset)));
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('[data-cut]').forEach((b) => b.addEventListener('click', () => setCut(b.dataset.cut)));
document.querySelectorAll('[data-gfx]').forEach((b) => b.addEventListener('click', () => setQuality(b.dataset.gfx)));
$('#b-lamp').addEventListener('click', () => setLantern(!S.lantern));
const sndBtn = $('#b-snd');
const syncSnd = () => sndBtn.setAttribute('aria-pressed', audio.enabled);
sndBtn.addEventListener('click', () => { audio.setEnabled(!audio.enabled); syncSnd(); });
syncSnd();
$('#b-use').addEventListener('click', () => act());

let target = null;
function act() {
  if (S.mode !== 'walk' || P.climb) return;
  const res = farm.use(target, cam.position);
  if (res && res.ladder) startClimb(res.ladder);
}
function startClimb(L) { // walk to the ladder foot, then follow its path rung by rung, then step off
  const pts = [new V3(P.pos.x, P.feet, P.pos.z), ...L.path.map((p) => new V3(...p))], segs = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dy = Math.abs(b.y - a.y), dh = Math.hypot(b.x - a.x, b.z - a.z);
    if (dy < 0.3 && dh < 0.02) continue;
    const vert = dy >= 0.3;
    segs.push({ a, b, vert, dur: vert ? 0.3 + dy / 1.0 : Math.max(0.2, dh / 1.2), n: vert ? Math.max(2, Math.round(dy / 0.28)) : 0 });
  }
  P.climb = { L, segs, i: 0, t: 0, yaw0: P.yaw };
  P.vel.set(0, 0, 0);
}

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const k = e.code;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(k)) { keys.add(k); if (k.startsWith('Arrow') && S.mode === 'walk') e.preventDefault(); }
  if (k === 'KeyE' && !e.repeat) act();
  if (k === 'KeyL' && !e.repeat && S.mode === 'walk') setLantern(!S.lantern);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* ================================================================ pointer: look / orbit / touch joystick */
const ptrs = new Map();
let pinch0 = 0, dist0 = 46;
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  if (e.pointerType === 'touch') document.body.classList.add('touch-ui');
  stage.setPointerCapture(e.pointerId);
  const rc = stage.getBoundingClientRect(), lx = e.clientX - rc.left, ly = e.clientY - rc.top;
  if (S.mode === 'walk' && e.pointerType === 'touch' && lx < rc.width * 0.42 && ly > rc.height * 0.35 && !joy.on) {
    Object.assign(joy, { on: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
    return;
  }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = O.dist; }
});
stage.addEventListener('pointermove', (e) => {
  if (joy.on && e.pointerId === joy.id) {
    let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0; const L = Math.hypot(dx, dy), M = 52;
    if (L > M) { dx *= M / L; dy *= M / L; }
    joy.dx = dx / M; joy.dy = dy / M;
    $('#joy i').style.transform = `translate(${dx}px, ${dy}px)`;
    return;
  }
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0 && S.mode === 'orbit') O.dist = clamp(dist0 * (pinch0 / d), 8, 110); return; }
  const k = e.pointerType === 'touch' ? 0.0065 : 0.0045;
  if (S.mode === 'walk') {
    P.yaw -= dx * k; P.pitch = clamp(P.pitch - dy * k, -1.35, 1.35);
    swing.vz += dx * k * 4;
  } else { O.yaw -= dx * 0.006; O.pitch = clamp(O.pitch + dy * 0.005, 0.08, 1.5); }
});
const up = (e) => {
  if (joy.on && e.pointerId === joy.id) { joy.on = false; joy.dx = joy.dy = 0; $('#joy i').style.transform = ''; }
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0;
};
stage.addEventListener('pointerup', up);
stage.addEventListener('pointercancel', up);
stage.addEventListener('wheel', (e) => { if (S.mode !== 'orbit') return; e.preventDefault(); O.dist = clamp(O.dist * Math.exp(e.deltaY * 0.0012), 8, 110); }, { passive: false });

/* ================================================================ layout */
let CW = 1, CH = 1;
function layout() {
  const r = stage.getBoundingClientRect();
  CW = Math.max(2, Math.floor(r.width)); CH = Math.max(2, Math.floor(r.height));
  renderer.setSize(CW, CH, false);
}
new ResizeObserver(layout).observe(stage);
layout();

/* ================================================================ walking */
const RAD = 0.22;
const _v = new V3(), _c = new V3(), _d = new V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), XA = new V3(1, 0, 0);
function tryMove(dx, dz) {
  const np = new V3(P.pos.x + dx, 0, P.pos.z + dz);
  farm.collide(np, RAD, P.lvl);
  const fy = farm.floorAt(np.x, np.z, P.lvl);
  if (fy === null || fy - P.feet > 0.45 || !farm.standOK(np.x, np.z, P.lvl, fy, RAD)) return false;
  P.pos.x = np.x; P.pos.z = np.z;
  return true;
}
function stepPlayer(dt) {
  if (P.climb) {
    const C = P.climb, L = C.L, sg = C.segs[C.i];
    C.t = Math.min(1, C.t + dt / sg.dur);
    // vertical segments advance rung by rung (velocity drops to zero at every rung)
    const u = sg.vert ? C.t - Math.sin(2 * Math.PI * sg.n * C.t) / (2 * Math.PI * sg.n) : smooth(C.t);
    P.pos.set(lerp(sg.a.x, sg.b.x, u), 0, lerp(sg.a.z, sg.b.z, u));
    P.feet = lerp(sg.a.y, sg.b.y, u);
    if (C.i === 0) { let d = L.yaw - C.yaw0; d = Math.atan2(Math.sin(d), Math.cos(d)); P.yaw = C.yaw0 + d * smooth(C.t); } else P.yaw = L.yaw;
    const last = C.i === C.segs.length - 1, pt = sg.vert ? (L.up ? 0.32 : -0.55) : last ? 0 : P.pitch;
    P.pitch += (pt - P.pitch) * Math.min(1, dt * 3.5);
    P.eye = lerp(P.eye, sg.vert ? 1.45 : 1.55, Math.min(1, dt * 4));
    if (sg.vert && !reduced) P.bob += dt * 5;
    if (C.t >= 1) {
      C.i++; C.t = 0;
      if (C.i >= C.segs.length) {
        const e = sg.b; P.lvl = L.up ? 1 : 0; P.pos.set(e.x, 0, e.z); P.feet = farm.floorAt(e.x, e.z, P.lvl) ?? e.y; P.climb = null;
      }
    }
    return 0;
  }
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (joy.on) { f -= joy.dy; s += joy.dx; }
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || (joy.on && Math.hypot(joy.dx, joy.dy) > 0.92);
  const L = Math.hypot(f, s); if (L > 1) { f /= L; s /= L; }
  const sp = (run ? 2.6 : 1.45) * (P.lvl === 1 ? 0.8 : 1);
  const fw = _v.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), rt = _c.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const want = _d.set(0, 0, 0).addScaledVector(fw, f * sp).addScaledVector(rt, s * sp);
  P.vel.lerp(want, Math.min(1, dt * 9));
  const mv = P.vel.length() * dt, n = Math.max(1, Math.ceil(mv / 0.07));
  for (let i = 0; i < n; i++) {
    const dx = (P.vel.x * dt) / n, dz = (P.vel.z * dt) / n;
    if (!tryMove(dx, dz)) { if (!tryMove(dx, 0)) tryMove(0, dz); }
  }
  const fy = farm.floorAt(P.pos.x, P.pos.z, P.lvl) ?? P.feet;
  P.feet += (fy - P.feet) * Math.min(1, dt * 14);
  if (Math.abs(fy - P.feet) < 0.002) P.feet = fy;
  P.lvl = farm.levelAfter(P.pos, P.lvl, P.feet);
  const eye = farm.eyeAt(P.pos.x, P.pos.z, P.lvl, P.feet) ?? 1.1;
  P.eye += (eye - P.eye) * Math.min(1, dt * 8);
  return P.vel.length();
}

// footsteps: a sound per stride, and boot prints in the snow / mud outside
const STEP = { acc: 0, side: 1 };
function stepFx(dt, speed) {
  if (P.climb || speed < 0.25) { STEP.acc = Math.min(STEP.acc, 0.45); return; }
  const run = speed > 2.0;
  STEP.acc += speed * dt;
  if (STEP.acc < (run ? 0.8 : 0.64)) return;
  STEP.acc = 0; STEP.side = -STEP.side;
  const surface = farm.surfaceAt(P.pos.x, P.pos.z, P.lvl);
  audio.play('step', null, { surface, run, vol: run ? 0.8 : 0.55 });
  const out = P.lvl === 0 && !farm.insideAt(new V3(P.pos.x, P.feet + 1, P.pos.z));
  if (out && P.feet < farm.height(P.pos.x, P.pos.z) + 0.05) farm.prints.add(P.pos.x, P.pos.z, Math.atan2(-P.vel.x, -P.vel.z), STEP.side, { run });
}

function roomName() {
  const x = P.pos.x, z = P.pos.z;
  if (P.lvl === 1) return x > 11.3 ? ROOMS.loft.name : ROOMS.attic.name;
  for (const id of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r8', 'r7', 'r10', 'r11', 'r9', 'hut']) {
    const R = ROOMS[id];
    if (x >= R.x0 - 0.1 && x <= R.x1 + 0.1 && z >= R.z0 - 0.1 && z <= R.z1 + 0.1) return R.name;
  }
  if (z < -34) return 'Опушка леса';
  if (x > YARD.fenceW && x < YARD.fenceE && z > YARD.fenceN && z < YARD.fenceS) return 'Двор';
  return 'Поле за хутором';
}

/* ================================================================ frame */
const hintEl = $('#hint'), msgEl = $('#msg'), roomEl = $('#room');
let lastHint = '', lastMsg = '', lastRoom = '';
function frame(now) {
  const rdt = clamp((now - S.last) / 1000, 0, 0.05);
  S.last = now;
  const dt = STILL ? 0 : rdt;
  S.time += dt;
  cam.aspect = CW / CH; cam.updateProjectionMatrix();
  let speed = 0;
  if (S.mode === 'walk') {
    speed = stepPlayer(STILL ? 0 : rdt);
    if (!STILL) stepFx(rdt, speed);
    if (!reduced && !STILL) P.bob += rdt * speed * 4.6; 
    const bob = reduced ? 0 : Math.sin(P.bob) * 0.014 * clamp(speed / 1.45, 0, 1.2);
    cam.position.set(P.pos.x, P.feet + P.eye + bob, P.pos.z);
    cam.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
    cam.fov = 62; cam.near = 0.05;
  } else {
    const t = O.target;
    cam.position.set(t.x + Math.sin(O.yaw) * Math.cos(O.pitch) * O.dist, t.y + Math.sin(O.pitch) * O.dist, t.z + Math.cos(O.yaw) * Math.cos(O.pitch) * O.dist);
    cam.lookAt(t);
    cam.fov = 45; cam.near = 0.3;
  }
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  const pin = farm.insideAt(cam.position);
  const st = farm.update(dt, S.time, cam, { lvl: S.mode === 'walk' ? P.lvl : 0, orbit: S.mode === 'orbit', snap: STILL || S.frames < 2,
    player: S.mode === 'walk' ? { pos: P.pos, feet: P.feet, lvl: P.lvl, inside: pin } : null });
  audio.update(cam, S.mode === 'walk' && pin, { day: 0.35, dusk: 0.55, night: 0.8 }[S.preset] ?? 0.5);
  // lantern: hangs from the left hand, swings as a damped pendulum
  vm.root.position.set(0, 0, 0);
  if (S.mode === 'walk' && S.lantern) {
    if (!STILL) {
      swing.vz += (-swing.z * 26 - swing.vz * 2.6 + Math.sin(P.bob) * speed * 0.6) * rdt; swing.z += swing.vz * rdt;
      swing.vx += (-swing.x * 26 - swing.vx * 2.6 + Math.sin(S.time * 1.3) * 0.25 + Math.cos(P.bob * 0.5) * speed * 0.3) * rdt; swing.x += swing.vx * rdt;
    }
    const level = _q.setFromAxisAngle(XA, -P.pitch);
    vm.lampPivot.quaternion.copy(level).multiply(_q2.setFromEuler(new THREE.Euler(swing.x * 0.35, 0, swing.z * 0.35))).multiply(base.lamp);
  }
  vm.update(S.time);
  const lamp = vm.props.lamp;
  lamp.update(S.time, STILL);
  const fl = S.mode === 'walk' && S.lantern ? vm.flameWorld() : null, li = fl ? lamp.lightInfo() : null;
  if (fl && li) { LIGHTS.uPtPos.value[0].copy(fl); LIGHTS.uPtCol.value[0].setRGB(...li.col); LIGHTS.uPtRange.value[0] = 6.5 * li.range; LIGHTS.uPtBox.value[0].set(-1e4, -1e4, 1e4, 1e4); }
  else LIGHTS.uPtCol.value[0].setRGB(0, 0, 0);
  // interaction hint
  if (S.mode === 'walk' && !P.climb) {
    const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
    target = farm.nearest(cam.position, dir, P.lvl);
  } else target = null;
  const h = target ? target.label : '';
  if (h !== lastHint) { lastHint = h; hintEl.innerHTML = h ? `<kbd>E</kbd>${h[0].toUpperCase() + h.slice(1)}` : ''; }
  const m = farm.message;
  if (m !== lastMsg) { lastMsg = m; msgEl.textContent = m; }
  const rn = S.mode === 'walk' ? roomName() : 'Обзор хутора';
  if (rn !== lastRoom) { lastRoom = rn; roomEl.textContent = rn; }
  // render
  renderer.setClearColor(new THREE.Color(0, 0, 0), 1);
  const pr = farm.preset;
  if (GFX.enh) {
    if (S.mode === 'walk') {
      const fw = _v.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      const center = _c.copy(cam.position).addScaledVector(fw, st.inside > 0.5 ? 6 : 11); center.y = 0;
      const a = clamp(-P.pitch * 0.5 + 0.5, 0.3, 1.1);
      const spot = fl && li ? { pos: fl, dir: _d.copy(fw).multiplyScalar(Math.cos(a)).setY(-Math.sin(a)) } : null;
      shadows.render(scene, { center, half: st.inside > 0.5 ? 16 : 22, sun: true, spot });
    } else shadows.render(scene, { center: _c.set(O.target.x, 0, O.target.z), half: 34, sun: true, spot: null });
    const L0 = pr.look, k = 1 + (FARM_PRESETS[S.preset].adapt || 0) * st.inside;
    pipe.look = L0 ? { ...L0, expo: (L0.expo || 1) * k } : pipe.look;
  } else shadows.off();
  pipe.setSize(renderer.domElement.width, renderer.domElement.height, 240, 240);
  pipe.render(scene, cam, { vhs: GFX.enh ? 0 : 0.35, dither: 1, time: S.time, osd: null });
  if (++S.frames === 4) window.__ready = true;
  requestAnimationFrame(frame);
}

/* ================================================================ start */
setPreset(['day', 'dusk', 'night'].includes(Q.get('preset')) ? Q.get('preset') : 'day');
setQuality(GFX.enh ? 'enh' : 'retro');
setMode(Q.get('mode') === 'orbit' ? 'orbit' : 'walk');
goSpot(Q.get('spot') || 'gate');
if (Q.get('mode') === 'orbit') setMode('orbit');
// Queue shader variants together instead of blocking on each variant in the first frame.
// Three.js r170: https://github.com/mrdoob/three.js/blob/r170/docs/api/en/renderers/WebGLRenderer.html
if (renderer.getContext().getExtension('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, cam);
requestAnimationFrame(frame);

if (DEV) {
  window.__dbg = { farm, P, O, S, cam, renderer, THREE, audio, SYNTH };
  window.__set = (o = {}) => {
    if (o.hutLock) setHutLock(o.hutLock === 'broken');
    if (o.gfx) setQuality(o.gfx);
    if (o.preset) setPreset(o.preset);
    if (o.spot) goSpot(o.spot);
    if (o.cam) { // { pos: [x, feetY?, z], look: [x, y, z], lvl }
      P.lvl = o.cam.lvl || 0; P.pos.set(o.cam.pos[0], 0, o.cam.pos[2]);
      P.feet = farm.floorAt(P.pos.x, P.pos.z, P.lvl) ?? o.cam.pos[1];
      P.eye = o.cam.eye ?? farm.eyeAt(P.pos.x, P.pos.z, P.lvl, P.feet) ?? 1.4;
      if (o.cam.look) lookAt(new V3(P.pos.x, P.feet + P.eye, P.pos.z), o.cam.look);
      if (S.mode !== 'walk') setMode('walk');
    }
    if (o.mode) setMode(o.mode);
    if (o.orbit) { Object.assign(O, o.orbit); if (o.orbit.target) O.target = new V3(...o.orbit.target); }
    if (o.cut) setCut(o.cut);
    if (o.lantern !== undefined) setLantern(o.lantern);
    if (o.open) for (const id of o.open) { const D = farm.doors.find((d) => d.d.id === id); if (D) { D.target = 1; D.t = 1; D.pivot.rotation.y = D.d.yaw + D.d.swing * 1.62; } }
    if (o.close) for (const id of o.close) { const D = farm.doors.find((d) => d.d.id === id); if (D) { D.target = 0; D.t = 0; D.pivot.rotation.y = D.d.yaw; } }
    if (o.time !== undefined) S.time = o.time;
    return { pos: P.pos.toArray(), feet: P.feet, lvl: P.lvl, info: farm.info() };
  };
  window.__climb = (id, secs = 8) => { // QA: climb a ladder, sample the path
    const L = farm.ladders.find((l) => l.id === id); if (!L) return null;
    startClimb(L); const out = [];
    for (let i = 0; i < Math.round(secs / 0.05) && P.climb; i++) { stepPlayer(0.05); if (i % 4 === 0) out.push([+P.pos.x.toFixed(2), +P.feet.toFixed(2), +P.pos.z.toFixed(2)]); }
    return { out, pos: P.pos.toArray(), feet: P.feet, lvl: P.lvl, done: !P.climb };
  };
  window.__walk = (keysDown, secs) => { // simulate walking for QA: returns the final position
    const ks = new Set(keysDown);
    for (const k of ks) keys.add(k);
    const n = Math.round(secs / 0.033);
    for (let i = 0; i < n; i++) stepFx(0.033, stepPlayer(0.033));
    for (const k of ks) keys.delete(k);
    return { pos: P.pos.toArray(), feet: P.feet, lvl: P.lvl, eye: P.eye };
  };
}
