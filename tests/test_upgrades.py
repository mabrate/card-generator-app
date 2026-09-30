"""Cross-workflow regressions for teacher editing, fields, presets, and print colors."""
import base64
import json
import re
import secrets
from copy import deepcopy
from io import BytesIO
import xml.etree.ElementTree as ET

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageChops
from pypdf import PdfReader

from app import db
from app.config import SAMPLE, THEMES
from app.layouts import Layout, layout_presets
from app.main import create_app
from app.printing import prepare, PrintSelection, safe_box
from app.rendering import render_card, font_for
from test_workflows import payload, headers, image_bytes, project_payload
from test_imports import project, preview, commit, WRITE
from test_printing import selection, post

NS = {'s': 'http://www.w3.org/2000/svg'}


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path, '123456')) as client:
        client.post('/api/teacher/login', headers=WRITE, json={'pin': '123456'})
        yield client


def edit_card(client, card, **changes):
    body = {key: card[key] for key in ['values', 'student_name', 'class_name', 'theme', 'image_id', 'crop', 'project_id', 'project_version', 'copies']}
    body.update(expected_version=card['version'], mutation_id=secrets.token_urlsafe(24), action='save', **changes)
    return client.post('/api/teacher/cards/' + card['id'] + '/save', headers=WRITE, json=body)


def test_teacher_replaces_image_crop_and_quantity_with_student_access(client):
    token = secrets.token_urlsafe(32)
    card = client.post('/api/student/card', headers=headers(token), json=payload(action='submit')).json()
    card = client.get('/api/teacher/cards/' + card['id']).json()
    image = client.post('/api/teacher/cards/' + card['id'] + '/image', headers=WRITE, content=image_bytes()).json()
    crop = {'x': .2, 'y': .8, 'zoom': 1.5, 'rotation': 90}
    response = edit_card(client, card, image_id=image['id'], crop=crop, copies=7, student_name='Sam', class_name='Science 3')
    assert response.status_code == 200, response.text
    restored = client.get('/api/student/card', headers=headers(token)).json()
    assert restored['image_id'] == image['id'] and restored['crop'] == crop and restored['copies'] == 7
    assert restored['student_name'] == 'Sam' and restored['class_name'] == 'Science 3'
    assert client.post('/api/preview', headers=headers(token), json={'values': SAMPLE, 'image_id': image['id'], 'crop': crop}).status_code == 200
    assert edit_card(client, card, copies=8).status_code == 409
    assert client.post('/api/student/card', headers=headers(token), json=payload(copies=99)).status_code == 403
    assert edit_card(client, restored, copies=0).status_code == 422
    client.post('/api/teacher/logout', headers=WRITE)
    assert client.post('/api/teacher/cards/' + card['id'] + '/image', headers=WRITE, content=image_bytes()).status_code == 401


def test_import_identity_and_quantity_can_change_before_overflow_is_fixed(client):
    p = project(client)
    result = commit(client, preview(client, p, 'common_name,mechanic_1,card_id\nTest,' + ('Too long. ' * 90) + ',test\n').json()).json()
    card = client.get('/api/teacher/cards/' + result['card_ids'][0]).json()
    assert card['status'] == 'Needs Revision'
    saved = edit_card(client, card, copies=4, student_name='Morgan', class_name='Period 2')
    assert saved.status_code == 200, saved.text
    assert saved.json()['values'] == card['values'] and saved.json()['copies'] == 4
    assert saved.json()['status'] == 'Needs Revision'
    # Bulk changes leave student-created cards untouched and invalidate old versions.
    token = secrets.token_urlsafe(32)
    student = client.post('/api/student/card', headers=headers(token), json=payload(project_id=p['id'], values={'common_name': 'Student card'})).json()
    endpoint = '/api/teacher/projects/' + p['id'] + '/import-identity'
    changed = client.post(endpoint, headers=WRITE, json={'expected_version': 1, 'class_name': 'Whole deck'})
    assert changed.json() == {'updated': 1}
    assert client.get('/api/teacher/cards/' + card['id']).json()['class_name'] == 'Whole deck'
    assert client.get('/api/teacher/cards/' + student['id']).json()['class_name'] == 'Period 2'
    assert client.post(endpoint, headers=WRITE, json={'expected_version': 1, 'student_name': 'Stale'}).status_code == 409


