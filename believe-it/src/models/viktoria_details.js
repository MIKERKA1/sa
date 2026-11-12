// v10: tapered hair edges and attached pinnae. Units match the unscaled head (metres).
import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {profile} from './viktoria_head.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z), PI=Math.PI;
const mix=(a,b,t)=>a+(b-a)*t;
const clamp=x=>Math.max(0,Math.min(1,x));
const bell=(x,w)=>Math.exp(-((x/w)**2));
export const HAIRLINE=[[0,1.518],[.25,1.520],[.5,1.514],[.9,1.495],[1.15,1.480],[1.4,1.467],[1.62,1.456],[1.8,1.453],[2.2,1.410],[PI,1.386]];
const TEMPLE_HAIRLINE=HAIRLINE.slice(0,8);
export function hairlineHeight(a){
  a=Math.abs(a);
  if(a<1.8)return profile(TEMPLE_HAIRLINE,a)[0];
  // Preserve the existing nape contour and its neck texture mask.
  for(let i=8;i<HAIRLINE.length;i++)if(a<=HAIRLINE[i][0]){
    const t=clamp((a-HAIRLINE[i-1][0])/(HAIRLINE[i][0]-HAIRLINE[i-1][0]));
    return mix(HAIRLINE[i-1][1],HAIRLINE[i][1],t*t*(3-2*t));
  }
  return HAIRLINE.at(-1)[1];
}

function grid(fn,nu,nv){
  const p=[],uv=[],idx=[];
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
    const u=i/nu,v=j/nv;p.push(...fn(u,v).toArray());uv.push(u,v);
  }
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
    const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;idx.push(a,b,c,b,d,c);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

function strand(points,radius,segments){
  const curve=new THREE.CatmullRomCurve3(points),g=new THREE.TubeGeometry(curve,segments,radius,4,false),p=g.attributes.position;
  for(let j=0;j<=segments;j++){
    const t=j/segments,center=curve.getPointAt(t),taper=.04+.96*(1-t)**.65;
    for(let k=0;k<=4;k++){const i=j*5+k;
      p.setXYZ(i,center.x+(p.getX(i)-center.x)*taper,center.y+(p.getY(i)-center.y)*taper,center.z+(p.getZ(i)-center.z)*taper);}
  }
  g.computeVertexNormals();return g;
}

export function buildSweptHair(add,hairPoint,hairE0){
  const locks=[],fine=[],wisps=[],temples=[];
  for(const side of [-1,1])for(let row=0;row<4;row++){
    // Loose temple locks follow the portrait's sweep behind the ears.
    const start=.63+row*.09,end=1.67+row*.10,top=.62+row*.095;
    const path=t=>{
      const a=side*mix(start,end,Math.pow(t,.87));
      const e=mix(top,.015+row*.057,t)+.065*Math.sin(PI*t)+.025*Math.sin(PI*t*3+row*.72)*Math.sin(PI*t);
      return [a,Math.max(e,hairE0(a)+.012)];
    };
    const lockPoint=(u,v)=>{
      const [a,e]=path(v),w=.023*(.35+.65*Math.sin(PI*v)**.4),ac=a+side*(u-.5)*w;
      return hairPoint(ac,e+(u-.5)*.043,.0006+.0005*Math.sin(PI*u)*Math.sin(PI*v));
    };
    const lock=grid(lockPoint,6,44),pos=lock.attributes.position,uv=lock.attributes.uv;
    if(side>0){const ix=lock.index.array;for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];lock.computeVertexNormals();}
    for(let i=0;i<pos.count;i++){
      const a=Math.atan2(pos.getX(i),pos.getZ(i)+.004),e=Math.atan2(pos.getY(i)-1.452,Math.hypot(pos.getX(i),pos.getZ(i)+.004)),e0=hairE0(a);
      uv.setXY(i,.5+a/(2*PI),clamp((e-e0)/(PI/2-1e-4-e0))**(1/.9));
    }
    locks.push(lock);
    // A few actual strands break up the silhouette without opaque hair cards.
    for(let k=0;k<3;k++){
      const pts=[];
      for(let j=0;j<=40;j++){
        const t=j/40,q=lockPoint(.22+k*.28,t),n=q.clone().sub(V(0,1.452,-.004)).normalize();
        pts.push(q.addScaledVector(n,.00014));
      }
      fine.push(strand(pts,.00008,48));
    }
  }
  for(const side of [-1,1])for(let i=0;i<22;i++){
    const a=side*mix(.18,1.68,(i+.16*Math.sin(i*2.3))/21),e=hairE0(a),pts=[];
    for(let j=0;j<=16;j++){
      const t=j/16,aa=a+side*(.025*Math.sin(PI*t)+.035*t);
      const length=.009+.015*Math.sin(i*2.4)**2+.018*clamp((Math.abs(a)-1)/.6);
      pts.push(hairPoint(aa,e+mix(.09,-length,t),.00015+.00035*Math.sin(PI*t)));
    }
    wisps.push(strand(pts,.000075,24));
  }
  for(const side of [-1,1])for(let k=0;k<3;k++){
    const a=side*(1.08+k*.07),start=hairE0(a)+.10,pts=[];
    for(let j=0;j<=40;j++){
      const t=j/40,aa=a+side*(.28*t+.030*Math.sin(t*PI*2+k*.4));
      pts.push(hairPoint(aa,mix(start,-.35+k*.045,t),.00018+.00050*Math.sin(PI*t)));
    }
    temples.push(strand(pts,.00010,48));
  }
  add('hair-swept-locks','hair-scalp',mergeGeometries(locks),{doubleSided:true});
  add('hair-fine-strands','hair-fine',mergeGeometries(fine));
  add('hairline-wisps','hair-fine',mergeGeometries(wisps));
  add('temple-flyaways','hair-fine',mergeGeometries(temples));
}

