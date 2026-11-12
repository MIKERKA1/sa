import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildCaeciliaGeometry} from '../src/models/caecilia_geometry_v01.js';
import {CAECILIA_GLB} from '../src/models/caecilia_asset.gen.js';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url));
const directory='assets/characters/caecilia/v01/';
const bytes=read(directory+'caecilia_gruber_v01.glb');
const jsonLength=bytes.readUInt32LE(12);
const json=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
const binaryStart=28+jsonLength;
const sha=data=>createHash('sha256').update(data).digest('hex');
const types={5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
// The archived v01 was baked on another JS runtime. Trigonometry and normal
// normalization differ below Float32 precision; the GLB hash stays exact.
function closeArray(actual,expected,tolerance,label){
  assert.equal(actual.length,expected.length,label+' length');
  for(let i=0;i<actual.length;i++)assert.ok(
    Number.isFinite(actual[i])&&Number.isFinite(expected[i])&&Math.abs(actual[i]-expected[i])<=tolerance,
    `${label}[${i}]: ${actual[i]} != ${expected[i]} (tolerance ${tolerance})`);
}
function accessor(index){
  const a=json.accessors[index],v=json.bufferViews[a.bufferView],Type=types[a.componentType];
  const offset=binaryStart+(v.byteOffset||0)+(a.byteOffset||0),length=a.count*widths[a.type]*Type.BYTES_PER_ELEMENT;
  const data=bytes.subarray(offset,offset+length);
  return new Type(data.buffer.slice(data.byteOffset,data.byteOffset+length));
}

test('Caecilia GLB is self-contained and obeys glTF binary/attribute constraints',()=>{
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
    const pos=json.accessors[p.attributes.POSITION],indices=accessor(p.indices);
    assert.equal(pos.type,'VEC3');assert.equal(pos.componentType,5126);
    assert.equal(indices.length%3,0);assert.ok(indices.every(i=>i<pos.count));
    assert.equal(json.accessors[p.attributes.NORMAL].count,pos.count);
    assert.equal(json.accessors[p.attributes.TEXCOORD_0].count,pos.count);
    assert.ok(json.materials[p.material]);
  }
  assert.equal(json.extras.staticPose,true);assert.ok(!json.skins&&!json.animations);
});

test('archived v01 export and textures match its approved concept and versioned source geometry',()=>{
  const approval=JSON.parse(read('assets/concepts/characters/caecilia_gruber_approval_v01.json'));
  const textures=JSON.parse(read(directory+'textures.json'));
  const manifest=JSON.parse(read(directory+'model-manifest.json'));
  assert.equal(sha(read('assets/concepts/characters/'+approval.concept)),approval.sha256);
  assert.equal(textures.sourceSHA256,approval.sha256);assert.equal(json.extras.conceptSHA256,approval.sha256);
  assert.equal(manifest.glbSHA256,sha(bytes));assert.equal(manifest.glbBytes,bytes.length);

  const source=buildCaeciliaGeometry();assert.equal(json.meshes.length,source.parts.length);
  assert.equal(json.nodes[0].children.length,source.parts.length);
  for(const [i,part] of source.parts.entries()){
    const mesh=json.meshes[i],p=mesh.primitives[0],g=part.geometry;
    assert.equal(mesh.name,part.name);assert.equal(json.materials[p.material].name,part.material);
    closeArray(accessor(p.attributes.POSITION),g.attributes.position.array,1e-10,part.name+' positions');
    closeArray(accessor(p.attributes.NORMAL),g.attributes.normal.array,1e-7,part.name+' normals');
    assert.deepEqual(accessor(p.indices),g.index.array,part.name+' indices');
    const expectedUV=new Float32Array(g.attributes.uv.array);
    for(let j=1;j<expectedUV.length;j+=2)expectedUV[j]=1-expectedUV[j];
    assert.deepEqual(accessor(p.attributes.TEXCOORD_0),expectedUV,part.name+' texture orientation');
  }
});

test('current Caecilia embeds the preserved v06 GLB and its manifest hash',()=>{
  const current=read('assets/characters/caecilia/v06/caecilia_gruber_v06.glb');
  const manifest=JSON.parse(read('assets/characters/caecilia/v06/model-manifest.json'));
  assert.equal(sha(current),manifest.glbSHA256);
  assert.equal(current.length,manifest.glbBytes);
  assert.ok(Buffer.from(CAECILIA_GLB,'base64').equals(current));
  // The transferred body generator predates v06. This is an artifact integrity
  // test, not a claim that v06's missing authoring source has been recovered.
});
