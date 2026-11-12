// node tools/_hairflip.mjs — where are the hair triangles that face against their normals? (scratch)
import * as THREE from 'three';
import {buildCaeciliaGabrielGeometry} from '../src/models/caecilia_gabriel_geometry.js';
const g=buildCaeciliaGabrielGeometry().parts.find(p=>p.name==='hair-cap').geometry,pos=g.attributes.position,nor=g.attributes.normal,uv=g.attributes.uv,ix=g.index.array;
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),f=new THREE.Vector3(),n=new THREE.Vector3(),s=new THREE.Vector3(),bins={};
for(let i=0;i<ix.length;i+=3){a.fromBufferAttribute(pos,ix[i]);b.fromBufferAttribute(pos,ix[i+1]);c.fromBufferAttribute(pos,ix[i+2]);f.crossVectors(b.clone().sub(a),c.clone().sub(a));if(f.length()<1e-13)continue;
 s.set(0,0,0);for(let k=0;k<3;k++)s.add(n.fromBufferAttribute(nor,ix[i+k]));if(f.dot(s)>=0)continue;
 const key=`t${(uv.getX(ix[i])/9).toFixed(1)} v${(uv.getY(ix[i])/1.7).toFixed(1)}`;bins[key]=(bins[key]||0)+1;}
console.log(JSON.stringify(bins));
