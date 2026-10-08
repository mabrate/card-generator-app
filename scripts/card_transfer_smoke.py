"""Editable SVG round trips, batch conflicts, validation, and untrusted markup."""
import json, shutil, socket, subprocess, sys, tempfile, zipfile, uuid
import xml.etree.ElementTree as ET
import mimetypes
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent.parent
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
server=subprocess.Popen([sys.executable,str(ROOT/'run.py'),'--host','127.0.0.1','--port',str(port)],cwd=ROOT,stdout=subprocess.DEVNULL)
try:
 with tempfile.TemporaryDirectory() as directory, sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('google-chrome') or None,headless=True)
  page=browser.new_page(service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{port}/?project=houston-food-web')
  expect(page.locator('#preview-card-select option')).to_have_count(22,timeout=60000)
  page.locator('#fields [data-field="common_name"]').fill('Tropical sage')
  page.locator('#crop-zoom').evaluate("el=>{el.value='1.5';el.dispatchEvent(new Event('input',{bubbles:true}));}")
  with page.expect_download() as d:page.locator('#download-svg').click()
  original_picture=page.locator('#card-preview').screenshot();svg=Path(d.value.path()).read_text();fixture=Path(directory)/'sage.svg';fixture.write_text(svg)
  # Module-level tests run in the browser's actual XML/image environment.
  result=page.evaluate('''async svg=>{
   const m=await import('./card-transfer.js');const file=text=>new File([text],'card.svg');
   const p=await m.parseCard(file(svg));let cards=[];for(let i=0;i<40;i++){let c=structuredClone(p.card);c.id=m.uniqueId(new Set(cards.map(x=>x.id)));m.insertCard(cards,c);}m.assertCards(cards);
   let rejected=0;try{m.insertCard(cards,cards[0]);}catch{rejected++;}
   for(const text of [svg.replace('"version":1','"version":99'),'<svg xmlns="http://www.w3.org/2000/svg"/>','<svg><metadata>bad</svg>'])try{await m.parseCard(file(text));}catch{rejected++;}
   const hostile=svg.replace('</svg>','<script>window.pwned=true</script><rect onload="window.pwned=true"/></svg>');await m.parseCard(file(hostile));
   return {rejected,count:cards.length,values:p.card.values,crop:p.card.crop,assets:p.assets};
  }''',svg)
  assert result['count']==40 and result['rejected']==4 and result['assets']['image'] and result['crop']['zoom']==1.5
  page.goto(f'http://127.0.0.1:{port}/')
  expect(page.locator('#fields')).to_be_visible()
  page.locator('#import-cards').click();page.locator('#card-svg-files').set_input_files(fixture)
  expect(page.locator('.card-import-row')).to_have_count(1)
  page.locator('#card-import-expansion').fill('Sage expansion');page.locator('#confirm-card-import').click()
  expect(page.locator('#card-import-result')).to_contain_text('1 added')
  page.get_by_role('button',name='Close',exact=True).click()
  page.once('dialog',lambda d:d.dismiss());page.locator('#delete-card').click();expect(page.locator('#preview-card-select option')).to_have_count(2)
  page.once('dialog',lambda d:d.accept());page.locator('#delete-card').click();expect(page.locator('#preview-card-select option')).to_have_count(1)
  expect(page.locator('#delete-card')).to_be_disabled()
  page.reload();expect(page.locator('#preview-card-select option')).to_have_count(1)
  page.locator('#next-card').click()
  expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Tropical sage')
  Path('/tmp/card-before.png').write_bytes(original_picture);Path('/tmp/card-after.png').write_bytes(page.locator('#card-preview').screenshot())
  from PIL import Image, ImageChops, ImageStat
  a,b=Image.open('/tmp/card-before.png').convert('RGB'),Image.open('/tmp/card-after.png').convert('RGB')
  assert a.size==b.size and max(ImageStat.Stat(ImageChops.difference(a,b)).mean)<2, 'Rendered appearance changed on import'
  page.locator('#template-select').select_option('field-guide');expect(page.locator('#fields [data-field="mechanic_1"]')).to_have_count(0)
  page.locator('#template-select').select_option('food-web');expect(page.locator('#fields [data-field="mechanic_1"]')).to_have_count(1)
  page.locator('#fields [data-field="common_name"]').fill('Edited sage')
  with page.expect_download() as d:page.locator('#save-project').click()
  archive=Path(directory)/'project.zip';d.value.save_as(archive)
  # Serve the exported archive as a hosted project via request interception.
  with zipfile.ZipFile(archive) as z: bundled={name:z.read(name) for name in z.namelist()}
  hosted=browser.new_page(service_workers='block')
  def serve_export(route):
   name=route.request.url.split('/projects/transfer-test/',1)[1]
   route.fulfill(status=200 if name in bundled else 404,body=bundled.get(name,b''),content_type=mimetypes.guess_type(name)[0] or 'application/octet-stream')
  hosted.route('**/projects/transfer-test/**',serve_export)
  hosted.goto(f'http://127.0.0.1:{port}/?project=transfer-test')
  expect(hosted.locator('#fields [data-field="common_name"]')).to_have_value('Edited sage',timeout=60000)
  expect(hosted.locator('#card-position')).to_contain_text('Sage expansion')
  hosted.close()
  page.locator('#open-json').set_input_files(archive)
  expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Edited sage')
  expect(page.locator('#card-position')).to_contain_text('Sage expansion')
  with page.expect_download() as d:page.locator('#download-svg').click()
  again=Path(d.value.path()).read_text()
  differences=page.evaluate('''async ([before,after])=>{const m=await import('./card-transfer.js');const a=await m.parseCard(new File([before],'before.svg')),b=await m.parseCard(new File([after],'after.svg'));a.card.values.common_name='Edited sage';const x=JSON.parse(m.normalized(a)),y=JSON.parse(m.normalized(b));const diff=(a,b,path='')=>{if(JSON.stringify(a)===JSON.stringify(b))return [];if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],path+'.'+k));return [path];};return diff(x,y);}''',[svg,again])
  assert not differences, differences
  new=Path(directory)/'edited.svg';new.write_text(again)
  page.locator('#import-cards').click();page.locator('#card-svg-files').set_input_files(new)
  expect(page.locator('.card-import-row')).to_contain_text('Already present')
  page.locator('#confirm-card-import').click();expect(page.locator('#card-import-result')).to_contain_text('1 skipped')
  page.locator('#card-svg-files').set_input_files(fixture)
  expect(page.locator('.card-import-row')).to_contain_text('ID conflict')
  page.locator('.card-import-row select').select_option('replace');page.locator('#confirm-card-import').click()
  expect(page.locator('#card-import-result')).to_contain_text('1 replaced')
  page.locator('#card-svg-files').set_input_files(fixture);page.locator('.card-import-row select').select_option('add');page.locator('#confirm-card-import').click()
  expect(page.locator('#card-import-result')).to_contain_text('1 added')
  # Forty distinct file objects with identical IDs exercise intra-batch review.
  files=[]
  for i in range(40):
   f=Path(directory)/f'card-{i}.svg';f.write_text(again);files.append(f)
  page.locator('#card-svg-files').set_input_files(files);expect(page.locator('.card-import-row')).to_have_count(40,timeout=60000)
  page.locator('#confirm-card-import').click();expect(page.locator('#card-import-result')).to_contain_text('40 skipped')
  # Accept a full batch as new UUIDs, then undo it.
  page.locator('#card-svg-files').set_input_files(files);expect(page.locator('.card-import-row')).to_have_count(40,timeout=60000)
  page.locator('.card-import-row select').evaluate_all("els=>els.forEach(el=>{el.value='add';el.dispatchEvent(new Event('change'));})")
  page.locator('#confirm-card-import').click();expect(page.locator('#card-import-result')).to_contain_text('40 added',timeout=60000)
  page.locator('#undo-card-import').click();expect(page.locator('#card-import-result')).to_contain_text('undone')
  # Different content sharing a new ID inside one batch stays non-destructive.
  root=ET.fromstring(svg);metadata=root.find('{http://www.w3.org/2000/svg}metadata');payload=json.loads(metadata.text);payload['card']['id']=str(uuid.uuid4())
  pair=[]
  for i in range(2):
   payload['card']['values']['common_name']=f'Batch sage {i}';metadata.text=json.dumps(payload)
   f=Path(directory)/f'conflict-{i}.svg';f.write_text(ET.tostring(root,encoding='unicode'));pair.append(f)
  page.locator('#card-svg-files').set_input_files(pair);expect(page.locator('.card-import-row')).to_have_count(2)
  expect(page.locator('.card-import-row').nth(1)).to_contain_text('ID conflict')
  page.locator('#confirm-card-import').click();expect(page.locator('#card-import-result')).to_contain_text('1 added, 0 replaced, 1 skipped')
  # Mixed good/invalid files and active content in both outer SVG and layout.
  root=ET.fromstring(svg);metadata=root.find('{http://www.w3.org/2000/svg}metadata');payload=json.loads(metadata.text);payload['card']['id']=str(uuid.uuid4())
  payload['card']['layout']=payload['card']['layout'].replace('</svg>','<script>window.pwned=true</script><rect onload="window.pwned=true"/></svg>');metadata.text=json.dumps(payload)
  hostile=Path(directory)/'hostile.svg';hostile.write_text(ET.tostring(root,encoding='unicode').replace('</ns0:svg>','<script xmlns="http://www.w3.org/2000/svg">window.pwned=true</script></ns0:svg>'))
  invalid=Path(directory)/'legacy.svg';invalid.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
  page.locator('#card-svg-files').set_input_files([hostile,invalid]);expect(page.locator('.card-import-row')).to_have_count(2)
  expect(page.locator('.card-import-row').nth(1)).to_contain_text('Re-export')
  page.locator('#confirm-card-import').click();expect(page.locator('#card-import-result')).to_contain_text('1 added, 0 replaced, 0 skipped, 1 invalid')
  assert page.locator('.import-thumbnail script').count()==0 and page.locator('.import-thumbnail [onload]').count()==0
  assert not page.evaluate('window.pwned') and not errors,errors
  browser.close();print('Card transfer browser smoke passed: round trip, assets, edit/save/reopen, 40-file batch, skip/replace/add, XML/version validation, script isolation.')
finally:server.terminate();server.wait()
