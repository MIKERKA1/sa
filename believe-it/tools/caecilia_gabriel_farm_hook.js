// Build-time stand-in for src/scenes/farm.js, used only by tools/caecilia-gabriel-farm-build.mjs.
// It lets the unchanged farm entry hand over the farm it creates, without ?dev and without editing the game.
import {createFarm as createRealFarm} from '../src/scenes/farm.js';
export * from '../src/scenes/farm.js';
export const created={farm:null};
export function createFarm(...args){created.farm=createRealFarm(...args);return created.farm;}
