// Renders for the newspaper model sheet -> qa/newsheet/*.png (+ clue callout points in hero.json)
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
const fs = require('fs');
const Q = '/data/fears_game/qa/newsheet/';
const BG = [0.78, 0.77, 0.73];
const shots = [
  ['t_ff', 700, 560, { state: 'fold', angle: 0, elev: 0, frame: [0.16, 0.205] }],
  ['t_fb', 700, 560, { angle: Math.PI }],
  ['t_of', 560, 760, { state: 'open', angle: 0, elev: 0, frame: [0.3, 0.205] }],
  ['t_ob', 560, 760, { angle: Math.PI }],
  ['hero', 1042, 844, { state: 'bench', angle: -0.3, elev: 0.72, frame: [0.19, 0.25], target: [-0.035, 0, 0.0] }],
  ['s1', 420, 520, { state: 'fold', angle: 0.8, elev: 0.25, frame: [0.3, 0.2], target: [0, -0.05, 0] }],
  ['s2', 420, 520, { fold: 0.62, foldT: 0.62 }],
  ['s3', 420, 520, { fold: 0.3, foldT: 0.3 }],
  ['s4', 420, 520, { fold: 0, foldT: 0 }],
  ['wire', 420, 520, { state: 'fold', angle: -0.5, elev: 0.3, frame: [0.17, 0.21], target: [0, 0, 0], wire: true }],
  ['c_thumb', 420, 420, { wire: false, angle: 0.1, elev: 0.15, frame: [0.032, 0.032], clue: 'thumb' }],
  ['c_straw', 420, 420, { state: 'bench', angle: 0.5, elev: 0.6, frame: [0.055, 0.055], clue: 'straw' }],
  ['c_damp', 420, 420, { state: 'fold', angle: 0.35, elev: 0.3, frame: [0.05, 0.05], clue: 'damp' }],
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file:///data/fears_game/dist/believe_it_hands_v1.html?dev=1&still=1&mode=news');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  for (const [name, w, h, o] of shots) {
    await page.evaluate(([w, h, o, bg]) => {
      const st = document.querySelector('#stage'); st.style.position = 'fixed'; st.style.left = '0'; st.style.top = '0'; st.style.width = w + 'px'; st.style.height = h + 'px'; st.style.zIndex = 50;
      window.__set({ news: { clear: bg, spin: false, res: 720, ...o } });
    }, [w, h, o, BG]);
    await page.waitForTimeout(400);
    await page.locator('#c').screenshot({ path: Q + name + '.png' });
    if (name === 'hero') {
      const pts = await page.evaluate(() => {
        const D = window.__dbg, M = D.newsView, N = M.N, out = {};
        M.scene.updateMatrixWorld(true);
        const c = document.querySelector('#c'), W = c.clientWidth, H = c.clientHeight;
        for (const k of ['thumb', 'damp', 'straw', 'finger']) {
          const v = N.group.localToWorld(N.clue(k).p.clone()).project(M.cam);
          out[k] = [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
        }
        // the fold edge (bottom middle) and the masthead
        for (const [k, p] of [['fold', [-0.25, -0.001, 0.001]], ['mast', [-0.12, 0.262, 0.001]]]) {
          const v = N.group.localToWorld(new D.THREE.Vector3(...p)).project(M.cam); out[k] = [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
        }
        return out;
      });
      fs.writeFileSync(Q + 'hero.json', JSON.stringify(pts));
    }
    console.log('saved', name);
  }
  // first-person poses (4:3 canvas)
  for (const [name, pose] of [['fp_paper', 'paper'], ['fp_read', 'read']]) {
    await page.evaluate(([pose]) => {
      const st = document.querySelector('#stage'); st.style.width = '800px'; st.style.height = '600px';
      window.__set({ mode: 'poses', pose, yaw: 0, pitch: 0, zoom: 1 });
    }, [pose]);
    await page.waitForTimeout(500);
    await page.locator('#c').screenshot({ path: Q + name + '.png' });
    console.log('saved', name);
  }
  await page.close(); await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
