// Find coplanar (or near-coplanar) overlapping same-facing triangles in the static farm meshes -> z-fighting candidates.
// Usage: node tools/zfight.cjs [gapTol=0.004] > out.txt
const { chromium } = require('/vercel/sandbox/node_modules/playwright');
const tol = +(process.argv[2] || 0.004);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file:///data/fears_game/dist/believe_it_farm_v1.html?dev=1&still=1&zf=1');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const out = await page.evaluate((tol) => {
    const { farm } = window.__dbg;
    const T = []; // [ax,ay,bx,by,cx,cy, d, key, src, nx,ny,nz, cx3...]
    const meshes = [];
    for (const g of Object.values(farm.groups)) for (const m of g.children) if (m.isMesh) meshes.push([g.name + '|' + m.userData.mat, m]);
    for (const D of farm.doors) { D.pivot.updateMatrixWorld(true); D.g.traverse((o) => { if (o.isMesh) meshes.push(['door:' + D.d.id + '|' + (o.material.userData.name || 'm'), o]); }); }
    const groupsN = new Map();
    for (const [src, m] of meshes) {
      m.updateMatrixWorld(true);
      const p = m.geometry.attributes.position, idx = m.geometry.index, M = m.matrixWorld.elements;
      const n = idx ? idx.count : p.count;
      const V = (i) => { const k = idx ? idx.getX(i) : i; const x = p.getX(k), y = p.getY(k), z = p.getZ(k); return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; };
      for (let i = 0; i < n; i += 3) {
        const a = V(i), b = V(i + 1), c = V(i + 2);
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
        const L = Math.hypot(nx, ny, nz); if (L < 1e-7) continue; nx /= L; ny /= L; nz /= L;
        const key = [nx, ny, nz].map((q) => Math.round(q * 50)).join(',');
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        const pr = ay >= ax && ay >= az ? (q) => [q[0], q[2]] : ax >= az ? (q) => [q[2], q[1]] : (q) => [q[0], q[1]];
        const d = nx * a[0] + ny * a[1] + nz * a[2];
        const A = pr(a), B = pr(b), C = pr(c);
        if (!groupsN.has(key)) groupsN.set(key, []);
        groupsN.get(key).push({ d, P: [A, B, C], src, bb: [Math.min(A[0], B[0], C[0]), Math.min(A[1], B[1], C[1]), Math.max(A[0], B[0], C[0]), Math.max(A[1], B[1], C[1])], c3: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3] });
      }
    }
    const area = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - a[1] * b[0]; } return s / 2; };
    const clip = (subj, clipP) => { // Sutherland-Hodgman, clipP convex CCW
      let out = subj;
      for (let i = 0; i < clipP.length && out.length; i++) {
        const A = clipP[i], B = clipP[(i + 1) % clipP.length], inp = out; out = [];
        const side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
        for (let j = 0; j < inp.length; j++) {
          const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
          if (sp >= 0) out.push(P);
          if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
        }
      }
      return out;
    };
    const ccw = (P) => (area(P) < 0 ? [P[0], P[2], P[1]] : P);
    const BX = farm.ctx.kit.dbg, grid = new Map();
    for (const b of BX) for (let i = Math.floor(b[0]); i <= Math.floor(b[3]); i++) for (let j = Math.floor(b[2]); j <= Math.floor(b[5]); j++) { const k = i + ',' + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
    const inside = (p) => { const L = grid.get(Math.floor(p[0]) + ',' + Math.floor(p[2])) || []; for (const b of L) if (p[0] > b[0] + 1e-3 && p[0] < b[3] - 1e-3 && p[1] > b[1] + 1e-3 && p[1] < b[4] - 1e-3 && p[2] > b[2] + 1e-3 && p[2] < b[5] - 1e-3) return true; return false; };
    let hidden = 0;
    const hits = new Map();
    for (const [key, arr] of groupsN) {
      arr.sort((p, q) => p.d - q.d);
      for (let i = 0; i < arr.length; i++) {
        const A = arr[i];
        for (let j = i + 1; j < arr.length && arr[j].d - A.d <= tol; j++) {
          const B = arr[j];
          if (B.bb[0] >= A.bb[2] - 1e-4 || B.bb[2] <= A.bb[0] + 1e-4 || B.bb[1] >= A.bb[3] - 1e-4 || B.bb[3] <= A.bb[1] + 1e-4) continue;
          const I = clip(ccw(A.P), ccw(B.P));
          if (I.length < 3) continue;
          const ar = Math.abs(area(I));
          if (ar < 2e-4) continue;
          const nn = key.split(',').map(Number).map((q) => q / 50);
          const ci = I.reduce((s, q) => [s[0] + q[0] / I.length, s[1] + q[1] / I.length], [0, 0]);
          const axn = nn.findIndex((q) => Math.abs(q) > 0.99);
          if (axn >= 0) {
            const dd = (A.d + B.d) / 2 / nn[axn];
            const p3 = axn === 1 ? [ci[0], dd, ci[1]] : axn === 0 ? [dd, ci[1], ci[0]] : [ci[0], ci[1], dd];
            const q3 = p3.map((v, k) => v + nn[k] * 0.012);
            if (inside(q3)) { hidden++; continue; }
            if (axn === 1 && nn[1] < 0 && p3[1] < 0.45) { hidden++; continue; }
          }
          const pair = [A.src, B.src].sort().join(' ~ ');
          const loc = A.c3.map((q) => Math.round(q * 2) / 2).join(',');
          const hk = pair + ' @' + key + ' gap' + (B.d - A.d).toFixed(3) + ' near ' + loc;
          const h = hits.get(hk) || { n: 0, a: 0 }; h.n++; h.a += ar; hits.set(hk, h);
        }
      }
    }
    return ['hidden ' + hidden, ...[...hits.entries()].sort((a, b) => b[1].a - a[1].a).map(([k, h]) => h.a.toFixed(3) + ' m2  x' + h.n + '  ' + k)];
  }, tol);
  console.log(out.length + ' hits'); for (const l of out) console.log(l);
  await page.close(); await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
