const path = require('node:path'), fs = require('node:fs'), { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.argv[2] || 'qa/recovery/performance.json');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const report = { errors: [], externalRequests: [], samples: [] };
    page.on('pageerror', e => report.errors.push(e.message));
    await page.route('**/*', r => {
      if (/^(file:|data:|blob:)/.test(r.request().url())) return r.continue();
      report.externalRequests.push(r.request().url()); return r.abort();
    });
    const started = Date.now();
    await page.goto(pathToFileURL(path.resolve(root, 'dist/browser/believe_it_farm.html')).href + '?dev=1');
    await page.waitForFunction(() => window.__ready, { timeout: 60000 });
    report.readyMs = Date.now() - started;
    report.device = await page.evaluate(() => {
      const { renderer, farm, THREE } = window.__dbg, gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      let triangles = 0, vertices = 0, invalid = 0;
      farm.scene.traverse(m => { const g = m.geometry; if (!g) return; const p = g.attributes.position; if (!p) return;
        triangles += (g.index ? g.index.count : p.count) / 3; vertices += p.count;
        for (const a of Object.values(g.attributes)) if (Array.from(a.array).some(v => !Number.isFinite(v))) invalid++;
      });
      return { revision: THREE.REVISION, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION), triangles, vertices, invalid, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio };
    });
    for (const gfx of ['enh', 'retro']) for (const preset of ['day', 'dusk', 'night']) for (const area of ['kitchen', 'forest', 'yard']) {
      await page.evaluate(({ gfx, preset, area }) => window.__set({ gfx, preset, lantern: preset === 'night', ...(area === 'forest' ? { cam: { pos: [6.5, 0, -28], look: [4, 1.6, -49] } } : { spot: area === 'kitchen' ? 'r4' : 'gate' }) }), { gfx, preset, area });
      const sample = await page.evaluate(() => new Promise(resolve => {
        const { renderer } = window.__dbg, frames = [], calls = [], tris = [];
        let previous, warm = 15;
        renderer.info.autoReset = false;
        function frame(now) {
          if (warm-- > 0) { renderer.info.reset(); previous = now; requestAnimationFrame(frame); return; }
          frames.push(now - previous); previous = now;
          calls.push(renderer.info.render.calls); tris.push(renderer.info.render.triangles); renderer.info.reset();
          if (frames.length < 60) requestAnimationFrame(frame);
          else {
            renderer.info.autoReset = true;
            const sort = [...frames].sort((a, b) => a - b), avg = frames.reduce((a, b) => a + b, 0) / frames.length;
            resolve({ avgFrameMs: avg, fps: 1000 / avg, p95FrameMs: sort[Math.floor(sort.length * .95)], maxFrameMs: sort.at(-1), avgDrawCalls: calls.reduce((a, b) => a + b, 0) / calls.length, avgSubmittedTriangles: tris.reduce((a, b) => a + b, 0) / tris.length, memory: renderer.info.memory, contextLost: renderer.getContext().isContextLost() });
          }
        }
        requestAnimationFrame(frame);
      }));
      report.samples.push({ gfx, preset, area, ...sample });
    }
    fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ readyMs: report.readyMs, device: report.device, samples: report.samples.length, minFps: Math.min(...report.samples.map(s => s.fps)), maxP95FrameMs: Math.max(...report.samples.map(s => s.p95FrameMs)), errors: report.errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
