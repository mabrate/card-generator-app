"""Published project URLs seed CSV and artwork without replacing saved edits."""
import csv, io, json, os, shutil, socket, subprocess, sys, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
origin=f'http://127.0.0.1:{port}'
url=origin+'/?project=houston-food-web'
server=subprocess.Popen([sys.executable,'run.py','--port',str(port)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    with sync_playwright() as p, tempfile.TemporaryDirectory() as directory:
        browser=p.chromium.launch(executable_path=shutil.which('google-chrome') or None,headless=True)
        context=browser.new_context()
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        pending=[]
        page.route('**/projects/houston-food-web/cards.csv',lambda route:pending.append(route))
        with page.expect_request('**/projects/houston-food-web/cards.csv'):
            page.goto(url,wait_until='domcontentloaded')
        expect(page.locator('#app-loading')).to_be_visible()
        expect(page.locator('#loading-message')).to_contain_text('Loading project cards')
        expect(page.locator('#save-project')).to_be_disabled()
        pending[0].continue_()
        page.unroute('**/projects/houston-food-web/cards.csv')
        expect(page.locator('#card-select option')).to_have_count(22,timeout=60000)
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Aquatic Milkweed')
        expect(page.locator('#card-copies')).to_have_value('4')
        expect(page.locator('#card-preview image')).to_have_attribute('href',__import__('re').compile('data:image/'))
        state=page.evaluate("JSON.parse(localStorage.getItem('classroom-cards.static-first.v2:project:houston-food-web'))")
        assert sum(c['copies'] for c in state['cards'])==48
        assert state['cards'][0]['id']=='aquatic-milkweed'
        assert state['cards'][0]['values']['scientific_name']=='Asclepias perennis'
        expect(page.locator('#app-loading')).to_be_hidden()
        legacy=json.loads(json.dumps(state))
        legacy['templateSVG']=legacy['templateSVG'].replace('id="scientific_name"','id="binomial_name"').replace('data-field="scientific_name"','data-field="binomial_name"').replace('data-label="Scientific name"','data-label="Binomial Name"')
        legacy['cards'][0]['values']['binomial_name']=legacy['cards'][0]['values'].pop('scientific_name')
        legacy['cards'][0]['values']['common_name']='Preserved edit'
        legacy['imported']['mapping']['binomial_name']=legacy['imported']['mapping'].pop('scientific_name')
        page.evaluate("s=>localStorage.setItem('classroom-cards.static-first.v2:project:houston-food-web',JSON.stringify(s))",legacy)
        page.reload()
        expect(page.locator('#fields [data-field="scientific_name"]')).to_have_value('Asclepias perennis')
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Preserved edit')
        page.locator('#fields [data-field="common_name"]').fill('Aquatic Milkweed')
        page.evaluate("async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));}")
        context.set_offline(True);page.reload()
        expect(page.locator('#card-select option')).to_have_count(22)
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Aquatic Milkweed')
        context.set_offline(False)
        # An old blank checkpoint migrates, while edited work is never replaced.
        blank=json.loads(json.dumps(state));blank['cards']=[{**state['cards'][0],'id':'old-blank','values':{},'copies':1,'colors':None,'csvImportId':None,'imageName':''}]
        blank['assets']={};blank['imported']=None;blank.pop('projectDataInitialized')
        key='classroom-cards.static-first.v2:project:houston-food-web'
        page.evaluate('([key,state])=>localStorage.setItem(key,JSON.stringify(state))',[key,blank])
        page.reload();expect(page.locator('#card-select option')).to_have_count(22,timeout=60000)
        page.locator('#fields [data-field="common_name"]').fill('My edited milkweed')
        page.reload();expect(page.locator('#fields [data-field="common_name"]')).to_have_value('My edited milkweed')
        expect(page.locator('#card-select option')).to_have_count(22)
        # Published resources, CSV name and graphics survive a downloaded ZIP.
        try:
            with page.expect_download(timeout=60000) as download:page.locator('#save-project').click()
        except Exception:
            raise AssertionError(page.locator('#page-error').inner_text())
        archive=Path(directory)/'project.zip';download.value.save_as(archive)
        with zipfile.ZipFile(archive) as z:
            manifest=json.loads(z.read('manifest.json'));assert manifest['csv']=='cards.csv'
            rows=list(csv.DictReader(io.StringIO(z.read('cards.csv').decode('utf-8-sig'))))
            assert len(rows)==22 and rows[0]['common_name']=='My edited milkweed'
            assert rows[0]['image_filename']=='graphics/aquatic-milkweed.png'
            assert 'aquatic-milkweed.png' not in z.namelist()
        # First project visit also caches its manifest/template for offline recovery.
        page.evaluate("async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));}")
        context.set_offline(True);page.reload()
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('My edited milkweed')
        expect(page.locator('#card-select option')).to_have_count(22)
        context.set_offline(False)
        # Explicit Start fresh stays blank on reload; auto-seeding is not repeated.
        page.once('dialog',lambda d:d.accept());page.locator('#start-over').click()
        expect(page.locator('#card-switcher')).to_be_hidden()
        page.reload();expect(page.locator('#card-switcher')).to_be_hidden()
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('')
        assert not errors,errors
        browser.close()
        print('PASS: published deck/images, 22 cards/48 copies, blank-checkpoint upgrade, saved edits, ZIP paths, first-visit offline recovery, explicit reset preservation.')
finally:
    server.terminate();server.wait()
