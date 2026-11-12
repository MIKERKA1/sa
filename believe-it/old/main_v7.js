// "Believe It" — hands + lantern + splitting-axe viewer: turnarounds, grip poses, in-game look (PS1 + VHS).
import * as THREE from 'three';
import { PS1Pipeline, LIGHTS, ps1Material } from '../engine/ps1.js';
import { createArms, applyHandPose, hangArm, addWire, setWire } from '../models/hands.js';
import { createViewmodel, POSE_LIST } from '../models/viewmodel.js';
import { makeLamp } from '../models/lamp.js';
import { makeAxe } from '../models/axe.js';
import { createYard } from '../scenes/yard.js';
import { clamp, lerp, deg } from '../engine/util.js';

THREE.ColorManagement.enabled = false;
const V3 = THREE.Vector3;
const Q = new URLSearchParams(location.search);
const DEV = Q.has('dev');
const STILL = Q.has('still');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);

const stage = $('#stage'), canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: DEV, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const pipe = new PS1Pipeline(renderer);

function studio(warm = 0) {
  LIGHTS.uSkyAmb.value.setRGB(0.66, 0.67, 0.7);
  LIGHTS.uGroundAmb.value.setRGB(0.34, 0.32, 0.31);
  LIGHTS.uSunDir.value.set(-0.35, 0.7, 0.62).normalize();
  LIGHTS.uSunCol.value.setRGB(0.62 + warm, 0.6, 0.56);
  LIGHTS.uFogNear.value = 1000; LIGHTS.uFogFar.value = 2000;
  LIGHTS.uPtCol.value[0].setRGB(0, 0, 0); LIGHTS.uPtCol.value[1].setRGB(0, 0, 0);
}

/* ================================================================ mode: model (turnaround) */
const model = (() => {
  const scene = new THREE.Scene();
  const turn = new THREE.Group();
  scene.add(turn);
  const arms = createArms();
  turn.add(arms.group);
  applyHandPose(arms.R, 'relaxed');
  applyHandPose(arms.L, 'relaxed');
  hangArm(arms.R, new V3(0.17, 0.17, 0));
  hangArm(arms.L, new V3(0.17, 0.17, 0)); // mirrored space -> real x = -0.17
  const wire = ps1Material({ line: true, tint: [0.62, 0.86, 1.0], vertexColors: false, fog: 0 });
  addWire(arms.R, wire); addWire(arms.L, wire);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  const target = new V3(0, -0.04, 0);
  const lblPts = { L: new V3(-0.17, -0.3, 0), R: new V3(0.17, -0.3, 0) };
  return { scene, turn, arms, cam, target, lblPts, angle: 0.5, elev: 0.12, zoom: 1, wire: false, spin: !reduced && !STILL };
})();

/* ================================================================ mode: lamp (turnaround, light states, exploded view) */
const LAMP_UI = [
  { id: 'off', key: '1', label: 'Не горит', note: 'Лампа погашена: сажа на верхе стекла, облупленная зелёная краска.' },
  { id: 'on', key: '2', label: 'Горит', note: 'Ровное тёплое пламя — плоский спрайт внутри стекла.' },
  { id: 'low', key: '3', label: 'Слабый огонь', note: 'Керосин кончается: пламя маленькое и дрожит, свет слабее.' },
];
const lampView = (() => {
  const scene = new THREE.Scene();
  const turn = new THREE.Group();
  scene.add(turn);
  const L = makeLamp();
  turn.add(L.group);
  const wire = ps1Material({ line: true, tint: [0.62, 0.86, 1.0], vertexColors: false, fog: 0 });
  L.addWire(wire);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  return { scene, turn, L, cam, angle: 0.55, elev: 0.2, zoom: 1, wire: false, spin: !reduced && !STILL, explode: 0, exT: 0, state: 'on' };
})();

