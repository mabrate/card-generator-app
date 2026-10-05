"""Browser coverage for the simplified template, print, and project controls."""
import os, shutil, socket, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
origin = f'http://127.0.0.1:{port}'
server = subprocess.Popen([sys.executable, str(ROOT / 'run.py'), '--host', '127.0.0.1', '--port', str(port)], cwd='/tmp', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('google-chrome') or None, headless=True)
        page = browser.new_page(service_workers='block', viewport={'width':1280, 'height':900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(origin)
        expect(page.locator('#fields input').first).to_be_visible()
        tools = page.locator('#template-tools')
        expect(tools.locator('#template-select')).to_be_visible()
        expect(tools.locator('#template-svg')).to_be_visible()
        expect(tools.locator('#svg-file')).to_be_attached()
        assert tools.locator('button').count() == 1
        expect(tools.locator('#template-svg')).to_have_attribute('title', 'Download template SVG')
        expect(page.locator('#open-project')).to_have_text('Open project folder')
        page.locator('#open-project').click()
        expect(page.locator('#open-project-dialog')).to_be_visible()
        page.get_by_role('button', name='Cancel', exact=True).click()
        assert page.locator('#csv-file, #cards-csv, #template-csv, #project-zip, #csv-mapping').count() == 0
        assert page.locator('.preview-panel #card-back-file').count() == 1
        assert page.locator('.source-panel #card-back-file, .source-panel #start-over').count() == 0
        assert page.locator('#workspace-tools').evaluate('el=>el.parentElement.lastElementChild===el')
        expect(page.locator('#start-over')).to_be_visible()
        # Main entry point serves only the site, never backend routes or repository data.
        for path in ['/run.py','/.git/config','/data/app.sqlite','/teacher','/api/projects','/migrations/001_initial.sql']:
            assert page.request.get(origin+path).status == 404, path
        references = page.locator('footer .reference-links a')
        assert references.count() == 7
        for link in references.all():
            with page.expect_popup() as popup:
                link.click()
            doc = popup.value
            expect(doc.locator('#reference-content h1').first).to_be_visible()
            expect(doc.locator('#reference-status')).to_be_hidden()
            expect(doc.locator('#reference-source')).to_be_visible()
            doc.close()
        # Changing default starters keeps text, and the downloaded SVG is the selected layout.
        page.locator('#fields [data-field="common_name"]').fill('Keep this text')
        page.locator('#template-select').select_option('food-web')
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Keep this text')
        with page.expect_download() as saved_template:
            page.locator('#template-svg').click()
        assert 'Food web' in Path(saved_template.value.path()).read_text()
        page.reload()
        expect(page.locator('#template-select')).to_have_value('food-web')
        # Reset cancellation preserves work; confirmation starts a blank card.
        page.once('dialog', lambda dialog: dialog.dismiss())
        page.locator('#start-over').click()
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('Keep this text')
        page.once('dialog', lambda dialog: dialog.accept())
        page.locator('#start-over').click()
        expect(page.locator('#fields [data-field="common_name"]')).to_have_value('')
        page.screenshot(path='/tmp/card-studio-layout-desktop.png', full_page=True)
        page.set_viewport_size({'width':390, 'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path='/tmp/card-studio-layout-mobile.png', full_page=True)
        assert not errors, errors
        browser.close()
        print('PASS: template-only tools, default layout switching/download/recovery, preview card-back control, bottom reset confirmation, desktop/mobile layout, no browser errors.')
finally:
    server.terminate()
    server.wait()
