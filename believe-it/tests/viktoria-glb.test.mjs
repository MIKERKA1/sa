import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {buildViktoriaGeometry} from '../src/models/viktoria_geometry.js';
import {EYE} from '../src/models/viktoria_head.js';
import {VIKTORIA_GLB} from '../src/models/viktoria_asset.gen.js';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url));
const directory='assets/characters/viktoria/v12/';
const bytes=read(directory+'viktoria_gabriel_v12.glb');
const jsonLength=bytes.readUInt32LE(12);
const json=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
const binaryStart=28+jsonLength;
const sha=data=>createHash('sha256').update(data).digest('hex');
const types={5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function accessor(index){
  const a=json.accessors[index],v=json.bufferViews[a.bufferView],Type=types[a.componentType];
  const offset=binaryStart+(v.byteOffset||0)+(a.byteOffset||0),length=a.count*widths[a.type]*Type.BYTES_PER_ELEMENT;
  const data=bytes.subarray(offset,offset+length);
  return new Type(data.buffer.slice(data.byteOffset,data.byteOffset+length));
}

test('Viktoria GLB is self-contained and obeys glTF binary/attribute constraints',()=>{
  // https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);assert.equal(json.asset.version,'2.0');
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a);assert.equal(jsonLength%4,0);
  assert.equal(bytes.readUInt32LE(24+jsonLength),0x004e4942);
  assert.equal(bytes.readUInt32LE(20+jsonLength),bytes.length-binaryStart);
  assert.equal(json.buffers.length,1);assert.equal(json.buffers[0].byteLength,bytes.length-binaryStart);
  assert.ok(!json.buffers[0].uri);assert.equal(json.scenes.length,1);
  for(const v of json.bufferViews){
    assert.equal(v.buffer,0);assert.equal((v.byteOffset||0)%4,0);
    assert.ok(v.byteLength>0&&(v.byteOffset||0)+v.byteLength<=json.buffers[0].byteLength);
  }
  for(const [i,a] of json.accessors.entries()){
    assert.ok(types[a.componentType]);assert.ok(widths[a.type]);
    assert.ok(Number.isInteger(a.count)&&a.count>0);
    const data=accessor(i);assert.equal(data.length,a.count*widths[a.type]);
    assert.ok(data.every(Number.isFinite));
  }
  for(const image of json.images){
    assert.ok(!image.uri);assert.equal(image.mimeType,'image/png');
    const v=json.bufferViews[image.bufferView],offset=binaryStart+v.byteOffset;
    assert.equal(bytes.subarray(offset,offset+8).toString('hex'),'89504e470d0a1a0a');
  }
  for(const mesh of json.meshes)for(const p of mesh.primitives){
    const pos=json.accessors[p.attributes.POSITION];
    assert.equal(pos.type,'VEC3');assert.equal(pos.componentType,5126);
    assert.equal(p.mode??4,4,'triangle primitives');
    if(p.indices!==undefined){
      const indices=accessor(p.indices);
      assert.equal(indices.length%3,0);assert.ok(indices.every(i=>i<pos.count));
    }else assert.equal(pos.count%3,0,'non-indexed ears have complete triangles');
    assert.equal(json.accessors[p.attributes.NORMAL].count,pos.count);
    assert.equal(json.accessors[p.attributes.TEXCOORD_0].count,pos.count);
    assert.ok(json.materials[p.material]);
  }
  assert.equal(json.extras.staticPose,true);assert.ok(!json.skins&&!json.animations);
});

test('export, embedded model and textures refer to the user reference and exact source geometry',()=>{
  const textures=JSON.parse(read(directory+'textures.json'));
  const manifest=JSON.parse(read(directory+'model-manifest.json'));
  const referenceHash=sha(read(directory+'ref/concept_gemini.png'));
  assert.equal(textures.sourceSHA256,referenceHash);
  assert.equal(json.extras.conceptSHA256,referenceHash);
  assert.equal(json.extras.modelVersion,12);
  assert.equal(manifest.glbSHA256,sha(bytes));assert.equal(manifest.glbBytes,bytes.length);
  assert.ok(Buffer.from(VIKTORIA_GLB,'base64').equals(bytes),'HTML must embed the exact downloadable GLB');
  const source=buildViktoriaGeometry();assert.equal(json.meshes.length,source.parts.length);
  assert.equal(json.nodes[0].children.length,source.parts.length);
  for(const [i,part] of source.parts.entries()){
    const mesh=json.meshes[i],p=mesh.primitives[0],g=part.geometry;
    assert.equal(mesh.name,part.name);assert.equal(json.materials[p.material].name,part.material);
    assert.deepEqual(accessor(p.attributes.POSITION),g.attributes.position.array,part.name+' positions');
    assert.deepEqual(accessor(p.attributes.NORMAL),g.attributes.normal.array,part.name+' normals');
    if(g.index)assert.deepEqual(accessor(p.indices),g.index.array,part.name+' indices');
    else assert.equal(p.indices,undefined,part.name+' preserves non-indexed topology');
    const expectedUV=new Float32Array(g.attributes.uv.array);
    for(let j=1;j<expectedUV.length;j+=2)expectedUV[j]=1-expectedUV[j];
    assert.deepEqual(accessor(p.attributes.TEXCOORD_0),expectedUV,part.name+' texture orientation');
  }
});

test('exported eye texture keeps a dark pupil and a gradual iris-to-sclera transition',()=>{
  const image=json.images.find(i=>i.name==='eye.png'),view=json.bufferViews[image.bufferView];
  const png=bytes.subarray(binaryStart+view.byteOffset,binaryStart+view.byteOffset+view.byteLength),idat=[];
  assert.equal(png[24],8);assert.equal(png[25],2,'generated eye atlas is RGB');
  const w=png.readUInt32BE(16),h=png.readUInt32BE(20),stride=w*3+1;
  for(let p=8;p<png.length;){
    const length=png.readUInt32BE(p);assert.ok(p+length+12<=png.length);
    if(png.toString('ascii',p+4,p+8)==='IDAT')idat.push(png.subarray(p+8,p+8+length));
    p+=length+12;
  }
  const raw=inflateSync(Buffer.concat(idat));assert.equal(raw.length,stride*h);
  const mean=y=>{
    assert.equal(raw[y*stride],0,'generated scanlines use no PNG filter');
    return raw.subarray(y*stride+1,(y+1)*stride).reduce((sum,v)=>sum+v,0)/(w*3);
  };
  const edge=Math.floor(Math.asin(.006/EYE.r)*h/Math.PI);
  let step=0;for(let y=edge-4;y<edge+4;y++)step=Math.max(step,Math.abs(mean(y+1)-mean(y)));
  assert.ok(mean(2)<20,'the pupil stays dark');
  assert.ok(mean(edge+5)>95,'the surrounding sclera remains visible');
  assert.ok(step<65,`no abrupt painted-disc boundary: largest RGB step ${step}`);
});