/* ================================================================ mode: axe (turnaround, exploded view) */
const axeView = (() => {
  const scene = new THREE.Scene();
  const tilt = new THREE.Group(), turn = new THREE.Group(); // tilt (screen roll, sheet hero shot) pivots at the middle of the axe
  tilt.position.set(0, 0.353, 0); turn.position.set(0, -0.353, 0);
  scene.add(tilt); tilt.add(turn);
  const A = makeAxe();
  turn.add(A.group);
  const wire = ps1Material({ line: true, tint: [0.62, 0.86, 1.0], vertexColors: false, fog: 0 });
  A.addWire(wire);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  return { scene, tilt, turn, A, cam, angle: -0.5, elev: 0.16, zoom: 1, wire: false, spin: !reduced && !STILL, explode: 0, exT: 0, roll: 0, frame: null };
})();

/* ================================================================ mode: poses */
const poses = (() => {
  const scene = new THREE.Scene();
  const vm = createViewmodel();
  scene.add(vm.root);
  const cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.01, 40);
  return { scene, vm, cam, id: 'door', info: null, yaw: 0, pitch: 0, zoom: 1 };
})();

/* ================================================================ mode: game */
const GAME = {
  A: { preset: 'dusk', pos: [1.4, 1.62, 5.2], look: [-1.8, 1.3, -10], pose: null, label: 'Пустые руки', note: 'Руки пустые — на экране только точка в центре.' },
  B: { preset: 'night', pos: [3.6, 1.62, -6.4], look: [4.9, 1.05, -14], pose: 'lamp', lamp: 'on', label: 'Ночь · лампа', note: 'Левая рука появляется только с ночной лампой. Тёплый круг света — около 3–4 м.' },
  C: { preset: 'day', pos: [-2.2, 1.62, 1.8], look: [3.2, 0.9, -13], pose: 'bucket', label: 'День · ведро', note: 'Правая рука — для предметов и коротких действий.' },
  D: { preset: 'night', pos: [3.6, 1.62, -6.4], look: [4.6, 0.25, -14], pose: 'lamp', lamp: 'low', label: 'Ночь · слабый огонь', note: 'Керосин на исходе: пламя дрожит, круг света меньше и тусклее.' },
  E: { preset: 'day', pos: [0.9, 1.62, -8.3], look: [-1.0, 0.55, -11.8], pose: 'axe', axe: null, label: 'День · топор у колоды', note: 'Топор в обеих руках у колоды и поленницы.' },
  F: { preset: 'night', pos: [6.75, 1.62, -12.45], look: [6.98, 0.42, -13.95], pose: 'lamp', lamp: 'on', axe: 'wall', label: 'Ночь · топор у сарая', note: 'Топор прислонён к стене сарая, лампа выхватывает его из темноты.' },
};
const game = (() => {
  const yard = createYard();
  const cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.02, 230);
  cam.rotation.order = 'YXZ';
  yard.scene.add(cam);
  const vm = createViewmodel();
  cam.add(vm.root);
  return { yard, cam, vm, id: 'A', yaw0: 0, pitch0: 0, yaw: 0, pitch: 0, t0: 0, vhs: true, swing: { x: 0, z: 0, vx: 0, vz: 0 }, base: {}, clock: 0 };
})();

/* ================================================================ state + UI */
const S = { mode: Q.get('mode') || 'model', time: 0, last: performance.now(), burst: 0, frames: 0 };
if (!['model', 'lamp', 'axe', 'poses', 'game'].includes(S.mode)) S.mode = 'model';

const tabs = [...document.querySelectorAll('[data-mode]')];
const bars = { model: $('#bar-model'), lamp: $('#bar-lamp'), axe: $('#bar-axe'), poses: $('#bar-poses'), game: $('#bar-game') };
const note = $('#note');
const lbl = { L: $('#lbl-l'), R: $('#lbl-r') };

function setMode(m) {
  S.mode = m;
  tabs.forEach((b) => { const on = b.dataset.mode === m; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  for (const k of Object.keys(bars)) bars[k].hidden = k !== m;
  stage.dataset.mode = m;
  if (m === 'poses') setPose(poses.id, true);
  if (m === 'game') setGame(game.id, true);
  if (m === 'model') note.textContent = 'Тяните, чтобы повернуть. Колесо или щипок — масштаб.';
  if (m === 'lamp') setLampState(lampView.state);
  if (m === 'axe') note.textContent = 'Колун: ясеневое топорище 70 см, чугунный обух, обмотка бечёвкой. Тяните, чтобы повернуть.';
  stage.dataset.explode = (m === 'lamp' && lampView.explode) || (m === 'axe' && axeView.explode) ? '1' : '0';
  layout();
}
tabs.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = tabs.findIndex((b) => b.dataset.mode === S.mode), j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  setMode(tabs[j].dataset.mode); tabs[j].focus(); e.preventDefault();
});

