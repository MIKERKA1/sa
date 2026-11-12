// Walk across every usable ground-floor doorway in both directions.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BELIEVE_IT_PLAYWRIGHT||'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]||'qa/environment-v9/routes');
if(fs.existsSync(out))throw new Error('Use a new output directory');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BELIEVE_IT_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const report={errors:[],warnings:[],requests:[],checks:[]};
 try{
  const context=await browser.newContext({viewport:{width:1024,height:640}}),page=await context.newPage();
  await context.route('**/*',r=>{if(/^(file:|blob:|data:)/.test(r.request().url()))return r.continue();report.requests.push(r.request().url());return r.abort();});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  await page.goto(pathToFileURL(path.join(root,'dist/browser/believe_it_farm.html')).href+'?dev=1&still=1');await page.waitForFunction(()=>window.__ready,{timeout:60000});
  report.checks=await page.evaluate(()=>{
   const {farm,P,cam}=window.__dbg,update=farm.update.bind(farm),checks=[];
   window.__set({gfx:'enh',preset:'day',hutLock:'broken'});
   const step=()=>{for(let i=0;i<400;i++)update(.01,0,cam,{lvl:0,snap:true});farm.scene.updateMatrixWorld(true);};
   const d7=farm.doors.find(d=>d.d.id==='d7'),[hx,hy,hz]=d7.d.hinge;
   // Unlock from the pantry before testing traversal through the open doorway.
   farm.use({kind:'door',D:d7},{x:hx-Math.sin(d7.d.yaw)*.6,y:hy+1.35,z:hz-Math.cos(d7.d.yaw)*.6});step();
   farm.use({kind:'door',D:farm.doors.find(d=>d.d.id==='d16')});step();
   const ids=farm.doors.filter(d=>d.d.id!=='d8').map(d=>d.d.id);
   window.__set({open:ids,close:['d8']});step();
   const cross=(D,side)=>{
    const d=D.d,n=[Math.sin(d.yaw),Math.cos(d.yaw)],mid=[d.hinge[0]+Math.cos(d.yaw)*d.w/2,d.hinge[2]-Math.sin(d.yaw)*d.w/2];
    const start=[mid[0]+n[0]*side*.55,d.hinge[1],mid[1]+n[1]*side*.55];
    window.__set({cam:{pos:start,eye:1.35,look:[mid[0]-n[0]*side,1.35+d.hinge[1],mid[1]-n[1]*side]}});P.vel.set(0,0,0);
    const result=window.__walk(['KeyW'],.85),progress=-side*((result.pos[0]-mid[0])*n[0]+(result.pos[2]-mid[1])*n[1]);
    return {side,start,result,progress};
   };
   for(const D of farm.doors){
    const details=[cross(D,1),cross(D,-1)];
    checks.push({name:D.d.id+(D.d.id==='d8'?' stays boarded shut':' allows walking in both directions'),pass:details.every(r=>D.d.id==='d8'?r.progress<-.2:r.progress>.25),details});
   }
   return checks;
  });
 }catch(e){report.failure=e.message;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 const failed=report.checks.filter(c=>!c.pass);console.log(JSON.stringify({checks:report.checks.length,failed,errors:report.errors,warnings:report.warnings}));
 if(failed.length||report.errors.length||report.warnings.length||report.requests.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
