"""Real browser coverage for private folder/ZIP imports and portable backups."""
import csv, io, json, os, re, shutil, socket, subprocess, sys, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
origin = f'http://127.0.0.1:{port}'
server = subprocess.Popen([sys.executable, 'run.py', '--host', '127.0.0.1', '--port', str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with tempfile.TemporaryDirectory() as directory, sync_playwright() as p:
        folder = Path(directory) / 'private-project'
        (folder / 'graphics').mkdir(parents=True)
        (folder / 'templates').mkdir()
        Image.new('RGB', (50, 70), '#448844').save(folder / 'graphics' / 'leaf.png')
        shutil.copyfile('static-app/templates/food-web.svg', folder / 'templates' / 'card.svg')
        manifest = {'version': 1, 'name': 'Private classroom project', 'templates': [{'id': 'private-card', 'title': 'Private card', 'svg': './templates/card.svg'}], 'colorSchemes': ['Template', 'Sage'], 'starter': {'template': 'private-card', 'values': {'common_name': 'Starter'}}, 'cardBack': {'image': './graphics/leaf.png'}, 'files': [{'type': 'markdown', 'title': 'Local rules', 'path': './rules.md'}, {'type': 'download', 'title': 'Cards', 'path': './organisms.csv'}]}
        (folder / 'manifest.json').write_text(json.dumps(manifest))
        (folder / 'rules.md').write_text('# Private rules\n\n[Artwork](graphics/leaf.png)\n\n<script>bad()</script>')
        (folder / 'organisms.csv').write_text('common_name,binomial_name,image_filename,copies,theme\nLeaf,Test species,./graphics/leaf.png,3,Sage\nOther,Other species,graphics/leaf.png,2,Template\n')
        archive = Path(directory) / 'private.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in folder.rglob('*'):
                if file.is_file(): z.write(file, 'wrapped/' + file.relative_to(folder).as_posix())
        browser = p.chromium.launch(executable_path=shutil.which('google-chrome') or None, headless=True)
        context = browser.new_context(service_workers='block')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        requests = []
        page.on('request', lambda r: requests.append((r.method, r.url)))
        page.goto(origin)
        expect(page.locator('#fields input').first).to_be_visible()
        page.locator('#fields [data-field="common_name"]').fill('Keep my original card')
        page.locator('#project-folder').set_input_files(folder)
        expect(page.locator('.intro h1')).to_have_text('Private classroom project')
        expect(page.locator('#card-copies')).to_have_value('3')
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Leaf')
        expect(page.locator('#card-preview image').first).to_have_attribute('href', re.compile('data:image/'))
        expect(page.locator('#card-preview image').first).to_have_attribute('href', re.compile('data:image/'))
        assert page.locator('#card-select option').count() == 2
        assert page.locator('#template-select option').count() == 1
        page.get_by_role('button', name='Local rules', exact=True).click()
        expect(page.locator('#document-content h1')).to_have_text('Private rules')
        expect(page.locator('#document-content a')).to_have_attribute('href', re.compile('blob:'))
        assert page.locator('#document-content script').count() == 0
        page.locator('#fields [data-field="common_name"]').fill('Edited private leaf')
        local_url = page.url
        page.reload()
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Edited private leaf')
        page.get_by_role('button', name='Local rules', exact=True).click()
        expect(page.locator('#document-content h1')).to_have_text('Private rules')
        with page.expect_download() as saved:
            page.locator('#save-project').click()
        backup = Path(saved.value.path()).read_bytes()
        with zipfile.ZipFile(io.BytesIO(backup)) as z:
            saved_manifest = json.loads(z.read('manifest.json'))
            assert saved_manifest['csv']=='organisms.csv'
            assert 'cards.csv' not in z.namelist()
            rows = list(csv.DictReader(io.StringIO(z.read(saved_manifest['csv']).decode('utf-8-sig'))))
            assert rows[0]['common_name'] == 'Edited private leaf'
            assert rows[0]['copies'] == '3'
            assert rows[0]['binomial_name'] == 'Test species'
            assert 'workspace.json' in z.namelist()
            assert 'rules.md' in z.namelist()
            assert 'graphics/leaf.png' in z.namelist()
            assert 'leaf.png' not in z.namelist()
            assert rows[0]['image_filename'] == 'graphics/leaf.png'
        # Verify original workspace is untouched and ZIP creates a fresh workspace.
        page.goto(origin)
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Keep my original card')
        page.locator('#open-json').set_input_files(archive)
        expect(page.locator('.intro h1')).to_have_text('Private classroom project')
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Leaf')
        assert page.url != local_url
        # Print includes both cards' quantities and local card backs.
        with page.expect_popup() as popup:
            page.locator('#print-sheets').click()
        print_page = popup.value
        expect(print_page.locator('#print')).to_be_enabled()
        assert print_page.locator('[data-card-back]').count() == 5
        print_page.close()
        # Backup restores package and edits in a completely fresh browser context.
        fresh = browser.new_context(service_workers='block')
        restored = fresh.new_page()
        restored.goto(origin)
        expect(restored.locator('#fields input').first).to_be_visible()
        restored.locator('#open-json').set_input_files({'name': 'backup.zip', 'mimeType': 'application/zip', 'buffer': backup})
        expect(restored.locator('.intro h1')).to_have_text('Private classroom project')
        expect(restored.locator('#fields [data-field="common_name"]')).to_have_value('Edited private leaf')
        expect(restored.locator('#card-copies')).to_have_value('3')
        # Per-card edits, crop, drawing, card back and CSV authority survive a ZIP round trip.
        restored.locator('#card-copies').fill('4')
        restored.locator('#card-copies').dispatch_event('change')
        restored.locator('#appearance-tools').evaluate('(el)=>el.open=true')
        restored.locator('.custom-colors').evaluate('(el)=>el.open=true')
        restored.locator('[data-color="background"]').fill('#123456')
        restored.locator('[data-color="background"]').dispatch_event('input')
        restored.locator('#crop-zoom').evaluate("el=>{el.value='1.5';el.dispatchEvent(new Event('input'));}")
        restored.locator('#drawing-tools').evaluate('(el)=>el.open=true')
        restored.locator('#drawing').evaluate("el=>{const c=el.getContext('2d');c.fillStyle='#aa2233';c.fillRect(20,20,80,80);}")
        restored.locator('#use-drawing').click()
        restored.locator('#crop-zoom').evaluate("el=>{el.value='1.5';el.dispatchEvent(new Event('input'));}")
        restored.locator('#card-back-file').set_input_files(folder / 'graphics' / 'leaf.png')
        expect(restored.locator('#card-back-preview')).to_be_visible()
        with restored.expect_download() as saved_again:
            restored.locator('#save-project').click()
        second_backup = Path(saved_again.value.path()).read_bytes()
        with zipfile.ZipFile(io.BytesIO(second_backup)) as z:
            saved_manifest = json.loads(z.read('manifest.json'))
            settings = json.loads(z.read('workspace.json'))
            csv_path = saved_manifest['csv']
            rows = list(csv.DictReader(io.StringIO(z.read(csv_path).decode('utf-8-sig'))))
            assert rows[0]['copies'] == '4'
            assert 'background=#123456' in rows[0]['theme']
            assert settings['cards'][rows[0]['card_id']]['drawingActive']
            assert saved_manifest['cardBack']['image'] in z.namelist()
            entries = {name:z.read(name) for name in z.namelist()}
        # An external CSV edit must win over all saved settings.
        rows[0]['common_name'] = 'CSV edited leaf'
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
        entries[csv_path] = out.getvalue().encode()
        edited_zip = io.BytesIO()
        with zipfile.ZipFile(edited_zip, 'w') as z:
            for name, data in entries.items(): z.writestr(name, data)
        restored.locator('#open-json').set_input_files({'name':'edited.zip','mimeType':'application/zip','buffer':edited_zip.getvalue()})
        expect(restored.locator('#fields [data-field="common_name"]')).to_have_value('CSV edited leaf')
        expect(restored.locator('#card-copies')).to_have_value('4')
        expect(restored.locator('[data-color="background"]')).to_have_value('#123456')
        expect(restored.locator('#image-status')).to_have_text('Using your drawing.')
        expect(restored.locator('#crop-zoom')).to_have_value('1.5')
        restored.locator('#card-select').select_option('1')
        expect(restored.locator('[data-color="background"]')).not_to_have_value('#123456')
        restored.locator('#card-select').select_option('0')
        with restored.expect_popup() as back_popup:
            restored.locator('#print-sheets').click()
        expect(back_popup.value.locator('#print')).to_be_enabled()
        assert back_popup.value.locator('[data-card-back]').count() == 6
        back_popup.value.close()
        restored.locator('#remove-card-back').click()
        with restored.expect_download() as removed:
            restored.locator('#save-project').click()
        with zipfile.ZipFile(removed.value.path()) as z:
            assert 'cardBack' not in json.loads(z.read('manifest.json'))
        # Save a normal workspace, including a custom template, without a starter package.
        normal = browser.new_context(service_workers='block').new_page()
        normal.goto(origin)
        expect(normal.locator('#fields input').first).to_be_visible()
        normal.locator('#svg-file').set_input_files('static-app/templates/field-guide.svg')
        expect(normal.locator('#template-select')).to_have_value('custom')
        normal.locator('#fields [data-field="common_name"]').fill('Normal card')
        normal.locator('#image-files').set_input_files(folder / 'graphics' / 'leaf.png')
        with normal.expect_download() as normal_saved:
            normal.locator('#save-project').click()
        with zipfile.ZipFile(normal_saved.value.path()) as z:
            m=json.loads(z.read('manifest.json'))
            normal_rows=list(csv.DictReader(io.StringIO(z.read(m['csv']).decode('utf-8-sig'))))
            assert normal_rows[0]['image_filename']=='graphics/leaf.png'
            assert 'graphics/leaf.png' in z.namelist() and 'leaf.png' not in z.namelist()
        normal.locator('#open-json').set_input_files(normal_saved.value.path())
        expect(normal.locator('#fields [data-field="common_name"]')).to_have_value('Normal card')
        expect(normal.locator('#project-resources')).to_be_hidden()
        expect(normal.locator('#card-preview image').first).to_have_attribute('href', re.compile('data:image/'))
        # Bad ZIP / paths / missing files cannot replace current workspace.
        before = restored.url
        for name, entries in [
            ('traversal.zip', {'../manifest.json': '{}'}),
            ('missing.zip', {'manifest.json': json.dumps(manifest)}),
            ('multiple.zip', {'a/manifest.json': '{}', 'b/manifest.json': '{}'}),
            ('bad-csv.zip', {'manifest.json': json.dumps({'version':1, 'name':'Bad CSV'}), 'cards.csv':'common_name,copies\nBad,0\n'}),
            ('missing-image.zip', {'manifest.json': json.dumps({'version':1, 'name':'Missing image'}), 'cards.csv':'common_name,image_filename\nBad,absent.png\n'}),
        ]:
            bad = Path(directory) / name
            with zipfile.ZipFile(bad, 'w') as z:
                for path, data in entries.items(): z.writestr(path, data)
            restored.locator('#open-json').set_input_files(bad)
            expect(restored.locator('#local-project-status')).to_contain_text('Project was not imported.')
            expect(restored.locator('#open-json')).to_be_enabled()
            assert restored.url == before
            expect(restored.locator('#fields [data-field="common_name"]')).to_have_value('CSV edited leaf')
        # Actual service-worker cache supports offline reload, documents and printing.
        offline_context = browser.new_context()
        offline_page = offline_context.new_page()
        offline_page.goto(origin)
        expect(offline_page.locator('#fields input').first).to_be_visible()
        offline_page.evaluate("async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));}")
        offline_page.locator('#open-json').set_input_files(archive)
        expect(offline_page.locator('.intro h1')).to_have_text('Private classroom project')
        expect(offline_page.locator('#save-state')).to_contain_text('saved in this browser')
        offline_page.reload()
        expect(offline_page.locator('#card-copies')).to_have_value('3')
        offline_context.set_offline(True)
        offline_page.reload()
        expect(offline_page.locator('#fields [data-field="common_name"]')).to_have_value('Leaf')
        with offline_page.expect_popup() as reference_popup:
            offline_page.locator('footer .reference-links a').first.click()
        expect(reference_popup.value.locator('#reference-content h1')).to_have_text('Classroom Cards app guide')
        reference_popup.value.close()
        offline_page.get_by_role('button', name='Local rules', exact=True).click()
        expect(offline_page.locator('#document-content h1')).to_have_text('Private rules')
        with offline_page.expect_popup() as offline_popup:
            offline_page.locator('#print-sheets').click()
        expect(offline_popup.value.locator('#print')).to_be_enabled()
        assert offline_popup.value.locator('[data-card-back]').count() == 5
        offline_context.close()
        assert not errors, errors
        assert all(method == 'GET' for method, _ in requests), requests
        assert not any('/local-project-files/' in url for _, url in requests)
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('.source-panel').screenshot(path='/tmp/local-project-import-mobile.png')
        browser.close()
        print('Local project smoke passed: folder, compressed ZIP, isolated recovery, documents, images, duplex print, portable backup, offline recovery/printing, rejected invalid imports, mobile layout, no uploads.')
finally:
    server.terminate()
    server.wait()
