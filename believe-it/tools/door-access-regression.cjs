// Reproduce pantry bolt access through the real game inputs. No source or release files are changed.
// Usage: node tools/door-access-regression.cjs [new-output-directory] [build-file]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.argv[2] || 'qa/door-access-v11/regression-before');
const build = path.resolve(root, process.argv[3] || 'dist/browser/believe_it_farm.html');
if (!fs.statSync(build).isFile()) throw new Error('Build must be a saved HTML file: ' + build);
if (fs.existsSync(out)) throw new Error('Use a new output directory: ' + out);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.mkdirSync(out);

const bytes = fs.readFileSync(build);
const report = {
  started: new Date().toISOString(), build, buildArgumentExplicit: !!process.argv[3],
  buildBytes: bytes.length, buildSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  viewport: { width: 1280, height: 800 }, modes: ['enh', 'retro'],
  checks: [], actions: [], traces: [], shots: [], runtime: [],
  errors: [], warnings: [], externalRequests: [], network: [], failures: []
};
let mode = '', scenario = '';
const check = (name, pass, detail) => report.checks.push({ mode, scenario, name, pass: !!pass, detail });
const closedBolted = s => s.t < 1e-6 && s.target === 0 && !s.pending && s.bolt < 1e-6 && s.boltTarget === 0 && s.solid.on;
const openUnbolted = s => s.t > .999 && s.target === 1 && s.bolt > .999 && !s.pending && !s.solid.on;
const closedUnbolted = s => s.t < 1e-6 && s.target === 0 && s.bolt > .999 && !s.pending && s.solid.on;
const boltExplanation = s => /засов/i.test(s.message) && /(сторон|кладов)/i.test(s.message) && s.message === s.domMessage;
const mechanics = s => JSON.stringify([s.t, s.target, s.pending, s.bolt, s.boltTarget, s.sliderMm, s.angle, s.solid]);
const physical = s => JSON.stringify([s.t, s.bolt, s.sliderMm, s.angle, s.solid]);
const describeUrl = url => /^(data:|blob:)/.test(url) ? url.slice(0, 48).split(',')[0] + ' [inline]' : url;

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true
    });
    report.browser = browser.version();
    const context = await browser.newContext({ viewport: report.viewport, hasTouch: true, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(file:|data:|blob:)/.test(url)) return route.continue();
      report.externalRequests.push({ mode, scenario, url });
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', e => report.errors.push({ mode, scenario, message: e.message }));
    page.on('console', m => {
      const entry = { mode, scenario, message: m.text() };
      if (m.type() === 'error') report.errors.push(entry);
      if (m.type() === 'warning') report.warnings.push(entry);
    });
    page.on('response', r => report.network.push({ mode, scenario, url: describeUrl(r.url()), status: r.status() }));
    page.on('requestfailed', r => report.network.push({ mode, scenario, url: describeUrl(r.url()), failure: r.failure()?.errorText }));

    const render = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = () => page.evaluate(() => window.__doorRegression.read());
    const view = async side => {
      await page.evaluate(side => window.__doorRegression.view(side), side);
      await render();
      const current = await state();
      if (current.selected !== 'd7' || (side === 'pantry' ? current.side >= 0 : current.side <= 0)) {
        throw new Error('Invalid ' + side + ' interaction setup: ' + JSON.stringify(current));
      }
      return current;
    };
    const shot = async name => {
      await render();
      const file = mode + '-' + name + '.png';
      await page.screenshot({ path: path.join(out, file) });
      report.shots.push({ mode, scenario, file, state: await state() });
    };
    const load = async name => {
      scenario = name;
      await page.goto(pathToFileURL(build).href + '?dev=1&still=1&gfx=' + mode, { timeout: 60000 });
      await page.waitForFunction(() => window.__ready && window.__dbg && window.__set, { timeout: 60000 });
      // A real touch reveals the existing action control, without changing the game DOM or handler.
      await page.locator('#c').tap({ position: { x: 30, y: 30 } });
      await page.evaluate(() => {
        const { farm, P, cam, THREE } = window.__dbg;
        const D = farm.doors.find(d => d.d.id === 'd7');
        const update = farm.update.bind(farm);
        let lastStatus = { inside: 1, lvlCam: 0 };
        // Renderer/input frames continue normally; only simulation time is advanced by this test.
        farm.update = () => lastStatus;
        const read = () => {
          const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
          const nearest = farm.nearest(cam.position, direction, P.lvl);
          return {
            t: D.t, target: D.target, bolt: D.boltT, boltTarget: D.boltTarget,
            pending: !!D.pendingOpen, sliderMm: D.bolt.sliding.position.x, angle: D.pivot.rotation.y,
            solid: Object.fromEntries(Object.entries(D.solid).filter(([, v]) => ['number', 'boolean', 'string'].includes(typeof v))),
            selected: nearest?.D?.d.id || nearest?.kind || null,
            side: (P.pos.x - D.d.hinge[0]) * Math.sin(D.d.yaw) + (P.pos.z - D.d.hinge[2]) * Math.cos(D.d.yaw),
            player: P.pos.toArray(), camera: cam.position.toArray(),
            hint: document.getElementById('hint').textContent,
            message: farm.message, domMessage: document.getElementById('msg').textContent
          };
        };
        const tick = dt => {
          lastStatus = update(dt, 0, cam, { lvl: 0, snap: true });
          farm.scene.updateMatrixWorld(true);
        };
        window.__doorRegression = {
          read,
          view(side) {
            const sign = side === 'pantry' ? -1 : 1;
            const frame = new THREE.Object3D();
            frame.position.set(...D.d.hinge); frame.rotation.y = D.d.yaw; frame.updateMatrixWorld(true);
            const target = new THREE.Vector3(D.d.w * .56, 1.05, 0).applyMatrix4(frame.matrixWorld);
            const position = new THREE.Vector3(D.d.w * .56, 0, sign * .8).applyMatrix4(frame.matrixWorld);
            const floor = farm.floorAt(position.x, position.z, 0) ?? D.d.hinge[1];
            window.__set({ cam: { pos: position.toArray(), look: target.toArray(), eye: target.y - floor, lvl: 0 } });
            P.vel.set(0, 0, 0);
          },
          advance(frames, dt = .005) {
            const samples = [];
            for (let i = 0; i < frames; i++) { tick(dt); samples.push(read()); }
            return samples;
          },
          returning() {
            const samples = [];
            for (let i = 0; i < 1000; i++) {
              tick(.005); const current = read(); samples.push(current);
              if (current.t < 1e-6 && current.bolt > .15 && current.bolt < .85) break;
            }
            return samples;
          },
          walkFromBarn() {
            P.vel.set(0, 0, 0);
            const result = window.__walk(['KeyW'], 1.05);
            return { ...result, progress: -(result.pos[0] - D.d.hinge[0]) * Math.sin(D.d.yaw) - (result.pos[2] - D.d.hinge[2]) * Math.cos(D.d.yaw) };
          }
        };
      });
      if (!report.runtime.some(r => r.mode === mode)) report.runtime.push(await page.evaluate(mode => {
        const { renderer, farm } = window.__dbg, gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { mode, renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), version: gl.getParameter(gl.VERSION), info: farm.info() };
      }, mode));
      await view('pantry');
      check('Fresh game starts with a shut, bolted pantry door', closedBolted(await state()), await state());
    };
    const advance = async (name, frames = 500) => {
      const samples = await page.evaluate(frames => window.__doorRegression.advance(frames), frames);
      report.traces.push({ mode, scenario, name, dt: .005, frames, samples: samples.filter((_, i) => i % 10 === 0 || i === samples.length - 1) });
      await render();
      return { samples, end: await state() };
    };
    const input = async method => {
      const before = await state();
      if (before.selected !== 'd7') throw new Error('Input would act on the wrong target: ' + JSON.stringify(before));
      if (method === 'button') await page.getByRole('button', { name: 'Действие', exact: true }).click();
      else await page.keyboard.press('KeyE');
      await render();
      const after = await state();
      report.actions.push({ mode, scenario, method, before, after });
      return { before, after };
    };
    const openingOrder = (name, trace) => {
      const violations = trace.samples.filter(s => s.t > 1e-6 && s.bolt < .999);
      check(name, violations.length === 0, { violations: violations.length, first: violations.slice(0, 3), end: trace.end });
    };
    const closingOrder = (name, trace) => {
      const violations = trace.samples.filter(s => s.t > 1e-6 && s.bolt < .999);
      check(name, violations.length === 0, { violations: violations.length, first: violations.slice(0, 3), end: trace.end });
    };

    for (mode of report.modes) {
      await load('barn-cannot-release-bolt');
      await view('barn');
      await shot('barn-before-interaction');
      const blocked = await input('keyboard');
      check('Barn KeyE explains that the bolt is on the other side', boltExplanation(blocked.after), blocked.after);
      check('Barn KeyE leaves the bolt, leaf, and collision unchanged immediately', mechanics(blocked.before) === mechanics(blocked.after), blocked);
      await shot('barn-immediate-result');
      const afterBlocked = await advance('barn-after-attempt', 400);
      check('Barn KeyE cannot start a delayed unlock or opening', afterBlocked.samples.every(s => physical(s) === physical(blocked.before)) && closedBolted(afterBlocked.end), afterBlocked.end);
      await shot('barn-after-interaction');
      await view('barn');
      const walk = await page.evaluate(() => window.__doorRegression.walkFromBarn());
      check('The bolted door still physically blocks passage from the barn', walk.progress < -.18, walk);

      await load('pantry-opens-and-relocks');
      await shot('pantry-bolted');
      await input('button');
      const early = await advance('pantry-early-release', 35);
      check('Pantry action button retracts the bolt while the leaf stays shut', early.end.bolt > .1 && early.end.bolt < .95 && early.end.t < 1e-6 && early.end.solid.on, early.end);
      await shot('pantry-bolt-retracting');
      const opened = await advance('pantry-opening');
      openingOrder('Pantry opening waits until the bolt is fully withdrawn', opened);
      check('Pantry interaction opens the door and removes its collision', openUnbolted(opened.end), opened.end);
      await shot('pantry-open');
      await input('keyboard');
      const shut = await advance('pantry-closing');
      closingOrder('Pantry closing inserts the bolt only after the leaf is fully shut', shut);
      check('Pantry closing restores a shut, bolted, solid door', closedBolted(shut.end), shut.end);
      await shot('pantry-rebolted');
      await view('barn');
      const relockedAttempt = await input('button');
      const relocked = await advance('barn-after-pantry-relock', 400);
      check('The barn action button is blocked again after pantry relocking', boltExplanation(relockedAttempt.after) && mechanics(relockedAttempt.before) === mechanics(relockedAttempt.after) && closedBolted(relocked.end), { attempt: relockedAttempt, end: relocked.end });

      await load('barn-closes-without-operating-bolt');
      await input('keyboard');
      const initiallyOpen = await advance('pantry-opens-for-barn');
      check('Pantry first opens the shared doorway', openUnbolted(initiallyOpen.end), initiallyOpen.end);
      await view('barn');
      await input('button');
      const barnShut = await advance('barn-closing');
      check('Closing from the barn leaves the bolt fully withdrawn throughout', barnShut.samples.every(s => s.bolt > .999) && closedUnbolted(barnShut.end), barnShut.end);
      await view('pantry');
      await shot('bolt-after-barn-closing');
      await view('barn');
      await input('keyboard');
      const barnReopened = await advance('barn-reopening');
      check('The barn can reopen its shut but unbolted door without moving the bolt', barnReopened.samples.every(s => s.bolt > .999) && openUnbolted(barnReopened.end), barnReopened.end);
      await shot('barn-reopened');
      await view('pantry');
      await input('button');
      const pantryRelock = await advance('pantry-closing-after-barn-reopening');
      closingOrder('Relocking after a barn reopening also waits for the leaf to close', pantryRelock);
      check('The pantry can relock the door after the barn reopens it', closedBolted(pantryRelock.end), pantryRelock.end);

      await load('cancellation-and-returning-bolt');
      await input('keyboard');
      await advance('partial-release-before-cancel', 30);
      await input('button');
      const canceled = await advance('pantry-cancel-return');
      check('Canceling a pantry release returns a shut, bolted door without opening it', canceled.samples.every(s => s.t < 1e-6 && s.solid.on) && closedBolted(canceled.end), canceled.end);
      for (let i = 0; i < 6; i++) { await input(i % 2 ? 'button' : 'keyboard'); await advance('rapid-toggle-' + i, 5); }
      const rapid = await advance('rapid-toggle-settle');
      check('Rapid pantry toggles settle to a consistent shut, bolted state', closedBolted(rapid.end), rapid.end);
      await shot('pantry-canceled-and-settled');
      await input('keyboard');
      await advance('opening-before-returning-bolt');
      await input('button');
      const returning = await page.evaluate(() => window.__doorRegression.returning());
      const returnState = returning[returning.length - 1];
      report.traces.push({ mode, scenario, name: 'closing-to-partly-returned-bolt', dt: .005, frames: returning.length, samples: returning.filter((_, i) => i % 10 === 0 || i === returning.length - 1) });
      check('The returning-bolt case reaches a shut leaf with its bolt partly inserted', returnState.t < 1e-6 && returnState.bolt > .15 && returnState.bolt < .85, returnState);
      await shot('pantry-bolt-returning');
      await view('barn');
      const duringReturn = await input('keyboard');
      check('Barn interaction cannot reverse or cancel a partly returning bolt', boltExplanation(duringReturn.after) && mechanics(duringReturn.before) === mechanics(duringReturn.after), duringReturn);
      const finishedReturn = await advance('returning-bolt-after-barn-attempt');
      check('A bolt returning after barn interaction finishes locking without reopening', finishedReturn.samples.every((s, i, all) => s.t < 1e-6 && s.solid.on && (i === 0 || s.bolt <= all[i - 1].bolt + 1e-9)) && closedBolted(finishedReturn.end), finishedReturn.end);
      await shot('barn-returning-bolt-result');

      await load('current-side-overrides-stale-target');
      await page.evaluate(() => {
        const { farm, cam, P, THREE } = window.__dbg;
        window.__pantryDoorTarget = farm.nearest(cam.position, new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), P.lvl);
      });
      await view('barn');
      const staleBefore = await state();
      const staleResult = await page.evaluate(() => {
        const { farm, cam } = window.__dbg;
        return farm.use(window.__pantryDoorTarget, cam.position);
      });
      await render();
      const staleAfter = await state();
      report.actions.push({ mode, scenario, method: 'farm.use(pantryTarget, currentBarnEye)', before: staleBefore, after: staleAfter, result: staleResult });
      const staleTrace = await advance('stale-target-after-attempt', 400);
      check('A stale pantry target cannot authorize the current barn-side actor', mechanics(staleBefore) === mechanics(staleAfter) && boltExplanation(staleAfter) && closedBolted(staleTrace.end), { before: staleBefore, after: staleAfter, end: staleTrace.end, result: staleResult });
      console.log(JSON.stringify({ mode, checks: report.checks.filter(c => c.mode === mode).length, failed: report.checks.filter(c => c.mode === mode && !c.pass).length }));
    }
    mode = 'both'; scenario = 'runtime';
    check('Both graphics modes run without JavaScript errors', report.errors.length === 0, report.errors);
    check('Both graphics modes produce no console warnings', report.warnings.length === 0, report.warnings);
    check('The saved build performs no external network requests', report.externalRequests.length === 0, report.externalRequests);
    check('Local resources load without network failures', report.network.every(r => !r.failure && r.status < 400), report.network.filter(r => r.failure || r.status >= 400));
  } catch (error) {
    report.failures.push({ mode, scenario, message: error.message, stack: error.stack });
    process.exitCode = 1;
  } finally {
    report.finished = new Date().toISOString();
    report.failedChecks = report.checks.filter(c => !c.pass).map(({ mode, scenario, name }) => ({ mode, scenario, name }));
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
    if (browser) await browser.close();
  }
  console.log(JSON.stringify({ out, build, checks: report.checks.length, failed: report.failedChecks, errors: report.errors.length, warnings: report.warnings.length, externalRequests: report.externalRequests.length, shots: report.shots.length, failures: report.failures }));
  if (report.failedChecks.length || report.errors.length || report.externalRequests.length || report.failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
