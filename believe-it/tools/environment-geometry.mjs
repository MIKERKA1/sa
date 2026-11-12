// Focused contact regressions against generated geometry, including the preserved v8 source.
import * as THREE from 'three';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {kit,support,out,baseline} from './environment-capture.mjs';

const checks=[];
const check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
const rows=(name,room)=>support.filter(p=>p.name===name&&(!room||p.room===room));
const near=(a,b,t=.001)=>Math.abs(a-b)<=t;
const contact=(name,items,t=1)=>check(name,items.length>0&&items.every(p=>p.nearestGapMm!==null&&Math.abs(p.nearestGapMm)<=t),items.map(p=>({id:p.id,gapMm:p.nearestGapMm})));
const partsOf=p=>kit.parts.slice(p.start,p.end);
const placement=p=>kit.props.find(q=>q.id===p.id);
const vec=a=>new THREE.Vector3(...a);
const gapBelow=(part,others)=>{
  const b=part.bb,c=b.getCenter(new THREE.Vector3()),ray=new THREE.Raycaster(vec([c.x,b.min.y+.001,c.z]),vec([0,-1,0]),0,.3);
  const hits=ray.intersectObjects(others.map(p=>p.mesh),false).filter(h=>h.face.normal.y>.25);
  return hits.length?hits[0].distance-.001:null;
};

contact('Kitchen floor vessels rest on the floor',[...rows('crock','r4'),...rows('jar','r4')].filter(p=>p.phase==='details'));
contact('New oil can rests on the workbench',rows('detail:oilCan','r10').filter(p=>p.origin[1]>.9&&p.origin[1]<1.1));
contact('New cutting board rests on the workbench',rows('detail:board','r10'));
contact('All three chest linen stacks rest on their lids',rows('detail:foldedLinen').filter(p=>['r1','r2','attic'].includes(p.room)),1);
contact('Kitchen bowls rest on the table and inside the stack',rows('bowl','r4'),2.1);
contact('Wash basin has support',rows('detail:washBasin','r4'),1);
contact('Water jug has support',rows('jug','r4').filter(p=>p.phase==='details'),1);
contact('Oil can on the hut floor has support',rows('detail:oilCan','hut').filter(p=>p.origin[1]<.2),1);
contact('Doll feet sit on the blanket',rows('ragDoll','r5'),2);
for(const [name,room]of [['pram','r5'],['sewingBasket','r5'],['wheelbarrow','r9'],['thresher','r11'],['cart','yard'],['detail:handcart','yard']])contact(name+' clears and touches its floor',rows(name,room),1);

const walls=support.filter(p=>p.category==='wall fixture');
check('All 17 wall fixtures reach a wall or a real backing board',walls.length===17&&walls.every(p=>p.wallGapMm!==null&&p.wallGapMm>=-3&&p.wallGapMm<=1),walls.map(p=>({id:p.id,name:p.name,gapMm:p.wallGapMm})));
const corner=kit.props.find(p=>p.name==='crucifix'&&p.origin[0]<-13.3);
const M=new THREE.Matrix4().fromArray(corner.matrix),rear=new THREE.Vector3(0,0,-1).transformDirection(M);
const backing=kit.parts.filter(p=>p.phase==='interior'&&p.id<corner.start&&p.bb.min.x<-13.499&&p.bb.max.z>-.501&&p.bb.min.y>1.7&&p.bb.max.y<2.5);
const cornerRay=new THREE.Raycaster(vec(corner.origin).addScaledVector(rear,-.001),rear,0,.05);
const cornerHit=cornerRay.intersectObjects(backing.map(p=>p.mesh),false)[0];
check('Corner crucifix backing spans both walls and supports the cross',!!cornerHit&&cornerHit.distance<=.002,backing.map(p=>({bounds:[...p.bb.min.toArray(),...p.bb.max.toArray()]})));

