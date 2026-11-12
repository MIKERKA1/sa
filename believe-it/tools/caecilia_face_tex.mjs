// Face + eye textures for Caecilia v06, baked from the same SDF as the head mesh.
// v04: the front of the face is projected orthographically from the concept sheet
// (assets/characters/caecilia/v06/ref/concept_gemini.png) onto the true 3D surface, de-lit,
// and blended by surface normal with the procedural skin (sides, under the jaw, hair).
// Usage: node tools/caecilia_face_tex.mjs [size]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {headSDF,sdfGrad,radialHit,EYE,UVMAP} from '../src/models/caecilia_head.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(root,'assets/characters/caecilia/v06');
const SIZE=+(process.argv[2]||1024);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const sstep=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0));return t*t*(3-2*t);};
const g2=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
const mixc=(a,b,t)=>[mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];

// ---------- PNG ----------
const CRC=new Int32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c;});
const crc=b=>{let c=-1;for(const x of b)c=CRC[(c^x)&255]^(c>>>8);return (c^-1)>>>0;};
function png(file,w,h,ch,data){
  const raw=Buffer.alloc((w*ch+1)*h);
  for(let y=0;y<h;y++){raw[y*(w*ch+1)]=0;data.copy?data.copy(raw,y*(w*ch+1)+1,y*w*ch,(y+1)*w*ch):raw.set(data.subarray(y*w*ch,(y+1)*w*ch),y*(w*ch+1)+1);}
  const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=ch===4?6:2;
  fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));
}