// model bar
const tri = model.arms.R.tris + model.arms.L.tris;
$('#tris').textContent = `${model.arms.R.tris} + ${model.arms.L.tris} = ${tri} треуг.`;
const tWire = $('#t-wire'), tSpin = $('#t-spin');
function syncToggles() {
  tWire.setAttribute('aria-pressed', model.wire); tSpin.setAttribute('aria-pressed', model.spin);
  setWire(model.arms.R, model.wire); setWire(model.arms.L, model.wire);
}
tWire.addEventListener('click', () => { model.wire = !model.wire; syncToggles(); });
tSpin.addEventListener('click', () => { model.spin = !model.spin; syncToggles(); });
$('#m-reset').addEventListener('click', () => { model.angle = 0.5; model.elev = 0.12; model.zoom = 1; });
syncToggles();

// lamp bar
const lampWrap = $('#lampst');
for (const p of LAMP_UI) {
  const b = document.createElement('button');
  b.className = 'chip'; b.dataset.lamp = p.id;
  b.innerHTML = `<span class="k">${p.key}</span>${p.label}`;
  b.addEventListener('click', () => setLampState(p.id));
  lampWrap.appendChild(b);
}
$('#l-tris').textContent = `${lampView.L.tris} треуг. · текстуры 128² + 64×32`;
const lEx = $('#l-ex'), lWire = $('#l-wire'), lSpin = $('#l-spin');
const plbls = [...document.querySelectorAll('[data-lamp-part]')];
// axe bar
$('#a-tris').textContent = `${axeView.A.tris} треуг. · атлас 128², без фильтрации`;
const aEx = $('#a-ex'), aWire = $('#a-wire'), aSpin = $('#a-spin');
const albls = [...document.querySelectorAll('[data-axe-part]')];
function syncAxe() {
  aEx.setAttribute('aria-pressed', !!axeView.explode); aWire.setAttribute('aria-pressed', axeView.wire); aSpin.setAttribute('aria-pressed', axeView.spin);
  axeView.A.setWire(axeView.wire);
  if (S.mode === 'axe') stage.dataset.explode = axeView.explode ? '1' : '0';
}
aEx.addEventListener('click', () => { axeView.explode = axeView.explode ? 0 : 1; syncAxe(); });
aWire.addEventListener('click', () => { axeView.wire = !axeView.wire; syncAxe(); });
aSpin.addEventListener('click', () => { axeView.spin = !axeView.spin; syncAxe(); });
$('#a-reset').addEventListener('click', () => { axeView.angle = -0.5; axeView.elev = 0.16; axeView.zoom = 1; });
syncAxe();
function syncLamp() {
  lEx.setAttribute('aria-pressed', !!lampView.explode); lWire.setAttribute('aria-pressed', lampView.wire); lSpin.setAttribute('aria-pressed', lampView.spin);
  lampView.L.setWire(lampView.wire);
  if (S.mode === 'lamp') stage.dataset.explode = lampView.explode ? '1' : '0';
}
lEx.addEventListener('click', () => { lampView.explode = lampView.explode ? 0 : 1; syncLamp(); });
lWire.addEventListener('click', () => { lampView.wire = !lampView.wire; syncLamp(); });
lSpin.addEventListener('click', () => { lampView.spin = !lampView.spin; syncLamp(); });
$('#l-reset').addEventListener('click', () => { lampView.angle = 0.55; lampView.elev = 0.2; lampView.zoom = 1; });
function setLampState(id) {
  lampView.state = id;
  lampView.L.setLight(id);
  lampWrap.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lamp === id));
  if (S.mode === 'lamp') note.textContent = `${LAMP_UI.find((p) => p.id === id).note} Тяните, чтобы повернуть.`;
}
syncLamp();

