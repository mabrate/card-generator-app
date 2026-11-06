// Projective pixel checks and the student photo workflow, including portable/offline recovery.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-photo-straighten-'));
(async()=>{
  let browser;const server=cp.spawn('python3',['-u',path.join(root,'run.py'),'--port','0']);
  try{
    const port=await new Promise((resolve,reject)=>{server.stdout.on('data',chunk=>{const match=String(chunk).match(/127\.0\.0\.1:(\d+)/);if(match)resolve(match[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1400,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    const origin=`http://127.0.0.1:${port}`,key='classroom-cards.static-first.v2:project:field-guide';
    const ready=()=>page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false'&&!document.querySelector('#build-template').disabled);
    const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
    const image=()=>page.locator('#card-preview image[data-card-artwork]');
    await page.goto(origin+'/?project=field-guide');await ready();
    const fixture=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=260;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(320,260);
      // Independently invert x=(40+240u+40v)/(1+.3u+.1v), y=(30+20u+190v)/(1+.3u+.1v).
      for(let y=0;y<260;y++)for(let x=0;x<320;x++){
        const a=240-.3*x,b=40-.1*x,c=20-.3*y,d=190-.1*y,det=a*d-b*c;
        const u=((x-40)*d-b*(y-30))/det,v=(a*(y-30)-(x-40)*c)/det;
        let color=[120,120,120];
        if(u>=0&&u<=1&&v>=0&&v<=1)color=Math.abs(u-.5)<.025||Math.abs(v-.5)<.025?[0,0,0]:v<.5?(u<.5?[240,30,20]:[20,200,30]):u<.5?[20,40,240]:[240,210,20];
        pixels.data.set([...color,255],(y*320+x)*4);
      }
      ctx.putImageData(pixels,0,0);
      return {source:canvas.toDataURL('image/png'),points:[{x:40,y:30},{x:280/1.3,y:50/1.3},{x:320/1.4,y:240/1.4},{x:80/1.1,y:220/1.1}]};
    });
    const upload=async(input='#image-files')=>{await page.locator(input).setInputFiles({name:'artwork.png',mimeType:'image/png',buffer:Buffer.from(fixture.source.split(',')[1],'base64')});await ready();};
    const moveCorner=async(index,target)=>{
      const coordinates=await page.locator(`#photo-corners [data-corner="${index}"]`).evaluate((handle,target)=>{
        const svg=handle.ownerSVGElement,m=svg.getScreenCTM(),start=new DOMPoint(0,0).matrixTransform(handle.getScreenCTM()),end=new DOMPoint(target.x,target.y).matrixTransform(m);return {start:{x:start.x,y:start.y},end:{x:end.x,y:end.y}};
      },target);
      await page.mouse.move(coordinates.start.x,coordinates.start.y);await page.mouse.down();await page.mouse.move(coordinates.end.x,coordinates.end.y,{steps:4});await page.mouse.up();
    };
    const selectArtwork=async()=>{for(let i=0;i<4;i++)await moveCorner(i,fixture.points[i]);await page.locator('#photo-ratio').selectOption('1.3333333333333333');await expect(page.locator('#photo-apply')).toBeEnabled();};
    const sample=async source=>page.evaluate(async source=>{
      let canvas;
      if(source){const img=new Image();img.src=source;await img.decode();canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);}
      else canvas=document.querySelector('#photo-result canvas');
      const ctx=canvas.getContext('2d'),at=(u,v)=>Array.from(ctx.getImageData(Math.round((canvas.width-1)*u),Math.round((canvas.height-1)*v),1,1).data);
      return {width:canvas.width,height:canvas.height,pixels:[[.2,.2],[.8,.2],[.2,.8],[.8,.8],[.5,.2],[.5,.8],[.2,.5],[.8,.5]].map(([u,v])=>at(u,v))};
    },source);
    const checkPixels=actual=>{
      assert.ok(Math.abs(actual.width/actual.height-4/3)<.02);
      const expected=[[240,30,20],[20,200,30],[20,40,240],[240,210,20],[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
      actual.pixels.forEach((pixel,i)=>{assert.equal(pixel[3],255);pixel.slice(0,3).forEach((value,c)=>assert.ok(Math.abs(value-expected[i][c])<8,JSON.stringify({i,pixel,expected:expected[i]})));});
    };
    await upload();await expect(image()).toHaveAttribute('href',fixture.source);const original=await state();
    await page.locator('#duplicate-card').click();await ready();await page.locator('#preview-card-select').selectOption('0');await ready();
    await page.locator('#image-adjustments').evaluate(el=>el.open=true);await page.locator('#crop-zoom').fill('2');await page.locator('#crop-zoom').dispatchEvent('input');const before=await state();
    await page.locator('#straighten-photo').click();await expect(page.locator('#photo-straightener')).toBeVisible();await selectArtwork();checkPixels(await sample());
    assert.deepEqual(await state(),before);await page.screenshot({path:'/tmp/card-photo-straighten-desktop.png'});
    // Crossing corners rejects the selection without changing saved work; Reset and keyboard movement recover it.
    await moveCorner(0,fixture.points[2]);await expect(page.locator('#photo-error')).not.toBeEmpty();await expect(page.locator('#photo-apply')).toBeDisabled();assert.deepEqual(await state(),before);
    await page.locator('#photo-reset').click();await expect(page.locator('#photo-apply')).toBeEnabled();const corner=page.locator('#photo-corners [data-corner="0"]'),transform=await corner.getAttribute('transform');await corner.focus();await page.keyboard.press('Shift+ArrowRight');assert.notEqual(await corner.getAttribute('transform'),transform);
    await page.keyboard.press('Escape');await expect(page.locator('#photo-straightener')).toHaveCount(0);assert.deepEqual(await state(),before);
    // A camera capture opens the tool automatically. Cancel keeps the newly captured original.
    await upload('#camera-file');await expect(page.locator('#photo-straightener')).toBeVisible();const captured=await state();await page.locator('#photo-cancel').click();assert.deepEqual(await state(),captured);await expect(image()).toHaveAttribute('href',fixture.source);
    await page.locator('#straighten-photo').click();await selectArtwork();await page.locator('#photo-apply').click();await expect(page.locator('#photo-straightener')).toHaveCount(0);
    const corrected=await image().getAttribute('href');checkPixels(await sample(corrected));let saved=await state();const firstName=saved.cards[0].imageName;
    assert.match(firstName,/-straightened\.png$/);assert.equal(saved.cards.at(-1).imageName,original.cards[0].imageName);assert.ok(saved.assets[original.cards[0].imageName]);assert.deepEqual(saved.cards[0].crop,{x:.5,y:.5,zoom:1});assert.equal(saved.cards[0].backImageName,original.cards[0].backImageName);
    await page.locator('#undo-straighten').click();await ready();await expect(image()).toHaveAttribute('href',fixture.source);saved=await state();assert.equal(saved.cards[0].imageName,captured.cards[0].imageName);assert.deepEqual(saved.cards[0].crop,captured.cards[0].crop);assert.ok(saved.assets[firstName]);
    await page.locator('#straighten-photo').click();await selectArtwork();await page.locator('#photo-apply').click();await expect(page.locator('#photo-straightener')).toHaveCount(0);await expect(image()).toHaveAttribute('href',corrected);assert.notEqual((await state()).cards[0].imageName,firstName);
    // Corrected PNG pixels survive individual SVG export, print, browser recovery and project ZIP import.
    const download=page.waitForEvent('download');await page.locator('#download-svg').click();const svgFile=path.join(temp,'card.svg');await (await download).saveAs(svgFile);assert.ok(fs.readFileSync(svgFile,'utf8').includes(corrected));
    const popup=page.waitForEvent('popup');await page.locator('#print-card').click();const sheet=await popup;await sheet.waitForSelector('#print:not([disabled])');await expect(sheet.locator('.fronts image[data-card-artwork]').first()).toHaveAttribute('href',corrected);await sheet.close();
    await page.reload();await ready();await expect(image()).toHaveAttribute('href',corrected);
    const projectDownload=page.waitForEvent('download');await page.locator('#save-project').click();const zip=path.join(temp,'project.zip');await (await projectDownload).saveAs(zip);await page.locator('#open-json').setInputFiles(zip);await page.waitForURL('**/?local=*');await ready();await expect(image()).toHaveAttribute('href',corrected);await expect(page.locator('#undo-straighten')).toBeHidden();
    // Editing the back leaves the front alone, and Undo restores the original back.
    await page.locator('#preview-back').click();await ready();const originalBack=await image().getAttribute('href');await page.locator('#straighten-photo').click();await page.locator('#photo-ratio').selectOption('1');await page.locator('#photo-apply').click();await expect(page.locator('#photo-straightener')).toHaveCount(0);assert.notEqual(await image().getAttribute('href'),originalBack);
    await page.locator('#undo-straighten').click();await ready();await expect(image()).toHaveAttribute('href',originalBack);await page.locator('#preview-front').click();await ready();await expect(image()).toHaveAttribute('href',corrected);
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await ready();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.context().setOffline(true);
    await page.reload();await ready();await page.locator('#straighten-photo').click();await expect(page.locator('#photo-straightener')).toBeVisible();await page.locator('#photo-ratio').selectOption('1');await page.locator('#photo-apply').click();await expect(page.locator('#photo-straightener')).toHaveCount(0);const offlineImage=await image().getAttribute('href');await page.reload();await ready();await expect(image()).toHaveAttribute('href',offlineImage);await page.context().setOffline(false);
    // Real touch events move a corner in a narrow dialog without horizontal overflow.
    const mobile=await browser.newPage({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(origin+'/?project=field-guide');await mobile.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await mobile.locator('#straighten-photo').click();
    await expect(mobile.locator('#photo-straightener')).toBeVisible();assert.equal(await mobile.locator('#photo-straightener').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    const applyBox=await mobile.locator('#photo-apply').boundingBox();assert.ok(applyBox.y>=0&&applyBox.y+applyBox.height<=844,'Apply stays visible on mobile');
    const handle=mobile.locator('#photo-corners [data-corner="0"]');await handle.scrollIntoViewIfNeeded();const beforeTouch=await handle.getAttribute('transform'),bounds=await handle.boundingBox(),session=await mobile.context().newCDPSession(mobile),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+15,y:y+20}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await handle.getAttribute('transform'),beforeTouch);await mobile.screenshot({path:'/tmp/card-photo-straighten-mobile.png'});await mobile.locator('#photo-cancel').click();await mobile.close();
    assert.deepEqual(errors,[]);console.log('PASS: projective colored/grid pixels, corner drag/keyboard/touch, proportions, invalid-selection guards, reset/cancel/Escape isolation, camera auto-open, original/shared-image preservation, crop reset, undo, separate sides, SVG/print/ZIP/recovery, mobile and offline apply/reload.');
  }finally{await browser?.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