const work=kit.props.find(p=>p.name==='table'&&p.origin[0]>-5.4&&p.origin[0]<-5.2),workParts=partsOf(work);
const pin=kit.parts.find(p=>p.phase==='details'&&p.source?.type==='CylinderGeometry'&&p.source.parameters.height===.26&&p.source.parameters.radiusBottom===.018);
const pinGap=pin&&gapBelow(pin,workParts);
check('Rolling pin shaft rests on the table',pinGap!==null&&near(pinGap,0),{gapMm:pinGap===null?null:pinGap*1000});
const cutting=kit.props.find(p=>p.name==='detail:board'&&p.origin[0]>-5.4&&p.origin[0]<-5.0),cutParts=partsOf(cutting);
check('Rolling pin clears the cutting board',!!pin&&cutParts.every(p=>!p.bb.intersectsBox(pin.bb)),{pinBounds:pin&&[...pin.bb.min.toArray(),...pin.bb.max.toArray()]});

const bench=kit.props.find(p=>p.name==='workbench'),benchParts=partsOf(bench),curls=benchParts.filter(p=>p.source?.type==='TorusGeometry'&&near(p.source.parameters.tube,.006,.00001));
const localMin=p=>{const inv=new THREE.Matrix4().fromArray(bench.matrix).invert(),v=new THREE.Vector3(),a=p.geo.attributes.position;let min=Infinity;for(let i=0;i<a.count;i++)min=Math.min(min,v.fromBufferAttribute(a,i).applyMatrix4(inv).y);return min;};
check('All nine workbench shavings rest above the main top',curls.length===9&&curls.every(p=>near(localMin(p),.90,.0001)),{minY:curls.map(localMin)});

const paper=kit.props.find(p=>p.name==='paperSheet'&&p.origin[0]>-3.5&&p.origin[0]<-2.5),paperParts=partsOf(paper),books=kit.props.filter(p=>p.name==='detail:book'&&p.origin[0]>-3.5&&p.origin[0]<-2.5).flatMap(partsOf);
check('Desk paper clears both books',books.length>0&&paperParts.every(p=>books.every(b=>!p.bb.intersectsBox(b.bb))),{paperBounds:[...paper.bb.min.toArray(),...paper.bb.max.toArray()]});
const desk=kit.props.find(p=>p.name==='table'&&near(p.origin[0],-2.9));
const paperGap=gapBelow(paperParts[0],partsOf(desk));
check('Desk paper rests on the table',paperGap!==null&&paperGap>=.0002&&paperGap<=.0015,{gapMm:paperGap===null?null:paperGap*1000});

const basin=placement(rows('detail:washBasin','r4')[0]),waterJug=placement(rows('jug','r4').find(p=>p.phase==='details'));
let clearance=Infinity;
for(const p of partsOf(waterJug)){
  const a=p.geo.attributes.position;
  for(let i=0;i<a.count;i++)if(a.getY(i)<=basin.bb.max.y)clearance=Math.min(clearance,Math.hypot(a.getX(i)-basin.origin[0],a.getZ(i)-basin.origin[2])-.20);
}
check('Water jug clears the full basin envelope',clearance>=.001,{clearanceMm:clearance*1000});
const waterBoard=kit.parts.find(p=>p.phase==='details'&&p.m==='wood_i'&&p.bb.min.x>-4.46&&p.bb.max.x<-4.04&&p.bb.max.x-p.bb.min.x>.39&&p.bb.min.z<-7.9&&p.bb.max.z>-7.6);
const barrel=kit.props.find(p=>p.name==='barrel'&&near(p.origin[0],-4.25));
const platformGap=waterBoard&&gapBelow(waterBoard,partsOf(barrel));
check('Water platform rests on the existing barrel brace',platformGap!==null&&platformGap!==undefined&&near(platformGap,0),{gapMm:platformGap==null?null:platformGap*1000});

const report={baseline,checks,passed:checks.filter(p=>p.pass).length,total:checks.length};
await writeFile(resolve(out,'checks.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
if(report.passed!==report.total)process.exitCode=1;
