import subprocess,shutil,os,socket
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)
with socket.socket() as sock:
 sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
origin=f"http://127.0.0.1:{port}"
from playwright.sync_api import sync_playwright,expect
server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory','static-app'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('google-chrome'),headless=True)
  page=browser.new_page(service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
  page.goto(origin+'/');expect(page.locator('#fields input').first).to_be_visible()
  assert page.locator('#template-select option').count()==2
  expect(page.locator('#template-svg')).to_be_visible()
  expect(page.locator('#start-over')).to_be_visible()
  expect(page.locator('#print-sheets')).to_be_visible()
  assert page.locator('#more-tools details').count()==0
  expect(page.locator('#cards-csv')).to_be_visible()
  assert page.locator('#copy-starter-link').count()==0
  page.locator('#more-tools').screenshot(path='/tmp/more-tools-desktop.png')
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.locator('#more-tools').screenshot(path='/tmp/more-tools-mobile.png')
  page.set_viewport_size({'width':1280,'height':900})
  with page.expect_download() as template_download:page.locator('#template-svg').click()
  assert '<svg' in Path(template_download.value.path()).read_text()
  page.once('dialog',lambda dialog:dialog.dismiss())
  page.locator('#start-over').click()

  # CSV quantities/themes are per-card, survive recovery, and drive actual sheets.
  keys=page.locator('#fields [data-field]').evaluate_all("nodes=>nodes.map(n=>n.dataset.field)")
  csv=','.join(keys+['card_count','color_theme'])+'\n'+','.join(['Alpha']*len(keys)+['4','sage'])+'\n'+','.join(['Beta']*len(keys)+['3','sky'])+'\n'
  page.locator('#csv-file').set_input_files({"name":"quantities.csv","mimeType":"text/csv","buffer":csv.encode()})
  expect(page.locator('#card-copies')).to_have_value('4')
  expect(page.locator('[data-map="copies"]')).to_have_value('card_count')
  expect(page.locator('[data-map="theme"]')).to_have_value('color_theme')
  expect(page.locator('[data-scheme="Sage"]')).to_have_attribute('aria-pressed','true')
  page.locator('#card-select').select_option('1')
  expect(page.locator('#card-copies')).to_have_value('3')
  expect(page.locator('[data-scheme="Sky"]')).to_have_attribute('aria-pressed','true')
  page.reload();expect(page.locator('#card-copies')).to_have_value('3')
  quantities=page.evaluate("""async()=>{
    const {readTemplate}=await import('./template.js');const {printDocument}=await import('./print.js');
    const state=JSON.parse(localStorage.getItem('classroom-cards.static-first.v2'));
    const template=readTemplate(state.templateSVG);
    return {normal:await printDocument(template,state,async()=>null,'all',1),double:await printDocument(template,state,async()=>null,'all',2),current:await printDocument(template,state,async()=>null,'current',1)};
  }""")
  quantity_page=browser.new_page();quantity_page.set_content(quantities['normal'])
  assert quantity_page.locator('.fronts > svg > svg').count()==7
  assert quantity_page.locator('.fronts').count()==2
  bleed=quantity_page.locator('[data-print-bleed]')
  assert bleed.count()==7
  assert bleed.first.get_attribute('x')=='99' and bleed.first.get_attribute('y')=='36'
  assert bleed.first.get_attribute('width')=='198' and bleed.first.get_attribute('height')=='270'
  assert bleed.first.evaluate('node=>getComputedStyle(node).fill')=='rgb(102, 130, 86)'
  assert bleed.nth(4).evaluate('node=>getComputedStyle(node).fill')=='rgb(100, 134, 162)'
  assert quantity_page.locator('.fronts > svg > svg').first.get_attribute('width')=='180'

  assert '#eef3e8' in quantity_page.locator('.fronts > svg > svg').first.inner_html()
  assert '#edf3f8' in quantity_page.locator('.fronts > svg > svg').nth(4).inner_html()
  quantity_page.set_content(quantities['double']);assert quantity_page.locator('.fronts > svg > svg').count()==14
  quantity_page.set_content(quantities['current']);assert quantity_page.locator('.fronts > svg > svg').count()==3
  quantity_page.close()
  page.locator('#card-copies').fill('2');page.locator('#card-copies').dispatch_event('change');page.reload();expect(page.locator('#card-copies')).to_have_value('2')
  with page.expect_download() as csv_download:page.locator('#cards-csv').click()
  import csv as csv_module,io
  exported=list(csv_module.DictReader(io.StringIO(Path(csv_download.value.path()).read_text(encoding='utf-8-sig'))))
  assert [r['copies'] for r in exported]==['4','2']
  assert [r['theme'] for r in exported]==['Sage','Sky']
  with page.expect_download() as project_download:page.get_by_role('button',name='Save editable copy',exact=True).click()
  page.once('dialog',lambda dialog:dialog.accept())
  page.locator('#open-json').set_input_files(project_download.value.path())
  expect(page.locator('#save-state')).to_contain_text('saved in this browser')
  expect(page.locator('#card-copies')).to_have_value('2')
  expect(page.locator('[data-scheme="Sky"]')).to_have_attribute('aria-pressed','true')
  page.locator('[data-map="copies"]').select_option('')
  page.locator('[data-map="theme"]').select_option('')
  page.get_by_role('button',name='Apply CSV column matches',exact=True).click()
  expect(page.locator('#card-copies')).to_have_value('1')
  page.locator('[data-map="copies"]').select_option('card_count')
  page.locator('[data-map="theme"]').select_option('color_theme')
  page.get_by_role('button',name='Apply CSV column matches',exact=True).click()
  expect(page.locator('#card-copies')).to_have_value('3')
  expect(page.locator('[data-scheme="Sky"]')).to_have_attribute('aria-pressed','true')
  before=page.evaluate("localStorage.getItem('classroom-cards.static-first.v2')")
  bad=','.join(keys+['copies','theme'])+'\n'+','.join(['Invalid']*len(keys)+['2.5','Sage'])+'\n'
  page.locator('#csv-file').set_input_files({"name":"bad.csv","mimeType":"text/csv","buffer":bad.encode()})
  expect(page.locator('#page-error')).to_contain_text('whole number')
  assert page.evaluate("localStorage.getItem('classroom-cards.static-first.v2')")==before
  bad=bad.replace('2.5,Sage','2,Unknown')
  page.locator('#csv-file').set_input_files({"name":"bad-theme.csv","mimeType":"text/csv","buffer":bad.encode()})
  expect(page.locator('#page-error')).to_contain_text('color theme')
  assert page.evaluate("localStorage.getItem('classroom-cards.static-first.v2')")==before
  page.evaluate("localStorage.removeItem('classroom-cards.static-first.v2')");page.reload()
  page.locator('#fields [data-field="common_name"]').fill('Normal workspace')
  page.goto(origin+'/?project=houston-food-web');expect(page.locator('.intro h1')).to_have_text('Houston Food Web Game')
  expect(page.locator('#fields input').first).to_be_visible();assert page.locator('#template-select option').count()==1
  assert page.locator('#fields [data-field="common_name"]').input_value()==''
  assert page.locator('#fields [data-field="common_name"]').get_attribute('placeholder')=='Name your organism'
  page.get_by_role('button',name='Game rules',exact=True).click();expect(page.locator('#document-content table').first).to_be_visible();assert page.locator('#document-content table').count()==3
  page.locator('#fields [data-field="common_name"]').fill('Project card');page.reload();expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Project card')
  # Exercise actual print output with seven fronts and a partial final sheet.
  printed=page.evaluate("""async () => {
    const {readTemplate}=await import('./template.js');
    const {printDocument}=await import('./print.js');
    const {loadProject}=await import('./projects.js');
    const catalog=await (await fetch('templates/catalog.json')).json();
    const project=await loadProject('houston-food-web',catalog);
    const snapshot=JSON.parse(localStorage.getItem('classroom-cards.static-first.v2:project:houston-food-web'));
    const template=readTemplate(snapshot.templateSVG);
    snapshot.cards=Array.from({length:7},(_,i)=>({...snapshot.cards[0],id:String(i),values:Object.fromEntries(template.fields.map(f=>[f.key,'Card '+i])),imageName:'',drawingKey:null}));
    return {duplex:await printDocument(template,snapshot,async()=>null,'all',1,project.cardBack),fronts:await printDocument(template,snapshot,async()=>null,'all',1)};
  }""")
  sheets=browser.new_page();sheets.set_content(printed['duplex']);expect(sheets.locator('#print')).to_be_enabled()
  assert sheets.locator('.sheet').count()==4
  assert sheets.locator('.fronts').count()==2 and sheets.locator('.backs').count()==2
  backs=sheets.locator('.backs svg image');assert backs.count()==7
  assert [backs.nth(i).get_attribute('x') for i in range(3)]==['504','306','108']
  assert sheets.locator('.backs').last.locator('image').get_attribute('x')=='504'
  assert backs.first.get_attribute('href').startswith('data:image/png;base64,')
  sheets.screenshot(path='/tmp/houston-card-sheets.png',full_page=True)
  sheets.pdf(path='/tmp/houston-card-sheets.pdf',prefer_css_page_size=True)
  sheets.set_content(printed['fronts']);expect(sheets.locator('#print')).to_be_enabled();assert sheets.locator('.sheet').count()==2 and sheets.locator('.backs').count()==0
  failure=page.evaluate("""async () => {const {loadCardBack}=await import('./print.js');try{await loadCardBack({url:'projects/houston-food-web/missing.png'});return '';}catch(error){return error.message;}}""")
  assert 'Cannot load' in failure
  sheets.close()
  page.goto(origin+'/');expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Normal workspace')
  custom={"version":1,"name":"Custom test","templates":[{"id":"custom-food","title":"Custom food","svg":"templates/custom.svg"}],"colorSchemes":[{"name":"Ocean","colors":{"background":"#112233"}}],"starter":{"template":"custom-food","scheme":"Ocean","values":{"common_name":"Starter organism"}},"files":[]}
  page.route('**/projects/custom-test/manifest.json',lambda route:route.fulfill(json=custom))
  page.route('**/projects/custom-test/templates/custom.svg',lambda route:route.fulfill(path='static-app/templates/food-web.svg',content_type='image/svg+xml'))
  page.goto(origin+'/?project=custom-test');expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Starter organism')
  assert page.locator('#color-schemes button').count()==1
  assert page.locator('#colors [data-color="background"]').input_value()=='#112233'
  page.get_by_role('button',name='New card',exact=True).click();expect(page.locator('#card-select option')).to_have_count(2)
  expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Starter organism')
  with page.expect_download() as downloaded:page.get_by_role('button',name='Save editable copy',exact=True).click()
  backup=downloaded.value.path()
  page.on('dialog',lambda dialog:dialog.accept())
  page.locator('#open-json').set_input_files(backup);expect(page.locator('#save-state')).to_contain_text('saved in this browser')
  expect(page.locator('#page-error')).to_be_empty()
  page.reload();expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Starter organism')
  # An incompatible checkpoint must remain downloadable and offer a fresh start.
  normal_saved=page.evaluate("localStorage.getItem('classroom-cards.static-first.v2')")
  page.evaluate("""saved => localStorage.setItem('classroom-cards.static-first.v2:project:houston-food-web',saved)""",normal_saved)
  page.goto(origin+'/?project=houston-food-web')
  expect(page.locator('#recovery-error')).to_be_visible()
  expect(page.locator('#recovery-error-message')).to_contain_text('template is not allowed')
  assert page.evaluate("localStorage.getItem('classroom-cards.static-first.v2:project:houston-food-web')")==normal_saved
  with page.expect_download() as recovered_download:page.get_by_role('button',name='Download saved work',exact=True).click()
  import json
  recovered=json.loads(Path(recovered_download.value.path()).read_text())
  assert recovered['state']['cards'][0]['values']['common_name']=='Normal workspace'
  page.locator('#fresh-recovery').click()
  expect(page.locator('#recovery-error')).to_be_hidden()
  expect(page.locator('#fields [data-field="common_name"]')).to_have_value('')
  expect(page.locator('#template-select')).to_have_value('food-web')
  expect(page.locator('#page-error')).to_be_empty()
  page.get_by_role('button',name='New card',exact=True).click();expect(page.locator('#card-select option')).to_have_count(2)
  page.reload();expect(page.locator('#recovery-error')).to_be_hidden();expect(page.locator('#card-select option')).to_have_count(2)
  assert page.evaluate("localStorage.getItem('classroom-cards.static-first.v2')")==normal_saved
  # Starter links and incompatible editable-copy imports use the same reset UI.
  starter={"v":1,"template":"custom","svg":json.loads(normal_saved)['templateSVG'],"fields":{},"colors":{},"scheme":""}
  from urllib.parse import urlencode
  page.goto(origin+'/?project=houston-food-web#'+urlencode({"card":json.dumps(starter)}));page.reload()
  expect(page.locator('#recovery-error')).to_be_visible()
  expect(page.locator('#recovery-error-message')).to_contain_text('template is not allowed')
  page.locator('#fresh-recovery').click()
  expect(page.locator('#recovery-error')).to_be_hidden();expect(page.locator('#template-select')).to_have_value('food-web')
  assert '#card=' not in page.url
  page.reload();expect(page.locator('#recovery-error')).to_be_hidden()
  incompatible_payload=json.dumps({"state":json.loads(normal_saved),"images":{}})
  page.locator('#open-json').set_input_files({"name":"other-template.json","mimeType":"application/json","buffer":incompatible_payload.encode()})
  expect(page.locator('#recovery-error')).to_be_visible()
  page.locator('#fresh-recovery').click()
  expect(page.locator('#recovery-error')).to_be_hidden();expect(page.locator('#template-select')).to_have_value('food-web')
  # Malformed checkpoints also have a way out, in the ordinary editor.
  page.evaluate("localStorage.setItem('classroom-cards.static-first.v2','{broken')")
  page.goto(origin+'/');expect(page.locator('#recovery-error')).to_be_visible()
  with page.expect_download() as damaged_download:page.get_by_role('button',name='Download saved work',exact=True).click()
  assert Path(damaged_download.value.path()).read_text()=='{broken'
  page.locator('#fresh-recovery').click()
  expect(page.locator('#recovery-error')).to_be_hidden();expect(page.locator('#template-select')).to_have_value('field-guide')
  page.goto(origin+'/?project=missing');expect(page.locator('#page-error')).to_contain_text('Cannot load project')
  page.goto(origin+'/?project=../bad');expect(page.locator('#page-error')).to_contain_text('Invalid project')
  assert not errors,errors
  browser.close();print('PASS: CSV quantities/themes, print multipliers, export, editable-copy recovery, remapping and invalid import preservation; starter/import reset paths; incompatible/corrupt recovery download and fresh start; duplex back alignment/partial pages/embedded image/front-only/failure; custom template/scheme/starter/backup; normal editor, project template/placeholders, rendered rule tables, isolated recovery, missing/invalid projects; no browser errors')
finally:server.terminate();server.wait()
