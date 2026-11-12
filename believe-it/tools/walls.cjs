// QA: from points inside rooms walk N/S/E/W and report how close to the room bounds the player ends up
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 300, height: 200 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file:///data/fears_game/dist/believe_it_farm_v1.html?dev=1&still=1');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const pts = JSON.parse(process.argv[2] || '[]');
  for (const [name, x, z, lvl] of pts) {
    const res = await page.evaluate(([x, z, lvl]) => {
      const o = {};
      for (const [k, yaw] of [['N', 0], ['W', Math.PI / 2], ['S', Math.PI], ['E', -Math.PI / 2]]) {
        window.__set({ cam: { pos: [x, 0, z], lvl } }); window.__dbg.P.yaw = yaw; window.__dbg.P.vel.set(0, 0, 0);
        const r = window.__walk(['KeyW'], 5); o[k] = [+r.pos[0].toFixed(2), +r.pos[2].toFixed(2), r.lvl];
      }
      return o;
    }, [x, z, lvl || 0]);
    console.log(name, JSON.stringify(res));
  }
  await browser.close(); process.exit(0);
})();
