// Metres, Y up, +Z front. Illustrated proportions take precedence over inconsistent sheet labels.
// v02 rebuilt hair, garments and boots; v03 refits the head, hairline and ears to the sheet's portraits.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildHeadGeometry,buildEyeGeometry,headSDF,profile,clamp,mix} from './caecilia_gabriel_head.js';
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
// Flat strip along a curve; `across` is the direction of its width.
function band(points,across,width,nv=28,uv=[.3,1]){const c=new THREE.CatmullRomCurve3(points,false,'centripetal');return surface((u,v)=>{const w=typeof width==='function'?width(v):width;return c.getPoint(v).addScaledVector(typeof across==='function'?across(v):across,(u-.5)*w);},6,nv,(p,u,v)=>[u*uv[0],v*uv[1]]);}
// One loop of a tied bow: a pinched band whose width runs along `up`.
function bowLoop(at,out,front,up,length,width,depth){return surface((u,v)=>{const a=Math.sin(PI*v),w=width*(.34+.66*a**.7)*(1-.22*a**8);return at.clone().addScaledVector(out,length*a).addScaledVector(front,depth*(.55*a+.45*Math.sin(TAU*v))).addScaledVector(up,(u-.5)*w-.12*length*a*a);},6,36,(p,u,v)=>[u*.3,v*.8]);}

const SKIRT=[[.292,.204,.138,0],[.35,.196,.136,0],[.48,.172,.123,0],[.64,.139,.100,0],[.776,.103,.076,0]];
const BODICE=[[.755,.103,.076,0],[.80,.104,.078,0],[.87,.111,.077,-.004],[.932,.115,.071,-.006],[.966,.089,.051,-.006],[.991,.040,.034,-.005]];
// Deep irregular folds that open towards the hem, plus fine gathers under the waist seam.
function skirtFold(a,y){const v=clamp((y-.292)/.484);return (.0030+.0040*(1-v))*Math.sin(11*a+.4+.8*Math.sin(3*a))+.0016*(1-v)*Math.sin(23*a+1.1)+.0015*v*v*v*Math.sin(46*a+.3);}
function skirtPoint(a,y,offset=0){const [rx,rz,cz]=profile(SKIRT,y),f=skirtFold(a,y);return V((rx+f+offset)*Math.sin(a),y,(rz+f*.65+offset)*Math.cos(a)+cz);}
const bodiceFold=(a,y)=>.0010*Math.sin(a*16+y*17)+.0012*smooth(.80,.765,y)*Math.sin(46*a+.3);
function bodicePoint(a,y,offset=0){const [rx,rz,cz]=profile(BODICE,y),f=bodiceFold(a,y);return V((rx+f+offset)*Math.sin(a),y,(rz+f*.6+offset)*Math.cos(a)+cz);}
function bodiceFront(x,y,offset=0){const [rx,rz,cz]=profile(BODICE,y),a=Math.asin(clamp(x/rx,-1,1));return V(x,y,cz+(rz+bodiceFold(a,y)*.6)*Math.cos(a)+offset);}
// Sleeve radius along the arm: full upper sleeve, bloused above the wrist, gathered into the cuff band.
const SLEEVE=[[0,.035],[.2,.036],[.5,.033],[.75,.034],[.86,.037],[.905,.031],[.93,.0215],[1,.0205]];

