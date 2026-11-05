// Run with Node.js and Playwright available (the same setup as bulk_svg_smoke.cjs).
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-template-builder-'));
const fixture=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 252" data-title="Builder test" font-family="Liberation Sans, sans-serif"><rect width="180" height="252" fill="#fff"/><text x="12" y="24" font-size="12" font-weight="bold" data-field="common_name" data-label="Common name" data-width="150" data-lines="2" data-max-chars="200">{{common_name}}</text><text x="12" y="42" font-size="7" font-style="italic" data-field="scientific_name" data-label="Scientific name" data-width="150" data-lines="2" data-max-chars="200">{{scientific_name}}</text><text x="12" y="52" font-size="7" data-field="family" data-label="Family" data-width="150" data-lines="1" data-max-chars="200">{{family}}</text><text x="12" y="62" font-size="7" data-field="category" data-label="Category" data-width="150" data-lines="2" data-max-chars="200">{{category}}</text><rect x="12" y="85" width="156" height="150" fill="#edf3ed" data-image="artwork"/></svg>`;
(async()=>{
  let browser;
  const server=cp.spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',path.join(root,'static-app')]);
  try{
    const port=await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{const match=String(data).match(/port (\d+)/);if(match)resolve(match[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
    const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1400,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    const ready=()=>page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');
    const set=async(id,value)=>{await page.locator('#tb-prop-'+id).fill(String(value));await page.locator('#tb-prop-'+id).dispatchEvent('change');};
    const layer=async name=>page.locator('#tb-elements button').filter({hasText:new RegExp('^'+name+'$')}).click();
    await page.goto('http://127.0.0.1:'+port+'/?project=field-guide');await ready();
    const initial=await page.evaluate(()=>localStorage.getItem('classroom-cards.static-first.v2:project:field-guide'));
    await page.locator('#build-template').click();await expect(page.locator('#template-builder')).toBeVisible();
    await page.locator('#tb-upload').setInputFiles({name:'builder.svg',mimeType:'image/svg+xml',buffer:Buffer.from(fixture)});
    await expect(page.locator('#tb-name')).toHaveValue('Builder test');
    await layer('Common name');await set('data-line-spacing',1.5);await set('font-size',20);await expect(page.locator('#tb-prop-data-line-spacing')).toHaveValue('1.5');await set('font-size',12);
    await layer('Scientific name');await page.locator('#tb-prop-data-inline-field').selectOption('family');
    await expect(page.locator('#tb-elements button').filter({hasText:/^Family$/})).toHaveCount(0);
    await expect(page.locator('#tb-canvas [data-field=scientific_name]')).toContainText('Coccinellidae');
    assert.equal(await page.locator('#tb-canvas [data-field=scientific_name] tspan[font-style=normal]').count()>0,true);
    await page.locator('#tb-prop-data-flow-after').selectOption('common_name');await set('data-gap',4);
    await layer('Category');await page.locator('#tb-prop-data-flow-after').selectOption('scientific_name');await set('data-gap',3);
    const before=await page.locator('#tb-canvas [data-field=category]').getAttribute('y');
    await layer('Common name');await set('data-width',65);
    const after=await page.locator('#tb-canvas [data-field=category]').getAttribute('y');
    // Test with deliberately long data through the actual shared renderer below as well.
    assert.ok(Number.isFinite(Number(before))&&Number.isFinite(Number(after)));
    await page.locator('#tb-prop-data-fit').selectOption('shrink');await set('data-min-font-size',4);await set('data-width',30);
    assert.ok(await page.locator('#tb-canvas [data-field=common_name]').evaluate(el=>parseFloat(el.style.fontSize))<12);
    // Flow cycles are rejected without losing the valid draft.
    await page.locator('#tb-prop-data-flow-after').selectOption('category');await expect(page.locator('#tb-error')).toContainText('circular');await expect(page.locator('#tb-prop-data-flow-after')).toHaveValue('');
    await page.locator('#tb-prop-fill').fill('#123456');await page.locator('#tb-prop-fill').dispatchEvent('change');
    await expect(page.locator('#tb-canvas [data-field=common_name]')).toHaveAttribute('fill','#123456');
    // Undo/redo, pointer movement, resize, and keyboard movement.
    await page.locator('#tb-undo').click();await expect(page.locator('#tb-canvas [data-field=common_name]')).not.toHaveAttribute('fill','#123456');await page.locator('#tb-redo').click();
    const x=Number(await page.locator('#tb-prop-x').inputValue());
    const bounds=await page.locator('#tb-canvas [data-field=common_name]').boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+20,bounds.y+bounds.height/2+10,{steps:4});await page.mouse.up();
    assert.ok(Number(await page.locator('#tb-prop-x').inputValue())>x,JSON.stringify({x,now:await page.locator('#tb-prop-x').inputValue(),error:await page.locator('#tb-error').textContent(),errors}));
    const width=Number(await page.locator('#tb-prop-data-width').inputValue()),handle=await page.locator('[data-builder-resize]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+20,handle.y+handle.height/2+10,{steps:3});await page.mouse.up();assert.ok(Number(await page.locator('#tb-prop-data-width').inputValue())>width);
    const moved=Number(await page.locator('#tb-prop-x').inputValue());await page.locator('#tb-canvas').focus();await page.keyboard.press('ArrowRight');assert.ok(Number(await page.locator('#tb-prop-x').inputValue())>moved);
    // Cancel/close preserves the workspace, and the saved draft can be restored.
    await page.locator('#tb-close').click();assert.equal(await page.evaluate(()=>localStorage.getItem('classroom-cards.static-first.v2:project:field-guide')),initial);
    await page.reload();await ready();await page.locator('#build-template').click();await expect(page.locator('#tb-draft')).toBeVisible();await page.locator('#tb-restore').click();await expect(page.locator('#tb-name')).toHaveValue('Builder test');
    const downloaded=page.waitForEvent('download');await page.locator('#tb-download').click();const templateFile=path.join(temp,'template.svg');await (await downloaded).saveAs(templateFile);const saved=fs.readFileSync(templateFile,'utf8');assert.match(saved,/data-inline-field="family"/);assert.match(saved,/data-flow-after="scientific_name"/);assert.match(saved,/data-line-spacing="1.5"/);assert.ok(!saved.includes('data-builder-overlay'));
    await page.locator('#tb-upload').setInputFiles({name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.locator('#tb-error')).not.toBeEmpty();await expect(page.locator('#tb-name')).toHaveValue('Builder test');
    await page.locator('#tb-upload').setInputFiles(templateFile);await page.locator('#tb-apply').click();await expect(page.locator('#template-builder')).toHaveCount(0);
    await expect(page.locator('#fields [data-field=family]')).toHaveCount(1);
    await page.locator('#fields [data-field=common_name]').fill('Ladybug study');
    const single=page.waitForEvent('download');await page.locator('#download-svg').click();const cardFile=path.join(temp,'card.svg');await (await single).saveAs(cardFile);const cardSVG=fs.readFileSync(cardFile,'utf8');assert.match(cardSVG,/Coccinellidae/);assert.ok(!cardSVG.includes('data-builder-overlay'));
    await page.reload();await ready();await expect(page.locator('#card-preview [data-field=scientific_name]')).toContainText('Coccinellidae');
    const previewMetrics=await page.locator('#card-preview [data-field=scientific_name]').evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y')),text:el.textContent}));
    const printPopup=page.waitForEvent('popup');await page.locator('#print-card').click();const sheet=await printPopup;await sheet.waitForSelector('#print:not([disabled])');
    const printMetrics=await sheet.locator('.fronts [data-field=scientific_name]').first().evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y')),text:el.textContent}));assert.deepEqual(printMetrics,previewMetrics);await sheet.close();
    const setDownload=page.waitForEvent('download');await page.locator('#download-set').click();await page.locator('#download-set-zip').click();const setFile=path.join(temp,'cards.zip');await (await setDownload).saveAs(setFile);await page.locator('#card-export-dialog form button').click();
    const setSVG=cp.execFileSync('python3',['-c','import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z: print(z.read(z.namelist()[0]).decode())',setFile],{maxBuffer:20*1024*1024}).toString();assert.match(setSVG,/Coccinellidae/);
    const standalone=await browser.newPage();await standalone.goto('file://'+cardFile);await standalone.evaluate(()=>document.fonts.ready);const exportedMetrics=await standalone.locator('[data-field=scientific_name]').evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y')),text:el.textContent}));assert.deepEqual(exportedMetrics,previewMetrics);await standalone.close();
    // Project ZIP round trip carries all layout rules, front and back separately.
    const projectDownload=page.waitForEvent('download');await page.locator('#save-project').click();const projectFile=path.join(temp,'project.zip');await (await projectDownload).saveAs(projectFile);
    await page.locator('#open-json').setInputFiles(projectFile);await page.waitForURL('**/?local=*');await ready();await expect(page.locator('#card-preview [data-field=scientific_name]')).toContainText('Coccinellidae');
    const stateKey=await page.evaluate(()=>'classroom-cards.static-first.v2:project:local-'+new URLSearchParams(location.search).get('local'));
    const front=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).templateSVG,stateKey);await page.locator('#edit-back').click();
    await page.locator('#build-template').click();await page.locator('#tb-name').fill('Edited back');await page.locator('#tb-name').dispatchEvent('change');await page.locator('#tb-apply').click();await page.locator('#edit-front').click();await expect(page.locator('#card-preview')).toContainText('Coccinellidae');assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).templateSVG,stateKey),front);
    // Pure layout scenarios use a connected SVG, exactly as the visible builder does.
    const metrics=await page.evaluate(async source=>{
      const {readTemplate,renderTemplate}=await import('./template.js');const host=document.createElement('div');document.body.append(host);
      let template=readTemplate(source);const design=template.root,common=design.querySelector('[data-field=common_name]'),scientific=design.querySelector('[data-field=scientific_name]'),category=design.querySelector('[data-field=category]');
      scientific.setAttribute('data-flow-after','common_name');scientific.setAttribute('data-gap',3);category.setAttribute('data-flow-after','scientific_name');category.setAttribute('data-gap',3);common.setAttribute('data-width',70);
      template=readTemplate(new XMLSerializer().serializeToString(design));
      const measure=value=>{const {root,issues}=renderTemplate(template,{common_name:value,scientific_name:'Anolis carolinensis',family:'Dactyloidae',category:'Reptile'},template.colors,null,null,host);return {y:Number(root.querySelector('[data-field=category]').getAttribute('y')),lines:root.querySelector('[data-field=common_name]').children.length,issues};};
      const short=measure('Anole'),long=measure('Green anole study');
      common.setAttribute('data-fit','fit-box');common.setAttribute('data-height',12);common.setAttribute('data-min-font-size',5);template=readTemplate(new XMLSerializer().serializeToString(design));const fitted=measure('Green anole study');
      common.setAttribute('data-fit','shrink');common.setAttribute('data-lines',1);common.setAttribute('data-width',1);common.setAttribute('data-min-font-size',5);template=readTemplate(new XMLSerializer().serializeToString(design));const overflow=measure('An impossibly long title that must report overflow');
      host.remove();return {short,long,fitted,overflow};
    },fixture);
    assert.ok(metrics.long.lines>metrics.short.lines);assert.ok(metrics.long.y>metrics.short.y);assert.equal(metrics.fitted.issues.length,0);assert.ok(metrics.overflow.issues.some(message=>message.includes('minimum font size')));
    const spacing=await page.evaluate(async source=>{
      const {readTemplate,renderTemplate}=await import('./template.js'),design=readTemplate(source).root,node=design.querySelector('[data-field=common_name]'),host=document.createElement('div');document.body.append(host);
      const measure=()=>{const template=readTemplate(new XMLSerializer().serializeToString(design)),result=renderTemplate(template,{common_name:'One\nTwo'},template.colors,null,null,host),text=result.root.querySelector('[data-field=common_name]');return {gap:Number(text.children[1].getAttribute('y'))-Number(text.children[0].getAttribute('y')),size:parseFloat(text.style.fontSize)};};
      node.setAttribute('data-line-height',18);const legacy=measure();node.setAttribute('data-line-spacing',1.5);node.setAttribute('font-size',20);const larger=measure();node.setAttribute('data-fit','fit-box');node.setAttribute('data-height',18);node.setAttribute('data-min-font-size',5);const fitted=measure();
      node.setAttribute('data-line-spacing',0);let invalid=false;try{readTemplate(new XMLSerializer().serializeToString(design));}catch{invalid=true;}host.remove();return {legacy,larger,fitted,invalid};
    },fixture);
    assert.equal(spacing.legacy.gap,18);assert.equal(spacing.larger.gap,30);assert.ok(spacing.fitted.size<20);assert.ok(Math.abs(spacing.fitted.gap-spacing.fitted.size*1.5)<.00001);assert.equal(spacing.invalid,true);
    // Narrow layouts stay within the dialog, and drafts survive a reload.
    await page.setViewportSize({width:390,height:844});await page.locator('#build-template').click();assert.equal(await page.locator('#template-builder').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.screenshot({path:path.join(temp,'builder-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1400,height:1000});await layer('Scientific name');await page.screenshot({path:'/tmp/card-template-builder-desktop.png',fullPage:true});await page.locator('#tb-close').click();
    const touch=await browser.newPage({hasTouch:true,isMobile:true,viewport:{width:390,height:844},serviceWorkers:'block'});await touch.goto('http://127.0.0.1:'+port+'/?project=field-guide');await touch.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await touch.locator('#build-template').click();await touch.locator('#tb-elements button').filter({hasText:/^Common name$/}).click();await touch.locator('#tb-canvas').scrollIntoViewIfNeeded();const touchBox=await touch.locator('#tb-canvas [data-field=common_name]').boundingBox(),session=await touch.context().newCDPSession(touch);const touchX=touchBox.x+touchBox.width/2,touchY=touchBox.y+touchBox.height/2;
    const originalTransform=await touch.locator('#tb-canvas [data-field=common_name]').getAttribute('transform');await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchX,y:touchY}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchX+15,y:touchY+12}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await touch.locator('#tb-canvas [data-field=common_name]').getAttribute('transform'),originalTransform);await touch.screenshot({path:'/tmp/card-template-builder-mobile.png',fullPage:true});await touch.close();
    const offline=await browser.newPage();await offline.goto('http://127.0.0.1:'+port+'/?project=field-guide');await offline.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await offline.evaluate(()=>navigator.serviceWorker.ready);await offline.reload();await offline.waitForFunction(()=>!!navigator.serviceWorker.controller);await offline.context().setOffline(true);await offline.locator('#build-template').click();await offline.locator('#tb-name').fill('Offline template');await offline.locator('#tb-name').dispatchEvent('change');await offline.locator('#tb-apply').click();await expect(offline.locator('#template-title')).toHaveText('Offline template');await offline.reload();await expect(offline.locator('#template-title')).toHaveText('Offline template');await offline.close();
    assert.deepEqual(errors,[]);console.log('PASS: template builder upload/download, inline fields, flow, shrink/box fitting, overflow, cycle rejection, colors, drag/resize/keyboard/touch, undo/redo, draft restore after reload, cancel isolation, apply/reload, matching preview/print/card SVG, bulk export, project ZIP reopen, separate back editing, narrow layout, and offline editing/reload.');
  }finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
