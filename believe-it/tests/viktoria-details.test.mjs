import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildViktoriaGeometry} from '../src/models/viktoria_geometry.js';
import {EYE,frontZ,buildEyeGeometry} from '../src/models/viktoria_head.js';
import {hairlineHeight} from '../src/models/viktoria_details.js';

let model;
const currentModel=()=>model??=buildViktoriaGeometry();

test('eyelids cover the top and bottom of the iris while leaving the pupil visible',()=>{
  const globeFront=(x,y)=>EYE.z+Math.sqrt(Math.max(0,EYE.r**2-(x-EYE.x)**2-(y-EYE.y)**2));
  for(const dy of [-.007,.007])assert.ok(frontZ(EYE.x,EYE.y+dy)>globeFront(EYE.x,EYE.y+dy),'skin covers globe above and below opening');
  assert.ok(frontZ(EYE.x,EYE.y)<globeFront(EYE.x,EYE.y),'pupil is not buried under the skin');
});

test('ears face outward and the revised silhouette exposes the lobe below the hair',()=>{
  const model=currentModel(),find=n=>model.parts.find(p=>p.name===n).geometry;
  const face=new THREE.Mesh(find('face'),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const hair=new THREE.Mesh(find('hair-shell'),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  face.updateMatrixWorld();hair.updateMatrixWorld();
  for(const side of [-1,1]){
    const g=find(`ear-${side}`),p=g.attributes.position,n=g.attributes.normal;
    assert.ok(p.array.every(Number.isFinite)&&n.array.every(Number.isFinite));
    for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-4,'ear has no zero normals at the pole or rim');
    const outward=[];
    for(let i=0;i<p.count;i++)if(side*p.getX(i)>.078*1.035&&Math.abs(p.getY(i)/1.035-1.424)<.010)outward.push(side*n.getX(i));
    assert.ok(outward.length>0&&outward.reduce((a,b)=>a+b,0)/outward.length>.35,'pinna normals face the viewer from the side');
    const ear=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.FrontSide}));ear.updateMatrixWorld();
    for(const y of [1.408,1.414,1.424,1.437]){
      const ray=new THREE.Raycaster(new THREE.Vector3(side*.20,y*1.035,-.028*1.035),new THREE.Vector3(-side,0,0));
      const hits=ray.intersectObjects([ear,face,hair]);
      assert.equal(hits[0]?.object,ear,`ear visible at ${y}, side ${side}`);
    }
  }
});

test('corneal bulge stays within the upper lid profile',()=>{
  for(const side of [-1,1]){
    const eye=buildEyeGeometry(side),p=eye.attributes.position;
    let apex=-Infinity;for(let i=0;i<p.count;i++)apex=Math.max(apex,p.getZ(i));
    const upperLid=frontZ(side*EYE.x,EYE.y+.007);
    assert.ok(Number.isFinite(upperLid));
    assert.ok(apex-upperLid<.0009,'the cornea must not stand several millimetres ahead of the eyelid');
  }
});

