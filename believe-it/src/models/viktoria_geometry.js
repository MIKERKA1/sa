// Viktoria Gabriel v12: concept proportions in metres, Y up, +Z front.
// This offline builder is intentionally independent of DOM and renderer state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHeadGeometry, buildEyeGeometry, frontZ, headUV, radialHit as faceHit, headSDF } from './viktoria_head.js';
import {hairlineHeight,buildSweptHair,buildSculptedEars} from './viktoria_details.js';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
const PI = Math.PI, TAU = PI*2;
const mix = (a,b,t) => a+(b-a)*t;
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
const smooth=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0));return t*t*(3-2*t);};
const gauss = (x,y,cx,cy,rx,ry) => Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));

function profile(rows,y) {
  let i=0;
  while(i<rows.length-2 && y>rows[i+1][0]) i++;
  const t=clamp((y-rows[i][0])/(rows[i+1][0]-rows[i][0]));
  const a=rows[Math.max(0,i-1)],b=rows[i],c=rows[i+1],d=rows[Math.min(rows.length-1,i+2)],span=c[0]-b[0];
  return b.slice(1).map((value,k)=> {
    const j=k+1,m0=(c[j]-a[j])/(c[0]-a[0]),m1=(d[j]-b[j])/(d[0]-b[0]);
    const result=(2*t*t*t-3*t*t+1)*value+(t*t*t-2*t*t+t)*span*m0+(-2*t*t*t+3*t*t)*c[j]+(t*t*t-t*t)*span*m1;
    return clamp(result,Math.min(value,c[j]),Math.max(value,c[j]));
  });
}

