import test from 'node:test';
import assert from 'node:assert/strict';
import {buildViktoriaGeometry} from '../src/models/viktoria_geometry.js';
import {frontZ,radialHit,headSDF} from '../src/models/viktoria_head.js';

const model=buildViktoriaGeometry();

test('head skin continues below the collar without a separate neck material',()=>{
  const face=model.parts.find(p=>p.name==='face');
  assert.ok(face.geometry.boundingBox.min.y<1.31*1.035,'head surface must reach inside the collar');
  assert.ok(!model.parts.some(p=>p.name==='neck'),'no intersecting cylinder with a different skin texture');
  for(const name of ['position','normal','uv'])assert.ok(face.geometry.attributes[name].array.every(Number.isFinite));
  const normal=face.geometry.attributes.normal;
  for(let i=0;i<normal.count;i++)assert.ok(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)<1e-4);
});

test('jaw and throat share one connected skin surface, with a recessed throat',()=>{
  const face=model.parts.find(p=>p.name==='face').geometry;
  const parent=Array.from({length:face.attributes.position.count},(_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const indices=face.index.array;
  for(let i=0;i<indices.length;i+=3){
    parent[find(indices[i+1])]=find(indices[i]);parent[find(indices[i+2])]=find(indices[i]);
  }
  assert.equal(new Set(Array.from(indices,find)).size,1,'head and neck must be connected, not overlapping shells');
  for(const angle of [0,.5,1,1.5]){
    for(let y=1.315;y<=1.40;y+=.0005){
      const point=radialHit(angle,y);
      assert.ok(point?.every(Number.isFinite),`missing skin at ${angle}, ${y}`);
    }
  }
  assert.ok(frontZ(0,1.355)-frontZ(0,1.325)>.012,'throat recedes behind chin');
});

test('collar surrounds the new neck without cutting into its back or floating in front',()=>{
  const collar=model.parts.find(p=>p.name==='collar'),p=collar.geometry.attributes.position;
  assert.equal(collar.doubleSided,true,'the inside of the open collar is visible');
  for(let i=0;i<p.count;i++){
    const y=p.getY(i)/1.035;
    if(y<1.330)continue;
    const clearance=headSDF(p.getX(i)/1.035,y,p.getZ(i)/1.035);
    assert.ok(clearance>.001&&clearance<.009,`collar clearance ${clearance} m at vertex ${i}`);
  }
});
