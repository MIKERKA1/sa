import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {radialHit,sdfGrad,UVMAP} from '../src/models/caecilia_gabriel_head.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),size=768;
const data=new Float32Array(size*size*6);
for(let j=0;j<size;j++)for(let i=0;i<size;i++){
 const a=((i+.5)/size-.5)*2*Math.PI,y=UVMAP.y1-(j+.5)/size*(UVMAP.y1-UVMAP.y0),p=radialHit(a,y),k=(j*size+i)*6;
 if(p){data.set(p,k);data.set(sdfGrad(...p),k+3);}
}
const out=path.join(root,'qa/caecilia-gabriel-v03');await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'head-atlas.f32'),Buffer.from(data.buffer));
console.log(`Head projection coordinates ready: ${size} x ${size}`);
