// A lived-in 1922 farm: environmental dressing only, with no quests, day transitions or story flags.
import * as THREE from 'three';
import * as P from './farm_props.js';
import { Y, ROOMS, DOORS, YARD, WINDOWS } from './farm_plan.js';
import { rng } from '../engine/util.js';
const {C,Frame,lathe,timber,cloth}=P, H=Math.PI/2;

function torus(f,m,r,t,pos,rot=[H,0,0],col=C.iron,arc=Math.PI*2){
  f.part(m,new THREE.TorusGeometry(r,t,6,20,arc),{pos,rot,col,uv:'keep',smooth:true});
}
function book(f,{w=.17,l=.24,h=.025,col=[.33,.25,.2]}={}){
  f.box('linen',-w/2,.003,-l/2,w/2,h-.003,l/2,[.73,.68,.54]);
  for(const y of [0,h-.004])f.box('leather',-w/2-.005,y,-l/2-.006,w/2+.005,y+.004,l/2+.006,col);
  f.box('leather',-w/2-.005,0,-l/2-.006,-w/2+.001,h,l/2+.006,col);
  for(let y=.007;y<h-.002;y+=.005)f.box('plain',-w/2+.005,y,l/2,w/2,y+.0006,l/2+.0006,[.58,.52,.42]);
}
function spoon(f,{wood=false}={}){
  f.sph(wood?'wood':'iron',.023,[0,.004,0],[.72,.18,1],wood?C.oak:C.iron,{ws:14,hs:8});
  f.rod(wood?'wood':'iron',[0,.005,-.015],[0,.008,-.135],.0045,8,wood?C.dark:C.iron,{r2:.003});
}
function board(f,{w=.34,l=.23}={}){
  timber(f,-w/2,0,-l/2,w/2,.018,l/2,C.pine,0);
  timber(f,-.04,0,l/2-.005,.04,.018,l/2+.085,C.pine,2);
  torus(f,'iron',.01,.0015,[0,.019,l/2+.065],[H,0,0],C.black);
}
function washBasin(f){
  lathe(f,'enamel',[[0,.01],[.11,.01],[.18,.08],[.195,.12],[.196,.13],[.185,.13],[.17,.09],[.10,.022],[0,.022]],28,{col:C.white});
  torus(f,'iron',.193,.004,[0,.129,0],[H,0,0],[.3,.36,.42]);
  f.cyl('glassc',.12,.12,.003,24,[0,.045,0],[0,0,0],[.42,.51,.56]);
}
function broom(f){
  f.rod('wood',[0,.25,0],[.025,1.24,.015],.014,8,C.pine);
  for(let i=0;i<20;i++){
    const x=(i-9.5)*.008,z=Math.sin(i*2.3)*.019;
    f.rod('rope',[x,0,z],[x*.35,.28,z*.4],.004,4,[.68,.6,.38]);
  }
  for(const y of [.22,.26])torus(f,'rope',.035,.004,[0,y,0],[H,0,0],C.dark);
}
function oilCan(f){
  lathe(f,'machine',[[0,0],[.055,0],[.059,.025],[.055,.095],[.025,.12],[0,.12]],20,{col:[.58,.58,.5]});
  f.rod('brass',[0,.12,0],[.025,.2,.11],.0045,8,C.brass,{r2:.002});
  torus(f,'iron',.038,.004,[-.055,.075,0],[0,0,H],C.iron,Math.PI*1.5);
}
function foldedLinen(f){
  for(let i=0;i<3;i++){
    const g=new THREE.BoxGeometry(.33,.025,.26,8,2,8),p=g.attributes.position;
    for(let j=0;j<p.count;j++)p.setY(j,p.getY(j)+Math.sin(p.getX(j)*30)*.002);
    g.computeBoundingBox();g.translate(0,-g.boundingBox.min.y,0);
    g.computeVertexNormals();f.part(i===1?'checkB':'linen',g,{pos:[i*.008,i*.027,0],col:C.linen,smooth:true});
  }
}
export function splitLog(f,{r=.075,l=.48,seed=1}={}){
  const rr=rng(seed),geo=new THREE.CylinderGeometry(r*.91,r,l,10,1,true);geo.rotateX(H);
  f.part('bark',geo,{pos:[0,0,0],col:[.83+rr()*.13,.82,.75],smooth:true});
  for(const s of [-1,1])f.part('ring',new THREE.CircleGeometry(s>0?r*.91:r,10),{pos:[0,0,s*l/2],rot:[0,s<0?Math.PI:0,rr()*.3],uv:'keep',col:[.94,.89,.8]});
}
export function stackedWood(f,{cols=13,rows=6,r=.079,l=.56,seed=1}={}){
  const rr=rng(seed);
  for(let y=0;y<rows;y++)for(let x=0;x<cols-(y%2);x++){
    const dx=(x-(cols-1)/2+(y%2)*.5)*r*2.12;
    splitLog(f.sub(dx,r+y*r*1.77,(rr()-.5)*.028,0,[(rr()-.5)*.03,(rr()-.5)*.06,(rr()-.5)*.1]),{r:r*(.93+rr()*.12),l:l*(.93+rr()*.14),seed:seed+y*cols+x});
  }
}

