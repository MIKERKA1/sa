import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PS1Pipeline,LIGHTS,ps1Material,GFX,setGfx,Shadows} from '../engine/ps1.js';
import {TEX_OPT} from '../engine/util.js';
import {makeViktoria,VIKTORIA_CONCEPT} from '../models/viktoria.js';

THREE.ColorManagement.enabled=false;
const $=s=>document.querySelector(s),Q=new URLSearchParams(location.search),DEV=Q.has('dev'),STILL=Q.has('still');
const stage=$('#stage'),renderer=new THREE.WebGLRenderer({canvas:$('#c'),antialias:false,preserveDrawingBuffer:DEV,powerPreference:'high-performance'});
// Count the whole scene + postprocessing frame, rather than only the final quad.
// https://threejs.org/docs/pages/WebGLRenderer.html#info
renderer.info.autoReset=false;
renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setClearColor(0x626263,1);TEX_OPT.aniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
setGfx(Q.get('gfx')!=='retro');
const pipe=new PS1Pipeline(renderer),shadows=new Shadows(renderer,2048,512),scene=new THREE.Scene();
pipe.look={bloom:.025,thr:.95,knee:.3,sat:1,contrast:.02,vig:.08,grain:.003,expo:1,shadowTint:[1,1,1],hiTint:[1,1,1]};
LIGHTS.uSkyAmb.value.setRGB(.65,.65,.66);LIGHTS.uGroundAmb.value.setRGB(.34,.325,.31);
LIGHTS.uSunDir.value.set(-.4,.65,.8).normalize();LIGHTS.uSunCol.value.setRGB(.5,.48,.455);
LIGHTS.uFogNear.value=1000;LIGHTS.uFogFar.value=2000;
for(const c of LIGHTS.uPtCol.value)c.setRGB(0,0,0);
const camera=new THREE.PerspectiveCamera(30,1,.01,30),controls=new OrbitControls(camera,stage);
controls.enableDamping=true;controls.dampingFactor=.12;controls.minDistance=.24;controls.maxDistance=6;controls.autoRotateSpeed=1.2;
const model=await makeViktoria();scene.add(model.group);
const floor=new THREE.Mesh(new THREE.CircleGeometry(2.5,96),ps1Material({tint:[.4,.395,.38],vertexColors:false,fog:0}));
floor.rotation.x=-Math.PI/2;floor.position.y=.004;scene.add(floor);
const info=model.info();$('#stats').textContent=`${info.triangles.toLocaleString('ru-RU')} треугольников`;
$('#concept-image').src=VIKTORIA_CONCEPT;
const VIEWS={front:{target:[0,.823,0],angle:0,elev:0,distance:3.78},side:{target:[0,.823,0],angle:Math.PI/2,elev:0,distance:3.78},back:{target:[0,.823,0],angle:Math.PI,elev:0,distance:3.78},face:{target:[0,1.488,.034],angle:-.13,elev:.015,distance:.66},shawl:{target:[0,1.205,0],angle:-.45,elev:.10,distance:1.12},boots:{target:[0,.11,.03],angle:-.4,elev:.18,distance:.76}};
let view='front',wire=false,shadowDirty=true,last=performance.now(),frames=[],aspectFit=1;
function preset(name){
  view=Object.hasOwn(VIEWS,name)?name:'front';const p=VIEWS[view];
  controls.autoRotate=false;$('#spin').setAttribute('aria-pressed','false');
  // Flush the previous drag's damping before setting an exact inspection view.
  // Uses public r170 controls APIs: https://threejs.org/docs/pages/OrbitControls.html#update
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update(0);
  controls.target.set(...p.target);const d=p.distance*Math.max(1,.65/camera.aspect);
  camera.position.copy(controls.target).add(new THREE.Vector3(Math.sin(p.angle)*Math.cos(p.elev),Math.sin(p.elev),Math.cos(p.angle)*Math.cos(p.elev)).multiplyScalar(d));
  controls.update(0);controls.enableDamping=damping;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
}
function resize(){
  const {width,height}=stage.getBoundingClientRect();
  renderer.setSize(Math.max(2,width),Math.max(2,height),false);
  camera.aspect=Math.max(2,width)/Math.max(2,height);camera.updateProjectionMatrix();
  // Keep the user's inspection angle and zoom when the reference narrows the stage.
  // r170 aspect/projection: https://github.com/mrdoob/three.js/blob/r170/docs/api/en/cameras/PerspectiveCamera.html
  const fit=Math.max(1,.65/camera.aspect);
  camera.position.sub(controls.target).multiplyScalar(fit/aspectFit).add(controls.target);
  controls.minDistance=.24*fit;controls.maxDistance=6*fit;aspectFit=fit;
  pipe.setSize(renderer.domElement.width,renderer.domElement.height,360,360);
  pipe.setSizeEnh(renderer.domElement.width,renderer.domElement.height,Math.min(1200,renderer.domElement.height));
}
new ResizeObserver(resize).observe(stage);resize();preset(Q.get('view')??'front');
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>preset(b.dataset.view));
function graphics(enh){setGfx(enh);$('#gfx').textContent=enh?'Улучшенная графика':'Ретро PS1';$('#gfx').setAttribute('aria-pressed',String(enh));resize();shadowDirty=true;}
$('#gfx').onclick=()=>graphics(!GFX.enh);graphics(GFX.enh);
$('#concept').onclick=()=>{const on=$('#reference').hidden;$('#reference').hidden=!on;$('#concept').setAttribute('aria-pressed',String(on));};
$('#spin').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('#spin').setAttribute('aria-pressed',String(controls.autoRotate));};
$('#wire').onclick=()=>{wire=!wire;model.setWire(wire);$('#wire').setAttribute('aria-pressed',String(wire));shadowDirty=true;};
$('#download').onclick=()=>{const url=URL.createObjectURL(new Blob([model.bytes],{type:'model/gltf-binary'})),a=document.createElement('a');a.href=url;a.download='viktoria_gabriel_v12.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
stage.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();const p=camera.position.clone().sub(controls.target);if(e.key==='ArrowLeft'||e.key==='ArrowRight')p.applyAxisAngle(new THREE.Vector3(0,1,0),(e.key==='ArrowLeft'?-1:1)*.13);else if(e.key==='+'||e.key==='-')p.multiplyScalar(e.key==='+'?.9:1.1);else p.y+=(e.key==='ArrowUp'?1:-1)*.05;camera.position.copy(controls.target).add(p);controls.update();});
function render(now){const elapsed=now-last,dt=Math.min(.05,elapsed/1000);last=now;controls.update(dt);renderer.info.reset();if(shadowDirty){if(wire)shadows.off();else shadows.render(scene,{center:new THREE.Vector3(0,.79,0),half:1.2});shadowDirty=false;}pipe.render(scene,camera,{time:STILL?0:now/1000,vhs:0,dither:.65,enhDither:.12});if(DEV){frames.push(elapsed);if(frames.length>600)frames.shift();}requestAnimationFrame(render);}
if(renderer.extensions.has('KHR_parallel_shader_compile'))await renderer.compileAsync(scene,camera);
if(DEV)window.__viktoria={model,scene,camera,controls,renderer,pipe,preset,graphics,frames,get view(){return view;}};
$('#loading').hidden=true;window.__ready=true;last=performance.now();requestAnimationFrame(render);
