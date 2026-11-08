// Optional development check: Node.js with the Playwright npm package installed.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-bulk-svg-'));
function python(code,args=[]){const result=cp.spawnSync('python3',['-c',code,...args],{encoding:'utf8',maxBuffer:128*1024*1024});assert.equal(result.status,0,result.stderr || result.error?.message);return result.stdout;}
function inspect(file){return JSON.parse(python(`import json,sys,zipfile,xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as z:
 result=[]
 for name in z.namelist():
  s=z.read(name).decode();r=E.fromstring(s);n={'s':'http://www.w3.org/2000/svg'}
  result.append({'name':name,'title':r.find('s:title',n).text,'width':r.get('width'),'height':r.get('height'),'text':' '.join(' '.join(e.itertext()) for e in r.findall('.//s:text',n)),'fonts':bool(r.find('s:style',n) is not None and 'data:font/ttf;base64,' in r.find('s:style',n).text),'images':[i.get('href') for i in r.findall('.//s:image',n)],'imageWidths':[float(i.get('width')) for i in r.findall('.//s:image',n)],'frameWidth':next((float(e.get('width')) for e in r.findall('.//s:rect',n) if e.get('data-image')),None),'fields':{e.get('data-field'):' '.join(e.itertext()) for e in r.findall('.//s:text',n)},'colors':{e.get('data-color-fill'):e.get('fill') for e in r.findall('.//*[@data-color-fill]',n)}})
 print(json.dumps(result))`,[file]));}
