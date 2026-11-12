// Usage: node tools/farm_probe.cjs '<js expression run after ready>'
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page.on('console', (m) => console.log('console:', m.type(), m.text().slice(0, 400)));
  page.on('pageerror', (e) => console.log('pageerror:', e.message, e.stack && e.stack.slice(0, 600)));
  await page.goto('file:///data/fears_game/dist/believe_it_farm_v1.html?' + (process.env.Q || 'dev=1&still=1'));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const out = await page.evaluate(async (src) => { const f = new Function('return (async () => {' + src + '})()'); return await f(); }, process.argv[2] || 'return 1');
  console.log(JSON.stringify(out, null, 0).slice(0, 4000));
  await page.close(); await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
