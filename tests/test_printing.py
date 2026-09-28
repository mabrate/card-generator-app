import csv
from io import BytesIO, StringIO
from copy import deepcopy

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader
import pytest

from app.main import create_app
from app.config import ROOT
from app import db
from app.printing import PAGE, BLEED, TRIM, slot, safe_box
from test_imports import project, preview, commit, WRITE


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path, '123456')) as client:
        client.post('/api/teacher/login', headers=WRITE, json={'pin': '123456'})
        yield client


def selection(client, p, include=True):
    result = client.get('/api/teacher/print/cards', params={'project_id': p['id'], 'include_imported': include}).json()
    return {'project_id': p['id'], 'project_version': result['project']['version'],
            'cards': [{'id': c['id'], 'version': c['version']} for c in result['cards']],
            'include_imported': include, 'expand_copies': True}


def post(client, body, kind='preview'):
    return client.post('/api/teacher/print/' + kind, headers=WRITE, json=body)


def test_geometry_demo_copy_expansion_vector_pdf(client):
    p = project(client)
    text = (ROOT / 'demo/v2/campus-food-web-cards.csv').read_text(encoding='utf-8-sig')
    assets = {}
    for path in (ROOT / 'demo/v2/graphics').glob('*.png'):
        upload = client.post('/api/teacher/import/image', headers={**WRITE, 'X-File-Name': path.name}, content=path.read_bytes())
        assets[path.name] = upload.json()['id']
    result = commit(client, preview(client, p, text, assets=assets).json()).json()
    assert result['created'] == 22 and result['copies'] == 48
    body = selection(client, p)
    checked = post(client, body).json()
    assert checked['valid'], checked
    assert (checked['records'], checked['copies'], checked['pages']) == (22, 48, 8)
    assert len(checked['warnings']) == 22  # Imports have not been approved.
    pdf = post(client, body, 'pdf')
    assert pdf.status_code == 200, pdf.text[:300]
    assert pdf.headers['content-type'] == 'application/pdf'
    assert len(pdf.content) < 15 * 1024 * 1024  # Lossless stream compression, not huge raw vectors.
    reader = PdfReader(BytesIO(pdf.content))
    assert len(reader.pages) == 8
    assert reader.trailer['/Root']['/ViewerPreferences']['/PrintScaling'] == '/None'
    for page in reader.pages:
        assert tuple(page.mediabox) == (0, 0, *PAGE)
        data = page.get_contents().get_data()
        assert b'198 270 re' in data  # 180x252 trim + 9pt bleed on each edge.
        assert b' m' in data and b' c' in data  # Vector glyph curves, not rasterized cards.
        assert 'Actual Size / 100%' in page.extract_text()
    assert TRIM == (2.5 * 72, 3.5 * 72) and BLEED / 72 * 25.4 == pytest.approx(3.175)
    for index in range(6):
        x, y = slot(index)
        assert min(x - 16, y - 16, PAGE[0] - x - 180 - 16, PAGE[1] - y - 252 - 16) >= 24
    body['expand_copies'] = False
    assert post(client, body).json()['pages'] == 4
    body['cards'] = body['cards'][:1]
    one = PdfReader(BytesIO(post(client, body, 'pdf').content))
    assert len(one.pages) == 1
    assert b'99' in one.pages[0].get_contents().get_data()


