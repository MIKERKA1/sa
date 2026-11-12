// Caecilia Gruber: source geometry for the approved concept, metres, Y up, +Z front.
// This offline builder is intentionally independent of DOM and renderer state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
const PI = Math.PI, TAU = PI*2;
const mix = (a,b,t) => a+(b-a)*t;
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
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
const EYES=[[-.039,1.445],[.035,1.450]];
function faceRelief(x,y) {
  let d=0;
  for(const [ex,ey] of EYES) {
    d-=.010*gauss(x,y,ex,ey+.001,.023,.014);
    d+=.007*gauss(x,y,ex,ey,.014,.006);
    d+=.010*gauss(x,y,ex,ey+.022,.024,.010);
    d+=.005*gauss(x,y,ex,ey-.014,.019,.006);
  }
  d+=.016*gauss(x,y,0,1.447,.010,.033);
  d+=.025*gauss(x,y,0,1.408,.015,.021);
  d+=.012*gauss(x,y,0,1.398,.014,.010);
  for(const s of [-1,1]) {
    d+=.009*gauss(x,y,s*.018,1.398,.009,.007);
    d+=.008*gauss(x,y,s*.054,1.415,.021,.021);
    const fold=s*(.024+(1.4-y)*.34);
    d-=.003*gauss(x,y,fold,1.382,.003,.021);
  }
  d+=.005*gauss(x,y,0,1.375,.030,.006);
  d-=.0027*gauss(x,y,0,1.369,.029,.0015);
  d+=.006*gauss(x,y,0,1.362,.027,.005);
  d+=.010*gauss(x,y,0,1.336,.037,.016);
  for(const h of [1.486,1.494,1.503]) d-=.00065*gauss(x,y,0,h+.8*x*x,.059,.0009);
  return d;
}

const SKIRT=[[.19,.278,.161,.003],[.27,.267,.16,.003],[.53,.238,.147,0],[.79,.204,.132,0],[.94,.167,.111,0],[1.026,.14,.092,0]];
const BODICE=[[1.013,.139,.092,0],[1.12,.145,.103,.001],[1.224,.164,.105,-.005],[1.282,.174,.089,-.009],[1.316,.111,.058,.002],[1.326,.047,.041,.019]];
const bodiceFold=(a,y)=>.0013*Math.sin(19*a+y*26);
function bodiceFront(x,y,offset=0) {
  const [rx,rz,cz]=profile(BODICE,y),a=Math.asin(clamp(x/rx,-1,1));
  return V(x,y,cz+(rz+bodiceFold(a,y)*.6)*Math.cos(a)+offset);
}

