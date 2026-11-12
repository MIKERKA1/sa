// Audit the real builders before material batching, without changing production source.
import * as THREE from 'three';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
const src = resolve(root, baseline ? 'qa/environment-v9/before/src/scenes' : 'src/scenes');
const { Kit } = await import(pathToFileURL(resolve(src,'farm_kit.js')));
const P = await import(pathToFileURL(resolve(src,'farm_props.js')));
const house = await import(pathToFileURL(resolve(src,'farm_house.js')));
const { ROOMS } = await import(pathToFileURL(resolve(src,'farm_plan.js')));
const out = resolve(root,process.argv[2] || 'qa/environment-v9/capture-before');
await mkdir(out,{recursive:false});
const mat = new THREE.MeshBasicMaterial({ side:THREE.DoubleSide });
const mats = new Proxy({}, { get:(_,name)=>name==='roof_i'||name==='glass_i'||name==='glassc_i'?undefined:{texel:1} });
let phase='house';
class Capture extends Kit {
  constructor(){super(mats,{env:true});this.parts=[];this.props=[];}
  add(grp,m,g){
    const result=super.add(grp,m,g);if(!result)return null;
    result.computeBoundingBox();const mesh=new THREE.Mesh(result,mat);mesh.updateMatrixWorld(true);
    this.parts.push({id:this.parts.length,grp,m,phase,geo:result,bb:result.boundingBox.clone(),mesh});return result;
  }
  part(grp,m,geo,o={}){
    const start=this.parts.length,result=super.part(grp,m,geo,o);
    if(this.parts.length>start)Object.assign(this.parts.at(-1),{source:geo,matrix:o.m});
    return result;
  }
}
const kit=new Capture(),ctx={kit,floors:[],ladders:[],lightPts:{},flames:[],glowRooms:['r1','r4','r5'],thr:new Set()};
globalThis.__environmentAuditCall=(name,f,args,fn)=>{
  if(!f?.M||f.k!==kit)return fn();
  const start=kit.parts.length,result=fn(),end=kit.parts.length;
  if(end>start){
    const bb=new THREE.Box3();for(let i=start;i<end;i++)bb.union(kit.parts[i].bb);
    const origin=new THREE.Vector3().setFromMatrixPosition(f.M);
    kit.props.push({id:kit.props.length,name,phase,start,end,origin:origin.toArray(),matrix:f.M.toArray(),bb,options:args[1]??{}});
  }
  return result;
};
async function audited(name,local=[]){
  let text=await readFile(resolve(src,name),'utf8');
  text=text.replace("import * as P from './farm_props.js';",`import * as OriginalP from './farm_props.js';\nconst P=new Proxy(OriginalP,{get(target,key){const value=target[key];if(typeof value!=='function'||key==='Frame'||key==='lathe'||key==='timber')return value;return (...args)=>globalThis.__environmentAuditCall(String(key),args[0],args,()=>value(...args));}});`);
  for(const n of local){text=text.replace(`function ${n}(`,`function __original_${n}(`);text+=`\nfunction ${n}(...args){return globalThis.__environmentAuditCall('detail:${n}',args[0],args,()=>__original_${n}(...args));}\n`;}
  text=text.replace(/from\s+(['"])([^'"]+)\1/g,(_,q,s)=>`from ${q}${s.startsWith('.')?pathToFileURL(resolve(src,s)).href:import.meta.resolve(s)}${q}`);
  return import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
}
house.buildWalls(ctx);house.buildFloors(ctx);house.buildStairs(ctx);house.buildRoofs(ctx);house.buildChimney(ctx);house.buildWindows(ctx);
phase='interior';(await audited('farm_interior.js')).furnish(ctx);
phase='yard';(await audited('farm_yard.js',['handcart'])).buildYard(ctx);
phase='details';(await audited('farm_details.js',['book','spoon','board','washBasin','broom','oilCan','foldedLinen'])).dressFarm(ctx);
const grid=new Map(),large=[];
for(const p of kit.parts){
  const b=p.bb,x0=Math.floor(b.min.x),x1=Math.floor(b.max.x),z0=Math.floor(b.min.z),z1=Math.floor(b.max.z);
  if((x1-x0+1)*(z1-z0+1)>300){large.push(p);continue;}
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=`${x},${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p);}
}
const query=(x,z)=>[...(grid.get(`${Math.floor(x)},${Math.floor(z)}`)||[]),...large];
const wallKinds=new Set(['picture','crucifix','clock','paperSheet','pegRack','toolWall','wallPan']);
const softKinds=new Set(['cloth','drape','shawl','jacket','hat','ham','lampGlass','hangingLamp','strawBed','hayHeap','strawLitter','ladder','pitchfork','rake','scythe','detail:spoon','detail:broom']);
const support=[];
for(const prop of kit.props){
  const own=p=>p.id>=prop.start&&p.id<prop.end;
  const row={id:prop.id,name:prop.name,phase:prop.phase,origin:prop.origin,bounds:[...prop.bb.min.toArray(),...prop.bb.max.toArray()]};
  const room=Object.entries(ROOMS).filter(([_,r])=>prop.origin[0]>=r.x0&&prop.origin[0]<=r.x1&&prop.origin[2]>=r.z0&&prop.origin[2]<=r.z1&&((prop.origin[1]>=2.9)===(r.y>=3))).sort((a,b)=>(a[1].x1-a[1].x0)*(a[1].z1-a[1].z0)-(b[1].x1-b[1].x0)*(b[1].z1-b[1].z0))[0];
  row.room=room?.[0]||'yard';
  if(wallKinds.has(prop.name)){
    const M=new THREE.Matrix4().fromArray(prop.matrix),front=new THREE.Vector3(0,0,1),origin=new THREE.Vector3(...prop.origin);
    if(prop.name==='paperSheet')front.applyEuler(new THREE.Euler(...(prop.options.rot||[0,0,0])));
    front.transformDirection(M);
    if(Math.abs(front.y)>.15){row.category='horizontal paper';support.push(row);continue;}
    const candidates=query(origin.x,origin.z).filter(p=>!own(p)&&['house','interior'].includes(p.phase)&&/^(wash|brick|wood|plank)/.test(p.m));
    const ray=new THREE.Raycaster(origin.clone().addScaledVector(front,.4),front.clone().negate(),0,1);
    const hit=ray.intersectObjects(candidates.map(p=>p.mesh),false)[0];
    let rear=Infinity;for(let i=prop.start;i<prop.end;i++){const p=kit.parts[i].geo.attributes.position;for(let j=0;j<p.count;j++)rear=Math.min(rear,new THREE.Vector3().fromBufferAttribute(p,j).sub(origin).dot(front));}
    row.category='wall fixture';row.wallGapMm=hit?(rear-(.4-hit.distance))*1000:null;
    if(row.wallGapMm===null||row.wallGapMm>5||row.wallGapMm<-15)row.candidate=true;
    support.push(row);continue;
  }
  if(softKinds.has(prop.name)){row.category='soft/hanging/manual';support.push(row);continue;}
  // Loose fill can be buried in a trough; test the structural base instead.
  const structural=kit.parts.slice(prop.start,prop.end).filter(p=>!/^(hay|straw|grain)/.test(p.m));
  const baseY=Math.min(...structural.map(p=>p.bb.min.y));
  const points=[],seen=new Set();
  for(let i=prop.start;i<prop.end;i++){
    if(!structural.includes(kit.parts[i]))continue;
    const p=kit.parts[i].geo.attributes.position;
    for(let j=0;j<p.count;j++)if(p.getY(j)<=baseY+.001){
      const x=p.getX(j),z=p.getZ(j),key=`${x.toFixed(3)},${z.toFixed(3)}`;
      if(!seen.has(key)){seen.add(key);points.push([x,p.getY(j),z]);}
    }
  }
  const samples=points.length>24?points.filter((_,i)=>i%Math.ceil(points.length/24)===0):points;
  const gaps=samples.map(([x,y,z])=>{
    const candidates=query(x,z).filter(p=>!own(p)&&!p.m.startsWith('wear')&&p.bb.min.y<=y+.15&&p.bb.max.y>=y-3&&p.bb.min.x<=x+.001&&p.bb.max.x>=x-.001&&p.bb.min.z<=z+.001&&p.bb.max.z>=z-.001);
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y+.15,z),new THREE.Vector3(0,-1,0),0,3.15);
    const hits=ray.intersectObjects(candidates.map(p=>p.mesh),false).filter(h=>h.face.normal.y>.25);
    // Outdoor ground is nominal y=0 here; the browser pass checks the actual terrain.
    const ys=hits.map(h=>h.point.y);if(row.room==='yard')ys.push(0);
    const top=ys.sort((a,b)=>Math.abs(a-y)-Math.abs(b-y))[0];return top===undefined?null:(y-top)*1000;
  });
  row.category='supported prop';row.gapsMm=gaps;
  const known=gaps.filter(g=>g!==null),min=known.length?Math.min(...known):null;
  row.nearestGapMm=min;row.contactSamples=known.filter(g=>Math.abs(g)<=5).length;
  if(min===null||min>5||min<-5)row.candidate=true;
  support.push(row);
}
const serial=p=>({id:p.id,name:p.name,phase:p.phase,start:p.start,end:p.end,origin:p.origin,bounds:[...p.bb.min.toArray(),...p.bb.max.toArray()]});
await writeFile(resolve(out,'placements.json'),JSON.stringify(kit.props.map(serial),null,2));
await writeFile(resolve(out,'support.json'),JSON.stringify(support,null,2));
await writeFile(resolve(out,'parts.json'),JSON.stringify(kit.parts.map(p=>({id:p.id,phase:p.phase,group:p.grp,material:p.m,bounds:[...p.bb.min.toArray(),...p.bb.max.toArray()]}))));
console.log(JSON.stringify({out,parts:kit.parts.length,placements:kit.props.length,candidates:support.filter(p=>p.candidate).map(({id,name,room,nearestGapMm,wallGapMm})=>({id,name,room,nearestGapMm,wallGapMm}))}));
export {kit,support,out,baseline,P,ctx};
