// Viktoria v10: continuous head/neck skin; SDF and texture landmarks share metres.
import * as THREE from 'three';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const sstep=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0));return t*t*(3-2*t);};

// Cranium envelope, identical to the v01 HEAD profile so the kerchief and hair cap still fit.
export const HEAD=[
  [1.338,.018,.024,.026],[1.351,.039,.043,.014],[1.372,.061,.059,.004],
  [1.405,.074,.072,-.002],[1.445,.079,.076,-.003],[1.482,.081,.076,.001],
  [1.522,.075,.069,-.004],[1.551,.043,.040,-.009],[1.565,.002,.003,-.009],
];
export function profile(rows,y) {
  let i=0;
  while(i<rows.length-2 && y>rows[i+1][0]) i++;
  const t=clamp((y-rows[i][0])/(rows[i+1][0]-rows[i][0]));
  const a=rows[Math.max(0,i-1)],b=rows[i],c=rows[i+1],d=rows[Math.min(rows.length-1,i+2)],span=c[0]-b[0];
  return b.slice(1).map((value,k)=> {
    const j=k+1,m0=(c[j]-a[j])/(c[0]-a[0]),m1=(d[j]-b[j])/(d[0]-b[0]);
    const r=(2*t*t*t-3*t*t+1)*value+(t*t*t-2*t*t+t)*span*m0+(-2*t*t*t+3*t*t)*c[j]+(t*t*t-t*t)*span*m1;
    return clamp(r,Math.min(value,c[j]),Math.max(value,c[j]));
  });
}

// Landmarks shared with the texture bake.
export const EYE={x:.0315,y:1.4475,z:.0560,r:.0140};
// Upper and lower arcs share their canthi but are not a circular socket.
// The texture bake uses these same curves for the lid margins.
export function eyelidBounds(x){
  const ex=Math.abs(x)-EYE.x-.0003,u=clamp(ex/.0160,-1,1);
  // The concept's canthi sit below the pupil: a tall upper arc and a
  // shallower lower arc, rather than two halves of the same oval.
  const arch=Math.max(0,1-u*u)**.80,cy=EYE.y-.0026+.050*ex;
  return {upper:cy+.0064*arch,lower:cy-.0030*arch};
}
export const UVMAP={a:Math.PI,y0:1.275,y1:1.585};
export const NOSTRIL_V0=(1.5720-1.300)/(1.585-1.300);
export const headUV=p=>[clamp(.5+Math.atan2(p.x,p.z)/(2*UVMAP.a)),clamp((p.y-UVMAP.y0)/(UVMAP.y1-UVMAP.y0))];

function ell(px,py,pz,cx,cy,cz,rx,ry,rz){
  const x=(px-cx)/rx,y=(py-cy)/ry,z=(pz-cz)/rz,k0=Math.sqrt(x*x+y*y+z*z);
  const k1=Math.sqrt((x/rx)**2+(y/ry)**2+(z/rz)**2);
  return k1>1e-12?k0*(k0-1)/k1:-Math.min(rx,ry,rz);
}
function cap(px,py,pz,ax,ay,az,bx,by,bz,r){
  const pax=px-ax,pay=py-ay,paz=pz-az,bax=bx-ax,bay=by-ay,baz=bz-az;
  const h=clamp((pax*bax+pay*bay+paz*baz)/(bax*bax+bay*bay+baz*baz));
  return Math.hypot(pax-bax*h,pay-bay*h,paz-baz*h)-r;
}
const smin=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
const smax=(a,b,k)=>-smin(-a,-b,k);

const NECK=[
  [1.279,.049,.043,-.002],[1.307,.044,.039,-.006],
  [1.333,.0375,.036,-.010],[1.355,.035,.037,-.012],
  [1.382,.041,.045,-.010],[1.410,.046,.052,-.008],
];
function neckSDF(x,y,z){
  if(y>1.43)return y-1.410;
  const [rx,rz,cz]=profile(NECK,y),a=Math.atan2(x,z-cz);
  // Sternocleidomastoid: subtle oblique relief from behind the jaw toward
  // the collar, plus a shallow central throat. This stays one skin surface.
  const t=clamp((y-1.305)/.085),muscle=.0015*Math.exp(-(((Math.abs(a)-mix(.40,1.30,t))/.23)**2))*Math.sin(t*Math.PI);
  const k=Math.hypot(x/(rx+muscle),(z-cz)/(rz+muscle));
  return Math.max((k-1)*Math.min(rx,rz),1.279-y,y-1.410);
}