function skirtPoint(a,y,offset=0) {
  const [rx,rz,cz]=profile(SKIRT,y),v=(y-.19)/(.836);
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

export function buildCaeciliaGeometry() {
  const parts=[];
  const add=(name,material,geometry,extras={})=> {
    if(!geometry) return;
    geometry.computeBoundingBox();
    parts.push({name,material,geometry,...extras});
  };
  add('face','face',surface((u,v)=> {
    const y=mix(HEAD[0][0],HEAD.at(-1)[0],v),[rx,rz,cz]=profile(HEAD,y),a=(u-.5)*TAU;
    const x=rx*Math.sin(a),f=Math.max(0,Math.cos(a));
    return V(x,y,cz+rz*Math.cos(a)+faceRelief(x,y)*Math.pow(f,5));
  },160,180,p=>[(p.x+.105)/.21,(p.y-1.305)/.245],true));
  add('neck','skin',loft([[1.258,.043,.039,.019],[1.29,.043,.04,.029],[1.331,.043,.040,.034]],48,36,null,.12));
  add('dress-skirt','wool',surface((u,v)=>skirtPoint(u*TAU,mix(.19,1.026,v)),144,112,(p,u)=>[u*6,p.y/.27],true));
  const hem=[];
  for(const y of [.192,.199]) hem.push(tube(Array.from({length:145},(_,i)=>skirtPoint(i/144*TAU,y,.001)),.0016,192,5,true));
  add('skirt-hem','wool',join(hem));
  add('bodice','wool',loft(BODICE,96,80,bodiceFold,.22));
  add('collar','wool',loft([[1.293,.055,.045,.025],[1.332,.049,.044,.029]],56,16,null,.14));
  add('front-placket','wool',surface((u,v)=> {
    return bodiceFront((u-.5)*.022,mix(1.024,1.294,v),.0025);
  },6,60,(p,u)=>[u*.15,p.y/.22]));
  const buttons=[];
  for(let i=0;i<8;i++) {
    const y=1.062+i*.032,p=bodiceFront(0,y,.005);
    buttons.push(sphere(p.toArray(),[.0053,.0053,.0018],20,12));
  }
  add('bodice-buttons','button',join(buttons));
  for(const side of [-1,1]) {
    const shoulder=V(side*.151,1.297,-.004),elbow=V(side*.224,1.036,.017),wrist=V(side*.267,.819,.047);
    const curve=new THREE.CatmullRomCurve3([shoulder,V(side*.198,1.16,.006),elbow,V(side*.247,.923,.03),wrist]);
    add(`sleeve-${side}`,'wool',surface((u,v)=> {
      const p=curve.getPoint(v),t=curve.getTangent(v),b=V(0,0,1),n=new THREE.Vector3().crossVectors(t,b).normalize(),a=-u*TAU;
      let r=(mix(.058,.036,v)+.004*Math.sin(v*PI))*Math.sin(PI/2*clamp(v/.12));
      r+=.0015*Math.sin(v*73+Math.sin(a*3))*Math.sin(v*PI)+.001*Math.cos(a*9)*clamp(v/.12);
      r=Math.max(.001,r);
      return p.addScaledVector(n,Math.cos(a)*r).addScaledVector(b,Math.sin(a)*r*.9);
    },56,76,(p,u,v)=>[u*1.5,v*2.8],true));
    add(`cuff-${side}`,'wool',surface((u,v)=> {
      const p=curve.getPoint(mix(.947,1,v)),t=curve.getTangent(.99),n=new THREE.Vector3().crossVectors(t,V(0,0,1)).normalize(),a=-u*TAU;
      return p.addScaledVector(n,.0385*Math.cos(a)).addScaledVector(V(0,0,1),.0355*Math.sin(a));
    },48,12,(p,u,v)=>[u*.8,v*.14],true));
  }
  add('apron','linen',surface((u,v)=> {
    const a=mix(-1.035,1.035,u),y=mix(.313,1.031,v),p=skirtPoint(a,y,.0065);
    p.z+=.002*Math.sin(u*33)*v;
    p.y+=.0025*Math.sin(u*14)*(1-v)**6;
    return p;
  },104,104,(p,u,v)=>[u*1.55,v*2.4]),{doubleSided:true});
  const apronHems=[];
  for(const u of [0,1]) apronHems.push(tube(Array.from({length:70},(_,i)=>skirtPoint(mix(-1.035,1.035,u),mix(.314,1.028,i/69),.008)),.0014,92,5));
  apronHems.push(tube(Array.from({length:100},(_,i)=>skirtPoint(mix(-1.035,1.035,i/99),.314,.008)),.0016,126,5));
  add('apron-hems','linen',join(apronHems));
  // The belt encloses both garment layers, including the apron's gathered folds.
  add('waistband','linen',surface((u,v)=> {
    const a=u*TAU,y=mix(1.017,1.047,v),[sx,sz]=profile(SKIRT,y),[bx,bz,cz]=profile(BODICE,y);
    return V((Math.max(sx,bx)+.010)*Math.sin(a),y,(Math.max(sz,bz)+.014)*Math.cos(a)+cz);
  },112,12,(p,u)=>[u*5,p.y/.24],true));
  add('apron-bow-knot','linen',sphere([0,1.032,-.116],[.013,.011,.008],28,20));
  for(const s of [-1,1]) {
    add(`apron-bow-${s}`,'linen',clothRibbon([V(0,1.034,-.123),V(s*.038,1.044,-.138),V(s*.055,1.018,-.136),V(s*.025,1.012,-.134),V(0,1.034,-.124)],.013,.9),{doubleSided:true});
    add(`apron-tie-${s}`,'linen',clothRibbon([V(s*.007,1.028,-.124),V(s*.022,.979,-.139),V(s*.019,.923,-.15),V(s*.032,.894+(s>0?.018:0),-.155)],.023,.25),{doubleSided:true});
  }
  buildBoots(add);
  buildHands(add);
  buildKerchief(add);
  buildShawl(add);
  return {parts,metadata:{name:'Caecilia Gruber',height:1.578,units:'metres',front:'+Z',pose:'relaxed standing',concept:'caecilia_gruber_concept_v01.png'}};
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

function buildHands(add) {
  for(const s of [-1,1]) {
    const x=s*.267,geos=[],nails=[],creases=[];
    const palm=loft([[.746,.025,.013,.047],[.765,.031,.017,.047],[.799,.029,.016,.047],[.824,.022,.014,.047]],48,42,null,.12);
    palm.translate(x,0,0);geos.push(palm);
    const lengths=[.057,.070,.067,.052];
    for(let i=0;i<4;i++) {
      const fx=x+s*(-.024+i*.0155),len=lengths[i],y0=.748;
      geos.push(surface((u,v)=> {
        const a=u*TAU,y=y0-len*v,r=(.008-(.0028*v))*(.7+.3*Math.sin(PI*clamp(v/.12)));
        const xx=fx+s*.003*Math.sin(v*PI),z=.047+.012*v*v;
        return V(xx+r*Math.cos(a),y,z+r*.85*Math.sin(a));
      },24,30,p=>[p.x/.12,p.y/.12],true));
      geos.push(sphere([fx,y0-len,.059],[.0053,.0055,.0048],20,12));
      nails.push(sphere([fx,y0-len+.008,.0535],[.0037,.0065,.0012],20,12));
      for(const t of [.32,.65]) creases.push(tube([V(fx-.005,y0-len*t,.039+.01*t*t),V(fx,y0-len*t+.0005,.038+.01*t*t),V(fx+.005,y0-len*t,.039+.01*t*t)],.00032,8,4));
    }
    geos.push(tube([V(x-s*.025,.795,.052),V(x-s*.043,.775,.060),V(x-s*.048,.746,.071),V(x-s*.043,.729,.075)],.009,28,12));
    geos.push(sphere([x-s*.043,.729,.075],[.007,.008,.007],24,16));
    add(`hand-${s}`,'skin',join(geos));
    add(`nails-${s}`,'nail',join(nails));
    add(`finger-creases-${s}`,'skin-dark',join(creases));
  }
}

function buildKerchief(add) {
  const rows=[[1.291,.042,.045,.028,0],[1.32,.069,.064,.013,.48],[1.365,.101,.088,0,.96],[1.438,.103,.099,-.005,1.05],[1.489,.1,.097,-.007,.93],[1.524,.085,.084,-.01,.61],[1.555,.062,.056,-.012,0],[1.578,.002,.002,-.012,0]];
  function p(u,v) {
    const y=mix(rows[0][0],rows.at(-1)[0],v),[rx,rz,cz,open]=profile(rows,y),a=mix(open,TAU-open,u);
    const ripple=.0015*Math.sin(a*16+y*17)*Math.sin(v*PI);
    return V((rx+ripple)*Math.sin(a),y,cz+(rz+ripple)*Math.cos(a));
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
  },80,44,p=>[(p.x+.105)/.21,(p.y-1.305)/.245]),{doubleSided:true});
  for(let i=0;i<24;i++) {
    const s=i<12?-1:1,t=(i%12)/11,xx=s*mix(.032,.078,t),end=1.503-.011*t-.004*Math.sin(i*4.3);
    const points=[];
    for(let j=0;j<=14;j++) {
      const v=j/14,x=mix(xx*.7,xx,v),y=mix(1.531-.004*t,end,v),[rx,rz,cz]=profile(HEAD,y);
      const f=Math.sqrt(Math.max(0,1-(x/rx)**2));
      points.push(V(x,y,cz+rz*f+faceRelief(x,y)*f**5+.0005));
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
