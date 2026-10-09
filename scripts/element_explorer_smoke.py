"""Exercise conditional colors through preview, print, SVG, and project ZIP restore."""
import csv,io,json,shutil,socket,subprocess,sys,tempfile,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent
PACK=ROOT/'static-app/projects/element-explorer'
manifest=json.loads((PACK/'manifest.json').read_text())
rows=list(csv.DictReader((PACK/'cards.csv').open()))
assert len(rows)==20 and len({r['card_id'] for r in rows})==20
assert all((PACK/'graphics'/r['image_filename']).is_file() for r in rows)
family_colors={r['equals']:r['colors']['family_strip'] for r in manifest['colorRules']}
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
origin=f'http://127.0.0.1:{port}'
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(ROOT/'static-app')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 with sync_playwright() as p,tempfile.TemporaryDirectory() as tmp:
  browser=p.chromium.launch(executable_path=shutil.which('google-chrome'),headless=True)
  page=browser.new_page(service_workers='block',viewport={'width':1300,'height':1000});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def ready(pg):pg.wait_for_function("document.querySelector('main').getAttribute('aria-busy')==='false'")
  def strip(pg):return pg.locator('#card-preview rect[data-color-fill=family_strip]').get_attribute('fill')
  page.goto(origin+'/?project=element-explorer');ready(page)
  expect(page.locator('#preview-card-select option')).to_have_count(20)
  assert 'Hydrogen' in page.locator('#preview-card-select option').first.inner_text()
  for i,row in enumerate(rows):
   page.locator('#preview-card-select').select_option(str(i));ready(page)
   assert strip(page)==family_colors[row['family']],row['element_name']
   assert not page.locator('#fit-issues').inner_text().strip(),(row['element_name'],page.locator('#fit-issues').inner_text())
   assert page.locator('#card-preview #background').get_attribute('fill')=='#ffffff'
   assert page.locator('#card-preview #border').get_attribute('stroke')=='#555555'
   assert page.locator('#card-preview [data-field=element_name]').get_attribute('fill')=='#222222'
   assert page.locator('#card-preview image').count()==1
  print('Checked 20 cards',flush=True)
  page.locator('#preview-card-select').select_option('0');ready(page)
  page.locator('#fields [data-field=family]').fill('  NOBLE GAS  ')
  assert strip(page)=='#70448c'
  page.locator('#fields [data-field=family]').fill('unknown');assert strip(page)=='#555555'
  page.locator('#fields [data-field=family]').fill('');assert strip(page)=='#555555'
  page.locator('#fields [data-field=family]').fill('Noble gas')
  page.locator('#appearance-tools').evaluate('el=>el.open=true')
  page.locator('[data-scheme=Ink]').click();assert strip(page)=='#555555'
  expect(page.locator('#use-automatic-colors')).to_be_visible()
  page.locator('#fields [data-field=family]').fill('Halogen');assert strip(page)=='#555555'
  page.locator('#use-automatic-colors').click();assert strip(page)=='#a23860'
  page.reload();ready(page);assert strip(page)=='#a23860'
  print('Checked editing and manual reset',flush=True)
  with page.expect_popup() as popup:page.locator('#print-sheets').click()
  sheet=popup.value;expect(sheet.locator('#print')).to_be_enabled(timeout=30000)
  strips=sheet.locator('rect[data-color-fill=family_strip]')
  assert strips.count()==20 and strips.first.get_attribute('fill')=='#a23860'
  assert sheet.locator('rect[data-color-fill=background]').first.get_attribute('fill')=='#ffffff';sheet.close()
  with page.expect_download() as dl:page.locator('#download-svg').click()
  svg=Path(dl.value.path()).read_text();assert '#a23860' in svg and 'finished-card' in svg
  with page.expect_download() as dl:page.locator('#save-project').click()
  backup=Path(dl.value.path()).read_bytes()
  with zipfile.ZipFile(io.BytesIO(backup)) as z:
   saved=json.loads(z.read('manifest.json'));assert saved['colorRules']==manifest['colorRules']
   saved_rows=list(csv.DictReader(io.StringIO(z.read('cards.csv').decode('utf-8-sig'))));assert all(r['theme']=='' for r in saved_rows)
   workspace=json.loads(z.read('workspace.json'));assert all('colors' not in c for c in workspace['cards'].values())
  print('Checked print, SVG and ZIP contents',flush=True)
  fresh=browser.new_context(service_workers='block');restored=fresh.new_page();restored.goto(origin);ready(restored)
  restored.locator('#open-json').set_input_files({'name':'elements.zip','mimeType':'application/zip','buffer':backup})
  expect(restored.locator('.intro h1')).to_have_text('Element Explorer');ready(restored);assert strip(restored)=='#a23860'
  restored.locator('#fields [data-field=family]').fill('Alkali metal');assert strip(restored)=='#a84b16'
  print('Checked automatic ZIP restore',flush=True)
  # An explicit CSV/manual override must survive ZIP export and reopening.
  restored.locator('#appearance-tools').evaluate('el=>el.open=true');restored.locator('[data-scheme=Ink]').click()
  with restored.expect_download() as dl:restored.locator('#save-project').click()
  manual=Path(dl.value.path()).read_bytes()
  with zipfile.ZipFile(io.BytesIO(manual)) as z:
   records=list(csv.DictReader(io.StringIO(z.read('cards.csv').decode('utf-8-sig'))));assert records[0]['theme']=='Ink' and records[1]['theme']==''
  previous_url=restored.url
  restored.locator('#open-json').set_input_files({'name':'manual.zip','mimeType':'application/zip','buffer':manual})
  restored.wait_for_url(lambda url:str(url)!=previous_url);ready(restored)
  expect(restored.locator('#fields [data-field=family]')).to_have_value('Alkali metal');assert strip(restored)=='#555555'
  restored.locator('#appearance-tools').evaluate('el=>el.open=true');restored.locator('#use-automatic-colors').click();assert strip(restored)=='#a84b16'
  restored.locator('#card-preview').screenshot(path='/tmp/element-explorer-project.png')
  print('Checked manual ZIP restore',flush=True)
  offline=browser.new_context();offline_page=offline.new_page();offline_page.goto(origin+'/?project=element-explorer');ready(offline_page)
  offline_page.evaluate('async()=>{await navigator.serviceWorker.ready;}')
  offline_page.wait_for_function('navigator.serviceWorker.controller!==null')
  offline.set_offline(True);offline_page.reload();ready(offline_page)
  expect(offline_page.locator('#preview-card-select option')).to_have_count(20)
  offline_page.locator('#fields [data-field=family]').fill('Noble gas');assert strip(offline_page)=='#70448c'
  assert offline_page.locator('#card-preview image').count()==1
  assert not errors,errors
  print('PASS: 20 cards, Ink body, automatic edits/fallback, manual reset, reload, 20-card print, SVG export, automatic and manual ZIP round trips, offline reload.')
  browser.close()
finally:server.terminate();server.wait()
