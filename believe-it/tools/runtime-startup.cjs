// Fresh Edge processes and isolated contexts: no personal browser data or remote requests.
// CDP metrics/profiling: https://chromedevtools.github.io/devtools-protocol/tot/Profiler/
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.argv[2] || 'qa/runtime-v10/startup-before');
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const build = path.resolve(root, option('build', 'deliver/believe_it_farm_v9.html'));
const runs = Number(option('runs', '3')), profile = process.argv.includes('--profile'), dev = process.argv.includes('--dev');
const hideParallel = process.argv.includes('--hide-parallel');
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('Invalid run count');
if (fs.existsSync(out)) throw new Error('Use a new output directory: ' + out);
fs.mkdirSync(out, { recursive: true });
const report = { build, sha256: createHash('sha256').update(fs.readFileSync(build)).digest('hex'),
  conditions: { viewport: [1280, 800], dpr: 1, freshProcessPerRun: true, profile, dev, hideParallel }, runs: [] };
function summarizeProfile(p) {
  const self = new Map(), inclusive = new Map(), parents = new Map();
  const nodes = new Map(p.nodes.map(n => [n.id, n]));
  for (const n of p.nodes) for (const child of n.children || []) parents.set(child, n.id);
  for (let i = 0; i < (p.samples || []).length; i++) {
    const id = p.samples[i], us = p.timeDeltas[i] || 0;
    self.set(id, (self.get(id) || 0) + us);
    for (let at = id; at !== undefined; at = parents.get(at)) inclusive.set(at, (inclusive.get(at) || 0) + us);
  }
  const list = [...nodes.values()].map(n => ({ name: n.callFrame.functionName || '(anonymous)', url: n.callFrame.url,
    line: n.callFrame.lineNumber + 1, column: n.callFrame.columnNumber + 1,
    selfMs: (self.get(n.id) || 0) / 1000, inclusiveMs: (inclusive.get(n.id) || 0) / 1000 }));
  return { durationMs: (p.endTime - p.startTime) / 1000,
    self: list.sort((a, b) => b.selfMs - a.selfMs).slice(0, 50),
    inclusive: list.sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, 50) };
}
(async () => {
  for (let i = 0; i < runs; i++) {
    const run = { run: i + 1, errors: [], warnings: [], requests: [] }; report.runs.push(run);
    const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    try {
      run.browser = browser.version();
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on('pageerror', e => run.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') run.errors.push(m.text()); if (m.type() === 'warning') run.warnings.push(m.text()); });
      await context.route('**/*', r => { const u = r.request().url(); if (/^(file:|data:|blob:)/.test(u)) return r.continue(); run.requests.push(u); return r.abort(); });
      await page.addInitScript(() => {
        window.__runtimeLongTasks = [];
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.__runtimeLongTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
      });
      if (hideParallel) await page.addInitScript(() => {
        for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
          const original = proto.getExtension;
          proto.getExtension = function (name) { return name === 'KHR_parallel_shader_compile' ? null : original.call(this, name); };
        }
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
      const started = performance.now();
      await page.goto(pathToFileURL(build).href + (dev ? '?dev=1' : ''), { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.__ready, undefined, { timeout: 120000 });
      run.navigationToReadyMs = performance.now() - started;
      if (profile) {
        const { profile: cpu } = await cdp.send('Profiler.stop');
        fs.writeFileSync(path.join(out, `run-${i + 1}.cpuprofile`), JSON.stringify(cpu), { flag: 'wx' });
        run.profile = summarizeProfile(cpu);
      }
      run.page = await page.evaluate(() => {
        const gl = document.querySelector('#c').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
        const long = window.__runtimeLongTasks;
        return { elapsedMs: performance.now(), revision: window.__dbg?.THREE.REVISION,
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), contextLost: gl.isContextLost(),
          parallelShaderCompile: gl.getExtension('KHR_parallel_shader_compile') !== null, programs: window.__dbg?.renderer.info.programs.length,
          ready: window.__ready, debug: !!window.__dbg, longTaskCount: long.length,
          longTaskTotalMs: long.reduce((s, e) => s + e.duration, 0), longestTasks: [...long].sort((a, b) => b.duration - a.duration).slice(0, 12),
          userMeasures: performance.getEntriesByType('measure').map(e => ({ name: e.name, start: e.startTime, duration: e.duration })) };
      });
      run.metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      await cdp.send('HeapProfiler.collectGarbage');
      run.metricsAfterGC = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      run.heapAfterGC = await cdp.send('Runtime.getHeapUsage');
      if (i === 0) await page.screenshot({ path: path.join(out, 'first-ready.png') });
      console.log(JSON.stringify({ run: run.run, readyMs: Math.round(run.navigationToReadyMs), renderer: run.page.renderer,
        heapAfterGC: run.metricsAfterGC.JSHeapUsedSize, errors: run.errors.length, warnings: run.warnings.length, externalRequests: run.requests.length }));
    } catch (error) { run.failure = error.stack; throw error; }
    finally { fs.writeFileSync(path.join(out, `run-${i + 1}.json`), JSON.stringify(run, null, 2), { flag: 'wx' }); await browser.close(); }
  }
  const times = report.runs.map(r => r.navigationToReadyMs).sort((a, b) => a - b);
  report.summary = { readyMedianMs: times[Math.floor(times.length / 2)], readyMinMs: times[0], readyMaxMs: times.at(-1),
    errors: report.runs.reduce((s, r) => s + r.errors.length, 0), warnings: report.runs.reduce((s, r) => s + r.warnings.length, 0),
    externalRequests: report.runs.reduce((s, r) => s + r.requests.length, 0) };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(report.summary));
  if (report.summary.errors || report.summary.warnings || report.summary.externalRequests || report.runs.some(r => r.page.contextLost)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
