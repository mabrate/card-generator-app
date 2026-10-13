"""Review Field Guide sides, matching starter recovery, print, and project ZIP round trip."""
import sys,socket,subprocess,shutil,json,zipfile,csv,io
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parent.parent
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root/'static-app')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('google-chrome'),headless=True)
  page=browser.new_page(service_workers='block',viewport={'width':1400,'height':1150});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{port}/?project=field-guide');page.wait_for_function("document.querySelector('main').getAttribute('aria-busy')==='false'")
  expect(page.locator('#card-position')).to_contain_text('of 4')
  for i,name in enumerate(['Ladybug','Green Anole','Texas Bluebonnet','Field Madder']):
   if i:page.locator('#next-card').click()
   expect(page.locator('#card-preview [data-field=common_name]')).to_contain_text(name)
   assert not page.locator('#fit-issues').inner_text().strip(),page.locator('#fit-issues').inner_text()
   assert page.locator('#card-preview image').count()==1
   expect(page.locator('#card-preview #border')).to_have_attribute('stroke-width','5.669291')
   expect(page.locator('#card-preview')).to_contain_text('The Village School Field Guide')
   assert page.locator('#card-preview [data-field=family]').text_content().strip().startswith('(')
   checkbox=page.locator('#fields [data-field=native]');expect(checkbox).to_have_attribute('type','checkbox')
   assert checkbox.is_checked()==(i in [1,2])
   assert page.locator('#card-preview #native-badge').count()==int(i in [1,2])
   checkbox.set_checked(i not in [1,2]);assert page.locator('#card-preview #native-badge').count()==int(i not in [1,2])
   checkbox.set_checked(i in [1,2])
   if i==2:
    with page.expect_download() as exported:page.locator('#download-svg').click()
    exported.value.save_as('/tmp/bluebonnet-native.svg');assert 'id="native-badge"' in Path('/tmp/bluebonnet-native.svg').read_text()
   page.locator('#card-preview').screenshot(path=f'/tmp/field-guide-{i}-front.png')
   page.locator('#preview-back').click();expect(page.locator('#fields [data-field=size]')).to_be_visible()
   assert page.locator('#card-preview #native-badge').count()==int(i in [1,2])
   assert not page.locator('#fit-issues').inner_text().strip(),(name,page.locator('#fit-issues').inner_text())
   assert page.locator('#card-preview image').count()==1
   expect(page.locator('#card-preview #border')).to_have_attribute('stroke-width','5.669291')
   expect(page.locator('#card-preview')).to_contain_text('The Village School Field Guide')
   page.locator('#card-preview').screenshot(path=f'/tmp/field-guide-{i}-back.png')
   page.locator('#preview-front').click()
  expect(page.locator('#fields [data-field=common_name]')).to_be_enabled()
  page.evaluate("window.previewImage=document.querySelector('#card-preview image')");page.locator('#fields [data-field=common_name]').fill('Field Madder study');assert page.evaluate("window.previewImage===document.querySelector('#card-preview image')")
  page.locator('#fields [data-field=common_name]').fill('Field Madder')
  page.locator('#preview-back').click();page.locator('#image-adjustments').evaluate('e=>e.open=true')
  page.locator('#crop-zoom').fill('0.5');page.locator('#crop-zoom').dispatch_event('input')
  expect(page.locator('#card-preview image')).to_have_attribute('preserveAspectRatio','xMidYMid slice')
  page.locator('#preview-front').click();expect(page.locator('#crop-zoom')).to_have_value('1')
  with page.expect_popup() as pop:page.locator('#print-sheets').click()
  sheet=pop.value;sheet.wait_for_selector('#print:not([disabled])');assert sheet.locator('.fronts svg[data-title]').count()==4;assert sheet.locator('.backs svg[data-title]').count()==4;assert sheet.locator('.fronts [data-visible-if=native]').count()==2;assert sheet.locator('.backs [data-visible-if=native]').count()==2
  with page.expect_download() as dl:page.locator('#save-project').click()
  dl.value.save_as('/tmp/field-guide-reviewed.zip')
  with zipfile.ZipFile('/tmp/field-guide-reviewed.zip') as z:
   m=json.loads(z.read('manifest.json'));headers=next(csv.reader(io.StringIO(z.read(m['csv']).decode('utf-8-sig'))));assert len(headers)==len(set(headers)),headers
   assert 'back_image_filename' in headers and 'native' in headers
   data=list(csv.DictReader(io.StringIO(z.read(m['csv']).decode('utf-8-sig'))));assert [r['native'] for r in data]==['false','true','true','false'];assert data[-1]['common_name']=='Field Madder'
   assert 'adaptations_ecology' in headers and 'campus_location' not in headers
   workspace=json.loads(z.read('workspace.json'));assert any(c.get('backCrop',{}).get('zoom')==.5 for c in workspace['cards'].values())
   assert z.read(m['cardBack']['svg'])
  # Simulate an older saved template with current card data and ensure restoring replaces both.
  page.evaluate("""()=>{const k='classroom-cards.static-first.v2:project:field-guide',s=JSON.parse(localStorage.getItem(k));delete s.projectPackageVersion;s.templateSVG=s.templateSVG.replace('height=\"184.330709\"','height=\"60\"');s.cards[0].values.common_name='My saved edit';localStorage.setItem(k,JSON.stringify(s));}""")
  page.reload();page.wait_for_function("document.querySelector('main').getAttribute('aria-busy')==='false'");expect(page.locator('#local-project-status')).to_contain_text('earlier Field Guide')
  page.on('dialog',lambda d:d.accept());page.locator('#start-over').click();expect(page.locator('#card-preview [data-field=common_name]')).to_contain_text('Ladybug');expect(page.locator('#card-preview #artwork')).to_have_attribute('height','184.330709')
  page.reload();page.wait_for_function("document.querySelector('main').getAttribute('aria-busy')==='false'");expect(page.locator('#card-preview #artwork')).to_have_attribute('height','184.330709')
  page.set_input_files('#open-json','/tmp/field-guide-reviewed.zip');page.wait_for_url('**/?local=*');page.wait_for_function("document.querySelector('main').getAttribute('aria-busy')==='false'");expect(page.locator('#card-position')).to_contain_text('of 4');page.locator('#preview-back').click();assert page.locator('#card-preview image').count()==1;assert not page.locator('#fit-issues').inner_text().strip()
  # Normal projects retain their shared-image back mode.
  page.goto(f'http://127.0.0.1:{port}/?project=houston-food-web');page.wait_for_function("document.querySelector('main').getAttribute('aria-busy')==='false'")
  expect(page.locator('#side-toggle')).to_be_hidden();assert not page.locator('#page-error').inner_text().strip()
  assert not errors,errors
  print('PASS: all eight sides, text fit, family formatting, images, duplex print, unique CSV headers, ZIP restore, old-work warning, reset layouts, reload persistence.')
  browser.close()
finally:server.terminate();server.wait()
