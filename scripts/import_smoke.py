"""Browser acceptance for teacher layout/CSV workflows; never uses classroom data."""
import base64
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

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path('/tmp/card-import-screenshots')


def main():
    OUTPUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='card-import-smoke-') as temporary:
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
                    page.get_by_role('link', name='Layout & CSV studio').click()
                    expect(page.locator('#selected-box option')).to_have_count(8)
                    page.locator('#csv-file').set_input_files(str(ROOT / 'demo/v2/campus-food-web-cards.csv'))
                    expect(page.locator('#sample-row option')).to_have_count(22)
                    page.locator('#asset-files').set_input_files([str(p) for p in (ROOT / 'demo/v2/graphics').glob('*.png')])
                    expect(page.locator('#asset-status')).to_contain_text('22 image assets ready', timeout=60000)
                    expect(page.locator('#layout-art image')).to_be_visible()
                    page.locator('#selected-box').select_option('image')
                    expect(page.locator('#box-inches')).to_have_text('2.13 × 1.48 inches')
                    page.locator('#selected-box').select_option('common_name')
                    page.locator('#font-size').fill('9.5')
                    page.locator('#font-size').press('Tab')
                    # Exercise pointer movement and numeric geometry together.
                    target = page.locator('.layout-box[data-key="common_name"]')
                    bounds = target.bounding_box()
                    page.mouse.move(bounds['x']+20, bounds['y']+10)
                    page.mouse.down()
                    page.mouse.move(bounds['x']+22, bounds['y']+12)
                    page.mouse.up()
                    assert float(page.locator('#box-y').input_value()) > 9
                    page.locator('#box-y').fill('9')
                    page.locator('#box-y').press('Tab')
                    for element, value in [('#card-radius', '14'), ('#image-radius', '12'), ('#card-border-width', '2'), ('#image-border-width', '1.5')]:
                        page.locator(element).fill(value)
                        page.locator(element).press('Tab')
                    expect(page.locator('#layout-art [data-role="image-placeholder"]')).to_have_count(0)
                    expect(page.locator('#layout-art [data-role="card-border"]')).to_have_attribute('stroke-width', '2.0')
                    expect(page.locator('#layout-art #image-frame rect')).to_have_attribute('rx', '12.0')
                    page.locator('#save-layout').click()
                    expect(page.locator('#layout-state')).to_contain_text('Saved · version 1')
                    for element, filename in [('#download-template', 'template.csv'), ('#download-xlsx', 'template.xlsx')]:
                        with page.expect_download() as download:
                            page.locator(element).click()
                        download.value.save_as(OUTPUT / filename)
                    page.locator('#sample-row').select_option('5')
                    page.locator('#show-boxes').uncheck()
                    expect(page.locator('#layout-art svg')).to_have_attribute('aria-label', 'Card preview: Monarch Butterfly')
                    page.locator('#layout-canvas').screenshot(path=str(OUTPUT / 'monarch.png'))
                    page.locator('#validate-import').click()
                    expect(page.locator('#import-summary')).to_contain_text('22 rows ready · 48 copies')
                    assert page.locator('#studio-error').inner_text() == ''
                    page.locator('#commit-import').click()
                    expect(page.locator('#studio-status')).to_contain_text('22 created', timeout=30000)
                    expect(page.locator('#studio-status')).to_contain_text('0 cards need')
                    expect(page.locator('#saved-card option')).to_have_count(23)
                    page.locator('#validate-import').click()
                    expect(page.locator('#import-summary')).to_contain_text('0 rows ready')
                    page.locator('#commit-import').click()
                    expect(page.locator('#studio-status')).to_contain_text('22 skipped')
                    project_id = page.locator('#studio-project').input_value()
                    page.goto(origin + '/teacher/studio?project=' + project_id)
                    expect(page.locator('#saved-card option')).to_have_count(23)
                    expect(page.locator('#card-radius')).to_have_value('14')
                    expect(page.locator('#image-radius')).to_have_value('12')
                    expect(page.locator('#card-border-width')).to_have_value('2')
                    expect(page.locator('#image-border-width')).to_have_value('1.5')
                    page.locator('#saved-card').select_option(label='Rainstorm')
                    expect(page.locator('#layout-art svg')).to_have_attribute('aria-label', 'Card preview: Rainstorm')
                    expect(page.locator('#layout-art image')).to_be_visible()
                    expect(page.locator('#layout-art [data-role="image-placeholder"]')).to_have_count(0)
                    page.locator('#show-boxes').uncheck()
                    page.locator('#layout-canvas').screenshot(path=str(OUTPUT / 'rainstorm.png'))
                    page.locator('#saved-card').select_option(label='Aphids')
                    expect(page.locator('#layout-art svg')).to_have_attribute('aria-label', 'Card preview: Aphids')
                    page.locator('#show-boxes').uncheck()
                    page.locator('#layout-canvas').screenshot(path=str(OUTPUT / 'aphids.png'))
                    page.locator('#show-boxes').check()
                    page.locator('#selected-box').select_option('mechanic_1')
                    page.locator('#font-size').fill('6.4')
                    page.locator('#font-size').press('Tab')
                    page.locator('#save-layout').click()
                    expect(page.locator('#layout-state')).to_contain_text('version 2')
                    page.locator('#layout-canvas').scroll_into_view_if_needed()
                    page.screenshot(path=str(OUTPUT / 'layout-studio.png'))
                    page.goto(origin + '/teacher')
                    page.locator('#filter-project').select_option(project_id)
                    expect(page.locator('#list-summary')).to_contain_text('22 matching cards')
                    page.get_by_role('button', name='Review Aphids by Teacher import').click()
                    expect(page.locator('#review-title')).to_have_text('Aphids')
                    expect(page.locator('.live-card image')).to_be_visible()
                    page.locator('#approve-card').click()
                    expect(page.locator('#review-status')).to_have_text('Approved')
                    # Check a fresh student can use the same v2 project.
                    page.goto(origin + '/student?project=' + project_id)
                    expect(page.locator('#common_name')).to_be_visible()
                    page.locator('#student_name').fill('Demo Student')
                    page.locator('#class_name').fill('Period 1')
                    page.locator('#common_name').fill('New organism')
                    page.locator('#save-draft').click()
                    expect(page.locator('#save-state')).to_contain_text('Draft saved')
                    page.goto(origin + '/teacher/studio')
                    expect(page.locator('#selected-box option')).to_have_count(8)
                    page.locator('#csv-file').set_input_files({'name': 'quiz.csv', 'mimeType': 'text/csv', 'buffer': b'Prompt,Answer,card_id,copies\nWhat is a producer?,A plant.,question-1,2\n'})
                    expect(page.locator('#sample-row option')).to_have_count(1)
                    page.get_by_text('Suggest a layout from my CSV columns', exact=True).click()
                    page.locator('#suggest-layout').click()
                    expect(page.locator('#selected-box option')).to_have_count(3)
                    page.locator('#layout-title').fill('Custom quiz')
                    page.locator('#selected-box').select_option('answer')
                    page.locator('.layout-box.selected .resize-handle').scroll_into_view_if_needed()
                    handle = page.locator('.layout-box.selected .resize-handle').bounding_box()
                    page.mouse.move(handle['x']+8, handle['y']+8)
                    page.mouse.down()
                    page.mouse.move(handle['x']-12, handle['y']+8)
                    page.mouse.up()
                    assert float(page.locator('#box-w').input_value()) < 153.36
                    page.locator('#save-layout').click()
                    expect(page.locator('#layout-state')).to_contain_text('Saved')
                    page.locator('#validate-import').click()
                    expect(page.locator('#import-summary')).to_contain_text('1 rows ready · 2 copies')
                    page.locator('#commit-import').click()
                    expect(page.locator('#studio-status')).to_contain_text('1 created')
                    page.goto(origin + '/demo')
                    expect(page.locator('#demo-card svg')).to_have_attribute('aria-label', 'Card preview: Monarch Butterfly')
                    assert not errors, errors
                    assert not external, external
                    # Contact sheet is for visual QA only; generated assets are unchanged.
                    gallery = browser.new_page(viewport={'width': 1400, 'height': 1180})
                    content = '<html><body style="margin:12px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;font:14px sans-serif">'
                    for path in sorted((ROOT / 'demo/v2/graphics').glob('*.png')):
                        content += '<div><img style="width:100%" src="data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode() + '"><p>' + path.stem + '</p></div>'
                    gallery.set_content(content + '</body></html>')
                    gallery.screenshot(path=str(OUTPUT / 'artwork-contact-sheet.png'), full_page=True)
                    browser.close()
                    print(f'{engine}: import, 22/48 totals, images, layout drag/edit/reopen, CSV/XLSX exports, duplicate skip, approval, and v2 student save passed. No external requests.')
            finally:
                server.terminate()
                server.wait(timeout=10)


if __name__ == '__main__':
    main()