function kitchen(ctx,F){
  const y=Y.live,work=F(-5.30,y,-5.035,Math.PI);
  P.table(work,{w:.91,d:.49,h:.82,col:C.pine});
  board(work.sub(-.17,.82,0),{w:.30,l:.20});
  for(const x of [-.27,-.24,-.21])work.sph('plain',.023,[x,.86,.008],[1,.7,1],[.7,.57,.36]);
  const pin=work.sub(.19,.838,-.02,0,[-H,0,H]);
  pin.cyl('wood',.018,.018,.26,14,[0,0,0],[0,0,0],C.pine);
  for(const s of [-1,1])pin.cyl('wood',.008,.006,.055,10,[0,s*.155,0],[0,0,0],C.dark);
  P.bowl(work.sub(.28,.82,.07),{r:.088,h:.072,m:'earthen'});
  for(let i=0;i<35;i++)work.sph('plain',.0025,[.13+Math.sin(i*5.7)*.11,.824,.1+Math.cos(i*2.8)*.06],1,[.84,.80,.68],{ws:4,hs:3});
  P.crock(work.sub(-.26,0,0),{r:.12,h:.26,seed:8});P.jar(work.sub(.24,0,0),{h:.14,seed:9});
  const wall=F(-9.005,y+1.40,-7.55,H);
  timber(wall,-.38,0,-.018,.38,.055,.022,C.dark,0);
  for(let i=0;i<4;i++){
    const x=-.27+i*.18;
    wall.rod('iron',[x,.026,.03],[x,.026,.067],.004,6,C.iron);
    spoon(wall.sub(x,-.18,.069,0,[H,0,0]),{wood:i%2===0});
    wall.rod(i%2?'iron':'wood',[x,-.18,.07],[x,.023,.07],.006,8,i%2?C.iron:C.pine);
  }
  // Household water corner uses the existing barrel; no second floor object crowds the doorway.
  const water=F(-4.25,y,-7.75);
  // This board rests on the lid's raised brace (.78), giving both vessels a flat, dry support.
  timber(water,-.20,.78,-.18,.20,.795,.18,C.dark,0);
  washBasin(water.sub(-.09,.785,-.04));
  P.jug(water.sub(.145,.795,.105,.8),{r:.055,h:.17,m:'enamel'});
  cloth(F(-4.84,y+.263,-7.87),{w:.23,l:.25,col:[.74,.69,.57],drop:.045});
  const towel=F(-3.70,y+1.20,-5.04,-H);
  towel.rod('wood',[-.16,0,.04],[.16,0,.04],.008,8,C.dark);
  const tg=new THREE.PlaneGeometry(.25,.42,12,16),tp=tg.attributes.position;
  for(let i=0;i<tp.count;i++)tp.setZ(i,.006*Math.sin(tp.getX(i)*74));
  tg.computeVertexNormals();towel.part('linen',tg,{pos:[0,-.20,.042],col:[.87,.82,.72],smooth:true});
  // A folded cloth, cups and cutlery make the eating table read as a family table.
  cloth(F(-6.94,y+.762,-7.30,.25),{w:.20,l:.28,material:'checkR',seed:7});
  for(const [x,z] of [[-7.98,-7.60],[-7.27,-7.61],[-6.82,-7.30]]){
    P.mug(F(x,y+.762,z,.3),{r:.035,h:.075});spoon(F(x+.09,y+.766,z+.19,.2));
  }
  broom(F(-3.96,y,-4.99,.3).sub(0,0,0,0,[.07,0,-.11]));
  // Soot surrounds the stove, concentrated above its doors and the pipe; soft alpha keeps wall edges clean.
  const soot=F(-7.72,y+1.48,-4.685,Math.PI);
  soot.part('wear',new THREE.PlaneGeometry(1.28,1.48),{col:[.7,.66,.6],uv:'keep'});
  ctx.detailAreas.push('Кухня: рабочий стол, посуда, ткань, умывание, копоть');
}

