// QA: climb the ladders, print the sampled paths, screenshot mid-climb. node tools/climb.cjs
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
  await page.goto('file:///data/fears_game/dist/believe_it_farm_v1.html?dev=1&still=1');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `/data/fears_game/qa/v2/${n}.png` }); };
  const run = async (start, id, part, name) => {
    await page.evaluate((s) => window.__set({ cam: s }), start);
    const r = await page.evaluate(([i, p]) => window.__climb(i, p), [id, part]);
    console.log(id, JSON.stringify(r));
    if (name) await shot(name);
    const r2 = await page.evaluate(([i]) => { const o = []; for (let k = 0; k < 200 && window.__dbg.P.climb; k++) { window.__walk([], 0.033); } return { pos: window.__dbg.P.pos.toArray(), feet: window.__dbg.P.feet, lvl: window.__dbg.P.lvl }; }, [id]);
    console.log(' end', JSON.stringify(r2));
  };
  await run({ pos: [-7.9, 0.35, -2.6], look: [-7.9, 1.5, -6] }, 'hatch', 2.2, 'c_hatch_mid');
  await run({ pos: [-7.9, 3, -4.9], look: [-7.9, 3.5, -6], lvl: 1 }, 'hatch', 0, null);
  await page.evaluate(() => window.__set({ cam: { pos: [-7.9, 3, -4.9], look: [-7.9, 3.5, -7], lvl: 1 } })); await shot('c_attic_arrive');
  await run({ pos: [-7.9, 3, -4.9], look: [-7.9, 3.5, -7], lvl: 1 }, 'hatchDown', 2.0, 'c_hatchdown_mid');
  await run({ pos: [16, 0.05, -10.4], look: [13, 1.5, -10.4] }, 'loft', 2.6, 'c_loft_mid');
  await run({ pos: [13.3, 3, -10.4], look: [16, 3, -10.4], lvl: 1 }, 'loftDown', 1.2, 'c_loftdown_mid');
  await page.close(); await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
