// "Believe It" — farm sounds. Animals play short recorded clips (BigSoundBank.com, Joseph Sardin, CC0 — see samples.js)
// with a little random pitch; the WebAudio synths below are the fallback until the clips are decoded. Footsteps on snow / mud / boards / stone / straw, and a faint wind. Positional (HRTF-free equal-power
// panners), muffled through walls when the listener and the source are on different sides of them.
import * as THREE from 'three';
import { SAMPLES } from './samples.js';
const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;

function rnd(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function noiseBuffer(ac, secs = 2) {
  const n = Math.round(ac.sampleRate * secs), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
const NB = new WeakMap();
const noiseOf = (ac) => { let b = NB.get(ac); if (!b) { b = noiseBuffer(ac); NB.set(ac, b); } return b; };
function noise(ac, t, dur) { const s = ac.createBufferSource(); s.buffer = noiseOf(ac); s.loop = true; s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return s; }
function osc(ac, type, t, dur) { const o = ac.createOscillator(); o.type = type; o.start(t); o.stop(t + dur + 0.05); return o; }
function bp(ac, f, q) { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; }
function filt(ac, type, f, q = 0.7) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function gain(ac, v = 0) { const g = ac.createGain(); g.gain.value = v; return g; }
// simple attack / hold / release envelope on a gain param
function env(p, t, a, peak, hold, rel, base = 0) { p.setValueAtTime(base, t); p.linearRampToValueAtTime(peak, t + a); p.setValueAtTime(peak, t + a + hold); p.exponentialRampToValueAtTime(Math.max(1e-4, base), t + a + hold + rel); if (!base) p.setValueAtTime(0, t + a + hold + rel + 0.001); }
// a voiced syllable: sawtooth + square mix through two formants
function voice(ac, out, t, dur, f0, f1, form, amp, o = {}) {
  const a = osc(ac, 'sawtooth', t, dur), b = osc(ac, 'square', t, dur), mix = gain(ac, 1), g = gain(ac, 0);
  a.frequency.setValueAtTime(f0, t); a.frequency.exponentialRampToValueAtTime(f1, t + dur);
  b.frequency.setValueAtTime(f0 * 1.003, t); b.frequency.exponentialRampToValueAtTime(f1 * 1.003, t + dur);
  if (o.vib) { const v = osc(ac, 'sine', t, dur), vg = gain(ac, f0 * o.vib); v.frequency.value = o.vibF || 7; v.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency); }
  const bg = gain(ac, 0.35); a.connect(mix); b.connect(bg); bg.connect(mix);
  for (const [f, q, k] of form) { const fl = bp(ac, f, q), fg = gain(ac, k); mix.connect(fl); fl.connect(fg); fg.connect(g); }
  if (o.rasp) { const n = noise(ac, t, dur), nf = bp(ac, form[0][0] * 1.4, 1.2), ng = gain(ac, o.rasp); n.connect(nf); nf.connect(ng); ng.connect(g); }
  env(g.gain, t, o.att ?? 0.006, amp, Math.max(0, dur - (o.att ?? 0.006) - (o.rel ?? 0.05)), o.rel ?? 0.05);
  g.connect(out);
  return dur;
}

/* ---------------------------------------------------------------- the animals */
export const SYNTH = {
  // contented hen: "buk-buk-buk", 2..5 short nasal syllables; rooster's are lower
  cluck(ac, out, t, o = {}) {
    const r = rnd(o.seed || Math.random() * 1e6), n = o.n || 3, lo = o.rooster ? 0.72 : 1;
    let tt = t;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1 && r() < 0.45, d = last ? 0.16 + r() * 0.08 : 0.055 + r() * 0.035, f = (330 + r() * 90) * lo;
      voice(ac, out, tt, d, f * (last ? 1.25 : 1.05), f * (last ? 0.9 : 0.78), [[950 * lo, 4, 1], [2300, 5, 0.55], [3600, 6, 0.2]], last ? 0.5 : 0.42, { rasp: 0.25, rel: d * 0.5 });
      tt += d + 0.07 + r() * 0.12;
    }
    return tt - t;
  },
  // alarm: a loud broken squawk "b-KAAH-kah"
  bawk(ac, out, t, o = {}) {
    const lo = o.rooster ? 0.8 : 1;
    voice(ac, out, t, 0.07, 420 * lo, 520 * lo, [[1000, 4, 1], [2400, 5, 0.6]], 0.45, { rasp: 0.3 });
    voice(ac, out, t + 0.1, 0.34, 720 * lo, 560 * lo, [[1300, 3, 1], [2700, 4, 0.7], [4000, 5, 0.3]], 0.8, { rasp: 0.55, vib: 0.03, vibF: 23, rel: 0.12 });
    voice(ac, out, t + 0.5, 0.16, 600 * lo, 430 * lo, [[1150, 3, 1], [2500, 4, 0.5]], 0.5, { rasp: 0.45, rel: 0.08 });
    return 0.7;
  },
  // "ki-ke-ri-kiiii"
  crow(ac, out, t) {
    const F = [[0, 0.11, 560, 640], [0.16, 0.12, 700, 760], [0.33, 0.14, 660, 720], [0.53, 0.95, 820, 610]];
    for (const [dt, d, a, b] of F) {
      const long = d > 0.5;
      voice(ac, out, t + dt, d, a, b, [[1250, 3, 1], [2700, 4, 0.75], [4200, 5, 0.3]], long ? 0.75 : 0.6, { rasp: 0.5, vib: long ? 0.025 : 0, vibF: 9, att: 0.02, rel: long ? 0.35 : 0.04 });
    }
    return 1.55;
  },
  // lowing: "mmmm-ooooh", a low sawtooth with a mouth-opening formant sweep
  moo(ac, out, t, o = {}) {
    const r = rnd((o.seed || Math.random()) * 9973 + 1), dur = Math.min(2.6, Math.max(1.3, o.dur || 1.8)), f = 92 + r() * 26;
    const a = osc(ac, 'sawtooth', t, dur), b = osc(ac, 'sawtooth', t, dur), g = gain(ac, 0), mix = gain(ac, 1);
    a.frequency.setValueAtTime(f * 0.9, t); a.frequency.linearRampToValueAtTime(f * 1.12, t + dur * 0.35); a.frequency.linearRampToValueAtTime(f * 0.86, t + dur);
    b.frequency.setValueAtTime(f * 1.8, t); b.frequency.linearRampToValueAtTime(f * 2.25, t + dur * 0.35); b.frequency.linearRampToValueAtTime(f * 1.71, t + dur);
    const bg = gain(ac, 0.3); a.connect(mix); b.connect(bg); bg.connect(mix);
    const f1 = filt(ac, 'lowpass', 300, 6), f2 = bp(ac, 900, 3), g2 = gain(ac, 0.35);
    f1.frequency.setValueAtTime(260, t); f1.frequency.linearRampToValueAtTime(820, t + dur * 0.4); f1.frequency.linearRampToValueAtTime(420, t + dur);
    f2.frequency.setValueAtTime(700, t); f2.frequency.linearRampToValueAtTime(1150, t + dur * 0.4); f2.frequency.linearRampToValueAtTime(750, t + dur);
    mix.connect(f1); f1.connect(g); mix.connect(f2); f2.connect(g2); g2.connect(g);
    const n = noise(ac, t, dur), nf = bp(ac, 600, 0.8), ng = gain(ac, 0.12); n.connect(nf); nf.connect(ng); ng.connect(g); // breath
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.3); g.gain.linearRampToValueAtTime(0.85, t + dur * 0.45); g.gain.linearRampToValueAtTime(0.5, t + dur * 0.85); g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = filt(ac, 'lowpass', 1700, 0.5); g.connect(lp); lp.connect(out);
    return dur;
  },
  /* footsteps: surface = snow | mud | wood | stone | straw */
  step(ac, out, t, o = {}) {
    const s = o.surface || 'snow', k = o.run ? 1.25 : 1, r = rnd(Math.random() * 1e6);
    if (s === 'snow') { // crunch: a quick train of bright noise grains
      const n = noise(ac, t, 0.3), h = filt(ac, 'highpass', 900), b = bp(ac, 2400 + r() * 900, 0.9), g = gain(ac, 0);
      n.connect(h); h.connect(b); b.connect(g); g.connect(out);
      let tt = t; g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 9; i++) { const a = (0.18 + r() * 0.3) * k * (1 - i / 11); g.gain.linearRampToValueAtTime(a, tt + 0.004); tt += 0.012 + r() * 0.018; g.gain.linearRampToValueAtTime(a * 0.15, tt); }
      g.gain.linearRampToValueAtTime(0, tt + 0.03);
      const lo = noise(ac, t, 0.12), lf = filt(ac, 'lowpass', 380), lg = gain(ac, 0); lo.connect(lf); lf.connect(lg); lg.connect(out); env(lg.gain, t, 0.01, 0.35 * k, 0.02, 0.08);
      return 0.3;
    }
    if (s === 'mud') { // squelch
      const n = noise(ac, t, 0.3), f = filt(ac, 'lowpass', 600, 4), g = gain(ac, 0);
      f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(1300, t + 0.12); f.frequency.exponentialRampToValueAtTime(400, t + 0.24);
      n.connect(f); f.connect(g); g.connect(out); env(g.gain, t, 0.02, 0.5 * k, 0.06, 0.15);
      return 0.3;
    }
    if (s === 'straw') { // rustle
      const n = noise(ac, t, 0.35), f = filt(ac, 'highpass', 2500), g = gain(ac, 0);
      n.connect(f); f.connect(g); g.connect(out); env(g.gain, t, 0.03, 0.22 * k, 0.06, 0.2);
      const n2 = noise(ac, t, 0.1), f2 = filt(ac, 'lowpass', 300), g2 = gain(ac, 0); n2.connect(f2); f2.connect(g2); g2.connect(out); env(g2.gain, t, 0.005, 0.3 * k, 0.01, 0.06);
      return 0.35;
    }
    // boards / stone: a dull thump plus a short click; boards add a low resonant knock (and sometimes a creak)
    const wood = s === 'wood', th = osc(ac, 'sine', t, 0.2), tg = gain(ac, 0);
    th.frequency.setValueAtTime(wood ? 125 + r() * 25 : 95, t); th.frequency.exponentialRampToValueAtTime(wood ? 70 : 60, t + 0.12);
    th.connect(tg); tg.connect(out); env(tg.gain, t, 0.003, (wood ? 0.6 : 0.4) * k, 0.01, wood ? 0.13 : 0.07);
    const n = noise(ac, t, 0.08), f = bp(ac, wood ? 900 : 1900, wood ? 1.5 : 0.9), g = gain(ac, 0);
    n.connect(f); f.connect(g); g.connect(out); env(g.gain, t, 0.002, (wood ? 0.32 : 0.45) * k, 0.005, 0.045);
    if (wood && r() < 0.18) { // creak
      const c = osc(ac, 'sawtooth', t + 0.05, 0.3), cf = bp(ac, 1400, 8), cg = gain(ac, 0);
      c.frequency.setValueAtTime(190 + r() * 60, t + 0.05); c.frequency.linearRampToValueAtTime(150 + r() * 80, t + 0.33);
      c.connect(cf); cf.connect(cg); cg.connect(out); env(cg.gain, t + 0.05, 0.05, 0.12, 0.1, 0.12);
    }
    return 0.3;
  },
};