function domestic(ctx,F){
  const y=Y.live;
  book(F(-12.88,y+.762,-1.46,.18),{col:[.32,.26,.20]});
  torus(F(-12.88,y+.797,-1.46),'brass',.025,.0012,[-.029,0,0]);
  torus(F(-12.88,y+.797,-1.46),'brass',.025,.0012,[.029,0,0]);
  foldedLinen(F(-12.45,y+.630,-2.22));
  P.mug(F(-12.25,y+.763,-1.49),{r:.035,h:.07});
  foldedLinen(F(-10.42,y+.630,-5.02));
  book(F(-11.26,y+.762,-7.70),{w:.13,l:.20,col:[.32,.36,.34]});
  P.jug(F(-11.45,y+.762,-7.73),{r:.05,h:.17,m:'earthen'});
  cloth(F(-5.96,y+.453,-3.20,H),{w:.27,l:.45,material:'checkR'});
  const brush=F(-8.19,y+.01,-1.06,.3);timber(brush,-.06,0,-.025,.06,.028,.025,C.dark);
  for(let i=0;i<10;i++)brush.rod('rope',[-.052+i*.012,.028,0],[-.052+i*.012,.045,0],.005,4,[.44,.38,.27]);
  // Neutral household objects, with no new narrative cues or characters.
  book(F(-3.09,y+.762,-.74,.04),{w:.14,l:.19,h:.016,col:[.53,.35,.25]});
  book(F(-3.1,y+.778,-.72,-.09),{w:.14,l:.19,h:.015,col:[.34,.40,.39]});
  foldedLinen(F(-.47,y+.895,-2.41,-H));
  const toy=F(-3.8,y+.017,-2.08,.8);
  timber(toy,-.10,.10,-.035,.10,.15,.035,C.pine);
  for(const x of [-.065,.065])for(const z of [-.024,.024])toy.rod('wood',[x,.1,z],[x,.025,z],.008,6,C.dark);
  toy.rod('wood',[.067,.145,0],[.10,.215,0],.015,8,C.pine);
  toy.sph('wood',.025,[.098,.219,0],[1.5,.8,.6],C.pine);
  for(const z of [-.045,.045])toy.part('wood',new THREE.TorusGeometry(.12,.009,5,18,Math.PI*.72),{pos:[0,.139,z],rot:[0,0,Math.PI*1.14],scale:[1,.85,1],col:C.dark,uv:'keep'});
  const pantry=F(-2.14,y,-7.75);cloth(pantry.sub(0,.53,0),{w:.30,l:.32,drop:.08,col:[.76,.68,.52]});
  ctx.detailAreas.push('Жилые комнаты, сени, комната служанки и кладовая');
}