function cranium(x,y,z){
  let [rx,rz,cz]=profile(HEAD,y);
  rx*=mix(1,mix(.87,.94,sstep(1.355,1.470,y)),sstep(-.015,.030,z-cz)); // v03 oval, narrower lower face // narrower jaw at the front only
  // flatter, broader facial front below the hairline; plain ellipse above it (hair cap fits there)
  const n=mix(2.55,2,sstep(1.47,1.50,y)),zz=z-cz;
  const e=zz>0?n:2;
  const k=Math.pow(Math.abs(x/rx)**e+Math.abs(zz/rz)**e,1/e);
  let d=smax((k-1)*Math.min(rx,rz),1.3382-y,.006);
  d=smax(d,(1.350+.36*(.055-z)-y)/1.0628,.006);
  return Math.max(d,y-1.5648);
}

// Front silhouette measured on the profile portrait, using the same scale as
// its eye landmarks. Interpolating its depth avoids a Gaussian bridge hump.
const NOSE=[
  [1.394,.076,.016],[1.400,.081,.014],[1.404,.090,.012],
  [1.411,.096,.012],[1.418,.092,.0105],[1.425,.088,.009],
  [1.432,.084,.008],[1.439,.080,.0075],[1.447,.076,.007],
  [1.455,.075,.008],[1.464,.075,.011],
];

// Full head SDF (skin surface). Eyeballs are separate meshes.
export function headSDF(x,y,z){
  const ax=Math.abs(x);
  const g=(cx,cy,rx,ry)=>Math.exp(-(((ax-cx)/rx)**2+((y-cy)/ry)**2));
  // Continuous displacement keeps facial planes part of one surface. Separate
  // ellipsoid unions made the cheek, brow and lips protrude as isolated lumps.
  let nose=0;
  if(y>NOSE[0][0]&&y<NOSE.at(-1)[0]){
    const [depth,width]=profile(NOSE,y),[,rz,cz]=profile(HEAD,y);
    nose=Math.max(0,depth-rz-cz)*Math.exp(-((x/width)**2))*sstep(1.394,1.401,y);
  }
  let relief=.0012*g(.032,1.467,.027,.011)
    +.0030*g(.049,1.425,.027,.021)-.0025*g(.053,1.397,.026,.021)
    -.0032*g(EYE.x,1.4475,.020,.014)
    +.0024*g(EYE.x,EYE.y+.0068,.016,.0032)
    +.0015*g(EYE.x,EYE.y-.0060,.016,.0028)
    -.00055*g(EYE.x,EYE.y+.0110,.017,.0012)
    +nose+.0050*g(.012,1.4055,.0055,.004)
    +.0025*g(0,1.402,.003,.003)
    +.004*g(0,1.382,.022,.0045)+.005*g(0,1.3745,.021,.0045)
    -.0018*g(0,1.365,.018,.004)
    +.005*g(0,1.355,.021,.014);
  let d=smin(cranium(x,y,z-relief*sstep(.0,.045,z)),neckSDF(x,y,z),.016);
  if(z<.005)return d;
  if(Math.abs(y-EYE.y)<.025&&ax<.063){
    const ex=ax-EYE.x;
    d=smin(d,Math.hypot(ex,y-EYE.y,z-EYE.z)-(EYE.r+.0005),.004);
    // A tapered almond opening: the upper lid covers the top of the iris.
    // The cavity reaches behind the globe so its rim cannot form a round socket.
    const {upper,lower}=eyelidBounds(ax);
    const depth=ell(ax,y,z,EYE.x+.0003,y,EYE.z+.012,.0160,1,.019);
    const opening=Math.max(depth,y-upper,lower-y);
    d=smax(d,-opening,.00065);
    // The medial canthus contains tear tissue, not an empty wedge beside
    // the globe. Blend it into the skin so it remains a single surface.
    d=smin(d,ell(ax,y,z,EYE.x-.0138,EYE.y-.0034,EYE.z+.0075,.0027,.0009,.0030),.0010);
  }
  // Narrow closed mouth and two recessed nostrils, blended into the same surface.
  {const t=clamp(ax/.023);d=smax(d,-ell(x,y,z,0,1.3783-.0014*t*t,.083,.023,.00045,.011),.0008);}
  d=smax(d,-ell(ax,y,z,.0112,1.4040,.0850,.0025,.0015,.0045),.0007);
  return d;
}

export function sdfGrad(x,y,z,e=.00012){
  const gx=headSDF(x+e,y,z)-headSDF(x-e,y,z),gy=headSDF(x,y+e,z)-headSDF(x,y-e,z),gz=headSDF(x,y,z+e)-headSDF(x,y,z-e);
  const l=Math.hypot(gx,gy,gz)||1;return [gx/l,gy/l,gz/l];
}

