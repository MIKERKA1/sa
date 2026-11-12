// Isolated offline browser checks. Always use a new output directory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BELIEVE_IT_PLAYWRIGHT||'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const out=path.resolve(root,process.argv[2]||'qa/caecilia-gabriel-v01/regression');
const build=path.resolve(root,process.argv[3]||'dist/browser/believe_it_caecilia_gabriel.html');
const glb=path.resolve(root,process.argv[4]||'assets/characters/caecilia_gabriel/v01/caecilia_gabriel_v01.glb');
if(!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('Use a fresh output directory inside the project');
fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={build:path.relative(root,build),buildSHA256:sha(fs.readFileSync(build)),errors:[],warnings:[],externalRequests:[],checks:[],screenshots:[]};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
const views=[['front','Спереди'],['side','Профиль'],['back','Сзади'],['face','Лицо'],['shawl','Одежда'],['boots','Обувь']];
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const state=page=>page.evaluate(()=>{
  const x=window.__caeciliaGabriel;
  return {camera:x.camera.position.toArray(),target:x.controls.target.toArray(),angle:x.controls.getAzimuthalAngle(),spin:x.controls.autoRotate,distance:x.controls.getDistance(),view:x.view};
});
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png')});report.screenshots.push(name+'.png');}
async function monitored(browser,options){
  const context=await browser.newContext(options);
  await context.route('**/*',r=>/^(file:|data:|blob:)/.test(r.request().url())?r.continue():(report.externalRequests.push(r.request().url()),r.abort()));
  return context;
}
async function appPage(context){
  // Observe our application pages, not Edge's automatically opened downloads UI.
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  return page;
}
async function ready(page,url){await page.goto(url);await page.waitForFunction(()=>window.__ready,null,{timeout:60000});await settle(page);}

(async()=>{
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.BELIEVE_IT_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    report.browser=browser.version();
    const context=await monitored(browser,{viewport:{width:1280,height:1000},acceptDownloads:true});
    const page=await appPage(context),url=pathToFileURL(build).href;
    await ready(page,url+'?dev=1&still=1');
    report.model=await page.evaluate(()=>window.__caeciliaGabriel.model.info());
    report.gpu=await page.evaluate(()=>{
      const gl=window.__caeciliaGabriel.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,version:gl.getParameter(gl.VERSION)};
    });
    for(const gfx of ['enh','retro']){
      if((await page.locator('#gfx').getAttribute('aria-pressed'))!==(gfx==='enh'?'true':'false'))await page.locator('#gfx').click();
      for(const [id,label] of views){
        await page.getByRole('button',{name:label,exact:true}).click();await settle(page);
        const s=await state(page);check(`${gfx}: ${id} preset`,s.view===id&&s.camera.every(Number.isFinite)&&await page.locator(`[data-view="${id}"]`).getAttribute('aria-pressed')==='true');
        await screenshot(page,`${gfx}-${id}`);
      }
      check(`${gfx}: correct texture resolution`,await page.evaluate(()=>{
        const x=window.__caeciliaGabriel,enh=document.querySelector('#gfx').getAttribute('aria-pressed')==='true';
        return x.model.meshes.every(m=>!m.material.userData.lo||(enh?m.material.uniforms.map.value.image.width>128:m.material.uniforms.map.value.image.width===128));
      }));
    }
    await page.locator('#gfx').click();
    await page.locator('[data-view="front"]').click();
    await page.locator('#spin').click();
    await page.waitForFunction(()=>Math.abs(window.__caeciliaGabriel.controls.getAzimuthalAngle())>.015);
    await page.locator('[data-view="front"]').click();
    await page.waitForTimeout(180);
    const stopped=await state(page);
    check('preset stops rotation and holds the selected view',!stopped.spin&&Math.abs(stopped.angle)<1e-5,stopped);
    if(stopped.spin)await page.locator('#spin').click();
    const box=await page.locator('#stage').boundingBox(),cx=box.x+box.width*.55,cy=box.y+box.height*.5;
    await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+155,cy+35,{steps:5});await page.mouse.up();
    await page.locator('[data-view="front"]').click();await page.waitForTimeout(180);
    const reset=await state(page);
    check('preset clears drag inertia',Math.abs(reset.angle)<1e-5,reset);
    await page.locator('#stage').focus();const keyboardBefore=await state(page);
    await page.keyboard.press('ArrowRight');await settle(page);
    check('keyboard rotates model',Math.abs((await state(page)).angle-keyboardBefore.angle)>.05);
    const zoomBefore=await state(page);await page.mouse.move(cx,cy);await page.mouse.wheel(0,-300);await page.waitForTimeout(150);
    check('wheel zooms in',(await state(page)).distance<zoomBefore.distance);
    const panBefore=await state(page);
    await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx+80,cy+30,{steps:5});await page.mouse.up({button:'right'});await settle(page);
    check('right drag pans model',(await state(page)).target.some((x,i)=>Math.abs(x-panBefore.target[i])>.005));
    await page.locator('[data-view="front"]').click();
    await page.locator('#wire').click();await settle(page);
    check('wireframe is applied to every part',await page.evaluate(()=>window.__caeciliaGabriel.model.meshes.every(m=>m.material.wireframe)));
    await screenshot(page,'wireframe');await page.locator('#wire').click();await settle(page);
    check('original materials return after wireframe',await page.evaluate(()=>window.__caeciliaGabriel.model.meshes.every(m=>!m.material.wireframe)));
    await page.locator('#concept').click();await settle(page);
    check('approved concept appears beside model',await page.locator('#reference').isVisible()&&await page.locator('#concept-image').evaluate(im=>im.complete&&im.naturalWidth>0));
    await screenshot(page,'concept');await page.locator('#concept').click();await settle(page);
    check('concept can be closed',await page.locator('#reference').isHidden());
    const downloadEvent=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadEvent;
    await download.saveAs(path.join(out,'downloaded.glb'));
    report.download={filename:download.suggestedFilename(),bytes:fs.statSync(path.join(out,'downloaded.glb')).size,sha256:sha(fs.readFileSync(path.join(out,'downloaded.glb')))};
    check('download is the exact standalone GLB',report.download.sha256===sha(fs.readFileSync(glb))&&report.download.filename===path.basename(glb));
    const samples=[];
    for(const gfx of [true,false]){
      if((await page.locator('#gfx').getAttribute('aria-pressed'))!==String(gfx))await page.locator('#gfx').click();
      await page.evaluate(()=>new Promise(resolve=>{let n=75;const step=()=>--n?requestAnimationFrame(step):resolve();requestAnimationFrame(step);}));
      samples.push(await page.evaluate(()=>{
        const x=window.__caeciliaGabriel,dt=x.frames.slice(-60).sort((a,b)=>a-b),info=x.renderer.info;
        return {mode:document.querySelector('#gfx').textContent,frames:dt.length,medianMs:dt[30],p95Ms:dt[57],maxMs:dt.at(-1),memory:{...info.memory},render:{...info.render},programs:info.programs.length,contextLost:x.renderer.getContext().isContextLost()};
      }));
    }
    report.samples=samples;check('GPU context stays available',samples.every(s=>!s.contextLost));
    check('reported frame includes scene geometry',samples.every(s=>s.render.triangles>=report.model.triangles&&s.render.calls>=report.model.parts));
    const production=await appPage(context);await ready(production,url);
    check('production loads without diagnostic API',await production.evaluate(()=>!window.__caeciliaGabriel&&document.querySelector('#loading').hidden));
    await production.locator('#gfx').click();await production.locator('[data-view="back"]').click();await settle(production);
    check('production graphics and view buttons work',await production.locator('#gfx').getAttribute('aria-pressed')==='false'&&await production.locator('[data-view="back"]').getAttribute('aria-pressed')==='true');
    await screenshot(production,'production');await production.close();
    const mobileContext=await monitored(browser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const mobile=await appPage(mobileContext);await ready(mobile,url);
    check('mobile page has no horizontal overflow',await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('mobile stage and footer fit',await mobile.evaluate(()=>{
      const stage=document.querySelector('#stage').getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect();
      return stage.height>300&&stage.width>300&&footer.bottom<=innerHeight+1;
    }));
    await screenshot(mobile,'mobile-front');
    await mobile.locator('#concept').tap();await mobile.locator('#gfx').tap();await settle(mobile);
    check('touch buttons show reference and switch graphics',await mobile.locator('#reference').isVisible()&&await mobile.locator('#gfx').getAttribute('aria-pressed')==='false');
    await screenshot(mobile,'mobile-concept');await mobileContext.close();
    check('no console errors or warnings',report.errors.length===0&&report.warnings.length===0);
    check('offline build needs no external requests',report.externalRequests.length===0);
  }catch(error){report.fatal=error.stack;process.exitCode=1;}
  finally{
    if(browser)await browser.close();
    report.pass=!report.fatal&&report.checks.every(c=>c.pass);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,failed:report.checks.filter(c=>!c.pass),screenshots:report.screenshots.length,errors:report.errors,warnings:report.warnings,fatal:report.fatal}));
  if(!report.pass)process.exitCode=1;
})();
