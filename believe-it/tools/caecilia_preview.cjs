const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BELIEVE_IT_PLAYWRIGHT||'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]||'qa/caecilia-v01/probe-01');
if(!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('Use a fresh output directory inside the project');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BELIEVE_IT_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const report={errors:[],warnings:[],externalRequests:[],screenshots:[]};
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}});
  await context.route('**/*',r=>/^(file:|data:|blob:)/.test(r.request().url())?r.continue():(report.externalRequests.push(r.request().url()),r.abort()));
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  await page.goto(pathToFileURL(path.join(root,'dist/browser/believe_it_caecilia.html')).href+'?dev=1&still=1');
  await page.waitForFunction(()=>window.__ready,{timeout:60000});
  for(const [id,label]of [['front','Спереди'],['side','Профиль'],['back','Сзади'],['face','Лицо'],['shawl','Шаль'],['boots','Обувь']]){
   await page.getByRole('button',{name:label,exact:true}).click();
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const file=id+'.png';await page.screenshot({path:path.join(out,file)});report.screenshots.push(file);
  }
  report.model=await page.evaluate(()=>window.__caecilia.model.info());
  report.renderer=await page.evaluate(()=>({memory:window.__caecilia.renderer.info.memory,render:window.__caecilia.renderer.info.render}));
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));if(report.errors.length||report.warnings.length||report.externalRequests.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
