"""Complete expansion projects and non-destructive folder/ZIP/hosted append."""
import csv, io, json, shutil, socket, subprocess, sys, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent.parent
PACK=ROOT/'static-app/projects/houston-food-web-expansion'
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
origin=f'http://127.0.0.1:{port}'
server=subprocess.Popen([sys.executable,str(ROOT/'run.py'),'--port',str(port)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 with tempfile.TemporaryDirectory() as directory, sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('google-chrome') or None,headless=True)
  page=browser.new_page(service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def state():
   return page.evaluate("JSON.parse(localStorage.getItem('classroom-cards.static-first.v2:project:'+(new URLSearchParams(location.search).get('local')?'local-'+new URLSearchParams(location.search).get('local'):new URLSearchParams(location.search).get('project'))))")
  page.goto(origin);expect(page.locator('#fields')).to_be_visible()
  page.locator('#project-folder').set_input_files(PACK)
  expect(page.locator('.intro h1')).to_have_text('Houston Food Web Expansion')
  expect(page.locator('#preview-card-select option')).to_have_count(8)
  assert sum(c['copies'] for c in state()['cards'])==16
  page.get_by_role('button',name='Expansion guide',exact=True).click()
  expect(page.locator('#document-content')).to_contain_text('complete, self-contained project')
  with page.expect_download() as d:page.locator('#save-project').click()
  saved=Path(directory)/'saved-pack.zip';d.value.save_as(saved)
  with zipfile.ZipFile(saved) as z:
   manifest=json.loads(z.read('manifest.json'));assert manifest['id']=='houston-food-web-expansion' and manifest['packageVersion']=='1.0.0'
   assert manifest['expansion']['baseProjectId']=='houston-food-web'
   assert len(list(csv.DictReader(io.StringIO(z.read(manifest['csv']).decode('utf-8-sig')))))==8
   assert 'README.md' in z.namelist() and 'game-rules.md' in z.namelist()
  # Standalone hosted pack and base isolation.
  page.goto(origin+'/?project=houston-food-web-expansion')
  expect(page.locator('#preview-card-select option')).to_have_count(8,timeout=60000)
  page.goto(origin+'/?project=houston-food-web')
  expect(page.locator('#preview-card-select option')).to_have_count(22,timeout=60000)
  original=state();base_ids=[c['id'] for c in original['cards']]
  page.get_by_role('button',name='Add Houston Food Web Expansion',exact=True).click()
  expect(page.locator('.card-import-row')).to_have_count(8,timeout=60000)
  expect(page.locator('#card-import-expansion')).to_have_value('Houston Food Web Expansion')
  assert page.locator('.card-import-row.invalid').count()==0,page.locator('#card-import-review').inner_text()
  assert len(state()['cards'])==22 # Review doesn't mutate the destination.
  page.locator('#confirm-card-import').click()
  expect(page.locator('#card-import-result')).to_contain_text('8 added, 0 replaced',timeout=60000)
  combined=state();assert len(combined['cards'])==30 and sum(c['copies'] for c in combined['cards'])==64
  assert [c['id'] for c in combined['cards'][:22]]==base_ids
  assert combined['expansionPacks']['houston-food-web-expansion']['packageVersion']=='1.0.0'
  page.get_by_role('button',name='Close',exact=True).click()
  # Repeating a saved ZIP and the original folder skips unchanged cards.
  for picker,files in [('expansion-zip',saved),('expansion-folder',PACK)]:
   page.locator('#add-expansion').click();page.locator('#'+picker).set_input_files(files)
   expect(page.locator('.card-import-row')).to_have_count(8,timeout=60000)
   assert page.locator('.card-import-row select').evaluate_all("els=>els.every(el=>el.value==='skip')")
   page.locator('#confirm-card-import').click();expect(page.locator('#card-import-result')).to_contain_text('8 skipped')
   page.get_by_role('button',name='Close',exact=True).click()
  assert len(state()['cards'])==30
  # A revised pack sharing stable IDs requires an explicit conflict choice.
  revised=Path(directory)/'revised';shutil.copytree(PACK,revised)
  csv_path=revised/'campus-food-web-expansion.csv'
  with csv_path.open(encoding='utf-8-sig',newline='') as f:reader=csv.DictReader(f);headers=reader.fieldnames;rows=list(reader)
  rows[0]['common_name']='Updated Hawk'
  with csv_path.open('w',newline='') as f:w=csv.DictWriter(f,fieldnames=headers);w.writeheader();w.writerows(rows)
  manifest=json.loads((revised/'manifest.json').read_text());manifest['packageVersion']='1.0.1';(revised/'manifest.json').write_text(json.dumps(manifest))
  page.locator('#add-expansion').click();page.locator('#expansion-folder').set_input_files(revised)
  expect(page.locator('.card-import-row').first).to_contain_text('ID conflict')
  page.locator('.card-import-row select').first.select_option('replace');page.locator('#confirm-card-import').click()
  expect(page.locator('#card-import-result')).to_contain_text('0 added, 1 replaced, 7 skipped')
  assert state()['expansionPacks']['houston-food-web-expansion']['packageVersion']=='1.0.1'
  page.locator('#undo-card-import').click();expect(page.locator('#card-import-result')).to_contain_text('undone')
  assert state()['expansionPacks']['houston-food-web-expansion']['packageVersion']=='1.0.0'
  page.get_by_role('button',name='Close',exact=True).click()
  with page.expect_download() as d:page.locator('#save-project').click()
  combined_zip=Path(directory)/'combined.zip';d.value.save_as(combined_zip)
  with zipfile.ZipFile(combined_zip) as z:
   manifest=json.loads(z.read('manifest.json'));workspace=json.loads(z.read(manifest['workspace']))
   assert sum(name.endswith('manifest.json') for name in z.namelist())==1
   assert len(list(csv.DictReader(io.StringIO(z.read(manifest['csv']).decode('utf-8-sig')))))==30
   assert workspace['expansionPacks']['houston-food-web-expansion']['packageVersion']=='1.0.0'
   assert sum(bool(c.get('expansion')) for c in workspace['cards'].values())==8
  page.locator('#open-json').set_input_files(combined_zip)
  expect(page.locator('#preview-card-select option')).to_have_count(30)
  assert state()['expansionPacks']['houston-food-web-expansion']['baseProjectId']=='houston-food-web'
  page.locator('#preview-card-select').select_option('22');expect(page.locator('#card-preview image')).to_have_attribute('href',__import__('re').compile('data:image/'))
  page.reload();expect(page.locator('#preview-card-select option')).to_have_count(30)
  # A different destination produces a compatibility notice, not an implicit match.
  other=browser.new_page(service_workers='block');other.goto(origin);expect(other.locator('#fields')).to_be_visible()
  other.locator('#add-expansion').click();other.locator('#expansion-folder').set_input_files(PACK)
  expect(other.locator('#card-import-notice')).to_contain_text('differs from the current project')
  other.get_by_role('button',name='Close',exact=True).click();other.close()
  # Version/identity metadata is checked before the package reaches card review.
  invalid=Path(directory)/'invalid-pack';shutil.copytree(PACK,invalid)
  manifest=json.loads((invalid/'manifest.json').read_text());manifest['packageVersion']='unsupported';(invalid/'manifest.json').write_text(json.dumps(manifest))
  page.locator('#add-expansion').click();page.locator('#expansion-folder').set_input_files(invalid)
  expect(page.locator('#page-error')).to_contain_text('major.minor.patch');assert len(state()['cards'])==30
  page.locator('#add-expansion-dialog').get_by_role('button',name='Cancel',exact=True).click()
  # Missing artwork rejects the package before opening review or changing cards.
  (revised/'graphics/coopers-hawk.png').unlink()
  page.locator('#add-expansion').click();page.locator('#expansion-folder').set_input_files(revised)
  expect(page.locator('#page-error')).to_contain_text('missing or ambiguous image')
  assert len(state()['cards'])==30 and not errors,errors
  browser.close();print('PASS: standalone expansion folder/hosted projects, guide, 8 cards/16 copies, hosted/folder/ZIP append, repeated skips, explicit update/undo, stable base IDs, 30 cards/64 copies, saved registry/artwork/reopen, invalid package preservation.')
finally:server.terminate();server.wait()
