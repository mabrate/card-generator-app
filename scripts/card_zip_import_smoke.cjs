// NODE_PATH=/path/to/node_modules node scripts/card_zip_import_smoke.cjs
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-zip-import-'));
(async()=>{
 let browser;const server=cp.spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',path.join(root,'static-app')]);
 try{
  const port=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=String(d).match(/port (\d+)/);if(m)resolve(m[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
  const base='http://127.0.0.1:'+port;browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1200,height:1000}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  const ready=async(p=page)=>{await p.waitForFunction(()=>document.querySelector('main')?.getAttribute('aria-busy')==='false');await expect(p.locator('#page-error')).toBeEmpty();await expect(p.locator('#import-cards')).toBeEnabled();};
  const close=()=>page.locator('#import-cards-dialog form button').click();
  const review=async(files,input='card-zip-files')=>{if(!await page.locator('#import-cards-dialog').isVisible())await page.locator('#import-cards').click();await page.locator('#'+input).setInputFiles(files);await expect(page.locator('#confirm-card-import')).toBeEnabled();};
  const confirm=async(text)=>{await page.locator('#confirm-card-import').click();await expect(page.locator('#card-import-result')).toContainText(text);};
  const inspect=async()=>{await expect(page.locator('#import-cards')).toBeEnabled();return page.evaluate(()=>{const root=document.querySelector('#card-preview svg');return {image:root.querySelector('image[data-card-artwork]')?.getAttribute('href'),geometry:[...root.querySelector('image[data-card-artwork]')?.attributes || []].filter(a=>['x','y','width','height'].includes(a.name)).map(a=>[a.name,a.value]),fields:Object.fromEntries([...root.querySelectorAll('text[data-field]')].map(e=>[e.getAttribute('data-field'),e.textContent]))};});};
  const exportPair=async(file)=>{await page.locator('#download-svg').click();await page.locator('#single-card-both').check();const d=page.waitForEvent('download');await page.locator('#download-single-card').click();await(await d).saveAs(file);await page.locator('#single-card-export-dialog form button').click();};
  await page.goto(base+'/?project=field-guide');await ready();
  const originals=[];
  for(const index of [0,1]){
   await page.locator('#preview-card-select').selectOption(String(index));await page.locator('#preview-back').click();
   for(const [key,value] of Object.entries({x:.25,y:.7,zoom:1.5}))await page.locator('#crop-'+key).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
   originals.push(await inspect());await exportPair(path.join(temp,'modern-'+index+'.zip'));
  }
  // Reproduce the original download format, including nested, deflated ZIPs
  // and identical filenames in separate students' archives.
  cp.execFileSync('python3',['-c',`import sys,zipfile,json,xml.etree.ElementTree as E,pathlib
p=pathlib.Path(sys.argv[1]);n={'s':'http://www.w3.org/2000/svg'}
for i in range(2):
 with zipfile.ZipFile(p/f'modern-{i}.zip') as z, zipfile.ZipFile(p/f'legacy-{i}.zip','w',zipfile.ZIP_DEFLATED) as out:
  for name in z.namelist():
   r=E.fromstring(z.read(name))
   for node in r.findall('s:style',n):r.remove(node)
   for node in r.findall('s:metadata',n):
    data=json.loads(node.text)
    for k in ['backLayout','backColors','backImageName','backCrop']:data['card'].pop(k,None)
    data['assets'].pop('backImage',None);node.text=json.dumps(data)
   side='back' if name.endswith('-back.svg') else 'front'
   text=E.tostring(r,encoding='unicode');out.writestr('student/card-'+side+'.svg',text)
   folder=p/f'folder/student-{i}';folder.mkdir(parents=True,exist_ok=True);(folder/('card-'+side+'.svg')).write_text(text)
` ,temp]);
  console.log('Export fixtures ready');await page.goto(base+'/');await ready();
  const zips=[0,1].map(i=>path.join(temp,'legacy-'+i+'.zip'));
  await review(zips);await expect(page.locator('.card-import-row')).toHaveCount(2);await expect(page.locator('.card-import-row.invalid')).toHaveCount(0);await expect(page.locator('.import-thumbnail')).toHaveCount(4);
  await confirm('2 added');await page.locator('#undo-card-import').click();await expect(page.locator('#card-import-result')).toContainText('undone');await expect(page.locator('#preview-card-select option')).toHaveCount(1);await review(zips);await confirm('2 added');await close();
  for(const index of [0,1]){
   await page.locator('#preview-card-select').selectOption(String(index+1));await page.locator('#preview-back').click();assert.deepEqual(await inspect(),originals[index]);
   await page.locator('#preview-front').click();assert.notEqual((await inspect()).image,originals[index].image);
  }
  await page.locator('#preview-back').click();await page.screenshot({path:'/tmp/card-zip-import-back.png'});
  await page.reload();await ready();await page.locator('#preview-back').click();assert.deepEqual(await inspect(),originals[1]);
  const popup=page.waitForEvent('popup');await page.locator('#print-card').click();const sheet=await popup;await expect(sheet.locator('#print')).toBeEnabled();assert.equal(await sheet.locator('.backs image[data-card-artwork]').getAttribute('href'),originals[1].image);await sheet.close();
  console.log('Legacy import, recovery and printing passed');const saved=page.waitForEvent('download');await page.locator('#save-project').click();const backup=path.join(temp,'project.zip');await(await saved).saveAs(backup);
  await page.locator('#open-project').click();await page.locator('#open-json').setInputFiles(backup);await ready();await expect(page.locator('#preview-card-select option')).toHaveCount(3);await page.locator('#preview-card-select').selectOption('2');await page.locator('#preview-back').click();assert.deepEqual(await inspect(),originals[1]);
  // Re-export and read the data without relying on the source project or its back.
  const roundtrip=path.join(temp,'roundtrip.zip');await exportPair(roundtrip);
  await review(zips);await expect(page.locator('.card-import-row select')).toHaveCount(2);await expect(page.locator('.card-import-row').first()).toContainText('Already present');await confirm('2 skipped');await close();
  // Folder import pairs within each student's subfolder.
  await page.goto(base+'/');await ready();await review(path.join(temp,'folder'),'card-svg-folder');await expect(page.locator('.card-import-row')).toHaveCount(2);await expect(page.locator('.card-import-row.invalid')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#import-cards-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth),true);await page.screenshot({path:'/tmp/card-zip-import-mobile.png'});await page.setViewportSize({width:1200,height:1000});await close();
  // Back-only and damaged archives are individual errors; valid cards still import.
  const entries=await page.evaluate(async bytes=>{const {unzip}=await import('./local-projects.js');return Promise.all((await unzip(new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'card.zip'))).map(async e=>({name:e.path,text:await e.file.text()})));},fs.readFileSync(zips[0]).toString('base64'));
  const back=entries.find(e=>e.name.endsWith('-back.svg'));fs.writeFileSync(path.join(temp,'orphan-back.svg'),back.text);fs.writeFileSync(path.join(temp,'damaged.zip'),'broken');
  await review([zips[1],path.join(temp,'orphan-back.svg'),path.join(temp,'damaged.zip')],'card-svg-files');await expect(page.locator('.card-import-row')).toHaveCount(3);await expect(page.locator('.card-import-row.invalid')).toHaveCount(2);await expect(page.locator('#card-import-review')).toContainText('matching -front.svg');await close();
  // Modern metadata restores both sides from the front and keeps duplicate defaults.
  const isolated=await browser.newPage({serviceWorkers:'block'});await isolated.goto(base+'/');await ready(isolated);await isolated.evaluate(()=>localStorage.removeItem('classroom-cards.static-first.v2'));await isolated.reload();await ready(isolated);
  await isolated.locator('#import-cards').click();await isolated.locator('#card-zip-files').setInputFiles(path.join(temp,'modern-1.zip'));await expect(isolated.locator('.card-import-row.invalid')).toHaveCount(0);await expect(isolated.locator('.card-import-row select')).toHaveCount(1);await isolated.locator('#confirm-card-import').click();await expect(isolated.locator('#card-import-result')).toContainText('1 added');await isolated.locator('#import-cards-dialog form button').click();await isolated.locator('#preview-card-select').selectOption('1');await isolated.locator('#preview-back').click();assert.equal(await isolated.locator('#card-preview image[data-card-artwork]').getAttribute('href'),originals[1].image);
  await isolated.close();
  console.log('Project round trip, modern imports and error review passed');
  // Forty two-sided ZIPs count as forty imports; small assets keep this a parser/load check.
  const batch=await page.evaluate(async source=>{
   const {unzip,zipFiles}=await import('./local-projects.js');const {cardImportEntries}=await import('./card-import.js');const {validateCard}=await import('./card-transfer.js');const data=Uint8Array.from(atob(source),c=>c.charCodeAt(0)),original=await unzip(new File([data],'pair.zip'));
   const front=original.find(e=>e.path.endsWith('-front.svg'));const doc=new DOMParser().parseFromString(await front.file.text(),'image/svg+xml');const node=doc.querySelector('metadata[data-card-format]'),payload=JSON.parse(node.textContent);doc.querySelectorAll('style').forEach(n=>n.remove());const files=[],canvas=document.createElement('canvas');canvas.width=canvas.height=1;const tiny=canvas.toDataURL('image/png');for(const key of Object.keys(payload.assets))if(payload.assets[key])payload.assets[key]=tiny;const backFile=new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'],'card-back.svg');
   // Remove displayed artwork too: editable metadata is authoritative for modern downloads.
   doc.querySelectorAll('image').forEach(n=>n.setAttribute('href',tiny));
   const legacy=structuredClone(payload);for(const k of ['backLayout','backColors','backImageName','backCrop'])delete legacy.card[k];delete legacy.assets.backImage;
   const legacyFront=new File([`<svg xmlns="http://www.w3.org/2000/svg"><metadata data-card-format="classroom-cards.card">${JSON.stringify(legacy).replaceAll('&','&amp;').replaceAll('<','&lt;')}</metadata></svg>`],'card-front.svg');
   const common=new File([`<svg xmlns="http://www.w3.org/2000/svg" data-card-app="finished-card"><image href="${tiny}"/></svg>`],'000-common-back.svg');
   const sharedEntries=await cardImportEntries([new File([await zipFiles([{path:'nested/card-front.svg',file:legacyFront},{path:'nested/000-common-back.svg',file:common}])],'shared.zip')]);const shared=await sharedEntries[0].load();
   const blankDoc=new DOMParser().parseFromString(await original.find(e=>e.path.endsWith('-back.svg')).file.text(),'image/svg+xml');blankDoc.querySelector('image[data-card-artwork]').parentElement.parentElement.remove();blankDoc.querySelectorAll('style').forEach(n=>n.remove());
   const blankEntries=await cardImportEntries([legacyFront,new File([new XMLSerializer().serializeToString(blankDoc)],'card-back.svg')]);const blank=await blankEntries[0].load();
   const bad=structuredClone(payload);bad.card.backCrop.zoom=20;let rejected=false;try{await validateCard(bad);}catch{rejected=true;}
   const hostile=structuredClone(payload);hostile.card.backLayout=hostile.card.backLayout.replace('<svg ','<svg onload="window.bad=1" ').replace('</svg>','<script>window.bad=1</script></svg>');const clean=await validateCard(hostile);
   for(let i=0;i<40;i++){payload.card.id='batch-'+i;node.textContent=JSON.stringify(payload);const text=new XMLSerializer().serializeToString(doc);files.push(new File([await zipFiles([{path:'card-front.svg',file:new File([text],'front.svg')},{path:'card-back.svg',file:backFile}])],'student-'+i+'.zip'));}
   const entries=await cardImportEntries(files);return {count:entries.length,valid:(await Promise.all(entries.map(e=>e.load()))).every(p=>!!p.assets.backImage),shared:sharedEntries.length===1&&shared.assets.backImage===tiny,blank:blank.assets.backImage===null&&blank.card.backImageName==='',rejected,sanitized:!clean.card.backLayout.includes('<script')&&!clean.card.backLayout.includes('onload=')};
  },fs.readFileSync(path.join(temp,'modern-0.zip')).toString('base64'));assert.deepEqual(batch,{count:40,valid:true,shared:true,blank:true,rejected:true,sanitized:true});
  assert.deepEqual(errors,[]);console.log('PASS: bulk legacy/modern ZIPs, deflate/nested folders, filename isolation, paired SVGs, distinct back artwork and crop, two-side review, duplicate skips, errors, 40-card batch, recovery, printing, project ZIP reopen and re-export.');
 }finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(err=>{console.error(err);process.exitCode=1;});
