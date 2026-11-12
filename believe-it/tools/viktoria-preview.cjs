// Isolated Edge capture of the actual offline build. No external requests.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BELIEVE_IT_PLAYWRIGHT||'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),file=path.resolve(root,process.argv[2]),out=path.resolve(root,process.argv[3]);
if(!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('Use a new capture directory inside the project');
fs.mkdirSync(out,{recursive:true});
const report={file:path.relative(root,file),errors:[],warnings:[],externalRequests:[],screenshots:[]};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BELIEVE_IT_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1200,height:1000}});
  await context.route('**/*',r=>/^(file:|data:|blob:)/.test(r.request().url())?r.continue():(report.externalRequests.push(r.request().url()),r.abort()));
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  await page.goto(pathToFileURL(file).href+'?dev=1&still=1');
  await page.waitForFunction(()=>window.__ready,null,{timeout:60000});
  for(const [name,angle,enh,distance] of [['front',0,true,3.78],['face',0,true,.63],['three-quarter',-.65,true,.63],['profile',Math.PI/2,true,.63],['retro',0,false,.63]]){
   await page.evaluate(({name,angle,enh,distance})=>{
    const x=window.__viktoria;x.preset(name==='front'?'front':'face');x.graphics(enh);
    x.controls.enableDamping=false;
    if(name!=='front')x.controls.target.set(0,1.51,.025);
    const p=x.controls.target;x.camera.position.set(p.x+Math.sin(angle)*distance,p.y,p.z+Math.cos(angle)*distance);x.controls.update();
   },{name,angle,enh,distance});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.screenshot({path:path.join(out,name+'.png')});report.screenshots.push(name+'.png');
  }
  report.model=await page.evaluate(()=>window.__viktoria.model.info());
  report.renderer=await page.evaluate(()=>({memory:window.__viktoria.renderer.info.memory,render:window.__viktoria.renderer.info.render}));
 } finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));if(report.errors.length||report.externalRequests.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
