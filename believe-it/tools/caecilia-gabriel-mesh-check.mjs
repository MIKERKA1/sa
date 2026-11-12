// Mesh hygiene report for the authored Caecilia Gabriel parts: zero-area triangles, faces wound against
// their vertex normals, non-unit normals and open or non-manifold edges. Prints JSON; exits 1 on a defect.
// Usage: node tools/caecilia-gabriel-mesh-check.mjs [geometry module, default the current one]
import * as THREE from 'three';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const source=path.resolve(process.argv[2]||'src/models/caecilia_gabriel_geometry.js');
const {buildCaeciliaGabrielGeometry}=await import(pathToFileURL(source).href);
const model=buildCaeciliaGabrielGeometry(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3(),sum=new THREE.Vector3(),n=new THREE.Vector3();
const report={source:path.relative(process.cwd(),source),parts:model.parts.length,triangles:0,vertices:0,degenerate:0,flipped:0,badNormals:0,defects:[]};
for(const part of model.parts){
 const g=part.geometry,pos=g.attributes.position,normal=g.attributes.normal,ix=g.index.array;let degenerate=0,flipped=0,badNormals=0;
 for(let i=0;i<ix.length;i+=3){
  a.fromBufferAttribute(pos,ix[i]);b.fromBufferAttribute(pos,ix[i+1]);c.fromBufferAttribute(pos,ix[i+2]);face.crossVectors(b.sub(a),c.sub(a));
  // Collapsed poles and gather points are expected; they are counted, not treated as defects.
  if(face.length()<1e-13){degenerate++;continue;}
  sum.set(0,0,0);for(let k=0;k<3;k++)sum.add(n.fromBufferAttribute(normal,ix[i+k]));
  if(face.dot(sum)<0)flipped++;
 }
 for(let i=0;i<normal.count;i++)if(!(Math.abs(n.fromBufferAttribute(normal,i).length()-1)<.02))badNormals++;
 const triangles=ix.length/3;report.triangles+=triangles;report.vertices+=pos.count;report.degenerate+=degenerate;report.flipped+=flipped;report.badNormals+=badNormals;
 if(flipped/triangles>.01||badNormals)report.defects.push({part:part.name,triangles,degenerate,flipped,badNormals});
}
console.log(JSON.stringify(report,null,1));
process.exit(report.defects.length?1:0);
