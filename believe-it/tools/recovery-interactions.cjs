// Regression checks for the interrupted environment pass. Uses the project's existing dev hooks.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.argv[2] || 'qa/recovery/interactions');
if (fs.existsSync(out)) throw new Error(`Use a new output directory: ${out}`);
fs.mkdirSync(out, { recursive: true });
const report = { errors: [], warnings: [], externalRequests: [], checks: [], shots: [] };
function check(name, pass, detail) { report.checks.push({ name, pass: !!pass, detail }); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(file:|data:|blob:)/.test(url)) return route.continue();
      report.externalRequests.push(url); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error') report.errors.push(m.text());
      if (m.type() === 'warning' && !report.warnings.includes(m.text())) report.warnings.push(m.text());
    });
    const load = async file => {
      await page.goto(pathToFileURL(path.resolve(root, file)).href + '?dev=1&still=1');
      await page.waitForFunction(() => window.__ready, { timeout: 60000 });
    };
    const shot = async name => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: path.resolve(out, `${name}.png`) }); report.shots.push(`${name}.png`);
    };
    await load('dist/browser/believe_it_farm.html');
    report.runtime = await page.evaluate(() => {
      const { renderer, farm } = window.__dbg, gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { info: farm.info(), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION), detailAreas: farm.ctx.detailAreas };
    });
    await page.evaluate(() => {
      const { farm, cam } = window.__dbg, update = farm.update.bind(farm);
      farm.update = () => ({ inside: 0, lvlCam: 0 });
      window.__recoveryStep = (n = 1, dt = .01) => { for (let i = 0; i < n; i++) update(dt, 0, cam, { lvl: 0, snap: true }); };
      window.__recoveryDoorState = id => {
        const d = farm.doors.find(d => d.d.id === id);
        return { t: d.t, target: d.target, release: d.releaseT, hasp: d.haspT, bolt: d.boltT, pending: d.pendingOpen, solid: d.solid.on };
      };
      window.__recoveryView = (id, back = false) => {
        const { farm, THREE } = window.__dbg, d = farm.doors.find(d => d.d.id === id);
        const frame = new THREE.Object3D(); frame.position.set(...d.d.hinge); frame.rotation.y = d.d.yaw; frame.updateMatrixWorld(true);
        const look = new THREE.Vector3(d.d.w - .02, 1.05, .01).applyMatrix4(frame.matrixWorld);
        const p = new THREE.Vector3(d.d.w - .09, .05, back ? -.72 : .72).applyMatrix4(frame.matrixWorld);
        window.__set({ cam: { pos: p.toArray(), look: look.toArray(), eye: 1.05 } });
      };
    });
    const state = id => page.evaluate(id => window.__recoveryDoorState(id), id);
    const step = n => page.evaluate(n => window.__recoveryStep(n), n);
    const use = id => page.evaluate(id => { const { farm, cam } = window.__dbg; return farm.use({ kind: 'door', D: farm.doors.find(d => d.d.id === id) }, cam.position); }, id);
    const blocked = await use('d16'); check('Intact hut stays locked', !!blocked.msg && (await state('d16')).t === 0, blocked);
    await page.evaluate(() => { window.__set({ hutLock: 'broken' }); window.__recoveryView('d16'); });
    await shot('hut-broken-closed'); await use('d16');
    const padlock = await page.evaluate(() => {
      const { farm, THREE } = window.__dbg, d = farm.doors.find(d => d.d.id === 'd16');
      const staple = d.hardware.fixedHasp.staple.children.find(m => m.geometry?.type === 'TubeGeometry');
      const wires = [];d.hardware.lock.broken.traverse(m => { if (m.geometry?.type === 'TubeGeometry') wires.push(m); });
      let minEyeClearance = Infinity, leafHits = 0, wrongOrder = 0; const phases = [];
      const staplePoints = Array.from({ length: 181 }, (_, i) => staple.geometry.parameters.path.getPoint(i / 180));
      for (let frame = 0; frame <= 700; frame++) {
        window.__recoveryStep(1, .005);
        d.hardware.fixed.updateMatrixWorld(true); d.pivot.updateMatrixWorld(true);
        if ((d.haspT > .001 && d.releaseT < .999) || (d.t > .001 && d.haspT < .99)) wrongOrder++;
        if (frame % 5 === 0) {
          const invLeaf = d.hardware.leafHasp.leaf.matrixWorld.clone().invert();
          const invStaple = staple.matrixWorld.clone().invert();
          for (const wire of wires) for (let i = 0; i <= 180; i++) {
            const world = wire.geometry.parameters.path.getPoint(i / 180).applyMatrix4(wire.matrixWorld);
            const p = world.clone().applyMatrix4(invLeaf);
            // Original probe, extended to the entire opening. This checks the centreline, not all triangles.
            const outsideSlot = ((p.x - 133) / 13) ** 2 + (p.y / 5.8) ** 2 > 1.05;
            if (p.x > 10 && p.x < 142 && Math.abs(p.y) < 14 && Math.abs(p.z) < 1.8 && outsideSlot) leafHits++;
            const q = world.applyMatrix4(invStaple);
            for (const eye of staplePoints) minEyeClearance = Math.min(minEyeClearance, q.distanceTo(eye) - wire.geometry.parameters.radius - staple.geometry.parameters.radius);
          }
        }
        if (frame % 100 === 0) phases.push(window.__recoveryDoorState('d16'));
      }
      return { minEyeClearanceMm: minEyeClearance, leafHits, wrongOrder, phases, end: window.__recoveryDoorState('d16') };
    });
    report.padlock = padlock;
    check('Hut opens after lock removal and hasp release', padlock.wrongOrder === 0 && padlock.end.t > .999, padlock.end);
    check('Broken shackle clears hasp centreline probe', padlock.leafHits === 0, padlock.leafHits);
    check('Broken shackle clears fixed eye with tube radii', padlock.minEyeClearanceMm >= -.1, padlock.minEyeClearanceMm);
    await use('d16'); await step(400); await use('d16');
    for (const [name, n] of [['hut-shackle-quarter', 20], ['hut-shackle-half', 22], ['hut-shackle-withdrawn', 18], ['hut-case-to-shelf', 15], ['hut-hasp-folding', 20]]) {
      await step(n); await shot(name);
    }
    await step(250);
    await shot('hut-open-outside'); await page.evaluate(() => window.__recoveryView('d16', true)); await shot('hut-open-inside');
    await use('d16'); await step(400);
    const shut = await state('d16'); check('Hut closes and returns hardware', shut.t < .001 && shut.hasp < .001 && shut.release < .001 && shut.solid, shut);
    await page.evaluate(() => window.__recoveryView('d16')); await shot('hut-returned');
    await use('d16'); await step(25); await use('d16'); await step(400);
    const cancel = await state('d16'); check('Hut cancellation returns hardware', cancel.t < .001 && cancel.release < .001 && !cancel.pending, cancel);

    await page.evaluate(() => window.__recoveryView('d7', true)); await shot('bolt-closed'); await use('d7');
    await step(35); const slide = await state('d7'); check('Bolt slides before door moves', slide.bolt > .5 && slide.t === 0, slide); await shot('bolt-sliding');
    await step(165); const opened = await state('d7'); check('Bolt door opens', opened.t > .999 && opened.bolt > .999, opened); await shot('bolt-open');
    await page.evaluate(() => window.__recoveryView('d7')); await shot('bolt-open-other-side');
    await page.evaluate(() => { // Return the bolt from its accessible pantry side after the camera settles.
      window.__recoveryView('d7', true);
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await use('d7'); await step(200); const boltShut = await state('d7'); check('Bolt returns after door closes', boltShut.t < .001 && boltShut.bolt < .001 && boltShut.solid, boltShut);
    await page.evaluate(() => window.__recoveryView('d7', true)); await shot('bolt-returned');
    report.doors = await page.evaluate(() => {
      const { farm } = window.__dbg, results = [];
      for (const D of farm.doors.filter(d => !d.hardware && !d.bolt)) {
        const opened = farm.use({ kind: 'door', D }); window.__recoveryStep(200);
        const passOpen = opened.msg ? D.t === 0 : D.t > .999 && !D.solid.on;
        if (!opened.msg) farm.use({ kind: 'door', D }); window.__recoveryStep(200);
        results.push({ id: D.d.id, pass: passOpen && D.t < .001 && D.solid.on, blocked: !!opened.msg });
      }
      return results;
    });
    check('All ordinary doors and paired gates cycle', report.doors.every(d => d.pass), report.doors);
    report.ladders = await page.evaluate(() => window.__dbg.farm.ladders.map(L => {
      const p = L.path[0]; window.__set({ cam: { pos: p, lvl: L.lvl } });
      const result = window.__climb(L.id, 12);
      return { id: L.id, ...result, expectedLevel: L.up ? 1 : 0 };
    }));
    check('All four ladder routes complete at correct level', report.ladders.every(L => L.done && L.lvl === L.expectedLevel && L.pos.every(Number.isFinite)), report.ladders);
    report.hutWalk = await page.evaluate(() => {
      const { farm, THREE } = window.__dbg, D = farm.doors.find(d => d.d.id === 'd16');
      D.target = 0; window.__recoveryStep(400);
      const start = { pos: [4.72, .05, -13.90], look: [2.6, 1.4, -13.90] };
      window.__set({ cam: start }); window.__dbg.P.vel.set(0, 0, 0); const blocked = window.__walk(['KeyW'], .75);
      farm.use({ kind: 'door', D }); window.__recoveryStep(400);
      window.__set({ cam: start }); window.__dbg.P.vel.set(0, 0, 0); const through = window.__walk(['KeyW'], .75);
      return { blocked, through };
    });
    check('Open hut entrance permits walking across wall', report.hutWalk.blocked.pos[0] > 4 && report.hutWalk.through.pos[0] < 3.9, report.hutWalk);
    check('Farm controls have accessible names', await page.getByRole('button', { name: 'Ночь', exact: true }).count() === 1);
    await load('dist/browser/believe_it_hands.html');
    report.viewerTabs = [];
    for (const name of ['Руки', 'Лампа', 'Топор', 'Замок', 'Засов', 'Газета', 'Собака', 'Позы', 'В игре']) {
      await page.getByRole('tab', { name, exact: true }).click(); await shot(`viewer-tab-${report.viewerTabs.length}`); report.viewerTabs.push(name);
    }
    await page.getByRole('tab', { name: 'Замок', exact: true }).click(); await page.getByRole('button', { name: 'Пробой', exact: true }).click();
    for (const name of ['Целый', 'Взломан']) {
      await page.getByRole('button', { name, exact: true }).click();
      for (const [side, angle] of [['front', 0], ['side', 1.25], ['back', Math.PI]]) {
        await page.evaluate(angle => window.__set({ hardware: { angle, zoom: 1.6 } }), angle); await shot(`viewer-lock-${name === 'Целый' ? 'intact' : 'broken'}-${side}`);
      }
    }
    check('Farm and viewer run offline without JS errors', report.errors.length === 0 && report.externalRequests.length === 0);
    check('Shader compilation emits no warnings', report.warnings.length === 0, report.warnings.map(w => w.split('\n')[0]));
  } finally {
    fs.writeFileSync(path.resolve(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify({ out, checks: report.checks.length, failed, errors: report.errors, warnings: report.warnings.length, shots: report.shots.length }));
  if (failed.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
