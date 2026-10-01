import os, shutil, socket, subprocess, tempfile, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as data:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    origin=f'http://127.0.0.1:{port}'
    env={**os.environ,'CARD_APP_DATA_DIR':data,'CARD_APP_TEACHER_PIN':'123456','CARD_APP_PORT':str(port)}
    with open(Path(data)/'server.log','w+') as log:
        server=subprocess.Popen([str(root/'.venv/bin/python'),'run.py'],cwd=root,env=env,stdout=log,stderr=log)
        try:
            for _ in range(80):
                try:
                    if urlopen(origin+'/api/health',timeout=1).status==200:break
                except OSError:time.sleep(.1)
            else:raise RuntimeError('server unavailable')
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=os.environ.get('CARD_APP_TEST_BROWSER') or shutil.which('google-chrome') or shutil.which('chromium'),headless=True)
                page=browser.new_page(viewport={'width':1280,'height':900})
                errors=[];external=[];page.on('pageerror',lambda err:errors.append(str(err)))
                def local_only(route):
                    if route.request.url.startswith(origin+'/'):route.continue_()
                    else:external.append(route.request.url);route.abort()
                page.route('**/*',local_only)
                page.goto(origin+'/teacher')
                page.get_by_label('Teacher PIN').fill('123456')
                page.get_by_role('button',name='Open teacher space').click()
                expect(page.get_by_role('heading',name='Projects',exact=True)).to_be_visible()
                page.get_by_role('button',name='Open project').first.click()
                expect(page.locator('#student-qr')).to_be_visible()
                page.locator('[data-tab=cards]').click()
                expect(page.locator('#tab-cards')).to_be_visible()
                page.locator('[data-tab=layout]').click()
                expect(page.locator('#layout-art svg')).to_be_visible(timeout=15000)
                expect(page.locator('#download-svg')).to_have_attribute('href',__import__('re').compile(r'design.svg'))
                page.locator('[data-tab=print]').click()
                expect(page.locator('#tab-print')).to_be_visible()
                page.locator('[data-tab=overview]').click()
                expect(page.locator('#project-title')).to_have_value('Classroom field guide')
                page.goto(origin+'/teacher')
                page.locator('#new-project-title').fill('SVG browser test')
                page.get_by_role('button',name='Create project').click()
                expect(page.locator('#project-heading')).to_have_text('SVG browser test')
                page.locator('[data-tab=layout]').click()
                expect(page.locator('#download-svg')).to_be_visible()
                page.locator('#csv-file').set_input_files({'name':'cards.csv','mimeType':'text/csv','buffer':b'common_name,card_id,copies\nTest organism,test-organism,1\n'})
                expect(page.locator('#sample-row option')).to_have_count(1)
                page.locator('#validate-import').click()
                expect(page.locator('#import-summary')).to_contain_text('1 rows ready')
                page.once('dialog',lambda dialog:dialog.accept())
                page.locator('#commit-import').click()
                expect(page.locator('#studio-status')).to_contain_text('1 created')
                page.locator('[data-tab=print]').click()
                expect(page.locator('#tab-print')).to_be_visible()
                page.locator('#include-imported').check()
                expect(page.locator('#print-cards tr')).to_have_count(1)
                page.locator('#select-visible').click()
                page.locator('#check-print').click()
                expect(page.locator('#print-status')).to_contain_text('Ready to download')
                with page.expect_popup() as popup:
                    page.locator('#preview-print').click()
                expect(page.locator('#print-status')).to_contain_text('Sheet preview opened')
                popup.value.close()
                with page.expect_download() as download:
                    page.locator('#download-print').click()
                assert download.value.suggested_filename.endswith('.pdf')
                page.locator('[data-tab=layout]').click()
                expect(page.locator('#download-svg')).to_be_visible()
                design=page.request.get(origin+page.locator('#download-svg').get_attribute('href')).body()
                page.locator('#svg-file').set_input_files({'name':'design.svg','mimeType':'image/svg+xml','buffer':design})
                expect(page.locator('#studio-status')).to_contain_text('SVG design loaded')
                page.goto(origin+'/teacher')
                row=page.locator('.project-row').filter(has_text='SVG browser test')
                page.once('dialog',lambda dialog:dialog.accept('Renamed browser test'))
                row.get_by_role('button',name='Rename').click()
                expect(page.locator('.project-row').filter(has_text='Renamed browser test')).to_be_visible()
                row=page.locator('.project-row').filter(has_text='Renamed browser test')
                page.once('dialog',lambda dialog:dialog.accept())
                row.get_by_role('button',name='Delete').click()
                expect(page.locator('.project-row').filter(has_text='Renamed browser test')).to_have_count(0)
                assert not errors,errors
                assert not external,external
                browser.close()
                print('Project browser smoke passed')
        finally:
            server.terminate();server.wait(timeout=5)
