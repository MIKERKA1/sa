import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {buildCaeciliaGabrielGeometry} from '../src/models/caecilia_gabriel_geometry.js';
import {frontZ,sdfGrad} from '../src/models/caecilia_gabriel_head.js';
import {CAECILIA_GABRIEL_GLB} from '../src/models/caecilia_gabriel_asset.gen.js';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url)),directory='assets/characters/caecilia_gabriel/v02/';
const bytes=read(directory+'caecilia_gabriel_v02.glb'),len=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+len)),start=28+len;
const sha=b=>createHash('sha256').update(b).digest('hex'),types={5123:Uint16Array,5125:Uint32Array,5126:Float32Array},widths={SCALAR:1,VEC2:2,VEC3:3};
function accessor(i){const a=json.accessors[i],v=json.bufferViews[a.bufferView],T=types[a.componentType],offset=start+(v.byteOffset||0)+(a.byteOffset||0),b=bytes.subarray(offset,offset+a.count*widths[a.type]*T.BYTES_PER_ELEMENT);return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}
const model=buildCaeciliaGabrielGeometry();
test('child GLB is valid, finite and self-contained',()=>{
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);assert.equal(json.buffers[0].byteLength,bytes.length-start);
 assert.equal(len%4,0);assert.ok(!json.buffers[0].uri);assert.equal(json.asset.version,'2.0');
 for(const view of json.bufferViews){assert.equal((view.byteOffset||0)%4,0);assert.ok(view.byteLength>0&&(view.byteOffset||0)+view.byteLength<=json.buffers[0].byteLength);}
 for(let i=0;i<json.accessors.length;i++)assert.ok(accessor(i).every(Number.isFinite),`accessor ${i}`);
 for(const image of json.images){assert.ok(!image.uri);const view=json.bufferViews[image.bufferView],o=start+view.byteOffset;assert.equal(bytes.subarray(o,o+8).toString('hex'),'89504e470d0a1a0a');}
 for(const mesh of json.meshes)for(const p of mesh.primitives){const pos=json.accessors[p.attributes.POSITION],ix=accessor(p.indices);assert.equal(ix.length%3,0);assert.ok(ix.every(i=>i<pos.count));assert.equal(json.accessors[p.attributes.NORMAL].count,pos.count);assert.equal(json.accessors[p.attributes.TEXCOORD_0].count,pos.count);}
 assert.equal(json.extras.staticPose,true);
});
test('export matches authored meshes, the approved source and embedded download bytes',()=>{
 const approval=JSON.parse(read('assets/concepts/characters/caecilia_gabriel_approval_v01.json')),manifest=JSON.parse(read(directory+'model-manifest.json'));
 assert.equal(sha(read('assets/concepts/characters/'+approval.concept)),approval.sha256);assert.equal(json.extras.conceptSHA256,approval.sha256);assert.equal(manifest.glbSHA256,sha(bytes));assert.equal(manifest.glbBytes,bytes.length);assert.ok(Buffer.from(CAECILIA_GABRIEL_GLB,'base64').equals(bytes));
 assert.equal(json.meshes.length,model.parts.length);
 for(const [i,part] of model.parts.entries()){
  const p=json.meshes[i].primitives[0],g=part.geometry;assert.equal(json.meshes[i].name,part.name);assert.deepEqual(accessor(p.attributes.POSITION),g.attributes.position.array);assert.deepEqual(accessor(p.attributes.NORMAL),g.attributes.normal.array);assert.deepEqual(accessor(p.indices),g.index.array);
  const uv=new Float32Array(g.attributes.uv.array);for(let j=1;j<uv.length;j+=2)uv[j]=1-uv[j];assert.deepEqual(accessor(p.attributes.TEXCOORD_0),uv);
 }
});
test('clothed silhouette follows the approved illustration and its 122 cm total height',()=>{
 const box=new THREE.Box3();for(const p of model.parts)box.union(p.geometry.boundingBox);
 assert.ok(Math.abs(box.max.y-box.min.y-1.22)<.004);
 const skirt=model.parts.find(p=>p.name==='dress-skirt').geometry.boundingBox,apron=model.parts.find(p=>p.name==='apron').geometry.boundingBox,head=model.parts.find(p=>p.name==='hair-cap').geometry.boundingBox;
 assert.ok(Math.abs(skirt.min.y-.292)<.003);assert.ok(Math.abs(apron.min.y-.353)<.004);assert.ok(apron.min.y-skirt.min.y>.05&&apron.min.y-skirt.min.y<.075);
 // v02: the hair has the drawn volume over the ears, so the head is wider than the bare v01 cap (18-19 cm on the sheet).
 assert.ok(head.max.x-head.min.x>.17&&head.max.x-head.min.x<.20);
 assert.ok(skirt.max.x-skirt.min.x>.39&&skirt.max.x-skirt.min.x<.44);
 for(const name of ['collar','apron-bow-knot','braid--1','braid-1','back-patch','hand--1','hand-1'])assert.ok(model.parts.some(p=>p.name===name),name);
});
test('neck is covered by the collar and both wrists join the clothed arms to the hands',()=>{
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 for(const s of [-1,1]){
  const meshes=[`hand-${s}`,`wrist-${s}`,`cuff-${s}`].map(name=>new THREE.Mesh(model.parts.find(p=>p.name===name).geometry,material));for(const m of meshes)m.updateMatrixWorld();
  for(let y=.598;y<=.624;y+=.002){const x=s*(.207-(y-.608)*.21),ray=new THREE.Raycaster(new THREE.Vector3(x,y,.20),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObjects(meshes).length>0,`wrist gap at ${y}, ${s}`);}
 }
 const collar=model.parts.find(p=>p.name==='collar').geometry.boundingBox,face=model.parts.find(p=>p.name==='face').geometry.boundingBox;assert.ok(collar.max.y>face.min.y+.04&&collar.min.y<1.0);
});
test('the sculpted head and neck have no holes or non-manifold seams',()=>{
 const g=model.parts.find(p=>p.name==='face').geometry,edges=new Map(),ix=g.index.array;
 for(let i=0;i<ix.length;i+=3)for(let k=0;k<3;k++){const a=ix[i+k],b=ix[i+(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);}
 assert.ok([...edges.values()].every(n=>n===2),'every skin edge has exactly two incident faces');
});
const part=name=>model.parts.find(p=>p.name===name),rayMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const meshOf=name=>{const m=new THREE.Mesh(part(name).geometry,rayMaterial);m.name=name;m.updateMatrixWorld();return m;};
test('the hair covers the skull from the parting to the plaits and leaves the face free',()=>{
 const hair=meshOf('hair-cap'),face=meshOf('face'),centre=new THREE.Vector3(0,1.10,-.008);
 const first=d=>new THREE.Raycaster(centre.clone().addScaledVector(d,.4),d.clone().negate()).intersectObjects([hair,face])[0]?.object.name;
 // Crown, sides above the ears and the back of the head.
 for(const elevation of [.25,.55,.85,1.15,1.45])for(let azimuth=-Math.PI;azimuth<Math.PI;azimuth+=Math.PI/12){
  if(elevation<.8&&Math.abs(azimuth)<1.25)continue; // forehead and temples below the hairline
  const d=new THREE.Vector3(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));
  assert.equal(first(d),'hair-cap',`bare scalp at elevation ${elevation}, azimuth ${azimuth.toFixed(2)}`);
 }
 // Eyes, nose, mouth, cheeks and the middle of the forehead.
 for(const [x,y] of [[0,1.15],[.03,1.093],[-.03,1.093],[0,1.07],[0,1.03],[.045,1.06],[-.045,1.06]]){
  const hit=new THREE.Raycaster(new THREE.Vector3(x,y,.4),new THREE.Vector3(0,0,-1)).intersectObjects([hair,face])[0];
  assert.equal(hit?.object.name,'face',`hair in front of the face at ${x}, ${y}`);
 }
 const g=part('hair-cap').geometry,box=g.boundingBox;
 assert.ok(box.max.y>1.216&&box.max.y<1.224,'crown height');assert.ok(Math.abs(box.max.x+box.min.x)<.001,'hair is symmetric about the parting');
});
test('each plait hangs from behind the ear, rests in front of the shoulder and ends in a ribbon at collar level',()=>{
 const body=[meshOf('bodice'),meshOf('collar')];
 for(const s of [-1,1]){
  const braid=part(`braid-${s}`).geometry,box=braid.boundingBox,p=braid.attributes.position,mesh=meshOf(`braid-${s}`);
  assert.ok(box.max.y>1.035&&box.max.y<1.06&&box.min.y>.94&&box.min.y<.97,`plait ${s} height range`);
  assert.ok(box.max.x-box.min.x>.018&&box.max.x-box.min.x<.036,`plait ${s} width`);
  // Seen from the front the plait is never hidden inside the bodice or the collar.
  let checked=0;
  for(let i=0;i<p.count;i+=97){const y=p.getY(i);if(y>.985)continue;
   const hit=new THREE.Raycaster(new THREE.Vector3(p.getX(i),y,.4),new THREE.Vector3(0,0,-1)).intersectObjects([mesh,...body])[0];
   assert.equal(hit.object.name,`braid-${s}`,`plait ${s} sinks into the dress at y ${y.toFixed(3)}`);checked++;}
  assert.ok(checked>8);
  const knot=part(`hair-bow-knot-${s}`).geometry.boundingBox,collar=part('collar').geometry.boundingBox;
  assert.ok(knot.min.y>collar.min.y-.02&&knot.max.y<collar.max.y,`ribbon ${s} sits at collar level`);
  assert.ok(part(`braid-tail-${s}`).geometry.boundingBox.min.y<knot.min.y-.03,`loose end below ribbon ${s}`);
 }
});
test('garment details follow the approved sheet',()=>{
 // Five placket buttons, each a disc with a rim; one button on the outer back of each cuff.
 assert.equal(part('bodice-buttons').geometry.attributes.position.count,5*(23*11+7*23));
 for(const s of [-1,1]){const button=part(`cuff-button-${s}`).geometry.boundingBox,cuff=part(`cuff-${s}`).geometry.boundingBox,cx=(button.min.x+button.max.x)/2,cz=(button.min.z+button.max.z)/2;
  assert.ok(s*cx>s*(cuff.min.x+cuff.max.x)/2,`cuff button ${s} faces outwards`);assert.ok(cz<(cuff.min.z+cuff.max.z)/2,`cuff button ${s} is on the back of the wrist`);}
 // The darned patch is on the wearer's right at the back of the skirt.
 const patch=part('back-patch').geometry.boundingBox;assert.ok(patch.max.x<0&&patch.max.z<0&&patch.min.y>.34&&patch.max.y<.41);
 const collar=part('collar').geometry.boundingBox;assert.ok(collar.max.x-collar.min.x>.13&&collar.max.x-collar.min.x<.17,'collar width');
 const band=part('waistband').geometry.boundingBox;assert.ok(band.max.y-band.min.y>.03&&band.max.y-band.min.y<.04,'apron band height');
 for(const s of [-1,1]){
  const sole=part(`boot-sole-${s}`).geometry.boundingBox,upper=part(`boot-upper-${s}`).geometry.boundingBox;
  assert.ok(Math.abs(sole.min.y-.001)<1e-6,'sole stands on the ground');assert.ok(upper.max.y>.118&&upper.max.y<.128,'12 cm boot');
  assert.ok(sole.max.z-sole.min.z>.19&&sole.max.z-sole.min.z<.21,'20 cm sole');assert.ok(sole.max.y>.017&&sole.max.y<.021,'low stacked heel');
  assert.equal(part(`boot-eyelets-${s}`).geometry.attributes.position.count,10*6*13,'five eyelet pairs');
 }
});
test('authored meshes are clean and stay within the v01 triangle budget',()=>{
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),f=new THREE.Vector3(),n=new THREE.Vector3(),sum=new THREE.Vector3();let triangles=0;
 for(const p of model.parts){
  const g=p.geometry,pos=g.attributes.position,normal=g.attributes.normal,ix=g.index.array;let flipped=0;triangles+=ix.length/3;
  for(let i=0;i<normal.count;i++)assert.ok(Math.abs(n.fromBufferAttribute(normal,i).length()-1)<.02,`${p.name}: normal ${i} is not unit length`);
  for(let i=0;i<ix.length;i+=3){a.fromBufferAttribute(pos,ix[i]);b.fromBufferAttribute(pos,ix[i+1]);c.fromBufferAttribute(pos,ix[i+2]);f.crossVectors(b.sub(a),c.sub(a));if(f.length()<1e-13)continue;
   sum.set(0,0,0);for(let k=0;k<3;k++)sum.add(n.fromBufferAttribute(normal,ix[i+k]));if(f.dot(sum)<0)flipped++;}
  assert.ok(flipped<=ix.length/3*.01,`${p.name}: ${flipped} faces wound against their normals`);
 }
 assert.ok(triangles<=500000,`${triangles} triangles`);
});

test('the nose bridge blends into the forehead without a surface step',()=>{
 for(const x of [-.006,0,.006]){
  let previous=frontZ(x,1.1118);
  for(let y=1.112;y<=1.122;y+=.0002){
   const z=frontZ(x,y);
   assert.ok(Number.isFinite(z)&&Math.abs(z-previous)<.0003,`bridge step at ${x}, ${y}`);
   assert.ok(sdfGrad(x,y,z)[2]>.7,`bridge normal at ${x}, ${y}`);
   previous=z;
  }
 }
});
