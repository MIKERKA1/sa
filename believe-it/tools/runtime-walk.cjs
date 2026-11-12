// Fixed wall-clock endurance run with real keyboard events and normal collision/render updates.
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), out = path.resolve(root, process.argv[2] || 'qa/runtime-v10/walk-after');
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const build = path.resolve(root, option('build', 'dist/browser/believe_it_farm.html'));
const seconds = Number(option('seconds', '360'));
if (!Number.isInteger(seconds) || seconds < 180 || seconds > 1800 || seconds % 60) throw new Error('Use a duration of 180–1800 seconds in whole minutes');
if (fs.existsSync(out)) throw new Error('Use a new output directory: ' + out);
fs.mkdirSync(out, { recursive: true });
const report = { build, sha256: createHash('sha256').update(fs.readFileSync(build)).digest('hex'), seconds,
  conditions: { viewport: [1280, 800], dpr: 1, realKeyboardAndWallClock: true, audioMutedAtProcess: true },
  errors: [], warnings: [], externalRequests: [], segments: [], memory: [] };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--mute-audio'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }), page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('crash', () => report.errors.push('Browser page crashed'));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); if (m.type() === 'warning') report.warnings.push(m.text()); });
    await context.route('**/*', r => { const u = r.request().url(); if (/^(file:|data:|blob:)/.test(u)) return r.continue(); report.externalRequests.push(u); return r.abort(); });
    await page.goto(pathToFileURL(build).href + '?dev=1', { timeout: 120000 });
    await page.waitForFunction(() => window.__ready, undefined, { timeout: 120000 });
    const cdp = await context.newCDPSession(page);
    const state = () => page.evaluate(() => ({ pos: window.__dbg.P.pos.toArray(), feet: window.__dbg.P.feet,
      time: window.__dbg.S.time, frames: window.__dbg.S.frames }));
    const frames = n => page.evaluate(n => new Promise(resolve => {
      const tick = () => --n > 0 ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick);
    }), n);
    const snapshot = async label => {
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      const gpu = await page.evaluate(() => {
        const r = window.__dbg.renderer, gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { ...r.info.memory, programs: r.info.programs.length, contextLost: gl.isContextLost(),
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
      });
      const m = { label, heap, gpu, state: await state() }; report.memory.push(m); return m;
    };
    // Warm the existing lazy uploads and both graphics modes before judging memory growth.
    await page.keyboard.press('Shift');
    for (const gfx of ['enh', 'retro']) for (const preset of ['day', 'dusk', 'night']) for (const area of ['kitchen', 'forest', 'yard']) {
      await page.evaluate(o => window.__set(o), { gfx, preset, lantern: preset === 'night',
        ...(area === 'forest' ? { cam: { pos: [6.5, 0, -28], look: [4, 1.6, -49] } } : { spot: area === 'kitchen' ? 'r4' : 'gate' }) });
      await frames(20);
    }
    await snapshot('after-warmup');
    await page.evaluate(() => window.__set({ cam: { pos: [6.5, 0, -28], look: [4, 1.6, -49] } }));
    const started = Date.now();
    for (let minute = 0; minute < seconds / 60; minute++) {
      const gfx = minute % 2 === 0 ? 'enh' : 'retro', preset = ['day', 'dusk', 'night'][Math.floor(minute / 2) % 3];
      await page.evaluate(o => window.__set(o), { gfx, preset, lantern: preset === 'night' });
      await frames(4);
      for (const key of ['w', 's']) {
        const before = await state();
        await page.evaluate(() => {
          const renderer = window.__dbg.renderer, samples = [], calls = [], tris = [];
          let previous, warm = 10, running = true;
          renderer.info.autoReset = false;
          function tick(now) {
            if (!running) return;
            if (previous !== undefined && warm-- <= 0) {
              samples.push(now - previous); calls.push(renderer.info.render.calls); tris.push(renderer.info.render.triangles);
            }
            previous = now; renderer.info.reset(); requestAnimationFrame(tick);
          }
          window.__runtimeStopSample = () => {
            running = false; renderer.info.autoReset = true;
            const sorted = [...samples].sort((a, b) => a - b), mean = a => a.reduce((s, x) => s + x, 0) / a.length;
            return { frames: samples.length, avgFrameMs: mean(samples), p95FrameMs: sorted[Math.floor(sorted.length * .95)],
              maxFrameMs: sorted.at(-1), avgDrawCalls: mean(calls), avgSubmittedTriangles: mean(tris) };
          };
          requestAnimationFrame(tick);
        });
        await page.keyboard.down(key);
        await new Promise(resolve => setTimeout(resolve, 30000));
        await page.keyboard.up(key);
        const sample = await page.evaluate(() => window.__runtimeStopSample()), after = await state();
        const distance = Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]);
        const segment = { minute: minute + 1, gfx, preset, key, before, after, distance, ...sample };
        report.segments.push(segment);
        fs.writeFileSync(path.join(out, `segment-${report.segments.length}.json`), JSON.stringify(segment, null, 2), { flag: 'wx' });
        if (distance < 5 || after.frames <= before.frames || ![...after.pos, after.feet].every(Number.isFinite)) throw new Error('Walking stopped or became invalid');
      }
      const memory = await snapshot(`minute-${minute + 1}`);
      await page.screenshot({ path: path.join(out, `minute-${minute + 1}-${preset}-${gfx}.png`) });
      console.log(JSON.stringify({ minute: minute + 1, gfx, preset, heap: memory.heap.usedSize,
        backingStorage: memory.heap.backingStorageSize, geometries: memory.gpu.geometries, textures: memory.gpu.textures,
        errors: report.errors.length, warnings: report.warnings.length }));
    }
    report.measuredWallSeconds = (Date.now() - started) / 1000;
    const tail = report.memory.slice(-3);
    report.summary = { walkedMeters: report.segments.reduce((s, x) => s + x.distance, 0),
      renderedFrames: report.segments.reduce((s, x) => s + x.frames, 0), maxP95FrameMs: Math.max(...report.segments.map(s => s.p95FrameMs)),
      gpuCountsStableInLastThreeMinutes: tail.every(m => m.gpu.geometries === tail[0].gpu.geometries && m.gpu.textures === tail[0].gpu.textures),
      lastThreeHeapRange: Math.max(...tail.map(m => m.heap.usedSize)) - Math.min(...tail.map(m => m.heap.usedSize)),
      lastThreeBackingStorageRange: Math.max(...tail.map(m => m.heap.backingStorageSize)) - Math.min(...tail.map(m => m.heap.backingStorageSize)),
      contextLost: report.memory.some(m => m.gpu.contextLost) };
    if (report.errors.length || report.warnings.length || report.externalRequests.length || report.summary.contextLost || !report.summary.gpuCountsStableInLastThreeMinutes) process.exitCode = 1;
  } catch (error) { report.failure = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); await browser.close(); }
  console.log(JSON.stringify({ ...report.summary, measuredWallSeconds: report.measuredWallSeconds,
    errors: report.errors.length, warnings: report.warnings.length, externalRequests: report.externalRequests.length }));
})().catch(error => { console.error(error); process.exitCode = 1; });