// ---------- noise ----------
const perm=new Uint8Array(512);{let s=1234567;const p=[...Array(256).keys()];for(let i=255;i>0;i--){s=(s*16807)%2147483647;const j=s%(i+1);[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)perm[i]=p[i&255];}
const fade=t=>t*t*t*(t*(t*6-15)+10);
function grad(h,x,y,z){const u=h<8?x:y,v=h<4?y:h===12||h===14?x:z;return ((h&1)?-u:u)+((h&2)?-v:v);}
function noise(x,y,z){
  const X=Math.floor(x)&255,Y=Math.floor(y)&255,Z=Math.floor(z)&255;x-=Math.floor(x);y-=Math.floor(y);z-=Math.floor(z);
  const u=fade(x),v=fade(y),w=fade(z),A=perm[X]+Y,AA=perm[A]+Z,AB=perm[A+1]+Z,B=perm[X+1]+Y,BA=perm[B]+Z,BB=perm[B+1]+Z;
  return mix(mix(mix(grad(perm[AA]&15,x,y,z),grad(perm[BA]&15,x-1,y,z),u),mix(grad(perm[AB]&15,x,y-1,z),grad(perm[BB]&15,x-1,y-1,z),u),v),
             mix(mix(grad(perm[AA+1]&15,x,y,z-1),grad(perm[BA+1]&15,x-1,y,z-1),u),mix(grad(perm[AB+1]&15,x,y-1,z-1),grad(perm[BB+1]&15,x-1,y-1,z-1),u),v),w);
}
const fbm=(x,y,z,o=4)=>{let s=0,a=.5,f=1;for(let i=0;i<o;i++){s+=a*noise(x*f,y*f,z*f);f*=2.03;a*=.5;}return s;};
// thin valley lines with spacing sp (m) and half-width w (m) along scalar coordinate t (m)
const lines=(t,sp,w)=>{const q=t/sp-Math.round(t/sp);return Math.exp(-((q*sp/w)**2));};


let SKIN=[.665,.49,.43],RED=[.74,.40,.36],LIP=[.60,.37,.35],SPOT=[.52,.36,.28];
// ---------- concept photo projection ----------
const clampi=(v,a,b)=>Math.max(a,Math.min(b,v));
function readPNG(file){
  const b=fs.readFileSync(file);let o=8,w,h,ct;const idat=[];
  while(o<b.length){const len=b.readUInt32BE(o),type=b.toString('latin1',o+4,o+8),d=b.subarray(o+8,o+8+len);
    if(type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);if(d[8]!==8)throw new Error('8-bit PNG only');ct=d[9];}
    else if(type==='IDAT')idat.push(d);else if(type==='IEND')break;o+=12+len;}
  const ch={0:1,2:3,4:2,6:4}[ct],raw=zlib.inflateSync(Buffer.concat(idat)),st=w*ch,out=Buffer.alloc(w*h*ch);
  for(let y=0;y<h;y++){const f=raw[y*(st+1)],src=y*(st+1)+1,dst=y*st;
    for(let x=0;x<st;x++){const a=x>=ch?out[dst+x-ch]:0,up=y?out[dst-st+x]:0,ul=(y&&x>=ch)?out[dst-st+x-ch]:0,v=raw[src+x];let p=v;
      if(f===1)p=v+a;else if(f===2)p=v+up;else if(f===3)p=v+((a+up)>>1);
      else if(f===4){const pp=a+up-ul,pa=Math.abs(pp-a),pb=Math.abs(pp-up),pc=Math.abs(pp-ul);p=v+(pa<=pb&&pa<=pc?a:pb<=pc?up:ul);}
      out[dst+x]=p&255;}}
  const rgb=new Float32Array(w*h*3);for(let i=0;i<w*h;i++)for(let k=0;k<3;k++)rgb[i*3+k]=out[i*ch+(ch<3?0:k)]/255;
  return {w,h,rgb};
}
function blur(src,w,h,r){ // 3x box ~ gaussian
  let a=Float32Array.from(src);const t=new Float32Array(w*h),n=2*r+1;
  for(let pass=0;pass<3;pass++){
    for(let y=0;y<h;y++){let s=0;for(let x=-r;x<=r;x++)s+=a[y*w+clampi(x,0,w-1)];
      for(let x=0;x<w;x++){t[y*w+x]=s/n;s+=a[y*w+Math.min(w-1,x+r+1)]-a[y*w+Math.max(0,x-r)];}}
    for(let x=0;x<w;x++){let s=0;for(let y=-r;y<=r;y++)s+=t[clampi(y,0,h-1)*w+x];
      for(let y=0;y<h;y++){a[y*w+x]=s/n;s+=t[Math.min(h-1,y+r+1)*w+x]-t[Math.max(0,y-r)*w+x];}}
  }
  return a;
}
// Landmarks measured on the sheet: pixel = (cx + x/s, cy + (EYE.y - y)/s), eyes at x = +-EYE.x
const VIEWS=[
  {name:'close',crop:[0,502,1536,522],cx:766.5,cy:633,s:2*EYE.x/243,blur:28,fade:26},
  {name:'sheet',crop:[0,0,512,497],cx:277,cy:178,s:2*EYE.x/100,blur:9,fade:8},
];
let PHOTO=null;
{
  const file=path.join(OUT,'ref/concept_gemini.png');
  if(fs.existsSync(file)){
    const img=readPNG(file);
    for(const V of VIEWS){
      const [ox,oy,w,h]=V.crop,n=w*h,rgb=new Float32Array(n*3),L=new Float32Array(n),M=new Float32Array(n);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=((oy+y)*img.w+ox+x)*3;
        for(let k=0;k<3;k++)rgb[i*3+k]=img.rgb[j+k];
        const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2];L[i]=.3*r+.59*g+.11*b;
        M[i]=sstep(.13,.22,L[i])*sstep(.015,.055,r-b);}            // skin: not the dark kerchief, not grey hair/background
      const LM=new Float32Array(n);for(let i=0;i<n;i++)LM[i]=L[i]*M[i];
      const bL=blur(LM,w,h,V.blur),bM=blur(M,w,h,V.blur),fine=blur(L,w,h,2);
      const FR=Math.round(V.blur*1.6),fM=blur(M,w,h,FR),fC=[0,1,2].map(k=>{const a=new Float32Array(n);for(let i=0;i<n;i++)a[i]=rgb[i*3+k]*M[i];return blur(a,w,h,FR);});
      V.fM=fM;V.fC=fC;
      let sm=0,sw=0,mc=[0,0,0];for(let i=0;i<n;i++){const m=M[i];sm+=L[i]*m;sw+=m;for(let k=0;k<3;k++)mc[k]+=rgb[i*3+k]*m;}
      V.mean=sm/sw;V.mc=mc.map(v=>v/sw);V.w=w;V.h=h;V.rgb=rgb;V.M=M;V.bL=bL;V.bM=bM;V.hp=new Float32Array(n);
      for(let i=0;i<n;i++)V.hp[i]=L[i]-fine[i];
    }
    // de-light to the close-up's mean level, colour-match the low-res sheet to the close-up
    const T=VIEWS[0].mean;
    for(const V of VIEWS){const cm=VIEWS[0].mc.map((c,k)=>c/V.mc[k]*V.mean/T);
      for(let i=0;i<V.w*V.h;i++){const lb=V.bM[i]>.05?V.bL[i]/V.bM[i]:T,f=Math.pow(T/Math.max(lb,.04),.55);
        for(let k=0;k<3;k++)V.rgb[i*3+k]=clamp(V.rgb[i*3+k]*f*(V===VIEWS[0]?1:cm[k]*T/V.mean));}}
    // procedural skin follows the concept's skin colour
    const pm=VIEWS[0].mc,ratio=[pm[0]/(.3*pm[0]+.59*pm[1]+.11*pm[2]),pm[1]/(.3*pm[0]+.59*pm[1]+.11*pm[2]),pm[2]/(.3*pm[0]+.59*pm[1]+.11*pm[2])];
    const ref=[.665,.49,.43],rl=.3*ref[0]+.59*ref[1]+.11*ref[2],lum=mix(1,T*1.08/rl,.85),adj=c=>c.map((v,k)=>clamp(v*mix(1,ratio[k]*rl/ref[k],.85)*lum));
    SKIN=adj(SKIN);RED=adj(RED);LIP=adj(LIP);SPOT=adj(SPOT);
    for(const V of VIEWS){const cm=VIEWS[0].mc;V.gain=[0,1,2].map(k=>cm[k]/V.mc[k]);}
    PHOTO=VIEWS;console.log('concept projection on; skin mean',pm.map(v=>v.toFixed(3)).join(','));
  } else console.log('concept image missing -> procedural only');
}
function sampleView(V,x,y){
  const px=V.cx+x/V.s-V.crop[0]-.5,py=V.cy+(EYE.y-y)/V.s-V.crop[1]-.5;
  if(px<0||py<0||px>V.w-1.001||py>V.h-1.001)return null;
  const x0=Math.floor(px),y0=Math.floor(py),fx=px-x0,fy=py-y0,i00=y0*V.w+x0,ws=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy],ids=[i00,i00+1,i00+V.w,i00+V.w+1];
  const c=[0,0,0],fc=[0,0,0];let m=0,hp=0,fm=0;for(let q=0;q<4;q++){const i=ids[q],w=ws[q];for(let k=0;k<3;k++){c[k]+=V.rgb[i*3+k]*w;fc[k]+=V.fC[k][i]*w;}m+=V.M[i]*w;hp+=V.hp[i]*w;fm+=V.fM[i]*w;}
  for(let k=0;k<3;k++)fc[k]=fm>.02?fc[k]/fm*V.gain[k]:0;
  const edge=clamp(Math.min(px,py,V.w-1-px,V.h-1-py)/V.fade);
  return {c,m,hp,edge,fc,fm};
}
function sampleFill(x,y){
  if(!PHOTO)return null;const b=sampleView(PHOTO[1],x,y);
  if(!b||b.fm<.02)return null;return {c:b.fc,w:clamp(b.fm*2.2)};
}
function samplePhoto(x,y){
  if(!PHOTO)return null;
  const a=sampleView(PHOTO[0],x,y),b=sampleView(PHOTO[1],x,y);
  if(!a&&!b)return null;
  if(!a)return {c:b.c,m:b.m*b.edge,hp:b.hp*.6};
  if(!b||a.edge>=1)return {c:a.c,m:a.m*(b?1:a.edge),hp:a.hp};
  const f=a.edge;return {c:mixc(b.c,a.c,f),m:mix(b.m*b.edge,a.m,f),hp:mix(b.hp*.6,a.hp,f)};
}