// Front-most surface z at (x,y), or NaN if the ray misses the head.
export function frontZ(x,y){
  let z=.16;
  for(let i=0;i<300&&z>-.12;i++){const d=headSDF(x,y,z);if(d<1e-5)return z;z-=Math.max(d*.8,2e-5);}
  return NaN;
}
// Outer surface point along a horizontal ray toward the head axis at angle a (0 = front, +x positive).
export function radialHit(a,y){
  const sx=Math.sin(a),cz=Math.cos(a);let r=.16;
  for(let i=0;i<300&&r>0;i++){const d=headSDF(r*sx,y,r*cz);if(d<1e-5)return [r*sx,y,r*cz];r-=Math.max(d*.8,2e-5);}
  return null;
}

// Surface nets over the visible part of the head.
export function buildHeadGeometry(h=.0012){ // finer sampling resolves the eyelid and nostril margins
  const x0=-.106,y0=1.270,z0=-.098,nx=Math.ceil(.212/h)+1,ny=Math.ceil(.318/h)+1,nz=Math.ceil(.233/h)+1;
  const F=new Float32Array(nx*ny*nz),id=(i,j,k)=>(k*ny+j)*nx+i;
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)F[id(i,j,k)]=headSDF(x0+i*h,y0+j*h,z0+k*h);
  const cell=new Int32Array(nx*ny*nz).fill(-1),splitCells=new Map(),P=[];
  const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  // Cyclic corners and edges of each face. Both cells sharing an ambiguous
  // face use the same bilinear decision, so separate contours never get welded.
  const faces=[[[0,1,3,2],[0,5,1,4]],[[4,5,7,6],[2,7,3,6]],
    [[0,1,5,4],[0,9,2,8]],[[2,3,7,6],[1,11,3,10]],
    [[0,2,6,4],[4,10,6,8]],[[1,3,7,5],[5,11,7,9]]];
  const v=new Float32Array(8);
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    let neg=0;
    for(let c=0;c<8;c++){const [a,b,e]=corners[c];v[c]=F[id(i+a,j+b,k+e)];if(v[c]<0)neg++;}
    if(neg===0||neg===8)continue;
    const hits=edges.map(([a,b])=>{
      if((v[a]<0)===(v[b]<0))return null;
      const t=v[a]/(v[a]-v[b]),A=corners[a],B=corners[b];
      return A.map((value,c)=>value+(B[c]-value)*t);
    });
    const parent=edges.map((_,e)=>e),find=e=>parent[e]===e?e:(parent[e]=find(parent[e]));
    const join=(a,b)=>{parent[find(a)]=find(b);};
    for(const [c,e] of faces){
      const crossing=e.filter(n=>hits[n]);
      if(crossing.length===2)join(...crossing);
      else if(crossing.length===4){
        if(v[c[0]]*v[c[2]]-v[c[1]]*v[c[3]]>0){join(e[0],e[1]);join(e[2],e[3]);}
        else {join(e[3],e[0]);join(e[1],e[2]);}
      }
    }
    const groups=new Map();
    for(let e=0;e<edges.length;e++)if(hits[e]){const f=find(e);if(!groups.has(f))groups.set(f,[]);groups.get(f).push(e);}
    const edgeVertex=new Int32Array(12).fill(-1);
    cell[id(i,j,k)]=P.length/3;
    for(const group of groups.values()){
      let sx=0,sy=0,sz=0;
      for(const e of group){sx+=hits[e][0];sy+=hits[e][1];sz+=hits[e][2];edgeVertex[e]=P.length/3;}
      const n=group.length;P.push(x0+(i+sx/n)*h,y0+(j+sy/n)*h,z0+(k+sz/n)*h);
    }
    if(groups.size>1)splitCells.set(id(i,j,k),edgeVertex);
  }
  // project onto the zero set and take analytic normals
  const N=new Float32Array(P.length);
  for(let q=0;q<P.length;q+=3){
    let x=P[q],y=P[q+1],z=P[q+2];
    for(let it=0;it<3;it++){const d=headSDF(x,y,z),[gx,gy,gz]=sdfGrad(x,y,z);if(Math.abs(d)>h*1.5)break;x-=d*gx;y-=d*gy;z-=d*gz;}
    P[q]=x;P[q+1]=y;P[q+2]=z;const g=sdfGrad(x,y,z);N[q]=g[0];N[q+1]=g[1];N[q+2]=g[2];
  }
  const idx=[];
  const vertex=(i,j,k,e)=>splitCells.get(id(i,j,k))?.[e]??cell[id(i,j,k)];
  const quad=(a,b,c,d,dir,flip)=>{if(a<0||b<0||c<0||d<0)return;
    const pa=[P[3*a],P[3*a+1],P[3*a+2]],pc=[P[3*c],P[3*c+1],P[3*c+2]],pb=[P[3*b],P[3*b+1],P[3*b+2]],pd=[P[3*d],P[3*d+1],P[3*d+2]];
    const u=[pc[0]-pa[0],pc[1]-pa[1],pc[2]-pa[2]],w=[pd[0]-pb[0],pd[1]-pb[1],pd[2]-pb[2]];
    const cr=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
    if((cr[dir]>0)!==flip)idx.push(a,b,c,a,c,d);else idx.push(a,d,c,a,c,b);};
  for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=0;i<nx-1;i++){const f0=F[id(i,j,k)],f1=F[id(i+1,j,k)];if((f0<0)===(f1<0))continue;
    quad(vertex(i,j-1,k-1,3),vertex(i,j,k-1,2),vertex(i,j,k,0),vertex(i,j-1,k,1),0,f0>0);}
  for(let k=1;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=1;i<nx-1;i++){const f0=F[id(i,j,k)],f1=F[id(i,j+1,k)];if((f0<0)===(f1<0))continue;
    quad(vertex(i-1,j,k-1,7),vertex(i-1,j,k,5),vertex(i,j,k,4),vertex(i,j,k-1,6),1,f0>0);}
  for(let k=0;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){const f0=F[id(i,j,k)],f1=F[id(i,j,k+1)];if((f0<0)===(f1<0))continue;
    quad(vertex(i-1,j-1,k,11),vertex(i,j-1,k,10),vertex(i,j,k,8),vertex(i-1,j,k,9),2,f0>0);}
  // Refine only the eyelids. Shared edge midpoints keep neighbouring triangles
  // connected, including the transition to the untouched head/neck mesh.
  const refined=refineEyelids(P,Array.from(N),idx);
  P.length=0; // refill without spreading a large vertex array
  for(const value of refined.positions)P.push(value);
  const normals=refined.normals,indices=refined.indices;
  const uv=new Float32Array(P.length/3*2);
  for(let q=0,t=0;q<P.length;q+=3,t+=2){const X=P[q],Y=P[q+1],Z=P[q+2];let [u,w]=headUV({x:X,y:Y,z:Z});
    uv[t]=u;uv[t+1]=w;}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices);
  return g;
}

