"""Validate the new content pack through the real static editor and export UI."""
import csv
import io
import json
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / 'static-app/projects/houston-foundation-garden'
with (PACK/'cards.csv').open(encoding='utf-8-sig',newline='') as f:
    rows=list(csv.DictReader(f))
with (ROOT/'static-app/projects/houston-food-web/cards.csv').open(encoding='utf-8-sig',newline='') as f:
    base_rows=list(csv.DictReader(f))
assert len(rows)==15 and sum(int(r['copies']) for r in rows)==38
assert len({r['card_id'] for r in rows})==15
assert not {r['card_id'] for r in rows}&{r['card_id'] for r in base_rows}
for row in rows:
    assert uuid.UUID(row['card_id']).version==4
    data=(PACK/'graphics'/row['image_filename']).read_bytes()
    width,height=struct.unpack('>II',data[16:24])
    at=data.index(b'pHYs');xppm,yppm,unit=struct.unpack('>IIB',data[at+4:at+13])
    assert unit==1 and abs(width/xppm*1000-54)<.01 and abs(height/yppm*1000-34)<.01
    svg=ET.fromstring((PACK/'graphics'/(Path(row['image_filename']).stem+'-54x34mm.svg')).read_text())
    assert svg.get('width')=='54mm' and svg.get('height')=='34mm'
    assert svg.find('{http://www.w3.org/2000/svg}image').get('href').startswith('data:image/png;base64,')
provenance=json.loads((PACK/'graphics/prompts.json').read_text())
assert len(provenance['artworks'])==15 and all(p['prompt'] for p in provenance['artworks'])