// poses bar
const poseWrap = $('#poses');
for (const p of POSE_LIST) {
  const b = document.createElement('button');
  b.className = 'chip'; b.dataset.pose = p.id;
  b.innerHTML = `<span class="k">${p.key}</span>${p.label}`;
  b.addEventListener('click', () => setPose(p.id));
  poseWrap.appendChild(b);
}
$('#p-reset').addEventListener('click', () => { poses.yaw = 0; poses.pitch = 0; poses.zoom = 1; });
function setPose(id, keepView = false) {
  poses.id = id;
  poses.info = poses.vm.setPose(id);
  if (!keepView) { poses.yaw = 0; poses.pitch = 0; poses.zoom = 1; }
  poseWrap.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.pose === id));
  const P = POSE_LIST.find((p) => p.id === id);
  note.textContent = `${P.note}. Лампа и топор — готовые модели, остальные предметы пока серые заглушки. Тяните, чтобы облететь кисть.`;
}

// game bar
const gameWrap = $('#game');
for (const k of Object.keys(GAME)) {
  const b = document.createElement('button');
  b.className = 'chip'; b.dataset.game = k;
  b.innerHTML = `<span class="k">${k}</span>${GAME[k].label}`;
  b.addEventListener('click', () => setGame(k));
  gameWrap.appendChild(b);
}
const tVhs = $('#t-vhs');
tVhs.addEventListener('click', () => { game.vhs = !game.vhs; tVhs.setAttribute('aria-pressed', game.vhs); });
function setGame(id, quiet = false) {
  const G = GAME[id];
  game.id = id;
  game.yard.setPreset(G.preset);
  game.cam.position.set(...G.pos);
  const d = new V3(...G.look).sub(new V3(...G.pos));
  game.yaw0 = Math.atan2(-d.x, -d.z); game.pitch0 = Math.atan2(d.y, Math.hypot(d.x, d.z));
  game.yaw = game.yaw0; game.pitch = game.pitch0;
  game.vm.setPose(G.pose);
  game.yard.setAxe(G.axe === undefined ? 'block' : G.axe);
  game.vm.props.lamp.setLight(G.lamp || 'on');
  game.base.lamp = game.vm.lampPivot.quaternion.clone();
  game.base.bucket = game.vm.props.bucket.group.quaternion.clone();
  game.swing = { x: 0, z: 0, vx: 0, vz: 0.6 };
  game.t0 = S.time;
  if (!quiet || !reduced) S.burst = reduced ? 0 : 1;
  gameWrap.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.game === id));
  note.textContent = `${G.note} Тяните, чтобы осмотреться.`;
}

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (S.mode === 'poses') { const p = POSE_LIST.find((x) => x.key === e.key); if (p) setPose(p.id); }
  if (S.mode === 'lamp') { const p = LAMP_UI.find((x) => x.key === e.key); if (p) setLampState(p.id); }
  if (S.mode === 'game') { const k = e.key.toUpperCase(); if (GAME[k]) setGame(k); }
});

/* ================================================================ input: drag / wheel / pinch */
const ptrs = new Map();
let pinch0 = 0, zoom0 = 1;
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  stage.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = S.mode === 'model' ? model.zoom : S.mode === 'lamp' ? lampView.zoom : S.mode === 'axe' ? axeView.zoom : poses.zoom; }
});
stage.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0) setZoom(zoom0 * (pinch0 / d));
    return;
  }
  const k = 0.008;
  if (S.mode === 'model') { model.angle += dx * k; model.elev = clamp(model.elev + dy * k * 0.6, -0.35, 0.7); }
  if (S.mode === 'lamp') { lampView.angle += dx * k; lampView.elev = clamp(lampView.elev + dy * k * 0.6, -0.35, 1.4); }
  if (S.mode === 'axe') { axeView.angle += dx * k; axeView.elev = clamp(axeView.elev + dy * k * 0.6, -0.5, 1.5); }
  if (S.mode === 'poses') { poses.yaw -= dx * k; poses.pitch = clamp(poses.pitch - dy * k, -1.2, 1.2); }
  if (S.mode === 'game') {
    const ny = clamp(game.yaw - dx * k * 0.6, game.yaw0 - 0.8, game.yaw0 + 0.8);
    game.swing.vz += (ny - game.yaw) * 6;
    game.yaw = ny;
    game.pitch = clamp(game.pitch - dy * k * 0.6, game.pitch0 - 0.4, game.pitch0 + 0.4);
  }
});
const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
stage.addEventListener('pointerup', up);
stage.addEventListener('pointercancel', up);
function setZoom(z) {
  if (S.mode === 'model') model.zoom = clamp(z, 0.45, 1.8);
  if (S.mode === 'lamp') lampView.zoom = clamp(z, 0.45, 2.2);
  if (S.mode === 'axe') axeView.zoom = clamp(z, 0.45, 2.6);
  if (S.mode === 'poses') poses.zoom = clamp(z, 0.25, 2.5);
}
stage.addEventListener('wheel', (e) => {
  if (S.mode === 'game') return;
  e.preventDefault();
  setZoom((S.mode === 'model' ? model.zoom : S.mode === 'lamp' ? lampView.zoom : S.mode === 'axe' ? axeView.zoom : poses.zoom) * Math.exp(e.deltaY * 0.0012));
}, { passive: false });