def test_eligibility_auth_and_stale_selections(client):
    p = project(client)
    result = commit(client, preview(client, p).json()).json()
    identifier = result['card_ids'][0]
    assert selection(client, p, False)['cards'] == []
    body = selection(client, p)
    body['include_imported'] = False
    assert post(client, body).status_code == 422
    card = client.get('/api/teacher/cards/' + identifier).json()
    assert client.post('/api/teacher/cards/' + identifier + '/review', headers=WRITE, json={'action': 'approve', 'expected_version': card['version']}).status_code == 200
    assert post(client, body).status_code == 409  # Even approval changed the version.
    body = selection(client, p, False)
    assert post(client, body).json()['warnings'] == []
    with db.connect(client.app.state.database) as connection:
        connection.execute('UPDATE cards SET external_id=NULL,status=\'Submitted\',version=version+1 WHERE id=?', (identifier,))
    assert selection(client, p)['cards'] == []  # Student submissions cannot bypass approval.
    assert post(client, body, 'pdf').status_code == 409
    with db.connect(client.app.state.database) as connection:
        connection.execute('UPDATE cards SET status=\'Approved\' WHERE id=?', (identifier,))
    body = selection(client, p)
    with db.connect(client.app.state.database) as connection:
        connection.execute('UPDATE projects SET version=version+1 WHERE id=?', (p['id'],))
    assert post(client, body).status_code == 409
    body = selection(client, p)
    with db.connect(client.app.state.database) as connection:
        connection.execute('UPDATE cards SET deleted_at=CURRENT_TIMESTAMP WHERE id=?', (identifier,))
    assert post(client, body, 'pdf').status_code == 409
    client.post('/api/teacher/logout', headers=WRITE)
    assert client.get('/teacher/print', follow_redirects=False).status_code == 303
    assert client.get('/api/teacher/print/cards', params={'project_id': p['id']}).status_code == 401
    assert post(client, body).status_code == 401
    assert post(client, body, 'pdf').status_code == 401


def test_validation_limits_corners_and_overflow(client):
    p = project(client)
    commit(client, preview(client, p, 'common_name,card_id,copies\nTest,test,999\n').json())
    body = selection(client, p)
    assert post(client, body).status_code == 422
    body['expand_copies'] = False
    assert post(client, body).json()['valid']
    duplicate = deepcopy(body)
    duplicate['cards'] *= 2
    assert post(client, duplicate).status_code == 422
    foreign = deepcopy(body)
    foreign['project_id'] = project(client)['id']
    assert post(client, foreign).status_code == 409
    layout = deepcopy(p['template'])
    layout['fields'][0]['box'] = [4, 4, 160, 21]
    assert client.post('/api/teacher/layout/' + p['id'], headers=WRITE, json={'title': 'Unsafe corners', 'expected_version': 1, 'template': layout}).status_code == 200
    body = selection(client, p); body['expand_copies'] = False
    checked = post(client, body).json()
    assert not checked['valid'] and 'corners' in checked['issues'][0]['message']
    assert post(client, body, 'pdf').status_code == 422
    assert not safe_box([4, 4, 160, 21], 5)
    assert safe_box([13.32, 232, 153.36, 14], 5)
    assert not safe_box([13.32, 9, 153.36, 21], 90)
    with db.connect(client.app.state.database) as connection:
        connection.execute('UPDATE cards SET values_json=?', ('{"common_name":"' + 'Long ' * 100 + '"}',))
    checked = post(client, body).json()
    assert any('limit' in issue['message'] or 'fit' in issue['message'] for issue in checked['issues'])


def test_high_resolution_original_crop_and_missing_files(client):
    p = project(client)
    pixels = BytesIO()
    Image.new('RGB', (2600, 1800), '#33aa77').save(pixels, 'PNG')
    image = client.post('/api/teacher/import/image', headers={**WRITE, 'X-File-Name': 'art.png'}, content=pixels.getvalue()).json()
    staged = preview(client, p, 'common_name,card_id,image_filename\nArt,art,art.png\n', assets={'art.png': image['id']}).json()
    commit(client, staged)
    body = selection(client, p)
    pdf = post(client, body, 'pdf')
    assert pdf.status_code == 200
    reader = PdfReader(BytesIO(pdf.content))
    placed = reader.pages[0].images
    assert len(placed) >= 1
    assert max(i.image.width for i in placed) >= 1278  # 2.13 in at 600 DPI, not 1000 px preview.
    with db.connect(client.app.state.database) as connection:
        connection.execute('UPDATE images SET original_path=\'absent.original\' WHERE id=?', (image['id'],))
    assert post(client, body, 'pdf').status_code == 503



