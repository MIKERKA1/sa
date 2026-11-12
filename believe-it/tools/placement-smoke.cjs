// Open an issued farm without diagnostic hooks and use its normal UI (defaults to v8).
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.BELIEVE_IT_PLAYWRIGHT || 'C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname,'..'), out = path.resolve(root,process.argv[2] || 'qa/placement-v8/smoke-final');
if(fs.existsSync(out))throw new Error('Use a new output directory: '+out);
fs.mkdirSync(out,{recursive:true});
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BELIEVE_IT_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true });
  const file = path.resolve(root,process.argv[3]||'deliver/believe_it_farm_v8.html');
  const report = { file, buildSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'), errors:[], warnings:[], requests:[], shots:[] };
  try {
    const context = await browser.newContext({ viewport:{width:1280,height:800} });
    await context.route('**/*',r => { const u=r.request().url(); if(/^(file:|data:|blob:)/.test(u))return r.continue(); report.requests.push(u); return r.abort(); });
    const page = await context.newPage();
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(()=>window.__ready,{timeout:60000});
    report.production = await page.evaluate(()=>!window.__dbg && !window.__set && !window.__walk);
    report.canvasVisible = await page.locator('canvas').isVisible();
    for(const [name,gfx,preset] of [['Хлев','Улучшенная','День'],['Кормовая','Ретро','Сумерки'],['Кухня','Улучшенная','Ночь'],['Будка с мотором','Улучшенная','День']]) {
      await page.getByRole('button',{name,exact:true}).click();
      await page.getByRole('button',{name:gfx,exact:true}).click();
      await page.getByRole('button',{name:preset,exact:true}).click();
      if(preset==='Ночь')await page.keyboard.press('KeyL');
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const shot=`scene-${report.shots.length}.png`;await page.screenshot({path:path.join(out,shot)});
      report.shots.push({name,gfx,preset,file:shot});
    }
  } catch(e) { report.failure=e.message;throw e; }
  finally { fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close(); }
  console.log(JSON.stringify(report));
  if(!report.production||!report.canvasVisible||report.shots.length!==4||report.errors.length||report.warnings.length||report.requests.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