def test_field_removal_preserves_history_and_rejects_stale_writes(client):
    p = project(client)
    result = commit(client, preview(client, p, 'common_name,extra_info,card_id\nOne,Original fact,test\n').json()).json()
    card = client.get('/api/teacher/cards/' + result['card_ids'][0]).json()
    changed = deepcopy(p['template'])
    changed['fields'] = [f for f in changed['fields'] if f['key'] != 'extra_info']
    response = client.post('/api/teacher/layout/' + p['id'], headers=WRITE, json={'title': p['title'], 'expected_version': 1, 'template': changed})
    assert response.status_code == 200
    saved = client.get('/api/teacher/cards/' + card['id']).json()
    assert 'extra_info' not in saved['values'] and saved['version'] == card['version'] + 1
    assert edit_card(client, saved, student_name='New name').status_code == 200
    assert edit_card(client, card).status_code in (409, 422)
    with db.connect(client.app.state.database) as connection:
        history = connection.execute("SELECT snapshot_json FROM card_history WHERE action LIKE 'Before field removal%' AND card_id=?", (card['id'],)).fetchone()
        assert json.loads(history[0])['values']['extra_info'] == 'Original fact'
    settings = project_payload(response.json())
    settings['fields'].append({'key': 'habitat', 'label': 'Habitat', 'required': False, 'max_chars': 100, 'instructions': '', 'example': ''})
    settings['fields'] = [f for f in settings['fields'] if f['key'] != 'family']
    result = client.post('/api/teacher/projects/' + p['id'], headers=WRITE, json=settings)
    assert result.status_code == 200, result.text
    fields = result.json()['template']['fields']
    assert 'habitat' in {f['key'] for f in fields} and 'family' not in {f['key'] for f in fields}
    assert next(f for f in fields if f['key'] == 'habitat')['box'] == [13, 175, 150, 25]


def test_presets_alignment_and_bleed():
    presets = layout_presets()
    assert len(presets) == 10
    for preset in presets:
        layout = Layout(**preset['template']).model_dump()
        assert layout['card_radius'] == (0 if preset['id'].endswith('square') else pytest.approx(3 * 72 / 25.4))
        values = {layout['fields'][0]['key']: 'A'}
        assert render_card(values, {}, THEMES[0], layout)['valid']
        root = ET.fromstring(render_card(values, {}, THEMES[0], layout, bleed=9)['svg'])
        assert root.find('.//s:rect[@data-role="card-bleed"]', NS).attrib['fill'] == root.find('.//s:rect[@data-role="card-border"]', NS).attrib['stroke']
        field = layout['fields'][0]
        field.update(box=[20, 20, 140, 60], font_size=10, line_height=12, text_align='center', vertical_align='middle')
        root = ET.fromstring(render_card(values, {}, THEMES[0], layout)['svg'])
        group = root.find('.//s:g[@data-field="' + field['key'] + '"]/s:g', NS)
        x, y = map(float, re.search(r'translate\(([^ ]+) ([^)]+)\)', group.attrib['transform']).groups())
        width, left, low, high = font_for(field['font']).measure('A', 10)
        assert x + left + width / 2 == pytest.approx(90, abs=.001)
        assert (y - high + y - low) / 2 == pytest.approx(50, abs=.001)
    assert safe_box([4, 4, 160, 21], 0)


def test_black_white_pdf_uses_gray_pixels_white_panels_and_gray_bleed(client):
    p = project(client)
    raw = image_bytes()
    image = client.post('/api/teacher/import/image', headers=WRITE, content=raw).json()
    commit(client, preview(client, p, 'common_name,card_id,image_filename\nColor,test,photo.jpg\n', assets={'photo.jpg': image['id']}).json())
    body = {**selection(client, p), 'black_and_white': True}
    plan = prepare(client.app.state.database, client.app.state.database.parent / 'uploads', PrintSelection(**body))
    root = ET.fromstring(plan['cards'][0]['svg'])
    assert root.find('.//s:rect[@data-role="card-background"]', NS).attrib['fill'] == '#ffffff'
    assert root.find('.//s:rect[@data-role="card-bleed"]', NS).attrib['fill'] == '#444444'
    data = root.find('.//s:image', NS).attrib['href'].split(',', 1)[1]
    pixels = Image.open(BytesIO(base64.b64decode(data))).convert('RGB')
    r, g, b = pixels.split()
    assert ImageChops.difference(r, g).getbbox() is None and ImageChops.difference(g, b).getbbox() is None
    response = post(client, body, 'pdf')
    assert response.status_code == 200
    reader = PdfReader(BytesIO(response.content))
    for placed in reader.pages[0].images:
        r, g, b = placed.image.convert('RGB').split()
        assert ImageChops.difference(r, g).getbbox() is None and ImageChops.difference(g, b).getbbox() is None
    color = prepare(client.app.state.database, client.app.state.database.parent / 'uploads', PrintSelection(**{**body, 'black_and_white': False}))
    assert '#eef3e8' in color['cards'][0]['svg']
    with db.connect(client.app.state.database) as connection:
        stored = connection.execute('SELECT original_path FROM images WHERE id=?', (image['id'],)).fetchone()[0]
    assert (client.app.state.database.parent / 'uploads' / stored).read_bytes() == raw
