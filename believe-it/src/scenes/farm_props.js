// Props for the farmstead, built into a Kit through a local Frame (x right, y up, +z = the prop's front).
// Material names get the indoor variant ("_i", dimmer ambient) when the frame is indoors.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from '../engine/util.js';

const V3 = THREE.Vector3;
const H = Math.PI / 2;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const Q = (rot) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
// lathe from [r, y] pairs (kept uv: u round, v up the profile)
const LP = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
export const lathe = (f, m, pts, seg = 16, o = {}) => f.part(m, new THREE.LatheGeometry(LP(pts), seg), { smooth: true, uv: 'keep', ...o });
const S3 = (s) => (Array.isArray(s) ? new V3(...s) : new V3(s, s, s));
function grainUV(geo,axis=null) {
  const g=geo.clone();g.computeBoundingBox();const size=g.boundingBox.getSize(new V3()).toArray();
  const a=axis??size.indexOf(Math.max(...size)),p=g.attributes.position,n=g.attributes.normal;
  let uv=g.attributes.uv;if(!uv){uv=new THREE.BufferAttribute(new Float32Array(p.count*2),2);g.setAttribute('uv',uv);}
  for(let i=0;i<p.count;i++){
    const c=[p.getX(i),p.getY(i),p.getZ(i)],ns=[Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i))];
    const face=ns.indexOf(Math.max(...ns)),cross=[0,1,2].find(j=>j!==a&&j!==face)??(a+1)%3;
    uv.setXY(i,c[a]+.47,c[cross]+.31);
  }return g;
}

export class Frame {
  constructor(kit, grp, x = 0, y = 0, z = 0, yaw = 0, indoor = true, M = null) {
    this.k = kit; this.g = grp; this.indoor = indoor; this.lvl = grp === 'attic' ? 1 : 0; // colliders of attic props live on level 1
    this.M = M || new THREE.Matrix4().compose(new V3(x, y, z), Q([0, yaw, 0]), new V3(1, 1, 1));
  }
  sub(x = 0, y = 0, z = 0, yaw = 0, rot = null) {
    const L = new THREE.Matrix4().compose(new V3(x, y, z), Q(rot || [0, yaw, 0]), new V3(1, 1, 1));
    return new Frame(this.k, this.g, 0, 0, 0, 0, this.indoor, this.M.clone().multiply(L));
  }
  grp(g) { return new Frame(this.k, g, 0, 0, 0, 0, this.indoor, this.M.clone()); }
  out() { return new Frame(this.k, this.g, 0, 0, 0, 0, false, this.M.clone()); }
  mn(m) { return this.indoor && this.k.mats[m + '_i'] ? m + '_i' : m; }
  part(m, geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, ...o } = {}) {
    if(m==='wood'&&(!o.uv||o.uv==='planar')){geo=grainUV(geo);o.uv='keep';}
    const L = new THREE.Matrix4().compose(new V3(...pos), Q(rot), S3(scale));
    return this.k.part(this.g, this.mn(m), geo, { ...o, m: this.M.clone().multiply(L) });
  }
  box(m, x0, y0, z0, x1, y1, z1, col, o = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0]; // never build inside-out boxes
    return this.part(m, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), { pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], col, ...o }); }
  obox(m, sx, sy, sz, pos, rot = [0, 0, 0], col, o = {}) { return this.part(m, new THREE.BoxGeometry(sx, sy, sz), { pos, rot, col, ...o }); }
  cyl(m, rb, rt, h, seg, pos, rot = [0, 0, 0], col, o = {}) { return this.part(m, new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), { pos, rot, col, ...o }); }
  sph(m, r, pos, scale = 1, col, o = {}) { return this.part(m, new THREE.SphereGeometry(r, o.ws || 10, o.hs || 7), { pos, scale, col, smooth: true, ...o }); }
  // rod between two local points
  rod(m, a, b, r, seg = 6, col, o = {}) {
    const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize());
    const Lm = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new V3(1, 1, 1));
    let geo=new THREE.CylinderGeometry(o.r2 ?? r, r, L, seg, 1, !!o.open);
    if(m==='wood'){geo=grainUV(geo,1);o={...o,uv:'keep'};}
    return this.k.part(this.g, this.mn(m), geo, { ...o, col, m: this.M.clone().multiply(Lm) });
  }
  // beam (square section) between two local points
  beam(m, a, b, w, h, col, o = {}) {
    const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), L = d.length();
    const yaw = Math.atan2(d.x, d.z), pitch = -Math.asin(d.y / L);
    const Lm = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), new V3(1, 1, 1));
    let geo=new THREE.BoxGeometry(w,h,L);if(m==='wood'){geo=grainUV(geo,2);o={...o,uv:'keep'};}
    return this.k.part(this.g, this.mn(m), geo, { ...o, col, m: this.M.clone().multiply(Lm) });
  }
  // world-space AABB of a local rectangle
  solid(x0, z0, x1, z1, lvl = this.lvl, tag = null) {
    const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new V3(x, 0, z).applyMatrix4(this.M));
    return this.k.solid(Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.z)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.z)), lvl, tag);
  }
  wpos(x, y, z) { return new V3(x, y, z).applyMatrix4(this.M); }
}

/* ---------------------------------------------------------------- colours */
export const C = {
  oak: [1.0, 0.92, 0.82], dark: [0.62, 0.52, 0.44], pine: [1.12, 1.02, 0.86], grey: [0.86, 0.84, 0.82], black: [0.18, 0.17, 0.17],
  iron: [0.9, 0.9, 0.92], brass: [1.6, 1.25, 0.6], white: [1, 1, 1], linen: [1.02, 1.0, 0.95], burlap: [0.82, 0.68, 0.5], tarp: [0.4, 0.42, 0.37],
  red: [0.75, 0.26, 0.22], green: [0.42, 0.55, 0.45], shutter: [0.62, 0.72, 0.66], straw: [1.05, 0.98, 0.9], crock: [0.78, 0.6, 0.42], glaze: [0.55, 0.4, 0.3],
};

