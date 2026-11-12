// Read an explicitly selected immutable HTML; never swap dist or earlier releases for QA.
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = path.resolve(root, process.argv[2] || 'qa/runtime-v10/visual-repeat');
const build = path.resolve(root, option('build', 'deliver/believe_it_farm_v9.html'));
const ids = option('ids', '').split(',').filter(Boolean);
const settle = Number(option('frames', '2')), repeats = Number(option('repeats', '1'));
const controlled = process.argv.includes('--controlled'), capture = option('capture', 'page');
if (!['page', 'canvas'].includes(capture)) throw new Error('Use page or canvas capture');
if (!Number.isInteger(settle) || settle < 2 || !Number.isInteger(repeats) || repeats < 1) throw new Error('Invalid frame/repeat count');
const shots = JSON.parse(fs.readFileSync(path.resolve(root, option('views', 'tools/environment-views.json')), 'utf8')).filter(s => !ids.length || ids.includes(s.id));
if (!shots.length) throw new Error('No matching views');
if (fs.existsSync(out)) throw new Error('Use a new output directory: ' + out);
fs.mkdirSync(out, { recursive: true });
const report = { build, buildSha256: createHash('sha256').update(fs.readFileSync(build)).digest('hex'),
  conditions: { viewport: [1280, 800], dpr: 1, still: true, settleFrames: settle, repeats, controlled, capture }, errors: [], warnings: [], requests: [], shots: [] };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    report.browser = browser.version();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }), page = await context.newPage();
    await context.route('**/*', r => { const u = r.request().url(); if (/^(file:|data:|blob:)/.test(u)) return r.continue(); report.requests.push(u); return r.abort(); });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); if (m.type() === 'warning') report.warnings.push(m.text()); });
    if (controlled) await page.addInitScript(() => {
      // Only this isolated QA page controls RAF; the immutable HTML remains unchanged.
      const nativeRAF = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
      const pending = new Map(); let paused = false, serial = -1;
      window.requestAnimationFrame = callback => {
        if (!paused) return nativeRAF(callback);
        const id = serial--; pending.set(id, callback); return id;
      };
      window.cancelAnimationFrame = id => { if (!pending.delete(id)) nativeCancel(id); };
      window.__qaRAF = {
        pause: async () => { paused = true; await new Promise(r => nativeRAF(() => nativeRAF(r))); },
        advance: async count => {
          for (let i = 0; i < count; i++) await new Promise(resolve => nativeRAF(now => {
            const callbacks = [...pending.values()]; pending.clear();
            for (const callback of callbacks) callback(now);
            resolve();
          }));
        },
        get pending() { return pending.size; },
      };
    });
    await page.goto(pathToFileURL(build).href + '?dev=1&still=1', { timeout: 120000 });
    await page.waitForFunction(() => window.__ready, undefined, { timeout: 120000 });
    if (controlled) await page.evaluate(() => window.__qaRAF.pause());
    await page.evaluate(() => {
      const r = window.__dbg.renderer, original = r.render;
      r.render = function (scene, cam) {
        const result = original.call(this, scene, cam);
        if (scene.children.length === 1 && scene.children[0].material?.uniforms?.uTime) {
          const u = scene.children[0].material.uniforms;
          window.__qaFinalUniforms = Object.fromEntries(Object.entries(u).filter(([n]) => n.startsWith('u')).map(([n, v]) => [n, v.value?.toArray?.() ?? v.value]));
        }
        return result;
      };
    });
    const frameState = () => page.evaluate(() => {
      const { S, cam, renderer } = window.__dbg;
      return { frames: S.frames, time: S.time, pos: cam.position.toArray(), rotation: cam.rotation.toArray(), fov: cam.fov,
        render: { ...renderer.info.render }, programs: renderer.info.programs.length, finalUniforms: window.__qaFinalUniforms,
        canvas: [renderer.domElement.width, renderer.domElement.height] };
    });
    for (const gfx of ['enh', 'retro']) for (const preset of ['day', 'dusk', 'night']) for (const shot of shots) {
      const lantern = shot.lantern ?? preset === 'night';
      await page.evaluate(o => window.__set(o), { gfx, preset, lantern, cam: shot.cam });
      if (controlled) await page.evaluate(n => window.__qaRAF.advance(n), settle);
      else await page.evaluate(n => new Promise(resolve => {
        const tick = () => --n > 0 ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick);
      }), settle);
      for (let repeat = 0; repeat < repeats; repeat++) {
        const file = `${shot.id}-${preset}-${gfx}${repeat ? `-repeat${repeat}` : ''}.png`;
        const beforeCapture = await frameState();
        if (capture === 'canvas') {
          const data = await page.evaluate(() => window.__dbg.renderer.domElement.toDataURL('image/png'));
          fs.writeFileSync(path.join(out, file), Buffer.from(data.split(',')[1], 'base64'), { flag: 'wx' });
        } else await page.screenshot({ path: path.join(out, file) });
        const afterCapture = await frameState();
        if (controlled && JSON.stringify(beforeCapture) !== JSON.stringify(afterCapture)) throw new Error('Render state changed during controlled capture: ' + file);
        report.shots.push({ id: shot.id, gfx, preset, file, cam: shot.cam, lantern, beforeCapture, afterCapture });
      }
    }
    report.geometry = await page.evaluate(() => {
      let meshes = 0, vertices = 0, triangles = 0; const bad = [];
      window.__dbg.farm.scene.traverse(m => {
        if (!m.geometry) return; meshes++; const g = m.geometry, p = g.attributes.position;
        vertices += p?.count || 0; triangles += (g.index?.count || p?.count || 0) / 3;
        for (const [n, a] of Object.entries(g.attributes)) for (const v of a.array) if (!Number.isFinite(v)) { bad.push(n); break; }
      });
      return { meshes, vertices, triangles, bad };
    });
  } catch (e) { report.failure = e.stack; throw e; }
  finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); await browser.close(); }
  console.log(JSON.stringify({ out, sha256: report.buildSha256, shots: report.shots.length, errors: report.errors, warnings: report.warnings, requests: report.requests, geometry: report.geometry }));
  if (report.errors.length || report.warnings.length || report.requests.length || report.geometry.bad.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