// ---------- face ----------
const BROW=[.40,.36,.33],GREYB=[.64,.62,.59];
const HAIR0=[.44,.42,.39],HAIR1=[.80,.78,.74];
function hairline(x,z){const a=Math.atan2(x,z);return 1.5130-.0110*Math.abs(Math.sin(a))**1.4+.0018*noise(a*9,3.1,.5);}

function wrinkleHeight(x,y,z){
  const ax=Math.abs(x);let h=0;
  // forehead: long horizontal folds, broken up by noise
  {const m=sstep(1.474,1.481,y)*(1-sstep(1.497,1.503,y))*(1-sstep(.045,.062,ax));
   if(m>0)h-=m*.00028*lines(y-.0018*noise(x*60,1.2,0)-.0012*Math.cos(x*38),.0058,.00055)*(.55+.45*clamp(.5+noise(x*45,y*30,7)));}
  // glabella: two short vertical frown lines
  h-=.00030*g2(ax,y,.0045,1.4645,.0009,.006);
  // crow's feet radiating from the outer canthus
  {const cx=EYE.x+.0145,cy=EYE.y-.001,dx=ax-cx,dy=y-cy,r=Math.hypot(dx,dy),th=Math.atan2(dy,dx);
   const m=sstep(.003,.006,r)*(1-sstep(.016,.024,r))*sstep(-.004,.003,dx);
   if(m>0)h-=m*.00026*lines(th*.012+.0006*noise(r*300,th*3,2),.0026,.00042);}
  // under-eye: concentric arcs and a tear trough
  {const r=Math.hypot(ax-EYE.x,(y-EYE.y-.004)*1.25),m=sstep(1.4455,1.4395,y)*sstep(.0105,.013,r)*(1-sstep(.020,.026,r));
   if(m>0)h-=m*.00018*lines(r+.0004*noise(ax*400,y*400,1),.0021,.00035);
   h-=.00022*g2(ax,y,EYE.x-.003,1.4355-(ax-EYE.x)*.25,.012,.0011);}
  // upper-lid crease
  h-=.00018*g2(ax,y,EYE.x+.002,1.4530+.002*Math.cos((ax-EYE.x)*120),.012,.0007);
  // vertical lip lines above and on the upper lip
  {const m=sstep(1.3718,1.374,y)*(1-sstep(1.384,1.388,y))*(1-sstep(.012,.019,ax));
   if(m>0)h-=m*.00016*lines(x+.0003*noise(y*500,x*90,3),.0021,.00028);}
  // nasolabial and marionette lines (deepen the sculpted folds)
  {const t=clamp((1.396-y)/.034),lx=mix(.0205,.0305,t);if(y<1.399&&y>1.355)h-=.00035*Math.exp(-(((ax-lx)/.0011)**2));}
  {const t=clamp((1.366-y)/.022),lx=mix(.0225,.0285,t);if(y<1.368&&y>1.342)h-=.00025*Math.exp(-(((ax-lx)/.0010)**2))*(1-t*.6);}
  // cheek crepe and pores
  h+=.000035*noise(x*1400,y*1400,z*1400)+.00006*fbm(x*420,y*420,z*420,2)*sstep(.025,.05,ax);
  return h;
}

