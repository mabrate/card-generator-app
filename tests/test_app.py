import copy
import csv
import json
import time
from concurrent.futures import ThreadPoolExecutor
from xml.etree import ElementTree as ET

import pytest
from fastapi.testclient import TestClient

from app import auth, db
from app.config import ROOT, SAMPLE, TEMPLATE, THEMES
from app.examples import examples
from app.main import create_app
from app.rendering import render_card

HEADERS = {"X-Card-App": "1"}


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path, "123456")) as client:
        yield client


def render(values=None, labels=None, theme=None, template=None):
    return render_card(values if values is not None else SAMPLE, labels or {}, theme or THEMES[0], template or TEMPLATE)


def test_canonical_geometry_and_sample_fit():
    result = render()
    assert result["valid"], result["issues"]
    root = ET.fromstring(result["svg"])
    assert (root.attrib["width"], root.attrib["height"], root.attrib["viewBox"]) == ("2.5in", "3.5in", "0 0 180 252")
    assert not root.findall(".//{*}text")
    assert not root.findall(".//{*}image")
    fields = {node.attrib["data-field"]: node for node in root.findall(".//*[@data-field]")}
    assert all(key in fields for key in SAMPLE)
    assert fields["scientific_name"].attrib["data-font-size"] == "7.5"


def test_actual_overflow_even_within_character_limit_and_no_shrinking():
    values = {**SAMPLE, "title": "W" * 48}
    result = render(values)
    assert result["values"]["title"] == values["title"]
    assert any(i["field"] == "title" and i["code"] == "overflow" for i in result["issues"])
    assert not any(i["code"] == "character_limit" for i in result["issues"])
    assert 'data-field="title" data-font-size="11.5"' in result["svg"]
    assert "stroke-dasharray" in result["svg"]


def test_limits_required_and_unsupported_glyphs():
    result = render({**SAMPLE, "title": "", "section_1_text": "x" * 151, "category": "Hello 🦋"})
    assert {issue["code"] for issue in result["issues"]} >= {"required", "character_limit", "unsupported_glyph"}
    assert len(result["values"]["section_1_text"]) == 151


def test_labels_and_limits_are_configuration():
    template = copy.deepcopy(TEMPLATE)
    template["fields"][7]["label"] = "Habitat notes"
    template["fields"][7]["max_chars"] = 10
    result = render(template=template)
    assert "Habitat notes" in result["svg"]
    assert any("limit is 10" in issue["message"] for issue in result["issues"])
    override = render(labels={"section_1_text": "Host Plant"})
    assert "Host Plant" in override["svg"]
    assert "Adaptations" not in override["svg"]


def test_all_themes_preserve_geometry_and_type():
    results = [ET.fromstring(render(theme=theme)["svg"]) for theme in THEMES]
    for root in results[1:]:
        assert root.attrib == results[0].attrib
        assert [e.attrib for e in root.findall(".//{*}use")] == [e.attrib for e in results[0].findall(".//{*}use")]


def test_xml_escaping_and_long_newline_input():
    result = render({**SAMPLE, "title": '<script>alert("x")</script>', "section_1_text": "\n" * 60})
    root = ET.fromstring(result["svg"])
    assert not root.findall(".//{*}script")
    assert any(i["field"] == "section_1_text" and i["code"] == "overflow" for i in result["issues"])


def test_fixture_totals_and_source_preservation():
    with (ROOT / "demo" / "source" / "campus-food-web-cards.csv").open(newline="", encoding="utf-8-sig") as source:
        rows = list(csv.DictReader(source))
    assert len(rows) == len({r["card_id"] for r in rows}) == 22
    assert sum(int(row["copies"]) for row in rows) == 48
    for kind, count, copies in [("organism", 15, 40), ("effect", 7, 8)]:
        group = [r for r in rows if r["card_kind"] == kind]
        assert len(group) == count
        assert sum(int(r["copies"]) for r in group) == copies
    for row, example in zip(rows, examples()[1:]):
        result = render(example["values"], example["labels"])
        ET.fromstring(result["svg"])
        for key, value in result["values"].items():
            assert value == row[key]
    structured = json.loads((ROOT / "demo" / "source" / "campus-food-web-cards.json").read_text())
    assert len(structured["cards"]) == 22
    assert sum(card["copies"] for card in structured["cards"]) == 48


