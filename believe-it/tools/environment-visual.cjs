const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BELIEVE_IT_PLAYWRIGHT||'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]||'qa/environment-v9/visual-final');
if(fs.existsSync(out))throw new Error('Use a new output directory: '+out);
fs.mkdirSync(out,{recursive:true});
const before=process.argv.includes('--before');
const build=path.resolve(root,before?'deliver/believe_it_farm_v8.html':'dist/browser/believe_it_farm.html');
const ids=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',');
const views=process.argv.find(a=>a.startsWith('--views='))?.slice(8);
const shots=JSON.parse(fs.readFileSync(views?path.resolve(root,views):path.join(__dirname,'environment-views.json'),'utf8')).filter(s=>!ids||ids.includes(s.id));
if(!shots.length)throw new Error('No matching views');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BELIEVE_IT_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const report={build,buildSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(build)).digest('hex'),errors:[],warnings:[],requests:[],shots:[]};
 try{
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  await context.route('**/*',r=>{const u=r.request().url();if(/^(file:|data:|blob:)/.test(u))return r.continue();report.requests.push(u);return r.abort();});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  await page.goto(pathToFileURL(build).href+'?dev=1&still=1');await page.waitForFunction(()=>window.__ready,{timeout:60000});
  for(const gfx of before?['enh']:['enh','retro'])for(const preset of before?['day']:['day','dusk','night'])for(const shot of shots){
   await page.evaluate(o=>window.__set(o),{gfx,preset,lantern:shot.lantern??preset==='night',cam:shot.cam});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const file=`${shot.id}-${preset}-${gfx}.png`;await page.screenshot({path:path.join(out,file)});report.shots.push({id:shot.id,gfx,preset,file,cam:shot.cam,lantern:shot.lantern??preset==='night'});
  }
  report.geometry=await page.evaluate(()=>{let meshes=0,vertices=0,triangles=0,bad=[];window.__dbg.farm.scene.traverse(m=>{if(!m.geometry)return;meshes++;const g=m.geometry,p=g.attributes.position;vertices+=p?.count||0;triangles+=(g.index?.count||p?.count||0)/3;for(const [n,a]of Object.entries(g.attributes))for(const v of a.array)if(!Number.isFinite(v)){bad.push(n);break;}});return{meshes,vertices,triangles,bad};});
 }catch(e){report.failure=e.message;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({out,shots:report.shots.length,errors:report.errors,warnings:report.warnings,requests:report.requests,geometry:report.geometry}));
 if(report.errors.length||report.warnings.length||report.requests.length||report.geometry.bad.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