function faceColor(x,y,z,occ,cav){
  const ax=Math.abs(x);
  let c=SKIN.map((v,i)=>v*(1+.07*fbm(x*55+i*.3,y*55,z*55,3)));
  // warm/red blotches: nose, cheeks, chin
  const red=clamp(.55*g2(x,y,0,1.404,.011,.010)+.42*g2(ax,y,.047,1.404,.020,.018)+.18*g2(x,y,0,1.340,.018,.012)+.10*(.5+fbm(x*30,y*30,z*30+5,3)));
  c=mixc(c,RED,red*.30);
  // broken capillaries on nose wings and cheeks
  {const v=Math.pow(1-Math.abs(noise(x*260,y*260,z*260)),14)*clamp(g2(ax,y,.014,1.400,.010,.008)+.6*g2(ax,y,.044,1.408,.016,.012));c=mixc(c,[.62,.26,.26],v*.5);}
  // under-eye darkness, eyelid tint
  c=c.map((v,i)=>v*(1-.16*g2(ax,y,EYE.x+.001,1.4375,.016,.0055)*[1,1.08,.92][i]));
  c=c.map((v,i)=>v*(1-.10*g2(ax,y,EYE.x+.001,1.4540,.015,.004)*[1,1.1,.95][i]));
  // lips (thin, elderly)
  {const t=clamp(ax/.0195),up=g2(0,y,0,1.3738-.0016*t*t,1,.0030),lo=g2(0,y,0,1.3655-.0022*t*t,1,.0034);
   const m=clamp((up*.85+lo)*(1-sstep(.6,1,t)));c=mixc(c,LIP,m*.55);}
  // age spots
  {const n=noise(x*170+11,y*170,z*170)+.35*noise(x*520,y*520,z*520),area=.4+.6*clamp(g2(ax,y,.06,1.48,.03,.03)+g2(ax,y,.055,1.41,.025,.03)+g2(x,y,0,1.495,.05,.015));
   const m=sstep(.55,.66,n)*area;c=mixc(c,SPOT,m*.32);}
  // eyebrows: sparse grey-brown hairs along the brow arc
  {const bx=(ax-.031)/.025,yb=1.4735+.0035*(1-bx*bx)-.0022*clamp(bx,0,1.3);
   const th=.0026*(1-.55*clamp(bx,0,1))*(bx<-1?0:1)*(bx>1.15?0:1),dist=Math.abs(y-yb);
   if(th>0&&dist<th*2){const m=(1-sstep(th*.55,th,dist))*sstep(-1.05,-.85,bx)*(1-sstep(.95,1.15,bx));
     const dir=(ax*.75+(y-yb)*1.6)*2400,strand=Math.pow(.5+.5*Math.sin(dir+3*noise(ax*600,y*900,1)),3)*sstep(-.1,.4,noise(ax*800,y*1600,4));
     c=mixc(c,mixc(BROW,GREYB,.45+.45*noise(ax*300,y*300,9)),clamp(m*(.25+.75*strand)));}}
  // lid margins and lashes
  {const ex=ax-EYE.x-.0004,cy=EYE.y-.0004-.0021*clamp(ex/.0124,-1,1),q=Math.hypot(ex/.0124,(y-cy)/.0036);
   if(q<1.6){const m=Math.exp(-(((q-1.08)/.18)**2))*(y>cy?1:.55);c=mixc(c,[.25,.18,.16],m*.65);}}
  // hair region (hair cap shares this texture)
  const yh=hairline(x,z);
  if(y>yh-.004){
    const a=Math.atan2(x,z),wisp=.0025*noise(a*60,y*80,2),m=sstep(yh-.0015,yh+.0025,y+wisp);
    const along=a*.085*(1-.25*(y-yh)/.05),str=.5+.5*noise(along*700,(y-yh)*35,1.7)+.25*noise(along*2200,(y-yh)*60,8);
    const hc=mixc(HAIR0,HAIR1,clamp(str*.85+.1));
    c=mixc(c,hc,m);
  }
  // baked cavity occlusion, warm in the creases
  const o=clamp(occ);c=[c[0]*mix(.70,1,o),c[1]*mix(.64,1,o),c[2]*mix(.62,1,o)];
  c=c.map(v=>v*(1-clamp(-cav*260)*.22));
  return c;
}

