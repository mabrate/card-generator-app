"""Real browser coverage for private folder/ZIP imports and portable backups."""
import json, os, re, shutil, socket, subprocess, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
origin = f'http://127.0.0.1:{port}'
server = subprocess.Popen(['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', 'static-app'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with tempfile.TemporaryDirectory() as directory, sync_playwright() as p:
        folder = Path(directory) / 'private-project'
        (folder / 'art').mkdir(parents=True)
        (folder / 'templates').mkdir()
        Image.new('RGB', (50, 70), '#448844').save(folder / 'art' / 'leaf.png')
        shutil.copyfile('static-app/templates/food-web.svg', folder / 'templates' / 'card.svg')
        manifest = {'version': 1, 'name': 'Private classroom project', 'csv': './cards.csv', 'templates': [{'id': 'private-card', 'title': 'Private card', 'svg': './templates/card.svg'}], 'colorSchemes': ['Template', 'Sage'], 'starter': {'template': 'private-card', 'values': {'common_name': 'Starter'}}, 'cardBack': {'image': './art/leaf.png'}, 'files': [{'type': 'markdown', 'title': 'Local rules', 'path': './rules.md'}, {'type': 'download', 'title': 'Cards', 'path': './cards.csv'}]}
        (folder / 'manifest.json').write_text(json.dumps(manifest))
        (folder / 'rules.md').write_text('# Private rules\n\n[Artwork](art/leaf.png)\n\n<script>bad()</script>')
        (folder / 'cards.csv').write_text('common_name,binomial_name,image_filename,copies,theme\nLeaf,Test species,./art/leaf.png,3,Sage\nOther,Other species,art/leaf.png,2,Template\n')
        archive = Path(directory) / 'private.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in folder.rglob('*'):
                if file.is_file(): z.write(file, 'wrapped/' + file.relative_to(folder).as_posix())
        browser = p.chromium.launch(executable_path=shutil.which('google-chrome'), headless=True)
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
        page.get_by_role('button', name='Apply CSV column matches', exact=True).click()
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
            page.locator('#save-json').click()
        backup = Path(saved.value.path()).read_bytes()
        assert json.loads(backup)['localBundle']['files']
        # Verify original workspace is untouched and ZIP creates a fresh workspace.
        page.goto(origin)
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Keep my original card')
        page.locator('#project-zip').set_input_files(archive)
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
        restored.locator('#open-json').set_input_files({'name': 'backup.json', 'mimeType': 'application/json', 'buffer': backup})
        expect(restored.locator('.intro h1')).to_have_text('Private classroom project')
        expect(restored.locator('#fields [data-field="common_name"]')).to_have_value('Edited private leaf')
        expect(restored.locator('#card-copies')).to_have_value('3')
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
            restored.locator('#project-zip').set_input_files(bad)
            expect(restored.locator('#local-project-status')).to_contain_text('Project was not imported.')
            expect(restored.locator('#project-zip')).to_be_enabled()
            assert restored.url == before
            expect(restored.locator('#fields [data-field="common_name"]')).to_have_value('Edited private leaf')
        # Actual service-worker cache supports offline reload, documents and printing.
        offline_context = browser.new_context()
        offline_page = offline_context.new_page()
        offline_page.goto(origin)
        expect(offline_page.locator('#fields input').first).to_be_visible()
        offline_page.evaluate("async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));}")
        offline_page.locator('#project-zip').set_input_files(archive)
        expect(offline_page.locator('.intro h1')).to_have_text('Private classroom project')
        expect(offline_page.locator('#save-state')).to_contain_text('saved in this browser')
        offline_page.reload()
        expect(offline_page.locator('#card-copies')).to_have_value('3')
        offline_context.set_offline(True)
        offline_page.reload()
        expect(offline_page.locator('#fields [data-field="common_name"]')).to_have_value('Leaf')
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
        page.locator('#local-project-tools').screenshot(path='/tmp/local-project-import-mobile.png')
        browser.close()
        print('Local project smoke passed: folder, compressed ZIP, isolated recovery, documents, images, duplex print, portable backup, offline recovery/printing, rejected invalid imports, mobile layout, no uploads.')
finally:
    server.terminate()
    server.wait()
