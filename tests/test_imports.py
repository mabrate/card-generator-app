import csv
import io
import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from zipfile import ZipFile
import xml.etree.ElementTree as ET

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from app.config import ROOT
from app import db
from app.layouts import default_layout

WRITE = {'X-Card-App': '1'}


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path, '123456')) as client:
        client.post('/api/teacher/login', headers=WRITE, json={'pin': '123456'})
        yield client


def project(client):
    result = client.post('/api/teacher/layout/new', headers=WRITE, json={'title': 'Demo', 'expected_version': 0, 'template': default_layout()})
    assert result.status_code == 200, result.text
    return result.json()


def preview(client, project, text='common_name,card_id,copies\nTest,test,2\n', **changes):
    headers = next(csv.reader(io.StringIO(text.lstrip('\ufeff'))))
    body = {'csv': text, 'project_id': project['id'], 'mapping': {k: k for k in headers}, 'assets': {}, 'duplicate': 'skip'}
    body.update(changes)
    return client.post('/api/teacher/import/preview', headers=WRITE, json=body)


def commit(client, staged):
    return client.post('/api/teacher/import/' + staged['id'] + '/commit', headers=WRITE)


def test_demo_end_to_end_and_images(client):
    p = project(client)
    text = (ROOT / 'demo/v2/campus-food-web-cards.csv').read_text(encoding='utf-8-sig')
    source = list(csv.DictReader(io.StringIO(text)))
    assert len(source) == 22 and sum(int(r['copies']) for r in source) == 48
    assets = {}
    for image in sorted((ROOT / 'demo/v2/graphics').glob('*.png')):
        with Image.open(image) as png:
            dpi = png.info['dpi']
            assert abs(png.width / dpi[0] - 2.13) < .001
            assert abs(png.height / dpi[1] - 1.48) < .001
        upload = client.post('/api/teacher/import/image', headers={**WRITE, 'X-File-Name': image.name}, content=image.read_bytes())
        assert upload.status_code == 200
        assets[image.name] = upload.json()['id']
    assert len(assets) == 22
    staged = preview(client, p, text, assets=assets)
    assert staged.status_code == 200, staged.text
    staged = staged.json()
    assert staged['ready'] == 22 and staged['copies'] == 48
    assert not any(r['errors'] for r in staged['rows'])
    assert not any(r['issues'] for r in staged['rows']), [(r['external_id'], r['issues']) for r in staged['rows'] if r['issues']]
    result = commit(client, staged).json()
    assert result['created'] == 22 and result['copies'] == 48
    assert commit(client, staged).json() == result
    with db.connect(client.app.state.database) as connection:
        assert connection.execute('SELECT count(*),sum(copies) FROM cards').fetchone()[:] == (22, 48)
    for identifier, original in zip(result['card_ids'], source):
        card = client.get('/api/teacher/cards/' + identifier).json()
        assert card['values'] == {f['key']: original[f['key']] for f in p['template']['fields']}
        rendered = client.post('/api/preview', headers=WRITE, json={'project_id': p['id'], 'values': card['values'], 'theme': card['theme'], 'image_id': card['image_id']}).json()
        assert rendered['valid']
        assert 'data:image/jpeg;base64,' in rendered['svg']
        assert 'data-role="image-placeholder"' not in rendered['svg']
    again = preview(client, p, text, assets=assets).json()
    assert commit(client, again).json()['skipped'] == 22


def test_duplicates_version_checks_and_retry(client):
    p = project(client)
    staged = preview(client, p).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: commit(client, staged).json(), range(2)))
    assert results[0] == results[1]
    update = preview(client, p, 'common_name,card_id,copies\nUpdated,test,4\n', duplicate='update').json()
    assert commit(client, update).json()['updated'] == 1
    card = client.get('/api/teacher/cards/' + results[0]['card_ids'][0]).json()
    assert card['copies'] == 4 and card['values']['common_name'] == 'Updated'
    copies = preview(client, p, duplicate='copy').json()
    assert commit(client, copies).json()['created'] == 1
    staged_a = preview(client, p, duplicate='update').json()
    staged_b = preview(client, p, duplicate='update').json()
    assert commit(client, staged_a).status_code == 200
    assert commit(client, staged_b).status_code == 409
    with db.connect(client.app.state.database) as connection:
        assert connection.execute('SELECT count(*) FROM cards').fetchone()[0] == 2


def test_invalid_rows_and_full_overflow_text_preserved(client):
    p = project(client)
    long_text = 'Full rule text. ' * 80
    text = 'common_name,mechanic_1,card_id,copies,image_filename\nLong,' + long_text + ',long,1,\nMissing,,missing,1,absent.png\nBad,,bad,0,\n'
    staged = preview(client, p, text).json()
    assert staged['rows'][0]['issues']
    assert staged['rows'][1]['errors'] and staged['rows'][2]['errors']
    result = commit(client, staged).json()
    assert result['created'] == 1 and result['rejected'] == 2 and result['needs_review'] == 1
    card = client.get('/api/teacher/cards/' + result['card_ids'][0]).json()
    assert card['values']['mechanic_1'] == long_text and card['status'] == 'Needs Revision'
    approval = client.post('/api/teacher/cards/' + card['id'] + '/review', headers=WRITE, json={'action': 'approve', 'expected_version': card['version']})
    assert approval.status_code == 422