// Coordinates on the pinna's side view: y up; z toward the face. The lobe and
// helix share this surface, so their transitions do not read as attached beads.
function earPoint(u,v,back=false){
  const a=u*2*PI,r=v,sn=Math.sin(a),cs=Math.cos(a);
  const y=.024*sn*r,z=(.0125*cs-.0025*sn+.0015)*r;
  const helix=.0042*bell(r-.83,.115)*(1-.40*clamp(-sn));
  const concha=-.0028*Math.exp(-(((y+.002)/.009)**2)-((z-.003)/.007)**2);
  const antihelix=.0028*bell(z-(-.003+.28*y),.0026)*bell(y-.003,.013)*(1-bell(r,.15));
  const fork=.0017*bell(z-(.005-.40*(y-.008)),.002)*bell(y-.012,.007);
  const tragus=.0028*bell(z-.009,.0028)*bell(y+.004,.0045);
  const lobe=.0023*bell(y+.019,.006)*bell(z-.003,.008);
  const fade=Math.sqrt(Math.max(0,1-r*r));
  const attachment=clamp((z-.001)/.010),root=.006*attachment*attachment*(3-2*attachment)+.0012*bell(y+.022,.005);
  const x=(back?-.012*Math.sqrt(Math.max(0,1-r*r)):(.003+helix+concha+antihelix+fork+tragus+lobe)*fade)-root;
  return V(x,y,z);
}
export function buildSculptedEars(add){
  for(const side of [-1,1]){
    const front=grid((u,v)=>earPoint(u,v),96,40),back=grid((u,v)=>earPoint(1-u,v,true),96,16);
    let g=mergeGeometries([front,back]);const p=g.attributes.position,uv=g.attributes.uv;
    // Positive-side front has +X normals; mirror with winding reversal.
    const index=g.index.array;
    if(side<0){g.scale(-1,1,1);for(let i=0;i<index.length;i+=3)[index[i+1],index[i+2]]=[index[i+2],index[i+1]];}
    g.rotateY(-side*.08);g.rotateX(-.12);g.translate(side*.0775,1.424,-.028);
    // Register the colour to the same profile landmarks as the face, after
    // placing the ear. A rectangular stretch moved the helix onto its rim.
    for(let i=0;i<p.count;i++){
      const px=1256.7-(p.getZ(i)-.0605)/.0007,py=198+(1.4475-p.getY(i))/.0007;
      uv.setXY(i,clamp((px-1344)/71),clamp(1-(py-180)/98));
    }
    // Weld the polar centres and the front/back rim before computing normals.
    g.deleteAttribute('normal');g=mergeVertices(g,1e-7);
    const triangles=[],ix=g.index.array;
    for(let i=0;i<ix.length;i+=3)if(ix[i]!==ix[i+1]&&ix[i]!==ix[i+2]&&ix[i+1]!==ix[i+2])triangles.push(ix[i],ix[i+1],ix[i+2]);
    g.setIndex(triangles);
    g.computeVertexNormals();
    add(`ear-${side}`,'ear',g);
  }
}