/* ---------------------------------------------------------------- furniture */
// Local grain follows the long dimension of a board, including furniture placed at an angle.
export function timber(f, x0,y0,z0,x1,y1,z1,col=C.oak,axis=null) {
  const sizes=[x1-x0,y1-y0,z1-z0], a=axis ?? sizes.indexOf(Math.max(...sizes));
  const geo=new RoundedBoxGeometry(...sizes,1,Math.min(.003,Math.min(...sizes)*.18));
  const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;
  for(let i=0;i<p.count;i++) {
    const c=[p.getX(i),p.getY(i),p.getZ(i)], ns=[Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i))];
    const face=ns.indexOf(Math.max(...ns)), cross=[0,1,2].find(j=>j!==a&&j!==face)??(a+1)%3;
    uv.setXY(i,c[a]+.47,c[cross]+.31);
  }
  f.part('wood',geo,{pos:[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],col,uv:'keep',smooth:true});
}
export function cloth(f,{w=.4,l=.6,col=C.linen,material='linen',drop=0,seed=1}={}) {
  const geo=new THREE.PlaneGeometry(w,l,14,18),p=geo.attributes.position,r=rng(seed),ph=r()*6;
  geo.rotateX(-H);
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),edge=Math.max(0,(Math.abs(z)/(l/2)-.68)/.32);
    p.setY(i,.007+Math.sin(x*37+z*16+ph)*.004+Math.sin(z*21+ph)*.003-drop*edge*edge);
  }
  geo.computeVertexNormals();f.part(material,geo,{col,smooth:true});
}
// double bed with high head board, feather duvet and pillows; footprint w x l, head at local -z
// farmhouse double bed: panelled head and foot boards between turned posts with knobs, side rails, straw mattress
// (Strohsack) with a linen sheet, a fat checked feather duvet and pillows; footprint w x l, head at local -z
export function bed(f, { w = 1.0, l = 1.95, check = 'checkB', r = rng(1) } = {}) {
  const h = 0.48, z0 = -l / 2, z1 = l / 2, O = C.oak, D = C.dark;
  const post = (x, z, top) => {
    f.box('wood', x - 0.035, 0, z - 0.035, x + 0.035, top, z + 0.035, D, { rotUV: true });
    lathe(f.sub(x, top, z), 'wood', [[0, 0], [0.04, 0], [0.045, 0.02], [0.03, 0.04], [0.045, 0.07], [0.03, 0.1], [0, 0.11]], 10, { col: D, uv: 'planar' });
  };
  for (const [z, top, y1] of [[z0, 1.05, 1.0], [z1, 0.72, 0.66]]) {
    for (const sx of [-1, 1]) post(sx * (w / 2 + 0.005), z, top);
    f.box('wood', -w / 2, 0.2, z - 0.025, w / 2, y1 - 0.06, z + 0.025, O, { rotUV: true }); // panel (between the rails: no shared faces)
    f.box('wood', -w / 2, y1 - 0.06, z - 0.04, w / 2, y1, z + 0.04, D); f.box('wood', -w / 2, 0.15, z - 0.035, w / 2, 0.2, z + 0.035, D); // rails
    for (const sg of [-1, 1]) f.box('wood', -w / 2 + 0.08, 0.26, z + sg * 0.03 - 0.005, w / 2 - 0.08, y1 - 0.12, z + sg * 0.03 + 0.005, [0.86, 0.74, 0.62], { rotUV: true }); // raised fields
  }
  for (const sx of [-1, 1]) f.box('wood', sx * w / 2 - 0.03, 0.2, z0, sx * w / 2 + 0.03, 0.42, z1, O); // side rails
  f.part('linen', new THREE.BoxGeometry(w - 0.06, h - 0.3, l - 0.1, 3, 1, 4), { pos: [0, 0.3 + (h - 0.3) / 2, 0], col: [0.92, 0.88, 0.8] }); // straw mattress + sheet
  f.part('linen', new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, h - 0.02, 0], scale: [w - 0.06, 0.06, l - 0.12], col: [0.95, 0.93, 0.88], smooth: true });
  // duvet: one puffy quilt, hangs over the side rails, stops short of the foot board, folded back below the pillows
  const zA = z0 + 0.62, zB = z1 - 0.07, DL = zB - zA, DW = w + 0.1, th = 0.15, drop = 0.13;
  const dg = new THREE.BoxGeometry(DW, 1, DL, 16, 2, 18), dp = dg.attributes.position, ph = r() * 6;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i), ux = Math.min(1, Math.abs(x) / (DW / 2)), uz = z / (DL / 2), ty = y + 0.5;
    const puff = Math.sqrt(Math.max(0, 1 - Math.pow(ux, 6))) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(uz), 8)));
    const lump = 0.012 * Math.sin(x * 9 + uz * 5 + ph) + 0.009 * Math.sin(uz * 13 - x * 4 + ph * 2);
    const yTop = h + 0.012 + th * (0.3 + 0.7 * puff) + lump * puff, hang = sm(0.8, 1, ux) * (1 - sm(0.85, 1, uz)) * (1 - sm(0.85, 1, -uz));
    const yBot = h - 0.004 - drop * hang;
    dp.setXYZ(i, x * (1 + 0.025 * (1 - ty) * hang), yBot + (yTop - yBot) * ty, z);
  }
  dg.computeVertexNormals();
  f.part(check, dg, { pos: [0, 0, (zA + zB) / 2], col: C.white, smooth: true });
  f.part(check, new THREE.CapsuleGeometry(0.055, DW - 0.14, 4, 10), { pos: [0, h + 0.012 + th * 0.62, zA + 0.02], rot: [0, 0, Math.PI / 2], scale: [0.85, 1, 1], col: [0.92, 0.92, 0.95], smooth: true }); // the folded-back edge
  for (const px of w > 1.2 ? [-w / 4, w / 4] : [0]) {
    f.sph('linen', 0.5, [px, h + 0.1, z0 + 0.28], [w > 1.2 ? w * 0.44 : w * 0.86, 0.2, 0.42], C.linen);
    f.sph('linen', 0.5, [px, h + 0.2, z0 + 0.2], [w > 1.2 ? w * 0.4 : w * 0.7, 0.16, 0.24], [1.03, 1.02, 0.98]);
  }
  f.solid(-w / 2 - 0.05, z0 - 0.06, w / 2 + 0.05, z1 + 0.06);
}
// painted farmhouse wardrobe (front +z)
// painted farmhouse wardrobe (front +z): plinth on bun feet, two panelled doors with painted flower fields and
// frames, middle stile, keyhole escutcheons, a moulded cornice
export function wardrobe(f, { w = 1.2, d = 0.55, h = 1.9 } = {}) {
  const B = [0.5, 0.62, 0.62], D = C.dark;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.sph('wood', 0.045, [sx * (w / 2 - 0.06), 0.04, sz * (d / 2 - 0.06)], [1, 0.9, 1], D);
  f.box('wood', -w / 2, 0.07, -d / 2, w / 2, 0.18, d / 2, D);
  f.box('wood', -w / 2 + 0.02, 0.18, -d / 2, w / 2 - 0.02, h - 0.12, d / 2 - 0.02, B, { rotUV: true });
  f.box('wood', -w / 2 - 0.03, h - 0.12, -d / 2 - 0.02, w / 2 + 0.03, h - 0.06, d / 2 + 0.02, D);
  f.box('wood', -w / 2 - 0.05, h - 0.06, -d / 2 - 0.04, w / 2 + 0.05, h - 0.02, d / 2 + 0.04, B);
  f.box('wood', -w / 2 - 0.06, h - 0.02, -d / 2 - 0.05, w / 2 + 0.06, h + 0.03, d / 2 + 0.05, D);
  f.box('wood', -0.025, 0.18, d / 2 - 0.02, 0.025, h - 0.12, d / 2 + 0.005, D); // middle stile
  for (const sx of [-1, 1]) {
    const cx = sx * (w / 4 + 0.005), dw = w / 2 - 0.05;
    f.box('wood', cx - dw / 2, 0.2, d / 2 - 0.02, cx + dw / 2, h - 0.14, d / 2 + 0.005, [0.55, 0.68, 0.68], { rotUV: true }); // door leaf
    f.part('paint', new THREE.PlaneGeometry(dw - 0.14, (h - 0.34) * 0.56), { pos: [cx, 0.2 + (h - 0.34) * 0.64, d / 2 + 0.008], col: C.white, uv: 'keep' });
    f.part('paint', new THREE.PlaneGeometry(dw - 0.14, (h - 0.34) * 0.26), { pos: [cx, 0.2 + (h - 0.34) * 0.18, d / 2 + 0.008], col: [0.95, 0.9, 0.9], uv: 'keep' });
    for (const y of [0.22, 0.2 + (h - 0.34) * 0.34, h - 0.16]) f.box('wood', cx - dw / 2, y - 0.02, d / 2 + 0.005, cx + dw / 2, y + 0.02, d / 2 + 0.016, [0.6, 0.48, 0.32]);
    for (const ex of [-1, 1]) f.box('wood', cx + ex * dw / 2 - 0.02, 0.2, d / 2 + 0.005, cx + ex * dw / 2 + 0.02, h - 0.14, d / 2 + 0.016, [0.6, 0.48, 0.32]);
    f.box('brass', sx * 0.06 - 0.018, h / 2 - 0.05, d / 2 + 0.012, sx * 0.06 + 0.018, h / 2 + 0.05, d / 2 + 0.018, C.brass);
    f.box('iron', sx * 0.06 - 0.004, h / 2 - 0.02, d / 2 + 0.018, sx * 0.06 + 0.004, h / 2 + 0.01, d / 2 + 0.02, C.black);
    // Forged hinges, pins, and proud mouldings give the painted doors a real construction.
    for(const hy of [0.39,h-.31]) {
      const hx=sx*(w/2-.035);
      f.box('iron',hx-.012,hy-.055,d/2+.015,hx+.012,hy+.055,d/2+.024,[.62,.57,.52]);
      f.cyl('iron',.008,.008,.14,8,[hx,hy,d/2+.026],[0,0,0],[.75,.7,.64]);
      for(const dy of [-.035,.035]) f.sph('iron',.006,[hx,hy+dy,d/2+.027],[1,1,.45],[.9,.85,.76]);
    }
    for(const [cy,ph] of [[.2+(h-.34)*.64,(h-.34)*.56],[.2+(h-.34)*.18,(h-.34)*.26]]) {
      const pw=dw-.14;
      for(const e of [-1,1]) f.box('wood',cx+e*pw/2-.008,cy-ph/2,d/2+.008,cx+e*pw/2+.008,cy+ph/2,d/2+.018,[.75,.62,.48]);
      for(const e of [-1,1]) f.box('wood',cx-pw/2,cy+e*ph/2-.008,d/2+.008,cx+pw/2,cy+e*ph/2+.008,d/2+.018,[.75,.62,.48]);
    }
  }
  f.solid(-w / 2, -d / 2, w / 2, d / 2);
}
// farmhouse table: thick scrubbed top on a frame with a drawer, turned-look legs, foot rails
export function table(f, { w = 1.3, d = 0.8, h = 0.76, col = C.oak } = {}) {
  const D = C.dark;
  const boards=Math.max(3,Math.round(d/.2));
  for(let i=0;i<boards;i++) {
    const z0=-d/2+i*d/boards, z1=z0+d/boards;
    timber(f,-w/2,h-.045,z0+.001,w/2,h,z1-.001,col.map(c=>c*(.95+.025*(i%3))),0);
  }
  f.box('wood', -w / 2 - 0.01, h - 0.05, -d / 2 - 0.01, w / 2 + 0.01, h - 0.04, d / 2 + 0.01, D);
  for(const s of [-1,1]) {
    timber(f,-w/2+.07,h-.16,s*(d/2-.075)-.015,w/2-.07,h-.05,s*(d/2-.075)+.015,D,0);
    timber(f,s*(w/2-.075)-.015,h-.16,-d/2+.07,s*(w/2-.075)+.015,h-.05,d/2-.07,D,2);
  }
  f.box('wood', -0.22, h - 0.15, d / 2 - 0.075, 0.22, h - 0.06, d / 2 - 0.06, [0.9, 0.8, 0.68]); // drawer front
  f.sph('wood', 0.015, [0, h - 0.105, d / 2 - 0.055], 1, D);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - 0.1), z = sz * (d / 2 - 0.1);
    f.box('wood', x - 0.035, h - 0.2, z - 0.035, x + 0.035, h - 0.05, z + 0.035, col);
    lathe(f.sub(x, 0, z), 'wood', [[0, 0], [0.03, 0], [0.032, 0.05], [0.024, 0.1], [0.022, 0.3], [0.03, 0.36], [0.022, 0.42], [0.026, h - 0.2], [0, h - 0.2]], 10, { col, uv: 'planar' });
  }
  for (const sz of [-1, 1]) f.box('wood', -w / 2 + 0.1, 0.1, sz * (d / 2 - 0.1) - 0.02, w / 2 - 0.1, 0.15, sz * (d / 2 - 0.1) + 0.02, D);
  f.box('wood', -0.02, 0.1, -d / 2 + 0.1, 0.02, 0.15, d / 2 - 0.1, D);
  for(const sx of [-1,1]) for(const sz of [-1,1]) {
    f.cyl('wood',.005,.005,.003,8,[sx*(w/2-.105),h-.10,sz*(d/2-.055)],[H,0,0],C.pine);
    f.cyl('wood',.004,.004,.003,8,[sx*(w/2-.08),h+.0005,sz*(d/2-.12)],[0,0,0],D);
  }
  f.solid(-w / 2, -d / 2, w / 2, d / 2);
}
// Bavarian board chair (Brettstuhl), back at -z: thick seat, four splayed legs wedged through it, a shaped back board
// with the heart cut-out
let CHAIR_BACK = null;
export function chair(f, { col = C.oak } = {}) {
  if (!CHAIR_BACK) {
    const sh = new THREE.Shape();
    sh.moveTo(-0.13, 0); sh.lineTo(0.13, 0); sh.bezierCurveTo(0.16, 0.2, 0.2, 0.32, 0.19, 0.42); sh.bezierCurveTo(0.17, 0.5, 0.06, 0.48, 0, 0.52);
    sh.bezierCurveTo(-0.06, 0.48, -0.17, 0.5, -0.19, 0.42); sh.bezierCurveTo(-0.2, 0.32, -0.16, 0.2, -0.13, 0);
    const hole = new THREE.Path(); // heart
    hole.moveTo(0, 0.22); hole.bezierCurveTo(-0.01, 0.25, -0.06, 0.26, -0.06, 0.3); hole.bezierCurveTo(-0.06, 0.34, -0.02, 0.35, 0, 0.32);
    hole.bezierCurveTo(0.02, 0.35, 0.06, 0.34, 0.06, 0.3); hole.bezierCurveTo(0.06, 0.26, 0.01, 0.25, 0, 0.22);
    sh.holes.push(hole);
    CHAIR_BACK = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false, curveSegments: 8 });
  }
  timber(f,-.21,.42,-.2,.21,.47,.2,col,2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.beam('wood', [sx * 0.15, 0.44, sz * 0.14], [sx * 0.2, 0, sz * 0.2], 0.04, 0.04, col);
  for (const sx of [-1, 1]) f.box('wood', -0.2, 0.37, sx * 0.14 - 0.025, 0.2, 0.42, sx * 0.14 + 0.025, C.dark); // battens under the seat
  f.part('wood', CHAIR_BACK, { pos: [0, 0.45, -0.21], rot: [-0.14, 0, 0], col });
  for(const sx of [-1,1]) for(const sz of [-1,1]) f.cyl('wood',.009,.009,.002,8,[sx*.15,.471,sz*.14],[0,0,0],C.dark);
  f.solid(-0.22, -0.22, 0.22, 0.22);
}
export function bench(f, { l = 1.6, h = 0.45, col = C.oak, solid = true } = {}) { // along local x: thick seat on shaped board legs
  for(const z of [-.085,.085]) timber(f,-l/2,h-.05,z-.084,l/2,h,z+.084,col,0);
  f.box('wood', -l / 2 + 0.03, h - 0.06, 0.15, l / 2 - 0.03, h - 0.05, 0.172, C.dark);
  for (const sx of [-1, 1]) {
    const x = sx * (l / 2 - 0.15);
    f.box('wood', x - 0.025, 0, -0.14, x + 0.025, h - 0.05, -0.05, C.dark, { rotUV: true }); f.box('wood', x - 0.025, 0, 0.05, x + 0.025, h - 0.05, 0.14, C.dark, { rotUV: true });
    f.box('wood', x - 0.025, 0.22, -0.05, x + 0.025, h - 0.05, 0.05, C.dark);
  }
  f.box('wood', -l / 2 + 0.15, 0.14, -0.02, l / 2 - 0.15, 0.19, 0.02, C.dark); // stretcher
  if (solid) f.solid(-l / 2, -0.18, l / 2, 0.18);
}
export function shelf(f, { w = 1.2, d = 0.3, h = 1.6, n = 4, col = C.dark } = {}) { // open wall shelf, back on -z
  for (const sx of [-1, 1]) {
    f.box('wood', sx * w / 2 - 0.025, 0, -d / 2, sx * w / 2 + 0.025, h, d / 2, col, { rotUV: true });
    f.box('wood', sx * w / 2 - 0.03, 0, d / 2 - 0.05, sx * w / 2 + 0.03, 0.08, d / 2 + 0.005, C.dark); // foot
  }
  const ys = Array.from({ length: n }, (_, i) => 0.12 + (i * (h - 0.2)) / (n - 1));
  for (const y of ys) {
    f.box('wood', -w/2, y-.02, -d/2, w/2, y+.02, d/2, col);
    f.box('wood', -w/2, y+.02, d/2-.018, w/2, y+.045, d/2, col);
    // Wooden ledgers, cross-grain end pieces and visible hand-forged fasteners.
    for(const sx of [-1,1]) {
      const x=sx*(w/2-.065);
      f.box('wood',x-.045,y-.065,-d/2+.025,x+.045,y-.02,d/2-.025,[col[0]*.8,col[1]*.8,col[2]*.8]);
      f.sph('iron',.006,[x,y+.047,d/2+.001],[1,1,.45],[.7,.65,.58]);
    }
    f.box('wood',-w/2+.03,y-.021,-d/2+.06,w/2-.03,y-.017,d/2-.06,[.48,.4,.32]);
  } // boards, lips and shelf supports
  f.box('wood', -w / 2 - 0.04, h, -d / 2 - 0.01, w / 2 + 0.04, h + 0.04, d / 2 + 0.03, col); // cornice
  for (let i = 0; i < 4; i++) f.box('plank', -w / 2 + (i * w) / 4 + 0.003, 0, -d / 2 - 0.01, -w / 2 + ((i + 1) * w) / 4 - 0.003, h, -d / 2 + 0.01, [0.55, 0.46, 0.4], { rotUV: true });
  f.solid(-w / 2, -d / 2, w / 2, d / 2);
  return ys.map((y) => y + 0.02);
}
export function barrel(f, { r = 0.3, h = 0.8, col = C.oak, solid = true, lid = true } = {}) {
  const prof = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * h)); }
  for(let i=0;i<18;i++) f.part('wood',new THREE.LatheGeometry(prof,3,i*Math.PI*2/18+.002,Math.PI*2/18-.004),{col:col.map(c=>c*(.88+(i%4)*.04)),uv:[.24,.8],smooth:true});
  for (const y of [0.06, h * 0.3, h * 0.7, h - 0.06]) { const rr = r * (0.86 + 0.14 * Math.sin((y / h) * Math.PI)) + 0.006; f.cyl('iron', rr, rr, 0.04, 16, [0, y, 0], [0, 0, 0], C.black, { open: true }); }
  f.cyl('plank', r * 0.84, r * 0.84, 0.02, 16, [0, h - 0.03, 0], [0, 0, 0], [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8], { open: false });
  f.cyl('plank', r * 0.86, r * 0.86, 0.03, 16, [0, h - 0.005, 0], [0, 0, 0], C.dark, { open: true }); // chime
  if (lid) { f.cyl('wood', r * 0.8, r * 0.8, 0.025, 16, [0, h - 0.008, 0], [0, 0, 0], [0.75, 0.62, 0.5]); f.box('wood', -0.03, h + 0.004, -r * 0.6, 0.03, h + 0.03, r * 0.6, C.dark); }
  f.cyl('wood', 0.025, 0.03, 0.02, 8, [0, h * 0.5, r * 0.99], [Math.PI / 2, 0, 0], C.dark); // bung
  for(const y of [.06,h*.3,h*.7,h-.06]) for(const a of [0,Math.PI]) {
    const rr=r*(.86+.14*Math.sin(y/h*Math.PI))+.009;
    f.sph('iron',.005,[Math.sin(a)*rr,y,Math.cos(a)*rr],1,C.iron);
  }
  if (solid) f.solid(-r, -r, r, r);
}
// tied jute sack: a lathe body (flat bottom, belly, neck pinched by a cord, frayed ear on top) that has settled under its
// own weight (belly bulges and slumps, shoulders sag, a lean to one side, flattened front / back), or lying on its side
export function sack(f, { s = 1, col = C.burlap, lean = 0, lie = false, seed = 1, full = 1 } = {}) {
  const r = rng(seed * 7 + 3), H0 = 0.62 * s, R0 = 0.22 * s;
  const prof = [[0, 0], [0.7, 0.0], [0.93, 0.05], [1.0, 0.2], [0.98, 0.42], [0.9, 0.62], [0.68, 0.8], [0.36, 0.9], [0.17, 0.94], [0.16, 0.99], [0.3, 1.05], [0.34, 1.1], [0.0, 1.08]];
  let g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * R0, y * H0 * (y > 0.92 ? 1 : full))), 14);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
  const ph = [r() * 6, r() * 6, r() * 6], P = g.attributes.position, sag = 0.12 + r() * 0.1;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const t = y / H0, a = Math.atan2(z, x);
    const bulge = 1 + sag * Math.sin(Math.min(t, 1) * Math.PI) * (1 - t) * 1.6 + Math.sin(a * 3 + ph[0]) * 0.05 + Math.sin(a * 5 + ph[1] + t * 4) * 0.03;
    x *= bulge; z *= bulge * 0.78; // flattened front / back
    y = y * (1 - sag * 0.35 * Math.min(t, 1)) + Math.sin(a * 2 + ph[2]) * 0.02 * s * t; // shoulders sag
    x += lean * y * 0.5; // lean
    P.setXYZ(i, x, Math.max(0, y), z);
  }
  if (lie) { // on its side along local x, settling flat against the floor
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
    for (let i = 0; i < P.count; i++) { const y = P.getY(i), x = P.getX(i); P.setXYZ(i, x, y * 0.72 + R0 * 0.62, P.getZ(i)); }
    for (let i = 0; i < P.count; i++) if (P.getY(i) < 0.0) P.setY(i, 0.0);
  }
  g.computeVertexNormals();
  f.part('burlap', g, { col, smooth: true });
  const ny = 0.94 * H0 * (1 - sag * 0.35 * 0.94);
  if (!lie) f.part('linen', new THREE.TorusGeometry(0.17 * R0 + 0.006, 0.008 * s, 4, 10), { pos: [lean * ny * 0.5, ny, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1], col: [0.7, 0.62, 0.48], uv: 'keep' });
  else f.part('linen', new THREE.TorusGeometry(0.17 * R0 + 0.006, 0.008 * s, 4, 10), { pos: [ny, R0 * 0.62, 0], rot: [0, Math.PI / 2, 0], scale: [1, 0.72, 0.78], col: [0.7, 0.62, 0.48], uv: 'keep' });
}
// coat / jacket / apron hanging from a peg (top at local y 0, front +z)
export function garment(f, { col = [0.42, 0.4, 0.46], l = 0.85, w = 0.24 } = {}) {
  const prof = [[0.02, 0], [0.09, -0.02], [0.16, -0.1], [0.2, -0.3], [0.22, -0.6], [0.25, -0.9], [0.25, -1.0], [0.0, -1.0]].map(([x, y]) => new THREE.Vector2(x * w / 0.24, y * l));
  let g = new THREE.LatheGeometry(prof.reverse(), 12);
  f.part('linen', g, { scale: [1, 1, 0.38], col, smooth: true });
  for (const sx of [-1, 1]) f.part('linen', new THREE.CylinderGeometry(0.045, 0.055, l * 0.62, 6), { pos: [sx * w * 0.78, -l * 0.38, 0.02], rot: [0, 0, sx * 0.06], col: [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9], smooth: true });
}
// a knotted kerchief bundle (a maid's few belongings)
export function bundle(f, { col = [0.36, 0.42, 0.56], seed = 4 } = {}) {
  // kerchief tied over the belongings: lumpy body, radial creases gathered into a knot, two tied ears and a hanging corner
  const R = rng(seed), ph = R() * 6, g = new THREE.SphereGeometry(0.5, 28, 18), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), up = Math.max(0, y * 2);
    const k = 1 + 0.06 * Math.sin(a * 3 + ph) + 0.05 * Math.sin(a * 5 + y * 4 + ph) + 0.035 * Math.sin(a * 11) * up * up; // contents + creases
    const pinch = 1 - 0.55 * Math.pow(up, 2.2); // gathered towards the knot
    p.setXYZ(i, x * k * pinch, y < 0 ? y * 0.55 : y, z * k * pinch);
  }
  g.computeVertexNormals();
  f.part('checkB', g, { pos: [0, 0.1, 0], scale: [0.44, 0.24, 0.34], col, smooth: true });
  f.part('checkB', new THREE.SphereGeometry(0.5, 12, 9), { pos: [0, 0.225, 0], scale: [0.085, 0.06, 0.08], col, smooth: true }); // the knot
  for (const sx of [-1, 1]) {
    const e = f.sub(sx * 0.045, 0.24, 0.005, 0, [0.25, 0, -sx * 1.05]);
    e.part('checkB', new THREE.ConeGeometry(0.035, 0.13, 10, 3), { pos: [0, 0.06, 0], scale: [1, 1, 0.45], col, smooth: true });
  }
  const cn = f.sub(0.12, 0.13, 0.16, 0, [0.5, 0.3, 0.2]); // a loose corner flopped over the side
  cn.part('checkB', new THREE.ConeGeometry(0.05, 0.12, 10, 2), { pos: [0, -0.04, 0], rot: [Math.PI, 0, 0], scale: [1, 1, 0.3], col, smooth: true });
}
// storage crock: stoneware (grey / cobalt) or brown-glazed earthenware with a rolled lip and two lug handles
export function crock(f, { r = 0.11, h = 0.26, col = [1, 1, 1], m = null, lid = false, seed = 1 } = {}) {
  m = m || (seed % 2 ? 'stoneware' : 'earthen');
  lathe(f, m, [[0, 0.012], [r * 0.82, 0], [r * 0.92, h * 0.08], [r, h * 0.4], [r * 0.97, h * 0.75], [r * 0.86, h * 0.92], [r * 0.9, h * 0.97], [r * 0.88, h], [r * 0.78, h], [r * 0.76, h * 0.9], [0, h * 0.88]], 18, { col });
  for (const sx of [-1, 1]) f.part(m, new THREE.TorusGeometry(r * 0.16, r * 0.05, 4, 8, Math.PI), { pos: [sx * r * 0.93, h * 0.76, 0], rot: [0, sx > 0 ? 0 : Math.PI, -Math.PI / 2], col, uv: 'keep' });
  if (lid) {
    f.cyl('plank', r * 0.8, r * 0.8, 0.025, 14, [0, h * 0.9, 0], [0, 0, 0], C.oak);
    f.sph('stone', 0.5, [0, h * 0.9 + 0.04, 0], [r * 0.7, r * 0.45, r * 0.6], [0.85, 0.85, 0.84]); // the weighting stone
  }
}
export function pot(f, { r = 0.13, h = 0.14, col = [0.42, 0.42, 0.45] } = {}) {
  lathe(f,'iron',[[0,.005],[r*.85,.005],[r*.95,.018],[r,h*.8],[r,h],[r*.94,h],[r*.89,.015],[0,.015]],24,{col});
  lathe(f,'iron',[[0,h+.025],[r*.4,h+.024],[r*.9,h+.008],[r,h+.006],[r,h-.002]],24,{col:col.map(v=>v*1.18)});
  for(const sx of [-1,1]) {
    f.part('iron',new THREE.TorusGeometry(r*.27,.008,5,14,Math.PI),{pos:[sx*r,h*.72,0],rot:[0,H,sx*H],col:C.iron,uv:'keep'});
    for(const z of [-r*.2,r*.2])f.sph('iron',.005,[sx*r,h*.72,z],1,C.iron);
  }
  f.rod('iron',[-.025,h+.028,0],[-.025,h+.051,0],.006,8,C.black);
  f.rod('iron',[.025,h+.028,0],[.025,h+.051,0],.006,8,C.black);
  f.rod('wood',[-.025,h+.051,0],[.025,h+.051,0],.011,10,C.dark);
}
// preserving jar on the pantry shelf: glass, fruit in syrup, a cloth cover tied with string; or a small stoneware pot
// with a parchment cover
export function jar(f, { r = 0.06, h = 0.16, col = null, seed = 1 } = {}) {
  const fr = [[0.62, 0.12, 0.16], [0.42, 0.16, 0.3], [0.86, 0.66, 0.3], [0.8, 0.42, 0.16], [0.5, 0.36, 0.2]][seed % 5];
  if (seed % 3 !== 2) {
    f.cyl('preserve', r * 0.9, r * 0.9, h * 0.8, 12, [0, h * 0.42, 0], [0, 0, 0], col || fr, { uv: [6, 3] });
    lathe(f, 'glassc', [[r * 0.8, 0], [r, 0.01], [r, h * 0.82], [r * 0.85, h * 0.92], [r * 0.85, h]], 14, { col: [1, 1, 1] });
    lathe(f, 'linen', [[r * 1.05, h - 0.03], [r * 1.02, h - 0.005], [r * 0.9, h + 0.01], [0, h + 0.012]], 14, { col: [0.92, 0.88, 0.8] });
  } else {
    lathe(f, 'stoneware', [[0, 0.01], [r * 0.85, 0], [r, h * 0.3], [r * 0.95, h * 0.9], [r * 1.0, h], [0, h]], 14, { col: [1, 0.98, 0.95] });
    lathe(f, 'print', [[r * 1.1, h - 0.03], [r * 1.08, h - 0.004], [r * 0.95, h + 0.008], [0, h + 0.01]], 12, { col: [1.05, 1.0, 0.9] });
  }
  f.part('rope', new THREE.TorusGeometry(r * 1.03, 0.003, 3, 14), { pos: [0, h - 0.016, 0], rot: [Math.PI / 2, 0, 0], col: [0.9, 0.85, 0.7], uv: 'keep' });
}
export function plate(f, { r = 0.11, col = [1, 1, 1], flat = false, m = 'ceramic' } = {}) { // standing in a plate rack, face +z; flat = on a table
  const p = [[0, 0], [r * 0.55, 0], [r * 0.6, 0.006], [r * 0.62, 0.012], [r, 0.024], [r * 1.02, 0.03], [r * 0.96, 0.03], [r * 0.6, 0.017], [0, 0.016]];
  const g = new THREE.LatheGeometry(LP(p), 20);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const v = uv.getY(i); uv.setXY(i, uv.getX(i) * 2, v < 0.5 ? 0.5 : 0.97 - (v - 0.5) * 0.84); } // the band + garland on the rim
  if (flat) f.part(m, g, { pos: [0, 0.001, 0], col, smooth: true, uv: 'keep' });
  else f.part(m, g, { pos: [0, r, -0.012], rot: [Math.PI / 2 - 0.12, 0, 0], col, smooth: true, uv: 'keep' });
}
export function bowl(f, { r = 0.09, h = 0.06, col = [1, 1, 1], m = 'ceramic' } = {}) {
  lathe(f, m, [[0, 0], [r * 0.5, 0], [r * 0.85, h * 0.5], [r, h], [r * 0.93, h], [r * 0.78, h * 0.5], [r * 0.45, 0.012], [0, 0.012]], 18, { col });
}
// jug / pitcher with a spout and a strap handle (front +z = spout)
export function jug(f, { r = 0.07, h = 0.2, col = [1, 1, 1], m = 'ceramic' } = {}) {
  lathe(f, m, [[0, 0], [r * 0.8, 0], [r, h * 0.2], [r * 1.02, h * 0.45], [r * 0.8, h * 0.72], [r * 0.7, h * 0.88], [r * 0.78, h], [r * 0.7, h], [r * 0.62, h * 0.85], [0, h * 0.8]], 18, { col });
  f.part(m, new THREE.ConeGeometry(r * 0.35, r * 0.6, 8, 1, true), { pos: [0, h * 0.97, r * 0.72], rot: [Math.PI / 2 + 0.5, 0, 0], scale: [1, 1, 0.5], col, uv: 'keep' });
  f.part(m, new THREE.TorusGeometry(h * 0.27, 0.009, 5, 10, Math.PI * 1.1), { pos: [0, h * 0.58, -r * 0.92], rot: [0, Math.PI / 2, Math.PI / 2 - 0.15], scale: [1, 0.75, 1], col, uv: 'keep' });
}
export function mug(f, { r = 0.04, h = 0.09, col = [1, 1, 1], m = 'stoneware' } = {}) {
  lathe(f, m, [[0, 0], [r, 0], [r * 1.04, h * 0.5], [r, h], [r * 0.9, h], [r * 0.9, 0.01], [0, 0.01]], 14, { col });
  f.part(m, new THREE.TorusGeometry(h * 0.3, 0.007, 5, 10, Math.PI), { pos: [r * 1.02, h * 0.5, 0], rot: [0, 0, -Math.PI / 2], scale: [0.8, 1, 1], col, uv: 'keep' });
}
/* ---------------------------------------------------------------- stoves */
// masonry kitchen range (Sparherd): plastered brick block, iron top plate with rings, fire door, oven door, rail
// masonry kitchen range (Sparherd): plastered brick body on a brick plinth, iron top plate with ring lids and a lifter,
// fire door with draught slide, ash drawer, oven door with brass knob, water reservoir with a brass tap at the end,
// brass towel rail on posts
export function kitchenStove(f, { w = 1.3, d = 0.75, h = 0.8 } = {}) {
  const I = [0.32, 0.32, 0.34], Ib = [0.2, 0.2, 0.22];
  f.box('brick', -w / 2, 0, -d / 2, w / 2, 0.12, d / 2, [0.7, 0.66, 0.62]);
  f.box('wash', -w / 2 + 0.02, 0.12, -d / 2, w / 2 - 0.02, h - 0.05, d / 2 - 0.02, [0.82, 0.76, 0.68]);
  f.box('iron', -w / 2 - 0.02, h - 0.05, -d / 2 - 0.02, w / 2 + 0.02, h, d / 2 + 0.02, [0.42, 0.42, 0.44]);
  f.box('iron', -w / 2 - 0.03, h - 0.06, d / 2 + 0.01, w / 2 + 0.03, h - 0.02, d / 2 + 0.03, [0.55, 0.55, 0.58]); // polished edge
  for (const [x, z, r] of [[-0.32, -0.08, 0.14], [0.1, -0.08, 0.12]]) for (let k = 0; k < 3; k++) { const rr = r * (1 - k * 0.3); f.cyl('iron', rr, rr, 0.008, 18, [x, h + 0.003 + k * 0.002, z], [0, 0, 0], k % 2 ? Ib : I); }
  f.box('iron', -0.33, h + 0.01, -0.09, -0.31, h + 0.02, -0.07, C.black);
  const door = (x0, y0, x1, y1, c, knob = true) => {
    f.box('iron', x0 - 0.02, y0 - 0.02, d / 2 - 0.03, x1 + 0.02, y1 + 0.02, d / 2 + 0.0, Ib); // frame
    f.box('iron', x0, y0, d / 2, x1, y1, d / 2 + 0.015, c);
    f.box('iron', x0 + 0.02, y0 + 0.02, d / 2 + 0.015, x1 - 0.02, y1 - 0.02, d / 2 + 0.02, [c[0] * 1.15, c[1] * 1.15, c[2] * 1.15]);
    if (knob) { f.rod('brass', [x1 - 0.05, (y0 + y1) / 2, d / 2 + 0.02], [x1 - 0.05, (y0 + y1) / 2, d / 2 + 0.05], 0.006, 5, C.brass); f.sph('brass', 0.016, [x1 - 0.05, (y0 + y1) / 2, d / 2 + 0.055], 1, C.brass); }
  };
  door(-0.52, 0.42, -0.2, 0.66, [0.3, 0.3, 0.32]); // fire door
  f.box('iron', -0.46, 0.6, d / 2 + 0.02, -0.3, 0.62, d / 2 + 0.025, C.black); // draught slide
  door(-0.52, 0.16, -0.2, 0.32, [0.26, 0.26, 0.28]); // ash drawer
  door(-0.05, 0.18, 0.42, 0.64, [0.36, 0.36, 0.38]); // oven
  f.box('iron', 0.48, 0.18, -d / 2 + 0.05, w / 2 - 0.03, h - 0.06, d / 2 + 0.01, [0.5, 0.5, 0.52]); // water reservoir (Wasserschiff)
  f.rod('brass', [0.55, 0.3, d / 2 + 0.01], [0.55, 0.3, d / 2 + 0.06], 0.012, 6, C.brass); f.rod('brass', [0.55, 0.3, d / 2 + 0.06], [0.55, 0.26, d / 2 + 0.07], 0.01, 6, C.brass);
  f.box('brass', 0.53, 0.33, d / 2 + 0.03, 0.57, 0.345, d / 2 + 0.05, C.brass);
  for (const sx of [-1, 1]) f.rod('brass', [sx * (w / 2 - 0.02), h - 0.06, d / 2 + 0.02], [sx * (w / 2 + 0.03), h - 0.1, d / 2 + 0.08], 0.008, 5, C.brass);
  f.rod('brass', [-w / 2 - 0.03, h - 0.1, d / 2 + 0.08], [w / 2 + 0.03, h - 0.1, d / 2 + 0.08], 0.011, 8, C.brass); // towel rail
  f.part('linen', new THREE.BoxGeometry(0.3, 0.32, 0.012), { pos: [0.2, h - 0.25, d / 2 + 0.085], col: [0.92, 0.9, 0.86] }); f.part('linen', new THREE.BoxGeometry(0.3, 0.012, 0.03), { pos: [0.2, h - 0.092, d / 2 + 0.08], col: [0.92, 0.9, 0.86] }); // towel
  f.solid(-w / 2 - 0.05, -d / 2, w / 2 + 0.05, d / 2 + 0.1);
  return { fire: f.wpos(-0.35, 0.5, d / 2 + 0.05), top: h };
}
// green tiled stove with a wooden bench around it (Kachelofen + Ofenbank)
// green tiled stove with a wooden bench around it (Kachelofen + Ofenbank): stone plinth, tile body with a projecting
// tile cornice, stepped crown, brass door to the warming niche, a drying rail and the bench on turned feet
/* ---------------------------------------------------------------- wall things */
export function crucifix(f, { s = 1 } = {}) { // on the wall, front +z
  f.box('wood', -0.02 * s, -0.25 * s, 0, 0.02 * s, 0.25 * s, 0.03 * s, C.dark);
  f.box('wood', -0.13 * s, 0.08 * s, 0, 0.13 * s, 0.12 * s, 0.03 * s, C.dark);
  f.obox('plain', 0.025 * s, 0.2 * s, 0.02 * s, [0, 0.0, 0.04 * s], [0, 0, 0], [0.88, 0.8, 0.66]);
  f.obox('plain', 0.2 * s, 0.022 * s, 0.02 * s, [0, 0.1 * s, 0.04 * s], [0, 0, 0], [0.88, 0.8, 0.66]);
  f.sph('plain', 0.022 * s, [0, 0.135 * s, 0.045 * s], 1, [0.88, 0.8, 0.66]);
}
export function picture(f, { w = 0.26, h = 0.34 } = {}) {
  f.box('wood', -w / 2 - 0.02, -h / 2 - 0.02, 0, w / 2 + 0.02, h / 2 + 0.02, 0.02, C.dark);
  f.part('holy', new THREE.PlaneGeometry(w, h), { pos: [0, 0, 0.026], col: C.white, uv: 'keep' });
}
export function paperSheet(f, { w = 0.24, h = 0.34, rot = [0, 0, 0], col = C.white } = {}) {
  f.part('print', new THREE.PlaneGeometry(w, h), { pos: [0, 0, 0.009], rot, col, uv: 'keep' });
}
// pendulum wall clock (Regulator), front +z: tall case with the grain running down, crown with finials, glazed door
// showing the dial, the brass pendulum and two weights
export function clock(f) {
  const D = C.dark, O = [0.78, 0.6, 0.44], v = { rotUV: true };
  f.box('wood', -0.16, -0.8, 0, 0.16, 0.3, 0.03, [0.5, 0.4, 0.33], v); // back board
  for (const sx of [-1, 1]) f.box('wood', sx * 0.16 - 0.02, -0.8, 0.0, sx * 0.16 + 0.0, 0.3, 0.12, D, v); // sides
  f.box('wood', -0.19, 0.3, 0, 0.19, 0.35, 0.145, D); f.box('wood', -0.2, 0.35, 0, 0.2, 0.37, 0.155, O); // cornice
  for (const sx of [-1, 1]) f.obox('wood', 0.215, 0.035, 0.14, [sx * 0.095, 0.415, 0.07], [0, 0, -sx * 0.42], D); // pediment
  f.sph('wood', 0.03, [0, 0.49, 0.07], [1, 1.4, 1], O); for (const sx of [-1, 1]) f.sph('wood', 0.022, [sx * 0.19, 0.4, 0.07], [1, 1.5, 1], O); // finials
  f.box('wood', -0.19, -0.86, 0, 0.19, -0.8, 0.145, D); f.box('wood', -0.12, -0.93, 0.01, 0.12, -0.86, 0.12, D, v); // base + drop
  f.sph('wood', 0.03, [0, -0.96, 0.065], [1, 1.3, 1], O);
  // glazed door: stiles + rails (lighter wood), glass in front of dial and pendulum
  for (const sx of [-1, 1]) f.box('wood', sx * 0.16 - 0.025, -0.8, 0.12, sx * 0.16 + 0.005, 0.3, 0.14, O, v);
  for (const [y0, y1] of [[-0.8, -0.76], [-0.17, -0.13], [0.26, 0.3]]) f.box('wood', -0.155, y0, 0.12, 0.155, y1, 0.14, O);
  f.box('wood', -0.13, -0.13, 0.03, 0.13, 0.26, 0.05, [0.6, 0.5, 0.4]); // dial board
  f.part('clock', new THREE.CircleGeometry(0.115, 24), { pos: [0, 0.065, 0.052], col: C.white, uv: 'keep' });
  f.obox('iron', 0.008, 0.075, 0.004, [0.018, 0.093, 0.058], [0, 0, -0.4], C.black); // hands (ten to two)
  f.obox('iron', 0.01, 0.055, 0.004, [-0.02, 0.08, 0.061], [0, 0, 0.75], C.black);
  f.rod('iron', [0, 0.02, 0.07], [0, -0.6, 0.07], 0.004, 4, C.brass); // pendulum
  f.cyl('iron', 0.05, 0.05, 0.012, 16, [0, -0.6, 0.075], [Math.PI / 2, 0, 0], C.brass);
  for (const sx of [-1, 1]) { f.rod('iron', [sx * 0.085, 0.0, 0.05], [sx * 0.085, -0.3, 0.05], 0.002, 3, C.brass); f.cyl('iron', 0.022, 0.022, 0.16, 10, [sx * 0.085, -0.38, 0.05], [0, 0, 0], C.brass); }
  f.part('glassc', new THREE.PlaneGeometry(0.29, 0.39), { pos: [0, 0.065, 0.13], col: [1, 1, 1], uv: 'keep' });
  f.part('glassc', new THREE.PlaneGeometry(0.29, 0.59), { pos: [0, -0.465, 0.13], col: [1, 1, 1], uv: 'keep' });
}
// kerosene table lamp: brass font, glass chimney; returns the flame position
// kerosene table lamp: turned brass foot, glass font showing the paraffin, brass collar + burner with wick knob and
// gallery, glass chimney; returns the flame position
export function tableLamp(f) {
  lathe(f, 'brass', [[0, 0], [0.07, 0], [0.072, 0.008], [0.066, 0.016], [0.042, 0.028], [0.024, 0.048], [0.018, 0.07], [0.026, 0.084], [0.03, 0.09], [0, 0.09]], 20);
  lathe(f, 'glassc', [[0.03, 0.088], [0.058, 0.1], [0.068, 0.125], [0.066, 0.15], [0.05, 0.17], [0.03, 0.182]], 16);
  lathe(f, 'enamel', [[0, 0.092], [0.052, 0.1], [0.06, 0.125], [0.058, 0.14], [0, 0.14]], 12, { col: [0.62, 0.5, 0.3] }); // paraffin inside
  lathe(f, 'brass', [[0.03, 0.178], [0.034, 0.185], [0.03, 0.195], [0.026, 0.2], [0.028, 0.215], [0.033, 0.222], [0.035, 0.238], [0.029, 0.24], [0, 0.24]], 16);
  f.cyl('brass', 0.006, 0.006, 0.03, 6, [0.04, 0.205, 0], [0, 0, Math.PI / 2], C.brass); f.cyl('brass', 0.012, 0.012, 0.005, 10, [0.056, 0.205, 0], [0, 0, Math.PI / 2], C.brass);
  lampGlass(f);
  return f.wpos(0, 0.25, 0);
}
// ceiling lamp over the kitchen table / in the stable: three chains from a hook to a brass ring that holds the font,
// a smoke bell over the chimney, an opal glass shade; local y 0 = the ceiling, the ring hangs `drop` below
export function hangingLamp(f, { drop = 0.45, shade = true } = {}) {
  const yr = -drop, R = 0.085;
  f.cyl('brass', 0.035, 0.04, 0.012, 12, [0, -0.006, 0], [0, 0, 0], C.brass);
  f.part('iron', new THREE.TorusGeometry(0.018, 0.004, 4, 8), { pos: [0, -0.03, 0], col: C.black, uv: 'keep' });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.3; chain(f, [0, -0.045, 0], [Math.cos(a) * R, yr, Math.sin(a) * R]); }
  lathe(f, 'brass', [[0, -0.15], [0.05, -0.15], [0.058, -0.16], [0.03, -0.14], [0.012, -0.125], [0, -0.12]].map(([x, y]) => [x, y * (drop / 0.45)]), 14); // smoke bell
  f.part('brass', new THREE.TorusGeometry(R, 0.007, 5, 20), { pos: [0, yr, 0], rot: [Math.PI / 2, 0, 0], col: C.brass, uv: 'keep' });
  const fo = f.sub(0, yr - 0.11, 0);
  lathe(fo, 'brass', [[0, 0], [0.02, 0.005], [0.06, 0.03], [0.082, 0.07], [0.08, 0.1], [0.05, 0.115], [0.03, 0.12], [0, 0.12]], 18); // font
  lathe(fo, 'brass', [[0.03, 0.118], [0.033, 0.13], [0.028, 0.14], [0.03, 0.155], [0.034, 0.16], [0.036, 0.176], [0.03, 0.178], [0, 0.178]], 14); // burner
  fo.cyl('brass', 0.006, 0.006, 0.03, 6, [0.042, 0.142, 0], [0, 0, Math.PI / 2], C.brass); fo.cyl('brass', 0.012, 0.012, 0.005, 10, [0.058, 0.142, 0], [0, 0, Math.PI / 2], C.brass);
  lathe(fo, 'glassc', [[0.026, 0.175], [0.04, 0.215], [0.035, 0.27], [0.022, 0.35], [0.022, 0.39]], 12, { col: [1, 1, 1] });
  if (shade) { // opal glass shade (white enamel look) on a wire ring
    lathe(fo, 'enamel', [[0.2, 0.17], [0.19, 0.18], [0.14, 0.21], [0.08, 0.235], [0.05, 0.245]], 20, { col: [1, 0.98, 0.94], side: 2 });
    lathe(fo, 'enamel', [[0.05, 0.242], [0.08, 0.232], [0.14, 0.207], [0.19, 0.177], [0.2, 0.167]], 20, { col: [0.75, 0.72, 0.68] }); // its underside
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; fo.rod('iron', [Math.cos(a) * 0.034, 0.16, Math.sin(a) * 0.034], [Math.cos(a) * 0.06, 0.24, Math.sin(a) * 0.06], 0.002, 3, C.black); }
  }
  return fo.wpos(0, 0.19, 0);
}
// a chain of oval links between two local points
export function chain(f, a, b, { link = 0.03, r = 0.0035, col = C.black } = {}) {
  const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), L = d.length(), n = Math.max(2, Math.round(L / link));
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize());
  for (let i = 0; i < n; i++) {
    const p = A.clone().addScaledVector(d, (i + 0.5) / n), q2 = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), (i % 2) * Math.PI / 2));
    const g = new THREE.TorusGeometry(link * 0.32, r, 3, 8); g.scale(0.7, 1.45, 1);
    const m = new THREE.Matrix4().compose(p, q2, new V3(1, 1, 1));
    f.k.part(f.g, f.mn('iron'), g, { m: f.M.clone().multiply(m), col, uv: 'keep' });
  }
}
export function lampGlass(f) { // translucent chimney (separate material)
  lathe(f, 'glassc', [[0.026, 0.235], [0.04, 0.265], [0.036, 0.31], [0.022, 0.38], [0.022, 0.42]], 12, { col: [1, 1, 1] });
}
/* ---------------------------------------------------------------- the young mother's room */
// open-top tub of a superellipse plan (|x/a|^n + |z/b|^n = 1), height h, walls flaring out by `flare`, thickness th;
// uv in metres (u round the wall, v up) for a kept-uv part (scale with uv: [1 / texel, 1 / texel])
export function tubGeo(a, b, h, { n = 4, flare = 1.08, th = 0.015, seg = 32, rows = 4 } = {}) {
  const P = [], U = [], I = [];
  const ring = (k, y, sc) => { const out = []; let len = 0, prev = null;
    for (let i = 0; i <= seg; i++) { const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s2 = Math.sin(t);
      const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * a * sc, z = Math.sign(s2) * Math.pow(Math.abs(s2), 2 / n) * b * sc;
      if (prev) len += Math.hypot(x - prev[0], z - prev[1]); prev = [x, z]; out.push([x, z, len]); }
    return out; };
  const sheet = (rowsDef, inward) => { // rowsDef: [[y, scale, v]...] bottom..top
    const base = P.length / 3;
    for (const [y, sc, v] of rowsDef) for (const [x, z, u] of ring(0, y, sc)) { P.push(x, y, z); U.push(u, v); }
    const W = seg + 1;
    for (let j = 0; j < rowsDef.length - 1; j++) for (let i = 0; i < seg; i++) {
      const A = base + j * W + i, B = A + 1, Cc = A + W, Dd = Cc + 1;
      if (!inward) I.push(A, Cc, B, B, Cc, Dd); else I.push(A, B, Cc, B, Dd, Cc);
    }
  };
  const outer = [], inner = [];
  for (let j = 0; j <= rows; j++) { const t = j / rows, y = t * h, sc = 1 + (flare - 1) * Math.pow(t, 1.5) - 0.06 * Math.pow(1 - t, 3); outer.push([y, sc, y]); inner.push([y + th * (1 - t) , sc - th / Math.min(a, b), y]); }
  sheet(outer, false); sheet(inner, true);
  // rim: outer top -> inner top
  sheet([[h, 1 + (flare - 1), h], [h, flare - th / Math.min(a, b), h + th]], false);
  // bottom (fan), facing down, and the inner floor facing up
  for (const [yy, sc, down] of [[0, 0.94, true], [th, 0.94 - th / Math.min(a, b), false]]) {
    const c0 = P.length / 3; P.push(0, yy, 0); U.push(0, 0);
    const rr = ring(0, yy, sc); for (const [x, z] of rr) { P.push(x, yy, z); U.push(x, z); }
    for (let i = 0; i < seg; i++) { if (down) I.push(c0, c0 + 1 + i, c0 + 2 + i); else I.push(c0, c0 + 2 + i, c0 + 1 + i); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
// a dome shell (outside + inside) cut by local z = 0; d: depth along -z
function hoodGeo(a, hh, d, seg = 16) {
  const o = new THREE.SphereGeometry(1, seg, 8, Math.PI, Math.PI, 0, Math.PI / 2);
  o.scale(a, hh, d);
  const i = o.clone(); i.scale(0.95, 0.95, 0.95);
  const ix = i.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k]; ix[k] = ix[k + 1]; ix[k + 1] = t; }
  const n = i.attributes.normal; for (let k = 0; k < n.count; k++) n.setXYZ(k, -n.getX(k), -n.getY(k), -n.getZ(k));
  return [o, i];
}
// wire-spoked pram wheel in the local yz plane
function wheel(f, x, y, z, r) {
  f.part('iron', new THREE.TorusGeometry(r, 0.011, 5, 18), { pos: [x, y, z], rot: [0, Math.PI / 2, 0], col: C.black, uv: 'keep' });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; f.rod('iron', [x, y + Math.sin(a) * r, z + Math.cos(a) * r], [x, y - Math.sin(a) * r, z - Math.cos(a) * r], 0.003, 3, C.black); }
  f.cyl('iron', 0.022, 0.022, 0.03, 8, [x, y, z], [0, 0, Math.PI / 2], C.black);
}
export function pram(f) { // wicker pram used as a cradle (front +z = handle side, hood over the head end at -z)
  const a = 0.25, b = 0.42, h = 0.3, y0 = 0.42, W = [0.95, 0.8, 0.6];
  const wheelY = (.17 + .011) * Math.cos(Math.PI / 18); // lower edge of the existing faceted tyre
  for (const sz of [-1, 1]) { wheel(f, -0.31, wheelY, sz * 0.3, 0.17); wheel(f, 0.31, wheelY, sz * 0.3, 0.17); f.rod('iron', [-0.31, wheelY, sz * 0.3], [0.31, wheelY, sz * 0.3], 0.008, 4, C.black); }
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) f.part('iron', new THREE.TorusGeometry(0.13, 0.008, 4, 10, Math.PI * 0.8), { pos: [sx * 0.22, 0.29, sz * 0.2], rot: [0, Math.PI / 2, Math.PI * 1.1], col: C.black, uv: 'keep' }); // C-springs
  f.part('wicker', tubGeo(a, b, h, { n: 3.2, flare: 1.1 }), { pos: [0, y0, 0], col: W, smooth: true, uv: [4, 4] });
  f.part('wood', new THREE.TorusGeometry(1, 0.02, 5, 28), { pos: [0, y0 + h + 0.005, 0], rot: [Math.PI / 2, 0, 0], scale: [a * 1.1, b * 1.1, 1], col: [0.62, 0.46, 0.32], uv: 'keep' }); // rolled rim
  const [ho, hi] = hoodGeo(a * 1.1, 0.34, 0.36);
  f.part('wicker', ho, { pos: [0, y0 + h, -b * 1.1 + 0.36], col: [W[0] * 0.92, W[1] * 0.92, W[2] * 0.92], smooth: true });
  f.part('wicker', hi, { pos: [0, y0 + h, -b * 1.1 + 0.36], col: [W[0] * 0.6, W[1] * 0.6, W[2] * 0.6], smooth: true });
  f.part('wood', new THREE.TorusGeometry(1, 0.018, 5, 18, Math.PI), { pos: [0, y0 + h, -b * 1.1 + 0.36], scale: [a * 1.1, 0.34, 1], col: [0.62, 0.46, 0.32], uv: 'keep' }); // hood rim
  // bedding: mattress, pillow under the hood, a blanket turned back
  f.box('linen', -a * 0.92, y0 + 0.02, -b * 0.92, a * 0.92, y0 + h - 0.08, b * 0.92, [0.9, 0.88, 0.82]);
  f.sph('linen', 0.5, [0, y0 + h - 0.06, -b * 0.62], [a * 1.5, 0.09, 0.2], C.linen);
  f.part('checkB', new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, y0 + h - 0.085, 0.08], scale: [a * 1.95, 0.1, b * 1.25], col: [0.95, 0.95, 1], smooth: true });
  f.box('linen', -a * 0.97, y0 + h - 0.08, -0.2, a * 0.97, y0 + h - 0.045, -0.12, [0.95, 0.94, 0.9]); // the turned-back sheet
  // push handle at the foot end
  for (const sx of [-1, 1]) f.rod('iron', [sx * 0.2, y0 + h - 0.05, b * 1.02], [sx * 0.2, y0 + h + 0.24, b + 0.28], 0.01, 4, C.black);
  f.rod('wood', [-0.23, y0 + h + 0.24, b + 0.28], [0.23, y0 + h + 0.24, b + 0.28], 0.018, 6, C.dark);
  f.solid(-0.34, -0.5, 0.34, 0.72);
}
export function childBed(f) { // small bed with spindle sides
  const w = 0.7, l = 1.3;
  f.box('wood', -w / 2, 0.25, -l / 2, w / 2, 0.3, l / 2, C.pine);
  for (const sz of [-1, 1]) f.box('wood', -w / 2, 0, sz * l / 2 - 0.03, w / 2, 0.85, sz * l / 2 + 0.03, C.pine);
  for (const sx of [-1, 1]) { f.box('wood', sx * w / 2 - 0.025, 0.62, -l / 2, sx * w / 2 + 0.025, 0.67, l / 2, C.pine); for (let i = 1; i < 8; i++) f.box('wood', sx * w / 2 - 0.012, 0.3, -l / 2 + i * l / 8 - 0.012, sx * w / 2 + 0.012, 0.62, -l / 2 + i * l / 8 + 0.012, C.pine); }
  f.part('checkR', new THREE.SphereGeometry(0.5, 10, 6), { pos: [0, 0.38, 0.12], scale: [w * 0.94, 0.16, l * 0.7], col: C.white, smooth: true });
  f.sph('linen', 0.5, [0, 0.38, -0.42], [0.5, 0.14, 0.3], C.linen);
  f.solid(-w / 2 - 0.03, -l / 2 - 0.04, w / 2 + 0.03, l / 2 + 0.04);
}
export function ragDoll(f) {
  f.sph('linen', 0.5, [0, 0.1, 0], [0.12, 0.17, 0.08], [0.82, 0.3, 0.26]);
  f.sph('linen', 0.055, [0, 0.235, 0], 1, [0.96, 0.86, 0.74]);
  for (const sx of [-1, 1]) { f.rod('linen', [sx * 0.04, 0.17, 0], [sx * 0.11, 0.06, 0.02], 0.018, 5, [0.82, 0.3, 0.26]); f.rod('linen', [sx * 0.03, 0.03, 0.02], [sx * 0.05, -0.0, 0.14], 0.02, 5, [0.9, 0.84, 0.74]); }
  f.sph('linen', 0.06, [0, 0.27, -0.012], [1, 0.6, 0.9], [0.5, 0.34, 0.2]);
}
export function sled(f) { // small wooden sled
  for (const sx of [-1, 1]) {
    f.box('wood', sx * 0.17 - 0.02, 0.02, -0.38, sx * 0.17 + 0.02, 0.09, 0.32, C.pine);
    f.obox('wood', 0.04, 0.07, 0.16, [sx * 0.17, 0.11, 0.37], [0.9, 0, 0], C.pine);
    f.box('iron', sx * 0.17 - 0.012, 0.0, -0.38, sx * 0.17 + 0.012, 0.02, 0.3, C.black);
  }
  for (const z of [-0.3, -0.12, 0.06, 0.22]) f.box('wood', -0.22, 0.09, z - 0.05, 0.22, 0.11, z + 0.05, C.pine);
  f.rod('linen', [-0.1, 0.18, 0.42], [0.1, 0.18, 0.42], 0.008, 4, [0.6, 0.5, 0.4]);
}
export function sewingBasket(f) {
  f.part('wicker', tubGeo(0.17, 0.17, 0.15, { n: 2, flare: 1.08, seg: 24, rows: 3 }), { col: [0.92, 0.76, 0.56], smooth: true, uv: [4, 4] });
  f.part('wood', new THREE.TorusGeometry(0.184, 0.012, 4, 20), { pos: [0, 0.152, 0], rot: [Math.PI / 2, 0, 0], col: [0.6, 0.45, 0.32], uv: 'keep' });
  f.sph('linen', 0.5, [0.02, 0.13, 0], [0.28, 0.07, 0.26], [0.6, 0.52, 0.66]); // mending
  f.sph('linen', 0.035, [-0.06, 0.17, 0.05], 1, [0.82, 0.3, 0.26]); f.sph('linen', 0.03, [0.07, 0.165, -0.06], 1, [0.9, 0.86, 0.74]); // yarn
  const lidY = .19 * Math.sin(1.3) + .01 * Math.cos(1.3);
  f.part('wicker', new THREE.CylinderGeometry(0.19, 0.19, 0.02, 20), { pos: [0.21, lidY, -0.05], rot: [0, 0, 1.3], col: [0.86, 0.7, 0.52], uv: [4, 4] }); // the lid propped against it
}
// painted dowry chest on a plinth: raised lid, iron corner bands and hinges, lock plate, painted front panels
export function chest(f, { w = 1.0, d = 0.5, h = 0.55 } = {}) {
  const B = [0.62, 0.42, 0.34], D = C.dark;
  f.box('wood', -w / 2 - 0.02, 0, -d / 2 - 0.02, w / 2 + 0.02, 0.07, d / 2 + 0.02, D);
  f.box('wood', -w / 2, 0.07, -d / 2, w / 2, h, d / 2, B);
  f.box('wood', -w / 2 - 0.02, h, -d / 2 - 0.02, w / 2 + 0.02, h + 0.05, d / 2 + 0.02, D);
  f.box('wood', -w / 2, h + 0.05, -d / 2, w / 2, h + 0.08, d / 2, B);
  for (const sx of [-1, 1]) f.part('paint', new THREE.PlaneGeometry(w * 0.36, (h - 0.07) * 0.7), { pos: [sx * w * 0.23, 0.07 + (h - 0.07) / 2, d / 2 + 0.006], col: [1.1, 0.85, 0.85], uv: 'keep' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { f.box('iron', sx * w / 2 - 0.015, 0.08, sz * d / 2 - 0.06, sx * w / 2 + 0.015, h + 0.06, sz * d / 2 + (sz > 0 ? 0.01 : -0.01), C.black); }
  f.box('iron', -0.05, h - 0.12, d / 2, 0.05, h, d / 2 + 0.012, C.black); f.box('brass', -0.008, h - 0.09, d / 2 + 0.012, 0.008, h - 0.05, d / 2 + 0.016, C.brass);
  for (const sx of [-1, 1]) f.box('iron', sx * w * 0.3 - 0.02, h - 0.15, -d / 2 - 0.012, sx * w * 0.3 + 0.02, h + 0.08, -d / 2, C.black);
  for(const sx of [-1,1]) {
    const side=f.sub(sx*(w/2+.018),h*.48,0,sx*H);
    for(const x of [-.075,.075])side.box('iron',x-.016,-.023,0,x+.016,.023,.005,C.iron);
    side.part('iron',new THREE.TorusGeometry(.078,.006,6,18,Math.PI),{pos:[0,-.006,.015],rot:[0,0,Math.PI],scale:[1,.7,1],col:C.iron,uv:'keep'});
    for(const y of [.12,h-.07])for(const z of [-d/2+.025,d/2-.025])f.sph('iron',.005,[sx*(w/2+.018),y,z],1,C.iron);
    for(const y of [.12,h-.05])timber(f,sx*w*.23-w*.18,y,d/2+.006,sx*w*.23+w*.18,y+.018,d/2+.019,C.dark,0);
  }
  f.solid(-w / 2, -d / 2, w / 2, d / 2);
}
export function dresser(f, { w = 0.9, d = 0.5, h = 0.85 } = {}) { // chest of drawers with framed fronts and brass pulls
  const D = C.dark;
  f.box('wood', -w / 2, 0, -d / 2, w / 2, 0.08, d / 2, D);
  f.box('wood', -w / 2, 0.08, -d / 2, w / 2, h, d / 2, C.oak, { rotUV: true });
  f.box('wood', -w / 2 - 0.025, h, -d / 2 - 0.02, w / 2 + 0.025, h + 0.04, d / 2 + 0.025, D);
  for (let i = 0; i < 3; i++) {
    const y = 0.11 + i * ((h-.15)/3), dh=(h-.15)/3-.016;
    timber(f,-w/2+.04,y,d/2,w/2-.04,y+dh,d/2+.015,[.9,.8,.7],0);
    f.box('wood', -w / 2 + 0.07, y + 0.03, d / 2 + 0.015, w / 2 - 0.07, y + 0.185, d / 2 + 0.02, [0.8, 0.7, 0.6]);
    for (const sx of [-1, 1]) { f.box('brass', sx * w * 0.25 - 0.035, y + 0.09, d / 2 + 0.02, sx * w * 0.25 + 0.035, y + 0.125, d / 2 + 0.024, C.brass); f.part('brass', new THREE.TorusGeometry(0.025, 0.004, 4, 10, Math.PI), { pos: [sx * w * 0.25, y + 0.09, d / 2 + 0.03], rot: [0, 0, Math.PI], col: C.brass, uv: 'keep' }); }
    f.box('brass', -0.012, y + 0.14, d / 2 + 0.02, 0.012, y + 0.175, d / 2 + 0.024, C.brass);
    for(const sx of [-1,1])for(const dy of [.035,dh-.035])f.sph('wood',.004,[sx*(w/2-.062),y+dy,d/2+.017],[1,1,.5],C.dark);
  }
  f.solid(-w / 2, -d / 2, w / 2, d / 2);
}
/* ---------------------------------------------------------------- stable and barn */
export function ladder(f, { len = 2.6, w = 0.42, col = C.pine, solid = false } = {}) { // in local y, rungs every 0.28 m
  for (const sx of [-1, 1]) f.box('wood', sx * w / 2 - 0.03, 0, -0.025, sx * w / 2 + 0.03, len, 0.025, col);
  for (let y = 0.25; y < len - 0.05; y += 0.28) f.rod('wood', [-w / 2, y, 0], [w / 2, y, 0], 0.017, 5, col);
}
export function pitchfork(f) { // hay fork: long ash shaft, ferrule, three curved tines
  f.rod('wood', [0, 0, 0], [0, 1.4, 0], 0.017, 6, C.pine);
  f.rod('iron', [0, 1.38, 0], [0, 1.5, 0], 0.02, 6, C.black, { r2: 0.014 });
  f.part('iron', new THREE.TorusGeometry(0.09, 0.007, 4, 10, Math.PI), { pos: [0, 1.5, 0], rot: [0, 0, Math.PI], scale: [1, 0.4, 1], col: C.black, uv: 'keep' });
  for (const x of [-0.09, 0, 0.09]) for (let k = 0; k < 4; k++) { const t0 = k / 4, t1 = (k + 1) / 4, yy = (t) => 1.5 + t * 0.32, zz = (t) => t * t * 0.06; f.rod('iron', [x * (1 + t0 * 0.15), yy(t0), zz(t0)], [x * (1 + t1 * 0.15), yy(t1), zz(t1)], 0.006 * (1 - t0 * 0.5), 4, C.black, { r2: 0.006 * (1 - t1 * 0.5) }); }
}
export function rake(f) { // wooden hay rake: split handle braced into a wide head with 14 pegs (teeth along local +z)
  f.rod('wood', [0, 0, 0], [0, 1.35, 0], 0.017, 6, C.pine);
  for (const sx of [-1, 1]) f.rod('wood', [0, 1.3, 0], [sx * 0.2, 1.62, 0], 0.011, 5, C.pine);
  f.box('wood', -0.32, 1.6, -0.022, 0.32, 1.66, 0.022, C.pine);
  for (let i = 0; i < 14; i++) { const x = -0.29 + i * (0.58 / 13); f.rod('wood', [x, 1.63, 0.015], [x, 1.63, 0.12], 0.006, 4, [1.05, 0.98, 0.85], { r2: 0.004 }); }
}
export function scythe(f) { // snath with two grips, long curved blade at the top
  for (let k = 0; k < 4; k++) { const t0 = k / 4, t1 = (k + 1) / 4; f.rod('wood', [Math.sin(t0 * 1.2) * 0.08, t0 * 1.55, 0], [Math.sin(t1 * 1.2) * 0.08, t1 * 1.55, 0], 0.017, 5, C.pine); }
  for (const y of [0.55, 1.05]) f.rod('wood', [Math.sin((y / 1.55) * 1.2) * 0.08, y, 0], [Math.sin((y / 1.55) * 1.2) * 0.08, y, 0.12], 0.012, 5, C.dark);
  for (let k = 0; k < 8; k++) { const t = k / 7, a = -0.1 - t * 0.35, x = 0.07 + t * 0.62, y = 1.55 - t * t * 0.12; f.obox('iron', 0.09, 0.055 * (1 - t * 0.6), 0.004, [x, y, 0.015], [0, 0, a], [0.58, 0.58, 0.6]); }
  f.box('iron', 0.04, 1.5, -0.01, 0.1, 1.58, 0.02, C.black);
}
export function trough(f, { l = 2.0, w = 0.55, h = 0.45, m = 'plank', col = C.oak } = {}) { // feeding trough along local x
  f.box(m, -l / 2, 0.08, -w / 2 + 0.04, l / 2, 0.13, w / 2 - 0.04, col);
  for (const sz of [-1, 1]) f.part(m, new THREE.BoxGeometry(l, h - 0.05, 0.05), { pos: [0, 0.05 + (h - 0.05) / 2, sz * (w / 2 - 0.05)], rot: [sz * 0.18, 0, 0], col });
  for (const sx of [-1, 1]) { f.box(m, sx * l / 2 - 0.04, 0.05, -w / 2, sx * l / 2 + 0.04, h, w / 2, col); f.box('wood', sx * (l / 2 - 0.2) - 0.05, 0, -w / 2 - 0.03, sx * (l / 2 - 0.2) + 0.05, 0.09, w / 2 + 0.03, C.dark); }
  hayHeap(f.sub(0, 0.12, 0), { rx: l / 2 - 0.08, rz: w / 2 - 0.1, h: 0.12, seed: 41 + Math.round(l * 10), m: 'hay', tufts: Math.round(l * 7) });
  f.solid(-l / 2, -w / 2, l / 2, w / 2);
}
// low bed of trampled straw over a floor rectangle (local x0..x1, z0..z1): wavy mound thinning out at the edges,
// stalk cards strewn on top and sticking out of the rim
export function strawBed(f, x0, z0, x1, z1, { h = 0.07, col = [0.95, 0.86, 0.66], seed = 7, m = 'hay', n = null, spill = 0.3 } = {}) {
  // loose straw: a ragged-edged, lumpy layer (the outline is a noise contour, not the rectangle: vertices outside it sink
  // under the floor), clumps heaped here and there, stalks standing out of it and strewn past its edge
  const r = rng(seed), W = x1 - x0, D = z1 - z0, st = 0.08, sx = Math.max(6, Math.round(W / st)), sz = Math.max(6, Math.round(D / st));
  const g = new THREE.PlaneGeometry(W, D, sx, sz); g.rotateX(-Math.PI / 2);
  const P = g.attributes.position, ph = Array.from({ length: 8 }, () => r() * 6.28);
  const blobs = Array.from({ length: Math.max(3, Math.round(W * D * 2.5)) }, () => [(r() - 0.5) * W, (r() - 0.5) * D, 0.15 + r() * 0.35, 0.5 + r() * 1.1]);
  const edgeAt = (x, z) => { // signed distance to the ragged outline (m), > 0 inside
    const d = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
    return d - spill * 0.25 + Math.sin(x * 3.1 + ph[0]) * Math.sin(z * 2.7 + ph[1]) * 0.12 + Math.sin(x * 7.3 + z * 5.1 + ph[2]) * 0.06 + Math.sin(x * 13 - z * 11 + ph[3]) * 0.03;
  };
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), e = edgeAt(x, z);
    let lump = 0.55 + 0.2 * Math.sin(x * 5 + ph[4]) * Math.sin(z * 4 + ph[5]) + 0.1 * Math.sin(x * 13 + z * 9 + ph[6]);
    for (const [bx, bz, br, bk] of blobs) { const q = ((x - bx) ** 2 + (z - bz) ** 2) / (br * br); if (q < 1) lump += bk * (1 - q) * (1 - q); }
    const k = e <= 0 ? 0 : Math.min(1, e / 0.18) ** 0.7;
    P.setY(i, e <= 0 ? -0.03 : k * h * lump + (r() - 0.5) * 0.01);
  }
  g.computeVertexNormals();
  f.part(m, g, { pos: [(x0 + x1) / 2, 0.003, (z0 + z1) / 2], col, smooth: true });
  // stalks: half strewn round (and a bit past) the outline, lying nearly flat; the rest standing up out of the layer
  const N = n ?? Math.round(W * D * 16), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < N; i++) {
    const lx = (r() - 0.5) * (W + spill * 2), lz = (r() - 0.5) * (D + spill * 2), e = edgeAt(lx, lz);
    if (e < -spill || (e < 0 && r() < -e / spill)) continue;
    const inside = e > 0.1, a = r() * Math.PI * 2, tilt = inside && r() < 0.45 ? 0.3 + r() * 0.6 : 1.15 + r() * 0.35;
    const y = inside ? h * (0.45 + r() * 0.5) : 0.004;
    tuft(f, new V3(cx + lx, y, cz + lz), new V3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)), { w: 0.16 + r() * 0.26, h: 0.1 + r() * 0.14, col, r, lean: 1 });
  }
}
// straw-stalk tufts on a surface: crossed alpha cards rooted at p (local), leaning along the normal nr
export function tuft(f, p, nr, { w = 0.3, h = 0.22, col = C.straw, r = rng(1), lean = 0.6 } = {}) {
  const up = new V3(0, 1, 0).lerp(nr, lean).normalize(), yaw = r() * Math.PI;
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), up).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw));
  for (let k = 0; k < 2; k++) {
    const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2 - 0.03, 0); g.rotateY(k * Math.PI / 2);
    g.applyQuaternion(q); g.translate(p.x, p.y, p.z);
    const t = 0.85 + r() * 0.25;
    f.part('straw', g, { col: [col[0] * t, col[1] * t, col[2] * t * 0.95], uv: 'keep' });
  }
}
// loose straw strewn on a floor rectangle (local x0..x1, z0..z1 at height y): low, almost lying tufts
export function strawLitter(f, x0, z0, x1, z1, { y = 0, n = null, col = C.straw, seed = 5 } = {}) {
  const r = rng(seed), N = n ?? Math.round((x1 - x0) * (z1 - z0) * 9);
  for (let i = 0; i < N; i++) {
    const p = new V3(x0 + r() * (x1 - x0), y, z0 + r() * (z1 - z0)), a = r() * Math.PI * 2, tilt = 0.9 + r() * 0.5;
    tuft(f, p, new V3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)), { w: 0.2 + r() * 0.25, h: 0.12 + r() * 0.12, col, r, lean: 1 });
  }
}
export function hayHeap(f, { rx = 1.5, rz = 1.2, h = 1.2, col = C.straw, seed = 3, m = 'hay', lump = 1, tufts = null } = {}) {
  // lumpy heap: slumped skirt at the floor, uneven shoulders and top (several noise octaves round the rim and up the
  // flanks), welded seam so the smooth normals stay continuous; straw-stalk cards all over break up the silhouette
  let g = new THREE.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, r = rng(seed), ph = Array.from({ length: 12 }, () => r() * Math.PI * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z);
    const n = Math.sin(a * 2 + ph[0]) * 0.07 + Math.sin(a * 5 + ph[1] + y * 3) * 0.06 + Math.sin(a * 9 + ph[2] + y * 6) * 0.035 + Math.sin(a * 15 + ph[3] - y * 9) * 0.018;
    const k = 1 + n * lump * (0.55 + 0.45 * (1 - y)), skirt = 1 + 0.16 * Math.pow(1 - y, 4);
    const yy = Math.pow(y, 0.8) * (1 + (Math.sin(a * 3 + ph[4]) * 0.07 + Math.sin(a * 7 + ph[5]) * 0.04 + Math.sin(a * 2 + ph[6] + y * 4) * 0.05) * rr * lump);
    p.setXYZ(i, x * k * skirt, Math.max(0, yy), z * k * skirt);
  }
  g.computeVertexNormals();
  f.part(m, g, { scale: [rx, h, rz], col, smooth: true });
  if (!m.startsWith('hay')) return;
  const nA = g.attributes.normal, N = tufts ?? Math.round(24 + rx * rz * 30), S = new V3(rx, h, rz);
  for (let i = 0; i < N; i++) {
    const j = Math.floor(r() * p.count), pt = new V3(p.getX(j), p.getY(j), p.getZ(j)).multiply(S);
    const nr = new V3(nA.getX(j) / rx, nA.getY(j) / h, nA.getZ(j) / rz).normalize();
    if (pt.y < 0.02 && r() < 0.5) continue;
    tuft(f, pt.addScaledVector(nr, -0.02), nr, { w: 0.25 + r() * 0.3, h: 0.16 + r() * 0.2, col, r, lean: 0.5 + r() * 0.4 });
  }
}
// Simmental (Fleckvieh) cow, ~1.4 m at the withers, facing local +z. Returns parts of the head for animation.
export function cow(f, { seed = 1, lie = false } = {}) {
  const r = rng(seed), y0 = lie ? -0.55 : 0, W = [0.95, 0.92, 0.88];
  f.part('hide', new THREE.SphereGeometry(0.5, 14, 10), { pos: [0, 1.05 + y0, 0], scale: [0.68, 0.74, 1.62], col: C.white, smooth: true });
  f.part('hide', new THREE.SphereGeometry(0.5, 12, 8), { pos: [0, 1.15 + y0, -0.55], scale: [0.62, 0.62, 0.7], col: C.white, smooth: true }); // hips
  f.part('hide', new THREE.SphereGeometry(0.5, 12, 8), { pos: [0, 1.12 + y0, 0.52], scale: [0.6, 0.72, 0.7], col: C.white, smooth: true }); // shoulders
  f.part('hide', new THREE.SphereGeometry(0.5, 10, 8), { pos: [0, 0.82 + y0, 0.05], scale: [0.58, 0.4, 1.3], col: W, smooth: true }); // belly (white)
  f.rod('hide', [0, 1.2 + y0, 0.72], [0, 1.18 + y0, 1.02], 0.21, 10, C.white, { r2: 0.16, smooth: true }); // neck
  f.sph('hide', 0.5, [0, 0.95 + y0, 0.86], [0.26, 0.36, 0.3], W); // dewlap
  if (!lie) for (const [x, z] of [[-0.19, 0.55], [0.19, 0.55], [-0.2, -0.6], [0.2, -0.6]]) {
    f.rod('hide', [x, 0.95, z], [x * 0.95, 0.42, z + (z < 0 ? -0.04 : 0.02)], 0.075, 8, W, { r2: 0.06, smooth: true });
    f.rod('hide', [x * 0.95, 0.42, z + (z < 0 ? -0.04 : 0.02)], [x * 0.95, 0.06, z], 0.045, 8, W, { r2: 0.04, smooth: true });
    f.cyl('plain', 0.05, 0.045, 0.07, 8, [x * 0.95, 0.035, z], [0, 0, 0], [0.22, 0.18, 0.16]);
  } else for (const [x, z] of [[-0.3, 0.6], [0.32, 0.5], [-0.34, -0.5], [0.3, -0.65]]) f.part('hide', new THREE.CapsuleGeometry(0.07, 0.5, 3, 6), { pos: [x, 0.08, z], rot: [Math.PI / 2, 0, x * 0.4], col: W, smooth: true });
  if (!lie) f.sph('plain', 0.5, [0, 0.64, -0.38], [0.26, 0.2, 0.26], [0.92, 0.7, 0.66]); // udder
  // tail
  f.rod('hide', [0, 1.28 + y0, -0.86], [0.02, 0.5 + y0 * 0.2, -0.95], 0.03, 5, C.white, { r2: 0.02 });
  f.sph('hay', 0.06, [0.02, 0.45 + y0 * 0.2, -0.95], [1, 1.8, 1], [0.95, 0.85, 0.7]);
  // head (white), muzzle pink-grey, horns, ears
  const h = f.sub(0, 1.22 + y0, 1.08, 0, [0.55 + (r() - 0.5) * 0.3, (r() - 0.5) * 0.4, 0]);
  h.part('hide', new THREE.SphereGeometry(0.5, 12, 8), { pos: [0, 0, 0.12], scale: [0.3, 0.32, 0.4], col: W, smooth: true });
  h.part('plain', new THREE.SphereGeometry(0.5, 10, 7), { pos: [0, -0.02, 0.4], scale: [0.24, 0.22, 0.24], col: [0.86, 0.72, 0.68], smooth: true });
  for (const sx of [-1, 1]) {
    h.sph('plain', 0.03, [sx * 0.06, 0.0, 0.5], 1, [0.3, 0.24, 0.24]);
    h.rod('plain', [sx * 0.12, 0.13, 0.04], [sx * 0.24, 0.22, 0.08], 0.03, 6, [0.9, 0.86, 0.74], { r2: 0.008 });
    h.part('hide', new THREE.SphereGeometry(0.5, 8, 5), { pos: [sx * 0.2, 0.05, -0.02], rot: [0, 0, sx * 0.5], scale: [0.2, 0.06, 0.12], col: W, smooth: true });
    h.sph('plain', 0.025, [sx * 0.11, 0.05, 0.22], 1, [0.08, 0.06, 0.05]);
  }
  f.solid(-0.4, -1.0, 0.4, 1.3);
}
export function chicken(f, { col = [0.62, 0.42, 0.26], seed = 1 } = {}) {
  f.sph('plain', 0.5, [0, 0.16, 0], [0.16, 0.15, 0.24], col);
  f.part('plain', new THREE.ConeGeometry(0.06, 0.16, 5), { pos: [0, 0.24, -0.12], rot: [-0.9, 0, 0], col: [col[0] * 0.6, col[1] * 0.6, col[2] * 0.5] });
  f.sph('plain', 0.05, [0, 0.29, 0.11], 1, col);
  f.obox('plain', 0.015, 0.04, 0.05, [0, 0.34, 0.11], [0, 0, 0], [0.78, 0.14, 0.12]);
  f.part('plain', new THREE.ConeGeometry(0.014, 0.04, 4), { pos: [0, 0.285, 0.165], rot: [Math.PI / 2, 0, 0], col: [0.9, 0.7, 0.3] });
  void seed;
}

