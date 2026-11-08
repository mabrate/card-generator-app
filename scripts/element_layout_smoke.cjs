// Expanded Element Explorer text areas and a non-destructive upgrade of the original fixed layout.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pack=path.join(root,'static-app/projects/element-explorer');
const legacy=fs.readFileSync(path.join(pack,'templates/element-explorer-v1.svg'),'utf8');
const key='classroom-cards.static-first.v2:project:element-explorer';
(async()=>{
 let browser;const server=cp.spawn('python3',['-u',path.join(root,'run.py'),'--port','0']);
 try{
  const port=await new Promise((resolve,reject)=>{server.stdout.on('data',chunk=>{const match=String(chunk).match(/127\.0\.0\.1:(\d+)/);if(match)resolve(match[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1300,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const ready=async()=>{await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await expect(page.locator('#recovery-error')).toBeHidden();await expect(page.locator('#save-project')).toBeEnabled();};
  await page.goto(`http://127.0.0.1:${port}/?project=element-explorer`);await ready();
  const use='Hydrogen fuel cells combine hydrogen and oxygen to make electricity that powers electric cars, buses, and other vehicles.';
  const fact='Hydrogen is the lightest element and is found in water, stars, and many living things.';
  assert.ok(use.length>80 && fact.length>65);
  await page.locator('#fields [data-field=everyday_use]').fill(use);await page.locator('#fields [data-field=fun_fact]').fill(fact);await expect(page.locator('#fit-issues')).toBeEmpty();
  const measure=nodes=>Object.fromEntries(nodes.map(node=>{const b=node.getBBox();return [node.getAttribute('data-field') || node.getAttribute('data-image'),{x:b.x,y:b.y,width:b.width,height:b.height,lines:node.children.length,text:node.textContent}];}));
  const selector='[data-field=everyday_use],[data-field=fun_fact],rect[data-image]';
  const geometry=await page.locator('#card-preview '+selector.split(',').join(',#card-preview ')).evaluateAll(measure);
  assert.ok(geometry.everyday_use.lines>=4 && geometry.everyday_use.lines<=5);
  assert.equal(geometry.fun_fact.lines,2);await expect(page.locator('#card-preview [data-field=fun_fact]')).toHaveAttribute('x','12');
  assert.ok(geometry.fun_fact.width>99 && geometry.fun_fact.y>geometry.artwork.y+geometry.artwork.height);
  assert.ok(geometry.fun_fact.y+geometry.fun_fact.height<246);
  assert.ok(geometry.everyday_use.y+geometry.everyday_use.height<212);
  await page.locator('#card-preview').screenshot({path:'/tmp/element-expanded-text.png'});
  const popup=page.waitForEvent('popup');await page.locator('#print-sheets').click();const sheet=await popup;await expect(sheet.locator('#print')).toBeEnabled({timeout:30000});
  const printed=await sheet.locator('.fronts > svg > svg').first().locator(selector).evaluateAll(measure);
  for(const [name,box] of Object.entries(geometry)){
   assert.equal(printed[name].text,box.text);assert.equal(printed[name].lines,box.lines);
   // Font glyph bounds vary slightly with the preview/print display scale.
   for(const property of ['x','y','width','height'])assert.ok(Math.abs(printed[name][property]-box[property])<.75,`${name} ${property} differs in print`);
  }
  await sheet.close();
  // Existing cards, quantities, custom crops and assets survive the exact version-1 layout upgrade.
  await page.locator('#card-copies').fill('3');await page.locator('#card-copies').dispatchEvent('change');
  const before=await page.evaluate(async({key,legacy})=>{const {readTemplate}=await import('./template.js');const saved=JSON.parse(localStorage.getItem(key));saved.templateSVG=readTemplate(legacy).source;localStorage.setItem(key,JSON.stringify(saved));return saved;},{key,legacy});
  await page.reload();await ready();const upgraded=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.notEqual(upgraded.templateSVG,before.templateSVG);assert.deepEqual(upgraded.cards,before.cards);assert.deepEqual(upgraded.assets,before.assets);await expect(page.locator('#fit-issues')).toBeEmpty();
  await expect(page.locator('#card-preview > svg')).toHaveAttribute('data-template-version','2');
  // Unrecognized layouts still use the existing recovery path without overwriting saved data.
  const unknown={...before,templateSVG:before.templateSVG.replace('ATOMIC NUMBER','UNKNOWN LAYOUT')};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved:unknown});await page.reload();await expect(page.locator('#recovery-error')).toBeVisible();assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),unknown);
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved:upgraded});await page.reload();await ready();
  // The standalone catalog template has the same room for longer text.
  const builtin=await page.evaluate(async({use,fact})=>{const {readTemplate,renderTemplate}=await import('./template.js');const t=readTemplate(await(await fetch('./templates/element-explorer.svg')).text());const host=document.createElement('div');document.body.append(host);const result=renderTemplate(t,{atomic_number:'1',symbol:'H',element_name:'Hydrogen',everyday_use:use,fun_fact:fact},t.colors,null,null,host);const issues=result.issues;host.remove();return issues;},{use,fact});assert.deepEqual(builtin,[]);
  assert.deepEqual(errors,[]);console.log('PASS: longer use/fact text, full-width fact, no overlap/clipping, matching print geometry, catalog layout, exact legacy upgrade preserving cards/crops/artwork/copies, and unknown-layout recovery protection.');
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
