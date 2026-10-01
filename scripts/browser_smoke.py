"""End-to-end check with a disposable server/database and external requests blocked."""
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


def main():
    with tempfile.TemporaryDirectory(prefix="card-app-smoke-") as temporary:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        origin = f"http://127.0.0.1:{port}"
        environment = {**os.environ, "CARD_APP_DATA_DIR": temporary, "CARD_APP_TEACHER_PIN": "123456", "CARD_APP_PORT": str(port)}
        with open(Path(temporary) / "server.log", "w+") as log:
            server = subprocess.Popen([sys.executable, "run.py"], cwd=ROOT, env=environment, stdout=log, stderr=log)
            try:
                for _ in range(80):
                    if server.poll() is not None:
                        log.seek(0)
                        raise RuntimeError(log.read())
                    try:
                        with urlopen(origin + "/api/health", timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(.1)
                else:
                    raise RuntimeError("Test server did not become ready.")
                with sync_playwright() as playwright:
                    executable = os.environ.get("CARD_APP_TEST_BROWSER") or shutil.which("google-chrome") or shutil.which("chromium")
                    browser = playwright.chromium.launch(executable_path=executable, headless=True)
                    context = browser.new_context(viewport={"width": 1180, "height": 900})
                    external, errors = [], []

                    def local_only(route):
                        if not route.request.url.startswith(origin + "/"):
                            external.append(route.request.url)
                            route.abort()
                        else:
                            route.continue_()

                    context.route("**/*", local_only)
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(origin)
                    expect(page.locator("#home-card svg")).to_be_visible()
                    screenshot_dir = Path(os.environ.get("CARD_APP_SCREENSHOTS", "/tmp/card-app-screenshots"))
                    screenshot_dir.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(screenshot_dir / "home.png"), full_page=True)
                    page.goto(origin + "/preview")
                    expect(page.locator("#fit-status")).to_contain_text("Text fits")
                    card = page.locator("#card-preview svg")
                    box = card.bounding_box()
                    assert abs(box["width"] / box["height"] - 5 / 7) < .001
                    page.screenshot(path=str(screenshot_dir / "student-landscape.png"), full_page=True)
                    for name in ["Sky", "Sand", "Rose", "Lavender", "Sage"]:
                        page.get_by_role("radio", name=name, exact=True).check()
                        expect(page.locator("#fit-status")).to_contain_text("Text fits")
                    page.get_by_label("Common name", exact=True).fill("W" * 48)
                    expect(page.locator("#issues")).to_contain_text("does not fit")
                    assert page.get_by_label("Common name", exact=True).input_value() == "W" * 48
                    assert card.locator('[data-field="title"]').get_attribute("data-font-size") == "11.5"
                    page.locator("#example").select_option(label="Campus Food Web · Aphids")  # Aphids: source text exceeds the nominal section limit.
                    expect(page.locator("#issues")).to_contain_text("the limit is")
                    assert len(page.locator("#section_2_text").input_value()) > 150
                    page.locator("#example").select_option("0")
                    expect(page.locator("#fit-status")).to_contain_text("Text fits")
                    for width, height, name in [(1024, 768, "ipad-landscape"), (768, 1024, "ipad-portrait"), (390, 844, "phone")]:
                        page.set_viewport_size({"width": width, "height": height})
                        page.evaluate("window.scrollTo(0, 0)")
                        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                        box = card.bounding_box()
                        assert abs(box["width"] / box["height"] - 5 / 7) < .001
                        form_box = page.locator(".form-panel").bounding_box()
                        preview_box = page.locator(".preview-panel").bounding_box()
                        if width <= 900:
                            assert form_box["y"] > preview_box["y"] + preview_box["height"]
                        else:
                            assert form_box["x"] < preview_box["x"]
                        page.screenshot(path=str(screenshot_dir / f"{name}.png"), full_page=True)
                    page.set_viewport_size({"width": 1180, "height": 900})
                    page.goto(origin + "/teacher")
                    expect(page).to_have_url(origin + "/teacher/login")
                    page.get_by_label("Teacher PIN", exact=True).fill("123456")
                    page.get_by_role("button", name="Open teacher space").click()
                    expect(page.get_by_role('heading', name='Projects', exact=True)).to_be_visible()
                    page.get_by_role('button', name='Open project').first.click()
                    expect(page.locator("#database-state")).to_contain_text("ready")
                    page.screenshot(path=str(screenshot_dir / "teacher.png"), full_page=True)
                    page.get_by_role("button", name="Sign out").click()
                    expect(page).to_have_url(origin + "/teacher/login")
                    page.goto(origin + "/preview")
                    expect(page.locator("#fit-status")).to_contain_text("Text fits")
                    context.set_offline(True)
                    page.locator("#title").fill("Disconnected preview")
                    expect(page.locator("#page-error")).to_contain_text("Cannot reach")
                    expect(page.locator("#fit-status")).to_contain_text("out of date")
                    context.set_offline(False)
                    page.locator("#title").fill("Back online")
                    expect(page.locator("#fit-status")).to_contain_text("Text fits")
                    assert not external, external
                    assert not errors, errors
                    browser.close()
                    print(f"Browser checks passed. No external requests. Screenshots: {screenshot_dir}")
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == "__main__":
    main()



