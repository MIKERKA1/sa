// QA-only entry: runs the real farm build and stands Caecilia Gabriel in it. Not part of any shipped target.
// It imports the game unchanged and needs ?dev=1, which is when the farm exposes window.__dbg.
import '../src/farm/main.js';
import * as THREE from 'three';
import {makeCaeciliaGabriel} from '../src/models/caecilia_gabriel.js';

const {farm}=window.__dbg,model=await makeCaeciliaGabriel();
farm.scene.add(model.group);
// Stand on whatever the game reports as the floor at (x, z) and turn to face a point.
window.__caeciliaInFarm={model,
 place(x,z,lookX,lookZ,level=0){
  const y=farm.floorAt(x,z,level)??0;model.group.position.set(x,y,z);model.group.rotation.y=Math.atan2(lookX-x,lookZ-z);model.group.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model.group);
  return {floor:y,min:box.min.toArray(),max:box.max.toArray(),height:box.max.y-box.min.y,feetAboveFloor:box.min.y-y};
 }};
window.__caeciliaReady=true;
