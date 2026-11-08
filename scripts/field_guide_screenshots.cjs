// Refresh the student guide's screenshots from the real application.
// NODE_PATH=/path/to/node_modules node scripts/field_guide_screenshots.cjs
const {chromium,expect}=require('playwright/test');
const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'static-app/projects/field-guide/guide-images');
(async()=>{
 let browser;const server=cp.spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',path.join(root,'static-app')]);
 try{
  const port=await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{const m=String(data).match(/port (\d+)/);if(m)resolve(m[1]);});server.on('error',reject);});
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1200,height:1050},deviceScaleFactor:1});
  const ready=()=>page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');
  fs.mkdirSync(output,{recursive:true});
  await page.goto('http://127.0.0.1:'+port+'/?project=field-guide');await ready();await page.locator('#edit-back').click();await ready();
  await page.locator('#fields [data-field=identification_clues]').fill('Red wing covers with seven black spots. Long, dark, spiny larvae have orange patches.');
  await page.locator('#fields [data-field=adaptations_ecology]').fill('Adults and larvae eat aphids on plants, helping protect garden plants.');
  await page.locator('.form-panel').scrollIntoViewIfNeeded();
  const panel=await page.locator('.form-panel').boundingBox(),fields=await page.locator('#fields').boundingBox();
  await page.screenshot({path:path.join(output,'back-fields.png'),clip:{x:panel.x,y:panel.y,width:panel.width,height:fields.y+fields.height-panel.y+16}});
  await page.locator('#edit-front').click();await ready();await page.locator('.image-inputs').screenshot({path:path.join(output,'photo-tools.png')});
  await page.locator('#straighten-photo').click();await expect(page.locator('#photo-straightener')).toBeVisible();
  for(let index=0;index<4;index++){
    const points=await page.locator(`#photo-corners [data-corner="${index}"]`).evaluate((handle,index)=>{
      const svg=handle.ownerSVGElement,{width,height}=svg.viewBox.baseVal,m=svg.getScreenCTM(),start=new DOMPoint(0,0).matrixTransform(handle.getScreenCTM());
      const end=new DOMPoint(index===0 || index===3?4:width-4,index<2?4:height-4).matrixTransform(m);return {start:{x:start.x,y:start.y},end:{x:end.x,y:end.y}};
    },index);
    await page.mouse.move(points.start.x,points.start.y);await page.mouse.down();await page.mouse.move(points.end.x,points.end.y,{steps:4});await page.mouse.up();
  }
  await page.locator('#photo-straightener').screenshot({path:path.join(output,'straighten-photo.png')});await page.locator('#photo-cancel').click();
  await page.locator('#adjust-photo').click();await expect(page.locator('#photo-adjuster')).toBeVisible();
  await page.locator('#adjust-exposure').fill('0.04');await page.locator('#adjust-exposure').dispatchEvent('input');await expect(page.locator('#adjust-apply')).toBeEnabled();
  await page.locator('#photo-adjuster').screenshot({path:path.join(output,'adjust-color.png')});await page.locator('#adjust-cancel').click();
  await page.locator('#download-svg').click();await expect(page.locator('#single-card-export-dialog')).toBeVisible();
  await page.locator('#single-card-export-dialog').screenshot({path:path.join(output,'download-card.png')});await page.locator('#single-card-export-dialog form button').click();
  await page.locator('#download-set').click();await page.locator('#export-pairs').check();
  await page.locator('#card-export-dialog').screenshot({path:path.join(output,'download-all-cards.png')});
  console.log('Captured six Field Guide student screenshots.');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(err=>{console.error(err);process.exitCode=1;});
