// Single image selections replace the current side without overwriting shared artwork.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),key='classroom-cards.static-first.v2:project:field-guide';
(async()=>{
  let browser;const temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-image-replace-')),server=cp.spawn('python3',['-u',path.join(root,'run.py'),'--port','0']);
  try{
    const port=await new Promise((resolve,reject)=>{server.stdout.on('data',chunk=>{const match=String(chunk).match(/127\.0\.0\.1:(\d+)/);if(match)resolve(match[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
    const page=await browser.newPage({serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    const ready=async()=>{await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await expect(page.locator('#build-template')).toBeEnabled();};
    const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
    const image=()=>page.locator('#card-preview image[data-card-artwork]');
    const upload=async(name,data,input='#image-files')=>{await page.locator(input).setInputFiles({name,mimeType:'image/png',buffer:Buffer.from(data.split(',')[1],'base64')});await ready();};
    const crop=async()=>{await page.locator('#image-adjustments').evaluate(el=>el.open=true);await page.locator('#crop-zoom').fill('2');await page.locator('#crop-zoom').dispatchEvent('input');};
    const centered={x:.5,y:.5,zoom:1};
    await page.goto(`http://127.0.0.1:${port}/?project=field-guide`);await ready();const original=await state();
    const [red,blue,green]=await page.evaluate(()=>['#ff0000','#0000ff','#00ff00'].map(color=>{const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,16,16);return c.toDataURL('image/png');}));
    await crop();await upload('replacement.png',red);await expect(image()).toHaveAttribute('href',red);
    let saved=await state();assert.equal(saved.cards[0].imageName,'replacement.png');assert.deepEqual(saved.cards[0].crop,centered);assert.equal(saved.cards[0].backImageName,original.cards[0].backImageName);
    // Another card shares the old file; replacing it with the same filename must be local.
    await page.locator('#duplicate-card').click();await ready();await crop();await upload('replacement.png',blue);await expect(image()).toHaveAttribute('href',blue);
    saved=await state();assert.equal(saved.cards[0].imageName,'replacement.png');assert.equal(saved.cards.at(-1).imageName,'replacement-2.png');assert.notEqual(saved.assets['replacement.png'],saved.assets['replacement-2.png']);
    await page.locator('#preview-card-select').selectOption('0');await ready();await expect(image()).toHaveAttribute('href',red);
    // A photo replaces an existing back, without touching the front or its crop.
    await page.locator('#preview-back').click();await ready();await crop();await upload('back.png',green,'#camera-file');await expect(image()).toHaveAttribute('href',green);
    saved=await state();assert.equal(saved.cards[0].backImageName,'back.png');assert.deepEqual(saved.cards[0].backCrop,centered);assert.equal(saved.cards[0].imageName,'replacement.png');
    await page.locator('#preview-front').click();await ready();await expect(image()).toHaveAttribute('href',red);
    // Selecting a file also replaces an active drawing, while retaining the drawing.
    await page.locator('#drawing-tools').evaluate(el=>el.open=true);await page.locator('#use-drawing').click();await ready();const drawingKey=(await state()).cards[0].drawingKey;
    await upload('replacement.png',blue);await expect(image()).toHaveAttribute('href',blue);saved=await state();assert.equal(saved.cards[0].drawingActive,false);assert.equal(saved.cards[0].drawingKey,drawingKey);assert.equal(saved.cards[0].imageName,'replacement-3.png');
    // Invalid or cancelled selections preserve the current image and saved settings.
    const beforeInvalid=await state();await page.locator('#image-files').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid image')});await expect(page.locator('#page-error')).not.toBeEmpty();await ready();assert.deepEqual(await state(),beforeInvalid);await expect(image()).toHaveAttribute('href',blue);
    await page.locator('#image-files').setInputFiles([]);assert.deepEqual(await state(),beforeInvalid);
    // Multi-file uploads remain library imports; they do not change the current side.
    await page.locator('#image-files').setInputFiles([{name:'bulk-a.png',mimeType:'image/png',buffer:Buffer.from(red.split(',')[1],'base64')},{name:'bulk-b.png',mimeType:'image/png',buffer:Buffer.from(green.split(',')[1],'base64')}]);await ready();await expect(image()).toHaveAttribute('href',blue);saved=await state();assert.ok(saved.assets['bulk-a.png']&&saved.assets['bulk-b.png']);assert.equal(saved.cards[0].imageName,beforeInvalid.cards[0].imageName);
    await page.reload();await ready();await expect(image()).toHaveAttribute('href',blue);await page.locator('#preview-back').click();await ready();await expect(image()).toHaveAttribute('href',green);
    const downloaded=page.waitForEvent('download');await page.locator('#save-project').click();const zip=path.join(temp,'project.zip');await (await downloaded).saveAs(zip);
    await page.locator('#open-json').setInputFiles(zip);await page.waitForURL('**/?local=*');await ready();await expect(image()).toHaveAttribute('href',blue);await page.locator('#preview-back').click();await ready();await expect(image()).toHaveAttribute('href',green);
    assert.deepEqual(errors,[]);console.log('PASS: automatic front/back and drawing replacement, crop reset, same-name shared-image isolation, invalid/cancel preservation, batch library import, browser recovery and project ZIP round trip.');
  }finally{await browser?.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