function gloss(x,y){const ax=Math.abs(x);return clamp(.13+.10*g2(x,y,0,1.404,.012,.012)+.05*g2(x,y,0,1.485,.04,.015)+.14*g2(0,y,0,1.370,1,.006)*(1-sstep(.012,.02,ax))+.12*g2(ax,y,EYE.x,EYE.y,.014,.004));}

const W=SIZE,H=SIZE,albedo=Buffer.alloc(W*H*3),nmap=Buffer.alloc(W*H*4);
const Px=new Float32Array(W*H),Py=new Float32Array(W*H),Pz=new Float32Array(W*H),Hh=new Float32Array(W*H),hit=new Uint8Array(W*H);
const t0=Date.now();
for(let r=0;r<H;r++){
  const v=1-(r+.5)/H,y=UVMAP.y0+v*(UVMAP.y1-UVMAP.y0);
  for(let c=0;c<W;c++){
    const u=(c+.5)/W,a=(u-.5)*2*UVMAP.a,i=r*W+c;
    let p=radialHit(a,y);
    if(!p){const R=.06;p=[R*Math.sin(a),y,R*Math.cos(a)];} else hit[i]=1;
    const [x,yy,z]=p;Px[i]=x;Py[i]=yy;Pz[i]=z;
    let occ=1,cav=0,Wp=0,ph=null,NU=0;
    if(hit[i]){const [nx,ny,nz]=sdfGrad(x,yy,z);let s=0;
      // v05 nose underside: the photo only has a shadow there, so it gets its own skin colour
      if(Math.abs(x)<.026&&yy>1.380&&yy<1.408&&z>.078)NU=sstep(.12,.50,-ny)*(1-sstep(.022,.026,Math.abs(x)));
      for(let k=1;k<=5;k++){const hk=.0016*k;s+=(hk-headSDF(x+nx*hk,yy+ny*hk,z+nz*hk))/(1<<k);}occ=1-s*95;
      cav=-Math.max(0,s);
      const wn=sstep(.10,.42,nz);
      if(wn>0){ph=samplePhoto(x,yy);if(ph)Wp=wn*sstep(.55,.92,ph.m);}}
    // v05: the concept's nostril shadow must not land on the side of the ala (looked like a hole)
    if(hit[i]){const qa=Math.hypot((Math.abs(x)-.0110)/.0110,(yy-1.3950)/.0060,(z-.0930)/.0120);Wp*=mix(.15,1,sstep(.75,1.15,qa));}
    // eye fissure rim: keep procedural lid margin so photo sclera never lands on the lid
    {const ex=Math.abs(x)-EYE.x,q=Math.hypot(ex/.0150,(yy-EYE.y)/.0055);Wp*=mix(.35,1,sstep(.8,1.35,q));}
    const hh=hit[i]?wrinkleHeight(x,yy,z)*(1-.7*Wp)+(ph?ph.hp*Wp*.0032:0):0;Hh[i]=hh;
    let col=faceColor(x,yy,z,occ,hh);
    // v05: procedural areas take the concept's local skin colour (jaw, neck, edges) - not the nose underside
    if(hit[i]&&yy<hairline(x,z)-.002){const f=sampleFill(x,yy);
      if(f)col=col.map((v,k)=>mix(v,clamp(v*f.c[k]/SKIN[k]),f.w*.9*(1-NU)));}
    if(hit[i]&&Math.abs(x)<.03&&yy>1.38&&yy<1.41){
      // two nostril openings, dark inside, soft rim; underside slightly ruddy
      const qn=Math.hypot((Math.abs(x)-.0058)/.0026,(yy-1.3925)/.0024,(z-.0915)/.0050),dk=(1-sstep(.85,1.25,qn))*sstep(.05,.35,NU);
      if(NU>0)col=col.map((v,k)=>v*mix(1,[1.10,1.03,1.00][k],NU));
      if(dk>0)col=col.map((v,k)=>v*mix(1,[.30,.20,.19][k],dk));}
    if(Wp>0){const o=clamp(occ),pc=[ph.c[0]*mix(.86,1,o),ph.c[1]*mix(.84,1,o),ph.c[2]*mix(.83,1,o)];col=mixc(col,pc,Wp);}
    // v06 nostril interior patch (top rows, centre): rim skin -> dark cavity
    if(y>=1.5715&&Math.abs(u-.5)<.06){const dep=clamp((y-1.5720)/(1.585-1.5720));
      col=[mix(.30,.07,Math.sqrt(dep)),mix(.17,.035,Math.sqrt(dep)),mix(.15,.03,Math.sqrt(dep))];Hh[i]=0;}
    for(let k=0;k<3;k++)albedo[i*3+k]=Math.round(255*Math.pow(clamp(col[k]),1/1.0));
  }
}
// tangent-space normals from the wrinkle height field (+u right, +v up; same convention as caecilia_textures.py)
const S=1.0;
for(let r=0;r<H;r++)for(let c=0;c<W;c++){
  const i=r*W+c,L=r*W+Math.max(0,c-1),R=r*W+Math.min(W-1,c+1),U=Math.max(0,r-1)*W+c,D=Math.min(H-1,r+1)*W+c;
  const du=Math.hypot(Px[R]-Px[L],Py[R]-Py[L],Pz[R]-Pz[L])||1,dv=Math.hypot(Px[U]-Px[D],Py[U]-Py[D],Pz[U]-Pz[D])||1;
  const sx=clamp((Hh[R]-Hh[L])/du*S,-2,2),sy=clamp((Hh[U]-Hh[D])/dv*S,-2,2),l=Math.hypot(sx,sy,1);
  nmap[i*4]=Math.round(127.5-127.5*sx/l);nmap[i*4+1]=Math.round(127.5-127.5*sy/l);nmap[i*4+2]=Math.round(127.5+127.5/l);
  nmap[i*4+3]=Math.round(255*gloss(Px[i],Py[i]));
}
png(path.join(OUT,'face.png'),W,H,3,albedo);
png(path.join(OUT,'face_normal.png'),W,H,4,nmap);

