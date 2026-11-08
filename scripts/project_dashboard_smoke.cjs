// NODE_PATH=/path/to/node_modules node scripts/project_dashboard_smoke.cjs
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-project-dashboard-'));
(async()=>{
  let browser;
  const server=cp.spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',path.join(root,'static-app')]);
  try{
    const port=await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{const match=String(data).match(/port (\d+)/);if(match)resolve(match[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
    const base='http://127.0.0.1:'+port;
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
    const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1400,height:1100}}),errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.route('**/projects/field-guide/manifest.json',async route=>{
      const response=await route.fetch(),manifest=await response.json();manifest.editableTemplates='url';manifest.teacherMetadata={keep:'unchanged'};
      await route.fulfill({response,json:manifest});
    });
    const ready=async(p=page)=>{await p.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await expect(p.locator('#recovery-error')).toBeHidden();await expect(p.locator('#page-error')).toBeEmpty();};
    const state=()=>page.evaluate(()=>localStorage.getItem('classroom-cards.static-first.v2:project:field-guide'));
    const archive=file=>JSON.parse(cp.execFileSync('python3',['-c','import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({"manifest":json.loads(z.read("manifest.json")),"files":z.namelist(),"csv":z.read("cards.csv").decode("utf-8-sig")}))',file],{encoding:'utf8'}));
    const save=async(p,selector,file)=>{const download=p.waitForEvent('download');await p.locator(selector).click();await (await download).saveAs(file);return archive(file);};
    await page.goto(base+'/?project=field-guide');await ready();await expect(page.locator('#project-dashboard-button')).toBeHidden();
    await page.locator('#fields [data-field=common_name]').fill('Class observation');const original=await state();
    await page.goto(base+'/?project=field-guide&dashboard=1');await ready();await expect(page.locator('#project-dashboard')).toBeVisible();
    await expect(page.locator('#project-dashboard-button')).toBeHidden();
    await page.locator('#pd-name').fill('Discard this');await page.locator('#pd-close').click();assert.equal(await state(),original,'closing the dashboard changes no card or project data');
    await page.goto(base+'/?project=field-guide&editTemplates=1');await ready();await expect(page.locator('#project-dashboard-button')).toBeVisible();
    await page.locator('#project-dashboard-button').click();await page.locator('#pd-name').fill('Our nature cards');await page.locator('#pd-id').fill('our-nature-cards');await page.locator('#pd-version').fill('2.1.0');await page.locator('#pd-description').fill('Observation cards for our class');
    await page.locator('#pd-access').selectOption('url');await page.locator('#pd-scheme').selectOption('Sky');
    await page.locator('#pd-fields').evaluate(el=>el.open=true);
    await page.locator('[data-setting=default][data-field=common_name]').fill('New observation');await page.locator('[data-setting=hint][data-field=common_name]').fill('Name your organism');
    await expect(page.locator('#pd-student-link')).toHaveValue(base+'/?project=our-nature-cards');await expect(page.locator('#pd-editor-link')).toHaveValue(base+'/?project=our-nature-cards&editTemplates=1');
    await page.locator('#pd-id').fill('Invalid ID');assert.equal(await page.locator('#pd-form').evaluate(el=>el.checkValidity()),false);
    await page.locator('#pd-id').fill('our-nature-cards');await page.locator('#pd-version').fill('2x1x0');assert.equal(await page.locator('#pd-form').evaluate(el=>el.checkValidity()),false);await page.locator('#pd-version').fill('2.1.0');
    assert.equal(await page.locator('#pd-form').evaluate(el=>el.checkValidity()),true);
    await page.locator('#pd-fields').evaluate(el=>el.open=false);
    await page.screenshot({path:'/tmp/card-project-dashboard-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#project-dashboard').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.screenshot({path:'/tmp/card-project-dashboard-mobile.png',fullPage:true});await page.setViewportSize({width:1400,height:1100});
    const zip=path.join(temp,'project.zip'),result=await save(page,'#pd-download',zip),m=result.manifest;
    assert.equal(m.name,'Our nature cards');assert.equal(m.id,'our-nature-cards');assert.equal(m.packageVersion,'2.1.0');assert.equal(m.editableTemplates,'url');assert.equal(m.starter.scheme,'Sky');assert.equal(m.starter.values.common_name,'New observation');assert.equal(m.placeholders.common_name,'Name your organism');assert.deepEqual(m.teacherMetadata,{keep:'unchanged'});assert.ok(result.files.includes(m.cardBack.svg));assert.ok(result.files.some(p=>p.startsWith('graphics/')));assert.ok(result.csv.includes('Class observation'));assert.equal(await state(),original,'downloading a copy leaves original recovery unchanged');
    await page.locator('#pd-open').click();await page.waitForURL('**/?local=*&dashboard=1&editTemplates=1');await ready();await expect(page.locator('#pd-name')).toHaveValue('Our nature cards');await page.locator('#pd-close').click();
    await expect(page.locator('.intro h1')).toHaveText('Our nature cards');await expect(page.locator('#fields [data-field=common_name]')).toHaveValue('Class observation');await expect(page.locator('#preview-card-select option')).toHaveCount(4);assert.equal(await state(),original);
    await page.locator('#new-card').click();await expect(page.locator('#fields [data-field=common_name]')).toHaveValue('New observation');await expect(page.locator('#fields [data-field=common_name]')).toHaveAttribute('placeholder','Name your organism');
    const resaved=await save(page,'#save-project',path.join(temp,'resaved.zip'));assert.equal(resaved.manifest.starter.values.common_name,'New observation');assert.equal(resaved.manifest.starter.scheme,'Sky');assert.equal(resaved.manifest.editableTemplates,'url');
    const localURL=new URL(page.url());localURL.searchParams.delete('dashboard');localURL.searchParams.delete('editTemplates');await page.goto(localURL.href);await ready();await expect(page.locator('#project-dashboard-button')).toBeHidden();await expect(page.locator('#build-template')).toBeDisabled();
    // The unrestricted studio can produce a new fixed-template project too.
    await page.goto(base+'/');await ready();await page.locator('#project-dashboard-button').click();await expect(page.locator('#pd-access')).toHaveValue('url');
    await page.locator('#pd-name').fill('New fixed project');await page.locator('#pd-id').fill('new-fixed-project');await page.locator('#pd-access').selectOption('false');await expect(page.locator('#pd-editor-link-row')).toBeHidden();
    await page.locator('#pd-open').click();await page.waitForURL('**/?local=*&dashboard=1');await ready();await expect(page.locator('#pd-name')).toHaveValue('New fixed project');await page.locator('#pd-close').click();await expect(page.locator('#build-template')).toBeDisabled();await expect(page.locator('#preview-card-select option')).toHaveCount(1);
    // Imported project copies can be authored offline after the worker has installed.
    const offline=await browser.newPage();offline.on('pageerror',err=>errors.push(err.message));await offline.goto(base+'/');await ready(offline);await offline.evaluate(()=>navigator.serviceWorker.ready);await offline.locator('#open-json').setInputFiles(zip);await offline.waitForURL('**/?local=*');await ready(offline);await offline.reload();await ready(offline);await offline.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await offline.context().setOffline(true);await offline.goto(offline.url()+'&dashboard=1&editTemplates=1');await ready(offline);await expect(offline.locator('#project-dashboard')).toBeVisible();await offline.locator('#pd-name').fill('Offline nature copy');const offlineSaved=await save(offline,'#pd-download',path.join(temp,'offline.zip'));assert.equal(offlineSaved.manifest.name,'Offline nature copy');
    await offline.locator('#pd-open').click();await offline.waitForURL('**/?local=*&dashboard=1&editTemplates=1');await ready(offline);await expect(offline.locator('#pd-name')).toHaveValue('Offline nature copy');
    assert.deepEqual(errors,[]);
    console.log('PASS: dashboard access, close/download isolation, manifest validation, project links, metadata/default/hint preservation, ZIP creation, independent local copy, new-card defaults, normal re-export, desktop/mobile sizing, and offline download/copy.');
  }finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(err=>{console.error(err);process.exitCode=1;});
