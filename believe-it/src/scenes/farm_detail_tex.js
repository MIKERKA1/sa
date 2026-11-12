import * as THREE from 'three';
import { PixelCanvas, valueNoise, rng, setHiTex, hiTexture } from '../engine/util.js';

// Soft-edged dirt is a decal, not a dark rectangular plane. Both graphics modes use the same alpha.
export function wearTexture() {
  const pc=new PixelCanvas(128,128),noise=valueNoise(9114,16,16),fine=valueNoise(9115,64,64);
  pc.each((x,y)=>{
    const u=(x+.5)/128,v=(y+.5)/128;
    const edge=Math.max(0,1-((u-.5)*2)**2-((v-.5)*2)**2);
    const n=noise(u*16,v*16),f=fine(u*64,v*64);
    pc.set(x,y,[58+f*10,48+f*9,37+f*7],Math.round(edge*edge*(.13+n*.56)*255));
  });
  const tex=pc.texture(false);setHiTex(tex,()=>hiTexture(pc,false));return tex;
}

// Fine glaze, restrained cobalt bands and crazing for everyday pottery; geometry supplies the rim and thickness.
export function glazeTwin(lo,stoneware=false) {
  setHiTex(lo,()=>{
    const pc=new PixelCanvas(384,384),n=valueNoise(stoneware?9123:9122,32,32),r=rng(9124);
    pc.each((x,y)=>{
      const u=(x+.5)/384,v=(y+.5)/384,f=n(u*32,v*32),k=.94+f*.07;
      const c=(stoneware?[171,173,166]:[222,218,205]).map(a=>a*k);
      const band=Math.abs(v-.96)<.012 || Math.abs(v-.12)<.009;
      const leaf=Math.sin(u*Math.PI*32+Math.sin(v*75)*1.3)>.90 && v>.76 && v<.86;
      if(band||leaf)for(let i=0;i<3;i++)c[i]=[57,76,104][i]*(.88+f*.17);
      const crack=Math.abs(Math.sin((u+Math.sin(v*16)*.015)*Math.PI*26))<.012 && f>.52;
      if(crack)for(let i=0;i<3;i++)c[i]*=.83;
      pc.set(x,y,c.map(a=>a+(r()-.5)*2));
    });
    const tex=hiTexture(pc,true),data=new Uint8Array(384*384*4);
    for(let i=0;i<384*384;i++){data[i*4]=128;data[i*4+1]=128;data[i*4+2]=255;data[i*4+3]=175;}
    const normal=new THREE.DataTexture(data,384,384,THREE.RGBAFormat);
    normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.magFilter=THREE.LinearFilter;
    normal.minFilter=THREE.LinearMipmapLinearFilter;normal.generateMipmaps=true;normal.needsUpdate=true;
    tex.userData={nmap:normal,spec:.22,gloss:.66,metal:0,tile:1};return tex;
  });return lo;
}