/* ================================================================ layout */
let CW = 1, CH = 1;
function layout() {
  const r = stage.getBoundingClientRect();
  let w = r.width, h = r.height;
  if (S.mode !== 'model' && S.mode !== 'lamp' && S.mode !== 'axe') { w = Math.min(r.width, (r.height * 4) / 3); h = (w * 3) / 4; }
  w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  canvas.style.left = Math.floor((r.width - w) / 2) + 'px'; canvas.style.top = Math.floor((r.height - h) / 2) + 'px';
  renderer.setSize(w, h, false);
  CW = w; CH = h;
}
new ResizeObserver(layout).observe(stage);

/* ================================================================ frame */
const _v = new V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), X = new V3(1, 0, 0), Y = new V3(0, 1, 0);
const tc = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.floor(s) % 60].map((n) => String(n).padStart(2, '0')).join(':');

function drawModel(dt) {
  const M = model;
  if (M.spin && ptrs.size === 0) M.angle += dt * 0.45;
  M.turn.rotation.y = M.angle;
  const aspect = CW / CH;
  M.cam.aspect = aspect; M.cam.fov = 30;
  const t = Math.tan(THREE.MathUtils.degToRad(15));
  const dist = (Math.max(0.33 / t, 0.3 / (t * aspect)) / M.zoom) * 1.05;
  M.cam.position.set(0, Math.sin(M.elev) * dist, Math.cos(M.elev) * dist).add(M.target);
  M.cam.lookAt(M.target);
  M.cam.near = 0.05; M.cam.updateProjectionMatrix();
  studio();
  renderer.setClearColor(new THREE.Color(0.6, 0.615, 0.635), 1);
  pipe.setSize(renderer.domElement.width, renderer.domElement.height, 360, 360);
  pipe.render(M.scene, M.cam, { vhs: 0, dither: 1, time: S.time });
  // labels
  M.turn.updateMatrixWorld(true);
  for (const k of ['L', 'R']) {
    _v.copy(M.lblPts[k]).applyMatrix4(M.turn.matrixWorld).project(M.cam);
    const x = (_v.x * 0.5 + 0.5) * CW + canvas.offsetLeft, y = (-_v.y * 0.5 + 0.5) * CH + canvas.offsetTop;
    const yy = Math.min(y + 6, canvas.offsetTop + CH - 30);
    lbl[k].style.transform = `translate(${Math.round(x)}px, ${Math.round(yy)}px) translateX(-50%)`;
  }
}

