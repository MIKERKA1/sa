// Metres, Y up, +Z front. Illustrated proportions take precedence over inconsistent sheet labels.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildHeadGeometry,buildEyeGeometry,headUV,HEAD,profile,radialHit,clamp,mix} from './caecilia_gabriel_head_v01.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z),PI=Math.PI,TAU=2*PI;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const gauss=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
function surface(fn,nu,nv,uvFn=null,closed=false){
 const p=[],uv=[],idx=[];
 for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){const u=i/nu,v=j/nv,q=fn(u,v);p.push(q.x,q.y,q.z);uv.push(...(uvFn?uvFn(q,u,v):[u,v]));}
 for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;idx.push(a,b,c,b,d,c);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
 if(closed){const n=g.attributes.normal;for(let j=0;j<=nv;j++){const a=j*(nu+1),b=a+nu,q=V(n.getX(a)+n.getX(b),n.getY(a)+n.getY(b),n.getZ(a)+n.getZ(b)).normalize();n.setXYZ(a,q.x,q.y,q.z);n.setXYZ(b,q.x,q.y,q.z);}}
 return g;
}
function loft(rows,nu=72,nv=60,fold=null,tile=.20){return surface((u,v)=>{const y=mix(rows[0][0],rows.at(-1)[0],v),[rx,rz,cz]=profile(rows,y),a=u*TAU,f=fold?fold(a,y,v):0;return V((rx+f)*Math.sin(a),y,(rz+f*.6)*Math.cos(a)+cz);},nu,nv,(p,u)=>[u*1.2/tile,p.y/tile],true);}
const tube=(points,r=.001,segments=28,sides=6,closed=false)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed,'centripetal'),segments,r,sides,closed);
const sphere=(pos,scale,nu=28,nv=18)=>{const g=new THREE.SphereGeometry(1,nu,nv);g.scale(...scale);g.translate(...pos);return g;};
const join=gs=>gs.length?mergeGeometries(gs.every(g=>g.index)?gs:gs.map(g=>g.index?g.toNonIndexed():g)):null;
function ribbon(points,width,roll=0){const c=new THREE.CatmullRomCurve3(points);return surface((u,v)=>{const p=c.getPoint(v),d=c.getTangent(v),w=V(1,0,0).addScaledVector(d,-d.x).normalize(),n=new THREE.Vector3().crossVectors(d,w).normalize(),t=(u-.5)*width;return p.addScaledVector(w,t*Math.cos(roll*Math.sin(v*PI))).addScaledVector(n,t*Math.sin(roll*Math.sin(v*PI))+.0007*Math.sin(u*TAU));},8,40,(p,u,v)=>[u*.3,v*1.2]);}
const SKIRT=[[.292,.204,.138,0],[.35,.196,.136,0],[.48,.172,.123,0],[.64,.139,.100,0],[.776,.103,.076,0]];
const BODICE=[[.755,.103,.076,0],[.80,.104,.078,0],[.87,.111,.077,-.004],[.932,.115,.071,-.006],[.966,.089,.051,-.006],[.991,.040,.034,-.005]];
function skirtPoint(a,y,offset=0){const [rx,rz,cz]=profile(SKIRT,y),v=clamp((y-.292)/.484),f=(.0034+.0028*(1-v))*Math.sin(12*a+.18)+.0012*Math.sin(24*a+y*5);return V((rx+f+offset)*Math.sin(a),y,(rz+f*.65+offset)*Math.cos(a)+cz);}
const bodiceFold=(a,y)=>.0010*Math.sin(a*16+y*17);
function bodiceFront(x,y,offset=0){const [rx,rz,cz]=profile(BODICE,y),a=Math.asin(clamp(x/rx,-1,1));return V(x,y,cz+(rz+bodiceFold(a,y)*.6)*Math.cos(a)+offset);}
export function buildCaeciliaGabrielGeometry(){
 const parts=[],add=(name,material,geometry,extras={})=>{if(!geometry)return;geometry.computeBoundingBox();parts.push({name,material,geometry,...extras});};
 add('face','face',buildHeadGeometry());for(const s of [-1,1])add(`eye-${s}`,'eye',buildEyeGeometry(s));
 add('dress-skirt','wool',surface((u,v)=>skirtPoint(u*TAU,mix(.292,.776,v)),120,100,(p,u)=>[u*5,p.y/.25],true));
 add('bodice','wool',loft(BODICE,88,72,bodiceFold,.20));
 const seams=[];for(const y of [.293,.309,.760])seams.push(tube(Array.from({length:120},(_,i)=>skirtPoint(i/119*TAU,y,.0008)),.0006,150,5,true));
 for(const a of [PI/2,-PI/2])seams.push(tube(Array.from({length:64},(_,i)=>skirtPoint(a,mix(.296,.759,i/63),.0009)),.00065,72,5));
 add('dress-seams','thread',join(seams));
 add('front-placket','wool',surface((u,v)=>bodiceFront((u-.5)*.020,mix(.779,.964,v),.0018),6,50,(p,u)=>[u*.12,p.y/.20]));
 add('bodice-buttons','button',join(Array.from({length:5},(_,i)=>sphere(bodiceFront(0,.944-i*.033,.005).toArray(),[.0055,.0055,.0020],22,14))));
 // A rounded linen collar follows the visible shirt neckline rather than a cylindrical neck band.
 const collars=[];for(const s of [-1,1])collars.push(surface((u,v)=>{const a=Math.sin(u*PI/2),x=s*mix(.001+.040*a,.001+.073*a,v),inner=.995-.018*u,outer=.977-.018*Math.sin(u*PI)-.003*u,y=mix(inner,outer,v),p=bodiceFront(x,y,.0025);p.z+=.0015*Math.sin(v*PI);return p;},40,18,(p,u,v)=>[u*.9,v*.5]));
 collars.push(surface((u,v)=>{const a=mix(PI/2,PI*1.5,u);return V(mix(.040,.071,v)*Math.sin(a),mix(.994,.974,v),-.006+mix(.035,.052,v)*Math.cos(a));},60,14,(p,u,v)=>[u*1.8,v*.5]));
 add('collar','collar',join(collars),{doubleSided:true});
 for(const s of [-1,1]){
  const c=new THREE.CatmullRomCurve3([V(s*.101,.949,-.004),V(s*.146,.869,.000),V(s*.168,.774,.009),V(s*.190,.689,.018),V(s*.207,.608,.028)]);
  const section=(q,a,extra=0)=>{const p=c.getPoint(q),t=c.getTangent(q),n=new THREE.Vector3().crossVectors(t,V(0,0,1)).normalize(),r=Math.max(.0007,(mix(.031,.021,q)+.003*Math.sin(q*PI)+.0016*Math.sin(a*8+q*32)*Math.sin(q*PI))*Math.sin(PI/2*clamp(q/.13))+extra);return p.addScaledVector(n,Math.cos(a)*r).addScaledVector(V(0,0,1),Math.sin(a)*r*.88);};
  add(`sleeve-${s}`,'wool',surface((u,v)=>section(v*.955,-u*TAU),52,74,(p,u,v)=>[u*1.7,v*2.6],true));
  add(`cuff-${s}`,'wool',surface((u,v)=>section(mix(.925,1.0,v),-u*TAU,.0018),48,16,(p,u,v)=>[u*1.7,v*.3],true));
  const cp=section(.966,0,.0035);add(`cuff-button-${s}`,'button',sphere(cp.toArray(),[.0055,.003,.0055],22,14));
  add(`wrist-${s}`,'skin',surface((u,v)=>{const q=mix(.96,1.06,v),p=q<=1?c.getPoint(q):c.getPoint(1).addScaledVector(c.getTangent(1),(q-1)*.37),t=c.getTangent(Math.min(1,q)),n=new THREE.Vector3().crossVectors(t,V(0,0,1)).normalize(),a=-u*TAU;return p.addScaledVector(n,.016*Math.cos(a)).addScaledVector(V(0,0,1),.014*Math.sin(a));},36,20,(p,u,v)=>[u,v],true));
 }
 add('apron','linen',surface((u,v)=>{const a=mix(-.90,.90,u),y=mix(.353,.775,v),p=skirtPoint(a,y,.0040);p.z+=.0018*Math.sin(u*25)*v;p.y+=.0013*Math.sin(u*13)*(1-v)**8;return p;},96,96,(p,u,v)=>[u*1.5,v*2.1]),{doubleSided:true});
 const hems=[];for(const a of [-.90,.90])hems.push(tube(Array.from({length:64},(_,i)=>skirtPoint(a,mix(.355,.774,i/63),.005)),.0007,80,5));
 hems.push(tube(Array.from({length:80},(_,i)=>skirtPoint(mix(-.90,.90,i/79),.355,.005)),.0008,96,5));add('apron-hems','linen',join(hems));
 add('waistband','linen',surface((u,v)=>{const a=u*TAU,y=mix(.758,.785,v),[rx,rz,cz]=profile(SKIRT,y);return V((rx+.006)*Math.sin(a),y,(rz+.008)*Math.cos(a)+cz);},96,14,(p,u,v)=>[u*4,v*.2],true));
 add('apron-bow-knot','linen',sphere([0,.772,-.091],[.014,.010,.008]));
 for(const s of [-1,1]){
  add(`apron-bow-${s}`,'linen',ribbon([V(0,.773,-.096),V(s*.038,.786,-.108),V(s*.070,.758,-.108),V(s*.025,.747,-.108),V(0,.773,-.097)],.018,.6),{doubleSided:true});
  add(`apron-tie-${s}`,'linen',ribbon([V(s*.008,.767,-.104),V(s*.018,.720,-.117),V(s*.030,.666,-.136),V(s*.043,.624,-.148)],.026,.24*s),{doubleSided:true});
 }
 add('back-patch','patch',surface((u,v)=>{const x=mix(-.010,.043,u),y=mix(.360,.401,v),[rx,rz]=profile(SKIRT,y),a=PI-Math.asin(x/rx);return skirtPoint(a,y,.0016);},18,18,(p,u,v)=>[u,v]),{doubleSided:true});
 buildBoots(add);buildChildHands(add);buildHair(add);buildEars(add);
 for(const s of [-1,1])add(`stocking-${s}`,'stocking',loft([[.075,.020,.025,-.015],[.16,.022,.026,-.009],[.25,.030,.033,-.005],[.37,.031,.033,0],[.52,.038,.041,0]],48,64,(a,y)=>.00045*Math.cos(a*17),.12).translate(s*.058,0,0));
 // The illustrated head is larger than its printed 20 cm label; preserve the crown height and UV registration.
 for(const part of parts){
  if(part.name==='face'||part.name.startsWith('eye-')||part.name==='hair-cap'||part.name==='hair-wisps'||part.name.startsWith('ear-'))part.geometry.scale(1.10,1.075,1.04).translate(0,-.0915,0);
  else if(/^braid--?1$/.test(part.name)){const p=part.geometry.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),w=smooth(.950,1.075,y);p.setXYZ(i,p.getX(i)*(1+.10*w),y+(y-1.22)*.075*w,p.getZ(i)*(1+.04*w));}part.geometry.computeVertexNormals();}
  part.geometry.computeBoundingBox();
 }
 return {parts,metadata:{name:'Caecilia Gabriel',age:7,modelVersion:1,height:1.22,units:'metres',front:'+Z',pose:'relaxed standing',concept:'caecilia_gabriel_concept_v01.png',dimensionPolicy:'Illustrated head, hem, apron, and braid lengths; printed total height 122 cm'}};
}
function buildBoots(add){
 const rows=[[.018,.037,.096,.037],[.037,.039,.096,.037],[.055,.037,.082,.030],[.079,.031,.047,-.006],[.119,.028,.034,-.018]];
 for(const s of [-1,1]){
  const tr=g=>g.translate(s*.058,0,0);
  add(`boot-sole-${s}`,'sole',tr(loft([[.001,.037,.098,.034],[.008,.040,.102,.034],[.019,.040,.102,.034],[.023,.037,.098,.034]],64,12,null,.16)));
  add(`boot-upper-${s}`,'leather',tr(loft(rows,72,56,(a,y)=>.00075*Math.sin(y*190+a*2)*clamp((.11-y)/.05),.15)));
  const f=(x,y)=>{const [rx,rz,cz]=profile(rows,y);return V(x,y,cz+rz*Math.sqrt(Math.max(0,1-(x/rx)**2))+.0014);},laces=[],eyelets=[],stitches=[];
  for(let i=0;i<5;i++){const y=.057+i*.012,w=mix(.017,.013,i/4);
   for(const a of [-1,1]){const ring=new THREE.TorusGeometry(.0014,.00035,5,12),p=f(a*w,y);ring.translate(p.x,p.y,p.z);eyelets.push(ring);}
   if(i<4){const nw=mix(.017,.013,(i+1)/4);laces.push(tube([f(-w,y),f(0,y+.006),f(nw,y+.012)],.0010,12,5),tube([f(w,y),f(0,y+.006).add(V(0,0,.001)),f(-nw,y+.012)],.0010,12,5));}
  }
  for(let i=0;i<56;i++){const a=i/56*TAU;stitches.push(tube([V(.039*Math.sin(a),.025,.034+.098*Math.cos(a)),V(.039*Math.sin(a+.025),.025,.034+.098*Math.cos(a+.025))],.00035,2,4));}
  add(`boot-laces-${s}`,'lace',tr(join(laces)));add(`boot-eyelets-${s}`,'metal',tr(join(eyelets)));add(`boot-stitches-${s}`,'thread',tr(join(stitches)));
 }
}
function hairline(a){a=Math.abs(a>PI?a-TAU:a);return profile([[0,1.161],[.45,1.153],[.95,1.128],[1.55,1.080],[2.25,1.045],[PI,1.019]],a)[0];}
function hairP(a,v,extra=0){const y=mix(hairline(a),1.220,Math.sin(v*PI/2)),[rx,rz,cz]=profile(HEAD,Math.min(y,1.205)),t=Math.sqrt(clamp((1.220-y)/.015));return V((rx+.0027+extra)*Math.sin(a)*t,y,mix(cz,-.014,clamp((y-1.205)/.015))+(rz+.0030+extra)*Math.cos(a)*t);}
function buildHair(add){
 const cap=surface((u,v)=>hairP(u*TAU,v),144,80,headUV,true),p=cap.attributes.position,n=cap.attributes.normal;
 // Coincident pole vertices have no triangle area from which to derive a normal.
 for(let i=0;i<p.count;i++)if(p.getY(i)>1.219999)n.setXYZ(i,0,1,0);
 add('hair-cap','hair-scalp',cap);
 const fine=[];
 // The registered scalp image carries the part and fine strands without a repeated wire-like silhouette.
 for(const s of [-1,1]){
  const c=new THREE.CatmullRomCurve3([V(s*.074,1.073,-.023),V(s*.077,1.036,-.008),V(s*.075,.999,.044),V(s*.071,.965,.070),V(s*.067,.942,.082)]),gs=[];
  for(let k=0;k<3;k++){const p=Array.from({length:120},(_,j)=>{const v=j/119,q=c.getPoint(v),a=v*TAU*7+k*TAU/3,r=mix(.0048,.0038,v);return q.add(V(Math.cos(a)*r,0,Math.sin(2*a)*r*.65));});gs.push(tube(p,.0045,220,9));}
  add(`braid-${s}`,'hair',join(gs));
  const tails=[];for(let k=0;k<12;k++){const a=k/12*TAU;tails.push(tube([V(s*.067+Math.cos(a)*.0035,.941,.082+Math.sin(a)*.0035),V(s*.066+Math.cos(a)*.006,.919,.086+Math.sin(a)*.004),V(s*.065+Math.cos(a)*.005,.903,.090+Math.sin(a)*.003)],.0008,20,5));}add(`braid-tail-${s}`,'hair',join(tails));
  add(`hair-bow-knot-${s}`,'collar',sphere([s*.067,.943,.094],[.0045,.004,.003]));
  for(const b of [-1,1])add(`hair-bow-${s}-${b}`,'collar',ribbon([V(s*.067,.944,.097),V(s*.067+b*.014,.951,.099),V(s*.067+b*.016,.938,.099),V(s*.067,.942,.097)],.007,.3),{doubleSided:true});
  add(`hair-ribbon-${s}`,'collar',ribbon([V(s*.068,.941,.097),V(s*.078,.925,.099),V(s*.080,.913,.098)],.010,.25),{doubleSided:true});
  for(let i=0;i<8;i++)fine.push(tube([hairP(s*(1+i*.04),.13,.0004),V(s*(.075+i*.0003),1.107-i*.001,-.002),V(s*.075,1.090-i*.001,.000)],.00012,18,4));
 }
 add('hair-wisps','hair',join(fine));
}
function buildEars(add){
 for(const s of [-1,1]){
  const earUV=g=>{const p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,clamp((p.getZ(i)+.034)/.028),clamp((p.getY(i)-1.059)/.038));return g;};
  add(`ear-${s}`,'ear',earUV(sphere([s*.070,1.077,-.020],[.0045,.017,.011],36,26)));
  add(`ear-concha-${s}`,'ear',earUV(sphere([s*.073,1.078,-.017],[.001,.008,.0055],28,20)));
  const points=Array.from({length:40},(_,i)=>{const a=i/39*TAU;return V(s*(.075+.0005*Math.sin(a)),1.078+.0135*Math.sin(a),-.020+.0085*Math.cos(a));});
  add(`ear-helix-${s}`,'ear',earUV(tube(points,.0010,56,7,true)));
  add(`ear-tragus-${s}`,'ear',earUV(sphere([s*.073,1.077,-.010],[.0015,.003,.002])));
 }
}