/* ---------------------------------------------------------------- yard and machines */
// wooden farm cart (Leiterwagen), shaft towards +z
export function cart(f) {
  const wr = 0.42;
  for (const sx of [-1, 1]) for (const [z, rr] of [[-0.85, 0.5], [0.75, wr]]) {
    const wy = (rr + .035) * Math.cos(Math.PI / 18);
    f.part('wood', new THREE.TorusGeometry(rr, 0.035, 5, 18), { pos: [sx * 0.62, wy, z], rot: [0, Math.PI / 2, 0], col: C.dark, uv: 'keep' });
    f.part('iron', new THREE.TorusGeometry(rr + 0.02, 0.012, 4, 18), { pos: [sx * 0.62, wy, z], rot: [0, Math.PI / 2, 0], col: C.black, uv: 'keep' });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; f.rod('wood', [sx * 0.62, wy + Math.cos(a) * rr, z + Math.sin(a) * rr], [sx * 0.62, wy - Math.cos(a) * rr, z - Math.sin(a) * rr], 0.018, 4, C.dark); }
    f.cyl('wood', 0.07, 0.07, 0.16, 8, [sx * 0.62, wy, z], [0, 0, Math.PI / 2], C.dark);
  }
  const frontY = (wr + .035) * Math.cos(Math.PI / 18), rearY = (.5 + .035) * Math.cos(Math.PI / 18);
  f.rod('wood', [-0.7, frontY, 0.75], [0.7, frontY, 0.75], 0.04, 6, C.dark); f.rod('wood', [-0.7, rearY, -0.85], [0.7, rearY, -0.85], 0.04, 6, C.dark);
  f.box('wood', -0.5, 0.62, -1.4, 0.5, 0.68, 1.25, C.oak); // bed
  for (const sx of [-1, 1]) { // ladder sides
    f.beam('wood', [sx * 0.52, 0.7, -1.45], [sx * 0.62, 1.05, -1.45], 0.04, 0.04, C.oak);
    f.beam('wood', [sx * 0.6, 1.05, -1.5], [sx * 0.6, 1.05, 1.3], 0.05, 0.05, C.oak);
    f.beam('wood', [sx * 0.5, 0.7, -1.5], [sx * 0.5, 0.7, 1.3], 0.05, 0.05, C.oak);
    for (let z = -1.35; z < 1.3; z += 0.3) f.rod('wood', [sx * 0.5, 0.7, z], [sx * 0.6, 1.05, z], 0.015, 4, C.oak);
  }
  f.beam('wood', [0, 0.45, 1.0], [0, 0.0342, 2.9], 0.07, 0.07, C.dark); // lower edge rests on the ground
  f.solid(-0.75, -1.55, 0.75, 1.35);
}
// cast-iron hand pump on a stone well ring with a plank lid
export function wellPump(f) {
  f.cyl('stone', 0.66, 0.62, 0.7, 14, [0, 0.35, 0], [0, 0, 0], [0.9, 0.88, 0.86]);
  f.cyl('plank', 0.66, 0.66, 0.06, 14, [0, 0.73, 0], [0, 0, 0], C.grey);
  f.cyl('iron', 0.07, 0.06, 1.0, 10, [0, 1.25, -0.25], [0, 0, 0], [0.34, 0.36, 0.36]);
  f.cyl('iron', 0.09, 0.09, 0.08, 10, [0, 1.78, -0.25], [0, 0, 0], [0.3, 0.32, 0.32]);
  f.part('iron', new THREE.ConeGeometry(0.06, 0.12, 8), { pos: [0, 1.88, -0.25], col: [0.3, 0.32, 0.32] });
  f.rod('iron', [0, 1.45, -0.2], [0, 1.4, 0.12], 0.035, 8, [0.34, 0.36, 0.36], { r2: 0.025 }); // spout
  f.rod('iron', [0, 1.75, -0.32], [0, 1.95, -0.95], 0.02, 6, [0.34, 0.36, 0.36]); // handle
  f.solid(-0.68, -0.68, 0.68, 0.68);
}
export function bucketWood(f, { col = C.oak, water = false, bail = true } = {}) {
  const p = [[0, 0], [0.12, 0], [0.14, 0.26], [0.13, 0.26], [0.115, 0.02], [0, 0.02]];
  f.part('plank', new THREE.LatheGeometry(LP(p), 14), { col, uv: [2, 1], smooth: true });
  for (const y of [0.05, 0.2]) f.cyl('iron', 0.128 + y * 0.07, 0.128 + y * 0.07, 0.025, 14, [0, y, 0], [0, 0, 0], C.black, { open: true });
  if (water) f.cyl('glass', 0.128, 0.128, 0.004, 14, [0, 0.2, 0], [0, 0, 0], [0.5, 0.56, 0.6]);
  if (bail) { // iron bail (handle) lying over to one side, its two lugs
    for (const sx of [-1, 1]) f.box('iron', sx * 0.14 - 0.012, 0.19, -0.012, sx * 0.14 + 0.012, 0.27, 0.012, C.black);
    f.part('iron', new THREE.TorusGeometry(0.142, 0.005, 3, 14, Math.PI), { pos: [0, 0.255, 0], rot: [-1.15, 0, 0], col: C.black, uv: 'keep' });
  }
}
// three-legged milking stool
export function milkStool(f) {
  f.cyl('wood', 0.15, 0.15, 0.04, 14, [0, 0.3, 0], [0, 0, 0], C.oak);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; f.rod('wood', [Math.cos(a) * 0.08, 0.29, Math.sin(a) * 0.08], [Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17], 0.018, 6, C.dark); }
}
// feed bin (Futterkiste) along local x, back at -z: two compartments of oats / chaff, the lid propped open against the wall
export function feedBin(f, { w = 1.5, d = 0.62, h = 0.78 } = {}) {
  const T = 0.035, O = C.oak;
  f.box('plank', -w / 2 + T, 0, -d / 2 + T, w / 2 - T, T, d / 2 - T, O);
  f.box('plank', -w / 2 + T, 0, d / 2 - T, w / 2 - T, h - 0.08, d / 2, O, { rotUV: true }); // front (lower, sloping lid)
  f.box('plank', -w / 2 + T, 0, -d / 2, w / 2 - T, h, -d / 2 + T, O);
  for (const x of [-w / 2, -T / 2, w / 2 - T]) f.box('plank', x, 0, -d / 2 - (x === -T / 2 ? -T : 0.004), x + T, x === -T / 2 ? h - 0.03 : h, d / 2 + (x === -T / 2 ? -T : 0.004), O);
  for (const sx of [-1, 1]) f.box('wood', sx * (w / 2 - 0.022) - 0.03, 0, d / 2 - 0.06, sx * (w / 2 - 0.022) + 0.03, h - 0.06, d / 2 + 0.012, C.dark); // corner posts (stand proud of the boards)
  f.box('grain', -w / 2 + T, 0, -d / 2 + T, -T / 2, h - 0.2, d / 2 - T, [0.95, 0.82, 0.55]); // oats
  f.sph('grain', 0.5, [-w / 4, h - 0.2, 0], [w / 2 - 0.08, 0.1, d - 0.1], [0.95, 0.82, 0.55]);
  f.box('hay', T / 2, 0, -d / 2 + T, w / 2 - T, h - 0.26, d / 2 - T, [0.9, 0.78, 0.55]); // chaff
  const lid = f.sub(0, h, -d / 2 + 0.01, 0, [-0.08, 0, 0]); // hinged at the back, propped open against the wall
  lid.box('plank', -w / 2, 0, -0.03, w / 2, d, 0, [0.85, 0.72, 0.58]);
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) lid.box('wood', x - 0.04, 0.05, -0.05, x + 0.04, d - 0.05, -0.03, C.dark);
  const sc = f.sub(-w / 4 + 0.1, h - 0.13, 0.05, 0.4); // wooden scoop in the oats
  sc.part('wood', new THREE.SphereGeometry(0.08, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { col: O, smooth: true });
  sc.rod('wood', [0, 0.0, 0.06], [0, 0.05, 0.24], 0.015, 5, C.dark);
  f.solid(-w / 2, -d / 2, w / 2, d / 2);
}
// slatted crate with a heap of potatoes / turnips
export function rootCrate(f, { w = 0.9, d = 0.55, h = 0.45, col = [0.62, 0.48, 0.32], seed = 9, turnip = false } = {}) {
  const r = rng(seed), T = 0.025;
  f.box('plank', -w / 2, 0.02, -d / 2, w / 2, 0.05, d / 2, C.oak);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box('wood', sx * w / 2 - (sx > 0 ? 0.045 : 0), 0, sz * d / 2 - (sz > 0 ? 0.045 : 0), sx * w / 2 + (sx < 0 ? 0.045 : 0), h, sz * d / 2 + (sz < 0 ? 0.045 : 0), C.dark);
  for (let i = 0; i < 3; i++) { const y = 0.07 + i * 0.13; for (const sz of [-1, 1]) f.box('plank', -w / 2, y, sz * d / 2 - T / 2, w / 2, y + 0.08, sz * d / 2 + T / 2, C.oak); for (const sx of [-1, 1]) f.box('plank', sx * w / 2 - T / 2, y, -d / 2, sx * w / 2 + T / 2, y + 0.08, d / 2, C.oak); }
  for (let i = 0; i < 46; i++) {
    const u = r() * 2 - 1, v = r() * 2 - 1, top = h * 0.82 + (1 - Math.max(Math.abs(u), Math.abs(v))) * 0.12, s = turnip ? 0.06 : 0.045 + r() * 0.02;
    f.sph('plain', s, [u * (w / 2 - 0.07), top - r() * 0.1, v * (d / 2 - 0.07)], [1, 0.8, 1.25], turnip ? [0.86, 0.72, 0.7] : [0.6 + r() * 0.08, 0.46, 0.3], { ws: 7, hs: 5, rot: [r(), r() * 3, 0] });
  }
  f.box('plain', -w / 2 + 0.04, 0.05, -d / 2 + 0.04, w / 2 - 0.04, h * 0.72, d / 2 - 0.04, [0.45, 0.34, 0.22]); // the rest of the heap (seen through the slats)
  f.solid(-w / 2, -d / 2, w / 2, d / 2);
}
// stationary engine (Stationärmotor) with a big flywheel and a belt pulley
// spoked wheel in the local yz plane (axis local x): rim, hub, n spokes; m material for the wood / iron parts
export function spokeWheel(f, x, y, z, r, { n = 8, rim = 0.04, w = 0.06, m = 'iron', col = [0.3, 0.3, 0.32], tyre = null, spoke = 0.018 } = {}) {
  f.cyl(m, r, r, w, 28, [x, y, z], [0, 0, Math.PI / 2], col, { open: true });
  f.cyl(m, r - rim, r - rim, w, 28, [x, y, z], [0, 0, Math.PI / 2], [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], { open: true });
  for (const sx of [-1, 1]) f.part(m, new THREE.RingGeometry(r - rim, r, 28), { pos: [x + sx * w / 2, y, z], rot: [0, sx * Math.PI / 2, 0], col, uv: 'keep' });
  if (tyre) f.cyl('iron', r + 0.012, r + 0.012, w * 1.02, 28, [x, y, z], [0, 0, Math.PI / 2], tyre, { open: true });
  f.cyl(m, r * 0.16, r * 0.16, w * 1.8, 12, [x, y, z], [0, 0, Math.PI / 2], col);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; f.rod(m, [x, y + Math.sin(a) * r * 0.14, z + Math.cos(a) * r * 0.14], [x, y + Math.sin(a) * (r - rim * 0.8), z + Math.cos(a) * (r - rim * 0.8)], spoke, 5, col, { r2: spoke * 0.7 }); }
}
// stationary engine (Stationärmotor, Deutz type): cast frame on a stone bed, horizontal cylinder with the water hopper,
// exposed crank, two big spoked flywheels, belt pulley, governor, exhaust and fuel tank. Cylinder along local -x
export const ENGINE_EXHAUST_END = [-1.0, 1.55, -0.7]; // local outlet used by the hut's connected flue
export function engine(f) {
  const G = [0.42, 0.5, 0.44], D = [0.22, 0.24, 0.24];
  f.box('stone', -1.05, 0, -0.42, 0.75, 0.3, 0.42, [0.8, 0.78, 0.76]); // stone bed
  f.box('machine', -1.0, 0.3, -0.24, 0.25, 0.62, 0.24, G); // crankcase / frame
  f.box('machine', -1.02, 0.6, -0.26, 0.27, 0.64, 0.26, [0.36, 0.42, 0.38]);
  f.cyl('machine', 0.2, 0.2, 0.62, 18, [-0.75, 0.85, 0], [0, 0, Math.PI / 2], G); // cylinder
  for (let i = 0; i < 5; i++) f.cyl('machine', 0.225, 0.225, 0.025, 18, [-0.95 + i * 0.1, 0.85, 0], [0, 0, Math.PI / 2], [0.36, 0.42, 0.38]); // ribs
  f.cyl('machine', 0.17, 0.17, 0.05, 16, [-1.08, 0.85, 0], [0, 0, Math.PI / 2], D); // head
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; f.cyl('iron', 0.012, 0.012, 0.03, 6, [-1.11, 0.85 + Math.sin(a) * 0.13, Math.cos(a) * 0.13], [0, 0, Math.PI / 2], C.black); }
  lathe(f, 'machine', [[0.16, 0], [0.18, 0.02], [0.2, 0.2], [0.21, 0.22], [0.19, 0.22], [0.17, 0.05], [0, 0.04]], 16, { pos: [-0.75, 1.02, 0], col: G }); // water hopper
  f.cyl('glass', 0.17, 0.17, 0.005, 16, [-0.75, 1.2, 0], [0, 0, 0], [0.35, 0.4, 0.42]);
  f.cyl('iron', 0.045, 0.045, 0.9, 10, [0.0, 0.85, 0], [Math.PI / 2, 0, 0], [0.55, 0.55, 0.58]); // crankshaft
  f.box('iron', -0.06, 0.62, -0.06, 0.06, 0.95, 0.06, [0.5, 0.5, 0.52]); // crank web
  f.beam('iron', [-0.45, 0.85, 0], [0.0, 0.8, 0], 0.05, 0.08, [0.5, 0.5, 0.52]); // connecting rod
  for (const sz of [-1, 1]) {
    f.box('machine', -0.12, 0.3, sz * 0.24 - 0.04, 0.12, 0.85, sz * 0.24 + 0.04, G); // bearing pedestals
    f.cyl('brass', 0.06, 0.06, 0.08, 10, [0, 0.85, sz * 0.24], [Math.PI / 2, 0, 0], C.brass);
    spokeWheel(f.sub(0, 0, sz * 0.4, Math.PI / 2), 0, 0.85, 0, 0.62, { n: 6, rim: 0.07, w: 0.1, m: 'machine', col: D, spoke: 0.035 });
  }
  spokeWheel(f.sub(0, 0, 0.56, Math.PI / 2), 0, 0.85, 0, 0.2, { n: 5, rim: 0.03, w: 0.16, m: 'wood', col: C.dark, spoke: 0.02 }); // belt pulley
  f.rod('iron', [-0.3, 0.64, 0.2], [-0.3, 1.0, 0.2], 0.012, 5, [0.5, 0.5, 0.52]); // governor
  for (const sx of [-1, 1]) { f.rod('iron', [-0.3, 0.98, 0.2], [-0.3 + sx * 0.08, 0.9, 0.2], 0.006, 4, [0.5, 0.5, 0.52]); f.sph('brass', 0.025, [-0.3 + sx * 0.08, 0.9, 0.2], 1, C.brass); }
  f.rod('iron', [-1.0, 1.0, -0.12], [-1.0, 1.45, -0.12], 0.035, 8, [0.2, 0.18, 0.17]); f.rod('iron', [-1.0, 1.45, -0.12], ENGINE_EXHAUST_END, 0.035, 8, [0.2, 0.18, 0.17]); // exhaust turns towards the rear flue
  f.cyl('brass', 0.1, 0.1, 0.32, 14, [-0.35, 1.25, -0.28], [0, 0, 0], C.brass); f.cyl('brass', 0.03, 0.03, 0.05, 8, [-0.35, 1.43, -0.28], [0, 0, 0], C.brass); // fuel tank
  f.rod('iron', [-0.35, 1.09, -0.28], [-0.6, 0.85, -0.2], 0.005, 4, [0.6, 0.4, 0.2]);
  f.cyl('glass', 0.02, 0.02, 0.07, 8, [-0.55, 0.95, 0.24], [0, 0, 0], [0.8, 0.65, 0.3]); // oiler
  f.box('brass', -0.75, 0.42, 0.241, -0.45, 0.52, 0.25, C.brass); // makers plate
  f.solid(-1.12, -0.72, 0.78, 0.72);
}
// threshing machine (Dreschmaschine) with belt pulleys along local x
// threshing machine (Dreschkasten, belt-driven from the engine): a big red-painted timber-framed box on four iron-shod
// wheels, the drum hump and feed table on top, the straw shaker sticking out at the back, grain spouts with sack
// hooks, pulleys and leather belts down the drive side (local +z). Length along local x
export function thresher(f) {
  const R = [0.78, 0.34, 0.24], DK = [0.42, 0.3, 0.24], GR = [0.38, 0.44, 0.38], L = 1.3, Wd = 0.55, y0 = 0.5, y1 = 1.6;
  // undercarriage: wheels, axles, frame
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) spokeWheel(f.sub(sx * 0.85, 0, sz * 0.66, Math.PI / 2), 0, 0.412, 0, 0.4, { n: 10, rim: 0.05, w: 0.08, m: 'wood', col: C.dark, tyre: C.black, spoke: 0.02 });
    f.cyl('iron', 0.04, 0.04, 1.5, 8, [sx * 0.85, 0.412, 0], [Math.PI / 2, 0, 0], C.black);
    f.box('wood', sx * 0.85 - 0.08, 0.412, -Wd, sx * 0.85 + 0.08, y0, Wd, C.dark); // bolsters
  }
  for (const sz of [-1, 1]) f.box('wood', -L - 0.05, y0 - 0.1, sz * Wd - 0.06, L + 0.05, y0 + 0.02, sz * Wd + 0.06, C.dark); // sills
  // body: corner + mid posts, painted panels between, iron corner straps
  for (const x of [-L, -0.45, 0.45, L]) for (const sz of [-1, 1]) f.box('wood', x - 0.05, y0, sz * Wd - 0.05, x + 0.05, y1, sz * Wd + 0.05, DK, { rotUV: true });
  for (const sz of [-1, 1]) for (const [a, b] of [[-L, -0.45], [-0.45, 0.45], [0.45, L]]) {
    f.box('machine', a + 0.05, y0 + 0.02, sz * (Wd - 0.03) - 0.015, b - 0.05, y1 - 0.02, sz * (Wd - 0.03) + 0.015, R, { rotUV: true });
    f.box('wood', a + 0.05, (y0 + y1) / 2 - 0.03, sz * Wd - 0.045, b - 0.05, (y0 + y1) / 2 + 0.03, sz * Wd + 0.045, DK); // rail
  }
  for (const sx of [-1, 1]) f.box('machine', sx * L - 0.015, y0 + 0.02, -Wd + 0.05, sx * L + 0.015, y1 - 0.02, Wd - 0.05, R, { rotUV: true });
  // the maker's yellow pinstripes framing every painted panel (the look of a Lanz / Claas threshing box)
  const YL = [0.95, 0.8, 0.36], pin = (a, b, c0, c1, side) => {
    const e = 0.05, t = 0.009;
    if (side === 'z') for (const sz of [-1, 1]) { const z = sz * (Wd - 0.013);
      f.box('machine', a + e, c0 + e, z - 0.002, b - e, c0 + e + t, z + 0.002, YL); f.box('machine', a + e, c1 - e - t, z - 0.002, b - e, c1 - e, z + 0.002, YL);
      f.box('machine', a + e, c0 + e, z - 0.002, a + e + t, c1 - e, z + 0.002, YL); f.box('machine', b - e - t, c0 + e, z - 0.002, b - e, c1 - e, z + 0.002, YL); }
    else for (const sx of [-1, 1]) { const x = sx * (L + 0.017);
      f.box('machine', x - 0.002, c0 + e, a + e, x + 0.002, c0 + e + t, b - e, YL); f.box('machine', x - 0.002, c1 - e - t, a + e, x + 0.002, c1 - e, b - e, YL);
      f.box('machine', x - 0.002, c0 + e, a + e, x + 0.002, c1 - e, a + e + t, YL); f.box('machine', x - 0.002, c0 + e, b - e - t, x + 0.002, c1 - e, b - e, YL); }
  };
  const ym = (y0 + y1) / 2;
  for (const [a, b] of [[-L, -0.45], [-0.45, 0.45], [0.45, L]]) { pin(a + 0.05, b - 0.05, y0, ym - 0.03, 'z'); pin(a + 0.05, b - 0.05, ym + 0.03, y1, 'z'); }
  pin(-Wd + 0.05, Wd - 0.05, y0, y1, 'x');
  for (const x of [-L, L]) for (const sz of [-1, 1]) for (const y of [y0 + 0.08, y1 - 0.08]) f.box('iron', x - 0.07, y - 0.025, sz * Wd - 0.06, x + 0.07, y + 0.025, sz * Wd + 0.06, C.black);
  f.box('wood', -L - 0.06, y1, -Wd - 0.06, L + 0.06, y1 + 0.06, Wd + 0.06, DK); // top boards
  // drum hump with the feed table and its hinged guard boards
  f.cyl('machine', 0.36, 0.36, 0.9, 20, [-0.1, y1 + 0.02, 0], [Math.PI / 2, 0, 0], GR, { open: false });
  f.box('wood', -0.6, y1 + 0.06, -0.38, 0.3, y1 + 0.2, 0.38, DK);
  f.part('plank', new THREE.BoxGeometry(0.75, 0.03, 0.7), { pos: [-0.75, y1 + 0.32, 0], rot: [0, 0, -0.32], col: [0.8, 0.7, 0.56] }); // feed table
  for (const sz of [-1, 1]) f.box('plank', -1.1, y1 + 0.06, sz * 0.36 - 0.015, -0.4, y1 + 0.45, sz * 0.36 + 0.015, [0.75, 0.65, 0.52]);
  // straw shaker slats sticking out of the back end
  for (let i = 0; i < 5; i++) f.part('plank', new THREE.BoxGeometry(0.7, 0.04, 0.16), { pos: [L + 0.25, y1 - 0.25 - i * 0.012, -0.4 + i * 0.2], rot: [0, 0, -0.25 + (i % 2) * 0.08], col: [0.8, 0.7, 0.56] });
  f.box('machine', L, y1 - 0.5, -Wd + 0.04, L + 0.12, y1 - 0.2, Wd - 0.04, R);
  // grain spouts with sack hooks on the drive side
  for (const x of [0.05, 0.6]) {
    f.part('machine', new THREE.BoxGeometry(0.16, 0.3, 0.16), { pos: [x, y0 + 0.2, Wd + 0.1], rot: [0.5, 0, 0], col: GR });
    for (const sx of [-1, 1]) f.rod('iron', [x + sx * 0.1, y0 + 0.1, Wd + 0.2], [x + sx * 0.1, y0 + 0.02, Wd + 0.26], 0.006, 4, C.black);
  }
  // drive side: drum pulley, flywheel, shaker crank pulley, belts
  spokeWheel(f.sub(-0.1, 0, Wd + 0.12, Math.PI / 2), 0, y1 + 0.02, 0, 0.17, { n: 5, rim: 0.03, w: 0.14, m: 'machine', col: GR, spoke: 0.02 });
  spokeWheel(f.sub(0.95, 0, Wd + 0.12, Math.PI / 2), 0, 1.05, 0, 0.36, { n: 6, rim: 0.04, w: 0.08, m: 'machine', col: [0.3, 0.32, 0.3], spoke: 0.022 });
  spokeWheel(f.sub(-0.95, 0, Wd + 0.12, Math.PI / 2), 0, 0.95, 0, 0.2, { n: 5, rim: 0.03, w: 0.07, m: 'machine', col: [0.3, 0.32, 0.3], spoke: 0.018 });
  f.cyl('iron', 0.03, 0.03, 0.3, 8, [-0.1, y1 + 0.02, Wd], [Math.PI / 2, 0, 0], C.black); f.cyl('iron', 0.03, 0.03, 0.3, 8, [0.95, 1.05, Wd], [Math.PI / 2, 0, 0], C.black);
  const belt = (a, ra, b, rb, z) => { // open belt: the two straight runs tangent to both pulleys
    const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), L2 = d.length(), ang = Math.atan2(d.y, d.x), off = Math.asin((ra - rb) / L2);
    for (const sg of [1, -1]) {
      const n = ang + sg * (Math.PI / 2 - off);
      const p1 = A.clone().add(new V3(Math.cos(n) * ra, Math.sin(n) * ra, 0)), p2 = B.clone().add(new V3(Math.cos(n) * rb, Math.sin(n) * rb, 0));
      f.beam('leather', [p1.x, p1.y, z], [p2.x, p2.y, z], 0.006, 0.1, C.white);
    }
  };
  belt([-0.1, y1 + 0.02, 0], 0.17, [0.95, 1.05, 0], 0.36, Wd + 0.12);
  belt([0.95, 1.05, 0], 0.08, [-0.95, 0.95, 0], 0.2, Wd + 0.2);
  f.cyl('machine', 0.08, 0.08, 0.06, 12, [0.95, 1.05, Wd + 0.2], [Math.PI / 2, 0, 0], GR);
  f.box('brass', -0.35, 1.2, Wd + 0.035, 0.05, 1.32, Wd + 0.045, C.brass); // makers plate
  f.beam('wood', [-L - 0.05, 0.45, 0], [-L - 1.0, 0.05, 0], 0.07, 0.07, C.dark); // draw bar on the floor
  f.solid(-L - 0.1, -0.75, L + 0.6, 0.85);
}
// hand-cranked fodder cutter (Häckselmaschine): trough on legs, big flywheel with blades
// hand-cranked chaff cutter (Häckselmaschine): long wooden feed trough on splayed legs, cast-iron mouthpiece with the
// feed rollers and gears, a heavy spoked knife wheel carrying two curved blades, crank handle; chaff heaped below
export function fodderCutter(f) {
  const O = C.oak, G = [0.34, 0.38, 0.34];
  for (const [x, z, sx, sz] of [[-0.75, -0.2, -1, -1], [-0.75, 0.2, -1, 1], [0.3, -0.24, 1, -1], [0.3, 0.24, 1, 1]]) f.beam('wood', [x, 0.88, z], [x + sx * 0.08, 0, z + sz * 0.1], 0.06, 0.06, O);
  for (const z of [-0.22, 0.22]) f.box('wood', -0.8, 0.25, z - 0.025, 0.35, 0.31, z + 0.025, C.dark); // stretchers
  f.box('wood', -0.85, 0.86, -0.15, 0.3, 0.9, 0.15, O); // trough floor
  for (const sz of [-1, 1]) f.part('plank', new THREE.BoxGeometry(1.15, 0.2, 0.025), { pos: [-0.27, 0.99, sz * 0.16], rot: [sz * -0.25, 0, 0], col: [0.85, 0.72, 0.56] });
  f.box('hay', -0.82, 0.9, -0.12, 0.25, 0.97, 0.12, [0.95, 0.85, 0.62]);
  for (let i = 0; i < 6; i++) tuft(f, new V3(-0.75 + i * 0.17, 0.95, 0), new V3(0.6, 0.8, 0).normalize(), { w: 0.22, h: 0.12, r: rng(90 + i), lean: 0.5 });
  // mouthpiece (cast iron box) with the two feed rollers and the gear on the side
  f.box('machine', 0.3, 0.8, -0.2, 0.46, 1.12, 0.2, G);
  for (const y of [0.9, 1.04]) f.cyl('iron', 0.045, 0.045, 0.36, 10, [0.32, y, 0], [Math.PI / 2, 0, 0], [0.4, 0.4, 0.42]);
  f.cyl('machine', 0.13, 0.13, 0.03, 16, [0.38, 0.97, -0.22], [Math.PI / 2, 0, 0], G);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; f.box('machine', 0.38 + Math.cos(a) * 0.14 - 0.012, 0.97 + Math.sin(a) * 0.14 - 0.012, -0.235, 0.38 + Math.cos(a) * 0.14 + 0.012, 0.97 + Math.sin(a) * 0.14 + 0.012, -0.205, G); }
  // the knife wheel on its shaft, two curved blades bolted to the spokes, crank on the hub
  f.cyl('iron', 0.025, 0.025, 0.42, 8, [0.62, 0.97, 0], [0, 0, Math.PI / 2], C.black);
  f.box('machine', 0.74, 0.0, -0.05, 0.82, 1.0, 0.05, G); f.box('machine', 0.7, 0.0, -0.12, 0.86, 0.04, 0.12, G); // bearing stand
  const kw = f.sub(0.54, 0.97, 0.04, 0, [0, Math.PI / 2, 0.3]);
  kw.part('machine', new THREE.TorusGeometry(0.46, 0.035, 6, 30), { col: [0.26, 0.27, 0.27], uv: 'keep' });
  kw.cyl('machine', 0.07, 0.07, 0.08, 12, [0, 0, 0], [Math.PI / 2, 0, 0], [0.26, 0.27, 0.27]);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; kw.rod('machine', [0, 0, 0], [Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0], 0.022, 5, [0.26, 0.27, 0.27]); }
  for (let i = 0; i < 2; i++) { // curved blades: a chain of short tilted plates along an arc
    const a0 = i * Math.PI + 0.5;
    for (let k = 0; k < 7; k++) { const t = k / 6, a = a0 + t * 0.7, rr = 0.1 + t * 0.34; kw.obox('iron', 0.07, 0.012, 0.004, [Math.cos(a) * rr, Math.sin(a) * rr, 0.02], [0, 0, a + 1.2], [0.72, 0.72, 0.74]); }
  }
  kw.rod('iron', [0.3, 0.1, 0.04], [0.3, 0.1, 0.16], 0.02, 5, C.black); kw.rod('wood', [0.3, 0.1, 0.16], [0.3, 0.1, 0.3], 0.025, 6, C.dark); // crank handle
  hayHeap(f.sub(0.52, 0, 0.0), { rx: 0.28, rz: 0.4, h: 0.16, seed: 93, m: 'hay_i', tufts: 10 });
  f.solid(-0.9, -0.32, 0.9, 0.4);
}
// joiner's bench (Hobelbank): thick top with a tool tray, front vice with a wooden screw and tommy bar, tail vice,
// bench dogs, a shelf below with a plane, mallet, chisels and shavings on top
export function workbench(f, { l = 1.8 } = {}) {
  const O = C.oak, D = C.dark;
  f.box('wood', -l / 2, 0.82, -0.05, l / 2, 0.9, 0.3, O); f.box('wood', -l / 2, 0.85, -0.3, l / 2, 0.87, -0.05, O); // top + tray
  f.box('wood', -l / 2, 0.85, -0.32, l / 2, 0.92, -0.3, D);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) f.box('wood', sx * (l / 2 - 0.12) - 0.045, 0, sz * 0.22 - 0.045, sx * (l / 2 - 0.12) + 0.045, 0.82, sz * 0.22 + 0.045, D, { rotUV: true });
    f.box('wood', sx * (l / 2 - 0.12) - 0.06, 0, -0.3, sx * (l / 2 - 0.12) + 0.06, 0.08, 0.3, D); // feet
  }
  f.box('wood', -l / 2 + 0.1, 0.2, -0.26, l / 2 - 0.1, 0.24, 0.26, D); f.box('plank', -l / 2 + 0.1, 0.24, -0.24, l / 2 - 0.1, 0.26, 0.24, [0.7, 0.6, 0.5]); // shelf
  // front vice at the left end: chop, wooden screw, bar
  f.box('wood', -l / 2 + 0.05, 0.6, 0.3, -l / 2 + 0.4, 0.9, 0.36, O);
  f.cyl('wood', 0.03, 0.03, 0.3, 10, [-l / 2 + 0.22, 0.78, 0.45], [Math.PI / 2, 0, 0], D);
  f.cyl('wood', 0.045, 0.045, 0.06, 10, [-l / 2 + 0.22, 0.78, 0.38], [Math.PI / 2, 0, 0], D);
  f.rod('wood', [-l / 2 + 0.06, 0.78, 0.5], [-l / 2 + 0.38, 0.78, 0.5], 0.012, 5, O);
  f.box('wood', l / 2 - 0.25, 0.8, 0.3, l / 2 + 0.02, 0.895, 0.36, O); // tail vice (in front of the top, not sharing its faces)
  for (let i = 0; i < 4; i++) f.box('wood', -0.3 + i * 0.25, 0.9, 0.22, -0.28 + i * 0.25, 0.93, 0.24, D); // bench dogs
  // things on the bench
  const pl = f.sub(0.1, 0.9, 0.1, 0.2); pl.box('wood', -0.13, 0, -0.03, 0.13, 0.06, 0.03, O); pl.part('wood', new THREE.TorusGeometry(0.03, 0.01, 4, 8, Math.PI), { pos: [-0.05, 0.06, 0], col: D, uv: 'keep' }); pl.obox('iron', 0.012, 0.05, 0.04, [0.02, 0.07, 0], [0, 0, 0.6], C.black);
  const ml = f.sub(-0.35, 0.9, 0.15, -0.5); ml.box('wood', -0.07, 0, -0.04, 0.07, 0.07, 0.04, O); ml.rod('wood', [0, 0.035, 0.04], [0, 0.035, 0.3], 0.013, 5, D);
  for (let i = 0; i < 3; i++) { const c = f.sub(0.45 + i * 0.05, 0.87, -0.18, 0.1); c.rod('wood', [0, 0.01, -0.08], [0, 0.01, 0.02], 0.011, 5, D); c.box('iron', -0.006, 0.0, 0.02, 0.006, 0.006, 0.12, [0.6, 0.6, 0.62]); }
  for (let i = 0; i < 9; i++) {
    const r = rng(300 + i), curl = new THREE.TorusGeometry(.025 + r() * .015, .006, 3, 8, Math.PI * 1.5);
    curl.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r() * 3, r() * 3, 0)));
    curl.computeBoundingBox();
    f.part('wood', curl, { pos: [.47 + i * .038, .9 - curl.boundingBox.min.y, .115 + (i % 2) * .05], col: [1.1, 1, .85], uv: 'keep' });
  } // shavings rest on the free right side, clear of the planes and oil can
  f.solid(-l / 2, -0.32, l / 2, 0.5);
}
// tool board with hanging tools (local wall plane z = 0)
// tool board on the wall (local wall plane z = 0, tools hang on nails / pegs right against the board)
export function toolWall(f, { l = 1.6, r = rng(5) } = {}) {
  f.box('wood', -l / 2, 1.0, 0, l / 2, 1.75, 0.02, [0.7, 0.6, 0.5], { rotUV: true }); // backing boards
  for (const y of [1.02, 1.72]) f.box('wood', -l / 2, y - 0.03, 0.02, l / 2, y + 0.03, 0.045, C.dark);
  const nail = (x, y) => f.rod('iron', [x, y, 0.02], [x, y + 0.01, 0.07], 0.004, 3, C.black);
  const kinds = ['bowsaw', 'hammer', 'rope', 'pincers', 'handsaw', 'axe', 'auger', 'sickle'];
  let x = -l / 2 + 0.18, i = Math.floor(r() * kinds.length);
  while (x < l / 2 - 0.15) {
    const k = kinds[i++ % kinds.length], z = 0.03;
    if (k === 'bowsaw') { // wooden frame, blade below, twisted cord above
      nail(x, 1.62);
      for (const sx of [-1, 1]) f.box('wood', x + sx * 0.16 - 0.012, 1.18, z, x + sx * 0.16 + 0.012, 1.6, z + 0.02, C.pine);
      f.box('wood', x - 0.16, 1.38, z, x + 0.16, 1.41, z + 0.02, C.pine); f.box('iron', x - 0.17, 1.2, z + 0.005, x + 0.17, 1.225, z + 0.012, [0.62, 0.62, 0.64]);
      f.rod('rope', [x - 0.15, 1.58, z + 0.01], [x + 0.15, 1.58, z + 0.01], 0.004, 3, [0.9, 0.8, 0.6]); x += 0.42;
    } else if (k === 'hammer') { nail(x, 1.5); f.box('wood', x - 0.012, 1.18, z, x + 0.012, 1.48, z + 0.025, C.pine); f.box('iron', x - 0.06, 1.47, z - 0.0, x + 0.05, 1.51, z + 0.03, C.black); x += 0.16; }
    else if (k === 'rope') { // coil of rope on a peg
      f.rod('wood', [x, 1.55, 0.02], [x, 1.57, 0.11], 0.012, 5, C.dark);
      for (let q = 0; q < 4; q++) f.part('rope', new THREE.TorusGeometry(0.12 + q * 0.006, 0.014, 5, 16), { pos: [x + (q - 1.5) * 0.008, 1.44, 0.05 + q * 0.012], rot: [0.12, 0, q * 0.4], scale: [0.8, 1, 1], col: [0.95, 0.88, 0.72], uv: 'keep' });
      x += 0.3;
    } else if (k === 'pincers') { nail(x, 1.55); for (const sx of [-1, 1]) f.part('iron', new THREE.BoxGeometry(0.012, 0.24, 0.008), { pos: [x + sx * 0.02, 1.42, z + 0.005], rot: [0, 0, sx * 0.12], col: C.black }); f.sph('iron', 0.022, [x, 1.54, z + 0.005], [1, 1, 0.5], C.black); x += 0.12; }
    else if (k === 'handsaw') { nail(x, 1.62); f.part('iron', new THREE.BoxGeometry(0.11, 0.5, 0.003), { pos: [x, 1.32, z], rot: [0, 0, 0.04], col: [0.62, 0.62, 0.64] }); f.box('wood', x - 0.07, 1.56, z - 0.005, x + 0.07, 1.66, z + 0.02, C.oak); x += 0.2; }
    else if (k === 'axe') { f.rod('wood', [x, 1.62, 0.02], [x, 1.62, 0.08], 0.01, 4, C.dark); f.box('wood', x - 0.015, 1.15, z, x + 0.015, 1.6, z + 0.03, C.pine); f.part('iron', new THREE.BoxGeometry(0.14, 0.09, 0.02), { pos: [x + 0.05, 1.18, z + 0.015], rot: [0, 0, -0.15], col: [0.45, 0.45, 0.47] }); x += 0.2; }
    else if (k === 'auger') { nail(x, 1.6); f.box('wood', x - 0.12, 1.57, z, x + 0.12, 1.6, z + 0.03, C.oak); f.rod('iron', [x, 1.57, z + 0.015], [x, 1.15, z + 0.015], 0.008, 4, [0.5, 0.5, 0.52]); x += 0.26; }
    else { nail(x, 1.6); f.box('wood', x - 0.015, 1.47, z, x + 0.015, 1.6, z + 0.03, C.dark); for (let q = 0; q < 8; q++) { const a = -0.2 + q * 0.32; f.obox('iron', 0.04, 0.012, 0.004, [x + 0.08 + Math.cos(a) * 0.1, 1.38 + Math.sin(a) * 0.1, z + 0.01], [0, 0, a + Math.PI / 2], [0.55, 0.55, 0.58]); } x += 0.28; }
    x += 0.04 + r() * 0.06;
  }
}
/* ---------------------------------------------------------------- trees */
// bare fruit tree: forked trunk, recursive branches with bark texture
export function fruitTree(f, { seed = 1, h = 4.5, r0 = 0.12 } = {}) {
  const r = rng(seed);
  const grow = (a, dir, len, rad, depth) => {
    const b = a.clone().addScaledVector(dir, len);
    f.rod('bark', a.toArray(), b.toArray(), rad, depth > 2 ? 6 : 4, [1, 1, 1], { r2: rad * 0.7, smooth: true });
    if (depth <= 0 || rad < 0.012) return;
    const n = depth > 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const d2 = dir.clone().applyAxisAngle(new V3(0, 1, 0), r() * Math.PI * 2).applyAxisAngle(new V3(1, 0, 0), (r() - 0.5) * 0.9).add(new V3(0, 0.35 + r() * 0.3, 0)).normalize();
      const mix = dir.clone().multiplyScalar(0.4).add(d2.multiplyScalar(0.8)).normalize();
      grow(b, mix, len * (0.62 + r() * 0.2), rad * 0.68, depth - 1);
    }
  };
  const trunkTop = new V3(0, h * 0.32, 0);
  f.rod('bark', [0, 0, 0], trunkTop.toArray(), r0, 8, [1, 1, 1], { r2: r0 * 0.85, smooth: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r();
    grow(trunkTop, new V3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize(), h * 0.3, r0 * 0.7, 4);
  }
  f.solid(-r0 - 0.05, -r0 - 0.05, r0 + 0.05, r0 + 0.05);
}