function refineEyelids(positions,normals,indices){
  const P=positions.slice(),N=normals.slice(),edges=new Map(),result=[];
  const key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  const near=i=>P[i*3+2]>.045&&Math.abs(P[i*3+1]-EYE.y)<.013&&Math.abs(Math.abs(P[i*3])-EYE.x)<.019;
  const add=p=>{
    let [x,y,z]=p;
    for(let n=0;n<5;n++){const d=headSDF(x,y,z),g=sdfGrad(x,y,z);if(Math.abs(d)>.003)break;x-=d*g[0];y-=d*g[1];z-=d*g[2];}
    const index=P.length/3;P.push(x,y,z);N.push(...sdfGrad(x,y,z));return index;
  };
  for(let i=0;i<indices.length;i+=3){
    const tri=indices.slice(i,i+3);if(!tri.some(near))continue;
    for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],k=key(a,b);
      if(!edges.has(k))edges.set(k,add([0,1,2].map(c=>(P[a*3+c]+P[b*3+c])*.5)));}
  }
  for(let i=0;i<indices.length;i+=3){
    const tri=indices.slice(i,i+3),ring=[];
    for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3];ring.push(a);const m=edges.get(key(a,b));if(m!==undefined)ring.push(m);}
    if(ring.length===3){result.push(...tri);continue;}
    const center=add([0,1,2].map(c=>tri.reduce((s,v)=>s+P[v*3+c],0)/3));
    for(let j=0;j<ring.length;j++)result.push(ring[j],ring[(j+1)%ring.length],center);
  }
  return {positions:P,normals:N,indices:result};
}

// Eyeballs: +Y pole of the sphere rotated to the gaze so the iris sits at the top rows of eye.png.
export function buildEyeGeometry(side){
  const g=new THREE.SphereGeometry(EYE.r,40,28),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i)/EYE.r;if(y>.82){const f=1+.025*((y-.82)/.18)**1.6;p.setXYZ(i,p.getX(i)*f,p.getY(i)*f,p.getZ(i)*f);}}
  g.computeVertexNormals();
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI/2));            // pole -> +Z
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-.025));                 // relaxed, nearly level gaze
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-side*.025));            // mild convergence
  g.translate(side*EYE.x,EYE.y,EYE.z);
  return g;
}