export function buildCaeciliaGabrielGeometry(){
 const parts=[],add=(name,material,geometry,extras={})=>{if(!geometry)return;geometry.computeBoundingBox();parts.push({name,material,geometry,...extras});};
 add('face','face',buildHeadGeometry());for(const s of [-1,1])add(`eye-${s}`,'eye',buildEyeGeometry(s));
 add('dress-skirt','wool',surface((u,v)=>skirtPoint(u*TAU,mix(.292,.776,v)),144,84,(p,u)=>[u*5,p.y/.25],true));
 add('bodice','wool',surface((u,v)=>bodicePoint(u*TAU,mix(.755,.991,v)),96,66,(p,u)=>[u*6,p.y/.20],true));
 const seams=[];for(const y of [.293,.321])seams.push(tube(Array.from({length:160},(_,i)=>skirtPoint(i/160*TAU,y,.0008)),.0006,200,5,true));
 for(const a of [PI/2,-PI/2]){seams.push(tube(Array.from({length:64},(_,i)=>skirtPoint(a,mix(.296,.750,i/63),.0009)),.00065,72,5));seams.push(tube(Array.from({length:20},(_,i)=>bodicePoint(a,mix(.790,.905,i/19),.0009)),.00065,24,5));}
 // Back yoke seam; the dress closes in front only.
 seams.push(tube(Array.from({length:40},(_,i)=>bodicePoint(mix(PI*.58,PI*1.42,i/39),.928,.0009)),.00065,48,5));
 add('dress-seams','thread',join(seams));
 add('front-placket','wool',surface((u,v)=>bodiceFront((u-.5)*.023,mix(.779,.968,v),.0018+.0006*Math.sin(u*PI)),6,50,(p,u)=>[u*.12,p.y/.20]));
 // Three pintucks on each side of the placket, and an inverted pleat down the centre back.
 const tucks=[];for(const s of [-1,1]){for(const x of [.026,.036,.046])tucks.push(tube(Array.from({length:24},(_,i)=>bodiceFront(s*x,mix(.792,.958-(x-.026)*.5,i/23),.0004)),.0011,40,5));
  tucks.push(tube(Array.from({length:16},(_,i)=>bodicePoint(PI+s*.085,mix(.792,.926,i/15),.0003)),.0011,24,5));}
 add('bodice-tucks','wool',join(tucks));
 const buttons=[];for(let i=0;i<5;i++){const p=bodiceFront(0,.946-i*.040,.0042);buttons.push(sphere(p.toArray(),[.0052,.0052,.0015],22,10));const rim=new THREE.TorusGeometry(.0046,.0009,6,22);rim.translate(p.x,p.y,p.z+.0004);buttons.push(rim);}
 add('bodice-buttons','button',join(buttons));
 // Round two-piece collar lying on the shoulder slope; its corners round off at the centre front.
 const collars=[];for(const s of [-1,1])collars.push(surface((u,v)=>{
   const a=mix(.035,PI,u),c=Math.cos(a),corner=a<.55?Math.sqrt(1-((.55-a)/.55)**2):1;
   const drop=(.017+.019*Math.max(0,c)**1.2+.004*Math.max(0,-c))*corner,y=mix(.9945,.9945-drop,v)+.0030*Math.sin(PI*clamp(v/.3))*(1-v);
   const [rx,rz,cz]=profile(BODICE,Math.min(y,.991)),off=.0036+.0016*Math.sin(PI*v)+.004*smooth(.991,.998,y);
   return V(s*(rx+off)*Math.sin(a),y,(rz+off)*c+cz);},64,14,(p,u,v)=>[u*1.6,v*.4]));
 add('collar','collar',join(collars),{doubleSided:true});
 for(const s of [-1,1]){
  const c=new THREE.CatmullRomCurve3([V(s*.101,.949,-.004),V(s*.146,.869,.000),V(s*.168,.774,.009),V(s*.190,.689,.018),V(s*.207,.608,.028)]);
  const section=(q,a,extra=0)=>{const p=c.getPoint(q),t=c.getTangent(q),n=new THREE.Vector3().crossVectors(t,V(0,0,1)).normalize();
   const head=.0016*Math.sin(a*9)*(1-smooth(.04,.26,q)),gather=.0021*Math.sin(a*11+q*9)*smooth(.55,.88,q)*(1-smooth(.905,.93,q));
   const r=Math.max(.0007,(profile(SLEEVE,q)[0]+head+gather)*Math.sin(PI/2*clamp(q/.10))+extra);return p.addScaledVector(n,Math.cos(a)*r).addScaledVector(V(0,0,1),Math.sin(a)*r*.90);};
  add(`sleeve-${s}`,'wool',surface((u,v)=>section(v*.955,-u*TAU),60,84,(p,u,v)=>[u*1.7,v*2.6],true));
  add(`cuff-${s}`,'wool',surface((u,v)=>section(mix(.925,1.0,v),-u*TAU,.0022+.0006*Math.sin(v*PI)),48,12,(p,u,v)=>[u*1.7,v*.3],true));
  // Outer back of the wrist on both arms.
  const cp=section(.964,s>0?PI+.6:-.6,.0040),cb=sphere(cp.toArray(),[.0052,.0052,.0052],18,12);add(`cuff-button-${s}`,'button',cb);
  add(`wrist-${s}`,'skin',surface((u,v)=>{const q=mix(.96,1.06,v),p=q<=1?c.getPoint(q):c.getPoint(1).addScaledVector(c.getTangent(1),(q-1)*.37),t=c.getTangent(Math.min(1,q)),n=new THREE.Vector3().crossVectors(t,V(0,0,1)).normalize(),a=-u*TAU;return p.addScaledVector(n,.016*Math.cos(a)).addScaledVector(V(0,0,1),.014*Math.sin(a));},36,20,(p,u,v)=>[u,v],true));
 }
 // Apron cloth gathered into the band: tight pleats at the top relax into a few soft folds.
 add('apron','linen',surface((u,v)=>{const a=mix(-.90,.90,u),y=mix(.353,.760,v),gather=.0021*v*v*Math.sin(u*74+2*Math.sin(u*9))*(.6+.4*Math.sin(u*5.3))+.0022*(1-v)*Math.sin(u*21+1.3*Math.sin(u*7)),p=skirtPoint(a,y,.0045+gather);p.y+=.0013*Math.sin(u*13)*(1-v)**8;return p;},120,72,(p,u,v)=>[u*1.5,v*2.1]),{doubleSided:true});
 const hems=[];for(const a of [-.90,.90])hems.push(tube(Array.from({length:64},(_,i)=>skirtPoint(a,mix(.355,.757,i/63),.0052)),.0007,80,5));
 hems.push(tube(Array.from({length:80},(_,i)=>skirtPoint(mix(-.90,.90,i/79),.355,.0052)),.0008,96,5));hems.push(tube(Array.from({length:80},(_,i)=>skirtPoint(mix(-.89,.89,i/79),.378,.0050)),.0005,96,5));add('apron-hems','linen',join(hems));
 const waist=(a,y,off)=>{const [rx,rz,cz]=y<.776?profile(SKIRT,y):profile(BODICE,y);return V((rx+off)*Math.sin(a),y,(rz+off+.002)*Math.cos(a)+cz);};
 add('waistband','linen',surface((u,v)=>waist(u*TAU,mix(.752,.787,v),.0050+.0022*Math.sin(v*PI)**.5),96,10,(p,u,v)=>[u*4,v*.2],true));
 const back=waist(PI,.770,.008),X=V(1,0,0),Y=V(0,1,0),Zb=V(0,0,-1);
 add('apron-bow-knot','linen',sphere([0,.770,back.z-.006],[.012,.013,.008]));
 for(const s of [-1,1]){
  add(`apron-bow-${s}`,'linen',bowLoop(V(s*.006,.771,back.z-.005),V(s*.95,.31,0),Zb,V(-s*.31,.95,0),.058,.036,.020),{doubleSided:true});
  add(`apron-tie-${s}`,'linen',surface((u,v)=>{const y=mix(.768,.612,v),a=PI+s*mix(.05,.20,v)+(u-.5)*.028/profile(SKIRT,y)[0];const p=skirtPoint(a,y,.0065+.0025*Math.sin(v*7+s));p.z-=.004*(1-v)**3;return p;},6,36,(p,u,v)=>[u*.3,v*1.2]),{doubleSided:true});
 }
 // Wearer's right, as drawn on the approved back view.
 add('back-patch','patch',surface((u,v)=>{const y=mix(.345,.405,v)+.0012*Math.sin(u*7),a=PI+mix(.065,.385,u)+.004*Math.sin(v*6);return skirtPoint(a,y,.0016);},20,18,(p,u,v)=>[u,v]),{doubleSided:true});
 const stitches=[];for(let i=0;i<26;i++){const k=i/26*4,e=Math.floor(k),f=k-e,[u,v]=e===0?[f,0]:e===1?[1,f]:e===2?[1-f,1]:[0,1-f],q=(du,dv)=>skirtPoint(PI+mix(.065,.385,clamp(u+du,-.06,1.06)),mix(.345,.405,clamp(v+dv,-.08,1.08)),.0022),o=e%2?[.06,0]:[0,.08];stitches.push(tube([q(-o[0],-o[1]),q(o[0],o[1])],.0005,2,4));}
 add('patch-stitches','thread',join(stitches));
 buildBoots(add);buildChildHands(add);buildHair(add);buildEars(add);
 for(const s of [-1,1])add(`stocking-${s}`,'stocking',loft([[.075,.024,.027,-.015],[.16,.026,.029,-.010],[.25,.034,.038,-.008],[.37,.035,.037,-.002],[.52,.040,.042,0]],48,48,(a,y)=>.00045*Math.cos(a*17)+.0007*gauss(a,y,PI,.105,.9,.012)+.0006*gauss(a,y,PI,.128,.9,.010),.12).translate(s*.058,0,0));
 // The illustrated head is larger than its printed 20 cm label; hair and braids are authored at this final size.
 for(const part of parts){
  if(part.name==='face'||part.name.startsWith('eye-')||part.name.startsWith('ear-'))part.geometry.scale(...HEAD_SCALE).translate(0,HEAD_DROP,0);
  part.geometry.computeBoundingBox();
 }
 return {parts,metadata:{name:'Caecilia Gabriel',age:7,modelVersion:3,height:1.22,units:'metres',front:'+Z',pose:'relaxed standing',concept:'caecilia_gabriel_concept_v01.png',dimensionPolicy:'Illustrated head, hem, apron, and braid lengths; printed total height 122 cm'}};
}

