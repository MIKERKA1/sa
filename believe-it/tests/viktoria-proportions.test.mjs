import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildViktoriaGeometry} from '../src/models/viktoria_geometry.js';

const model=buildViktoriaGeometry();
const width=(names,y0,y1)=>{
  let lo=Infinity,hi=-Infinity;
  for(const part of model.parts.filter(p=>names.includes(p.name))){
    const p=part.geometry.attributes.position;
    for(let i=0;i<p.count;i++)if(p.getY(i)/1.035>=y0&&p.getY(i)/1.035<=y1){lo=Math.min(lo,p.getX(i));hi=Math.max(hi,p.getX(i));}
  }
  assert.ok(Number.isFinite(lo)&&Number.isFinite(hi));return hi-lo;
};

test('clothed proportions fit the concept silhouette relative to the preserved head',()=>{
  const face=model.parts.find(p=>p.name==='face').geometry.boundingBox,head=face.max.x-face.min.x;
  const shoulders=width(['bodice','vest','sleeve--1','sleeve-1'],1.265,1.305);
  const waist=width(['waistband','bodice','vest'],1.020,1.046);
  const bust=width(['bodice','vest'],1.200,1.240);
  const skirt=width(['dress-skirt'],.265,.30);
  assert.ok(shoulders/head<2.55,`shoulder/head width ${shoulders/head}`);
  assert.ok(waist/head<1.70,`waist/head width ${waist/head}`);
  assert.ok(skirt/head<3.05,`skirt/head width ${skirt/head}`);
  assert.ok(bust/waist>1.12&&bust/waist<1.32,'the clothed torso has a gentle waist-to-bust transition');
});

test('resized hands meet both forearms without a visible wrist gap',()=>{
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(const side of [-1,1]){
    const meshes=[`hand-${side}`,`forearm-${side}`].map(name=>new THREE.Mesh(model.parts.find(p=>p.name===name).geometry,material));
    for(const mesh of meshes)mesh.updateMatrixWorld();
    for(let y=.807;y<=.843;y+=.002){
      const ray=new THREE.Raycaster(new THREE.Vector3(side*.242*1.035,y*1.035,.2),new THREE.Vector3(0,0,-1));
      assert.ok(ray.intersectObjects(meshes).length>0,`missing wrist skin at ${y}, side ${side}`);
    }
  }
});
