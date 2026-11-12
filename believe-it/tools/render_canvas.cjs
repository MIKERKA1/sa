// Usage: node tools/render_canvas.cjs <w> <h> <shots.json> [query]
// Like render.cjs, but saves only the WebGL canvas; shots may carry "eval" (JS expression) -> result saved to "json".
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
const fs = require('fs');
const [w, h, shotsFile, query = 'dev=1&still=1'] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console.' + m.type() + ':', m.text().slice(0, 1500)); });
  await page.goto('file:///data/fears_game/dist/believe_it_hands_v1.html?' + query);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const out = {};
  for (const s of shots) {
    if (s.vp) await page.setViewportSize({ width: s.vp[0], height: s.vp[1] });
    if (s.set) await page.evaluate((o) => window.__set(o), s.set);
    if (s.before) await page.evaluate(s.before);
    await page.waitForTimeout(s.wait || 400);
    if (s.out) await page.locator(s.el || '#c').screenshot({ path: s.out, timeout: 180000 });
    if (s.eval) out[s.key || s.out] = await page.evaluate(s.eval);
  }
  if (Object.keys(out).length) fs.writeFileSync(shots.jsonOut || '/tmp/render_out.json', JSON.stringify(out));
  await page.close(); await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
