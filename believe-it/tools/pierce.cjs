// Find props that pass right through a wall (vertices on both sides of the wall slab in the same small cell).
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file://' + (process.env.PAGE || '/data/fears_game/dist/believe_it_farm_v1.html') + '?dev=1&still=1');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 170000 });
  const out = await page.evaluate(() => {
    const { farm, THREE } = window.__dbg;
    // [axis of thickness, c0, c1, run0, run1, y0, y1]
    const W = [
      ['z', -0.5, 0, -14, 11, 0, 4], ['z', -8.6, -8.1, -14, 11, 0, 4], ['z', -4.68, -4.52, -13.5, -0.2, 0, 2.8],
      ['z', 3.75, 4.2, 11, 19.6, 0, 4], ['z', -15.3, -14.85, 11, 19.6, 0, 4], ['z', -7.96, -7.8, 17, 19.15, 0, 2.8], ['z', -3.5, -3.34, 17, 19.15, 0, 2.8],
      ['x', -14, -13.5, -8.6, 0, 0, 4], ['x', -8.68, -8.52, -4.52, -0.5, 0, 2.8], ['x', -5.68, -5.52, -4.52, -0.5, 0, 2.8], ['x', -9.18, -9.02, -8.1, -4.68, 0, 2.8],
      ['x', -3.68, -3.52, -8.1, -4.68, 0, 2.8], ['x', -0.2, 0.2, -8.1, -0.5, 0, 2.8], ['x', 11, 11.45, -15.3, 4.2, 0, 4.2], ['x', 16.84, 17.0, -14.85, 3.75, 0, 2.8],
      ['x', 7.2, 7.36, -8.1, -4.68, 0, 2.8], ['x', 19.15, 19.6, -15.3, 4.2, 0, 4.2],
    ];
    const skip = /^(wash|wash_i|stone|stone_i|brick|brick_i|roof|glass|glassc|snow)$/;
    const B = new Map(), v = new THREE.Vector3();
    const meshes = [];
    for (const g of Object.values(farm.groups)) g.traverse((m) => { if (m.isMesh) meshes.push([g.name, m]); });
    for (const [gn, m] of meshes) {
      const mat = m.userData.mat || '';
      if (skip.test(mat)) continue;
      m.updateMatrixWorld(true);
      const p = m.geometry.attributes.position, P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (let i = 0; i < p.count; i += 3) {
        for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(p, i + k).applyMatrix4(m.matrixWorld);
        W.forEach((w, wi) => {
          const [ax, c0, c1, r0, r1, y0, y1] = w;
          let s0 = 0, s2 = 0, rr = 0, yy = 0;
          for (const q of P) {
            const c = ax === 'z' ? q.z : q.x, r = ax === 'z' ? q.x : q.z;
            if (r < r0 || r > r1 || q.y < y0 || q.y > y1) return;
            if (c < c0 - 0.004) s0++; else if (c > c1 + 0.004) s2++;
            rr += r / 3; yy += q.y / 3;
          }
          if (!s0 || !s2) return;
          const key = wi + '|' + gn + '|' + mat + '|' + Math.round(rr / 0.3) + '|' + Math.round(yy / 0.3);
          let b = B.get(key); if (!b) B.set(key, (b = [0, rr, yy]));
          b[0]++;
        });
      }
    }
    const res = [];
    for (const [k, b] of B) res.push(k + ' n=' + b[0] + ' at r=' + b[1].toFixed(2) + ' y=' + b[2].toFixed(2));
    return res;
  });
  console.log(out.join('\n'));
  await page.close(); await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
