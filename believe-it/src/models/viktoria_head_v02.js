// Viktoria Gabriel v02 head (Fears to Fathom style: soft simplified planes) (derived from Caecilia v06, solid nose, two real nostrils), 35 y.o.: a sculpted signed-distance head meshed with surface nets.
// Replaces the v01/v02 "photo on an egg" face. Metres, Y up, +Z front.
// The same SDF drives the mesh, the procedural face texture bake and hair placement,
// so the texture always matches the form (no projected photo, no stretching).
import * as THREE from 'three';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const sstep=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0));return t*t*(3-2*t);};

// Cranium envelope, identical to the v01 HEAD profile so the kerchief and hair cap still fit.
export const HEAD=[
  [1.31,.025,.029,.032],[1.326,.047,.047,.028],[1.35,.070,.064,.013],
  [1.395,.085,.074,.008],[1.445,.086,.078,.006],[1.482,.083,.077,.001],
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
export const EYE={x:.0315,y:1.4475,z:.0640,r:.0118};
export const UVMAP={a:1.7,y0:1.300,y1:1.585};
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

function cranium(x,y,z){
  let [rx,rz,cz]=profile(HEAD,y);
  rx*=mix(1,mix(.78,1,sstep(1.350,1.450,y)),sstep(-.01,.035,z-cz)); // narrower jaw at the front only
  // flatter, broader facial front below the hairline; plain ellipse above it (hair cap fits there)
  const n=mix(2.55,2,sstep(1.47,1.50,y)),zz=z-cz;
  const e=zz>0?n:2;
  const k=Math.pow(Math.abs(x/rx)**e+Math.abs(zz/rz)**e,1/e);
  return Math.max((k-1)*Math.min(rx,rz),1.3102-y,y-1.5648);
}

// Full head SDF (skin surface). Eyeballs are separate meshes.
export function headSDF(x,y,z){
  let d=cranium(x,y,z);
  if(z<.005) return d;
  const ax=Math.abs(x);
  // --- v02: soft, game-style masses; no sculpted cheekbones, hollows or folds ---
  d=smin(d,ell(ax,y,z,.030,1.4665,.0715,.027,.0085,.0115),.016);   // soft brow mass
  d=smin(d,ell(ax,y,z,.043,1.4090,.0500,.026,.0210,.0260),.024);   // rounded cheeks
  d=smin(d,ell(x,y,z,0,1.3700,.0410,.030,.027,.0430),.020);         // muzzle
  d=smin(d,ell(x,y,z,0,1.3480,.0650,.0185,.0140,.0160),.016);       // round chin
  d=smax(d,-ell(ax,y,z,EYE.x+.0005,1.4475,.0880,.0200,.0120,.0130),.012); // shallow orbits
  // --- eyes: simple lid shell + almond fissure ---
  if(Math.abs(y-EYE.y)<.03&&ax<.07){
    const ex=ax-EYE.x;
    d=smin(d,Math.hypot(ex,y-EYE.y,z-EYE.z)-(EYE.r+.0013),.004);
    d=smin(d,ell(ax,y,z,EYE.x+.0010,1.4530,.0745,.0170,.0045,.0058),.005); // upper lid
    const cy=EYE.y-.0002-.0004*clamp(ex/.0125,-1,1);
    d=smax(d,-ell(ax,y,z,EYE.x+.0004,cy,EYE.z+.0105,.0128,.0026,.0100),.0013); // fissure
  }
  // --- nose: small, smooth ---
  d=smin(d,cap(x,y,z,0,1.4530,.0830,0,1.4060,.0990,.0060),.012);    // bridge
  d=smin(d,cap(x,y,z,0,1.4480,.0790,0,1.4020,.0910,.0082),.010);    // body
  d=smin(d,ell(x,y,z,0,1.4010,.0985,.0074,.0072,.0084),.010);       // tip
  d=smin(d,ell(ax,y,z,.0102,1.3990,.0885,.0056,.0058,.0070),.010);  // alae
  d=smin(d,ell(x,y,z,0,1.3975,.0915,.0100,.0048,.0090),.005);       // lobule base
  d=smax(d,-ell(ax,y,z,.0056,1.3940,.0915,.0021,.0032,.0042),.0008); // nostrils
  // --- mouth: soft lips ---
  d=smin(d,ell(x,y,z,0,1.3775,.0785,.0225,.0050,.0064),.006);       // upper lip
  d=smin(d,ell(x,y,z,0,1.3668,.0768,.0200,.0052,.0064),.006);       // lower lip
  {const t=clamp(ax/.024);
   d=smax(d,-ell(x,y,z,0,1.3722-.0010*t*t,.0860,.0240,.0008,.0080),.0012);} // mouth line
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
export function buildHeadGeometry(h=.0015){ // v02: closed head (no open back)
  const x0=-.106,y0=1.300,z0=-.098,nx=Math.ceil(.212/h)+1,ny=Math.ceil(.288/h)+1,nz=Math.ceil(.233/h)+1;
  const F=new Float32Array(nx*ny*nz),id=(i,j,k)=>(k*ny+j)*nx+i;
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)F[id(i,j,k)]=headSDF(x0+i*h,y0+j*h,z0+k*h);
  const cell=new Int32Array(nx*ny*nz).fill(-1),P=[];
  const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v=new Float32Array(8);
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    let neg=0;
    for(let c=0;c<8;c++){const [a,b,e]=corners[c];v[c]=F[id(i+a,j+b,k+e)];if(v[c]<0)neg++;}
    if(neg===0||neg===8)continue;
    let sx=0,sy=0,sz=0,n=0;
    for(const [a,b] of edges){if((v[a]<0)===(v[b]<0))continue;const t=v[a]/(v[a]-v[b]),A=corners[a],B=corners[b];
      sx+=A[0]+(B[0]-A[0])*t;sy+=A[1]+(B[1]-A[1])*t;sz+=A[2]+(B[2]-A[2])*t;n++;}
    cell[id(i,j,k)]=P.length/3;P.push(x0+(i+sx/n)*h,y0+(j+sy/n)*h,z0+(k+sz/n)*h);
  }
  // project onto the zero set and take analytic normals
  const N=new Float32Array(P.length);
  for(let q=0;q<P.length;q+=3){
    let x=P[q],y=P[q+1],z=P[q+2];
    for(let it=0;it<3;it++){const d=headSDF(x,y,z),[gx,gy,gz]=sdfGrad(x,y,z);if(Math.abs(d)>h*1.5)break;x-=d*gx;y-=d*gy;z-=d*gz;}
    P[q]=x;P[q+1]=y;P[q+2]=z;const g=sdfGrad(x,y,z);N[q]=g[0];N[q+1]=g[1];N[q+2]=g[2];
  }
  const idx=[];
  const quad=(a,b,c,d,dir,flip)=>{if(a<0||b<0||c<0||d<0)return;
    const pa=[P[3*a],P[3*a+1],P[3*a+2]],pc=[P[3*c],P[3*c+1],P[3*c+2]],pb=[P[3*b],P[3*b+1],P[3*b+2]],pd=[P[3*d],P[3*d+1],P[3*d+2]];
    const u=[pc[0]-pa[0],pc[1]-pa[1],pc[2]-pa[2]],w=[pd[0]-pb[0],pd[1]-pb[1],pd[2]-pb[2]];
    const cr=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
    if((cr[dir]>0)!==flip)idx.push(a,b,c,a,c,d);else idx.push(a,d,c,a,c,b);};
  for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=0;i<nx-1;i++){const f0=F[id(i,j,k)],f1=F[id(i+1,j,k)];if((f0<0)===(f1<0))continue;
    quad(cell[id(i,j-1,k-1)],cell[id(i,j,k-1)],cell[id(i,j,k)],cell[id(i,j-1,k)],0,f0>0);}
  for(let k=1;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=1;i<nx-1;i++){const f0=F[id(i,j,k)],f1=F[id(i,j+1,k)];if((f0<0)===(f1<0))continue;
    quad(cell[id(i-1,j,k-1)],cell[id(i-1,j,k)],cell[id(i,j,k)],cell[id(i,j,k-1)],1,f0>0);}
  for(let k=0;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){const f0=F[id(i,j,k)],f1=F[id(i,j,k+1)];if((f0<0)===(f1<0))continue;
    quad(cell[id(i-1,j-1,k)],cell[id(i,j-1,k)],cell[id(i,j,k)],cell[id(i-1,j,k)],2,f0>0);}
  const uv=new Float32Array(P.length/3*2);
  for(let q=0,t=0;q<P.length;q+=3,t+=2){const X=P[q],Y=P[q+1],Z=P[q+2];let [u,w]=headUV({x:X,y:Y,z:Z});
    // v06: vertices on the nostril walls -> dark patch; deeper = darker row
    const qn=Math.hypot((Math.abs(X)-.0056)/.0021,(Y-1.3940)/.0032,(Z-.0915)/.0042);
    if(qn<1.10&&Y>1.3925){const dep=clamp((Y-1.3925)/.0032);u=.5+(X<0?-.02:.02);w=NOSTRIL_V0+dep*(1-NOSTRIL_V0-.002);}
    uv[t]=u;uv[t+1]=w;}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  return g;
}

// Eyeballs: +Y pole of the sphere rotated to the gaze so the iris sits at the top rows of eye.png.
export function buildEyeGeometry(side){
  const g=new THREE.SphereGeometry(EYE.r,40,28),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i)/EYE.r;if(y>.82){const f=1+.075*((y-.82)/.18)**1.6;p.setXYZ(i,p.getX(i)*f,p.getY(i)*f,p.getZ(i)*f);}}
  g.computeVertexNormals();
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI/2));            // pole -> +Z
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(.05));                   // slightly downcast
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-side*.025));            // mild convergence
  g.translate(side*EYE.x,EYE.y,EYE.z);
  return g;
}