with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
origin=f'http://127.0.0.1:{port}'
server=subprocess.Popen([sys.executable,str(ROOT/'run.py'),'--port',str(port)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 with tempfile.TemporaryDirectory() as directory, sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('google-chrome') or None,headless=True)
    page=browser.new_page(service_workers='block',viewport={'width':1300,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def state():
        return page.evaluate("JSON.parse(localStorage.getItem('classroom-cards.static-first.v2:project:'+(new URLSearchParams(location.search).get('local')?'local-'+new URLSearchParams(location.search).get('local'):new URLSearchParams(location.search).get('project'))))")
    page.goto(origin+'/?project=houston-foundation-garden')
    expect(page.locator('#preview-card-select option')).to_have_count(15,timeout=120000)
    original=state();assert sum(c['copies'] for c in original['cards'])==38
    assert all(c['attribution'] and c['sourceProjectId']=='houston-foundation-garden' for c in original['cards'])
    artwork_panels=[]
    for index,row in enumerate(rows):
        page.locator('#preview-card-select').select_option(str(index))
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value(row['common_name'])
        expect(page.locator('#fields')).to_be_visible()
        assert not page.locator('#fit-issues').inner_text().strip(),(row['common_name'],page.locator('#fit-issues').inner_text())
        expect(page.locator('#download-svg')).to_be_enabled()
        dimensions=page.locator('#card-preview rect[data-image]').first.evaluate("e=>[+e.getAttribute('width')*63.5/180,+e.getAttribute('height')*63.5/180]")
        assert abs(dimensions[0]-54)<1e-8 and abs(dimensions[1]-34)<1e-8
        # Verify actual rendered text boxes do not overlap the next field.
        boxes=page.locator('#card-preview').evaluate("el=>Object.fromEntries(['mechanic_1','mechanic_2','extra_info'].map(k=>{const b=el.querySelector('[data-field='+k+']').getBBox();return [k,{top:b.y,bottom:b.y+b.height}]}))")
        if row['mechanic_2']: assert boxes['mechanic_1']['bottom']<boxes['mechanic_2']['top'],(row['common_name'],boxes)
        assert max(boxes['mechanic_1']['bottom'],boxes['mechanic_2']['bottom'])<boxes['extra_info']['top'],(row['common_name'],boxes)
        artwork_panels.append(page.locator('#card-preview svg').evaluate('e=>e.outerHTML'))
    contact=browser.new_page(viewport={'width':1500,'height':2400})
    contact.set_content('<style>body{margin:20px;background:#eee}main{display:grid;grid-template-columns:repeat(5,280px);gap:16px}svg{width:280px;height:392px}</style><main>'+''.join(artwork_panels)+'</main>')
    contact.locator('svg image').evaluate_all("async es=>{await Promise.all(es.map(e=>new Promise(r=>{const i=new Image;i.onload=r;i.onerror=r;i.src=e.getAttribute('href')})))}")
    contact.locator('main').screenshot(path='/tmp/foundation-garden-cards.png')
    contact.close()
    with page.expect_popup() as popup:page.locator('#print-sheets').click()
    printed=popup.value
    expect(printed.locator('#print')).to_be_enabled(timeout=120000)
    expect(printed.locator('.fronts svg[data-title]')).to_have_count(38)
    expect(printed.locator('[data-card-back]')).to_have_count(38)
    expect(printed.locator('.sheet')).to_have_count(14)
    printed.close()
    page.locator('#preview-card-select').select_option('1')
    with page.expect_download() as d:page.locator('#download-svg').click()
    card_xml=ET.fromstring(Path(d.value.path()).read_text())
    metadata=json.loads(card_xml.find('{http://www.w3.org/2000/svg}metadata').text)
    assert metadata['card']['id']==rows[1]['card_id']
    assert metadata['assets']['image'].startswith('data:image/png;base64,')
    assert metadata['card']['attribution']
    with page.expect_download() as d:page.locator('#save-project').click()
    saved=Path(directory)/'garden.zip';d.value.save_as(saved)
    with zipfile.ZipFile(saved) as z:
        manifest=json.loads(z.read('manifest.json'))
        assert manifest['expansion']['baseProjectId']=='houston-food-web'
        saved_rows=list(csv.DictReader(io.StringIO(z.read(manifest['csv']).decode('utf-8-sig'))))
        assert [r['card_id'] for r in saved_rows]==[r['card_id'] for r in rows]
        assert 'garden-rules.md' in z.namelist() and 'graphics/prompts.json' in z.namelist()
        assert len([f for f in z.namelist() if f.startswith('graphics/') and f.endswith('.png')])>=15
    page.goto(origin)
    page.locator('#open-project').click()
    page.locator('#open-json').set_input_files(saved)
    expect(page.locator('#preview-card-select option')).to_have_count(15,timeout=120000)
    reopened=state()
    assert [c['id'] for c in reopened['cards']]==[c['id'] for c in original['cards']]
    for before,after in zip(original['cards'],reopened['cards']):
        # Saving canonically resolves image paths and normalizes palette names.
        for key,value in before['values'].items():
            if key not in ['image_filename','theme']:
                assert after['values'].get(key)==value,(before['values']['common_name'],key,value,after['values'].get(key))
        assert after['copies']==before['copies']
    assert all(c['attribution'] and c['imageName'] for c in reopened['cards'])
    page.goto(origin)
    page.locator('#project-folder').set_input_files(PACK)
    expect(page.locator('#preview-card-select option')).to_have_count(15,timeout=120000)
    assert [c['id'] for c in state()['cards']]==[r['card_id'] for r in rows]
    page.goto(origin+'/?project=houston-food-web')
    expect(page.locator('#preview-card-select option')).to_have_count(22,timeout=120000)
    base=state()
    page.get_by_role('button',name='Add Houston Foundation Garden',exact=True).click()
    expect(page.locator('.card-import-row')).to_have_count(15,timeout=120000)
    assert page.locator('.card-import-row.invalid').count()==0,page.locator('#card-import-review').inner_text()
    assert len(state()['cards'])==22
    page.locator('#confirm-card-import').click()
    expect(page.locator('#card-import-result')).to_contain_text('15 added, 0 replaced',timeout=120000)
    page.locator('#import-cards-dialog').get_by_role('button',name='Close',exact=True).click()
    combined=state();assert len(combined['cards'])==37 and sum(c['copies'] for c in combined['cards'])==86
    assert combined['cards'][:22]==base['cards']
    assert combined['expansionPacks']['houston-foundation-garden']['packageVersion']=='1.0.0'
    # Local garden layouts retain 54 x 34 mm panels when appended to base layout.
    page.locator('#preview-card-select').select_option('23')
    expect(page.locator('#download-svg')).to_be_enabled()
    assert 'Spread Underground' in page.locator('#card-preview').inner_text()
    page.get_by_role('button',name='Add Houston Foundation Garden',exact=True).click()
    expect(page.locator('.card-import-row')).to_have_count(15,timeout=120000)
    page.locator('#confirm-card-import').click()
    expect(page.locator('#card-import-result')).to_contain_text('0 added, 0 replaced, 15 skipped',timeout=120000)
    assert len(state()['cards'])==37 and not errors,errors
    page.locator('#import-cards-dialog').get_by_role('button',name='Close',exact=True).click()
    with page.expect_download() as d:page.locator('#save-project').click()
    combined_zip=Path(directory)/'combined.zip';d.value.save_as(combined_zip)
    page.goto(origin)
    page.locator('#open-project').click();page.locator('#open-json').set_input_files(combined_zip)
    expect(page.locator('#preview-card-select option')).to_have_count(37,timeout=120000)
    assert sum(c['copies'] for c in state()['cards'])==86
    assert state()['expansionPacks']['houston-foundation-garden']['packageVersion']=='1.0.0'
    browser.close()
    print('PASS: 15 UUID cards / 38 copies, 15 embedded 54x34 mm artworks, all text fits, attribution, hosted loading, SVG metadata export, project ZIP save/reopen, base append without replacement, 37 cards / 86 copies, repeated import skips, no browser errors. Contact sheet: /tmp/foundation-garden-cards.png')
finally:
 server.terminate();server.wait()
