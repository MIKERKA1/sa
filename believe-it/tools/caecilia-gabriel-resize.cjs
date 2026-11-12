// Regression for inspection framing when the reference pane or viewport changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BELIEVE_IT_PLAYWRIGHT||'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]||'qa/caecilia-gabriel-v02/resize');
const build=path.resolve(root,process.argv[3]||'dist/browser/believe_it_caecilia_gabriel.html');
if(!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('Use a fresh output directory inside the project');
fs.mkdirSync(out,{recursive:true});
const report={build:path.relative(root,build),buildSHA256:crypto.createHash('sha256').update(fs.readFileSync(build)).digest('hex'),checks:[],errors:[],warnings:[],externalRequests:[]};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,detail});
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
const state=page=>page.evaluate(()=>{
  const x=window.__caeciliaGabriel,face=x.model.meshes.find(m=>m.name==='face'),positions=face.geometry.attributes.position;
  let maxX=0;
  const point=x.camera.position.clone();
  for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).applyMatrix4(face.matrixWorld).project(x.camera);
    maxX=Math.max(maxX,Math.abs(point.x));
  }
  return {maxX,aspect:x.camera.aspect,distance:x.controls.getDistance(),target:x.controls.target.toArray(),angle:x.controls.getAzimuthalAngle(),view:x.view};
});
const near=(a,b)=>Math.abs(a-b)<1e-5;
(async()=>{
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.BELIEVE_IT_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    report.browser=browser.version();
    const context=await browser.newContext({viewport:{width:720,height:1000}});
    await context.route('**/*',r=>/^(file:|data:|blob:)/.test(r.request().url())?r.continue():(report.externalRequests.push(r.request().url()),r.abort()));
    const page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
    await page.goto(pathToFileURL(build).href+'?dev=1&still=1&view=face');
    await page.waitForFunction(()=>window.__ready,null,{timeout:60000});await settle(page);
    const initial=await state(page);
    check('face fits before reference opens',initial.maxX<.96,initial);
    await page.locator('#concept').click();await settle(page);
    const open=await state(page);
    check('face fits beside reference in narrow desktop window',open.maxX<.96,open);
    check('opening reference keeps inspection target and angle',near(open.angle,initial.angle)&&open.target.every((v,i)=>near(v,initial.target[i]))&&open.view==='face',open);
    await page.screenshot({path:path.join(out,'face-reference.png')});
    await page.locator('#concept').click();await settle(page);
    const closed=await state(page);
    check('closing reference restores previous distance',near(closed.distance,initial.distance),closed);
    await page.setViewportSize({width:360,height:1000});await settle(page);
    const portrait=await state(page);
    check('face fits after portrait resize',portrait.maxX<.96,portrait);
    await page.screenshot({path:path.join(out,'portrait-face.png')});
    await page.setViewportSize({width:720,height:1000});await settle(page);
    const stage=await page.locator('#stage').boundingBox();
    await page.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await page.mouse.wheel(0,180);await page.waitForTimeout(250);
    const zoomed=await state(page);
    check('wheel changes user zoom',zoomed.distance>initial.distance,zoomed);
    await page.locator('#concept').click();await settle(page);
    const zoomedOpen=await state(page);
    const normalized=s=>s.distance/Math.max(1,.65/s.aspect);
    check('resize preserves user zoom relative to viewport',near(normalized(zoomedOpen),normalized(zoomed)),zoomedOpen);
    await page.locator('#concept').click();await settle(page);
    check('reference round trip preserves user zoom',near((await state(page)).distance,zoomed.distance));
    check('no console errors or warnings',!report.errors.length&&!report.warnings.length);
    check('no external requests',!report.externalRequests.length);
  }catch(e){report.fatal=e.stack;}
  finally{
    if(browser)await browser.close();
    report.pass=!report.fatal&&report.checks.every(c=>c.pass);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,failed:report.checks.filter(c=>!c.pass),fatal:report.fatal}));
  if(!report.pass)process.exitCode=1;
})();