// Lace-up ankle boot: toe cap, facings, tongue, back strap, welted leather sole and a low stacked heel.
const BOOT=[[.011,.036,.094,.037],[.026,.039,.096,.037],[.044,.038,.090,.033],[.058,.035,.070,.018],[.072,.032,.050,.000],[.090,.030,.040,-.012],[.123,.031,.038,-.016]];
const heelLift=(z,y)=>.008*(1-smooth(-.020,.040,z))*(1-clamp((y-.010)/.055));
function bootPoint(a,y,off=0){const [rx,rz,cz]=profile(BOOT,y),crease=.0008*Math.sin(y*190+a*2)*clamp((.115-y)/.05)+.0011*Math.cos(a)*gauss(a,y,0,.060,1.1,.004)+.0009*Math.cos(a)*gauss(a,y,0,.068,1.1,.003);
 const p=V((rx+crease+off)*Math.sin(a),y,(rz+crease+off)*Math.cos(a)+cz);p.y+=heelLift(p.z,y);return p;}
function buildBoots(add){
 for(const s of [-1,1]){
  const tr=g=>g.translate(s*.058,0,0);
  const sole=loft([[.001,.0365,.0965,.036],[.004,.0385,.0985,.036],[.0085,.0385,.0985,.036],[.0105,.037,.097,.036]],64,8,null,.16),sp=sole.attributes.position;
  for(let i=0;i<sp.count;i++)sp.setY(i,sp.getY(i)+.008*(1-smooth(-.020,.040,sp.getZ(i))));sole.computeVertexNormals();
  const heel=loft([[.001,.036,.035,-.028],[.004,.0375,.0365,-.028],[.0175,.0375,.0365,-.028]],40,6,null,.16);
  heel.setIndex([...heel.index.array,...Array.from({length:38},(_,i)=>[0,i+2,i+1]).flat()]);
  add(`boot-sole-${s}`,'sole',tr(join([sole,heel])));
  add(`boot-upper-${s}`,'leather',tr(surface((u,v)=>bootPoint(u*TAU,mix(.011,.123,v)),72,56,(p,u,v)=>[u*4,v*.8],true)));
  const f=(x,y,off=.0014)=>{const [rx,rz,cz]=profile(BOOT,y),p=V(x,y,cz+rz*Math.sqrt(Math.max(0,1-(x/rx)**2))+off);p.y+=heelLift(p.z,y);return p;},laces=[],eyelets=[],trim=[],thread=[];
  for(let i=0;i<5;i++){const y=.066+i*.012,w=mix(.016,.013,i/4);
   for(const a of [-1,1]){const ring=new THREE.TorusGeometry(.0015,.0005,5,12),p=f(a*w,y);ring.translate(p.x,p.y,p.z);eyelets.push(ring);}
   if(i<4){const nw=mix(.016,.013,(i+1)/4);laces.push(tube([f(-w,y),f(0,y+.006,.0022),f(nw,y+.012)],.0009,12,5),tube([f(w,y),f(0,y+.006,.0030),f(-nw,y+.012)],.0009,12,5));}
  }
  // Small bow at the top eyelets.
  const top=f(0,.116,.0035);for(const a of [-1,1])laces.push(tube([top,V(a*.010,top.y+.004,top.z+.003),V(a*.015,top.y-.004,top.z+.002),V(a*.006,top.y-.003,top.z+.001),top],.0008,20,5),tube([top,V(a*.006,top.y-.012,top.z+.004),V(a*.009,top.y-.022,top.z+.006)],.0008,10,5));
  add(`boot-tongue-${s}`,'leather',tr(surface((u,v)=>f(mix(-.011,.011,u),mix(.060,.128,v),-.0004+.0012*Math.sin(u*PI)),8,24,(p,u,v)=>[u*.3,v*.5])),{doubleSided:true});
  for(const a of [-1,1])trim.push(tube(Array.from({length:12},(_,i)=>{const y=mix(.060,.122,i/11);return f(a*mix(.0195,.0165,i/11),y,.0006);}),.0013,20,5));
  // Toe-cap seam: where the vamp surface crosses a vertical plane behind the toes.
  const cap=[];for(let i=0;i<=40;i++){const k=i/40*2-1,y=.0125+.041*(1-k*k),[rx,rz,cz]=profile(BOOT,y),q=(.094-cz)/rz;if(Math.abs(q)<1){const p=V(Math.sign(k)*rx*Math.sqrt(1-q*q),y,.094);p.y+=heelLift(p.z,y);cap.push(p);}}
  trim.push(tube(cap,.0012,56,5));thread.push(tube(cap.map(p=>V(p.x*.985,p.y,p.z+.004)),.0004,56,4),tube(cap.map(p=>V(p.x*.985,p.y,p.z-.004)),.0004,56,4));
  trim.push(tube(Array.from({length:48},(_,i)=>bootPoint(i/48*TAU,.1215,.0008)),.0017,64,6,true));
  add(`boot-trim-${s}`,'leather',tr(join(trim)));
  add(`boot-strap-${s}`,'leather',tr(join([surface((u,v)=>bootPoint(PI+(u-.5)*.36,mix(.022,.123,v),.0014),4,24,(p,u,v)=>[u*.2,v*.6]),tube([bootPoint(PI-.12,.119,.0016),bootPoint(PI-.09,.128,.003),bootPoint(PI,.134,.004),bootPoint(PI+.09,.128,.003),bootPoint(PI+.12,.119,.0016)],.0016,18,6)])),{doubleSided:true});
  thread.push(tube(Array.from({length:64},(_,i)=>{const a=i/64*TAU,z=.036+.0978*Math.cos(a);return V(.0378*Math.sin(a),.0122+.008*(1-smooth(-.020,.040,z)),z);}),.0005,96,4,true));
  add(`boot-laces-${s}`,'lace',tr(join(laces)));add(`boot-eyelets-${s}`,'metal',tr(join(eyelets)));add(`boot-stitches-${s}`,'thread',tr(join(thread)));
 }
}