/* ---------------------------------------------------------------- the engine */
export function createAudio() {
  let ac = null, master = null, wind = null, enabled = true, inside = false, outdoor = 1;
  const KEY = 'believeit.sound';
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* private mode */ }
  const VOL = { cluck: 0.2, bawk: 0.32, crow: 0.42, moo: 0.36, step: 0.05, bark: 0.38, chain: 0.22 };
  const REF = { cluck: 1.6, bawk: 2.5, crow: 5, moo: 3.5, step: 1, bark: 4, chain: 1.5 };
  const BANK = {}, LAST = {};
  function loadSamples() {
    for (const [k, L] of Object.entries(SAMPLES)) {
      BANK[k] = [];
      for (const b64 of L) {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        try { const pr = ac.decodeAudioData(u.buffer, (b) => BANK[k].push(b), () => {}); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* old engine */ }
      }
    }
  }
  const pick = (k) => { const L = BANK[k]; let i = Math.floor(Math.random() * L.length); if (L.length > 1 && L[i] === LAST[k]) i = (i + 1) % L.length; return (LAST[k] = L[i]); };
  function sample(kind, out, t, o) {
    const one = (b, at, rate) => { const s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = rate; s.connect(out); s.start(at); return b.duration / rate; };
    const rate = (o.rooster && kind === 'cluck' ? 0.84 : 1) * (0.94 + Math.random() * 0.12);
    const b = pick(kind);
    let d = one(b, t, rate);
    if (kind === 'bark' && b.duration < 0.45) { const b2 = pick(kind); d = 0.36 + one(b2.duration < 0.45 ? b2 : b, t + 0.36, rate); } // a single bark gets its pair
    return d;
  }

  function ensure() {
    if (ac || !AC) return ac;
    ac = new AC();
    master = gain(ac, enabled ? 0.9 : 0);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    loadSamples();
    // wind: looping noise, low-passed, slowly breathing; quieter indoors
    const n = ac.createBufferSource(); n.buffer = noiseOf(ac); n.loop = true;
    const f = filt(ac, 'lowpass', 420, 0.9), g = gain(ac, 0), lfo = ac.createOscillator(), lg = gain(ac, 160);
    lfo.frequency.value = 0.07; lfo.connect(lg); lg.connect(f.frequency);
    n.connect(f); f.connect(g); g.connect(master); n.start(); lfo.start();
    wind = g;
    return ac;
  }
  function unlock() { ensure(); if (ac && ac.state === 'suspended') ac.resume(); }
  const live = () => ac && ac.state === 'running' && enabled;

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (enabled) unlock();
    if (master) master.gain.setTargetAtTime(enabled ? 0.9 : 0, ac.currentTime, 0.05);
  }

  // per frame: listener pose, inside/outside, wind level (0..1 by preset)
  function update(cam, isInside, windK = 0.5) {
    if (!ac) return;
    inside = !!isInside;
    const L = ac.listener, p = cam.position, t = ac.currentTime;
    const fw = cam.getWorldDirection(_f), up = _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(fw.x, t, 0.02); L.forwardY.setTargetAtTime(fw.y, t, 0.02); L.forwardZ.setTargetAtTime(fw.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02); L.upY.setTargetAtTime(up.y, t, 0.02); L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fw.x, fw.y, fw.z, up.x, up.y, up.z); }
    outdoor += ((inside ? 0.25 : 1) - outdoor) * 0.05;
    if (wind) wind.gain.setTargetAtTime(0.05 * windK * outdoor, t, 0.3);
  }
  const _f = new THREE.Vector3(), _u = new THREE.Vector3();

  // play a sound at a world position; o.inside: the source is indoors (muffled when the listener is not, and vice versa)
  function play(kind, pos, o = {}) {
    const rec = BANK[kind] && BANK[kind].length > 0;
    if (!live() || (!rec && !SYNTH[kind])) return;
    const t = ac.currentTime + 0.01, g = gain(ac, VOL[kind] * (o.vol ?? 1));
    let out = g;
    if (pos) {
      const pn = ac.createPanner(); pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = REF[kind]; pn.rolloffFactor = 1.1; pn.maxDistance = 80;
      if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; } else pn.setPosition(pos.x, pos.y, pos.z);
      const wall = o.inside !== undefined && !!o.inside !== inside;
      if (wall) { const lp = filt(ac, 'lowpass', 650); g.connect(lp); const wg = gain(ac, 0.45); lp.connect(wg); wg.connect(pn); } else g.connect(pn);
      pn.connect(master);
    } else g.connect(master);
    const dur = rec ? sample(kind, out, t, o) : SYNTH[kind](ac, out, t, o);
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, (dur + 1.5) * 1000);
  }

  return { unlock, play, update, setEnabled, get enabled() { return enabled; }, get ctx() { return ac; }, get bank() { return Object.fromEntries(Object.entries(BANK).map(([k, v]) => [k, v.length])); } };
}