/* ---------------------------------------------------------------- detail pass 2: the last box-built things */
// wooden wheelbarrow (Schubkarre): two long shafts converging on a spoked, iron-tyred wheel, flared plank tray with a
// raised front board, short legs with iron straps; wheel at local +z
export function wheelbarrow(f) {
  const O = C.oak, D = C.dark;
  for (const sx of [-1, 1]) {
    f.beam('wood', [sx * 0.27, 0.6, -1.02], [sx * 0.1, 0.22, 0.66], 0.05, 0.055, D); // shaft
    f.rod('wood', [sx * 0.275, 0.605, -1.02], [sx * 0.29, 0.62, -1.2], 0.022, 7, O); // hand grip
    f.beam('wood', [sx * 0.24, 0.52, -0.62], [sx * 0.25, 0.002, -0.66], 0.045, 0.045, D); // leg
    f.beam('iron', [sx * 0.24, 0.5, -0.58], [sx * 0.2, 0.42, -0.25], 0.008, 0.03, C.black); // strap leg - shaft
  }
  // tray
  f.part('plank', new THREE.BoxGeometry(0.44, 0.025, 0.82), { pos: [0, 0.4, -0.08], rot: [-0.08, 0, 0], col: [0.85, 0.76, 0.64] });
  for (const sx of [-1, 1]) f.part('plank', new THREE.BoxGeometry(0.022, 0.22, 0.84), { pos: [sx * 0.27, 0.5, -0.08], rot: [-0.08, 0, -sx * 0.32], col: O });
  f.part('plank', new THREE.BoxGeometry(0.62, 0.34, 0.025), { pos: [0, 0.56, 0.36], rot: [0.42, 0, 0], col: O }); // front board
  f.part('plank', new THREE.BoxGeometry(0.52, 0.17, 0.025), { pos: [0, 0.47, -0.5], rot: [-0.3, 0, 0], col: O });
  for (const sx of [-1, 1]) for (const z of [-0.45, 0.3]) f.obox('iron', 0.012, 0.14, 0.05, [sx * 0.31, 0.5, z], [0, 0, -sx * 0.32], C.black); // corner irons
  // wheel between the shaft ends (axis along x)
  spokeWheel(f, 0, 0.222, 0.66, 0.21, { n: 8, rim: 0.04, w: 0.055, m: 'wood', col: D, tyre: C.black, spoke: 0.014 });
  f.rod('iron', [-0.12, 0.222, 0.66], [0.12, 0.222, 0.66], 0.012, 6, C.black);
  f.solid(-0.36, -1.2, 0.36, 0.9);
}
// pair of leather work boots standing side by side, toes to +z
export function boots(f, { col = [0.55, 0.42, 0.34] } = {}) {
  for (const [x, a] of [[-0.065, 0.06], [0.07, -0.1]]) {
    const b = f.sub(x, 0, 0, a);
    b.box('wood', -0.042, 0, -0.1, 0.042, 0.022, 0.15, [0.3, 0.26, 0.22]); // sole
    b.box('wood', -0.04, 0.022, -0.1, 0.04, 0.045, -0.04, [0.3, 0.26, 0.22]); // heel
    b.sph('leather', 1, [0, 0.05, 0.05], [0.045, 0.045, 0.1], col, { ws: 12, hs: 8 }); // foot
    lathe(b.sub(0, 0.04, -0.045), 'leather', [[0, 0], [0.05, 0], [0.052, 0.06], [0.047, 0.18], [0.05, 0.27], [0.044, 0.27], [0.04, 0.18], [0.04, 0.06], [0, 0.06]], 12, { col, scale: [1, 1, 1.12] });
    b.part('leather', new THREE.TorusGeometry(0.048, 0.006, 4, 12), { pos: [0, 0.31, -0.045], rot: [Math.PI / 2, 0, 0], col: [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], uv: 'keep' }); // folded top
    b.rod('leather', [0, 0.29, -0.095], [0, 0.33, -0.1], 0.008, 4, col); // pull strap
  }
}
// smoked ham / side of bacon hanging on a string from a pole (local y = hook height)
export function ham(f, { s = 1, seed = 1 } = {}) {
  const r = rng(seed), k = s * (0.9 + r() * 0.2);
  f.rod('rope', [0, 0, 0], [0, -0.12 * k, 0], 0.004, 3, [0.9, 0.85, 0.75]);
  const pts = [[0, -0.12], [0.03, -0.14], [0.05, -0.2], [0.11, -0.3], [0.14, -0.4], [0.13, -0.47], [0.09, -0.52], [0, -0.53]].map(([x, y]) => [x * k, y * k]);
  lathe(f.sub(0, 0, 0, r() * 6), 'leather', pts, 12, { col: [0.78, 0.46, 0.32], scale: [1, 1, 0.7] });
  f.sph('plain', 1, [0, -0.13 * k, 0], [0.018 * k, 0.03 * k, 0.018 * k], [0.95, 0.88, 0.78]); // bone end
}
// stable manger (Futterbarren) along local x: plastered stone front and back, a rounded trough floor, oak capping on the
// cow side with iron tethering rings, hay heaped in it
export function manger(f, { l = 6, d = 0.62, h = 0.62, rings = [] } = {}) {
  const WH = [0.86, 0.84, 0.8];
  f.box('wash', -l / 2, 0, -d / 2, l / 2, h, -d / 2 + 0.14, WH); // back wall side
  f.box('wash', -l / 2, 0, d / 2 - 0.12, l / 2, h - 0.06, d / 2, WH); // cow-side wall
  f.box('wash', -l / 2, 0, -d / 2 + 0.14, l / 2, h - 0.32, d / 2 - 0.12, WH); // filled base
  f.box('wood', -l / 2, h - 0.06, d / 2 - 0.15, l / 2, h, d / 2 + 0.03, C.oak, { rotUV: true }); // capping board
  for (const x of [-l / 2, l / 2]) f.box('wash', x - (x < 0 ? 0 : 0.06), 0, -d / 2, x + (x < 0 ? 0.06 : 0), h, d / 2, WH); // ends
  for (const x of rings) {
    f.part('iron', new THREE.TorusGeometry(0.04, 0.007, 5, 12), { pos: [x, h - 0.12, d / 2 + 0.008], col: C.black, uv: 'keep' });
    for (let i = 0; i < 6; i++) f.part('iron', new THREE.TorusGeometry(0.018, 0.004, 4, 8), { pos: [x, h - 0.17 - i * 0.03, d / 2 + 0.012], rot: [0, (i % 2) * Math.PI / 2, 0], col: C.black, uv: 'keep' }); // chain
  }
  hayHeap(f.sub(0, h - 0.32, 0.0), { rx: l / 2 - 0.08, rz: d / 2 - 0.16, h: 0.3, seed: 31, m: 'hay', tufts: Math.round(l * 6) });
}
// oval wicker log basket with two grip holes' rim handles, filled with split beech logs (bark on the round side, pale
// split faces); footprint ~0.55 x 0.42
export function logBasket(f, { seed = 5 } = {}) {
  const r = rng(seed);
  f.part('wicker', tubGeo(0.26, 0.19, 0.34, { n: 2.6, flare: 1.1, seg: 28, rows: 4 }), { col: [0.82, 0.66, 0.48], smooth: true, uv: [5, 4] });
  f.part('wood', new THREE.TorusGeometry(1, 0.05, 5, 24), { pos: [0, 0.342, 0], rot: [Math.PI / 2, 0, 0], scale: [0.285, 0.21, 0.3], col: [0.55, 0.42, 0.3], uv: 'keep' });
  for (const sx of [-1, 1]) f.part('wood', new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), { pos: [sx * 0.29, 0.34, 0], rot: [0, Math.PI / 2, 0], col: [0.55, 0.42, 0.3], uv: 'keep' });
  // Three supported tiers of closed split billets. Shorter side pieces fit the curved corners.
  // The flat split face starts on the inner floor (.015); each next tier touches the one below.
  for (let layer = 0; layer < 3; layer++) for (let col = -1; col <= 1; col++) {
    const L = (col ? .188 : .30) + r() * .008, rr = .058, rise = .074, seg = 8;
    const lg = f.sub(col * .132, .015 + layer * rise, (r() - .5) * .008);
    const positions = [], uvs = [], indices = [], shape = new THREE.Shape();
    for (let i = 0; i <= seg; i++) {
      const a = i * Math.PI / seg, x = rr * Math.cos(a), y = rise * Math.sin(a);
      if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
      for (const z of [-L / 2, L / 2]) { positions.push(x, y, z); uvs.push(i / seg, z / L + .5); }
      if (i < seg) { const j = i * 2; indices.push(j,j+2,j+1,j+1,j+2,j+3); }
    }
    shape.closePath();
    const bark = new THREE.BufferGeometry();
    bark.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bark.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); bark.setIndex(indices); bark.computeVertexNormals();
    lg.part('bark', bark, { col: [.88,.84,.77], uv: [1,2] });
    lg.part('wood', new THREE.PlaneGeometry(rr * 2, L), { rot: [H,0,0], col: C.pine, uv: 'planar' }); // split underside
    for (const s of [-1,1]) lg.part('ring', new THREE.ShapeGeometry(shape), { pos: [0,0,s*L/2], rot: [0,s<0?Math.PI:0,0], col: [.95,.89,.79], uv: 'planar' });
  }
  f.solid(-0.28, -0.21, 0.28, 0.21);
}
// frying pan / skillet hanging on a nail by its handle, face to local +z (local origin = the nail)
export function wallPan(f, { r = 0.13, col = [0.3, 0.3, 0.32] } = {}) {
  const p = f.sub(0, -0.2 - r, 0.025, 0, [Math.PI / 2, 0, 0]);
  lathe(p, 'iron', [[0, 0], [r * 0.82, 0], [r * 0.9, 0.006], [r, 0.04], [r - 0.006, 0.042], [r * 0.88, 0.01], [r * 0.8, 0.006], [0, 0.006]], 20, { col });
  f.beam('iron', [0, -0.03, 0.02], [0, -0.2, 0.02], 0.024, 0.008, col); // handle
  f.part('iron', new THREE.TorusGeometry(0.009, 0.003, 4, 8), { pos: [0, -0.02, 0.02], col, uv: 'keep' }); // hanging hole
  f.rod('iron', [0, -0.02, -0.02], [0, -0.018, 0.035], 0.003, 3, C.black); // nail
}
// round rye loaf (Bauernbrot) with a floury, cracked crust on a bread board, local origin = board bottom
export function loaf(f, { r = 0.12 } = {}) {
  f.box('wood', -0.19, 0, -0.13, 0.19, 0.018, 0.13, C.oak);
  f.box('wood', 0.19, 0.004, -0.02, 0.25, 0.014, 0.02, C.oak); // board handle
  const g = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), a = Math.atan2(z, x); P.setXYZ(i, x * (1 + 0.04 * Math.sin(a * 5)), y * (1 + 0.06 * Math.sin(a * 3 + 1) * (1 - y)), z * (1 + 0.04 * Math.sin(a * 5))); }
  g.computeVertexNormals();
  f.part('plain', g, { pos: [0, 0.016, 0], scale: [r, r * 0.6, r * 0.92], col: [0.62, 0.4, 0.24], smooth: true });
  for (let i = 0; i < 3; i++) f.obox('plain', r * 1.1, 0.006, 0.008, [0, 0.016 + r * 0.58 - Math.abs(i - 1) * 0.008, (i - 1) * r * 0.36], [0, 0.4, 0], [0.86, 0.74, 0.58]); // scores
  f.sph('plain', 1, [r * 0.15, 0.016 + r * 0.45, 0], [r * 0.7, r * 0.2, r * 0.65], [0.95, 0.9, 0.82]); // flour dusting
}