function surface(fn,nu,nv,uvFn=null,closed=false) {
  const p=[],uv=[],idx=[];
  for(let j=0;j<=nv;j++) for(let i=0;i<=nu;i++) {
    const u=i/nu,v=j/nv,q=fn(u,v);
    p.push(q.x,q.y,q.z);
    uv.push(...(uvFn?uvFn(q,u,v):[u,v]));
  }
  for(let j=0;j<nv;j++) for(let i=0;i<nu;i++) {
    const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;
    idx.push(a,b,c,b,d,c);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  if(closed) {
    const n=g.attributes.normal;
    for(let j=0;j<=nv;j++) {
      const a=j*(nu+1),b=a+nu;
      const q=V(n.getX(a)+n.getX(b),n.getY(a)+n.getY(b),n.getZ(a)+n.getZ(b)).normalize();
      n.setXYZ(a,q.x,q.y,q.z);n.setXYZ(b,q.x,q.y,q.z);
    }
  }
  return g;
}

function loft(rows,nu=96,nv=80,fold=null,tile=.22) {
  return surface((u,v)=> {
    const y=mix(rows[0][0],rows.at(-1)[0],v),[rx,rz,cz]=profile(rows,y),a=u*TAU;
    const f=fold?fold(a,y,v):0;
    return V((rx+f)*Math.sin(a),y,(rz+f*.6)*Math.cos(a)+cz);
  },nu,nv,(p,u)=>[u*1.2/tile,p.y/tile],true);
}

function tube(points,r=.0015,segments=24,sides=6,closed=false) {
  const curve=new THREE.CatmullRomCurve3(points,closed,'centripetal');
  return new THREE.TubeGeometry(curve,segments,r,sides,closed);
}

function sphere(pos,scale,nu=32,nv=24) {
  const g=new THREE.SphereGeometry(1,nu,nv);
  g.scale(...scale);g.translate(...pos);return g;
}

function join(gs) {
  if(!gs.length) return null;
  return mergeGeometries(gs.every(g=>g.index)?gs:gs.map(g=>g.index?g.toNonIndexed():g));
}

const HEAD=[
  [1.31,.025,.029,.032],[1.326,.047,.047,.028],[1.35,.070,.064,.013],
  [1.395,.085,.074,.008],[1.445,.086,.078,.006],[1.482,.083,.077,.001],
  [1.522,.075,.069,-.004],[1.551,.043,.040,-.009],[1.565,.002,.003,-.009],
];
const SKIRT=[[.19,.232,.149,.003],[.27,.223,.147,.003],[.53,.201,.136,0],[.79,.178,.123,0],[.94,.147,.104,0],[1.026,.117,.081,0]];
const BODICE=[[1.013,.117,.081,0],[1.12,.122,.090,.001],[1.224,.144,.099,-.005],[1.282,.150,.080,-.009],[1.316,.111,.058,-.003],[1.326,.047,.042,-.009]];
const bodiceFold=(a,y)=>.0013*Math.sin(19*a+y*26);
function bodiceFront(x,y,offset=0) {
  const [rx,rz,cz]=profile(BODICE,y),a=Math.asin(clamp(x/rx,-1,1));
  return V(x,y,cz+(rz+bodiceFold(a,y)*.6)*Math.cos(a)+offset);
}

function skirtPoint(a,y,offset=0) {
  const [rx,rz,cz]=profile(SKIRT,y),v=(y-.265)/(.761);
  const f=(.006+.004*(1-v))*Math.sin(23*a+.35)+.0022*Math.sin(47*a+.5+y*1.5);
  return V((rx+f+offset)*Math.sin(a),y,(rz+f*.65+offset)*Math.cos(a)+cz);
}

function clothRibbon(points,width,roll=0,taper=false) {
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
  return surface((u,v)=> {
    const p=curve.getPoint(v),d=curve.getTangent(v).normalize();
    const w=V(1,0,0).addScaledVector(d,-d.x).normalize();
    const n=new THREE.Vector3().crossVectors(d,w).normalize();
    const a=roll*Math.sin(v*PI),t=(u-.5)*width*(.96+.04*Math.sin(v*9))*(taper?1-.8*clamp((v-.68)/.32):1);
    return p.addScaledVector(w,t*Math.cos(a)).addScaledVector(n,t*Math.sin(a)+.001*Math.sin(u*TAU));
  },8,42,(p,u,v)=>[u*.2,v*1.3]);
}

export function buildViktoriaGeometry() {
  const parts=[];
  const add=(name,material,geometry,extras={})=> {
    if(!geometry) return;
    geometry.computeBoundingBox();
    parts.push({name,material,geometry,...extras});
  };
  add('face','face',buildHeadGeometry());
  for(const s of [-1,1]) add(`eye-${s}`,'eye',buildEyeGeometry(s));
  add('dress-skirt','wool',surface((u,v)=>skirtPoint(u*TAU,mix(.265,1.026,v)),144,112,(p,u)=>[u*6,p.y/.27],true));
  const hem=[];
  for(const y of [.267,.274]) hem.push(tube(Array.from({length:145},(_,i)=>skirtPoint(i/144*TAU,y,.001)),.0016,192,5,true));
  add('skirt-hem','wool',join(hem));
  add('bodice','blouse',loft(BODICE,96,80,bodiceFold,.22));
  // Follow the v05 throat axis; the old forward offset cut through its back.
  add('collar','blouse',loft([[1.293,.052,.046,-.004],[1.315,.048,.043,-.008],[1.332,.043,.041,-.010]],56,24,null,.14),{doubleSided:true});
  add('front-placket','blouse',surface((u,v)=> {
    return bodiceFront((u-.5)*.022,mix(1.024,1.294,v),.0025);
  },6,60,(p,u)=>[u*.15,p.y/.22]));
  const buttons=[];
  for(let i=0;i<8;i++) {
    const y=1.062+i*.032,p=bodiceFront(0,y,.005);
    buttons.push(sphere(p.toArray(),[.0053,.0053,.0018],20,12));
  }
  add('bodice-buttons','button',join(buttons));
  for(const side of [-1,1]) {
    const shoulder=V(side*.135,1.297,-.004),elbow=V(side*.202,1.036,.017),wrist=V(side*.241,.819,.047);
    const curve=new THREE.CatmullRomCurve3([shoulder,V(side*.178,1.16,.006),elbow,V(side*.224,.923,.03),wrist]);
    add(`sleeve-${side}`,'blouse',surface((u,v)=> {
      v*=.62;const p=curve.getPoint(v),t=curve.getTangent(v),b=V(0,0,1),n=new THREE.Vector3().crossVectors(t,b).normalize(),a=-u*TAU;
      let r=(mix(.050,.031,v)+.004*Math.sin(v*PI))*Math.sin(PI/2*clamp(v/.12));
      r+=.0015*Math.sin(v*73+Math.sin(a*3))*Math.sin(v*PI)+.001*Math.cos(a*9)*clamp(v/.12);
      r=Math.max(.001,r);
      return p.addScaledVector(n,Math.cos(a)*r).addScaledVector(b,Math.sin(a)*r*.9);
    },56,76,(p,u,v)=>[u*1.5,v*2.8],true));
    // v01: sleeves rolled up just below the elbow, bare forearms (concept)
    add(`cuff-${side}`,'blouse',surface((u,v)=> {
      const q=mix(.575,.645,v),p=curve.getPoint(q),t=curve.getTangent(q),n=new THREE.Vector3().crossVectors(t,V(0,0,1)).normalize(),a=-u*TAU;
      const r=mix(.0425,.0415,v)+.0042*Math.sin(v*PI)+.0010*Math.sin(a*7+v*3);
      return p.addScaledVector(n,Math.cos(a)*r).addScaledVector(V(0,0,1),Math.sin(a)*r*.9);
    },48,14,(p,u,v)=>[u*1.5,v*.3],true));
    add(`forearm-${side}`,'skin',surface((u,v)=> {
      const q=mix(.60,1,v),p=curve.getPoint(q),t=curve.getTangent(q),n=new THREE.Vector3().crossVectors(t,V(0,0,1)).normalize(),a=-u*TAU;
      const r=mix(.0295,.0205,smooth(0,1,v))+.0032*Math.exp(-(((v-.22)/.22)**2))*Math.max(0,Math.cos(a+.6));
      return p.addScaledVector(n,Math.cos(a)*r).addScaledVector(V(0,0,1),Math.sin(a)*r*.86);
    },40,40,(p,u,v)=>[u*.5,v*1.2],true));
  }
  add('apron','linen',surface((u,v)=> {
    const a=mix(-1.22,1.22,u),y=mix(.339,1.031,v),p=skirtPoint(a,y,.0065);
    p.z+=.002*Math.sin(u*33)*v;
    p.y+=.0025*Math.sin(u*14)*(1-v)**6;
    return p;
  },104,104,(p,u,v)=>[u*1.55,v*2.4]),{doubleSided:true});
  const apronHems=[];
  for(const u of [0,1]) apronHems.push(tube(Array.from({length:70},(_,i)=>skirtPoint(mix(-1.22,1.22,u),mix(.340,1.028,i/69),.008)),.0014,92,5));
  apronHems.push(tube(Array.from({length:100},(_,i)=>skirtPoint(mix(-1.22,1.22,i/99),.340,.008)),.0016,126,5));
  add('apron-hems','linen',join(apronHems));
  // The belt encloses both garment layers, including the apron's gathered folds.
  add('waistband','linen',surface((u,v)=> {
    const a=u*TAU,y=mix(1.017,1.047,v),[sx,sz]=profile(SKIRT,y),[bx,bz,cz]=profile(BODICE,y);
    return V((Math.max(sx,bx)+.010)*Math.sin(a),y,(Math.max(sz,bz)+.014)*Math.cos(a)+cz);
  },112,12,(p,u)=>[u*5,p.y/.24],true));
  add('apron-bow-knot','linen',sphere([0,1.032,-.105],[.013,.011,.008],28,20));
  for(const s of [-1,1]) {
    add(`apron-bow-${s}`,'linen',clothRibbon([V(0,1.034,-.112),V(s*.038,1.044,-.125),V(s*.055,1.018,-.125),V(s*.025,1.012,-.123),V(0,1.034,-.113)],.013,.9),{doubleSided:true});
    add(`apron-tie-${s}`,'linen',clothRibbon([V(s*.007,1.028,0),V(s*.020,.960,0),V(s*.022,.880,0),V(s*.026,.810,0),V(s*.034,.765+(s>0?.022:0),0)].map(p=>{p.z=-profile(SKIRT,p.y)[1]-.032;return p;}),.023,.25),{doubleSided:true});
  }
  buildBoots(add);
  buildHands(add);
  buildHairScarf(add);
  buildVest(add);
  buildSculptedEars(add);
  buildStockings(add);
  buildPatches(add);
  for(const p of parts){p.geometry.scale(SC,SC,SC);p.geometry.computeBoundingBox();}
  return {parts,metadata:{name:'Viktoria Gabriel',height:1.633,units:'metres',front:'+Z',pose:'relaxed standing',concept:'viktoria_gabriel_concept_v01.png'}};
}

function buildBoots(add) {
  for(const s of [-1,1]) {
    const x=s*.088,transform=g=>{g.rotateY(s*.065);g.translate(x,0,0);return g;};
    add(`boot-sole-${s}`,'sole',transform(loft([[.006,.046,.109,.037],[.016,.051,.118,.04],[.029,.051,.118,.04],[.034,.047,.112,.04]],64,12,null,.16)));
    add(`boot-upper-${s}`,'leather',transform(loft([[.03,.047,.110,.039],[.055,.05,.112,.04],[.080,.047,.091,.034],[.116,.04,.059,-.002],[.169,.035,.043,-.018],[.205,.034,.038,-.023]],80,64,(a,y)=>.0013*Math.sin(y*165+a*2)*clamp((.16-y)/.05),.16)));
    const laces=[],eyelets=[],stitches=[];
    const shoeRows=[[.03,.047,.110,.039],[.055,.05,.112,.04],[.080,.047,.091,.034],[.116,.04,.059,-.002],[.169,.035,.043,-.018],[.205,.034,.038,-.023]];
    const front=(xx,y)=>{const [rx,rz,cz]=profile(shoeRows,y);return V(xx,y,cz+rz*Math.sqrt(Math.max(0,1-(xx/rx)**2))+.0016);};
    for(let i=0;i<6;i++) {
      const y=.085+i*.018,w=mix(.021,.014,i/5);
      for(const side of [-1,1]) {
        const ring=new THREE.TorusGeometry(.0025,.0006,5,12);
        const p=front(side*w,y);ring.translate(p.x,p.y,p.z);eyelets.push(ring);
      }
      if(i<5) {
        const nw=mix(.021,.014,(i+1)/5);
        laces.push(tube([front(-w,y),front(0,y+.009),front(nw,y+.018)],.00115,12,5));
        laces.push(tube([front(w,y),front(0,y+.009).add(V(0,0,.001)),front(-nw,y+.018)],.00115,12,5));
      }
    }
    for(let i=0;i<62;i++) {
      const a=i/62*TAU;
      stitches.push(tube([V(.05*Math.sin(a),.030,.04+.116*Math.cos(a)),V(.05*Math.sin(a+.022),.031,.04+.116*Math.cos(a+.022))],.00055,2,4));
    }
    add(`boot-laces-${s}`,'lace',transform(join(laces)));
    add(`boot-eyelets-${s}`,'metal',transform(join(eyelets)));
    add(`boot-welt-stitches-${s}`,'stitch',transform(join(stitches)));
  }
}

// v02 hands: relaxed anatomical pose. Palm faces the thigh, thumb points forward,
// slim elderly fingers with knobby joints and a natural curl that grows from index to pinky.
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
    let k=0;for(const fg of HAND.fingers)k+=.0026*gauss(f,d,fg.f,fg.d-.002,.0062,.0065)+.0006*gauss(f,d,fg.f,.055,.0022,.028);
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
    const rFn=k=>{let w=mix(.0080,.0058,clamp(k/len))+.0006*g1(k,.006)+.0008*g1(k-l0,.0045)+.00055*g1(k-l0-l1,.0038)-.0003*g1(k-l0*.5,.008)-.0003*g1(k-l0-l1*.5,.005);
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
function buildHands(add) {
  for(const s of [-1,1]) {
    const h=buildRightHand();
    for(const g of Object.values(h))g.translate(-HAND.wrist[0],-HAND.wrist[1],-HAND.wrist[2]).scale(.92,.96,.92).translate(...HAND.wrist);
    if(s<0){mirrorX(h.skin);mirrorX(h.nails);mirrorX(h.creases);}
    add(`hand-${s}`,'skin',h.skin);
    add(`nails-${s}`,'nail',h.nails);
    add(`finger-creases-${s}`,'skin-dark',h.creases);
  }
}

function buildKerchief(add) {
  const rows=[[1.291,.042,.045,.028,0],[1.32,.069,.064,.013,.48],[1.365,.101,.088,0,.96],[1.438,.103,.099,-.005,1.05],[1.489,.1,.097,-.007,.93],[1.524,.085,.084,-.01,.61],[1.555,.062,.056,-.012,0],[1.578,.002,.002,-.012,0]];
  // v05: visible skin half-width measured on the concept sheet (kerchief inner edge), metres.
  // The opening follows it and the cloth near the edge is pulled onto the face, so no untextured cheek shows.
  const HW=[[1.330,.028],[1.345,.040],[1.360,.049],[1.375,.053],[1.390,.057],[1.410,.061],[1.430,.064],[1.455,.062],[1.480,.059],[1.500,.052],[1.522,.046]];
  const hwAt=y=>{if(y<=HW[0][0])return HW[0][1];for(let i=1;i<HW.length;i++)if(y<=HW[i][0]){const t=(y-HW[i-1][0])/(HW[i][0]-HW[i-1][0]);return mix(HW[i-1][1],HW[i][1],t);}return HW.at(-1)[1];};
  const edgeCache=new Map();
  const edgeAngle=y=>{const key=y.toFixed(5);if(edgeCache.has(key))return edgeCache.get(key);
    const hw=hwAt(y)+.0015;let lo=0,hi=1.55;
    for(let i=0;i<24;i++){const m=(lo+hi)/2,q=faceHit(m,y);if(!q||q[0]>hw)hi=m;else lo=m;}
    edgeCache.set(key,lo);return lo;};
  const HUG=.55,OFF=.0042;
  function p(u,v) {
    const y=mix(rows[0][0],rows.at(-1)[0],v),[rx,rz,cz,open0]=profile(rows,y);
    const wY=smooth(1.322,1.345,y)*(1-smooth(1.512,1.534,y));
    const open=wY>0?mix(open0,edgeAngle(y),wY):open0,a=mix(open,TAU-open,u);
    const da=Math.min(a-open,TAU-open-a),e=wY*(1-smooth(0,HUG,da));
    const ripple=.0015*Math.sin(a*16+y*17)*Math.sin(v*PI)*(1-e);
    const P=V((rx+ripple)*Math.sin(a),y,cz+(rz+ripple)*Math.cos(a));
    if(e>0){const aa=a>PI?a-TAU:a,q=faceHit(aa,y);
      if(q){const r=Math.hypot(q[0],q[2]),k=(r+OFF)/r;P.lerp(V(q[0]*k,y,q[2]*k),e);}}
    return P;
  }
  add('kerchief','kerchief',surface(p,120,112,(p,u,v)=>[u*2.4,v*1.45]),{doubleSided:true});
  const borders=[];
  for(const u of [0,1]) borders.push(tube(Array.from({length:90},(_,i)=>p(u,i/89)),.0016,128,5));
  add('kerchief-folded-edge','kerchief',join(borders));
  add('kerchief-knot','kerchief',sphere([0,1.300,.093],[.015,.012,.008],32,24));
  for(const s of [-1,1]) add(`kerchief-tail-${s}`,'kerchief',clothRibbon([V(s*.005,1.304,.101),V(s*.023,1.268,.114),V(s*.038,1.223,.11),V(s*.042,1.193+(s<0?.018:0),.105)],.032,.7*s,true),{doubleSided:true});
  const hair=[];
  add('hair-cap','face',surface((u,v)=> {
    const a=mix(-1.38,1.38,u),y=mix(1.511-.009*Math.abs(Math.sin(a)),1.561,v),[rx,rz,cz]=profile(HEAD,y);
    return V((rx+.001)*Math.sin(a),y,cz+(rz+.0012)*Math.cos(a));
  },80,44,headUV),{doubleSided:true});
  for(let i=0;i<24;i++) {
    const s=i<12?-1:1,t=(i%12)/11,xx=s*mix(.032,.078,t),end=1.503-.011*t-.004*Math.sin(i*4.3);
    const points=[];
    for(let j=0;j<=14;j++) {
      const v=j/14,x=mix(xx*.7,xx,v),y=mix(1.531-.004*t,end,v),[rx,rz,cz]=profile(HEAD,y);
      const f=Math.sqrt(Math.max(0,1-(x/rx)**2));
      const fz=frontZ(x,y);
      points.push(V(x,y,(Number.isFinite(fz)?fz:cz+rz*f)+.0005));
    }
    hair.push(tube(points,.00022,28,4));
  }
  add('hair-strands','hair-grey',join(hair));
}

function shawlPoint(u,v) {
  const a=mix(.48,TAU-.48,u),sn=Math.sin(a),cs=Math.cos(a);
  const [rx,rz]=profile([[0,.057,.049],[.35,.183,.098],[.62,.25,.129],[1,.264-.014*Math.abs(cs),cs>0?.142:.139]],v);
  const y=profile([[0,1.338],[.35,1.298],[.62,1.236],[1,1.18-.104*cs*cs]],v)[0];
  return V(rx*sn,y,rz*cs+.003);
}

function buildShawl(add) {
  const loops=[],border=[],fringe=[];
  const cols=68,rows=17;
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    const pts=[];
    for(let k=0;k<12;k++) {
      const a=k/12*TAU,u=(col+.5+.44*Math.cos(a))/cols,v=(row+.5+.46*Math.sin(a))/rows;
      const p=shawlPoint(u,v);
      p.y+=.0006*Math.sin(a*2);
      pts.push(p);
    }
    loops.push(tube(pts,.00112,16,4,true));
  }
  for(const v of [.015,.04,.93,.96,.991]) border.push(tube(Array.from({length:120},(_,i)=>shawlPoint(i/119,v)),.0018,192,6));
  for(const u of [0,1]) border.push(tube(Array.from({length:60},(_,i)=>shawlPoint(u,i/59)),.002,100,6));
  for(let i=0;i<=110;i++) {
    const u=i/110,p=shawlPoint(u,1),a=mix(.48,TAU-.48,u),len=.027+.004*Math.sin(i*4.1);
    for(let j=0;j<3;j++) {
      const o=(j-1)*.0018;
      fringe.push(tube([p.clone().add(V(o,0,0)),p.clone().add(V(o+.002*Math.sin(a),-len*.55,.0015*Math.cos(a))),p.clone().add(V(o+.003*Math.sin(a+i),-len,.003*Math.cos(a)))],.00066,10,4));
    }
  }
  add('shawl-crochet','yarn',join(loops));
  add('shawl-border','yarn',join(border));
  add('shawl-fringe','yarn',join(fringe));
}

// ===================== Viktoria v01 additions =====================
const SC=1.035;
const hairBottom=hairlineHeight;
const HAIR_TOP=1.571;
function headRadial(a,y){
  const [rx,rz,cz]=profile(HEAD,y),s=Math.sin(a),c=Math.cos(a);
  const A=(s/rx)**2+(c/rz)**2,B=-2*c*cz/rz**2,C=(cz/rz)**2-1;
  let r=(-B+Math.sqrt(Math.max(0,B*B-4*A*C)))/(2*A);
  if(Math.abs(a)<1.62&&y>1.31&&y<1.566){const q=faceHit(a,y);if(q)r=Math.max(r,Math.hypot(q[0],q[2]));}
  return r;
}
const hairOff=a=>.0035+.0030*smooth(1.2,2.4,Math.abs(a));
function shellPoint(a,y,extra=0){const r=headRadial(a,y)+hairOff(a)+extra;return V(r*Math.sin(a),y,r*Math.cos(a));}

// v02: hair and scarf are cast from one centre onto the closed head SDF -> continuous, no gaps, no spike.
const HC=V(0,1.452,-.004);
function headT(d){let lo=0,hi=.2;for(let i=0;i<32;i++){const m=(lo+hi)/2;if(headSDF(HC.x+d.x*m,HC.y+d.y*m,HC.z+d.z*m)<0)lo=m;else hi=m;}return lo;}
const dirAE=(a,e)=>V(Math.cos(e)*Math.sin(a),Math.sin(e),Math.cos(e)*Math.cos(a));
const E0=new Map();
export function hairE0(a){const k=a.toFixed(5);if(E0.has(k))return E0.get(k);
  const y=hairBottom(a);let q=faceHit(a,y);if(!q){const r=headRadial(a,y);q=[r*Math.sin(a),y,r*Math.cos(a)];}
  const e=Math.atan2(q[1]-HC.y,Math.hypot(q[0],q[2]-HC.z));E0.set(k,e);return e;}
export function hairPoint(a,e,extra=0){
  const d=dirAE(a,e),t=headT(d);
  // Taper the visible forehead/temple edge into skin. Keep the nape volume
  // and the scarf's independent offset unchanged.
  const edge=(1-smooth(0,.11,e-hairE0(a)))*(1-smooth(2.05,2.4,Math.abs(a)));
  return HC.clone().addScaledVector(d,t+mix(hairOff(a),.00025,edge)+extra);
}
function buildHairScarf(add){
  add('hair-shell','hair-scalp',surface((u,v)=>{const a=mix(-PI,PI,u),e=mix(hairE0(a),PI/2-1e-4,Math.pow(v,.9));
    return hairPoint(a,e,.0003*Math.sin(a*36+e*20)*Math.sin(v*PI));},180,64,(p,u,v)=>[u,v],true),{doubleSided:true});
  buildSweptHair(add,hairPoint,hairE0);
  const nape=hairPoint(PI,Math.atan2(1.378-HC.y,.07)),bunC=V(0,1.380,nape.z-.017);
  add('hair-bun','hair',sphere(bunC.toArray(),[.030,.023,.021],32,24));
  const coil=[];for(let i=0;i<=80;i++){const t=i/80,th=t*TAU*2.3,r=.027*(1-.75*t),zz=-Math.sqrt(Math.max(0,1-(r/.031)**2))*.021;
    coil.push(V(r*Math.cos(th),bunC.y+r*.78*Math.sin(th),bunC.z+zz-.0012));}
  add('hair-bun-coil','hair',tube(coil,.0016,200,5));
  // headscarf
  const D=V(0,.6,-.8).normalize(),E1=V(1,0,0),E2=new THREE.Vector3().crossVectors(D,E1).normalize(),BETA=Math.acos(.29);
  const scarfDir=(u,v)=>{const ps=BETA*v,ch=u*TAU;return D.clone().multiplyScalar(Math.cos(ps)).addScaledVector(E1,Math.sin(ps)*Math.cos(ch)).addScaledVector(E2,Math.sin(ps)*Math.sin(ch));};
  function scarfPoint(u,v,off=.0048){const d=scarfDir(u,v),t=headT(d),a=Math.atan2(d.x,d.z);
    const rip=.0012*Math.sin(u*TAU*14+v*5)*smooth(.45,1,v);
    return HC.clone().addScaledVector(d,t+hairOff(a)+off+rip);}
  add('headscarf','kerchief',surface((u,v)=>scarfPoint(u,v),128,52,(p,u,v)=>[u*3.2,v*1.6],true),{doubleSided:true});
  add('headscarf-edge','kerchief',tube(Array.from({length:128},(_,i)=>scarfPoint(i/128,1,.0038)),.0030,256,6,true));
  const k=scarfPoint(.25,.80,.012);
  add('headscarf-knot','kerchief',sphere(k.toArray(),[.016,.012,.011],28,20));
  for(const s of [-1,1]){
    add(`headscarf-loop-${s}`,'kerchief',clothRibbon([V(0,k.y,k.z-.006),V(s*.030,k.y+.012,k.z-.012),V(s*.042,k.y-.008,k.z-.010),V(s*.016,k.y-.010,k.z-.008),V(0,k.y,k.z-.006)],.017,.9),{doubleSided:true});
    add(`headscarf-tail-${s}`,'kerchief',clothRibbon([V(s*.006,k.y-.006,k.z-.008),V(s*.016,k.y-.035,Math.min(k.z-.012,-.115)),V(s*.022,1.342,-.110),V(s*.026,1.31+(s<0?.02:0),-.092)],.028,.6*s,true),{doubleSided:true});
  }
}

function vestPoint(u,v,extra=0){
  const y=mix(.998,1.314,v),[rx,rz,cz]=profile(BODICE,y),open=.035+.78*Math.pow(smooth(1.19,1.314,y),1.3);
  const a=mix(open,TAU-open,u),f=.0011*Math.sin(a*13+y*55);
  const o=.0072+extra+.0015*smooth(1.27,1.314,y);
  return V((rx+o+f)*Math.sin(a),y,cz+(rz+o+f*.6)*Math.cos(a));
}
function buildVest(add){
  add('vest','knit',surface((u,v)=>vestPoint(u,v),120,64,(p,u,v)=>[u*5,p.y/.12]),{doubleSided:true});
  const e=[];
  for(const u of [0,1])e.push(tube(Array.from({length:60},(_,i)=>vestPoint(u,i/59,.0012)),.0028,96,6));
  e.push(tube(Array.from({length:121},(_,i)=>vestPoint(i/120,0,.0012)),.0030,180,6));
  e.push(tube(Array.from({length:121},(_,i)=>vestPoint(i/120,1,.0012)),.0024,180,6));
  add('vest-edges','knit',join(e));
  const b=[];
  for(let i=0;i<5;i++){const y=1.040+i*.036,[rx,rz,cz]=profile(BODICE,y);b.push(sphere([0,y,cz+rz+.0072+.0042],[.0055,.0055,.002],18,10));}
  add('vest-buttons','button',join(b));
}

function buildStockings(add){
  for(const s of [-1,1]){
    const g=loft([[.185,.031,.034,-.022],[.23,.035,.038,-.020],[.29,.040,.043,-.016]],40,20,(a,y)=>.0006*Math.sin(a*24),.10);
    g.rotateY(s*.065);g.translate(s*.088,0,0);add(`stocking-${s}`,'stocking',g);
  }
}

function apronPoint(x,y,off){const [rx]=profile(SKIRT,y),a=Math.asin(clamp(x/(rx+off),-1,1));return skirtPoint(a,y,off);}
function buildPatches(add){
  const st=[];let n=0;
  for(const [xc,yc,w,h,mat] of [[.112,.637,.060,.052,'linen-patch'],[.062,.489,.052,.046,'patch']]){
    add(`apron-patch-${n++}`,mat,surface((u,v)=>apronPoint(xc+(u-.5)*w,yc+(v-.5)*h,.0112),10,10,(p,u,v)=>[u*.3,v*.3]),{doubleSided:true});
    const ring=[];for(let i=0;i<=40;i++){const t=i/40*4,k=Math.floor(t)%4,f=t-Math.floor(t);
      const q=[[f,0],[1,f],[1-f,1],[0,1-f]][k];ring.push(apronPoint(xc+(q[0]-.5)*(w-.006),yc+(q[1]-.5)*(h-.006),.0122));}
    for(let i=0;i<ring.length-1;i+=2)st.push(tube([ring[i],ring[i+1]],.0005,2,4));
  }
  add('apron-patch-stitches','stitch',join(st));
}