(async()=>{
 let browser;
 const server=cp.spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',path.join(root,'static-app')]);
 try{
  const port=await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{const m=String(data).match(/port (\d+)/);if(m)resolve(m[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
  const origin='http://127.0.0.1:'+port;
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1280,height:1000}}),errors=[];page.setDefaultTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));
  const ready=async(p=page)=>{await p.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await expect(p.locator('#download-set')).toBeEnabled();};
  const state=()=>page.evaluate(()=>localStorage.getItem('classroom-cards.static-first.v2:project:field-guide'));
  async function choose(mode,p=page){if(!await p.locator('#card-export-dialog').isVisible())await p.locator('#download-set').click();await p.locator('#export-'+mode).check();}
  async function save(mode,name,p=page){await choose(mode,p);const d=p.waitForEvent('download');await p.locator('#download-set-zip').click();const target=path.join(temp,name);await (await d).saveAs(target);await expect(p.locator('#card-export-status')).toContainText('Downloaded');return target;}
  const close=()=>page.locator('#card-export-dialog form button').click();
  await page.goto(origin+'/?project=field-guide');await ready();
  // Include current unsaved-to-disk text, manual colors, a custom layout, drawing, and separate crop.
  await page.evaluate(()=>{const key='classroom-cards.static-first.v2:project:field-guide',s=JSON.parse(localStorage.getItem(key));s.cards[0].values.common_name='Ladybug study';s.cards[0].colors={...s.colors,text:'#123456'};s.cards[0].crop={x:.2,y:.8,zoom:1.25};s.cards[1].layout=s.templateSVG.replace('The Village School Field Guide','CUSTOM LAYOUT');s.cards[1].drawingKey=s.assets[s.cards[1].imageName];s.cards[1].drawingActive=true;s.cards[2].backCrop={x:.3,y:.6,zoom:.75};s.cards[0].copies=3;localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();await ready();await page.locator('#preview-back').click();await ready();
  const before=await state();
  const fronts=inspect(await save('fronts','fronts.zip'));assert.equal(fronts.length,4);assert.equal(fronts[0].name,'001-ladybug-study-front.svg');assert.equal(fronts[0].fields.common_name,'Ladybug study');assert.equal(fronts[0].colors.text,'#123456');assert.match(fronts[1].text,/CUSTOM LAYOUT/);assert.equal(await state(),before);await expect(page.locator('#preview-back')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#export-common')).toBeDisabled();await expect(page.locator('#export-pairs')).toBeEnabled();
  const pairedFile=await save('pairs','pairs.zip'),pairs=inspect(pairedFile);assert.equal(pairs.length,8);assert.deepEqual(pairs.slice(0,4).map(e=>e.name),['001-ladybug-study-front.svg','001-ladybug-study-back.svg','002-green-anole-front.svg','002-green-anole-back.svg']);
  for(const e of pairs){assert.equal(e.width,'2.5in');assert.equal(e.height,'3.5in');assert.equal(e.fonts,true);assert.equal(e.images.length,1);assert.match(e.images[0],/^data:image\/(png|jpeg|webp);base64,/);assert.match(e.title,/— (Front|Back)$/);}
  assert.notEqual(pairs[0].images[0],pairs[1].images[0]);assert.equal(await state(),before);
  assert.ok(Math.abs(pairs[0].imageWidths[0]-pairs[0].frameWidth*1.25)<.001);assert.ok(Math.abs(pairs[5].imageWidths[0]-pairs[5].frameWidth*.75)<.001);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#card-export-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth),true);await page.screenshot({path:path.join(os.tmpdir(),'card-bulk-svg-mobile.png')});await page.setViewportSize({width:1280,height:1000});await close();
  // Open an exported SVG as an ordinary image, without the app or network assets.
  const extracted=path.join(temp,'example.svg');python("import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:open(sys.argv[2],'wb').write(z.read(z.namelist()[0]))",[pairedFile,extracted]);
  const standalone=await browser.newPage();await standalone.route(/^https?:/,r=>r.abort());await standalone.goto('file://'+extracted);await standalone.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('image')].map(async e=>{const i=new Image();i.src=e.getAttribute('href');await i.decode();}));});await expect(standalone.locator('[data-field=common_name]')).toContainText('Ladybug study');await standalone.goto('about:blank');await standalone.setContent('<img style="width:5in" src="data:image/svg+xml;base64,'+fs.readFileSync(extracted).toString('base64')+'">');await standalone.locator('img').evaluate(e=>e.decode());await standalone.screenshot({path:path.join(os.tmpdir(),'card-bulk-svg-standalone.png')});
  // A back error leaves front-only export available and prevents a partial paired download.
  await page.evaluate(()=>{const key='classroom-cards.static-first.v2:project:field-guide',s=JSON.parse(localStorage.getItem(key));s.cards[3].backImageName='missing-reference.png';localStorage.setItem(key,JSON.stringify(s));});await page.reload();await ready();assert.equal(inspect(await save('fronts','fronts-with-missing-back.zip')).length,4);
  let downloads=0;const downloaded=()=>downloads++;page.on('download',downloaded);await choose('pairs');await page.locator('#download-set-zip').click();await expect(page.locator('#card-export-status')).toContainText('Card 4');await expect(page.locator('#card-export-status')).toContainText('back');await expect(page.locator('#download-set-zip')).toBeEnabled();assert.equal(downloads,0);page.off('download',downloaded);await close();
  await page.evaluate(saved=>localStorage.setItem('classroom-cards.static-first.v2:project:field-guide',saved),before);await page.reload();await ready();
  // Existing project ZIPs still reopen after factoring out the general ZIP writer.
  const savedProject=page.waitForEvent('download');await page.locator('#save-project').click();const projectZIP=path.join(temp,'project.zip');await (await savedProject).saveAs(projectZIP);await page.locator('#open-json').setInputFiles(projectZIP);await page.waitForURL('**/?local=*');await ready();assert.equal(inspect(await save('pairs','reopened-pairs.zip')).length,8);await close();
  // A small project with a shared back and duplicate names exercises both common-back modes.
  const fixture=path.join(temp,'common-project.zip');python(`from pathlib import Path
import json,sys,zipfile
r=Path(sys.argv[1])/'static-app';m={'version':1,'name':'Common backs','templates':[{'id':'front','title':'Front','svg':'front.svg'}],'colorSchemes':['Template'],'starter':{'template':'front'},'csv':'cards.csv','cardBack':{'image':'back.png'}}
with zipfile.ZipFile(sys.argv[2],'w') as z:
 z.writestr('manifest.json',json.dumps(m));z.writestr('front.svg',(r/'projects/field-guide/templates/field-guide-front.svg').read_bytes());z.writestr('back.png',(r/'projects/field-guide/graphics/ladybug-reference.png').read_bytes());z.writestr('cards.csv','card_id,common_name,scientific_name,copies\\na,Same name,Testus example,3\\nb,Same name,Testus example,2\\n')`,[root,fixture]);
  await page.locator('#open-json').setInputFiles(fixture);await expect(page.locator('.intro h1')).toHaveText('Common backs');await ready();
  const common=inspect(await save('common','common.zip'));assert.deepEqual(common.map(e=>e.name),['001-same-name-front.svg','002-same-name-front.svg','000-common-back.svg']);assert.match(common[2].images[0],/^data:image\/png;base64,/);
  const repeated=inspect(await save('pairs','repeated.zip'));assert.equal(repeated.length,4);assert.equal(repeated[1].images[0],repeated[3].images[0]);assert.equal(repeated[1].title,'1 — Same name — Back');
  await close();await page.locator('#remove-card-back').click();await page.locator('#download-set').click();await expect(page.locator('#export-pairs')).toBeDisabled();await expect(page.locator('#export-common')).toBeDisabled();await expect(page.locator('#export-fronts')).toBeChecked();assert.equal(inspect(await save('fronts','no-back.zip')).length,2);await expect(page.locator('#export-pairs')).toBeDisabled();await close();
  // Automatic project colors agree with the preview.
  await page.goto(origin+'/?project=element-explorer');await ready();const previewColor=await page.locator('#card-preview [data-color-fill]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.getAttribute('data-color-fill'),n.getAttribute('fill')])));const elements=inspect(await save('fronts','elements.zip'));assert.equal(elements.length,2);assert.deepEqual(elements[0].colors,previewColor);
  // Worker precaching includes the new module and supports exporting while offline.
  const offline=await browser.newPage();await offline.goto(origin+'/?project=field-guide');await ready(offline);await offline.evaluate(async()=>{await navigator.serviceWorker.ready;});await offline.reload();await offline.waitForFunction(()=>!!navigator.serviceWorker.controller);await ready(offline);await offline.context().setOffline(true);assert.equal(inspect(await save('pairs','offline.zip',offline)).length,8);
  assert.deepEqual(errors,[]);console.log('PASS: all three bulk SVG modes, numbered filenames, embedded fonts/artwork, custom layouts/colors/drawings/crops, automatic colors, copy counts, unchanged workspace, missing-back failure, standalone SVGs, project ZIP reopen, shared backs, no-back controls, mobile width, and offline export.');
 }finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(err=>{console.error(err);process.exitCode=1;});
