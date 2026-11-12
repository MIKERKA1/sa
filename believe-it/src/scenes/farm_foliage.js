import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PixelCanvas, rng, setHiTex, hiTexture } from '../engine/util.js';
import { prep } from './farm_kit.js';
import { ps1Material } from '../engine/ps1.js';

function boughTexture(){
  const pc=new PixelCanvas(256,128),rr=rng(9234);pc.each((x,y)=>pc.alpha(x,y,0));
  const line=(x0,y0,x1,y1,col,th=0)=>{
    const n=Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0)));
    for(let j=0;j<=n;j++)for(let a=-th;a<=th;a++)for(let b=-th;b<=th;b++){
      const x=Math.round(x0+(x1-x0)*j/n)+a,y=Math.round(y0+(y1-y0)*j/n)+b;
      if(x>=0&&x<256&&y>=0&&y<128)pc.set(x,y,col,255);
    }
  };
  line(4,64,250,62,[77,68,50],1);
  for(let i=0;i<30;i++){
    const x=12+i*7.7,len=9+(1-x/256)*43;
    for(const s of [-1,1]){
      const ex=x+14+rr()*15,ey=64+s*len;
      line(x,64,ex,ey,[56,65,48]);
      for(let j=0;j<14;j++){
        const t=j/14,px=x+(ex-x)*t,py=64+(ey-64)*t,h=4+rr()*7;
        const c=[42+rr()*24,59+rr()*25,43+rr()*19];
        line(px,py,px+7,py-s*h,c);
        line(px,py,px-4,py+s*h,c);
      }
    }
  }
  const t=pc.texture(false);setHiTex(t,()=>hiTexture(pc,false));return t;
}

// Two bent cards per bough, grouped into one draw call. No opaque triangle skirts between branches.
export function spruceFoliage(records){
  const geometries=[],texture=boughTexture();
  const mat=ps1Material({map:texture,side:THREE.DoubleSide,alphaCut:.4,ao:1,snow:.42});
  const rr=rng(9235);
  for(const {x,z,s,y,seed} of records){
    const r=rng(seed),layers=s<.6?7:11;
    for(let j=0;j<layers;j++){
      const t=j/(layers-1),height=(1.45+t*5.6)*s;
      const rad=(1.82*(1-t)+.09)*s*(.9+r()*.16),count=j===layers-1?3:6;
      for(let i=0;i<count;i++){
        const yaw=i*Math.PI*2/count+j*1.4+r()*.36,len=rad*(.80+r()*.35),width=len*.49;
        for(let k=0;k<2;k++){
          const geo=new THREE.PlaneGeometry(len,width,3,1);geo.translate(len/2,0,0);
          if(k===0)geo.rotateX(-Math.PI/2);
          const p=geo.attributes.position;
          for(let v=0;v<p.count;v++){
            const u=p.getX(v)/len,sag=-Math.sin(u*Math.PI)*len*.12+u*len*.045;
            p.setY(v,p.getY(v)+sag);
          }
          geo.computeVertexNormals();
          const tint=.79+r()*.22;
          geometries.push(prep(geo,{pos:[x,y+height+(r()-.5)*s*.05,z],rot:[0,yaw,0],smooth:true,uv:'keep',col:[tint,tint*.99,tint*.91]}));
        }
      }
    }
  }
  const mesh=new THREE.Mesh(mergeGeometries(geometries),mat);mesh.name='Detailed spruce boughs';
  mesh.frustumCulled=false;
  // Alpha cards do not enter the opaque depth-only shadow pass (which would cast rectangular shadows).
  return {mesh,mat,trees:records.length};
}
