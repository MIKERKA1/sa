// Entry of the walkable farm with Caecilia Gabriel standing in the yard. The farm itself is imported unchanged.
import '../src/farm/main.js';
import {created} from './caecilia_gabriel_farm_hook.js';
import {makeCaeciliaGabriel} from '../src/models/caecilia_gabriel.js';

// In front of the house door, facing the gate where the player starts.
const SPOT={x:-6.4,z:4.2,lookX:17.5,lookZ:21};
const farm=created.farm,model=await makeCaeciliaGabriel();
model.group.position.set(SPOT.x,farm.floorAt(SPOT.x,SPOT.z,0)??0,SPOT.z);
model.group.rotation.y=Math.atan2(SPOT.lookX-SPOT.x,SPOT.lookZ-SPOT.z);
farm.scene.add(model.group);
window.__caeciliaReady=true;
