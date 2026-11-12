// Period forged door hardware. Dimensions below are millimetres; all exported groups use metres.
// The projected lock face is sampled from the supplied concept; silhouettes and fittings are real geometry.
import * as THREE from 'three';
import { ps1Material } from '../engine/ps1.js';
import { photoTex } from '../engine/photo.js';

const V = THREE.Vector3;
const cache = {};
function material(name, tint = [1,1,1]) {
  const key = name + tint.join(',');
  return cache[key] ||= ps1Material({ map: photoTex(name), tint, vertexColors: false, ao: .7, fog: 1 });
}
function mesh(g, m, parent, p = [0,0,0], rot = [0,0,0]) {
  const o = new THREE.Mesh(g, m); o.position.set(...p); o.rotation.set(...rot); o.layers.enable(1); parent.add(o); return o;
}
function cube(parent, mat, w,h,d, x,y,z) { return mesh(new THREE.BoxGeometry(w,h,d), mat,parent,[x,y,z]); }
function ball(parent, mat, r, x,y,z, scales = [1,1,1]) { const o=mesh(new THREE.SphereGeometry(r,18,12),mat,parent,[x,y,z]); o.scale.set(...scales); return o; }
function cyl(parent, mat, r, len, x,y,z, rot = [Math.PI/2,0,0]) { return mesh(new THREE.CylinderGeometry(r,r,len,16), mat,parent,[x,y,z],rot); }
function shape(points) { const s = new THREE.Shape(); s.moveTo(...points[0]); for(const p of points.slice(1)) s.lineTo(...p); s.closePath(); return s; }
function solidShape(parent, points, depth, mat, z=0, holes=[]) {
  const s=shape(points); s.holes.push(...holes); const g=new THREE.ExtrudeGeometry(s,{depth, bevelEnabled:true, bevelThickness:.5,bevelSize:.5,bevelSegments:2,curveSegments:18});
  g.translate(0,0,z-depth/2); const uv=g.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)/33,uv.getY(i)/33); return mesh(g,mat,parent);
}
function tube(parent, mat, points, radius, segments=50) { const path = new THREE.CatmullRomCurve3(points.map(p=>new V(...p)),false,'centripetal'); return mesh(new THREE.TubeGeometry(path,segments,radius,12,false),mat,parent); }
// Cap a cut tube exactly on its own end ring; independent discs leave visible gaps at oblique angles.
function cutTube(parent, mat, cutMat, points, radius, segments, capAtStart, capAtEnd) {
  const path = new THREE.CatmullRomCurve3(points.map(p=>new V(...p)),false,'centripetal');
  const radial = 12, g = new THREE.TubeGeometry(path,segments,radius,radial,false);
  mesh(g,mat,parent);
  const attr=g.attributes.position;
  const capMaterial=cutMat.clone(); capMaterial.side=THREE.DoubleSide;
  for(const [enabled,ring] of [[capAtStart,0],[capAtEnd,segments]]) {
    if(!enabled) continue;
    const coords=[], center=new V();
    for(let j=0;j<radial;j++){ const i=ring*(radial+1)+j; const p=new V().fromBufferAttribute(attr,i); coords.push(p); center.add(p); }
    center.multiplyScalar(1/radial);
    const vertices=[center.x,center.y,center.z], uvs=[.5,.5], indices=[];
    for(let j=0;j<radial;j++){ const p=coords[j], a=2*Math.PI*j/radial; vertices.push(p.x,p.y,p.z); uvs.push(.5+.48*Math.cos(a),.5+.48*Math.sin(a)); }
    for(let j=0;j<radial;j++) indices.push(0,1+j,1+(j+1)%radial);
    const cap=new THREE.BufferGeometry(); cap.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); cap.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); cap.setIndex(indices); cap.computeVertexNormals(); mesh(cap,capMaterial,parent);
  }
}
function projected(parent, mat, x0,y0,x1,y1,z, uvfn) {
  const g=new THREE.PlaneGeometry(x1-x0,y1-y0); g.translate((x0+x1)/2,(y0+y1)/2,z);
  const p=g.attributes.position,u=g.attributes.uv; for(let i=0;i<p.count;i++){const a=uvfn(p.getX(i),p.getY(i));u.setXY(i,a[0],a[1]);} return mesh(g,mat,parent);
}
const boltUV=(x,y)=>[(1030.5+x/.504-686)*2/1448, 1-(176.5-y/.504-44)*2/404];
function nail(parent, x,y,z, size=3.2) {
  const iron=material('hwIron');
  const g=new THREE.ConeGeometry(size, size*.8,4,1); const o=mesh(g,iron,parent,[x,y,z],[Math.PI/2,Math.PI/4,0]);
  return o;
}
// Face projected exactly onto the shape in concept coordinates, independent of its curved geometry.
function caseGeo(broken, front=true) {
  const profile=[[0,-3.6],[5,-3],[9.4,-2],[13.3,-.2],[26.2,-.1],[27.6,-1],[29.3,-3.7],[30.4,-9.2],[31.4,-16.5],[32.6,-23.7],[32.7,-29.2],[32.2,-32.8],[31.2,-38.2],[29.85,-41.9],[28,-45.5],[25.65,-49.1],[22.4,-52.8],[20.2,-54.6],[15,-57.3],[10,-59.4],[0,-60.8]];
  const right=profile.slice(1,-1).map(([x,y])=>[x,y]);
  const pts=broken ? [[-26,-1],[-13,-.2],[0,-3.6],[5,-3],[8,-8],[12,-6],[15,-11],[19,-8],[24,-12],[28,-8],[30.4,-9.2],...right.slice(7),[0,-60.8],...right.slice().reverse().map(([x,y])=>[-x,y])] : [[0,-3.6],...right,[0,-60.8],...right.slice().reverse().map(([x,y])=>[-x,y])];
  const g=new THREE.ShapeGeometry(shape(pts),24); const pos=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<pos.count;i++) { const x=pos.getX(i), y=pos.getY(i); const px=front?812.6+x/.227:1348.4-x/.227; const py=197.5-y/.227; uv.setXY(i,(px-(front?662:1199))*2/608,1-(py-188)*2/564); }
  if (!front) { g.rotateY(Math.PI); } // front remains textured; mirrored back is less important in the mounted view
  return {g,pts};
}
function facePiece(parent, pts, z, holes=[]) {
  const s=shape(pts); s.holes.push(...holes); const g=new THREE.ShapeGeometry(s,24), p=g.attributes.position, uv=g.attributes.uv;
  for(let i=0;i<p.count;i++) { const px=812.6+p.getX(i)/.227, py=197.5-p.getY(i)/.227; uv.setXY(i,(px-662)*2/608,1-(py-188)*2/564); }
  return mesh(g,material('lockF'),parent,[0,0,z]);
}
function lockBody(parent, broken) {
  const iron=material('hwIron'), face=material('lockF'), back=material('lockB');
  const {g,pts}=caseGeo(broken); solidShape(parent,pts,20,iron,0); mesh(g,face,parent,[0,0,10.5]);
  const bg=caseGeo(broken,false).g; mesh(bg,back,parent,[0,0,-10.5]);
  const rivets=[[-23.9,-6.8],[23.5,-7.4],[-25.6,-34.1],[24.9,-35.2],[-11.9,-51.1],[11.3,-51.1],[-.3,-55.4]];
  for (const [x,y] of rivets) { if(broken && x>10 && y>-13) continue; ball(parent,iron,y < -54 ? 1.4:2.1,x,y,11,[1,1,.58]); ball(parent,iron,2,x,y,-11,[1,1,.55]); }
  // Raised oval escutcheon and pivoting teardrop cover; the hole is left open in the raised plate.
  const oval=Array.from({length:40},(_,i)=>{const a=i*Math.PI*2/40;return [-.6+9*Math.cos(a),-44.4+8.4*Math.sin(a)];});
  const kh=new THREE.Path(); kh.moveTo(-2.35,-43.4); kh.lineTo(-2.35,-51); kh.lineTo(1.55,-51); kh.lineTo(1.55,-43.4);
  for(let i=0;i<=22;i++){const a=(-.94+i*(Math.PI*2-1.26)/22);kh.lineTo(-.4+3.4*Math.cos(a),-40.6+3.4*Math.sin(a));} kh.closePath();
  solidShape(parent,oval,1,iron,10.9,[kh]); facePiece(parent,oval,11.45,[kh]);
  const cover=[[-3,-23],[-2.2,-20.9],[0,-20.2],[2.5,-21],[3.2,-23.3],[4.2,-26],[6.7,-30],[8,-33],[8,-35],[6,-37],[3,-38.6],[0,-39],[-3,-38],[-6,-36],[-7,-33],[-6,-30],[-4,-26]];
  solidShape(parent,cover,1,iron,11.5); facePiece(parent,cover,12.05);
  ball(parent,iron,2.2,.05,-23.3,12.4,[1,1,.55]);
  if(broken) {
    const dark=material('hwIron',[.45,.42,.4]), bright=material('frac',[.52,.52,.50]);
    solidShape(parent,[[6,-7],[11,-5],[15,-10],[19,-7],[24,-11],[28,-8],[27,-14],[13,-14]],2,dark,11);
    solidShape(parent,[[10,-7],[15,-10],[20,-7],[24,-11],[21,-12],[15,-11]],1.5,bright,12.5);
    // Dented cheeks and fine fresh scoring, deliberately asymmetric.
    for (const [x,y,rx,ry] of [[18,-21,3.2,1.1],[12,-14,2.1,.65],[24,-26,2.3,.6]]) {
      ball(parent,dark,1,x,y,10.62,[rx,ry,.16]);
      ball(parent,bright,1,x+.3,y-.45,10.68,[rx*.62,.12,.08]);
    }
  }
}
function shackle(parent, broken) {
  const iron=material('shackle'), bright=material('frac');
  const pts=[];
  if (!broken) { pts.push([19.9,-5,0],[19.9,2,0],[19.9,9.5,0]); for(let i=1;i<=32;i++){const a=Math.PI*i/32;pts.push([19.9*Math.cos(a),9.5+19.9*Math.sin(a),0]);} pts.push([-19.9,2,0],[-19.9,-5,0]); tube(parent,iron,pts,5.85,90); }
  else {
    pts.push([19.9,14.5,1.8]); for(let i=1;i<=28;i++){const a=.22+(Math.PI-.22)*i/28;pts.push([19.9*Math.cos(a),9.5+19.9*Math.sin(a),0]);} pts.push([-19.9,2,0],[-19.9,-5,0]); cutTube(parent,iron,bright,pts,5.85,80,true,false);
    cutTube(parent,iron,bright,[[20,-15,0],[20,-8,0],[20,-.5,0],[21,3,0]],5.85,20,false,true);
  }
}
export function makePadlock() {
  const group=new THREE.Group(), pose=new THREE.Group(), intact=new THREE.Group(), broken=new THREE.Group(); group.scale.setScalar(.001); group.add(pose); pose.add(intact,broken);
  lockBody(intact,false); shackle(intact,false); lockBody(broken,true); shackle(broken,true); broken.visible=false;
  // The broken upper shackle can leave its damaged socket while the case and short stub stay still.
  // Moving the whole case along that curve pulls the short stub across the fixed staple.
  const upperIndex=broken.children.findIndex(m=>m.geometry?.type==='TubeGeometry');
  const upperPieces=broken.children.slice(upperIndex,upperIndex+2), looseShackle=new THREE.Group();
  looseShackle.add(...upperPieces);broken.add(looseShackle);
  // Thread the open shackle through the eye using its actual centreline. Rotate about the contact so
  // the wire stays perpendicular to the eye; only then put the lock on the small jamb shelf.
  const path=upperPieces[0].geometry.parameters.path;
  const eye=new V(-19.9,4,0); let u0=1, best=Infinity;
  for(let i=0;i<=1000;i++){const u=i/1000,d=path.getPoint(u).distanceToSquared(eye);if(d<best){best=d;u0=u;}}
  const anchor=path.getPoint(u0), initialTangent=path.getTangent(u0).negate();
  const initialAngle=Math.atan2(initialTangent.y,initialTangent.x);
  const cutPoint=path.getPoint(0), exit=path.getTangent(0).negate();
  // The bent cut has a Z tangent as well as X/Y. Align all three components before withdrawing it;
  // a Z-only rotation drives the short broken stub into the fixed eye during the final extraction.
  // https://threejs.org/docs/#api/en/math/Quaternion.setFromUnitVectors
  function alignTangent(tangent) {
    const turn=new THREE.Quaternion().setFromAxisAngle(new V(0,0,1),initialAngle-Math.atan2(tangent.y,tangent.x));
    return new THREE.Quaternion().setFromUnitVectors(tangent.clone().applyQuaternion(turn),initialTangent).multiply(turn);
  }
  const exitRotation=alignTangent(exit);
  const exitPosition=anchor.clone().sub(cutPoint.clone().addScaledVector(exit,19).applyQuaternion(exitRotation));
  function setRelease(t) {
    t=Math.max(0,Math.min(1,t));
    pose.quaternion.identity();pose.position.set(0,0,0);
    if(t<=.62){
      const u=u0*(1-t/.62), p=path.getPoint(u), tangent=path.getTangent(u).negate();
      looseShackle.quaternion.copy(alignTangent(tangent));looseShackle.position.copy(anchor).sub(p.applyQuaternion(looseShackle.quaternion));
    } else if(t<.76){
      const p=cutPoint.clone().addScaledVector(exit,19*(t-.62)/.14);
      looseShackle.quaternion.copy(exitRotation);looseShackle.position.copy(anchor).sub(p.applyQuaternion(exitRotation));
    } else {
      let s=(t-.76)/.24;s=s*s*(3-2*s);
      looseShackle.quaternion.copy(exitRotation).slerp(new THREE.Quaternion(),s);looseShackle.position.copy(exitPosition).multiplyScalar(1-s);
      pose.position.set(130*s,-140*s,10*s);
      pose.position.z+=Math.sin(s*Math.PI)*70; // carry clear of the staple and strap during the turn
    }
  }
  return {group, pose, setRelease, setBroken(b){intact.visible=!b;broken.visible=!!b;setRelease(0);}, intact, broken};
}
export function makeKey() {
  const group=new THREE.Group(); group.scale.setScalar(.001); const iron=material('hwIron'), steel=material('hwSteel');
  const s=new THREE.Shape(); s.absellipse(0,0,11.4,13.3,0,Math.PI*2,false,0); const hole=new THREE.Path(); hole.absellipse(0,0,7.5,9.3,0,Math.PI*2,true,0); s.holes.push(hole);
  const geo=new THREE.ExtrudeGeometry(s,{depth:3,bevelEnabled:true,bevelSize:.55,bevelThickness:.55,bevelSegments:2,curveSegments:28}); geo.translate(0,0,-1.5); mesh(geo,iron,group);
  ball(group,iron,3.8,12.8,0,0,[1.3,1,1]); cyl(group,iron,4.1,4.3,17,0,0,[0,0,Math.PI/2]); cyl(group,iron,4.8,4,22,0,0,[0,0,Math.PI/2]);
  cyl(group,steel,3.2,36,42,0,0,[0,0,Math.PI/2]); ball(group,steel,3.2,60,0,0);
  solidShape(group,[[48,-2],[60,-2],[60,-11.5],[56,-11.5],[56,-7.5],[53,-7.5],[53,-11.5],[49,-11.5]],3,iron,0);
  return {group};
}
export function makeHasp() {
  const group=new THREE.Group(); group.scale.setScalar(.001); const iron=material('hwIron');
  const leaf=new THREE.Group(); leaf.position.x=-150; group.add(leaf);
  // Slot surrounds the staple and is offset from the end of the strap so the metal remains continuous.
  const slot=new THREE.Path(); slot.absellipse(133,0,13,5.8,0,Math.PI*2,true,0);
  solidShape(leaf,[[0,-15],[143,-15],[160,-9],[160,9],[143,15],[0,15]],4,iron,0,[slot]);
  for(const [x,y] of [[18,-9],[18,9],[42,-9],[42,9]]) nail(leaf,x,y,3,3.6);
  cyl(leaf,iron,5,32,2,0,3,[0,0,0]);
  const staple=new THREE.Group(); group.add(staple);
  // Staple forms an XZ eye on the jamb. The left vertical leg of the shackle passes through it.
  cube(staple,iron,38,31,3,-17,0,-2.5);
  for(const x of [-32,-2]) for(const y of [-11,11]) nail(staple,x,y,-.5,2.1);
  tube(staple,iron,[[-27,0,-1],[-27,0,9],[-26,0,27],[-22,0,34],[-17,0,36],[-12,0,34],[-8,0,27],[-7,0,9],[-7,0,-1]],2.5,56);
  return { group, leaf, staple, setOpen(t){leaf.rotation.y=-1.48*Math.max(0,Math.min(1,Number(t)));} };
}
export function makeBolt() {
  const group=new THREE.Group(); group.scale.setScalar(.001); const iron=material('hwIron'), plate=material('hwPlate'), steel=material('hwSteel');
  cube(group,plate,296,61,4,0,0,0);
  const boltFace=material('boltF');
  // Only the exposed bands are projected: moving the bar must not reveal a painted duplicate.
  projected(group,boltFace,-128,12,148,30,2.04,boltUV);
  projected(group,boltFace,-128,-30,148,-6,2.04,boltUV);
  for(const x of [-132,137]) for(const y of [-21,21]) nail(group,x,y,3.1,4.8);
  // Two arched guides, with clearance for the moving bar.
  for(const x of [-84,90]) {
    cube(group,iron,18,52,3,x,0,2.7);
    cube(group,iron,18,7,23,x,22,12.5); cube(group,iron,18,7,23,x,-22,12.5);
    cube(group,iron,18,50,5,x,0,24);
    projected(group,boltFace,x-9,-24,x+9,24,26.55,boltUV);
    for(const y of [-21,21]) nail(group,x,y,27,2.5);
  }
  const sliding=new THREE.Group(); group.add(sliding);
  cube(sliding,steel,374,15.2,15.2,49,2.8,12.5);
  projected(sliding,steel,-137,-4.8,236,10.4,20.11,(x,y)=>[(x+137)/122,(y+4.8)/15.2]);
  tube(sliding,iron,[[-137,3,10],[-146,5,10],[-154,12,10],[-157,22,10],[-157,40,10]],6.5,30);
  ball(sliding,iron,12.6,-157,51.7,10);
  // notch next to the handle on the moving bar
  cube(sliding,iron,6,3,1,-120,9.8,18);
  const keeper=new THREE.Group(); group.add(keeper);
  cube(keeper,iron,29,79,4,0,0,0); for(const y of [-29,29]) nail(keeper,0,y,3,4.5);
  cube(keeper,iron,24,8,23,0,20,12.5); cube(keeper,iron,24,8,23,0,-20,12.5); cube(keeper,iron,24,45,5,0,0,24);
  keeper.position.x=208;
  return { group, sliding, keeper, setOpen(t){sliding.position.x=-105*Math.max(0,Math.min(1,t));} };
}