def test_layout_validation_and_template_exports(client):
    p = project(client)
    invalid = deepcopy(p['template'])
    invalid['fields'][0]['box'][0] = -1
    assert client.post('/api/teacher/layout/' + p['id'], headers=WRITE, json={'title': 'Invalid', 'expected_version': 1, 'template': invalid}).status_code == 422
    staged = preview(client, p).json()
    changed = deepcopy(p['template'])
    changed['fields'][0]['font_size'] = 9
    changed['fields'][0]['box'][1] = 10
    saved = client.post('/api/teacher/layout/' + p['id'], headers=WRITE, json={'title': 'Changed', 'expected_version': 1, 'template': changed})
    assert saved.status_code == 200
    assert commit(client, staged).status_code == 409
    out = client.get('/api/teacher/layout/' + p['id'] + '/template.csv')
    headers = next(csv.reader(io.StringIO(out.text.lstrip('\ufeff'))))
    assert headers[:5] == ['common_name', 'binomial_name', 'family', 'categories', 'image_filename']
    assert set(headers) == {f['key'] for f in changed['fields']} | {'card_id', 'card_kind', 'copies', 'theme', 'image_filename'}
    workbook = client.get('/api/teacher/layout/' + p['id'] + '/template.xlsx')
    assert workbook.status_code == 200
    with ZipFile(io.BytesIO(workbook.content)) as archive:
        xml = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        assert [n.text for n in xml.findall('.//x:row[@r="1"]//x:t', ns)] == headers
        assert not xml.findall('.//x:f', ns)
        assert 'Field guide' in archive.read('xl/workbook.xml').decode()


def test_csv_structure_security_and_project_scoping(client):
    p = project(client)
    for text in ['', 'a,a\nx,y\n', 'a,b\nx,y,z\n', 'a,b\n"unfinished']:
        assert client.post('/api/teacher/import/inspect', headers=WRITE, json={'csv': text}).status_code == 422
    repeated = preview(client, p, 'common_name,card_id\nOne,same\nTwo,same\n').json()
    assert repeated['rows'][1]['errors']
    assert commit(client, repeated).json()['created'] == 1
    assert preview(client, p, mapping={'common_name': 'missing'}).status_code == 422
    p2 = project(client)
    assert commit(client, preview(client, p2, 'common_name,card_id\nIndependent,same\n').json()).json()['created'] == 1
    client.post('/api/teacher/logout', headers=WRITE)
    assert client.post('/api/teacher/import/inspect', headers=WRITE, json={'csv': 'a\nb\n'}).status_code == 401
    assert client.get('/api/teacher/layout/' + p['id'] + '/template.xlsx').status_code == 401
    assert client.get('/teacher/studio', follow_redirects=False).status_code == 303

def test_public_demo_and_approval_after_layout_fix(client):
    cards = client.get('/api/demo').json()
    assert len(cards) == 22 and sum(c['copies'] for c in cards) == 48
    assert client.get('/api/demo/monarch-butterfly').json()['valid']
    assert client.get('/api/demo/not-a-card').status_code == 404
    p = project(client)
    broken = deepcopy(p['template'])
    broken['fields'][0]['box'][2] = 10
    assert client.post('/api/teacher/layout/' + p['id'], headers=WRITE, json={'title': 'Small', 'expected_version': 1, 'template': broken}).status_code == 200
    result = commit(client, preview(client, p, 'common_name,card_id\nLong common name,one\n').json()).json()
    card = client.get('/api/teacher/cards/' + result['card_ids'][0]).json()
    assert card['status'] == 'Needs Revision'
    assert client.post('/api/teacher/layout/' + p['id'], headers=WRITE, json={'title': 'Fixed', 'expected_version': 2, 'template': p['template']}).status_code == 200
    review = client.post('/api/teacher/cards/' + card['id'] + '/review', headers=WRITE, json={'action': 'approve', 'expected_version': card['version']})
    assert review.status_code == 200 and review.json()['status'] == 'Approved'
    assert client.post('/api/teacher/layout/' + p['id'], headers=WRITE, json={'title': 'Changed again', 'expected_version': 3, 'template': p['template']}).status_code == 200
    changed = client.get('/api/teacher/cards/' + card['id']).json()
    assert changed['status'] == 'Submitted' and changed['version'] > card['version']
    removed = deepcopy(p['template'])
    removed['fields'].pop()
    assert client.post('/api/teacher/layout/' + p['id'], headers=WRITE, json={'title': 'Remove', 'expected_version': 4, 'template': removed}).status_code == 422


