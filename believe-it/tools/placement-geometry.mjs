// Physical checks against generated geometry, independent of the browser renderer.
import * as THREE from 'three';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Kit } from '../src/scenes/farm_kit.js';
import { Y, DOORS } from '../src/scenes/farm_plan.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
const out = resolve(root, process.argv[2] || 'qa/placement-v8/geometry-final.json');
try { await access(out); throw new Error('Use a new output: ' + out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
async function source(name) {
  if (!baseline) return import(pathToFileURL(resolve(root, 'src/scenes', name)));
  const text = (await readFile(resolve(root, 'qa/placement-v8/before-source', name), 'utf8')).replace(/from\s+(['"])([^'"]+)\1/g, (_,q,s) => {
    const target = s.startsWith('.') ? pathToFileURL(resolve(root, 'src/scenes', s)).href : import.meta.resolve(s);
    return `from ${q}${target}${q}`;
  });
  return import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
}
const P = await source('farm_props.js'), D = await source('farm_details.js'), W = await source('farm_yard.js');
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
class Capture extends Kit {
  constructor() { super({}); this.parts = []; }
  texel() { return 1; }
  add(grp, m, g) {
    const mesh = new THREE.Mesh(g, material); mesh.updateMatrixWorld(true); g.computeBoundingBox();
    this.parts.push({ grp, m, mesh, bb: g.boundingBox }); return g;
  }
  part(grp, m, geo, o = {}) {
    const g = super.part(grp,m,geo,o), record = this.parts.at(-1);
    Object.assign(record, { source: geo, matrix: o.m || new THREE.Matrix4().compose(new THREE.Vector3(...(o.pos || [0,0,0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot || [0,0,0]))), new THREE.Vector3(1,1,1)) });
    return g;
  }
}
const vec = a => new THREE.Vector3(...a);
function ray(parts, origin, direction) {
  const caster = new THREE.Raycaster(vec(origin),vec(direction).normalize(),0,20);
  return caster.intersectObjects(parts.map(p => p.mesh), false)[0];
}
const report = { baseline, checks: [], basket: {} };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail });
const kit = new Capture();
P.feedBin(new P.Frame(kit,'base',7.72,Y.stab,-6.55,Math.PI/2));
D.dressFarm({ kit });
const rail = kit.parts.find(p => p.m === 'wood' && p.bb.min.x > 10.6 && p.bb.max.x < 11.05 && p.bb.max.z-p.bb.min.z > .75 && p.bb.min.y > .7 && p.bb.max.y < .85);
check('Rail back meets the stable east wall', rail && Math.abs(11-rail.bb.max.x) <= .001, { gapMm: rail ? (11-rail.bb.max.x)*1000 : null });
const door = DOORS.find(d => d.id === 'd11');
const doorZ = [door.hinge[2]-door.w,door.hinge[2]];
check('Rail clears the whole closed doorway', rail && (rail.bb.max.z < doorZ[0] || rail.bb.min.z > doorZ[1]), { railZ: rail && [rail.bb.min.z,rail.bb.max.z], doorwayZ: doorZ });
const rings = kit.parts.filter(p => p.m === 'rope' && p.source?.type === 'TorusGeometry' && p.bb.min.x > 10.4 && p.bb.max.x < 11.1 && p.bb.min.y > .4 && p.bb.max.y < .8);
const hooks = kit.parts.filter(p => p.m === 'iron' && p.bb.min.x > 10.4 && p.bb.max.x < 11.1 && p.bb.min.y > .6 && p.bb.max.y < .8);
const ringGaps = rings.map(p => {
  const center = p.bb.getCenter(new THREE.Vector3()), t = p.source.parameters;
  const hit = ray(hooks,[center.x,center.y+t.radius-t.tube+.001,center.z],[0,-1,0]);
  return hit ? hit.distance-.001 : Infinity;
});
check('All three rope loops rest on their hooks', ringGaps.length === 3 && ringGaps.every(g => g >= -.001 && g <= .001), { gapsMm: ringGaps.map(g => Number.isFinite(g)?g*1000:null) });
const covers = kit.parts.filter(p => p.m === 'leather' && p.bb.min.x > 7.5 && p.bb.max.x < 8 && p.bb.min.z > -6.95 && p.bb.max.z < -6.3);
const cover = covers.filter(p => p.bb.max.y-p.bb.min.y < .005).sort((a,b)=>a.bb.min.y-b.bb.min.y)[0];
const supports = kit.parts.filter(p => ['wood','plank'].includes(p.m));
const bookGaps = [];
if (cover) {
  const b = cover.bb, c = b.getCenter(new THREE.Vector3());
  for (const [x,z] of [[c.x,c.z],[b.min.x+.002,b.min.z+.002],[b.min.x+.002,b.max.z-.002],[b.max.x-.002,b.min.z+.002],[b.max.x-.002,b.max.z-.002]]) {
    const hit = ray(supports,[x,b.min.y+.001,z],[0,-1,0]); bookGaps.push(hit ? hit.distance-.001 : Infinity);
  }
}
check('Ledger cover has support across its footprint', bookGaps.length === 5 && bookGaps.every(g => Math.abs(g)<.001), { gapsMm: bookGaps.map(g => Number.isFinite(g)?g*1000:null) });
let unsupported = 0, outside = 0, maxSupportGap = 0, minWallClearance = Infinity;
for (let seed = 1; seed <= 20; seed++) {
  const basket = new Capture(); P.logBasket(new P.Frame(basket,'base'), { seed });
  const shell = basket.parts.filter(p => p.m === 'wicker');
  const logs = basket.parts.filter(p => p.m === 'bark');
  for (let i=0;i<logs.length;i++) {
    const log = logs[i], center = log.bb.getCenter(new THREE.Vector3());
    const other = basket.parts.filter(p => p !== log && ['wicker','bark'].includes(p.m));
    const hit = ray(other,[center.x,log.bb.min.y+.0005,center.z],[0,-1,0]);
    const gap = hit ? hit.distance-.0005 : Infinity;
    if (gap < -.001 || gap > .001) unsupported++;
    maxSupportGap = Math.max(maxSupportGap,gap);
    const g = log.mesh.geometry, p = g.attributes.position;
    for (let j=0;j<p.count;j++) {
      const x=p.getX(j),y=p.getY(j),z=p.getZ(j), radius=Math.hypot(x,z);
      if (radius < 1e-6) continue;
      const wall = ray(shell,[0,y,0],[x,0,z]), clearance = wall ? wall.distance-radius : -Infinity;
      minWallClearance = Math.min(minWallClearance,clearance);
      if (clearance < -.0002 || y < .0148) outside++;
    }
  }
}
report.basket = { seeds: 20, logs: 180, unsupported, verticesOutside: outside, maxSupportGapMm: Number.isFinite(maxSupportGap)?maxSupportGap*1000:null, minWallClearanceMm: Number.isFinite(minWallClearance)?minWallClearance*1000:null };
check('Basket billets rest on the floor or lower tier (20 seeds)', unsupported === 0, report.basket);
check('Basket billets stay inside the actual wicker shell (20 seeds)', outside === 0, report.basket);
const engine = new Capture(); P.engine(new P.Frame(engine,'base',2.5,Y.stab,-13.9));
const exhaust = engine.parts.filter(p => p.source?.parameters.radiusTop === .035 && p.source?.parameters.radiusBottom === .035).sort((a,b)=>b.bb.max.y-a.bb.max.y)[0];
const h = exhaust.source.parameters.height, endpoint = vec([0,h/2,0]).applyMatrix4(exhaust.matrix);
const yard = new Capture(); W.buildYard({ kit: yard, floors: [] });
const elbow = yard.parts.find(p => p.source?.type === 'TubeGeometry' && p.bb.min.x > 1.3 && p.bb.max.x < 1.8 && p.bb.min.y > 1.4);
const gap = elbow ? endpoint.distanceTo(elbow.source.parameters.path.getPoint(0).applyMatrix4(elbow.matrix)) : Infinity;
check('Hut flue starts at the actual motor exhaust endpoint', gap < .001, { gapMm: Number.isFinite(gap)?gap*1000:null, motorEndpoint: endpoint.toArray() });
const roof = yard.parts.filter(p => ['roof','wood'].includes(p.m));
let roofHits = 0;
for (let i=0;i<12;i++) {
  const a=i*Math.PI/6, hit=ray(roof,[1.6+Math.cos(a)*.065,2.7,-14.6+Math.sin(a)*.065],[0,1,0]);
  if (hit && hit.point.y < 3.5) roofHits++;
}
check('Roof has clearance around the whole vertical flue', roofHits === 0, { obstructedRays: roofHits, samples: 12 });
const clamp = yard.parts.find(p => p.m === 'iron' && p.bb.min.x < 1.3 && p.bb.max.x > 1.31 && p.bb.min.y > 2 && p.bb.max.y < 2.3);
check('Flue clamp plate reaches the brick wall', !!clamp, clamp && { x: [clamp.bb.min.x,clamp.bb.max.x] });
await writeFile(out, JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if (report.checks.some(c => !c.pass)) process.exitCode = 1;
