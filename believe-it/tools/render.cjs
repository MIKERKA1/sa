// Usage: node tools/render.cjs <w> <h> <shots.json> [query]
// shots.json: [{ "out": "qa/x.png", "set": {...}, "wait": 300, "full": false }]
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
const fs = require('fs');
const [w, h, shotsFile, query = 'dev=1&still=1'] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file://' + (process.env.PAGE || '/data/fears_game/dist/believe_it_hands_v1.html') + '?' + query);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  for (const s of shots) {
    const f0 = await page.evaluate(() => (window.__dbg && window.__dbg.S ? window.__dbg.S.frames : 0));
    if (s.set) await page.evaluate((o) => window.__set(o), s.set);
    if (s.frames) await page.waitForFunction((n) => window.__dbg.S.frames >= n, f0 + s.frames, { timeout: 120000 });
    await page.waitForTimeout(s.wait || 350);
    await page.screenshot({ path: s.out });
    console.log('saved', s.out);
  }
  await page.close();
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
