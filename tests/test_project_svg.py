"""Project design SVGs remain portable and tied to the existing card model."""
import secrets
import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

from app import db
from app.config import SAMPLE
from app.layouts import default_layout
from app.main import create_app

WRITE = {'X-Card-App': '1'}
SVG = '{http://www.w3.org/2000/svg}'


def test_project_svg_roundtrip_and_rename(tmp_path):
    with TestClient(create_app(tmp_path, '123456')) as client:
        assert client.get('/api/teacher/layout/field-guide/design.svg').status_code == 401
        client.post('/api/teacher/login', headers=WRITE, json={'pin': '123456'})
        created = client.post('/api/teacher/layout/new', headers=WRITE,
                              json={'title': 'Lab cards', 'expected_version': 0,
                                    'template': default_layout()}).json()
        svg = client.get(f"/api/teacher/layout/{created['id']}/design.svg")
        assert svg.status_code == 200 and svg.headers['content-type'].startswith('image/svg+xml')
        root = ET.fromstring(svg.text)
        assert root.get('data-card-app') == 'project-design'
        field = next(item for item in root.iter() if item.get('data-field-key') == 'common_name')
        assert field.get('data-editable') == 'true' and field.get('data-field-type') == 'text'
        inspected = client.post('/api/teacher/layout/svg/inspect', headers=WRITE,
                                json={'svg': svg.text}).json()
        assert inspected['title'] == 'Lab cards'
        assert inspected['template'] == created['template']
        with db.connect(client.app.state.database) as connection:
            assert connection.execute('SELECT design_svg FROM projects WHERE id=?',
                                      (created['id'],)).fetchone()[0] == svg.text
        renamed = client.post(f"/api/teacher/projects/{created['id']}/rename", headers=WRITE,
                              json={'title': 'Revised lab', 'expected_version': created['version']})
        assert renamed.status_code == 200 and renamed.json()['title'] == 'Revised lab'
        assert client.post(f"/api/teacher/projects/{created['id']}/rename", headers=WRITE,
                           json={'title': 'Stale', 'expected_version': created['version']}).status_code == 409
        assert client.post('/api/teacher/layout/svg/inspect', headers=WRITE,
                           json={'svg': '<!DOCTYPE svg><svg/>'}).status_code == 422
        legacy = client.get('/api/teacher/layout/field-guide/design.svg')
        assert any(item.get('data-instructions') for item in ET.fromstring(legacy.text).iter() if item.get('data-field-key') == 'title')
        assert client.post('/api/teacher/layout/svg/inspect', headers=WRITE,
                           json={'svg': legacy.text}).json()['template']['version'] == 2


def test_finished_card_svg_is_distinct_from_project_design(tmp_path):
    with TestClient(create_app(tmp_path, '123456')) as client:
        token = secrets.token_urlsafe(32)
        card = client.post('/api/student/card', headers={**WRITE, 'X-Edit-Token': token}, json={
            'values': SAMPLE, 'student_name': 'Ada', 'class_name': 'Period 2',
            'theme': 'sage', 'project_id': 'field-guide', 'project_version': 1,
            'expected_version': 0, 'mutation_id': secrets.token_urlsafe(24), 'action': 'save'}).json()
        client.post('/api/teacher/login', headers=WRITE, json={'pin': '123456'})
        exported = client.get(f"/api/teacher/cards/{card['id']}/card.svg")
        assert exported.status_code == 200
        root = ET.fromstring(exported.text)
        assert root.get('data-card-app') == 'finished-card'
        assert root.find(f'{SVG}metadata[@id="card-app-card"]') is not None
        assert client.post('/api/teacher/layout/svg/inspect', headers=WRITE,
                           json={'svg': exported.text}).status_code == 422
