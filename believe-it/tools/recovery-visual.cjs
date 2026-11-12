const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]||'qa/recovery/visual-final');
if(fs.existsSync(out))throw new Error('Use a new output directory: '+out);
fs.mkdirSync(out,{recursive:true});
const shots=[
  {id:'kitchen',spot:'r4'},
  {id:'kitchen-work',cam:{pos:[-6.15,.35,-5.9],look:[-4.75,1.1,-5.12],eye:1.2}},
  {id:'r1',spot:'r1'},{id:'r2',cam:{pos:[-9.85,.35,-6.15],look:[-12.25,1.1,-6.6]}},
  {id:'r3',spot:'r3'},{id:'r5',spot:'r5'},{id:'r6',cam:{pos:[-1.1,.35,-5.7],look:[-2.25,1.2,-7.5]}},
  {id:'stable',spot:'r7'},{id:'feed',spot:'r8'},{id:'barn',spot:'r9'},
  {id:'workshop',cam:{pos:[17.36,.05,-4.06],look:[18.8,.9,-6.4]}},
  {id:'machine',cam:{pos:[17.52,.05,-2.08],look:[18.5,1.1,1.3]}},
  {id:'attic',spot:'attic'},{id:'nest',spot:'nest'},{id:'yard',spot:'gate'},
  {id:'wood',cam:{pos:[-5.48,0,11.34],look:[-7.45,.75,9.6],eye:1.05}},
  {id:'forest',cam:{pos:[6.5,0,-28],look:[4.0,1.6,-49]}},
  {id:'hut',spot:'hut'},{id:'hut-inside',cam:{pos:[3.33,.05,-14.84],look:[1.7,.92,-13.74],eye:1.22}},
];
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  const report={errors:[],warnings:[],requests:[],shots:[]};
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning'&&!report.warnings.includes(m.text()))report.warnings.push(m.text());});
  await context.route('**/*',route=>{const url=route.request().url();if(/^(file:|data:|blob:)/.test(url))return route.continue();report.requests.push(url);return route.abort();});
  try{
    await page.goto(pathToFileURL(path.join(root,'dist/browser/believe_it_farm.html')).href+'?dev=1&still=1');
    await page.waitForFunction(()=>window.__ready,{timeout:30000});
    report.buildSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'dist/browser/believe_it_farm.html'))).digest('hex');
    report.info=await page.evaluate(()=>window.__dbg.farm.info());
    report.areas=await page.evaluate(()=>window.__dbg.farm.ctx.detailAreas);
    const presets=process.argv.includes('--full')?['day','dusk','night']:['day','dusk'];
    const graphics=process.argv.includes('--full')?['enh','retro']:['enh'];
    for(const gfx of graphics)for(const preset of presets)for(const shot of shots){
      await page.evaluate(({gfx,preset,shot})=>window.__set({gfx,preset,...(shot.spot?{spot:shot.spot}:{cam:shot.cam}),lantern:preset==='night'&&shot.id!=='yard'&&shot.id!=='forest'}),{gfx,preset,shot});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const file=`${shot.id}-${preset}-${gfx}.png`;await page.screenshot({path:path.join(out,file)});
      report.shots.push({id:shot.id,preset,gfx,file});
    }
    report.geometry=await page.evaluate(()=>{
      const {farm}=window.__dbg;let vertices=0,meshes=0,bad=[];
      farm.scene.traverse(m=>{if(!m.geometry)return;meshes++;const p=m.geometry.attributes.position;if(!p)return;vertices+=p.count;for(let i=0;i<p.array.length;i++)if(!Number.isFinite(p.array[i])){bad.push(m.name||m.geometry.type);break;}});
      return {meshes,vertices,bad};
    });
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({out,info:report.info,geometry:report.geometry,shots:report.shots.length,errors:report.errors,warnings:report.warnings.length,externalRequests:report.requests}));
  if(report.errors.length||report.warnings.length||report.requests.length||report.geometry.bad.length)process.exitCode=1;
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
