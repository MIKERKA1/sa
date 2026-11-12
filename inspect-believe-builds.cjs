const { chromium } = require('C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const workspace = 'C:/Users/m/Documents/Codex/2026-11-07/new-chat-2/work';
const project = path.join(workspace, 'believe-it');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**/*', route => {
    const url = route.request().url();
    return /^(file:|data:|blob:)/.test(url) ? route.continue() : route.abort();
  });
  const reports = [];
  try {
    for (const scene of [
      { name: 'farm-kitchen-night', file: 'believe_it_farm_v6.html', query: '?dev=1&preset=night&spot=r4' },
      { name: 'viewer-lock', file: 'believe_it_hands_v13.html', query: '?dev=1', lock: true },
    ]) {
      const page = await context.newPage();
      const report = { scene: scene.name, errors: [], warnings: [] };
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') report.errors.push(message.text());
        if (message.type() === 'warning') report.warnings.push(message.text());
      });
      try {
        await page.goto(pathToFileURL(path.join(project, 'deliver', scene.file)).href + scene.query);
        await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
        if (scene.lock) {
          await page.getByRole('tab', { name: 'Замок', exact: true }).click();
          await page.getByRole('button', { name: 'Пробой', exact: true }).click();
        }
        await page.screenshot({ path: path.join(workspace, `browser-${scene.name}.png`) });
        report.title = await page.title();
        report.text = (await page.locator('body').innerText()).slice(0, 2200);
        report.runtime = await page.evaluate(() => ({ ready: window.__ready, canvasCount: document.querySelectorAll('canvas').length }));
        if (scene.lock) {
          await page.getByRole('button', { name: 'Взломан', exact: true }).click();
          await page.screenshot({ path: path.join(workspace, 'browser-viewer-lock-broken.png') });
        }
        report.loaded = true;
      } catch (error) {
        report.loaded = false;
        report.failure = error.message;
      }
      reports.push(report);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(workspace, 'browser-inspection-followup.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports.map(({ scene, loaded, errors, warnings, failure, runtime, title, text }) => ({
    scene, loaded, errors, warningCount: warnings.length, firstWarning: warnings[0]?.split('\n')[0], failure, runtime, title, text
  }))));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
