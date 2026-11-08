// Bounded photo corrections through real card, file, recovery and touch workflows.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-photo-adjust-'));
(async()=>{
  let browser;const server=cp.spawn('python3',['-u',path.join(root,'run.py'),'--port','0']);
  try{
    const port=await new Promise((resolve,reject)=>{server.stdout.on('data',chunk=>{const match=String(chunk).match(/127\.0\.0\.1:(\d+)/);if(match)resolve(match[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1400,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    const origin=`http://127.0.0.1:${port}`,key='classroom-cards.static-first.v2:project:field-guide';let stateKey=key;
    const ready=()=>page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false'&&!document.querySelector('#build-template').disabled);
    const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),stateKey);
    const image=()=>page.locator('#card-preview image[data-card-artwork]');
    const open=async()=>{await page.locator('#adjust-photo').click();await expect(page.locator('#photo-adjuster')).toBeVisible();};
    const input=async(id,value)=>{await page.locator('#adjust-'+id).fill(String(value));await page.locator('#adjust-'+id).dispatchEvent('input');};
    const apply=async()=>{await expect(page.locator('#adjust-apply')).toBeEnabled();await page.locator('#adjust-apply').click();await expect(page.locator('#photo-adjuster')).toHaveCount(0);await ready();};
    const pixels=async()=>page.locator('#adjust-preview').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data));
    await page.goto(origin+'/?project=field-guide');await ready();
    await page.locator('#photo-tips-button').click();await expect(page.locator('#photo-tips')).toContainText('Find soft, even light');await expect(page.locator('#photo-tips')).toContainText('iPad parallel');await page.keyboard.press('Escape');
    const fixture=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=320;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='rgb(230,222,214)';ctx.fillRect(0,0,320,240);ctx.fillStyle='rgb(90,120,150)';ctx.fillRect(40,60,100,120);ctx.fillStyle='rgb(150,90,110)';ctx.fillRect(180,60,100,120);ctx.clearRect(0,0,5,5);return c.toDataURL('image/png');
    });
    await page.locator('#image-files').setInputFiles({name:'pencil.png',mimeType:'image/png',buffer:Buffer.from(fixture.split(',')[1],'base64')});await ready();
    await page.locator('#duplicate-card').click();await ready();await page.locator('#preview-card-select').selectOption('0');await ready();
    await page.locator('#image-adjustments').evaluate(el=>el.open=true);await page.locator('#crop-zoom').fill('1.5');await page.locator('#crop-zoom').dispatchEvent('input');const before=await state();
    await open();await expect(page.locator('#adjust-apply')).toBeDisabled();const originalPixels=await pixels();
    await input('exposure',.25);await expect(page.locator('#adjust-apply')).toBeEnabled();await expect.poll(async()=>JSON.stringify(await pixels())).not.toBe(JSON.stringify(originalPixels));
    await page.locator('#adjust-original').click();assert.deepEqual(await pixels(),originalPixels);await page.locator('#adjust-original').click();assert.notDeepEqual(await pixels(),originalPixels);assert.deepEqual(await state(),before);
    await page.locator('#adjust-paper').click();await page.locator('#adjust-preview').click({position:{x:16,y:20}});await expect(page.locator('#adjust-status')).toContainText('White balance set');
    await page.locator('#adjust-more').evaluate(el=>el.open=true);assert.ok(Number(await page.locator('#adjust-warmth').inputValue())<0);
    const sampledWarmth=await page.locator('#adjust-warmth').inputValue();await page.locator('#adjust-paper').click();await page.locator('#adjust-preview').click({position:{x:80,y:100}});await expect(page.locator('#adjust-status')).toContainText('Choose a blank');await expect(page.locator('#adjust-warmth')).toHaveValue(sampledWarmth);await page.locator('#adjust-paper').click();
    await page.locator('#adjust-curves').evaluate(el=>el.open=true);const handle=page.locator('#adjust-curve [data-point="1"]');await handle.focus();for(let i=0;i<10;i++)await page.keyboard.press('Shift+ArrowUp');await expect(handle).toHaveAttribute('aria-valuenow','4.00');await page.keyboard.press('Home');await expect(handle).toHaveAttribute('aria-valuenow','0.00');
    await page.locator('#adjust-channel').selectOption('blue');await input('curve-strength',2.5);await expect(handle).toHaveAttribute('aria-valuenow','2.50');
    await page.locator('#adjust-channel').selectOption('light');await page.locator('#adjust-point').selectOption('2');await input('curve-strength',1);
    assert.deepEqual(await state(),before);await page.screenshot({path:'/tmp/card-photo-adjust-desktop.png'});
    // Reset and Escape leave both saved work and preview pixels unchanged.
    await page.locator('#adjust-reset').click();await expect(page.locator('#adjust-apply')).toBeDisabled();assert.deepEqual(await pixels(),originalPixels);await page.keyboard.press('Escape');assert.deepEqual(await state(),before);
    await open();await input('exposure',.25);await input('vibrance',8);await apply();const corrected=await image().getAttribute('href');assert.notEqual(corrected,fixture);
    let saved=await state(),name=saved.cards[0].imageName;assert.match(name,/-adjusted\.png$/);assert.deepEqual(saved.cards[0].crop,before.cards[0].crop);assert.equal(saved.cards.at(-1).imageName,before.cards.at(-1).imageName);assert.equal(saved.cards[0].backImageName,before.cards[0].backImageName);assert.ok(saved.assets[before.cards[0].imageName]);assert.equal(saved.photoAdjustments[name].sourceName,before.cards[0].imageName);
    const changedPixels=await page.evaluate(async source=>{const i=new Image();i.src=source;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;c.getContext('2d').drawImage(i,0,0);const ctx=c.getContext('2d');return {size:[c.width,c.height],paper:[...ctx.getImageData(20,20,1,1).data],alpha:ctx.getImageData(0,0,1,1).data[3]};},corrected);
    assert.deepEqual(changedPixels.size,[320,240]);assert.ok(changedPixels.paper[0]>230 && changedPixels.paper[0]<=255);assert.equal(changedPixels.alpha,0);
    await open();await expect(page.locator('#adjust-exposure')).toHaveValue('0.25');await expect(page.locator('#adjust-apply')).toBeDisabled();await page.locator('#adjust-original').click();assert.deepEqual(await pixels(),originalPixels);await page.locator('#adjust-cancel').click();
    await page.locator('#undo-photo-adjustment').click();await ready();await expect(image()).toHaveAttribute('href',fixture);assert.deepEqual((await state()).cards[0],before.cards[0]);
    await open();await input('exposure',.25);await input('vibrance',8);await apply();await expect(image()).toHaveAttribute('href',corrected);
    // Applied pixels survive SVG export, print and browser recovery.
    const download=page.waitForEvent('download');await page.locator('#download-svg').click();const svgFile=path.join(temp,'card.svg');await (await download).saveAs(svgFile);assert.ok(fs.readFileSync(svgFile,'utf8').includes(corrected));
    const popup=page.waitForEvent('popup');await page.locator('#print-card').click();const sheet=await popup;await sheet.waitForSelector('#print:not([disabled])');await expect(sheet.locator('.fronts image[data-card-artwork]').first()).toHaveAttribute('href',corrected);await sheet.close();
    await page.reload();await ready();await expect(image()).toHaveAttribute('href',corrected);await open();await expect(page.locator('#adjust-exposure')).toHaveValue('0.25');await page.locator('#adjust-cancel').click();
    const projectDownload=page.waitForEvent('download');await page.locator('#save-project').click();const zip=path.join(temp,'project.zip');await (await projectDownload).saveAs(zip);await page.locator('#open-json').setInputFiles(zip);await page.waitForURL('**/?local=*');await ready();stateKey='classroom-cards.static-first.v2:local:'+new URL(page.url()).searchParams.get('local');
    await expect(image()).toHaveAttribute('href',corrected);await open();await expect(page.locator('#adjust-exposure')).toHaveValue('0.25');await page.locator('#adjust-original').click();assert.deepEqual(await pixels(),originalPixels);
    // Changing and then restoring settings uses the source, never the previously adjusted pixels.
    await input('exposure',.24);await apply();await open();await input('exposure',.25);await apply();await expect(image()).toHaveAttribute('href',corrected);
    // Back-side correction is independent and Undo restores its previous crop and image.
    await page.locator('#preview-back').click();await ready();const oldBack=await image().getAttribute('href');await open();await input('contrast',5);await apply();assert.notEqual(await image().getAttribute('href'),oldBack);await page.locator('#undo-photo-adjustment').click();await ready();await expect(image()).toHaveAttribute('href',oldBack);await page.locator('#preview-front').click();await ready();await expect(image()).toHaveAttribute('href',corrected);
    // Tips, editing, source recipes and recovery also work with the network disconnected.
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await ready();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.context().setOffline(true);await page.reload();await ready();await open();await page.locator('#adjust-tips').click();await expect(page.locator('#photo-tips')).toBeVisible();await page.keyboard.press('Escape');await input('contrast',4);await apply();const offlineImage=await image().getAttribute('href');await page.reload();await ready();await expect(image()).toHaveAttribute('href',offlineImage);await page.context().setOffline(false);
    // Touch curves, keyboard sampling, and reachable footer on a narrow phone-sized viewport.
    const mobile=await browser.newPage({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(origin+'/?project=field-guide');await mobile.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await mobile.locator('#adjust-photo').click();await expect(mobile.locator('#photo-adjuster')).toBeVisible();
    assert.ok(await mobile.locator('#photo-adjuster').evaluate(el=>el.scrollWidth<=el.clientWidth));const applyBox=await mobile.locator('#adjust-apply').boundingBox();assert.ok(applyBox.y>=0 && applyBox.y+applyBox.height<=844,'Apply stays visible on mobile');
    await mobile.locator('#adjust-curves').evaluate(el=>el.open=true);const mobileHandle=mobile.locator('#adjust-curve [data-point="1"]');await mobileHandle.scrollIntoViewIfNeeded();const bounds=await mobileHandle.boundingBox(),session=await mobile.context().newCDPSession(mobile),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-50}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(mobileHandle).toHaveAttribute('aria-valuenow','2.50');await mobile.screenshot({path:'/tmp/card-photo-adjust-mobile.png'});await mobile.locator('#adjust-cancel').click();await mobile.close();
    // An apply failure can be retried without accumulating corrections or losing the source.
    await page.evaluate(async source=>{
      window.photoRetry={calls:0,outputs:[]};const {openPhotoAdjuster}=await import('./photo-adjust.js');
      await openPhotoAdjuster({source,onApply:data=>{window.photoRetry.outputs.push(data);if(++window.photoRetry.calls===1)throw Error('Please retry this save.');}});
    },fixture);
    await input('exposure',.25);await page.locator('#adjust-apply').click();await expect(page.locator('#adjust-error')).toHaveText('Please retry this save.');await apply();assert.ok(await page.evaluate(()=>window.photoRetry.calls===2 && window.photoRetry.outputs[0]===window.photoRetry.outputs[1]));
    assert.deepEqual(errors,[]);console.log('PASS: preview/original/reset/cancel isolation, paper sampler, bounded keyboard/color/touch curves, crop/shared-image/side preservation, Apply/Undo, source-based reediting without stacking, SVG/print/ZIP/recovery, mobile footer and offline corrections/tips.');
  }finally{await browser?.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
