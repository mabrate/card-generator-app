// NODE_PATH=/path/to/node_modules node scripts/template_access_smoke.cjs
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-template-access-'));
(async()=>{
  let browser;
  const server=cp.spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',path.join(root,'static-app')]);
  try{
    const port=await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{const match=String(data).match(/port (\d+)/);if(match)resolve(match[1]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
    const base='http://127.0.0.1:'+port;
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
    const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    let mode='url';
    await page.route('**/projects/field-guide/manifest.json',async route=>{
      const response=await route.fetch(),manifest=await response.json();
      if(mode===undefined)delete manifest.editableTemplates;else manifest.editableTemplates=mode;
      await route.fulfill({response,json:manifest});
    });
    const ready=async()=>{await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await expect(page.locator('#recovery-error')).toBeHidden();await expect(page.locator('#page-error')).toBeEmpty();};
    const visit=async params=>{await page.goto(base+'/?project=field-guide'+params);await ready();};
    await visit('');
    await expect(page.locator('#build-template')).toBeDisabled();
    await expect(page.locator('#template-tools .open-project')).toBeHidden();
    await expect(page.locator('#project-layout-tools')).toBeHidden();
    await page.locator('#fields [data-field=common_name]').fill('Student observation');
    for(const param of ['&editTemplates=0','&editTemplates=true','&editTemplates=']){await visit(param);await expect(page.locator('#build-template')).toBeDisabled();}
    await visit('&editTemplates=1');await expect(page.locator('#build-template')).toBeEnabled();
    await expect(page.locator('#template-tools .open-project')).not.toBeHidden();
    await expect(page.locator('#project-layout-tools')).toBeVisible();
    const edit=async title=>{await page.locator('#build-template').click();await page.locator('#tb-name').fill(title);await page.locator('#tb-name').dispatchEvent('change');await page.locator('#tb-apply').click();await expect(page.locator('#template-builder')).toHaveCount(0);};
    await edit('Teacher front');await page.locator('#edit-back').click();await edit('Teacher back');
    await visit('');await expect(page.locator('#build-template')).toBeDisabled();
    await expect(page.locator('#template-title')).toHaveText('Teacher front');
    await expect(page.locator('#fields [data-field=common_name]')).toHaveValue('Student observation');
    await page.locator('#edit-back').click();await expect(page.locator('#template-title')).toHaveText('Teacher back');
    await page.locator('#svg-file').setInputFiles({name:'blocked.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 252" data-title="Blocked upload"><text x="10" y="20" data-field="common_name">Name</text></svg>')});
    await expect(page.locator('#template-title')).toHaveText('Teacher back');
    await expect(page.locator('#recovery-error')).toBeHidden();
    const zip=path.join(temp,'project.zip'),download=page.waitForEvent('download');await page.locator('#save-project').click();await (await download).saveAs(zip);
    const manifest=JSON.parse(cp.execFileSync('python3',['-c','import json,sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("manifest.json").decode())',zip],{encoding:'utf8'}));
    assert.equal(manifest.editableTemplates,'url','saving a locked link preserves the URL policy');
    await page.locator('#open-json').setInputFiles(zip);await page.waitForURL('**/?local=*');await ready();
    await expect(page.locator('#build-template')).toBeDisabled();await expect(page.locator('#template-title')).toHaveText('Teacher front');
    await page.goto(page.url()+'&editTemplates=1');await ready();await expect(page.locator('#build-template')).toBeEnabled();
    const download2=page.waitForEvent('download');await page.locator('#save-project').click();const zip2=path.join(temp,'unlocked.zip');await (await download2).saveAs(zip2);
    assert.equal(JSON.parse(cp.execFileSync('python3',['-c','import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("manifest.json").decode())',zip2],{encoding:'utf8'})).editableTemplates,'url','the editing link never exports an always-editable policy');
    // Boolean modes remain compatible; query parameters cannot override a fixed project.
    await page.evaluate(()=>localStorage.clear());
    for(const fixed of [false,undefined]){mode=fixed;await visit('&editTemplates=1');await expect(page.locator('#build-template')).toBeDisabled();}
    mode=true;await visit('');await expect(page.locator('#build-template')).toBeEnabled();
    mode='invalid';await page.reload();await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await expect(page.locator('#page-error')).toContainText('editableTemplates must be');
    await page.goto(base+'/');await ready();await expect(page.locator('#build-template')).toBeEnabled();
    assert.deepEqual(errors,[]);
    console.log('PASS: URL opt-in, exact parameter matching, disabled upload/reload, editable card data, front/back editing, locked recovery, ZIP policy preservation, local reopening, boolean compatibility, invalid policy rejection, and unrestricted editor.');
  }finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(err=>{console.error(err);process.exitCode=1;});
