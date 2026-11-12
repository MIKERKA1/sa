// Build a standard self-contained glTF 2 binary from the authored Three.js meshes.
// No renderer, external services, or installations are used by this bake.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildCaeciliaGeometry} from '../src/models/caecilia_geometry.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'assets/characters/caecilia/v06');
const textures=JSON.parse(await fs.readFile(path.join(dir,'textures.json'),'utf8'));
const model=buildCaeciliaGeometry();
const gltf={asset:{version:'2.0',generator:'Believe It — caecilia_bake.mjs'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Caecilia_Gruber',children:[],extras:model.metadata}],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[],images:[],textures:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497},{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}]};
const chunks=[];let offset=0;
function bytes(buffer,target) {
  const data=Buffer.from(buffer),padding=(4-data.length%4)%4;
  const index=gltf.bufferViews.length;
  gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,...(target?{target}:{})});
  chunks.push(data,Buffer.alloc(padding));offset+=data.length+padding;
  return index;
}
function attribute(array,size,type,position=false) {
  const view=bytes(Buffer.from(array.buffer,array.byteOffset,array.byteLength),type===5126?34962:34963);
  const accessor={bufferView:view,componentType:type,count:array.length/size,type:({1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'})[size]};
  if(position) {
    accessor.min=Array(size).fill(Infinity);accessor.max=Array(size).fill(-Infinity);
    for(let i=0;i<array.length;i++) {const k=i%size;accessor.min[k]=Math.min(accessor.min[k],array[i]);accessor.max[k]=Math.max(accessor.max[k],array[i]);}
  }
  gltf.accessors.push(accessor);return gltf.accessors.length-1;
}
const imageIds=new Map();
async function image(file,clamped=false) {
  const key=file+':'+clamped;
  if(imageIds.has(key))return imageIds.get(key);
  const img=gltf.images.length;
  gltf.images.push({bufferView:bytes(await fs.readFile(path.join(dir,file))),mimeType:'image/png',name:file});
  const id=gltf.textures.length;
  gltf.textures.push({source:img,sampler:clamped?1:0});imageIds.set(key,id);return id;
}
const colors={button:[.14,.12,.1,1],sole:[.095,.082,.07,1],lace:[.13,.105,.08,1],metal:[.14,.13,.11,1],stitch:[.35,.28,.2,1],nail:[.48,.34,.28,1],'skin-dark':[.38,.26,.21,1],'hair-grey':[.46,.435,.39,1]};
const mats=new Map();
async function material(id,doubleSided=false) {
  const key=id+':'+doubleSided;
  if(mats.has(key))return mats.get(key);
  const cfg=textures.materials[id],m={name:id,pbrMetallicRoughness:{metallicFactor:id==='metal'?.55:0,roughnessFactor:cfg?.roughness??.8},doubleSided};
  if(cfg) {
    m.pbrMetallicRoughness.baseColorTexture={index:await image(cfg.albedo,id==='face')};
    m.normalTexture={index:await image(cfg.nmap,id==='face'),scale:id==='face'?1:id==='eye'?.3:.65};
  } else m.pbrMetallicRoughness.baseColorFactor=colors[id]??[.5,.5,.5,1];
  const index=gltf.materials.length;gltf.materials.push(m);mats.set(key,index);return index;
}
let triangles=0,vertices=0;
const parts=[];
for(const part of model.parts) {
  const g=part.geometry,pos=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(const a of [pos,n,uv]) if(!a.array.every(Number.isFinite))throw Error(`${part.name}: non-finite attribute`);
  // Source meshes use Three's conventional v-up textures. GLTF image rows are v-down.
  const coords=new Float32Array(uv.array);
  for(let i=1;i<coords.length;i+=2)coords[i]=1-coords[i];
  const primitive={attributes:{POSITION:attribute(pos.array,3,5126,true),NORMAL:attribute(n.array,3,5126),TEXCOORD_0:attribute(coords,2,5126)},material:await material(part.material,part.doubleSided)};
  if(g.index)primitive.indices=attribute(g.index.array,1,g.index.array instanceof Uint32Array?5125:5123);
  const mesh=gltf.meshes.length;gltf.meshes.push({name:part.name,primitives:[primitive]});
  gltf.nodes[0].children.push(gltf.nodes.length);gltf.nodes.push({name:part.name,mesh});
  const tris=(g.index?.count??pos.count)/3;triangles+=tris;vertices+=pos.count;
  parts.push({name:part.name,material:part.material,triangles:tris,vertices:pos.count,bounds:{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()}});
}
gltf.buffers=[{byteLength:offset}];
gltf.extras={conceptSHA256:textures.sourceSHA256,modelVersion:6,staticPose:true};
const json=Buffer.from(JSON.stringify(gltf));
const paddedJson=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
const bin=Buffer.concat(chunks),size=12+8+paddedJson.length+8+bin.length;
const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(size,8);
jh.writeUInt32LE(paddedJson.length,0);jh.writeUInt32LE(0x4e4f534a,4);
bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
const glb=Buffer.concat([header,jh,paddedJson,bh,bin]);
await fs.writeFile(path.join(dir,'caecilia_gruber_v06.glb'),glb);
const preview=await fs.readFile(path.join(dir,'concept-preview.webp'));
await fs.writeFile(path.join(root,'src/models/caecilia_asset.gen.js'),`// Generated by tools/caecilia_bake.mjs; source: approved concept + authored geometry.\nexport const CAECILIA_GLB='${glb.toString('base64')}';\nexport const CAECILIA_CONCEPT='data:image/webp;base64,${preview.toString('base64')}';\n`);
const report={conceptSHA256:textures.sourceSHA256,glbSHA256:crypto.createHash('sha256').update(glb).digest('hex'),glbBytes:glb.length,triangles,vertices,parts};
await fs.writeFile(path.join(dir,'model-manifest.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({parts:parts.length,triangles,vertices,glbBytes:glb.length,sha256:report.glbSHA256}));