def test_routes_assets_and_auth_boundary(client):
    for path in ["/", "/student", "/teacher/login", "/static/app.js", "/static/app.css", "/api/project", "/api/examples", "/api/health"]:
        response = client.get(path)
        assert response.status_code == 200
        assert "default-src 'self'" in response.headers["content-security-policy"]
    assert client.get("/teacher", follow_redirects=False).status_code == 303
    assert client.get("/api/teacher/dashboard").status_code == 401
    assert client.get("/static/teacher.html").status_code == 404
    assert client.get("/data/app.sqlite").status_code == 404
    assert client.post("/api/teacher/login", json={"pin": "123456"}).status_code == 403
    assert client.post("/api/teacher/login", headers=HEADERS, json={"pin": "654321"}).status_code == 401
    result = client.post("/api/teacher/login", headers=HEADERS, json={"pin": "123456"})
    assert result.status_code == 200
    assert "HttpOnly" in result.headers["set-cookie"] and "SameSite=strict" in result.headers["set-cookie"]
    assert client.get("/teacher").status_code == 200
    assert client.get("/api/teacher/dashboard").json()["journal_mode"] == "wal"
    token = client.cookies.get("card_teacher")
    assert client.post("/api/teacher/logout", headers=HEADERS).status_code == 200
    client.cookies.set("card_teacher", token)
    assert client.get("/api/teacher/dashboard").status_code == 401


def test_login_throttle(client):
    for _ in range(5):
        assert client.post("/api/teacher/login", headers=HEADERS, json={"pin": "999999"}).status_code == 401
    assert client.post("/api/teacher/login", headers=HEADERS, json={"pin": "123456"}).status_code == 429


def test_api_validates_and_preserves_invalid_content(client):
    body = {"values": {**SAMPLE, "title": "W" * 49}}
    response = client.post("/api/preview", headers=HEADERS, json=body)
    assert response.status_code == 200 and not response.json()["valid"]
    assert response.json()["values"] == body["values"]
    for invalid in [
        {"values": SAMPLE, "theme": "anything"},
        {"values": {"unknown": "x"}},
        {"values": {"title": "x" * 2001}},
        {"values": {"title": "\x00"}},
        {"values": SAMPLE, "labels": {"title": "not a label slot"}},
        {"values": SAMPLE, "font_size": 2},
    ]:
        assert client.post("/api/preview", headers=HEADERS, json=invalid).status_code == 422
    assert client.post("/api/preview", headers=HEADERS, content=b"x" * 32769).status_code == 413


def test_database_restart_migration_and_pin_reset(tmp_path):
    path = tmp_path / "app.sqlite"
    db.initialize(path)
    generated = auth.configure_pin(path)
    assert generated and auth.verify_pin(path, generated)
    assert auth.configure_pin(path) is None
    token = auth.create_session(path)
    with db.connect(path) as connection:
        connection.execute("UPDATE projects SET title='My persisted project'")
        stored = connection.execute("SELECT value FROM settings WHERE key='teacher_pin'").fetchone()[0]
        assert generated not in stored
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 3
    db.initialize(path)
    assert db.project(path)["title"] == "My persisted project"
    assert auth.authenticated(path, token)
    auth.configure_pin(path, "654321")
    assert not auth.authenticated(path, token)
    assert auth.verify_pin(path, "654321")
    assert not auth.verify_pin(path, generated)


def test_expiry_and_parallel_short_transactions(tmp_path):
    path = tmp_path / "app.sqlite"
    db.initialize(path)
    with ThreadPoolExecutor(max_workers=6) as executor:
        tokens = list(executor.map(lambda _: auth.create_session(path), range(20)))
    assert len(set(tokens)) == 20
    assert all(auth.authenticated(path, token) for token in tokens)
    with db.connect(path) as connection:
        connection.execute("UPDATE teacher_sessions SET expires_at=?", (int(time.time()) - 1,))
    assert not any(auth.authenticated(path, token) for token in tokens)


