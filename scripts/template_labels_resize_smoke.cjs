// Shared label bindings and proportional resize modifiers must survive SVG/ZIP round trips.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const root=path.resolve(__dirname,'..');
const fixture=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 252" data-title="Labels and resize" font-family="Liberation Sans, sans-serif"><rect width="180" height="252" fill="#fff"/><text x="12" y="24" font-size="12" fill="#244734" data-field="common_name" data-label="Common name" data-width="150" data-lines="2" data-max-chars="200">{{common_name}}</text><text x="12" y="43" font-size="8" fill="#244734" data-field="family" data-label="Family" data-width="150" data-lines="2" data-max-chars="200">{{family}}</text><text id="family-label" x="12" y="70" font-size="8" font-weight="bold" fill="#244734">Family:</text><rect id="shape" x="12" y="100" width="80" height="30" fill="#dfe9d6"/><rect x="12" y="150" width="156" height="85" fill="#fff" data-image="artwork"/></svg>`;
(async()=>{
  let browser;const temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-template-labels-'));
  const server=cp.spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',path.join(root,'static-app')]);
  try{
    const port=await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{const match=String(data).match(/port (\d+)/);if(match)resolve(match[1]);});server.on('error',reject);});
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
    const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
    const ready=()=>page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');
    const set=async(name,value)=>{await page.locator('#tb-prop-'+name).fill(String(value));await page.locator('#tb-prop-'+name).dispatchEvent('change');};
    const layer=name=>page.locator('#tb-elements button').filter({hasText:new RegExp('^'+name+'$')}).click();
    const box=()=>page.locator('[data-builder-overlay] > rect').first().evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y')),width:Number(el.getAttribute('width')),height:Number(el.getAttribute('height'))}));
    const resize=async(modifier,dx=40,dy=6)=>{
      const handle=await page.locator('[data-builder-resize]').boundingBox(),x=handle.x+handle.width/2,y=handle.y+handle.height/2;
      if(modifier)await page.keyboard.down(modifier);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:4});await page.mouse.up();if(modifier)await page.keyboard.up(modifier);return box();
    };
    const save=async(button,name)=>{const download=page.waitForEvent('download');await page.locator(button).click();const file=path.join(temp,name);await (await download).saveAs(file);return file;};
    await page.goto('http://127.0.0.1:'+port+'/?project=field-guide');await ready();await page.locator('#build-template').click();await page.locator('#tb-upload').setInputFiles({name:'labels.svg',mimeType:'image/svg+xml',buffer:Buffer.from(fixture)});await expect(page.locator('#tb-name')).toHaveValue('Labels and resize');
    await expect(page.locator('.tb-stage-tools')).toContainText('180 × 252 pt');await layer('Family:');await page.locator('#tb-prop-data-inline-field').selectOption('family');
    await expect(page.locator('#tb-canvas #family-label')).toHaveText('Family: Coccinellidae');await expect(page.locator('#tb-canvas [data-field=family]')).toHaveCount(1);
    assert.equal(await page.locator('#tb-canvas #family-label tspan[font-weight=normal]').count()>0,true);await set('data-inline-prefix',' [');await set('data-inline-suffix',']');await expect(page.locator('#tb-canvas #family-label')).toHaveText('Family: [Coccinellidae]');
    await page.locator('#tb-prop-data-inline-field').selectOption('');await expect(page.locator('#tb-canvas #family-label')).toHaveText('Family:');await page.locator('#tb-undo').click();await expect(page.locator('#tb-canvas #family-label')).toHaveText('Family: [Coccinellidae]');
    await set('data-inline-prefix',' ');await set('data-inline-suffix','');
    // The label can be the field's only visual representation and still supplies Card data.
    await page.locator('#tb-elements button[data-field=family]').click();await page.locator('#tb-delete').click();await expect(page.locator('#tb-elements button[data-field=family]')).toHaveCount(0);await expect(page.locator('#tb-canvas #family-label')).toHaveText('Family: Coccinellidae');
    await layer('shape');const original=await box(),free=await resize();assert.ok(Math.abs(free.width/free.height-original.width/original.height)>.05);await page.locator('#tb-undo').click();
    for(const modifier of ['Shift','Control']){const changed=await resize(modifier);assert.ok(changed.width>original.width);assert.ok(Math.abs(changed.width/changed.height-original.width/original.height)<.001);assert.ok(Math.abs(changed.x-original.x)<.001&&Math.abs(changed.y-original.y)<.001);await page.locator('#tb-undo').click();}
    // A modifier may be pressed partway through a resize.
    const handle=await page.locator('[data-builder-resize]').boundingBox(),startX=handle.x+handle.width/2,startY=handle.y+handle.height/2;await page.mouse.move(startX,startY);await page.mouse.down();await page.mouse.move(startX+15,startY+1);await page.keyboard.down('Shift');await page.mouse.move(startX+30,startY+3);await page.mouse.up();await page.keyboard.up('Shift');const midway=await box();assert.ok(Math.abs(midway.width/midway.height-original.width/original.height)<.001);await page.locator('#tb-undo').click();
    await layer('Family:');const labelBefore=await box(),labelAfter=await resize('Shift',20,0);
    const transform=await page.locator('#tb-canvas #family-label').evaluate(el=>{const m=el.transform.baseVal.consolidate().matrix;return {a:m.a,b:m.b,c:m.c,d:m.d};});
    assert.ok(transform.a>1&&Math.abs(transform.a-transform.d)<.00001&&Math.abs(transform.b)<.00001&&Math.abs(transform.c)<.00001);
    // Glyph bounds round to screen pixels; verify the exact frame width and allow one point of glyph-bound rounding.
    assert.ok(Math.abs(labelAfter.width-labelBefore.width*transform.a)<.001);
    assert.ok(Math.abs(labelAfter.height-labelBefore.height*transform.a)<1,JSON.stringify({labelBefore,labelAfter,transform}));
    const templateFile=await save('#tb-download','template.svg');const source=fs.readFileSync(templateFile,'utf8');assert.match(source,/data-label-text="Family:"/);assert.match(source,/data-inline-field="family"/);
    const schema=await page.evaluate(async source=>{const {readTemplate,renderTemplate}=await import('./template.js'),template=readTemplate(source),host=document.createElement('div');document.body.append(host);const output=renderTemplate(template,{common_name:'Test',family:''},template.colors,null,null,host);const empty=output.root.querySelector('#family-label').textContent;host.remove();return {keys:template.fields.map(field=>field.key),empty};},source);assert.equal(schema.keys.filter(key=>key==='family').length,1);assert.equal(schema.empty,'Family:');
    await page.locator('#tb-upload').setInputFiles(templateFile);await layer('Family:');await expect(page.locator('#tb-prop-data-inline-field')).toHaveValue('family');await page.screenshot({path:'/tmp/card-template-builder-label-field.png'});await page.locator('#tb-apply').click();
    await expect(page.locator('#fields [data-field=family]')).toHaveCount(1);await page.locator('#fields [data-field=family]').fill('Testaceae');await expect(page.locator('#card-preview #family-label')).toHaveText('Family: Testaceae');
    const cardFile=await save('#download-svg','card.svg');const finished=await page.evaluate(source=>new DOMParser().parseFromString(source,'image/svg+xml').querySelector('#family-label').textContent,fs.readFileSync(cardFile,'utf8'));assert.equal(finished,'Family: Testaceae');
    const pop=page.waitForEvent('popup');await page.locator('#print-card').click();const print=await pop;await print.waitForSelector('#print:not([disabled])');await expect(print.locator('.fronts text[data-label-text]')).toHaveText('Family: Testaceae');await print.close();
    await page.locator('#fields [data-field=family]').fill('');await expect(page.locator('#card-preview #family-label')).toHaveText('Family:');const projectFile=await save('#save-project','project.zip');await page.locator('#open-json').setInputFiles(projectFile);await page.waitForURL('**/?local=*');await ready();await expect(page.locator('#card-preview #family-label')).toHaveText('Family:');await expect(page.locator('#fields [data-field=family]')).toHaveCount(1);
    await page.reload();await ready();await page.locator('#fields [data-field=family]').fill('Restored family');await expect(page.locator('#card-preview #family-label')).toHaveText('Family: Restored family');await page.setViewportSize({width:390,height:844});await page.locator('#build-template').click();assert.equal(await page.locator('#template-builder').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    assert.deepEqual(errors,[]);console.log('PASS: appended label fields, regular value styling, custom separators, detach/undo, shared/label-only schema, empty values, free/Shift/Ctrl/mid-drag resize, proportional text scaling, units, SVG/print/ZIP/recovery, and narrow layout.');
  }finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
