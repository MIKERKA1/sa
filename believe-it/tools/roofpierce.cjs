// Vertices of non-roof meshes sticking out above the roof surface (or out through the outer walls above the eaves line).
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file://' + (process.env.PAGE || '/data/fears_game/dist/believe_it_farm_v1.html') + '?dev=1&still=1');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 170000 });
  const out = await page.evaluate(() => {
    const { farm, THREE } = window.__dbg, E = 4.0, P = 0.9;
    const top = (x, z) => (x >= 11 && x <= 19.6 && z >= -15.3 && z <= 4.2 ? E + P * Math.min(x - 11, 19.6 - x) : x >= -14 && x <= 11 && z >= -8.6 && z <= 0 ? E + P * Math.min(z + 8.6, -z) : null);
    const B = new Map(), v = new THREE.Vector3();
    for (const g of Object.values(farm.groups)) g.traverse((m) => {
      if (!m.isMesh || g.name === 'roof') return;
      const mat = m.userData.mat || ''; if (/^(roof|brick|snow)/.test(mat)) return;
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        if (v.y < 3) continue;
        const t = top(v.x, v.z); if (t === null || v.y < t - 0.02) continue;
        const key = g.name + '|' + mat + '|' + Math.round(v.x) + '|' + Math.round(v.z);
        const b = B.get(key) || [0, v.x, v.y, v.z]; b[0]++; B.set(key, b);
      }
    });
    return [...B].map(([k, b]) => k + ' n=' + b[0] + ' ' + b.slice(1).map((q) => q.toFixed(2)).join(','));
  });
  console.log(out.join('\n'));
  await page.close(); await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