function workshop(ctx,F){
  const y=Y.stab,bench=F(18.80,y+.900,-5.60,-H);
  oilCan(bench.sub(.37,0,.03));
  for(const x of [-.20,-.08,.03])torus(bench,'iron',.014,.004,[x,.004,.12],[H,0,0],C.iron);
  board(bench.sub(-.48,0,-.02),{w:.26,l:.15});
  const plane=bench.sub(-.13,0,-.02,.22);
  timber(plane,-.07,0,-.025,.07,.036,.025,C.dark);
  plane.obox('iron',.045,.07,.007,[.018,.041,0],[0,0,-.5],C.iron);
  plane.rod('wood',[-.027,.027,0],[-.046,.07,0],.007,8,C.pine);
  for(let i=0;i<12;i++){
    const a=i*2.4;bench.rod('iron',[.1+Math.sin(a)*.05,.003,.13+Math.cos(a)*.03],[.1+Math.sin(a)*.05,.007,.19+Math.cos(a)*.03],.0015,4,C.iron);
  }
  const supply=F(18.81,y,-7.27,-H);
  const heights=P.shelf(supply,{w:.75,d:.32,h:1.28,n:3});
  for(const sy of heights){oilCan(supply.sub(-.21,sy,0));P.jar(supply.sub(.18,sy,0),{r:.06,h:.14,seed:10+Math.round(sy*10)});}
  // Back of the rail meets the east wall (x=11), between the doorway and hay heap.
  const st=F(10.97,y,-2.85,-H);timber(st,-.40,.70,-.03,.40,.76,.03,C.dark);
  for(const x of [-.36,.36])st.cyl('iron',.0065,.0065,.004,8,[x,.73,.032],[H,0,0],C.iron);
  for(const x of [-.27,0,.27]){
    const hook=[[x,.72,.025],[x,.72,.065],[x,.68,.080],[x,.68,.095],[x,.706,.103]];
    for(let i=1;i<hook.length;i++)st.rod('iron',hook[i-1],hook[i],.005,6,C.iron);
    // The upper inside edge rests on the hook's saddle; its tip stays in front of the loop.
    torus(st,'rope',.10,.005,[x,.59,.0875],[0,0,0],[.68,.59,.42]);
  }
  const feed=F(7.72,y,-6.55,H);
  // A dry ledger board caps the bin's existing central divider (top y=.75).
  timber(feed,-.10,.75,-.24,.10,.775,.24,C.dark,2);
  book(feed.sub(0,.775,.03),{w:.13,l:.17,h:.018,col:[.46,.33,.22]});
  const milk=F(6.61,y+.02,-.99,.7);cloth(milk.sub(.0,.253,.0),{w:.23,l:.22,col:[.74,.72,.64],drop:.05});
  // Small repair stock stays on wall edges, clear of the north–south barn passage and the stairs.
  const rack=F(11.57,y,-11.12,H);
  for(let i=0;i<5;i++)timber(rack.sub(i*.033,0,.018*i,0,[0,0,-.08]),-.065,0,-.025,.065,1.75+i*.045,.025,[.72,.63,.50],1);
  const attic=F(-10.42,Y.attic+.630,-1.76,Math.PI,'attic');foldedLinen(attic);
  const line=F(-.5,Y.attic,-7.22,0,'attic');
  for(let i=0;i<3;i++)splitLog(line.sub(i*.19,.074,.0,.35),{l:.55,seed:810+i});
  oilCan(F(3.40,y,-12.98));
  const hShelf=F(1.34,y,-13.9,H);const hs=P.shelf(hShelf,{w:.65,d:.22,h:1.34,n:3});
  for(const sy of hs){oilCan(hShelf.sub(-.15,sy,0));P.jar(hShelf.sub(.17,sy,0),{r:.047,h:.13,seed:8});}
  ctx.detailAreas.push('Хлев, кормовая, гумно, мастерская, машинное отделение, будка, чердак');
}

