// Find "invisible walls": colliders with no geometry above the floor inside them.
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file://' + (process.env.PAGE || '/data/fears_game/dist/believe_it_farm_v1.html') + '?dev=1&still=1');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const out = await page.evaluate(() => {
    const { farm, THREE } = window.__dbg, G = 0.25, grid = new Map();
    const meshes = [];
    for (const g of Object.values(farm.groups)) g.traverse((m) => { if (m.isMesh) meshes.push(m); });
    for (const D of farm.doors) D.g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const a of [...farm.animals.cows, ...farm.animals.hens]) a.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const v = new THREE.Vector3();
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      const p = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : p.count;
      for (let i = 0; i < n; i += 3) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
        if (x1 - x0 > 3 && z1 - z0 > 3) continue; // floors / big slabs
        const t = [x0, y0, z0, x1, y1, z1, m.userData.mat || ''];
        for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) for (let gz = Math.floor(z0 / G); gz <= Math.floor(z1 / G); gz++) { const key = gx + ',' + gz; (grid.get(key) || grid.set(key, []).get(key)).push(t); }
      }
    }
    const res = [];
    for (const s of farm.ctx.kit.solids) {
      const fy = farm.floorAt((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.lvl) ?? (s.lvl ? 2.95 : 0);
      const ix0 = s.x0 + 0.02, ix1 = s.x1 - 0.02, iz0 = s.z0 + 0.02, iz1 = s.z1 - 0.02;
      let hit = false;
      for (let gx = Math.floor(ix0 / G); gx <= Math.floor(ix1 / G) && !hit; gx++) for (let gz = Math.floor(iz0 / G); gz <= Math.floor(iz1 / G) && !hit; gz++) {
        for (const t of grid.get(gx + ',' + gz) || []) {
          if (t[3] < ix0 || t[0] > ix1 || t[5] < iz0 || t[2] > iz1) continue;
          if (t[4] < fy + 0.1 || t[1] > fy + 1.9) continue;
          if (/^(hay_i|linen_i|plain_i)$/.test(t[6]) && t[4] < fy + 0.15) continue;
          hit = true; break;
        }
      }
      if (!hit) res.push([s.lvl, +s.x0.toFixed(2), +s.z0.toFixed(2), +s.x1.toFixed(2), +s.z1.toFixed(2), s.tag]);
    }
    return { n: farm.ctx.kit.solids.length, res };
  });
  console.log(JSON.stringify(out));
  await page.close(); await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
