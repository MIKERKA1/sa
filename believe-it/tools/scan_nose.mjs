import {headSDF} from '../src/models/caecilia_head.js';
// side view ray along -x at height y and depth z: list solid intervals in x (0..0.06)
const out=[];
for(let y=1.385;y<=1.461;y+=.004){
  let row=y.toFixed(3)+' ';
  for(let z=.060;z<=.112;z+=.002){
    // is there any solid along x from 0 to .05 at (y,z)?  and does it connect to the face at x=0?
    let solid0=headSDF(0,y,z)<0;
    let any=false;for(let x=0;x<.05;x+=.0005)if(headSDF(x,y,z)<0){any=true;break;}
    row+=solid0?'#':(any?'+':'.');
  }
  out.push(row);
}
console.log('z: .060 -> .112 step .002   #=solid at midline, .=empty (see-through in profile)');
console.log(out.reverse().join('\n'));
