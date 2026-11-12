const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), out = path.resolve(root, 'qa/recovery/smoke');
if (fs.existsSync(out)) throw new Error('Use a fresh smoke output directory');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const report = { errors: [], warnings: [], requests: [], pages: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route('**/*', r => {
      if (/^(file:|data:|blob:)/.test(r.request().url())) return r.continue();
      report.requests.push(r.request().url()); return r.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); if (m.type() === 'warning') report.warnings.push(m.text()); });
    for (const [file, scene] of [['believe_it_farm_v7.html', 'farm'], ['believe_it_hands_v14.html', 'viewer']]) {
      await page.goto(pathToFileURL(path.resolve(root, 'deliver', file)).href);
      await page.waitForFunction(() => window.__ready, { timeout: 60000 });
      const production = await page.evaluate(() => !window.__dbg && !window.__set && !window.__walk);
      if (!production) throw new Error('Release opened with debug hooks');
      if (scene === 'farm') {
        await page.getByRole('button', { name: 'Кухня', exact: true }).click();
        await page.getByRole('button', { name: 'Ночь', exact: true }).click();
        await page.keyboard.press('KeyL');
      } else {
        await page.getByRole('tab', { name: 'Замок', exact: true }).click();
        await page.getByRole('button', { name: 'Взломан', exact: true }).click();
        await page.getByRole('button', { name: 'Пробой', exact: true }).click();
        await page.getByRole('button', { name: 'Ретро PS1', exact: true }).click();
      }
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: path.resolve(out, `${scene}.png`) });
      report.pages.push({ file, production, title: await page.title(), canvasVisible: await page.locator('canvas').isVisible() });
    }
  } finally { fs.writeFileSync(path.resolve(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(JSON.stringify(report));
  if (report.errors.length || report.warnings.length || report.requests.length || report.pages.some(p => !p.canvasVisible)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
