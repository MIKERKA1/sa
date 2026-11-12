// Integration check: bundle the unchanged farm together with the current Caecilia Gabriel model,
// stand her in the yard and in the kitchen, and record scale, footing, errors and screenshots.
// Usage: node tools/caecilia-gabriel-farm-check.mjs <new output directory inside the project>
// Browser automation uses the same BELIEVE_IT_PLAYWRIGHT / BELIEVE_IT_BROWSER variables as the other QA tools.
import {build} from 'esbuild';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,isAbsolute,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,process.argv[2]||'');
if(!process.argv[2]||!out.startsWith(root+sep)||fs.existsSync(out))throw Error('Use a new output directory inside the project');
fs.mkdirSync(out,{recursive:true});
const projectFiles={name:'project-files',setup(b){
 b.onResolve({filter:/.*/},async a=>{const c=isAbsolute(a.path)?a.path:a.path.startsWith('.')?resolve(dirname(a.importer),a.path):fileURLToPath(import.meta.resolve(a.path));const p=await fs.promises.realpath(c);if(!p.startsWith(root+sep))throw Error(`Import outside project: ${a.path}`);return {path:p,namespace:'project'};});
 b.onLoad({filter:/.*/,namespace:'project'},async a=>({contents:await fs.promises.readFile(a.path,'utf8'),loader:'js'}));
}};
const template=fs.readFileSync(resolve(root,'src/farm/index.html'),'utf8');
const bundle=await build({absWorkingDir:root,entryPoints:[resolve(root,'tools/caecilia_gabriel_farm_entry.js')],tsconfigRaw:{compilerOptions:{}},plugins:[projectFiles],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'warning'});
const page=resolve(out,'farm_with_caecilia_gabriel.html');
fs.writeFileSync(page,template.replace('/*__BUNDLE__*/',()=>bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')));

const require=createRequire(import.meta.url),{chromium}=require(process.env.BELIEVE_IT_PLAYWRIGHT||'playwright');
const report={page:'farm_with_caecilia_gabriel.html',errors:[],warnings:[],externalRequests:[],placements:[],checks:[]};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,detail});
const browser=await chromium.launch({...(process.env.BELIEVE_IT_BROWSER?{executablePath:process.env.BELIEVE_IT_BROWSER}:{}),headless:true,args:(process.env.BELIEVE_IT_BROWSER_ARGS||'').split(' ').filter(Boolean)});
try{
 const context=await browser.newContext({viewport:{width:960,height:600}});
 await context.route('**/*',r=>/^(file:|data:|blob:)/.test(r.request().url())?r.continue():(report.externalRequests.push(r.request().url()),r.abort()));
 const p=await context.newPage();
 p.on('pageerror',e=>report.errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
 await p.goto(pathToFileURL(page).href+'?dev=1&still=1&preset=day');
 await p.waitForFunction(()=>window.__ready&&window.__caeciliaReady,null,{timeout:240000});
 report.farm=await p.evaluate(()=>window.__dbg.farm.info());report.model=await p.evaluate(()=>window.__caeciliaInFarm.model.info());
 // [name, her x/z, camera feet x/z, level]
 for(const [name,x,z,cx,cz] of [['yard',-6.4,4.2,-6.1,6.9],['kitchen',-6.4,-5.9,-4.5,-5.4]]){
  const placed=await p.evaluate(([x,z,cx,cz])=>{const r=window.__caeciliaInFarm.place(x,z,cx,cz);window.__set({cam:{pos:[cx,0,cz],look:[x,r.floor+.75,z]}});return r;},[x,z,cx,cz]);
  await p.waitForTimeout(1500);await p.screenshot({path:resolve(out,name+'.png'),timeout:300000}); // software GL is slow
  report.placements.push({name,...placed});
  check(`${name}: 1.22 m tall in world units`,Math.abs(placed.height-1.22)<.004,placed.height);
  check(`${name}: soles rest on the game floor`,Math.abs(placed.feetAboveFloor-.001)<.002,placed.feetAboveFloor);
 }
 check('no page errors',report.errors.length===0,report.errors);check('no external requests',report.externalRequests.length===0,report.externalRequests);
}finally{await browser.close();}
fs.writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:report.checks.map(c=>`${c.pass?'ok':'FAIL'} ${c.name}`),errors:report.errors,warnings:report.warnings.length},null,1));
process.exit(report.checks.every(c=>c.pass)?0:1);