/* ---------------------------------------------------------------- v4: cloth, garments, stove */
// grid surface -> two-sided thin shell (front + back with reversed winding, offset th along the normal)
export function shellGeo(P, NU, NV, th = 0.003) {
  const g = new THREE.BufferGeometry(), pos = [], idx = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) pos.push(...P(i / NU, j / NV));
  const n0 = pos.length / 3;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nr = g.attributes.normal, p2 = pos.slice();
  for (let k = 0; k < n0; k++) for (let q = 0; q < 3; q++) p2[k * 3 + q] -= nr.array[k * 3 + q] * th;
  const all = pos.concat(p2), id2 = idx.slice();
  for (let k = 0; k < idx.length; k += 3) id2.push(idx[k] + n0, idx[k + 2] + n0, idx[k + 1] + n0);
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(all, 3)); G.setIndex(id2.slice(idx.length).length ? id2 : idx);
  G.computeVertexNormals();
  return G;
}
// cloth hung over a pole running along local z through the origin (pole radius r): side A hangs at -x, side B at +x
export function drape(f, m, { w = 0.4, hA = 0.3, hB = 0.36, r = 0.022, col = C.linen, seed = 1, z = 0 } = {}) {
  const R = rng(seed), ph = R() * 6, L = hA + Math.PI * (r + 0.004) + hB;
  const P = (s, t) => {
    const zz = z + (t - 0.5) * w, a = s * L;
    let x, y, dep = 0;
    if (a < hA) { dep = hA - a; x = -(r + 0.004); y = -dep; }
    else if (a < hA + Math.PI * (r + 0.004)) { const q = (a - hA) / (r + 0.004); x = -Math.cos(q) * (r + 0.004); y = Math.sin(q) * (r + 0.004); }
    else { dep = a - hA - Math.PI * (r + 0.004); x = r + 0.004; y = -dep; }
    const sx = Math.sign(x) || 1;
    x += sx * dep * 0.06 + sx * Math.sin(zz * 34 + ph + dep * 6) * 0.007 * Math.min(1, dep * 5); // falls a little away, soft folds
    y += Math.sin((t - 0.5) * Math.PI) * 0 - Math.cos((t - 0.5) * Math.PI) * 0.004 * dep * 4 + (t < 0.04 || t > 0.96 ? -0.0 : 0);
    return [x, y, zz];
  };
  f.part(m, shellGeo(P, 24, 6), { col, smooth: true });
}
// rack board with turned pegs on a wall (local z = 0 = wall face, front +z); returns the peg tips (local)
export function pegRack(f, { l = 0.8, n = 3, col = C.dark } = {}) {
  f.box('wood', -l / 2, -0.045, 0, l / 2, 0.045, 0.022, col);
  f.box('wood', -l / 2, 0.045, 0, l / 2, 0.055, 0.03, col); // little moulded top
  const tips = [];
  for (let i = 0; i < n; i++) {
    const x = -l / 2 + (i + 0.5) * (l / n), pg = f.sub(x, 0, 0.022, 0, [H - 0.25, 0, 0]);
    lathe(pg, 'wood', [[0, 0], [0.014, 0], [0.012, 0.04], [0.009, 0.075], [0.016, 0.085], [0.014, 0.1], [0, 0.104]], 8, { col: C.oak });
    tips.push([x, 0.024, 0.11]);
  }
  return tips;
}
// a jacket / coat hung by its loop on a peg (origin = the loop, hangs down -y, the wall about 0.08 behind, -z)
export function jacket(f, { col = [0.36, 0.33, 0.32], l = 0.78, seed = 1, long = false } = {}) {
  const R = rng(seed), ph = R() * 6, NU = 24, NV = 16, dark = [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78];
  const wx = (t) => (t < 0.05 ? 0.035 + t * 1.6 : t < 0.16 ? 0.115 + (t - 0.05) * 0.85 : 0.208 + (t - 0.16) * 0.05) * (long ? 1.05 : 1);
  const dz = (t) => 0.018 + Math.min(1, t * 5) * 0.042;
  const P = (s, t) => {
    const a = s * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), y = -t * l - 0.05 * (Math.abs(ca) + (1 - Math.abs(ca)) * sm(0.14, 0.4, t)) * Math.min(1, t * 12);
    const px = Math.sign(ca) * Math.pow(Math.abs(ca), 0.75) * wx(t);
    let pz = Math.sign(sa) * Math.pow(Math.abs(sa), 0.8) * dz(t);
    if (pz < 0) pz *= 0.55; // flat back against the wall
    pz += -0.025 + Math.sin(Math.PI * Math.min(1, t * 1.3)) * 0.012;
    if (sa > 0) pz += Math.sin(px * 30 + ph + t * 3) * 0.006 * t; // folds down the front
    return [px, y, pz];
  };
  const g = new THREE.BufferGeometry(), pos = [], idx = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) pos.push(...P(i / NU, j / NV));
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const cb = pos.length / 3; pos.push(0, -l - 0.05, -0.025); for (let i = 0; i < NU; i++) idx.push(NV * (NU + 1) + i, NV * (NU + 1) + i + 1, cb); // hem cap
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  f.part('linen', g, { col, smooth: true });
  const front = (t) => P(0.25, t)[2];
  // collar round the neck + lapels
  f.part('linen', new THREE.TorusGeometry(0.045, 0.016, 6, 12, Math.PI * 1.25), { pos: [0, -0.035, -0.012], rot: [H * 0.75, 0, -Math.PI * 0.125 - H], scale: [1.1, 1, 0.7], col: dark, smooth: true });
  for (const sx of [-1, 1]) f.obox('linen', 0.055, 0.2, 0.01, [sx * 0.045, -0.15, front(0.17) + 0.004], [0.08, sx * 0.25, sx * 0.32], dark);
  // buttons down the front, pockets with flaps
  for (let i = 0; i < (long ? 5 : 4); i++) { const t = 0.27 + i * 0.12 * (0.78 / l) * (long ? 0.9 : 1); f.cyl('plain', 0.011, 0.011, 0.006, 8, [0.012, -t * l - 0.05, front(t) + 0.003], [H, 0, 0], [0.2, 0.17, 0.14]); }
  for (const sx of [-1, 1]) { const t = long ? 0.55 : 0.66; f.obox('linen', 0.12, 0.04, 0.008, [sx * 0.11, -t * l - 0.05, front(t) - 0.004 + 0.012], [0.05, 0, 0], dark); }
  // sleeves hang from the drooping shoulders down the sides, a little forward, cuffs turned back
  for (const sx of [-1, 1]) {
    const a = [sx * 0.19, -0.13, -0.005], b = [sx * (0.215 + R() * 0.02), -0.13 - l * 0.68, 0.012];
    f.rod('linen', a, b, 0.052, 10, [col[0] * 0.93, col[1] * 0.93, col[2] * 0.93], { r2: 0.044, smooth: true });
    f.rod('linen', [b[0], b[1] + 0.06, b[2]], [b[0], b[1] - 0.005, b[2]], 0.047, 10, dark, { smooth: true });
  }
  f.part('wood', new THREE.TorusGeometry(0.014, 0.003, 4, 10), { pos: [0, 0.0, 0.0], rot: [0, H, 0], col: [0.3, 0.26, 0.22], uv: 'keep' }); // hanging loop
}
// felt hat hung on a peg by its crown (origin = peg tip), crown pointing out of the wall
export function hat(f, { col = [0.28, 0.27, 0.24] } = {}) {
  const h = f.sub(0, -0.02, -0.05, 0, [H - 0.3, 0, 0]);
  lathe(h, 'linen', [[0, 0.11], [0.05, 0.108], [0.075, 0.095], [0.082, 0.05], [0.085, 0.01], [0.15, 0.004], [0.158, -0.004], [0.08, -0.002], [0.07, 0.09], [0, 0.1]], 14, { col, uv: 'planar' });
  lathe(h, 'linen', [[0.0855, 0.012], [0.0865, 0.034], [0.0835, 0.034], [0.0825, 0.012]], 14, { col: [0.12, 0.11, 0.1], uv: 'planar' }); // band
}
// woollen shawl folded over a peg: two-sided draped cloth (origin = peg tip, pole along local x)
export function shawl(f, { col = [0.5, 0.2, 0.18], seed = 3 } = {}) {
  drape(f.sub(0, 0, -0.01, H), 'linen', { w: 0.3, hA: 0.18, hB: 0.42, r: 0.012, col, seed });
}
// Kachelofen: tiles aligned to the 0.2 m world grid (place it on multiples of 0.2), stone plinth, waist band, cornice and
// crown, warming-niche door; an L-shaped oven bench with seat planks, apron boards and feet; iron brackets on the crown
// carry a drying pole with a towel and a pair of stockings draped over it
export function kachelofen(f, { w = 1.0, d = 0.8 } = {}) {
  const yb = 0.25, y1 = 1.05, y2 = 1.45, G = [0.9, 0.96, 0.9];
  f.box('stone', -w / 2 - 0.05, 0, -d / 2 - 0.05, w / 2 + 0.05, yb - 0.03, d / 2 + 0.05, [0.78, 0.76, 0.74]);
  f.box('stone', -w / 2 - 0.065, yb - 0.03, -d / 2 - 0.065, w / 2 + 0.065, yb, d / 2 + 0.065, [0.86, 0.84, 0.8]);
  f.box('kachel', -w / 2, yb, -d / 2, w / 2, y1, d / 2, C.white);
  f.box('kachel', -w / 2 - 0.035, y1 - 0.01, -d / 2 - 0.035, w / 2 + 0.035, y1 + 0.05, d / 2 + 0.035, [0.78, 0.86, 0.8]); // waist band
  f.box('kachel', -w / 2, y1 + 0.05, -d / 2, w / 2, y2, d / 2, C.white);
  f.box('kachel', -w / 2 - 0.045, y2, -d / 2 - 0.045, w / 2 + 0.045, y2 + 0.05, d / 2 + 0.045, G); // cornice
  f.box('kachel', -w / 2 - 0.07, y2 + 0.05, -d / 2 - 0.07, w / 2 + 0.07, y2 + 0.09, d / 2 + 0.07, [0.8, 0.88, 0.82]); // crown
  f.box('kachel', -w / 2 + 0.03, y2 + 0.09, -d / 2 + 0.03, w / 2 - 0.03, y2 + 0.13, d / 2 - 0.03, G);
  const top = y2 + 0.13;
  // warming niche (front, between the bands)
  f.box('brass', -0.17, 0.62, d / 2, 0.17, 0.92, d / 2 + 0.014, C.brass);
  f.box('iron', -0.14, 0.645, d / 2 + 0.014, 0.14, 0.895, d / 2 + 0.02, [0.3, 0.27, 0.24]);
  f.sph('brass', 0.016, [0.105, 0.77, d / 2 + 0.03], 1, C.brass);
  for (const y of [0.68, 0.86]) f.box('iron', -0.15, y - 0.012, d / 2 + 0.02, -0.11, y + 0.012, d / 2 + 0.026, [0.22, 0.2, 0.18]); // hinges
  // oven bench: west run (to the north wall) + south run, 0.46 high
  const O = C.oak, D = C.dark, sy = 0.46, st = 0.05, bw = 0.39, xw = -w / 2 - bw, zs = d / 2 + bw, zn = -d / 2 - 0.11;
  for (const [a, b] of [[xw, -w / 2 - bw / 2 - 0.003], [-w / 2 - bw / 2 + 0.003, -w / 2]]) f.box('wood', a, sy - st, zn, b, sy, zs, O); // west planks (along z)
  for (const [a, b] of [[d / 2, d / 2 + bw / 2 - 0.003], [d / 2 + bw / 2 + 0.003, zs]]) f.box('wood', -w / 2, sy - st, a, w / 2 + 0.06, sy, b, O, { rotUV: true }); // south planks (along x)
  f.box('wood', xw + 0.02, sy - st - 0.012, zn, -w / 2, sy - st, zs - 0.02, D); f.box('wood', -w / 2, sy - st - 0.012, d / 2, w / 2 + 0.05, sy - st, zs - 0.02, D); // dark under-boards seen through the gaps
  const ys = sy - st - 0.012; // under the seat: a narrow skirt board, square legs, a low stretcher; open below
  f.box('wood', xw + 0.02, ys - 0.09, zn + 0.005, xw + 0.045, ys, zs - 0.02, D); // west skirt
  f.box('wood', xw + 0.045, ys - 0.09, zs - 0.045, w / 2 + 0.04, ys, zs - 0.02, D); // south skirt
  const mid = (zn + zs) / 2, legs = [[xw + 0.047, zn + 0.01], [xw + 0.047, mid - 0.0225], [xw + 0.047, zs - 0.095], [-w / 2 + 0.1, zs - 0.092], [w / 2 - 0.05, zs - 0.092]];
  for (const [x, z] of legs) f.box('wood', x, 0, z, x + 0.045, ys - 0.004, z + 0.045, D, { rotUV: true });
  f.box('wood', xw + 0.055, 0.08, zn + 0.055, xw + 0.085, 0.11, zs - 0.095, D); // stretchers
  f.box('wood', xw + 0.092, 0.08, zs - 0.085, w / 2 - 0.05, 0.11, zs - 0.055, D);
  f.rod('wood', [xw + 0.018, sy - 0.024, zn], [xw + 0.018, sy - 0.024, zs - 0.01], 0.021, 8, O); // rounded seat edges
  f.rod('wood', [xw + 0.01, sy - 0.024, zs - 0.018], [w / 2 + 0.06, sy - 0.024, zs - 0.018], 0.021, 8, O);
  f.box('wood', xw + 0.06, 0.2, zn + 0.02, -w / 2 - 0.07, 0.22, zs - 0.1, D); // shelf under the seat
  for (let i = 0; i < 3; i++) f.part('bark', new THREE.CylinderGeometry(0.045, 0.05, 0.36, 7), { pos: [xw + 0.12 + i * 0.1, 0.27, -0.05 + i * 0.07], rot: [H, 0.1 * i, 0], col: [1, 1, 1] }); // kindling stored under
  // folded blanket on the bench
  const bl = f.sub(xw + 0.22, sy, -0.15, 0.12);
  bl.part('checkR', new THREE.BoxGeometry(0.34, 0.07, 0.3, 4, 2, 4), { pos: [0, 0.036, 0], col: [0.75, 0.72, 0.7] });
  bl.part('checkR', new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), { pos: [0, 0.035, 0.15], rot: [0, 0, H], col: [0.75, 0.72, 0.7], smooth: true });
  // drying pole on two iron brackets standing on the crown
  const px = -w / 2 - 0.26, py = top + 0.22;
  for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) {
    f.box('iron', -w / 2 + 0.035, top, z - 0.03, -w / 2 + 0.11, top + 0.006, z + 0.03, [0.3, 0.29, 0.28]); // foot plate
    f.box('iron', -w / 2 + 0.06, top, z - 0.006, -w / 2 + 0.08, py + 0.01, z + 0.006, [0.3, 0.29, 0.28]); // upright
    f.box('iron', px + 0.02, py - 0.01, z - 0.006, -w / 2 + 0.08, py + 0.01, z + 0.006, [0.3, 0.29, 0.28]); // arm
    f.beam('iron', [-w / 2 + 0.07, py - 0.14, z], [-w / 2 - 0.08, py - 0.005, z], 0.01, 0.012, [0.3, 0.29, 0.28]); // brace
    f.part('iron', new THREE.TorusGeometry(0.026, 0.006, 5, 12), { pos: [px, py, z], col: [0.3, 0.29, 0.28], uv: 'keep' }); // eye
  }
  f.rod('wood', [px, py, -d / 2 + 0.02], [px, py, d / 2 + 0.16], 0.02, 8, D);
  const dp = f.sub(px, py, 0, 0);
  drape(dp, 'linen', { w: 0.36, hA: 0.3, hB: 0.36, r: 0.021, z: 0.1, col: [0.98, 0.95, 0.88], seed: 4 }); // towel
  drape(dp, 'linen', { w: 0.08, hA: 0.2, hB: 0.24, r: 0.021, z: -0.17, col: [0.5, 0.47, 0.44], seed: 5 }); // stockings
  drape(dp, 'linen', { w: 0.08, hA: 0.22, hB: 0.2, r: 0.021, z: -0.27, col: [0.48, 0.45, 0.42], seed: 6 });
  f.solid(xw - 0.01, zn, w / 2 + 0.08, zs + 0.01);
}
