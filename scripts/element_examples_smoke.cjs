// Optional development check: run with Playwright installed and Google Chrome available.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'..'),pack=root+'/static-app/projects/element-explorer';
const manifest=JSON.parse(fs.readFileSync(pack+'/manifest.json'));
const rows=JSON.parse(cp.execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1])))))',pack+'/cards.csv'],{encoding:'utf8'}));
const colors=Object.fromEntries(manifest.colorRules.map(r=>[r.equals.toLowerCase(),r.colors.family_strip]));
assert.deepEqual(rows.map(r=>r.atomic_number),['1','70']);assert.equal(new Set(rows.map(r=>r.card_id)).size,2);
const workspace=JSON.parse(fs.readFileSync(pack+'/workspace.json'));
for(const row of rows){assert.match(row.image_filename,/\.jpg$/);assert.ok(workspace.cards[row.card_id].attribution);}
for(const row of rows)assert.ok(fs.existsSync(pack+'/graphics/'+row.image_filename));
(async()=>{
 let browser;const server=cp.spawn('python3',['-u',root+'/run.py','--port','0']);
 server.stderr.on('data',()=>{});
 try{
  const port=await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{const m=String(b).match(/127\.0\.0\.1:(\d+)/);if(m)resolve(m[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
  const origin='http://127.0.0.1:'+port;
  browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1300,height:1000},serviceWorkers:'block'}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const ready=async(p=page)=>{await p.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await expect(p.locator('#save-project')).toBeEnabled();};
  const strip=(p=page)=>p.locator('#card-preview rect[data-color-fill=family_strip]');
  const field=(key,p=page)=>p.locator('#fields [data-field='+key+']');
  const image=()=>page.locator('#card-preview image[data-card-artwork]');
  const download=async(p,button,file)=>{const event=p.waitForEvent('download');await p.locator(button).click();await (await event).saveAs(file);};
  await page.goto(origin+'/?project=element-explorer');await ready();
  await expect(page.locator('#preview-card-select option')).toHaveCount(2);
  await expect(page.locator('#build-template')).toBeDisabled();await expect(page.locator('#build-template')).toHaveAttribute('title','This project uses a fixed template.');
  await expect(page.locator('#fields [data-field]')).toHaveCount(10);
  for(let i=0;i<2;i++){
   await page.locator('#preview-card-select').selectOption(String(i));await ready();
   await expect(strip()).toHaveAttribute('fill',colors[rows[i].family.toLowerCase()]);
   await expect(page.locator('#fit-issues')).toBeEmpty();await expect(image()).toHaveCount(1);
   for(const key of ['atomic_number','symbol','element_name','atomic_mass','family','group','period','state','everyday_use','fun_fact'])await expect(field(key)).toHaveValue(rows[i][key]);
   assert.deepEqual(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('classroom-cards.static-first.v2:project:element-explorer'));return s.cards[s.active].crop;}),workspace.cards[rows[i].card_id].crop);
   await expect(page.locator('#card-preview #background')).toHaveAttribute('fill','#ffffff');
   await expect(page.locator('#card-preview #border')).toHaveAttribute('stroke','#555555');
   await expect(page.locator('#card-preview [data-field=element_name]')).toHaveAttribute('fill','#222222');
   const data=await image().getAttribute('href');assert.match(data,/^data:image\/(png|jpeg);base64,/);
   await page.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();},data);
   await page.locator('#card-preview').screenshot({path:'/tmp/element-example-'+rows[i].atomic_number+'.png'});
  }
  await page.locator('#card-preview').screenshot({path:'/tmp/element-explorer-ytterbium-review.png'});
  console.log('PASS: both examples, 10 fields each, decoded artwork, no fit errors, fixed-layout restriction, Ink body and automatic family colors.');
  await page.locator('#preview-card-select').selectOption('0');await ready();
  await field('family').fill('  NOBLE GAS  ');await expect(strip()).toHaveAttribute('fill','#70448c');
  for(const value of ['unknown','']){await field('family').fill(value);await expect(strip()).toHaveAttribute('fill','#555555');}
  await field('family').fill('Noble gas');await page.locator('#appearance-tools').evaluate(el=>el.open=true);
  await page.locator('[data-scheme=Ink]').click();await expect(strip()).toHaveAttribute('fill','#555555');
  await field('family').fill('Halogen');await expect(strip()).toHaveAttribute('fill','#555555');
  await page.locator('#use-automatic-colors').click();await expect(strip()).toHaveAttribute('fill','#a23860');
  await page.reload();await ready();await expect(strip()).toHaveAttribute('fill','#a23860');
  const popup=page.waitForEvent('popup');await page.locator('#print-sheets').click();const sheet=await popup;await expect(sheet.locator('#print')).toBeEnabled({timeout:30000});
  assert.equal(await sheet.locator('rect[data-color-fill=family_strip]').count(),2);assert.equal(await sheet.locator('.sheet').count(),1);
  await expect(sheet.locator('rect[data-color-fill=family_strip]').first()).toHaveAttribute('fill','#a23860');await sheet.screenshot({path:'/tmp/element-explorer-print-review.png',fullPage:true});await sheet.close();
  await download(page,'#download-svg','/tmp/element-explorer-review.svg');const svg=fs.readFileSync('/tmp/element-explorer-review.svg','utf8');assert.ok(svg.includes('#a23860')&&svg.includes('finished-card')&&/data:image\/(png|jpeg);base64,/.test(svg));
  const shared=await page.evaluate(async svg=>{const {parseCard}=await import('./card-transfer.js');return (await parseCard(new File([svg],'student.svg'))).card;},svg);
  assert.deepEqual(shared.crop,workspace.cards[rows[0].card_id].crop);assert.equal(shared.attribution,workspace.cards[rows[0].card_id].attribution);
  await download(page,'#save-project','/tmp/element-explorer-review.zip');
  const zipCheck=cp.execFileSync('python3',['-c',`import sys,zipfile,json,csv,io
with zipfile.ZipFile(sys.argv[1]) as z:
 m=json.loads(z.read('manifest.json')); original=json.load(open(sys.argv[2])); assert m['colorRules']==original['colorRules']
 rows=list(csv.DictReader(io.StringIO(z.read('cards.csv').decode('utf-8-sig')))); assert len(rows)==2 and all(r['theme']=='' for r in rows)
 w=json.loads(z.read('workspace.json')); assert all('colors' not in c for c in w['cards'].values())
 source=json.load(open(sys.argv[3])); assert all(w['cards'][key]['crop']==settings['crop'] and w['cards'][key]['attribution']==settings['attribution'] for key,settings in source['cards'].items())
print('PASS: project ZIP carries two examples and automatic rules without freezing manual colors.')`,'/tmp/element-explorer-review.zip',pack+'/manifest.json',pack+'/workspace.json'],{encoding:'utf8'});console.log(zipCheck.trim());
  const fresh=await browser.newPage({serviceWorkers:'block'});fresh.on('pageerror',e=>errors.push(e.message));await fresh.goto(origin);await ready(fresh);
  await fresh.locator('#open-json').setInputFiles('/tmp/element-explorer-review.zip');await fresh.waitForURL('**/?local=*');await ready(fresh);await expect(fresh.locator('.intro h1')).toHaveText('Element Explorer');await expect(strip(fresh)).toHaveAttribute('fill','#a23860');
  await field('family',fresh).fill('Alkali metal');await expect(strip(fresh)).toHaveAttribute('fill','#a84b16');
  await fresh.locator('#appearance-tools').evaluate(el=>el.open=true);await fresh.locator('[data-scheme=Ink]').click();await download(fresh,'#save-project','/tmp/element-explorer-manual-review.zip');
  const old=fresh.url();await fresh.locator('#open-json').setInputFiles('/tmp/element-explorer-manual-review.zip');await fresh.waitForURL(url=>String(url)!==old);await ready(fresh);await expect(strip(fresh)).toHaveAttribute('fill','#555555');await expect(field('family',fresh)).toHaveValue('Alkali metal');
  await fresh.locator('#appearance-tools').evaluate(el=>el.open=true);await fresh.locator('#use-automatic-colors').click();await expect(strip(fresh)).toHaveAttribute('fill','#a84b16');await fresh.close();
  console.log('PASS: automatic/manual colors, reset, browser recovery, two-card print on one sheet, SVG and ZIP save/reopen.');
  // Recent image replacement and straightening changes with this single-sided project.
  const original=await image().getAttribute('href');await page.locator('#duplicate-card').click();await ready();await expect(page.locator('#preview-card-select option')).toHaveCount(3);
  const replacement=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=90;const ctx=c.getContext('2d');ctx.fillStyle='#cc2244';ctx.fillRect(0,0,80,90);return c.toDataURL('image/png');});
  await page.locator('#image-files').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:Buffer.from(replacement.split(',')[1],'base64')});await ready();await expect(image()).toHaveAttribute('href',replacement);
  await page.locator('#straighten-photo').click();await expect(page.locator('#photo-straightener')).toBeVisible();await page.locator('#photo-ratio').selectOption('1');await page.locator('#photo-apply').click();await expect(page.locator('#photo-straightener')).toHaveCount(0);assert.notEqual(await image().getAttribute('href'),replacement);
  await page.locator('#undo-straighten').click();await ready();await expect(image()).toHaveAttribute('href',replacement);
  await page.locator('#preview-card-select').selectOption('0');await ready();await expect(image()).toHaveAttribute('href',original);
  await page.locator('#preview-card-select').selectOption('2');await ready();page.once('dialog',d=>d.accept());await page.locator('#delete-card').click();await ready();await expect(page.locator('#preview-card-select option')).toHaveCount(2);
  await page.locator('#new-card').click();await ready();await field('atomic_number').fill('26');await field('symbol').fill('Fe');await field('element_name').fill('Iron');await field('family').fill('Transition Metal');await expect(strip()).toHaveAttribute('fill','#80513b');await expect(page.locator('#fit-issues')).toBeEmpty();
  page.once('dialog',d=>d.accept());await page.locator('#delete-card').click();await ready();
  console.log('PASS: duplicate/new/delete cards, image replacement isolation, photo straighten and undo.');
  const mobile=await browser.newPage({hasTouch:true,isMobile:true,viewport:{width:390,height:844},serviceWorkers:'block'});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(origin+'/?project=element-explorer');await ready(mobile);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await mobile.locator('#next-card').tap();await ready(mobile);await expect(field('element_name',mobile)).toHaveValue('Ytterbium');await mobile.locator('#card-preview').screenshot({path:'/tmp/element-explorer-mobile-review.png'});await mobile.close();
  const offline=await browser.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.goto(origin+'/?project=element-explorer');await ready(offline);await offline.evaluate(()=>navigator.serviceWorker.ready);await offline.reload();await ready(offline);await offline.waitForFunction(()=>!!navigator.serviceWorker.controller);await offline.context().setOffline(true);await offline.reload();await ready(offline);
  await expect(offline.locator('#preview-card-select option')).toHaveCount(2);await field('family',offline).fill('Noble Gas');await expect(strip(offline)).toHaveAttribute('fill','#70448c');await expect(offline.locator('#fit-issues')).toBeEmpty();await expect(offline.locator('#card-preview image')).toHaveCount(1);await download(offline,'#save-project','/tmp/element-explorer-offline-review.zip');
  page.once('dialog',d=>d.accept());await page.locator('#start-over').click();await ready();await expect(page.locator('#preview-card-select option')).toHaveCount(2);await expect(field('element_name')).toHaveValue('Hydrogen');await expect(strip()).toHaveAttribute('fill','#326c48');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('classroom-cards.static-first.v2:project:element-explorer')).cards[0].crop),workspace.cards[rows[0].card_id].crop);
  assert.deepEqual(errors,[]);console.log('PASS: starter restoration, photo crop/credit transfer, touch navigation, narrow-screen layout, offline reload/edit/save, no browser errors.');
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
