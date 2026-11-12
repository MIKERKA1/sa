const { chromium } = require('C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const project = 'C:/Users/m/Documents/Codex/2026-11-07/new-chat-2/work/believe-it';
const output = path.resolve(project, '..', process.argv[2] || 'hardware-baseline');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => /^(file:|data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(project, 'dist/browser/believe_it_farm.html')).href + '?dev=1&still=1&spot=hut');
  await page.waitForFunction(() => window.__ready);
  await page.evaluate(() => {
    const { farm, cam } = window.__dbg;
    const original = farm.update.bind(farm);
    farm.update = () => ({ inside: false, lvlCam: 0 });
    window.__hardwareStep = (n, dt = .01) => { for (let i = 0; i < n; i++) original(dt, 0, cam, { lvl: 0, snap: true }); };
    cam.fov = 28; cam.updateProjectionMatrix();
    window.__set({ cam: { pos: [4.62, 0, -14.38], eye: 1.12, look: [4.05, 1.16, -14.38] } });
  });
  const report = await page.evaluate(() => {
    const { farm, THREE } = window.__dbg;
    const door = farm.doors.find(d => d.d.id === 'd16');
    const blocked = farm.use({ kind: 'door', D: door });
    window.__set({ hutLock: 'broken' });
    farm.use({ kind: 'door', D: door });
    const samples = [];
    for (let i = 0; i <= 650; i++) {
      window.__hardwareStep(1, .002);
      const leaf = door.hardware.leafHasp.leaf;
      door.hardware.fixed.updateMatrixWorld(true); door.pivot.updateMatrixWorld(true);
      const inverse = leaf.matrixWorld.clone().invert();
      const collisions = [];
      door.hardware.lock.broken.traverse(mesh => {
        if (mesh.geometry?.type !== 'TubeGeometry') return;
        for (let j = 0; j <= 250; j++) {
          const p = mesh.geometry.parameters.path.getPoint(j / 250).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
          const outsideSlot = ((p.x - 133) / 13) ** 2 + (p.y / 5.8) ** 2 > 1.05;
          if (p.x > 10 && p.x < 142 && Math.abs(p.y) < 14 && Math.abs(p.z) < 1.8 && outsideSlot) {
            collisions.push(p.toArray().map(v => +v.toFixed(2))); break;
          }
        }
      });
      if (i % 50 === 0 || collisions.length) samples.push({ frame: i, door: door.t, hasp: door.haspT, collisions });
    }
    const bolt = farm.doors.find(d => d.d.id === 'd7');
    const bar = bolt.bolt.sliding.children.find(mesh => mesh.geometry?.type === 'BoxGeometry');
    const guide = bolt.bolt.group.children.filter(mesh => mesh.geometry?.type === 'BoxGeometry').map(mesh => ({ p: mesh.position.toArray(), size: mesh.geometry.parameters }));
    return { blocked, samples, bolt: { bar: { p: bar.position.toArray(), size: bar.geometry.parameters }, guide } };
  });
  await page.screenshot({ path: path.join(output, 'hut-open.png') });
  await page.goto(pathToFileURL(path.join(project, 'dist/browser/believe_it_hands.html')).href + '?dev=1&still=1');
  await page.waitForFunction(() => window.__ready);
  await page.getByRole('tab', { name: 'Замок', exact: true }).click();
  await page.getByRole('button', { name: 'Пробой', exact: true }).click();
  for (const [name, angle] of [['lock-front', 0], ['lock-side', 1.25], ['lock-back', 3.14]]) {
    await page.evaluate(angle => window.__set({ hardware: { angle, zoom: 1.6 } }), angle);
    await page.screenshot({ path: path.join(output, `${name}.png`) });
  }
  await page.getByRole('tab', { name: 'Засов', exact: true }).click();
  await page.evaluate(() => window.__set({ hardware: { angle: 1.2, zoom: 1.5 } }));
  await page.screenshot({ path: path.join(output, 'bolt-side.png') });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ...report, errors }, null, 2));
  console.log(JSON.stringify({ output, blocked: report.blocked, shackleLeafCollisions: report.samples.filter(s => s.collisions.length), errors }));
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
