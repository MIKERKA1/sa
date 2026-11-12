// Child-specific head/neck; every landmark is measured on the approved concept sheet.
import * as THREE from 'three';
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const mix=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export function profile(rows,y){
 let i=0;while(i<rows.length-2&&y>rows[i+1][0])i++;
 const t=clamp((y-rows[i][0])/(rows[i+1][0]-rows[i][0]));
 const a=rows[Math.max(0,i-1)],b=rows[i],c=rows[i+1],d=rows[Math.min(rows.length-1,i+2)],span=c[0]-b[0];
 return b.slice(1).map((v,k)=>{const j=k+1,m0=(c[j]-a[j])/(c[0]-a[0]),m1=(d[j]-b[j])/(d[0]-b[0]);return clamp((2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*span*m0+(-2*t*t*t+3*t*t)*c[j]+(t*t*t-t*t)*span*m1,Math.min(v,c[j]),Math.max(v,c[j]));});
}
// v03: every table below is measured on the sheet's two portraits, in this file's own unscaled metres
// (front: x=(px-854.5)*.000855, y=1.102-(py-195.5)*.000855; profile: z=.068-(px-1030)*.000855).
// Rows: [height, skull half-width, face half-width, front of the bare face on the midline, centre depth].
export const SKULL=[
 [1.019,.016,.016,.052,.022],[1.022,.019,.019,.066,.020],[1.025,.0225,.0225,.070,.018],[1.030,.028,.028,.071,.016],
 [1.035,.034,.034,.0725,.015],[1.040,.0395,.0395,.073,.015],[1.045,.0435,.0435,.0755,.014],[1.050,.0465,.0465,.0775,.014],
 [1.060,.0505,.0505,.0805,.013],[1.070,.055,.0525,.082,.011],[1.080,.062,.054,.083,.008],[1.090,.069,.0555,.0825,.003],
 [1.100,.073,.057,.081,-.001],[1.108,.074,.058,.080,-.003],[1.125,.074,.060,.0865,-.002],[1.145,.074,.062,.088,0],
 [1.165,.071,.062,.086,-.002],[1.181,.064,.058,.077,-.005],[1.195,.052,.048,.064,-.009],[1.205,.039,.037,.047,-.012],
 [1.212,.022,.021,.030,-.013],[1.217,.002,.002,.003,-.014]
];
// [height, half-width, half-depth, centre depth] of the skull, for callers that want an ellipse.
export const HEAD=SKULL.map(([y,skull,face,front,cz])=>[y,skull,front-cz,cz]);
export const CHIN=1.019,MOUTH=1.0505;
export const EYE={x:.0285,y:1.1055,z:.058,r:.012};
export const UVMAP={y0:.940,y1:1.232};
export const headUV=p=>[clamp(.5+Math.atan2(p.x,p.z)/(2*Math.PI)),clamp((p.y-UVMAP.y0)/(UVMAP.y1-UVMAP.y0))];
export function eyelidBounds(x){
 const ex=Math.abs(x)-EYE.x,u=clamp(ex/.0128,-1,1),arch=Math.max(0,1-u*u)**.82,cy=EYE.y-.0006+.035*ex;
 return {upper:cy+.0054*arch,lower:cy-.0042*arch};
}
const ell=(x,y,z,cx,cy,cz,rx,ry,rz)=>{x=(x-cx)/rx;y=(y-cy)/ry;z=(z-cz)/rz;const k=Math.hypot(x,y,z),n=Math.hypot(x/rx,y/ry,z/rz);return n>1e-12?k*(k-1)/n:-Math.min(rx,ry,rz);};
const smin=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
const smax=(a,b,k)=>-smin(-a,-b,k);
export const NECK=[[.938,.042,.035,0],[.966,.040,.034,-.005],[.989,.035,.034,-.009],[1.015,.033,.037,-.012],[1.047,.041,.045,-.008]];
// Nose ridge: [height, depth of the ridge on the midline, half-width].
const NOSE=[[1.064,.0822,.0110],[1.068,.0832,.0115],[1.072,.0872,.0115],[1.076,.0935,.0105],[1.080,.0950,.0098],[1.085,.0925,.0088],[1.090,.0885,.0078],[1.096,.0850,.0070],[1.102,.0825,.0070],[1.110,.0805,.0090]];
export function headSDF(x,y,z){
 const ax=Math.abs(x),g=(cx,cy,rx,ry)=>Math.exp(-(((ax-cx)/rx)**2+((y-cy)/ry)**2));
 const [skull,face,front,cz]=profile(SKULL,y),rz=front-cz;
 // The face is a narrower mask on the front of the skull: cheekbones about 57 mm, skull 74 mm at the ears.
 const rx=mix(skull,face,sstep(-.010,.035,z-cz));
 const exponent=mix(2.15,2,sstep(1.13,1.16,y)),e=z>cz?exponent:2;
 // cheeks, brow, eye sockets, lid folds, upper and lower lip, chin pad
 let relief=.0038*g(.040,1.072,.026,.024)+.0016*g(.029,1.121,.024,.009)-.0024*g(EYE.x,EYE.y,.018,.012)
   +.0018*g(EYE.x,EYE.y+.0068,.013,.0025)+.0013*g(EYE.x,EYE.y-.0058,.013,.0023)
   +.0060*g(0,1.0566,.016,.0036)+.0048*g(0,1.0458,.0145,.0038)+.0026*g(0,1.0510,.017,.0030)+.0030*g(0,1.030,.020,.010);
 if(y>NOSE[0][0]&&y<NOSE.at(-1)[0]){const [depth,width]=profile(NOSE,y);relief+=Math.max(0,depth-front)*Math.exp(-((x/width)**2))*sstep(1.064,1.069,y)*(1-sstep(1.104,1.110,y));}
 // nostril wings and columella
 relief+=.0048*g(.0105,1.0735,.0048,.0045)+.0012*g(0,1.0695,.0035,.003);
 const shifted=z-relief*sstep(.0,.035,z),kk=(Math.abs(x/rx)**e+Math.abs((shifted-cz)/rz)**e)**(1/e);
 let cr=smax((kk-1)*Math.min(rx,rz),CHIN-y,.005);
 // Underside of the jaw: nearly flat under the chin, rising towards the ears at the sides.
 const slope=mix(.08,.50,sstep(.008,.030,ax));
 cr=smax(cr,(CHIN+slope*(.055-z)-y)/Math.hypot(1,slope),.011);cr=Math.max(cr,y-1.217);
 const [nx,nz,nc]=profile(NECK,y),nd=Math.max((Math.hypot(x/nx,(z-nc)/nz)-1)*Math.min(nx,nz),.938-y,y-1.052);
 let d=smin(cr,nd,.020);
 if(z<.004)return d;
 if(Math.abs(y-EYE.y)<.023&&ax<.054){
  d=smin(d,Math.hypot(ax-EYE.x,y-EYE.y,z-EYE.z)-(EYE.r+.00035),.0032);
  const {upper,lower}=eyelidBounds(ax),depth=ell(ax,y,z,EYE.x,y,EYE.z+.012,.0128,1,.018);
  d=smax(d,-Math.max(depth,y-upper,lower-y),.00055);
  d=smin(d,ell(ax,y,z,EYE.x-.0115,EYE.y-.0015,EYE.z+.0085,.0018,.0008,.002),.0007);
 }
 d=smax(d,-ell(x,y,z,0,MOUTH-.001*clamp(ax/.020),.0815,.0200,.00034,.0040),.00050);
 d=smax(d,-ell(ax,y,z,.0072,1.0700,.0860,.0027,.0012,.0028),.0012);
 return d;
}
export function sdfGrad(x,y,z,e=.0001){const q=[headSDF(x+e,y,z)-headSDF(x-e,y,z),headSDF(x,y+e,z)-headSDF(x,y-e,z),headSDF(x,y,z+e)-headSDF(x,y,z-e)],l=Math.hypot(...q)||1;return q.map(v=>v/l);}
export function radialHit(a,y){const sx=Math.sin(a),cz=Math.cos(a);let r=.16;for(let i=0;i<240&&r>0;i++){const d=headSDF(r*sx,y,r*cz);if(d<1e-5)return [r*sx,y,r*cz];r-=Math.max(d*.8,2e-5);}return null;}
export function frontZ(x,y){let z=.15;for(let i=0;i<240&&z>-.10;i++){const d=headSDF(x,y,z);if(d<1e-5)return z;z-=Math.max(d*.8,2e-5);}return NaN;}

// Surface nets over the visible part of the head.
export function buildHeadGeometry(h=.00125){ // finer sampling resolves the eyelid and nostril margins
  const x0=-.090,y0=.932,z0=-.100,nx=Math.ceil(.180/h)+1,ny=Math.ceil(.294/h)+1,nz=Math.ceil(.207/h)+1;
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
  // Analytic normals: face normals are undefined at the two collapsed poles of the sphere.
  {const n=g.attributes.normal,q=new THREE.Vector3();for(let i=0;i<p.count;i++){q.fromBufferAttribute(p,i).normalize();n.setXYZ(i,q.x,q.y,q.z);}}
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI/2));            // pole -> +Z
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-.025));                 // relaxed, nearly level gaze
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-side*.025));            // mild convergence
  g.translate(side*EYE.x,EYE.y,EYE.z);
  return g;
}