// The v01 head scale, kept so the face texture registration is unchanged.
const HEAD_SCALE=[1.10,1.075,1.04],HEAD_DROP=-.0915,CENTRE=V(0,1.100,-.008);
// Sheet measurements are in the head generator's unscaled metres; this puts them on the finished head.
const onHead=(x,y,z)=>V(x*HEAD_SCALE[0],y*HEAD_SCALE[1]+HEAD_DROP,z*HEAD_SCALE[2]);
const insideHead=p=>headSDF(p.x/HEAD_SCALE[0],(p.y-HEAD_DROP)/HEAD_SCALE[1],p.z/HEAD_SCALE[2])<0;
function skullRadius(d){let r=.17;const p=V(0,0,0);while(r>0&&!insideHead(p.copy(CENTRE).addScaledVector(d,r)))r-=.003;let lo=r,hi=r+.003;for(let i=0;i<12;i++){const m=(lo+hi)/2;insideHead(p.copy(CENTRE).addScaledVector(d,m))?lo=m:hi=m;}return lo;}
// Hair is drawn from the centre parting round the head to a gather behind and below each ear, where the plait begins.
const GATHER=s=>onHead(s*.069,1.060,-.041);
const dirTo=p=>p.clone().sub(CENTRE).normalize();
// Front edge of the hair as drawn: forehead, temple, over the top of the ear, down behind it. The ear stays uncovered.
const HAIRLINE=[[0,[0,1.166,.089]],[.10,[.026,1.158,.080]],[.22,[.044,1.130,.055]],[.40,[.058,1.108,.022]],[.57,[.070,1.114,-.012]],[.78,[.068,1.090,-.037]],[1,[.069,1.060,-.041]]];
function hairline(s,v){
 let i=0;while(i<HAIRLINE.length-2&&v>HAIRLINE[i+1][0])i++;
 const k=j=>{const [x,y,z]=HAIRLINE[clamp(j,0,HAIRLINE.length-1)][1];return dirTo(onHead(s*x,y,z));},u=clamp((v-HAIRLINE[i][0])/(HAIRLINE[i+1][0]-HAIRLINE[i][0]));
 // Catmull-Rom through the neighbouring directions
 const a=k(i-1),b=k(i),c=k(i+1),e=k(i+2),cr=n=>.5*(2*b[n]+(c[n]-a[n])*u+(2*a[n]-5*b[n]+4*c[n]-e[n])*u*u+(-a[n]+3*b[n]-3*c[n]+e[n])*u*u*u);
 return V(cr('x'),cr('y'),cr('z')).normalize();
}
const HAIR_MID=[[0,.89,.06,.45],[.06,.95,.16,.26],[.286,.94,.33,-.08],[.74,.78,-.22,-.58],[1,.47,-.72,-.52]];
const PART_FRONT=.555,PART_NAPE=4.10; // angle of the parting above the forward axis: forehead hairline to nape
function arc(s,t,v){
 const psi=mix(PART_FRONT,PART_NAPE,t),d0=V(0,Math.sin(psi),Math.cos(psi)),d1=dirTo(GATHER(s)),m=profile(HAIR_MID,t),mid=V(s*m[0],m[1],m[2]).normalize();
 const ctl=mid.multiplyScalar(4).sub(d0).sub(d1).multiplyScalar(.5);return d0.multiplyScalar((1-v)**2).addScaledVector(ctl,2*v*(1-v)).addScaledVector(d1,v*v).normalize();
}
function hairPoint(s,t,v){
 // Strands near the forehead follow the drawn hairline; further back they fall straight to the gather.
 const lift=1-smooth(0,.16,t),d=arc(s,t,v);
 if(lift>0)d.addScaledVector(hairline(s,v).sub(arc(s,0,v)),lift).normalize();
 const edge=.45+.55*smooth(0,.07,t)*smooth(0,.05,1-t),w=smooth(.86,1,v);
 const locks=(.0010*Math.sin(TAU*17*t+2.1*Math.sin(7*t))+.0006*Math.sin(TAU*41*t+1+3*Math.sin(3*t)))*smooth(.05,.3,v);
 const p=CENTRE.clone().addScaledVector(d,skullRadius(d)+(.0012+.0030*smooth(0,.10,v)+.0085*Math.sin(PI*Math.min(1,v*1.08))**.9)*edge+locks*(1-.6*w));
 return p.lerp(GATHER(s).add(V(s*(.002+.006*Math.sin(PI*t)),.015*Math.cos(PI*t),.014*(1-2*t))),w);
}
function plait(s){
 const g=GATHER(s),c=new THREE.CatmullRomCurve3([g,V(s*.084,1.020,-.030),V(s*.086,.996,-.004),V(s*.080,.974,.027),V(s*.076,.960,.039)],false,'centripetal'),turns=3.5;
 const frame=v=>{const p=c.getPoint(v),t=c.getTangent(v),w=V(1,0,0).addScaledVector(t,-t.x).normalize(),f=new THREE.Vector3().crossVectors(t,w).normalize();return {p,w,f};};
 const centre=(k,v)=>{const {p,w,f}=frame(clamp(v)),a=v*TAU*turns+k*TAU/3,g=.62+.38*smooth(0,.14,v)-.12*smooth(.8,1,v);return p.addScaledVector(w,.0052*g*Math.sin(a)).addScaledVector(f,.0026*g*Math.sin(2*a));};
 const strands=[];for(let k=0;k<3;k++)strands.push(surface((u,v)=>{
   // Sections follow the strand; the shallow front-to-back weave keeps the inside of each turn from folding over.
   const p=centre(k,v),t=centre(k,v+.004).sub(centre(k,v-.004)).normalize(),{f}=frame(v),thin=f.addScaledVector(t,-f.dot(t)).normalize(),wide=new THREE.Vector3().crossVectors(t,thin),g=.62+.38*smooth(0,.14,v)-.12*smooth(.8,1,v),a=u*TAU;
   return p.addScaledVector(thin,.0036*g*Math.cos(a)).addScaledVector(wide,.0062*g*Math.sin(a));},12,150,(p,u,v)=>[u*1.2,v*3],true));
 return {geometry:join(strands),end:c.getPoint(1)};
}
function buildHair(add){
 const halves=[];for(const s of [-1,1])halves.push(surface((u,v)=>hairPoint(s,s>0?1-u:u,v),132,40,(p,u,v)=>[u*9,v*1.7]));
 add('hair-cap','hair',join(halves));
 for(const s of [-1,1]){
  const {geometry,end}=plait(s);add(`braid-${s}`,'hair',geometry);
  // Loose end below the ribbon, resting on the bodice.
  const tail=[end,V(s*.074,.940,.051),V(s*.072,.916,.060)],tc=new THREE.CatmullRomCurve3(tail),tails=[surface((u,v)=>{const p=tc.getPoint(v),r=mix(.0085,.0022,v**1.4)*(1+.10*Math.sin(u*TAU*7)),a=u*TAU;return p.add(V(Math.cos(a)*r,0,Math.sin(a)*r*.75));},18,24,(p,u,v)=>[u*1.2,v*.8],true)];
  for(let k=0;k<9;k++){const a=k/9*TAU;tails.push(tube([end.clone().add(V(Math.cos(a)*.006,-.004,Math.sin(a)*.004)),V(s*.074+Math.cos(a)*.007,.938,.052+Math.sin(a)*.004),V(s*.072+Math.cos(a)*.006,.910-.003*Math.sin(a*2),.061+Math.sin(a)*.003)],.0007,16,5));}
  add(`braid-tail-${s}`,'hair',join(tails));
  const at=end.clone().add(V(0,0,.0105)),X=V(1,0,0),Y=V(0,1,0),Z=V(0,0,1);
  add(`hair-bow-knot-${s}`,'collar',sphere(at.toArray(),[.0052,.0058,.0040]));
  for(const b of [-1,1])add(`hair-bow-${s}-${b}`,'collar',bowLoop(at.clone().add(V(b*.002,.001,0)),X.clone().multiplyScalar(b),Z,Y,.022,.013,.006),{doubleSided:true});
  add(`hair-ribbon-${s}`,'collar',join([-1,1].map(b=>band([at.clone().add(V(b*.002,-.002,.001)),at.clone().add(V(b*.009,-.018,.006)),at.clone().add(V(b*.012,-.034,.011))],X,v=>.009+.002*v,16))),{doubleSided:true});
 }
}
// Ears as the sheet's profile shows them: 49 mm tall, 30 mm deep, lobe at 1.063, standing a little off the head.
// Authored in the head generator's unscaled metres; the head scale is applied with the face.
function buildEars(add){
 const C=[.0650,1.0875,-.0155],H=.0240,D=.0145;
 for(const s of [-1,1]){
  const place=g=>{g.rotateX(-.16);g.rotateY(-s*.36);g.translate(s*C[0],C[1],C[2]);
   // Side-on projection of the sheet's ear: see tools/caecilia_gabriel_textures.py
   const p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,clamp((p.getZ(i)+.034)/.036),clamp((p.getY(i)-1.058)/.052));return g;};
  // Outline at angle a (0 = front, 90 deg = top): narrow lobe that sits forward, full upper ear.
  const rim=(a,k=1)=>{const y=Math.sin(a),lobe=Math.max(0,-y);return V(0,H*y*k,(D*Math.cos(a)*(1-.36*lobe**1.3)+.0034*lobe)*k);};
  const shell=new THREE.SphereGeometry(1,36,26),p=shell.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),lobe=Math.max(0,-y),out=s*x>0?1:0;
   // concha: a bowl in the outer face, in front of the middle of the ear
   const bowl=out*Math.exp(-(((y-.12)/.38)**2+((z-.18)/.42)**2));
   p.setXYZ(i,(Math.abs(x)*.0042*(s*x>0?1:.6)-bowl*.0030)*Math.sign(x||s),H*y,D*z*(1-.36*lobe**1.3)+.0034*lobe);}
  shell.computeVertexNormals();{const n=shell.attributes.normal;for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))>H*.9999)n.setXYZ(i,0,Math.sign(p.getY(i)),0);}add(`ear-${s}`,'ear',place(shell));
  // helix from the front root over the top and down the back to the lobe; antihelix inside it
  const helix=tube(Array.from({length:36},(_,i)=>{const a=mix(.35,4.45,i/35),q=rim(a,.94);q.x=s*.0030;return q;}),.0017,64,7);
  const anti=tube(Array.from({length:20},(_,i)=>{const a=mix(.9,4.1,i/19),q=rim(a,.60);q.z-=.0015;q.x=s*.0026;return q;}),.0013,36,6);
  add(`ear-helix-${s}`,'ear',place(join([helix,anti])));
  add(`ear-tragus-${s}`,'ear',place(sphere([s*.0022,-.0012,.0098],[.0024,.0036,.0030],14,10)));
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