const _r = new V3();
function drawLamp(dt) {
  const M = lampView, L = M.L;
  if (M.spin && ptrs.size === 0) M.angle += dt * 0.4;
  M.exT = reduced || STILL ? M.explode : M.exT + (M.explode - M.exT) * (1 - Math.exp(-dt * 6));
  L.setExplode(M.exT);
  M.turn.rotation.y = M.angle;
  const aspect = CW / CH, t = Math.tan(deg(15)), ex = M.exT;
  const hh = lerp(0.185, 0.355, ex), hw = lerp(0.12, 0.3, ex);
  const dist = (Math.max(hh / t, hw / (t * aspect)) / M.zoom) * 1.04;
  const target = new V3(0, lerp(-0.148, -0.142, ex), 0);
  M.cam.aspect = aspect; M.cam.fov = 30;
  M.cam.position.set(0, Math.sin(M.elev) * dist, Math.cos(M.elev) * dist).add(target);
  M.cam.lookAt(target);
  M.cam.near = 0.05; M.cam.updateProjectionMatrix();
  studio();
  L.update(S.time, STILL);
  const li = L.lightInfo();
  if (li) { L.flameWorld(LIGHTS.uPtPos.value[0]); LIGHTS.uPtCol.value[0].setRGB(li.col[0] * 0.8, li.col[1] * 0.8, li.col[2] * 0.8); LIGHTS.uPtRange.value[0] = 0.32 * li.range + 0.08; }
  renderer.setClearColor(new THREE.Color(0.47, 0.485, 0.505), 1);
  pipe.setSize(renderer.domElement.width, renderer.domElement.height, 360, 360);
  pipe.render(M.scene, M.cam, { vhs: 0, dither: 1, time: S.time });
  if (ex > 0.5) {
    M.scene.updateMatrixWorld(true);
    _r.set(1, 0, 0).applyQuaternion(M.cam.quaternion);
    for (const el of plbls) {
      const P = L.parts[el.dataset.lampPart];
      P.group.getWorldPosition(_v).addScaledVector(_r, P.hw + 0.014).project(M.cam);
      const x = (_v.x * 0.5 + 0.5) * CW + canvas.offsetLeft, y = (-_v.y * 0.5 + 0.5) * CH + canvas.offsetTop;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateY(-50%)`;
    }
  }
}

function drawAxe(dt) {
  const M = axeView, A = M.A;
  if (M.spin && ptrs.size === 0) M.angle += dt * 0.4;
  M.exT = reduced || STILL ? M.explode : M.exT + (M.explode - M.exT) * (1 - Math.exp(-dt * 6));
  A.setExplode(M.exT);
  M.turn.rotation.y = M.angle;
  const aspect = CW / CH, t = Math.tan(deg(15)), ex = M.exT;
  M.tilt.rotation.z = M.roll;
  let hh = lerp(0.375, 0.45, ex) * lerp(1, 0.55, clamp(Math.abs(M.elev) - 0.6, 0, 1)), hw = lerp(0.15, 0.2, ex);
  if (M.frame) [hh, hw] = M.frame;
  const dist = (Math.max(hh / t, hw / (t * aspect)) / M.zoom) * 1.04;
  const target = new V3(0.01, lerp(0.353, 0.428, ex), 0);
  M.cam.aspect = aspect; M.cam.fov = 30;
  M.cam.position.set(0, Math.sin(M.elev) * dist, Math.cos(M.elev) * dist).add(target);
  M.cam.lookAt(target);
  M.cam.near = 0.05; M.cam.updateProjectionMatrix();
  studio();
  renderer.setClearColor(M.clear ? new THREE.Color(...M.clear) : new THREE.Color(0.5, 0.505, 0.5), 1);
  pipe.setSize(renderer.domElement.width, renderer.domElement.height, 360, 360);
  pipe.render(M.scene, M.cam, { vhs: 0, dither: 1, time: S.time });
  if (ex > 0.5) {
    M.scene.updateMatrixWorld(true);
    _r.set(1, 0, 0).applyQuaternion(M.cam.quaternion);
    for (const el of albls) {
      const P = A.parts[el.dataset.axePart];
      P.group.getWorldPosition(_v).addScaledVector(_r, P.hw + 0.014).project(M.cam);
      const x = (_v.x * 0.5 + 0.5) * CW + canvas.offsetLeft, y = (-_v.y * 0.5 + 0.5) * CH + canvas.offsetTop;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateY(-50%)`;
    }
  }
}

