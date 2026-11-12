const path = require('node:path'), fs = require('node:fs'), { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', r => /^(file:|data:|blob:)/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto(pathToFileURL(path.join(root, 'dist/browser/believe_it_farm.html')).href + '?dev=1&still=1&lock=broken');
    await page.waitForFunction(() => window.__ready);
    const report = await page.evaluate(({ roll, offset }) => {
      const { farm, THREE } = window.__dbg, d = farm.doors.find(d => d.d.id === 'd16');
      const staple = d.hardware.fixedHasp.staple.children.find(m => m.geometry?.type === 'TubeGeometry');
      const wires = [];d.hardware.lock.broken.traverse(m => { if (m.geometry?.type === 'TubeGeometry') wires.push(m); });
      const eye = Array.from({ length: 201 }, (_, i) => staple.geometry.parameters.path.getPoint(i / 200));
      const phases = []; let debug;
      for (let f = 0; f <= 100; f++) {
        const t = f / 100;
        d.hardware.lock.pose.rotation.set(0, 0, 0);
        d.hardware.lock.setRelease(t);
        if (roll) {
          const pose = d.hardware.lock.pose, anchor = new THREE.Vector3(-19.9, 4, 0);
          const ramp = t < .12 ? t / .12 : t > .86 ? (1 - t) / .14 : 1;
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll * ramp);
          pose.position.sub(anchor).applyQuaternion(q).add(anchor); pose.quaternion.premultiply(q);
          pose.position.z += offset * ramp;
        }
        d.hardware.fixed.updateMatrixWorld(true);
        if (f === 71) debug = { posePosition: d.hardware.lock.pose.position.toArray(), poseQuaternion: d.hardware.lock.pose.quaternion.toArray(), roll, offset, tip: wires[1].geometry.parameters.path.getPoint(1).applyMatrix4(wires[1].matrixWorld).applyMatrix4(staple.matrixWorld.clone().invert()).toArray() };
        const inv = staple.matrixWorld.clone().invert(); let min = Infinity, pair;
        for (let w = 0; w < wires.length; w++) for (let i = 0; i <= 200; i++) {
          const q = wires[w].geometry.parameters.path.getPoint(i / 200).applyMatrix4(wires[w].matrixWorld).applyMatrix4(inv);
          for (const p of eye) {
            const c = q.distanceTo(p) - wires[w].geometry.parameters.radius - staple.geometry.parameters.radius;
            if (c < min) { min = c; pair = { wire: w, u: i / 200, wirePoint: q.toArray(), eyePoint: p.toArray() }; }
          }
        }
        phases.push({ release: f / 100, min, pair });
      }
      d.hardware.lock.setRelease(0);
      return { debug, min: phases.reduce((a, b) => a.min < b.min ? a : b), phases: phases.filter(p => p.release % .1 < .001 || p.min < 0) };
    }, { roll: Number(process.argv[3] || 0), offset: Number(process.argv[4] || 0) });
    const out = path.resolve(root, process.argv[2] || 'qa/recovery/lock-probe-before.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ debug: report.debug, min: report.min, collisionRange: report.phases.filter(p => p.min < 0).map(p => p.release) }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
