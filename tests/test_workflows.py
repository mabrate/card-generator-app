import hashlib
from io import BytesIO
import json
import secrets
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from app import db
from app.config import SAMPLE
from app.images import crop_box
from app.main import create_app
from app.schemas import Crop

WRITE = {'X-Card-App': '1'}


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path, '123456')) as client:
        yield client


def headers(token):
    return {**WRITE, 'X-Edit-Token': token}


def payload(**changes):
    return {'values': SAMPLE, 'student_name': 'Ada', 'class_name': 'Period 2', 'theme': 'sage',
            'project_id': 'field-guide', 'project_version': 1, 'expected_version': 0,
            'mutation_id': secrets.token_urlsafe(24), 'action': 'save', **changes}


def save(client, token, **changes):
    return client.post('/api/student/card', headers=headers(token), json=payload(**changes))


def login(client):
    assert client.post('/api/teacher/login', headers=WRITE, json={'pin': '123456'}).status_code == 200


def review(client, card, action, note=''):
    return client.post('/api/teacher/cards/' + card['id'] + '/review', headers=WRITE,
                       json={'expected_version': card['version'], 'action': action, 'note': note})


def test_draft_submit_revision_approval_and_delete(client):
    token = secrets.token_urlsafe(32)
    assert save(client, token, values={}, student_name='', class_name='').status_code == 200
    assert save(client, token, values={}, expected_version=1, action='submit').status_code == 422
    submitted = save(client, token, expected_version=1, action='submit').json()
    assert submitted['status'] == 'Submitted' and submitted['version'] == 2
    assert save(client, token, expected_version=2).status_code == 409
    assert client.get('/api/teacher/cards').status_code == 401
    login(client)
    assert review(client, submitted, 'revision').status_code == 422
    revised = review(client, submitted, 'revision', 'Clarify the adaptation.').json()
    assert revised['status'] == 'Needs Revision'
    restored = client.get('/api/student/card', headers=headers(token)).json()
    assert restored['teacher_note'] == 'Clarify the adaptation.'
    draft = save(client, token, expected_version=revised['version']).json()
    assert draft['status'] == 'Needs Revision'
    submitted = save(client, token, expected_version=draft['version'], action='submit').json()
    approved = review(client, submitted, 'approve').json()
    assert approved['status'] == 'Approved'
    assert save(client, token, expected_version=approved['version']).status_code == 409
    assert review(client, submitted, 'delete').status_code == 409  # stale teacher tab
    assert review(client, approved, 'delete').status_code == 200
    assert client.get('/api/student/card', headers=headers(token)).status_code == 410
    assert save(client, token).status_code == 410
    assert client.get('/api/teacher/cards').json()['total'] == 0
    with db.connect(client.app.state.database) as connection:
        assert connection.execute('SELECT count(*) FROM card_history').fetchone()[0] == 7


def test_recovery_ownership_and_persistence(tmp_path):
    token, stranger = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with TestClient(create_app(tmp_path, '123456')) as first:
        card = save(first, token).json()
        assert first.get('/api/student/card').status_code == 401
        assert first.get('/api/student/card', headers=headers(stranger)).status_code == 404
    with TestClient(create_app(tmp_path, '123456')) as restarted:
        recovered = restarted.get('/api/student/card', headers=headers(token)).json()
        assert recovered['id'] == card['id'] and recovered['values'] == SAMPLE
        assert 'edit_hash' not in recovered and 'last_payload' not in recovered
        assert restarted.get('/api/teacher/cards/' + card['id']).status_code == 401


def test_retry_deduplication_and_concurrent_conflicts(client):
    token = secrets.token_urlsafe(32)
    body = payload()
    responses = [client.post('/api/student/card', headers=headers(token), json=body) for _ in range(2)]
    assert [response.status_code for response in responses] == [200, 200]
    assert responses[0].json() == responses[1].json()
    with ThreadPoolExecutor(max_workers=2) as workers:
        responses = list(workers.map(lambda label: save(client, token, expected_version=1, values={**SAMPLE, 'title': label}), ['Card A', 'Card B']))
    assert sorted(response.status_code for response in responses) == [200, 409]
    with db.connect(client.app.state.database) as connection:
        assert connection.execute('SELECT count(*) FROM cards').fetchone()[0] == 1
        assert connection.execute('SELECT count(*) FROM card_history').fetchone()[0] == 2


def test_invalid_text_never_replaces_valid_card(client):
    token = secrets.token_urlsafe(32)
    save(client, token)
    for values in [{**SAMPLE, 'title': 'W' * 48}, {**SAMPLE, 'section_1_text': 'x' * 151}, {'unknown': 'bad'}]:
        assert save(client, token, expected_version=1, values=values).status_code == 422
    assert save(client, token, expected_version=1, labels={'section_1_text': 'Student label'}).status_code == 422
    restored = client.get('/api/student/card', headers=headers(token)).json()
    assert restored['version'] == 1 and restored['values'] == SAMPLE