function drawPoses() {
  const P = poses;
  const f = P.info.focus;
  _q.setFromAxisAngle(Y, P.yaw).multiply(_q2.setFromAxisAngle(X, P.pitch));
  if (P.qaDist) P.cam.position.set(0, 0, P.qaDist).applyQuaternion(_q).add(f);
  else P.cam.position.copy(f).negate().multiplyScalar(P.zoom).applyQuaternion(_q).add(f);
  P.cam.quaternion.copy(_q);
  P.cam.aspect = CW / CH; P.cam.updateProjectionMatrix();
  studio(0.02);
  const lamp = P.vm.props.lamp;
  lamp.update(S.time, STILL);
  const fl = P.vm.flameWorld(), li = lamp.lightInfo();
  if (fl && li) { LIGHTS.uPtPos.value[0].copy(fl); LIGHTS.uPtCol.value[0].setRGB(...li.col); LIGHTS.uPtRange.value[0] = 1.4 * li.range; }
  renderer.setClearColor(new THREE.Color(0.42, 0.44, 0.465), 1);
  pipe.setSize(renderer.domElement.width, renderer.domElement.height, 300, 300);
  pipe.render(P.scene, P.cam, { vhs: 0, dither: 1, time: S.time });
}

function drawGame(dt) {
  const G = game, cam = G.cam;
  G.clock += dt;
  cam.rotation.set(G.pitch, G.yaw, 0, 'YXZ');
  // hands rise when an item is taken
  const age = S.time - G.t0, e = reduced ? 1 : 1 - Math.pow(1 - clamp(age / 0.55, 0, 1), 3);
  const breath = STILL ? 0 : Math.sin(S.time * 1.7) * 0.0025;
  G.vm.root.position.set(0, -0.3 * (1 - e) + breath, 0);
  G.vm.root.rotation.set(-0.35 * (1 - e), 0, 0);
  // hanging props keep world-down; swing as a damped pendulum
  const sw = G.swing;
  if (!STILL) {
    sw.vz += (-sw.z * 26 - sw.vz * 2.6) * dt; sw.z += sw.vz * dt;
    sw.vx += (-sw.x * 26 - sw.vx * 2.6 + Math.sin(S.time * 1.3) * 0.25) * dt; sw.x += sw.vx * dt;
  }
  const level = _q.setFromAxisAngle(X, -G.pitch - G.vm.root.rotation.x);
  const swing = _q2.setFromEuler(new THREE.Euler(sw.x * 0.35, 0, sw.z * 0.35));
  G.vm.lampPivot.quaternion.copy(level).multiply(swing).multiply(G.base.lamp);
  G.vm.props.bucket.group.quaternion.copy(level).multiply(_q2.setFromEuler(new THREE.Euler(sw.x * 0.12, 0, sw.z * 0.12))).multiply(G.base.bucket);
  cam.aspect = CW / CH; cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  G.yard.update(STILL ? 0 : dt, S.time, cam);
  const lamp = G.vm.props.lamp;
  lamp.update(S.time, STILL);
  const fl = G.vm.flameWorld(), li = lamp.lightInfo();
  if (fl && li) {
    LIGHTS.uPtPos.value[0].copy(fl); LIGHTS.uPtCol.value[0].setRGB(...li.col); LIGHTS.uPtRange.value[0] = 6.5 * li.range; // warm circle ~3-4 m, cold dark beyond
  } else LIGHTS.uPtCol.value[0].setRGB(0, 0, 0);
  S.burst = Math.max(0, S.burst - dt * 1.6);
  const vhs = G.vhs ? (reduced ? 0.55 : 1) + S.burst * 2.2 : S.burst * 1.5;
  renderer.setClearColor(new THREE.Color(0, 0, 0), 1);
  pipe.setSize(renderer.domElement.width, renderer.domElement.height, 240, 240);
  pipe.render(G.yard.scene, cam, { vhs, dither: 1, time: S.time, osd: G.osd === false ? null : { play: true, time: tc(13 * 60 + 42 + G.clock), dot: true } });
}

function frame(now) {
  const dt = Math.min(0.05, (now - S.last) / 1000);
  S.last = now;
  if (!STILL) S.time += dt;
  if (S.mode === 'model') drawModel(dt);
  else if (S.mode === 'lamp') drawLamp(dt);
  else if (S.mode === 'axe') drawAxe(dt);
  else if (S.mode === 'poses') drawPoses(dt);
  else drawGame(dt);
  if (++S.frames === 4) window.__ready = true;
  requestAnimationFrame(frame);
}

