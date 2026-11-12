// Print the head generator's midline profile and front half-width at the heights measured on the sheet.
// node tools/_headmeasure.mjs  (scratch, run from the project root)
import fs from 'node:fs';
import {headSDF,frontZ} from '../src/models/caecilia_gabriel_head.js';
const c=JSON.parse(fs.readFileSync('/tmp/r/concept_face.json','utf8'));
const half=y=>{let best=0;for(let z=-.06;z<=.09;z+=.003){let lo=0,hi=.12;if(headSDF(0,y,z)>0)continue;for(let i=0;i<22;i++){const m=(lo+hi)/2;headSDF(m,y,z)<0?lo=m:hi=m;}best=Math.max(best,lo);}return best;};
let s='profile y: sheet / model (mm in front of axis)\n';
for(const [y,z,k] of c.profile){const m=frontZ(0,y);s+=`${y.toFixed(3)}: ${(z*1000).toFixed(0)}${k[0]} / ${Number.isFinite(m)?(m*1000).toFixed(0):'-'}   `;}
s+='\nfront y: sheet L/R / model half-width (mm)\n';
for(const [y,l,r] of c.front)s+=`${y.toFixed(3)}: ${(l*1000).toFixed(0)}/${(r*1000).toFixed(0)} / ${(half(y)*1000).toFixed(0)}   `;
console.log(s);
