"""Real browser acceptance for milestones 3–4; all data is disposable."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent


def main():
    with tempfile.TemporaryDirectory(prefix='card-workflow-') as temporary:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        origin = f'http://127.0.0.1:{port}'
        env = {**os.environ, 'CARD_APP_DATA_DIR': temporary, 'CARD_APP_TEACHER_PIN': '123456', 'CARD_APP_PORT': str(port)}
        photo = Path(temporary) / 'test-photo.jpg'
        image = Image.new('RGB', (800, 600), '#53774b')
        image.paste('#e6b95e', (0, 0, 300, 300))
        image.save(photo)
        with open(Path(temporary) / 'server.log', 'w+') as log:
            server = subprocess.Popen([sys.executable, 'run.py'], cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        with urlopen(origin + '/api/health', timeout=1):
                            break
                    except OSError:
                        if server.poll() is not None:
                            log.seek(0)
                            raise RuntimeError(log.read())
                        time.sleep(.1)
                with sync_playwright() as playwright:
                    engine = os.environ.get('CARD_APP_TEST_ENGINE', 'chromium')
                    executable = (os.environ.get('CARD_APP_TEST_BROWSER') or shutil.which('google-chrome') or shutil.which('chromium')) if engine == 'chromium' else None
                    browser = getattr(playwright, engine).launch(executable_path=executable, headless=True)
                    external, errors = [], []

                    def local_only(route):
                        if not route.request.url.startswith(origin + '/'):
                            external.append(route.request.url)
                            route.abort()
                        else:
                            route.continue_()

                    student_context = browser.new_context(viewport={'width': 1024, 'height': 768}, has_touch=True)
                    teacher_context = browser.new_context(viewport={'width': 1280, 'height': 900})
                    for context in [student_context, teacher_context]:
                        context.route('**/*', local_only)
                    student, teacher = student_context.new_page(), teacher_context.new_page()
                    for page in [student, teacher]:
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('dialog', lambda dialog: dialog.accept())
                    student.goto(origin + '/student')
                    expect(student.locator('#save-draft')).to_be_enabled()
                    student.locator('#student_name').fill('Ada Student')
                    student.locator('#class_name').fill('Period 2')
                    student.locator('#title').fill('Garden butterfly')
                    student.locator('#scientific_name').fill('Danaus plexippus')
                    student.locator('#section_1_text').fill('Bright wings warn predators.')
                    student.locator('.image-file').set_input_files(str(photo))
                    expect(student.locator('.live-card image')).to_be_visible()
                    student.locator('.rotate').click()
                    student.locator('.crop-zoom').focus()
                    student.locator('.crop-zoom').press('ArrowRight')
                    # Commit the first save, but simulate losing its response.
                    def lose_save_response(route):
                        response = route.fetch()
                        assert response.status == 200
                        route.abort()
                    student.route(origin + '/api/student/card', lose_save_response, times=1)
                    student.locator('#save-draft').click()
                    expect(student.locator('#page-error')).to_contain_text('Cannot reach')
                    student.locator('#save-draft').click()
                    expect(student.locator('#save-state')).to_contain_text('Draft saved')
                    code = student.locator('#recovery-code').input_value()
                    student.reload()
                    expect(student.locator('#title')).to_have_value('Garden butterfly')
                    expect(student.locator('.live-card image')).to_be_visible()
                    expect(student.locator('.crop-zoom')).to_have_value('1.05')
                    student.locator('#section_1_text').fill('Unsaved text survives reopening.')
                    student.reload()
                    expect(student.locator('#section_1_text')).to_have_value('Unsaved text survives reopening.')
                    expect(student.locator('#save-state')).to_contain_text('Recovered unsaved')
                    student_context.set_offline(True)
                    student.locator('#section_1_text').fill('Offline text remains here.')
                    student.locator('#load-latest').click()
                    expect(student.locator('#page-error')).to_contain_text('Cannot reach')
                    expect(student.locator('#section_1_text')).to_have_value('Offline text remains here.')
                    student.locator('#save-draft').click()
                    expect(student.locator('#page-error')).to_contain_text('Cannot reach')
                    student_context.set_offline(False)
                    student.locator('#save-draft').click()
                    expect(student.locator('#save-state')).to_contain_text('Draft saved')
                    student.locator('#submit-card').click()
                    expect(student.locator('#card-status')).to_have_text('Submitted')
                    expect(student.locator('#title')).to_be_disabled()

                    teacher.goto(origin + '/teacher')
                    teacher.locator('#pin').fill('123456')
                    teacher.get_by_role('button', name='Open teacher space').click()
                    expect(teacher.locator('#list-summary')).to_contain_text('1 matching')
                    teacher.locator('#filter-status').select_option('Submitted')
                    teacher.locator('#filter-class').select_option('Period 2')
                    teacher.get_by_role('button', name='Review Garden butterfly by Ada Student').click()
                    expect(teacher.locator('.live-card image')).to_be_visible()
                    teacher.locator('#revision-note').fill('Please give a specific adaptation.')
                    teacher.locator('#request-revision').click()
                    expect(teacher.locator('#review-status')).to_have_text('Needs Revision')
                    student.reload()
                    expect(student.locator('#card-status')).to_have_text('Needs Revision')
                    expect(student.locator('#teacher-note')).to_contain_text('specific adaptation')
                    expect(student.locator('#title')).to_be_enabled()
                    student.locator('#section_1_text').fill('Bright wing colors warn predators.')
                    student.locator('#submit-card').click()
                    expect(student.locator('#card-status')).to_have_text('Submitted')
                    teacher.locator('#reload-card').click()
                    expect(teacher.locator('#review-status')).to_have_text('Submitted')
                    teacher.locator('#title').fill('Reviewed butterfly')
                    teacher.locator('#save-edits').click()
                    expect(teacher.locator('#review-title')).to_have_text('Reviewed butterfly')
                    teacher.locator('#approve-card').click()
                    expect(teacher.locator('#review-status')).to_have_text('Approved')
                    student.reload()
                    expect(student.locator('#card-status')).to_have_text('Approved')
                    expect(student.locator('#title')).to_have_value('Reviewed butterfly')

                    # A separate browser can restore the same card only with its edit key.
                    recovery_context = browser.new_context()
                    recovery_context.route('**/*', local_only)
                    recovery = recovery_context.new_page()
                    recovery.goto(origin + '/student')
                    expect(recovery.locator('#save-draft')).to_be_enabled()
                    recovery.locator('.recovery summary').click()
                    recovery.locator('#restore-code').fill(code)
                    recovery.locator('#restore-card').click()
                    expect(recovery.locator('#title')).to_have_value('Reviewed butterfly')
                    expect(recovery.locator('#card-status')).to_have_text('Approved')

                    screenshots = Path('/tmp/card-workflow-screenshots')
                    screenshots.mkdir(exist_ok=True)
                    student.evaluate('window.scrollTo(0,0)')
                    student.screenshot(path=str(screenshots / 'student-landscape.png'), full_page=True)
                    for width, height in [(768, 1024), (390, 844)]:
                        student.set_viewport_size({'width': width, 'height': height})
                        student.evaluate('window.scrollTo(0,0)')
                        assert student.evaluate('document.documentElement.scrollWidth <= innerWidth')
                        rect = student.locator('.live-card svg').bounding_box()
                        assert abs(rect['width'] / rect['height'] - 5 / 7) < .001
                    student.screenshot(path=str(screenshots / 'student-narrow.png'), full_page=True)
                    teacher.screenshot(path=str(screenshots / 'teacher-review.png'), full_page=True)
                    teacher.locator('.project-settings summary').first.click()
                    expect(teacher.locator('#student-qr')).to_be_visible()
                    teacher.locator('#directions').fill('New class directions: look closely.')
                    teacher.locator('#save-project').click()
                    expect(teacher.locator('#teacher-message')).to_contain_text('Project settings saved')
                    expect(teacher.locator('#review-status')).to_have_text('Submitted')
                    teacher.locator('#delete-card').click()
                    expect(teacher.locator('#teacher-message')).to_contain_text('Card removed')
                    student.locator('#load-latest').click()
                    expect(student.locator('#page-error')).to_contain_text('deleted')
                    student.reload()
                    expect(student.locator('#page-error')).to_contain_text('previously opened card was deleted')
                    expect(student.locator('#save-draft')).to_be_enabled()
                    expect(student.locator('#title')).to_have_value('')
                    assert not external, external
                    assert not errors, errors
                    browser.close()
                    print(f'{engine}: draft/reload/recovery, upload/crop, submit/revise/edit/approve/delete, settings, offline recovery, and responsive checks passed. No external requests.')
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == '__main__':
    main()