setMode(S.mode);
if (Q.get('pose')) setPose(Q.get('pose'));
if (Q.get('game')) setGame(Q.get('game'));
requestAnimationFrame(frame);

if (DEV) {
  window.__dbg = { game, poses, model, lampView, axeView, renderer, THREE };
  window.__axeProject = (pts) => { // axe-local points -> canvas pixels in the axe view
    axeView.scene.updateMatrixWorld(true);
    return pts.map((p) => { const w = new V3(...p).applyMatrix4(axeView.turn.matrixWorld).project(axeView.cam); return [(w.x * 0.5 + 0.5) * CW, (-w.y * 0.5 + 0.5) * CH]; });
  };
  window.__axeAtlas = () => {
    const pc = axeView.A.atlasPx, c = document.createElement('canvas');
    c.width = pc.w; c.height = pc.h;
    const g = c.getContext('2d'), im = g.createImageData(pc.w, pc.h);
    for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) { // flip: row 0 of the PixelCanvas is the bottom
      const si = (y * pc.w + x) * 4, di = ((pc.h - 1 - y) * pc.w + x) * 4;
      for (let k = 0; k < 4; k++) im.data[di + k] = pc.d[si + k];
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  };
  window.__set = (o = {}) => {
    if (o.mode) setMode(o.mode);
    if (o.pose) setPose(o.pose);
    if (o.game) setGame(o.game);
    if (o.angle !== undefined) model.angle = o.angle;
    if (o.elev !== undefined) model.elev = o.elev;
    if (o.zoom !== undefined) { model.zoom = o.zoom; poses.zoom = o.zoom; }
    if (o.wire !== undefined) { model.wire = o.wire; syncToggles(); lampView.wire = o.wire; syncLamp(); }
    if (o.lamp) setLampState(o.lamp);
    if (o.explode !== undefined) { lampView.explode = o.explode; lampView.exT = o.explode; syncLamp(); }
    if (o.langle !== undefined) lampView.angle = o.langle;
    if (o.lelev !== undefined) lampView.elev = o.lelev;
    if (o.lzoom !== undefined) lampView.zoom = o.lzoom;
    if (o.aangle !== undefined) axeView.angle = o.aangle;
    if (o.aelev !== undefined) axeView.elev = o.aelev;
    if (o.azoom !== undefined) axeView.zoom = o.azoom;
    if (o.aexplode !== undefined) { axeView.explode = o.aexplode; axeView.exT = o.aexplode; syncAxe(); }
    if (o.awire !== undefined) { axeView.wire = o.awire; syncAxe(); }
    if (o.yardAxe !== undefined) game.yard.setAxe(o.yardAxe);
    if (o.preset) game.yard.setPreset(o.preset);
    if (o.osd !== undefined) game.osd = o.osd;
    if (o.aroll !== undefined) axeView.roll = o.aroll;
    if (o.aframe !== undefined) axeView.frame = o.aframe;
    if (o.aclear !== undefined) axeView.clear = o.aclear;
    if (o.aspin !== undefined) axeView.spin = o.aspin;
    if (o.vhs !== undefined) { game.vhs = o.vhs; tVhs.setAttribute('aria-pressed', game.vhs); }
    if (o.vmLamp) { poses.vm.props.lamp.setLight(o.vmLamp); game.vm.props.lamp.setLight(o.vmLamp); }
    if (o.yaw !== undefined) poses.yaw = o.yaw;
    if (o.pitch !== undefined) poses.pitch = o.pitch;
    if (o.look) { game.yaw = game.yaw0 + o.look[0]; game.pitch = game.pitch0 + o.look[1]; }
    if (o.risen) { game.t0 = -10; S.burst = 0; }
    if (o.burst !== undefined) S.burst = o.burst;
    if (o.time !== undefined) S.time = o.time;
    if (o.clock !== undefined) game.clock = o.clock;
    if (o.cam) { game.cam.position.set(o.cam[0], o.cam[1], o.cam[2]); const d = new V3(o.cam[3], o.cam[4], o.cam[5]).sub(game.cam.position); game.yaw0 = game.yaw = Math.atan2(-d.x, -d.z); game.pitch0 = game.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
  };
}