def test_teacher_edit_invalidates_approval_and_filters(client):
    token = secrets.token_urlsafe(32)
    card = save(client, token, action='submit').json()
    login(client)
    card = review(client, card, 'approve').json()
    body = payload(expected_version=card['version'], values={**SAMPLE, 'title': 'Teacher edit'})
    edited = client.post('/api/teacher/cards/' + card['id'] + '/save', headers=WRITE, json=body)
    assert edited.status_code == 200 and edited.json()['status'] == 'Submitted'
    assert client.get('/api/teacher/cards?status=Approved').json()['total'] == 0
    assert client.get('/api/teacher/cards?status=Submitted&class_name=Period%202&project_id=field-guide').json()['total'] == 1
    assert client.get('/api/teacher/cards?class_name=Period%209').json()['total'] == 0
    assert client.get('/api/teacher/cards?page=0').status_code == 422
    result = client.get('/api/teacher/cards/' + card['id']).json()
    assert result['values']['title'] == 'Teacher edit' and result['history'][0]['actor'] == 'teacher'


def image_bytes(size=(600, 400), orientation=None):
    image = Image.new('RGB', size, 'green')
    # Asymmetric image so rotation and positioning can be distinguished.
    image.paste('orange', (0, 0, size[0] // 3, size[1] // 2))
    stream = BytesIO()
    exif = image.getexif()
    if orientation:
        exif[274] = orientation
    image.save(stream, format='JPEG', exif=exif)
    return stream.getvalue()


def test_image_original_retained_crop_rotation_and_ownership(client):
    token, stranger = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    raw = image_bytes(orientation=6)
    uploaded = client.post('/api/student/images', headers=headers(token), content=raw)
    assert uploaded.status_code == 200
    image = uploaded.json()
    assert (image['width'], image['height']) == (400, 600)
    repeated = client.post('/api/student/images', headers=headers(token), content=raw).json()
    assert repeated['id'] == image['id']
    body = {'values': SAMPLE, 'image_id': image['id'], 'crop': {'x': .1, 'y': .9, 'zoom': 2, 'rotation': 90}}
    rendered = client.post('/api/preview', headers=headers(token), json=body)
    assert rendered.status_code == 200 and 'data:image/jpeg;base64,' in rendered.json()['svg']
    assert client.post('/api/preview', headers=headers(stranger), json=body).status_code == 404
    assert save(client, stranger, image_id=image['id']).status_code == 404
    first = save(client, token, image_id=image['id'], crop=body['crop']).json()
    restored = client.get('/api/student/card', headers=headers(token)).json()
    assert restored['image']['id'] == image['id'] and restored['crop'] == body['crop']
    with db.connect(client.app.state.database) as connection:
        row = connection.execute('SELECT * FROM images').fetchone()
        stored = (client.app.state.database.parent / 'uploads' / row['original_path']).read_bytes()
        assert hashlib.sha256(stored).digest() == hashlib.sha256(raw).digest()
    submitted = save(client, token, expected_version=first['version'], image_id=image['id'], crop=body['crop'], action='submit').json()
    assert client.post('/api/student/images', headers=headers(token), content=raw).status_code == 409
    login(client)
    teacher_preview = client.post('/api/preview', headers=WRITE, json=body).json()
    assert teacher_preview['svg'] == rendered.json()['svg']
    assert review(client, submitted, 'approve').status_code == 200


def test_bad_images_and_crop_validation(client):
    token = secrets.token_urlsafe(32)
    assert client.post('/api/student/images', headers=headers(token), content=b'<svg onload="bad"/>').status_code == 422
    assert client.post('/api/student/images', headers=WRITE, content=image_bytes()).status_code == 401
    for crop in [{'x': -1}, {'zoom': 0}, {'rotation': 45}, {'zoom': 5}]:
        assert client.post('/api/preview', headers=headers(token), json={'values': SAMPLE, 'crop': crop}).status_code == 422
    image = client.post('/api/student/images', headers=headers(token), content=image_bytes((32, 32))).json()
    result = client.post('/api/preview', headers=headers(token), json={'values': SAMPLE, 'image_id': image['id']}).json()
    assert result['valid'] and result['warnings'] and result['image_dpi'] < 150
    assert save(client, token, image_id=image['id'], action='submit').status_code == 200
    for x in (0, .5, 1):
        left, top, right, bottom = crop_box(600, 400, Crop(x=x, zoom=2), 160 / 59)
        assert 0 <= left < right <= 600 and 0 <= top < bottom <= 400
        assert abs((right - left) / (bottom - top) - 160 / 59) < .00001


def project_payload(project):
    return {'title': project['title'], 'instructions': project['template']['instructions'],
            'themes': project['template']['themes'], 'expected_version': project['version'],
            'fields': [{key: field[key] for key in ('key', 'label', 'instructions', 'example', 'max_chars', 'required')} for field in project['template']['fields']]}


def test_project_settings_new_projects_and_approval_invalidation(client):
    token = secrets.token_urlsafe(32)
    submitted = save(client, token, action='submit').json()
    original = client.get('/api/project').json()
    body = project_payload(original)
    assert client.post('/api/teacher/projects/field-guide', headers=WRITE, json=body).status_code == 401
    login(client)
    review(client, submitted, 'approve')
    body['instructions'] = 'Observe carefully and cite your class notes.'
    body['fields'][7]['required'] = True
    body['themes'] = ['sage', 'sky']
    result = client.post('/api/teacher/projects/field-guide', headers=WRITE, json=body)
    assert result.status_code == 200 and result.json()['version'] == 2
    assert client.get('/api/teacher/cards').json()['cards'][0]['status'] == 'Submitted'
    assert save(client, secrets.token_urlsafe(32)).status_code == 409
    body['expected_version'], body['title'] = 0, 'Second project'
    new = client.post('/api/teacher/projects', headers=WRITE, json=body).json()
    assert len(client.get('/api/projects').json()) == 2
    assert save(client, secrets.token_urlsafe(32), project_id=new['id']).status_code == 200
    assert client.get('/api/teacher/qr?project_id=' + new['id']).headers['content-type'].startswith('image/svg+xml')
    assert client.get('/api/project?project_id=missing').status_code == 404


def test_deleted_card_image_access_and_tiny_uploads(client):
    token = secrets.token_urlsafe(32)
    assert client.post('/api/student/images', headers=headers(token), content=image_bytes((1, 1))).status_code == 422
    image = client.post('/api/student/images', headers={**headers(token), 'X-File-Name': 'My%20photo.jpg'}, content=image_bytes()).json()
    assert image['filename'] == 'My photo.jpg'
    card = save(client, token, image_id=image['id'], action='submit').json()
    login(client)
    assert review(client, card, 'delete').status_code == 200
    client.cookies.clear()
    response = client.post('/api/preview', headers=headers(token), json={'values': SAMPLE, 'image_id': image['id']})
    assert response.status_code == 404
    with db.connect(client.app.state.database) as connection:
        row = connection.execute('SELECT original_path FROM images WHERE id=?', (image['id'],)).fetchone()
        assert (client.app.state.database.parent / 'uploads' / row['original_path']).is_file()


def test_upgrade_keeps_existing_project_and_pin(tmp_path):
    import sqlite3
    from app import auth
    from app.config import ROOT, TEMPLATE
    path = tmp_path / 'app.sqlite'
    with sqlite3.connect(path) as connection:
        connection.executescript((ROOT / 'migrations' / '001_initial.sql').read_text())
        connection.execute('PRAGMA user_version=1')
        connection.execute('INSERT INTO projects(id,title,template_json) VALUES(?,?,?)',
                           ('field-guide', 'Existing classroom', json.dumps(TEMPLATE)))
    auth.configure_pin(path, '654321')
    with TestClient(create_app(tmp_path)) as client:
        assert client.get('/api/project').json()['title'] == 'Existing classroom'
        assert client.post('/api/teacher/login', headers=WRITE, json={'pin': '654321'}).status_code == 200
        assert save(client, secrets.token_urlsafe(32)).status_code == 200
    with db.connect(path) as connection:
        assert connection.execute('PRAGMA user_version').fetchone()[0] == 4




def test_project_delete_protection_cards_restart_and_empty_state(client):
    endpoint = '/api/teacher/projects/field-guide/delete'
    token = secrets.token_urlsafe(32)
    card = save(client, token).json()
    assert client.post(endpoint, headers=WRITE, json={'expected_version': 1}).status_code == 401
    login(client)
    assert client.post(endpoint, headers=WRITE, json={'expected_version': 2}).status_code == 409
    assert client.get('/api/projects').json()
    assert client.post(endpoint, headers=WRITE, json={'expected_version': 1}).status_code == 200
    assert client.get('/api/projects').json() == []
    assert client.get('/api/project?project_id=field-guide').status_code == 404
    assert client.get('/api/teacher/cards').json()['total'] == 0
    assert client.get('/api/student/card', headers=headers(token)).status_code == 410
    assert save(client, token, expected_version=card['version']).status_code in (404, 410)
    assert save(client, secrets.token_urlsafe(32)).status_code == 404
    assert client.post(endpoint, headers=WRITE, json={'expected_version': 1}).status_code == 404
    db.initialize(client.app.state.database)
    assert client.get('/api/projects').json() == []
    starter = client.get('/api/teacher/dashboard').json()['project']
    assert starter['id'] is None
    response = client.post('/api/teacher/projects', headers=WRITE, json={
        'title': 'Next project', 'instructions': starter['template']['instructions'],
        'expected_version': 0, 'themes': starter['template']['themes'],
        'fields': [{k: f[k] for k in ('key', 'label', 'instructions', 'example', 'required', 'max_chars')}
                   for f in starter['template']['fields']]})
    assert response.status_code == 200, response.text
    assert client.get('/api/teacher/dashboard').json()['project']['title'] == 'Next project'
    with db.connect(client.app.state.database) as connection:
        assert connection.execute('SELECT count(*) FROM cards').fetchone()[0] == 1
        assert connection.execute('SELECT action FROM card_history ORDER BY id DESC').fetchone()[0] == 'Project deleted'
