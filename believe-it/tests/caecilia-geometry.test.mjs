import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildCaeciliaGeometry} from '../src/models/caecilia_geometry.js';

const model=buildCaeciliaGeometry();
const parts=new Map(model.parts.map(p=>[p.name,p]));
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const mesh=name=>{
  const object=new THREE.Mesh(parts.get(name).geometry,material);
  object.name=name;object.updateMatrixWorld(true);return object;
};

test('Caecilia has finite, indexed geometry with usable normals and UVs',()=>{
  assert.equal(parts.size,model.parts.length,'part names must be unique');
  const bounds=new THREE.Box3();
  for(const part of model.parts){
    const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    assert.ok(p.count>0,part.name);
    assert.equal(n.count,p.count,part.name);assert.equal(uv.count,p.count,part.name);
    for(const a of [p,n,uv])assert.ok(a.array.every(Number.isFinite),part.name);
    assert.ok(g.index&&g.index.count%3===0,part.name);
    assert.ok(g.index.array.every(i=>i>=0&&i<p.count),part.name);
    for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-4,part.name);
    g.computeBoundingBox();bounds.union(g.boundingBox);
  }
  const size=bounds.getSize(new THREE.Vector3());
  assert.ok(size.y>1.5&&size.y<1.65,'model uses metres');
  assert.ok(size.x>.4&&size.x<.8,'complete standing silhouette');
  assert.ok(bounds.min.y>=0,'boots do not sink below the floor');
});

test('each bodice button sits in front of its fabric and above the apron belt',()=>{
  const button=mesh('bodice-buttons'),fabric=[mesh('bodice'),mesh('front-placket')];
  const p=button.geometry.attributes.position;
  const vertices=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i)).sort((a,b)=>a.y-b.y);
  const clusters=[];
  for(const v of vertices){
    if(!clusters.length||v.y-clusters.at(-1).max.y>.012)clusters.push(new THREE.Box3());
    clusters.at(-1).expandByPoint(v);
  }
  assert.equal(clusters.length,8,'eight separate closures');
  const beltTop=parts.get('waistband').geometry.boundingBox.max.y;
  for(const [i,box] of clusters.entries()){
    const center=box.getCenter(new THREE.Vector3());
    assert.ok(box.min.y>beltTop,`button ${i+1} must not appear on the linen belt`);
    const ray=new THREE.Raycaster(new THREE.Vector3(center.x,center.y,.5),new THREE.Vector3(0,0,-1));
    assert.equal(ray.intersectObjects([button,...fabric],false)[0]?.object.name,'bodice-buttons',`button ${i+1} is buried in the placket`);
  }
});

test('waistband covers the upper apron and bodice around the waist',()=>{
  const objects=['waistband','bodice','dress-skirt','apron'].map(mesh);
  for(const y of [1.023,1.027,1.031])for(let i=0;i<48;i++){
    const angle=i/48*Math.PI*2,radial=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
    const ray=new THREE.Raycaster(radial.clone().multiplyScalar(.5).setY(y),radial.clone().negate());
    assert.equal(ray.intersectObjects(objects,false)[0]?.object.name,'waistband',`fabric pierces belt at height ${y}, sample ${i}`);
  }
});

test('fine hair follows the head surface instead of floating above the forehead',()=>{
  const head=mesh('face'),strands=parts.get('hair-strands').geometry.attributes.position;
  let visible=0,maxGap=0;
  for(let i=0;i<strands.count;i+=11){
    const x=strands.getX(i),y=strands.getY(i),z=strands.getZ(i);
    const hit=new THREE.Raycaster(new THREE.Vector3(x,y,.5),new THREE.Vector3(0,0,-1)).intersectObject(head,false)[0];
    if(hit){visible++;maxGap=Math.max(maxGap,z-hit.point.z);}
  }
  assert.ok(visible>100);
  assert.ok(maxGap<.002,`hair floats ${(maxGap*1000).toFixed(1)} mm above the head`);
});
