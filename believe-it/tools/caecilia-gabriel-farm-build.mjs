// Builds one standalone HTML: the walkable farm with the current Caecilia Gabriel model standing in the yard.
// Usage: node tools/caecilia-gabriel-farm-build.mjs <output html inside the project>
import {build} from 'esbuild';
import fs from 'node:fs';
import {dirname,isAbsolute,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,process.argv[2]||'');
if(!process.argv[2]||!out.startsWith(root+sep)||fs.existsSync(out))throw Error('Give a new output file inside the project');
const farmMain=resolve(root,'src/farm/main.js'),farmScene=resolve(root,'src/scenes/farm.js'),hook=resolve(root,'tools/caecilia_gabriel_farm_hook.js');
const projectFiles={name:'project-files',setup(b){
 b.onResolve({filter:/.*/},async a=>{
  const c=isAbsolute(a.path)?a.path:a.path.startsWith('.')?resolve(dirname(a.importer),a.path):fileURLToPath(import.meta.resolve(a.path));let p=await fs.promises.realpath(c);
  if(!p.startsWith(root+sep))throw Error(`Import outside project: ${a.path}`);
  // Only the farm entry gets the stand-in; the stand-in itself imports the real scene.
  if(p===farmScene&&a.importer===farmMain)p=hook;
  return {path:p,namespace:'project'};});
 b.onLoad({filter:/.*/,namespace:'project'},async a=>({contents:await fs.promises.readFile(a.path,'utf8'),loader:'js'}));
}};
const template=fs.readFileSync(resolve(root,'src/farm/index.html'),'utf8');
if(template.split('/*__BUNDLE__*/').length!==2)throw Error('src/farm/index.html: expected exactly one bundle placeholder');
const bundle=await build({absWorkingDir:root,entryPoints:[resolve(root,'tools/caecilia_gabriel_farm_play_entry.js')],tsconfigRaw:{compilerOptions:{}},plugins:[projectFiles],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'warning'});
const html=template.replace('/*__BUNDLE__*/',()=>bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
fs.mkdirSync(dirname(out),{recursive:true});fs.writeFileSync(out,html,'utf8');
console.log(`${out} (${(Buffer.byteLength(html)/1e6).toFixed(2)} MB)`);
