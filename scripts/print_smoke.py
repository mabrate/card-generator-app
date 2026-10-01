"""Real-browser print acceptance with temporary storage, never classroom data."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path('/tmp/card-print-smoke')


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='card-print-smoke-') as temporary:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        origin = f'http://127.0.0.1:{port}'
        env = {**os.environ, 'CARD_APP_DATA_DIR': temporary, 'CARD_APP_TEACHER_PIN': '123456', 'CARD_APP_PORT': str(port)}
        with open(Path(temporary) / 'server.log', 'w+') as log:
            server = subprocess.Popen([sys.executable, 'run.py'], cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        urlopen(origin + '/api/health', timeout=1).close()
                        break
                    except OSError:
                        time.sleep(.1)
                with sync_playwright() as playwright:
                    engine = os.environ.get('CARD_APP_TEST_ENGINE', 'chromium')
                    executable = shutil.which('google-chrome') if engine == 'chromium' else None
                    browser = getattr(playwright, engine).launch(executable_path=executable, headless=True)
                    context = browser.new_context(viewport={'width': 1280, 'height': 1000}, accept_downloads=True)
                    external, errors = [], []
                    def local_only(route):
                        if not route.request.url.startswith(origin + '/'):
                            external.append(route.request.url)
                            route.abort()
                        else:
                            route.continue_()
                    context.route('**/*', local_only)
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('dialog', lambda dialog: dialog.accept())
                    page.goto(origin + '/teacher/login')
                    page.locator('#pin').fill('123456')
                    page.locator('button[type=submit]').click()
                    page.wait_for_url(origin + '/teacher')
                    page.locator('#new-project-title').fill('Print smoke')
                    page.get_by_role('button', name='Create project').click()
                    page.locator('[data-tab=layout]').click()
                    expect(page.locator('#selected-box option')).to_have_count(8)
                    page.locator('#csv-file').set_input_files(str(ROOT / 'demo/v2/campus-food-web-cards.csv'))
                    expect(page.locator('#sample-row option')).to_have_count(22)
                    page.locator('#asset-files').set_input_files([str(p) for p in (ROOT / 'demo/v2/graphics').glob('*.png')])
                    expect(page.locator('#asset-status')).to_contain_text('22 image assets ready', timeout=60000)
                    page.locator('#save-layout').click()
                    expect(page.locator('#layout-state')).to_contain_text('Saved')
                    page.locator('#validate-import').click()
                    expect(page.locator('#import-summary')).to_contain_text('22 rows ready · 48 copies')
                    page.locator('#commit-import').click()
                    expect(page.locator('#studio-status')).to_contain_text('22 created', timeout=30000)
                    project_id = page.locator('#studio-project').input_value()
                    page.locator('[data-tab=print]').click()
                    expect(page.locator('#tab-print')).to_be_visible()
                    expect(page.locator('#selection-summary')).to_contain_text('0 cards shown')
                    page.locator('#include-imported').check()
                    expect(page.locator('#print-cards tr')).to_have_count(22)
                    page.locator('#select-visible').click()
                    expect(page.locator('#selection-summary')).to_contain_text('48 printable copies · 8 sheets')
                    page.locator('#check-print').click()
                    expect(page.locator('#print-status')).to_contain_text('Ready to download', timeout=60000)
                    expect(page.locator('#print-warnings li')).to_have_count(22)
                    with page.expect_download(timeout=60000) as download:
                        page.locator('#download-print').click()
                    target = OUTPUT / 'campus-food-web-print-sheets.pdf'
                    download.value.save_as(target)
                    pdf = PdfReader(target)
                    assert len(pdf.pages) == 8
                    assert all(tuple(p.mediabox) == (0, 0, 792, 612) for p in pdf.pages)
                    assert all(len(p.images) >= 1 for p in pdf.pages)
                    page.locator('#expand-copies').uncheck()
                    expect(page.locator('#selection-summary')).to_contain_text('22 printable copies · 4 sheets')
                    expect(page.locator('#download-print')).to_be_disabled()
                    page.locator('#clear-selection').click()
                    expect(page.locator('#check-print')).to_be_disabled()
                    page.locator('#include-imported').uncheck()
                    expect(page.locator('#print-cards tr')).to_have_count(0)
                    assert not errors, errors
                    assert not external, external
                    page.screenshot(path='/tmp/card-print-page.png', full_page=True)
                    browser.close()
                    print(f'{engine}: print selection, 22/48/8 PDF export, eligibility, warning display, copy toggle, download and offline checks passed. {target}')
            finally:
                server.terminate()
                server.wait(timeout=10)


if __name__ == '__main__':
    main()


