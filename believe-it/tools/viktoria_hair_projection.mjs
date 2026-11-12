// Sample the actual hair shell, keeping projection and geometry in agreement.
import fs from 'node:fs';
import {hairPoint,hairE0} from '../src/models/viktoria_geometry.js';
const size=512,points=new Float32Array(size*size*3);
for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const u=(i+.5)/size,v=1-(j+.5)/size,a=(u-.5)*2*Math.PI,e0=hairE0(a);
  const p=hairPoint(a,e0+(Math.PI/2-1e-4-e0)*v**.9);p.toArray(points,(j*size+i)*3);
}
fs.writeFileSync(new URL('../assets/characters/viktoria/v12/hair-projection.f32',import.meta.url),Buffer.from(points.buffer));
console.log('Sampled 512 x 512 hair coordinates');
