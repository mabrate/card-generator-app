"""Browser acceptance for the requested upgrades; never uses classroom data."""
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
OUTPUT = Path('/tmp/card-upgrade-proofs')


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
                    expect(page.locator('#layout-preset option')).to_have_count(10)
                    expect(page.locator('#studio-project')).to_have_value('')
                    page.locator('#layout-preset').select_option('creature-rounded')
                    page.locator('#new-layout').click()
                    expect(page.locator('#selected-box option')).to_have_count(7)
                    page.locator('#layout-title').fill('Upgrade proof')
                    page.get_by_text('Add a content box', exact=True).click()
                    page.locator('#new-key').fill('note')
                    page.locator('#add-box').click()
                    expect(page.locator('#selected-box')).to_have_value('note')
                    page.locator('#selected-box').select_option('name')
                    page.locator('#text-align').select_option('center')
                    page.locator('#box-alignment').select_option('center')
                    page.locator('#align-box').click()
                    expect(page.locator('#box-x')).to_have_value('34')
                    page.locator('#save-layout').click()
                    expect(page.locator('#layout-state')).to_contain_text('Saved · version 1')
                    project_id = page.locator('#studio-project').input_value()
                    csv = b'name,health,type,ability,action,stats,note,card_id,copies\nForest Fox,50,Mammal,Move through the forest.,Explore a new area.,Speed 3,Original note,fox,2\nRiver Otter,60,Mammal,Swim through the river.,Gather one fish.,Speed 4,,otter,3\n'
                    page.locator('#csv-file').set_input_files({'name': 'cards.csv', 'mimeType': 'text/csv', 'buffer': csv})
                    expect(page.locator('#sample-row option')).to_have_count(2)
                    page.locator('#validate-import').click()
                    expect(page.locator('#import-summary')).to_contain_text('2 rows ready · 5 copies')
                    page.locator('#commit-import').click()
                    expect(page.locator('#studio-status')).to_contain_text('2 created')
                    # Delete a populated field from a saved project; preserve its source in history.
                    page.locator('#selected-box').select_option('note')
                    page.locator('#delete-box').click()
                    expect(page.locator('#selected-box option')).to_have_count(7)
                    page.locator('#save-layout').click()
                    expect(page.locator('#layout-state')).to_contain_text('Saved · version 2')
                    # The dropdown opens the selected project immediately and the name tracks it.
                    page.locator('#studio-project').select_option('field-guide')
                    expect(page.locator('#layout-title')).to_have_value('Classroom field guide')
                    page.locator('#studio-project').select_option(project_id)
                    expect(page.locator('#layout-title')).to_have_value('Upgrade proof')
                    page.locator('#selected-box').select_option('name')
                    expect(page.locator('#text-align')).to_have_value('center')
                    expect(page.locator('#box-x')).to_have_value('34')
                    page.locator('#saved-card').select_option(label='Forest Fox')
                    expect(page.locator('#layout-art svg')).to_have_attribute('aria-label', 'Card preview: Forest Fox')
                    page.evaluate('window.scrollTo(0,0)')
                    page.screenshot(path=str(OUTPUT / 'studio.png'), full_page=True)
                    page.set_viewport_size({'width': 390, 'height': 844})
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    page.evaluate('window.scrollTo(0,0)')
                    expect(page.locator('#save-layout')).to_be_in_viewport()
                    page.screenshot(path=str(OUTPUT / 'studio-mobile.png'))
                    page.set_viewport_size({'width': 1280, 'height': 1000})
                    page.goto(origin + '/teacher')
                    page.locator('#filter-project').select_option(project_id)
                    expect(page.locator('#card-list tr')).to_have_count(2)
                    page.get_by_role('button', name='Review Forest Fox by Teacher import').click()
                    expect(page.locator('.image-tools')).to_be_visible()
                    photo = ROOT / 'demo/v2/graphics/monarch-butterfly.png'
                    if not photo.exists():
                        photo = next((ROOT / 'demo/v2/graphics').glob('*.png'))
                    page.locator('.image-file').set_input_files(str(photo))
                    expect(page.locator('.image-name')).to_contain_text(photo.name)
                    page.locator('.crop-zoom').fill('1.5')
                    page.locator('.crop-x').fill('0.2')
                    page.locator('.crop-y').fill('0.8')
                    page.locator('.rotate').click()
                    page.locator('#student_name').fill('Taylor')
                    page.locator('#class_name').fill('Period 4')
                    page.locator('#card-copies').fill('9')
                    page.locator('#save-edits').click()
                    expect(page.locator('#teacher-message')).to_have_text('Teacher edits saved.')
                    expect(page.locator('#card-copies')).to_have_value('9')
                    expect(page.locator('.crop-zoom')).to_have_value('1.5')
                    expect(page.locator('.crop-x')).to_have_value('0.2')
                    expect(page.locator('.crop-y')).to_have_value('0.8')
                    expect(page.locator('.rotate')).to_contain_text('90° now')
                    expect(page.locator('#student_name')).to_have_value('Taylor')
                    page.screenshot(path=str(OUTPUT / 'review.png'), full_page=True)
                    page.locator('.project-settings summary').first.click()
                    page.locator('#settings-project').select_option(project_id)
                    expect(page.locator('#project-title')).to_have_value('Upgrade proof')
                    page.locator('#import-identity summary').click()
                    page.locator('#apply-student').check()
                    page.locator('#import-student').fill('Jordan')
                    page.locator('#apply-class').check()
                    page.locator('#import-class').fill('Biology')
                    page.locator('#save-import-identity').click()
                    expect(page.locator('#teacher-message')).to_contain_text('updated on 2 imported cards')
                    expect(page.locator('#student_name')).to_have_value('Jordan')
                    # Project settings support adding and deleting fields too.
                    page.get_by_text('Add a field', exact=True).click()
                    page.locator('#new-field-key').fill('habitat')
                    page.locator('#new-field-label').fill('Habitat')
                    page.locator('#add-project-field').click()
                    page.locator('#save-project').click()
                    expect(page.locator('#teacher-message')).to_contain_text('Project settings saved')
                    habitat = page.locator('.field-config').filter(has=page.locator('summary', has_text='Habitat'))
                    habitat.locator('summary').click()
                    habitat.get_by_role('button', name='Delete field').click()
                    page.locator('#save-project').click()
                    expect(page.locator('#teacher-message')).to_contain_text('Project settings saved')
                    expect(page.locator('#habitat')).to_have_count(0)
                    # Export both modes, with quantity expansion and the replacement image.
                    page.goto(origin + '/teacher/print')
                    page.locator('#print-project').select_option(project_id)
                    page.locator('#include-imported').check()
                    expect(page.locator('#print-cards tr')).to_have_count(2)
                    page.locator('#select-visible').click()
                    expect(page.locator('#selection-summary')).to_contain_text('12 printable copies · 2 sheets')
                    for monochrome, name in [(False, 'color-proof.pdf'), (True, 'grayscale-proof.pdf')]:
                        if monochrome:
                            page.locator('#black-and-white').check()
                            expect(page.locator('#download-print')).to_be_disabled()
                        page.locator('#check-print').click()
                        expect(page.locator('#print-status')).to_contain_text('Ready to download', timeout=60000)
                        with page.expect_download(timeout=60000) as download:
                            page.locator('#download-print').click()
                        download.value.save_as(OUTPUT / name)
                    assert not errors, errors
                    assert not external, external
                    browser.close()
                    print('Chromium: presets, project switching, both field editors, alignment, Review image/crop/identity/quantity, bulk identity, and color/grayscale export passed.')
            finally:
                server.terminate()
                server.wait(timeout=10)


if __name__ == '__main__':
    main()