// ---------- eye ----------
// rows = polar angle from the gaze (row 0 = pupil centre), columns = azimuth around the gaze.
const EW=512,EH=256,eye=Buffer.alloc(EW*EH*3),en=Buffer.alloc(EW*EH*4);
const thI=Math.asin(.0059/EYE.r),thP=Math.asin(.0019/EYE.r);
for(let r=0;r<EH;r++)for(let c=0;c<EW;c++){
  const th=Math.PI*(r+.5)/EH,ph=2*Math.PI*(c+.5)/EW,i=r*EW+c;
  const sy=-Math.sin(ph)*Math.sin(th),sx=-Math.cos(ph)*Math.sin(th);
  let col;
  if(th<thI){
    const t=th/thI,fib=.5+.5*noise(Math.cos(ph)*22,Math.sin(ph)*22,t*6)+.3*noise(Math.cos(ph)*70,Math.sin(ph)*70,t*3);
    col=mixc([.30,.38,.43],[.55,.62,.64],clamp(fib*.8));
    col=mixc(col,[.52,.46,.36],g2(t,0,.42,0,.09,1)*.55);        // warm collarette
    col=col.map(v=>v*mix(1,.45,sstep(.80,1,t)));                 // limbal ring
    if(th<thP*1.08)col=mixc(col,[.03,.03,.035],sstep(thP*1.08,thP*.9,th));
  } else {
    col=[.62,.56,.50];
    const vein=Math.pow(1-Math.abs(noise(Math.cos(ph)*30,Math.sin(ph)*30,th*14)),10)*sstep(thI*1.25,thI*2.4,th)*(.35+.65*Math.abs(Math.cos(ph)));
    col=mixc(col,[.66,.30,.27],vein*.7);
    col=col.map(v=>v*mix(.92,.50,sstep(thI,Math.PI*.42,th)));
    col=mixc(col,[.70,.60,.52],.25*Math.abs(Math.cos(ph))*sstep(thI*1.2,thI*2.5,th));
  }
  col=col.map(v=>v*(1-.38*sstep(.0,.75,sy)));                    // upper-lid shadow
  for(let k=0;k<3;k++)eye[i*3+k]=Math.round(255*clamp(col[k]));
  en[i*4]=128;en[i*4+1]=128;en[i*4+2]=255;en[i*4+3]=th<thI*1.1?235:200;
}
png(path.join(OUT,'eye.png'),EW,EH,3,eye);
png(path.join(OUT,'eye_normal.png'),EW,EH,4,en);
console.log(JSON.stringify({face:SIZE,seconds:(Date.now()-t0)/1000}));
