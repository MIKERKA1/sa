// Usage: PAGE=... node tools/evalshots.cjs <w> <h> <shots.json> [query]
// shots: [{ "out": "x.png", "js": "window.__set({...}); ...", "wait": 300, "frames": 3 }]  — js is evaluated in the page
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
const fs = require('fs');
const [w, h, shotsFile, query = 'dev=1&still=1'] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('QA')) console.log('console:', m.type(), m.text().slice(0, 400)); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file://' + process.env.PAGE + '?' + query, { timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  for (const s of shots) {
    const f0 = await page.evaluate(() => window.__dbg.S.frames);
    if (s.js) { const r = await page.evaluate(s.js); if (r !== undefined) console.log('js:', JSON.stringify(r).slice(0, 600)); }
    await page.waitForFunction((n) => window.__dbg.S.frames >= n, f0 + (s.frames || 3), { timeout: 120000 });
    await page.waitForTimeout(s.wait || 300);
    if (s.out) { await page.screenshot({ path: s.out, timeout: 240000 }); console.log('saved', s.out); }
  }
  await page.close(); await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
