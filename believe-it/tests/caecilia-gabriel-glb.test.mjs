import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {buildCaeciliaGabrielGeometry} from '../src/models/caecilia_gabriel_geometry.js';
import {frontZ,sdfGrad} from '../src/models/caecilia_gabriel_head.js';
import {CAECILIA_GABRIEL_GLB} from '../src/models/caecilia_gabriel_asset.gen.js';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url)),directory='assets/characters/caecilia_gabriel/v01/';
const bytes=read(directory+'caecilia_gabriel_v01.glb'),len=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+len)),start=28+len;
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
 assert.ok(head.max.x-head.min.x>.14&&head.max.x-head.min.x<.17);
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
test('the hair crown closes as a rounded dome without an upright stem',()=>{
 const g=model.parts.find(p=>p.name==='hair-cap').geometry,p=g.attributes.position,n=g.attributes.normal;
 let samples=0;
 for(let i=0;i<p.count;i++)if(p.getY(i)>1.219){
  assert.ok(n.getY(i)>.5,`crown normal ${i} points sideways or is missing`);samples++;
 }
 assert.ok(samples>100);
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
