// Focused before/after views for the four user-reported placement defects.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.argv[2] || 'qa/placement-v8/visual');
if (fs.existsSync(out)) throw new Error('Use a new output directory: ' + out);
fs.mkdirSync(out, { recursive: true });
const before = process.argv.includes('--before');
const build = path.resolve(root, before ? 'deliver/believe_it_farm_v7.html' : 'dist/browser/believe_it_farm.html');
const shots = [
  { id: 'rail-door', cam: { pos: [10.12,.05,-1.78], eye: .98, look: [10.95,.73,-2.62] }, open: ['d11'] },
  { id: 'rail-front', cam: { pos: [10.0,.05,-2.85], eye: .9, look: [10.96,.72,-2.85] } },
  { id: 'rail-side', cam: { pos: [10.53,.05,-2.28], eye: .83, look: [10.94,.74,-2.89] } },
  { id: 'book-top', cam: { pos: [8.22,.05,-6.38], eye: 1.13, look: [7.72,.83,-6.55] } },
  { id: 'book-side', cam: { pos: [8.29,.05,-6.86], eye: .88, look: [7.76,.83,-6.55] } },
  { id: 'book-room', cam: { pos: [8.69,.05,-5.71], eye: 1.36, look: [7.73,.85,-6.55] } },
  { id: 'basket-top', cam: { pos: [-8.38,.35,-6.32], eye: .91, look: [-8.65,.48,-5.8] } },
  { id: 'basket-side', cam: { pos: [-8.02,.35,-5.99], eye: .42, look: [-8.65,.53,-5.8] } },
  { id: 'basket-room', cam: { pos: [-7.69,.35,-6.55], eye: 1.27, look: [-8.64,.57,-5.75] } },
  { id: 'exhaust-full', cam: { pos: [3.35,.05,-14.65], eye: 1.46, look: [1.6,1.93,-14.35] } },
  { id: 'exhaust-joint', cam: { pos: [2.25,.05,-14.65], eye: 1.71, look: [1.56,1.75,-14.52] } },
  { id: 'exhaust-roof', cam: { pos: [.08,0,-16.65], eye: 4.3, look: [1.6,3.48,-14.6] } },
];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const report = { build, buildSha256: createHash('sha256').update(fs.readFileSync(build)).digest('hex'), errors: [], warnings: [], requests: [], shots: [], checks: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(file:|data:|blob:)/.test(url)) return route.continue();
      report.requests.push(url); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); if (m.type() === 'warning') report.warnings.push(m.text()); });
    await page.goto(pathToFileURL(build).href + '?dev=1&still=1');
    await page.waitForFunction(() => window.__ready, { timeout: 60000 });
    for (const gfx of before ? ['enh'] : ['enh','retro']) for (const preset of before ? ['day'] : ['day','dusk','night']) for (const shot of shots) {
      await page.evaluate(o => window.__set(o), { gfx, preset, lantern: preset === 'night', close: ['d11'], ...shot });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = `${shot.id}-${preset}-${gfx}.png`;
      await page.screenshot({ path: path.join(out, file) });
      report.shots.push({ id: shot.id, gfx, preset, file });
    }
    if (!before) {
      await page.evaluate(() => {
        const { farm,cam,P } = window.__dbg;
        window.__set({ cam: { pos: [10.43,.05,-1.82], look: [12,.9,-1.82] }, close: ['d11'] });
        P.vel.set(0,0,0);
        farm.use({ kind: 'door', D: farm.doors.find(d => d.d.id === 'd11') });
        for(let i=0;i<90;i++)farm.update(1/60,0,cam,{snap:true,player:{pos:P.pos,feet:P.feet,lvl:P.lvl}});
      });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const walk = await page.evaluate(() => {
        return window.__walk(['KeyW'], 1.1);
      });
      report.checks.push({ name: 'Stable doorway remains passable', pass: walk.pos[0] > 11.5, detail: walk });
    }
    report.geometry = await page.evaluate(() => {
      let meshes = 0, vertices = 0, triangles = 0, bad = [];
      window.__dbg.farm.scene.traverse(m => {
        if (!m.geometry) return;
        meshes++; const g = m.geometry, p = g.attributes.position;
        vertices += p?.count || 0; triangles += (g.index?.count || p?.count || 0) / 3;
        for (const [name, attr] of Object.entries(g.attributes)) if (Array.from(attr.array).some(v => !Number.isFinite(v))) bad.push(name);
      });
      return { meshes, vertices, triangles, bad };
    });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ out, shots: report.shots.length, errors: report.errors, warnings: report.warnings, requests: report.requests, checks: report.checks, geometry: report.geometry }));
    if (report.errors.length || report.warnings.length || report.requests.length || report.geometry.bad.length || report.checks.some(c => !c.pass)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