function surfaces(ctx,F){
  for(const id of ['r1','r2','r3','r4','r5','r6']){
    const r=ROOMS[id];
    // Individual skirting boards stop at door openings instead of drawing a line across thresholds.
    const edges=[['x',r.z0,r.x0,r.x1],['x',r.z1,r.x0,r.x1],['z',r.x0,r.z0,r.z1],['z',r.x1,r.z0,r.z1]];
    for(const [axis,c,a0,a1] of edges){
      let ranges=[[a0,a1]];
      for(const d of DOORS){
        const alongX=Math.abs(Math.sin(d.yaw))<.1;if((axis==='x')!==alongX)continue;
        const perpendicular=alongX?d.hinge[2]:d.hinge[0];if(Math.abs(perpendicular-c)>.17)continue;
        const start=alongX?d.hinge[0]:d.hinge[2],end=start+(alongX?Math.cos(d.yaw): -Math.sin(d.yaw))*d.w;
        const b0=Math.min(start,end)-.07,b1=Math.max(start,end)+.07;
        ranges=ranges.flatMap(([u,v])=>b0>=v||b1<=u?[[u,v]]:[[u,Math.max(u,b0)],[Math.min(v,b1),v]].filter(([x,z])=>z-x>.02));
      }
      for(const [u,v] of ranges){
        const inward=c===(axis==='x'?r.z0:r.x0)?1:-1,cc=c+inward*.012;
        if(axis==='x')timber(F(0,0,0),u,r.y,cc-.008,v,r.y+.092,cc+.008,C.dark,0);
        else timber(F(0,0,0),cc-.008,r.y,u,cc+.008,r.y+.092,v,C.dark,2);
      }
    }
  }
  // Pin heads are attached to the boards; old plaster has restrained edge staining.
  for(const id of ['r1','r2','r5']){
    const R=ROOMS[id],f=F(0,0,0);
    for(let x=R.x0+.14;x<R.x1;x+=.45)for(let z=R.z0+.12;z<R.z1;z+=1.08)
      f.cyl('iron',.0025,.0025,.0012,5,[x,R.y+.0008,z],[0,0,0],[.47,.44,.4]);
  }
  for(const w of WINDOWS.filter(w=>w.kind==='live'&&w.wall==='S')){
    const f=F(w.c,.42,.005,0,'world').out();
    f.part('wear',new THREE.PlaneGeometry(w.w*.85,.66),{pos:[0,0,0],col:[.8,.84,.78],uv:'keep'});
  }
  for(const d of DOORS.filter(d=>!d.pair&&d.id!=='d16')){
    const yaw=d.yaw,dx=Math.cos(yaw),dz=-Math.sin(yaw),f=F(d.hinge[0]+dx*d.w*.5,d.hinge[1]+.002,d.hinge[2]+dz*d.w*.5,yaw,d.ext?'world':'base');
    if(d.ext)f.indoor=false;
    f.part('wear',new THREE.PlaneGeometry(d.w*.85,.45),{rot:[-H,0,0],col:[.7,.62,.52],uv:'keep'});
  }
  ctx.detailAreas.push('Плинтусы, крепёж полов, пороги и следы износа поверхностей');
}

export function dressFarm(ctx){
  ctx.detailAreas=[];
  const F=(x,y,z,yaw=0,g='base')=>new Frame(ctx.kit,g,x,y,z,yaw,g!=='world');
  kitchen(ctx,F);domestic(ctx,F);workshop(ctx,F);surfaces(ctx,F);
  // Yard work is concentrated at existing work areas, with open paths between them.
  const shed=F(-18.85,0,7.54,H,'world');
  P.rootCrate(shed,{w:.66,d:.45,h:.36,seed:710});
  const fence=F(-22.91,0,8.28,H,'world');broom(fence.sub(0,0,0,0,[.10,0,-.12]));
  const block=F(...[YARD.block[0],0,YARD.block[1]],0,'world'),rr=rng(7104);
  for(let i=0;i<55;i++){
    const a=rr()*Math.PI*2,r=.34+rr()*.65;
    block.obox('wood',.025+rr()*.045,.004,.012+rr()*.027,[Math.sin(a)*r,.006,Math.cos(a)*r],[0,a,rr()*.18],[.8,.67,.48]);
  }
  ctx.detailAreas.push('Двор: дрова, ящики, хозяйственные детали, щепа');
}