test('rendered eye opening arches over the pupil and closes over the corners',()=>{
  const model=currentModel(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const mesh=name=>new THREE.Mesh(model.parts.find(p=>p.name===name).geometry,material);
  const face=mesh('face');face.updateMatrixWorld();
  for(const side of [-1,1]){
    const eye=mesh(`eye-${side}`);eye.updateMatrixWorld();
    const cast=(dx,dy)=>new THREE.Raycaster(new THREE.Vector3(side*(EYE.x+dx)*1.035,(EYE.y+dy)*1.035,.2),new THREE.Vector3(0,0,-1)).intersectObjects([face,eye])[0];
    assert.ok(cast(0,0)?.object===eye,'the pupil remains visible');
    assert.ok(cast(0,.0025)?.object===eye,'the upper arc opens above the pupil');
    for(const dx of [-.011,.011])assert.ok(cast(dx,.0025)?.object===face,'the upper lid descends toward each canthus');
    const tear=cast(-.0138,-.0028);
    assert.ok(tear?.object===face,'the medial canthus is part of the continuous skin');
    assert.ok(tear.point.z/1.035>EYE.z+.009,'tear tissue fills the deep dark gap beside the globe');
  }
});

test('refined face has finite unit normals, nondegenerate triangles and closed shared edges',()=>{
  const g=currentModel().parts.find(p=>p.name==='face').geometry,p=g.attributes.position,n=g.attributes.normal,ix=g.index.array;
  const edges=new Map(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-4);
  for(let i=0;i<ix.length;i+=3){
    a.fromBufferAttribute(p,ix[i]);b.fromBufferAttribute(p,ix[i+1]);c.fromBufferAttribute(p,ix[i+2]);
    assert.ok(b.sub(a).cross(c.sub(a)).length()*.5>1e-14,'refinement must not collapse a triangle');
    for(let j=0;j<3;j++){const x=ix[i+j],y=ix[i+(j+1)%3],key=x<y?`${x}:${y}`:`${y}:${x}`;edges.set(key,(edges.get(key)??0)+1);}
  }
  for(const count of edges.values())assert.equal(count,2,'no cracks or unmatched edges at the refinement boundary');
});

test('front hairline stays above the skin without a raised shell edge',()=>{
  const parts=currentModel().parts,find=name=>parts.find(p=>p.name===name).geometry;
  const face=new THREE.Mesh(find('face'),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));face.updateMatrixWorld();
  const hair=find('hair-shell'),p=hair.attributes.position,uv=hair.attributes.uv;
  const center=new THREE.Vector3(0,1.452,-.004).multiplyScalar(1.035),point=new THREE.Vector3();
  let samples=0;
  for(let i=0;i<p.count;i++)if(uv.getY(i)===0&&Math.abs((uv.getX(i)-.5)*2*Math.PI)<2.05){
    point.fromBufferAttribute(p,i);
    const direction=point.clone().sub(center).normalize();
    const hit=new THREE.Raycaster(point.clone().addScaledVector(direction,.01),direction.negate()).intersectObject(face)[0];
    assert.ok(hit,'the visible hair edge has skin beneath it');
    const gap=hit.distance-.01;
    assert.ok(gap>0&&gap<.0006,`hairline gap ${gap} must remain below 0.6 mm`);samples++;
  }
  assert.ok(samples>100,'sample the forehead, both temples and the edge above both ears');
});

test('temple hairline sweeps down behind the ear without a scalloped rise',()=>{
  for(let a=1.15;a<2.2;a+=.01){
    assert.ok(hairlineHeight(a+.01)<hairlineHeight(a),'no reversal in the temple contour');
    assert.equal(hairlineHeight(a),hairlineHeight(-a),'both sides share the contour');
  }
});

test('fine hair strands narrow to finite tips on both temples and hairline',()=>{
  for(const name of ['hair-fine-strands','hairline-wisps','temple-flyaways']){
    const g=currentModel().parts.find(p=>p.name===name)?.geometry;assert.ok(g,name);
    const p=g.attributes.position,uv=g.attributes.uv,n=g.attributes.normal,roots=[],tips=[];
    assert.ok(p.array.every(Number.isFinite)&&n.array.every(Number.isFinite),name+' finite geometry');
    for(let i=0;i<p.count;i+=5)if(uv.getX(i)===0||uv.getX(i)===1){
      const center=new THREE.Vector3(),point=new THREE.Vector3();
      for(let k=0;k<4;k++)center.add(point.fromBufferAttribute(p,i+k));center.multiplyScalar(.25);
      const radius=point.fromBufferAttribute(p,i).distanceTo(center);
      (uv.getX(i)===0?roots:tips).push(radius);
    }
    assert.ok(roots.length>0&&roots.length===tips.length,name+' complete strands');
    for(let i=0;i<roots.length;i++)assert.ok(tips[i]>0&&tips[i]<roots[i]*.1,name+' tip is narrower than its root');
  }
});