const HAND={
  wrist:[.242,.812,.049],
  palm:[[-.022,.0235,.0168],[0,.0235,.0162],[.022,.027,.0152],[.046,.030,.0142],[.068,.0315,.0128],[.082,.031,.0112],[.091,.025,.0082],[.097,.013,.0038]],
  fingers:[
    {f:.0225,d:.084,len:[.036,.022,.018],flex:[.16,.30,.16],splay:.035,w:.98},
    {f:.0075,d:.088,len:[.040,.025,.019],flex:[.20,.36,.18],splay:.008,w:1},
    {f:-.0078,d:.085,len:[.037,.0235,.018],flex:[.25,.42,.20],splay:-.02,w:.95},
    {f:-.0222,d:.077,len:[.029,.0175,.016],flex:[.30,.48,.22],splay:-.06,w:.84},
  ],
};
const g1=(x,r)=>Math.exp(-((x/r)**2));
function orthoTo(v,t){return v.clone().addScaledVector(t,-v.dot(t)).normalize();}
function orientedSphere(c,ax,ay,az,nu=16,nv=10){
  if(new THREE.Vector3().crossVectors(ax,ay).dot(az)<0) ax=ax.clone().multiplyScalar(-1);
  const g=new THREE.SphereGeometry(1,nu,nv);
  g.applyMatrix4(new THREE.Matrix4().set(ax.x,ay.x,az.x,c.x, ax.y,ay.y,az.y,c.y, ax.z,ay.z,az.z,c.z, 0,0,0,1));
  return g;
}
function mirrorX(g){
  const p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++){p.setX(i,-p.getX(i));if(n)n.setX(i,-n.getX(i));}
  p.needsUpdate=true;if(n)n.needsUpdate=true;
  const ix=g.index.array;
  for(let i=0;i<ix.length;i+=3){const t=ix[i+1];ix[i+1]=ix[i+2];ix[i+2]=t;}
  g.index.needsUpdate=true;g.computeBoundingBox();
  return g;
}
// digit along a joint chain; rFn(k) gives [halfWidth, halfThickness] at distance k from the base knuckle
function digit(pts,pre,rFn,palAxis,cap,nail,creaseAt,out){
  const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal');
  let L=0;for(let i=1;i<pts.length;i++)L+=pts[i].distanceTo(pts[i-1]);
  const frame=v=>{const t=curve.getTangentAt(v),pal=orthoTo(palAxis,t),side=new THREE.Vector3().crossVectors(pal,t);return {c:curve.getPointAt(v),t,pal,side};};
  const section=s=>{let [w,h]=rFn(s-pre);const e=L-cap;if(s>e){const q=Math.sqrt(Math.max(0,1-((s-e)/cap)**2));w*=q;h*=q;}return [w,h];};
  out.skin.push(surface((u,v)=>{
    const s=v*L,{c,pal,side}=frame(v),[w,h]=section(s),a=u*TAU,ca=Math.cos(a),sa=Math.sin(a);
    const hp=sa>0?h*(1+.10*g1(s-(L-.009),.006)):h;
    return c.clone().addScaledVector(side,w*ca).addScaledVector(pal,hp*sa);
  },20,46,(q,u,v)=>[u*.4,v*.75],true));
  {const s=L-nail.back,{c,t,pal,side}=frame(s/L),[,h]=section(s);
   out.nails.push(orientedSphere(c.clone().addScaledVector(pal,-h*.92),side.clone().multiplyScalar(nail.w),t.clone().multiplyScalar(nail.l),pal.clone().multiplyScalar(-.0013)));}
  for(const k of creaseAt){const f2=frame((pre+k)/L),[w,h]=section(pre+k);
    out.creases.push(tube([-.7,-.35,0,.35,.7].map(q=>f2.c.clone().addScaledVector(f2.side,w*q).addScaledVector(f2.pal,-h*Math.sqrt(1-q*q)*1.03)),.00022,8,4));}
}
function buildRightHand(){
  const W=V(...HAND.wrist),D=V(.07,-1,.05).normalize(),F=orthoTo(V(0,0,1),D),P=new THREE.Vector3().crossVectors(D,F);
  const toW=(d,f,p)=>W.clone().addScaledVector(D,d).addScaledVector(F,f).addScaledVector(P,p);
  const out={skin:[],nails:[],creases:[]};
  // palm: superellipse loft with thenar/hypothenar pads, a shallow hollow and dorsal knuckles
  out.skin.push(surface((u,v)=>{
    const d=mix(-.022,.097,v),[hw,ht]=profile(HAND.palm,d),a=u*TAU,c=Math.cos(a),sn=Math.sin(a);
    const se=1/Math.pow(Math.abs(c)**2.8+Math.abs(sn)**2.8,1/2.8);let f=hw*c*se,p=ht*sn*se;
    const pal=Math.max(0,sn),dor=Math.max(0,-sn);
    p+=pal*(.0078*gauss(f,d,.018,.034,.015,.026)+.0038*gauss(f,d,-.023,.050,.009,.028)-.0026*gauss(f,d,0,.056,.013,.018));
    let k=0;for(const fg of HAND.fingers)k+=.0013*gauss(f,d,fg.f,fg.d-.002,.0062,.0065)+.0006*gauss(f,d,fg.f,.055,.0022,.028);
    p-=dor*k;
    return toW(d,f,p);
  },48,44,(q,u,v)=>[u*1.3,v*1.0],true));
  // fingers
  for(const fg of HAND.fingers){
    const dir=phi=>D.clone().multiplyScalar(Math.cos(phi)).addScaledVector(P,Math.sin(phi)).addScaledVector(F,fg.splay).normalize();
    const j0=toW(fg.d,fg.f,0);let phi=fg.flex[0];
    const pts=[j0.clone().addScaledVector(dir(phi),-.010),j0];let j=j0.clone();
    for(let i=0;i<3;i++){if(i)phi+=fg.flex[i];j=j.clone().addScaledVector(dir(phi),fg.len[i]);pts.push(j);}
    const [l0,l1,l2]=fg.len,len=l0+l1+l2;
    const rFn=k=>{let w=mix(.0080,.0058,clamp(k/len))+.0006*g1(k,.006)+.0004*g1(k-l0,.0045)+.00055*g1(k-l0-l1,.0038)-.0003*g1(k-l0*.5,.008)-.0003*g1(k-l0-l1*.5,.005);
      w*=fg.w;return [w,w*.86];};
    digit(pts,.010,rFn,P,.0058,{back:.0088,w:.0043*fg.w,l:.0055},[l0,l0+l1],out);
  }
  // thumb: metacarpal hidden in the thenar pad, two visible phalanges, nail facing forward-out
  const tp=[toW(.008,.010,.004),toW(.026,.024,.006),toW(.054,.037,.012),toW(.086,.044,.017),toW(.110,.046,.020)];
  const tl=[tp[1].distanceTo(tp[2]),tp[2].distanceTo(tp[3]),tp[3].distanceTo(tp[4])];
  const tpre=tp[0].distanceTo(tp[1]);
  const tr=k=>{let w=k<tl[0]?mix(.0112,.0082,clamp(k/tl[0])):mix(.0081,.0072,clamp((k-tl[0])/(tl[1]+tl[2])));
    w+=.0005*g1(k-tl[0],.005)+.0004*g1(k-tl[0]-tl[1],.004);return [w,w*.84];};
  digit(tp,tpre,tr,orthoTo(F.clone().multiplyScalar(-.7).addScaledVector(P,.7),D),.0068,{back:.0092,w:.0047,l:.0058},[tl[0]+tl[1]],out);
  return {skin:join(out.skin),nails:join(out.nails),creases:join(out.creases)};
}

function buildChildHands(add){
 for(const s of [-1,1]){
  const h=buildRightHand();for(const g of Object.values(h))g.translate(-HAND.wrist[0],-HAND.wrist[1],-HAND.wrist[2]).scale(.79,.75,.79).translate(.207,.608,.028);
  if(s<0)for(const g of Object.values(h))mirrorX(g);
  add(`hand-${s}`,'skin',h.skin);add(`nails-${s}`,'nail',h.nails);add(`finger-creases-${s}`,'skin-dark',h.creases);
 }
}
