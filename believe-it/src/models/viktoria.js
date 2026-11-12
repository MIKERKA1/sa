// Load the exact exported GLB and adapt it to Believe It's shared renderer.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ps1Material} from '../engine/ps1.js';
import {setHiTex,TEX_OPT} from '../engine/util.js';
import {VIKTORIA_GLB,VIKTORIA_CONCEPT} from './viktoria_asset.gen.js';

export {VIKTORIA_CONCEPT};
function decode(s) {const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}

function texturePair(hi) {
  const im=hi.image,w=128,h=Math.max(16,Math.round(w*im.height/im.width)),canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(im,0,0,w,h);
  const d=ctx.getImageData(0,0,w,h).data;
  const lo=new THREE.DataTexture(d,w,h,THREE.RGBAFormat);
  lo.flipY=false;lo.wrapS=hi.wrapS;lo.wrapT=hi.wrapT;lo.magFilter=THREE.NearestFilter;lo.minFilter=THREE.NearestFilter;
  lo.generateMipmaps=false;lo.colorSpace=THREE.NoColorSpace;lo.needsUpdate=true;lo.userData.pc={w,h,d};
  hi.colorSpace=THREE.NoColorSpace;hi.magFilter=THREE.LinearFilter;hi.minFilter=THREE.LinearMipmapLinearFilter;
  hi.generateMipmaps=true;hi.anisotropy=TEX_OPT.aniso;hi.needsUpdate=true;
  setHiTex(lo,()=>hi);return lo;
}

export async function makeViktoria() {
  const bytes=decode(VIKTORIA_GLB);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');
  const group=gltf.scene,materials=new Map(),pairs=new Map(),meshes=[],original=new Map();
  const convert=m=> {
    if(materials.has(m))return materials.get(m);
    let map=null;
    if(m.map) {if(!pairs.has(m.map))pairs.set(m.map,texturePair(m.map));map=pairs.get(m.map);}
    if(m.normalMap){m.normalMap.colorSpace=THREE.NoColorSpace;m.normalMap.anisotropy=TEX_OPT.aniso;}
    const result=ps1Material({map,tint:[m.color.r,m.color.g,m.color.b],nmap:m.normalMap??null,nrm:m.normalScale?.x??.5,vertexColors:false,side:m.side,spec:['face','skin','ear','hair','hair-scalp','hair-fine'].includes(m.name)?.004:m.name==='metal'?.18:m.name==='eye'?.025:.012,gloss:1-m.roughness,metal:m.metalness,fog:0});
    result.name=m.name;materials.set(m,result);return result;
  };
  group.traverse(o=>{if(o.isMesh){
    o.material=convert(o.material);
    // Submillimetre strands are smaller than a shadow texel. The underlying
    // scalp casts their silhouette; separate strand casters produced a grid.
    if(!['hair-swept-locks','hair-fine-strands','hairline-wisps','temple-flyaways'].includes(o.name))o.layers.enable(1);
    meshes.push(o);original.set(o,o.material);
  }});
  const wire=ps1Material({tint:[.61,.78,.85],vertexColors:false,line:true,fog:0});wire.wireframe=true;
  const bounds=new THREE.Box3().setFromObject(group);
  return {group,meshes,bounds,bytes,metadata:gltf.parser.json.extras,
    setWire(on){for(const m of meshes)m.material=on?wire:original.get(m);},
    info(){return {parts:meshes.length,triangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};},
  };
}
