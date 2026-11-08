// Verify the illustrated guide online, in project ZIPs, and offline.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-guide-document-'));
(async()=>{
 let browser;const server=cp.spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',path.join(root,'static-app')]);
 try{
  const port=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=String(d).match(/port (\d+)/);if(m)resolve(m[1]);});server.on('error',reject);});const base='http://127.0.0.1:'+port;
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1200,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=async(p=page)=>{await p.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await expect(p.locator('#page-error')).toBeEmpty();await expect(p.locator('#recovery-error')).toBeHidden();};
  const documentReady=async(p=page)=>{
    await p.getByRole('button',{name:'Field Guide project guide',exact:true}).click();await expect(p.locator('#document-content img')).toHaveCount(6);
    for(const img of await p.locator('#document-content img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode());assert.ok(await img.getAttribute('alt'));}
    await expect(p.locator('#document-content h1').first()).toHaveText('DOWNLOAD YOUR WORK TO KEEP IT');
    assert.ok(await p.locator('#document-content h1').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=28);
    await expect(p.locator('#document-content strong').first()).toContainText('YOUR WORK MAY NOT SAVE UNLESS YOU DOWNLOAD IT');
    for(const phrase of ['210 characters','230 characters','Apply rectangle','Apply adjustments','Download SVG ZIP','Save project'])await expect(p.locator('#document-content')).toContainText(phrase);
  };
  const save=async(p,file)=>{const download=p.waitForEvent('download');await p.locator('#save-project').click();await (await download).saveAs(file);};
  await page.goto(base+'/?project=field-guide');await ready();await documentReady();
  await page.locator('#document-content h1').first().scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/field-guide-student-guide-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.locator('#document-content img').nth(2).scrollIntoViewIfNeeded();
  for(const img of await page.locator('#document-content img').all())assert.ok(await img.evaluate(e=>e.getBoundingClientRect().width<=e.parentElement.getBoundingClientRect().width));
  await page.screenshot({path:'/tmp/field-guide-student-guide-mobile.png'});await page.setViewportSize({width:1200,height:950});
  const zip=path.join(temp,'project.zip');await save(page,zip);
  const check=JSON.parse(cp.execFileSync('python3',['-c',`import json,sys,zipfile,pathlib
with zipfile.ZipFile(sys.argv[1]) as z:
 m=json.loads(z.read('manifest.json')); assets=m['files'][0]['assets']
 assert len(assets)==6
 for p in assets: assert z.read(p)==(pathlib.Path(sys.argv[2])/'static-app/projects/field-guide'/p).read_bytes()
 print(json.dumps(assets))`,zip,root],{encoding:'utf8'}));assert.equal(check.length,6);
  // Missing dependencies fail resolution before a local project can be opened.
  const missing=await page.evaluate(async()=>{
    const {readManifest}=await import('./projects.js');const catalog=await (await fetch('templates/catalog.json')).json();
    for(const assets of ['bad',['../escape.png'],Array(41).fill('x.png')]){let rejected=false;try{readManifest({version:1,name:'Bad assets',files:[{title:'Guide',type:'markdown',path:'README.md',assets}]},new URL('./',location.href),catalog);}catch{rejected=true;}if(!rejected)return false;}
    const {resolveLocalProject}=await import('./local-projects.js');try{await resolveLocalProject([{path:'manifest.json',file:new File([JSON.stringify({version:1,name:'Missing image',files:[{type:'markdown',title:'Guide',path:'README.md',assets:['missing.png']}]})],'manifest.json')},{path:'README.md',file:new File(['Guide'],'README.md')}],catalog);}catch(e){return e.message.includes('Missing project file: missing.png');}return false;
  });assert.equal(missing,true);
  await page.locator('#open-json').setInputFiles(zip);await page.waitForURL('**/?local=*');await ready();await documentReady();
  for(const img of await page.locator('#document-content img').all())assert.match(await img.getAttribute('src'),/^blob:/);
  assert.equal(await page.evaluate(()=>{const id=new URLSearchParams(location.search).get('local'),s=JSON.parse(localStorage.getItem('classroom-cards.static-first.v2:project:local-'+id));return Object.keys(s.assets).some(n=>n.startsWith('guide-images/'));}),false,'guide screenshots do not enter the artwork library');
  await save(page,path.join(temp,'reopened.zip'));
  // Raw HTML and active image URLs remain inert in the Markdown renderer.
  assert.equal(await page.evaluate(async()=>{const {renderMarkdown}=await import('./markdown.js'),host=document.createElement('div');renderMarkdown('![No](javascript:alert(1))\n![No](data:text/html,bad)\n<img src=x onerror=alert(1)>',host,location.href);return host.querySelectorAll('img,script').length;}),0);
  const offline=await browser.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.goto(base+'/?project=field-guide');await ready(offline);await offline.evaluate(()=>navigator.serviceWorker.ready);await offline.reload();await ready(offline);await offline.waitForFunction(()=>!!navigator.serviceWorker.controller);await offline.context().setOffline(true);await documentReady(offline);await save(offline,path.join(temp,'offline.zip'));
  assert.deepEqual(errors,[]);console.log('PASS: prominent save warnings, real screenshots, responsive images, safe Markdown rendering, declared-asset validation, exact ZIP image preservation, local blob resolution, clean artwork library and first-visit offline guide/export.');
 }finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
