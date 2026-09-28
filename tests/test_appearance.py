"""Corner geometry, placeholder removal, and persisted teacher appearance settings."""
import xml.etree.ElementTree as ET
from copy import deepcopy

from fastapi.testclient import TestClient

from app.config import THEMES, TEMPLATE, SAMPLE
from app.layouts import default_layout
from app.main import create_app
from app.rendering import render_card

NS = {'s': 'http://www.w3.org/2000/svg'}
WRITE = {'X-Card-App': '1'}


def test_artwork_replaces_placeholder_for_both_layout_versions():
    for template, values in [(TEMPLATE, SAMPLE), (default_layout(), {'common_name': 'Monarch'})]:
        placeholder = ET.fromstring(render_card(values, {}, THEMES[0], template)['svg'])
        assert placeholder.find('.//s:rect[@data-role="image-placeholder"]', NS) is not None
        rendered = ET.fromstring(render_card(values, {}, THEMES[0], template, {'data_uri': 'data:image/png;base64,example'})['svg'])
        assert rendered.find('.//s:image', NS) is not None
        assert rendered.find('.//s:rect[@data-role="image-placeholder"]', NS) is None
        assert rendered.find('.//s:g[@data-field="image-placeholder"]', NS) is None
        assert not any('M83 86' in node.attrib.get('d', '') for node in rendered.iter())


def test_rounded_borders_stay_inside_card_and_image_bounds():
    template = default_layout()
    template.update(card_radius=16, image_radius=12, card_border_width=4, image_border_width=2)
    root = ET.fromstring(render_card({'common_name': 'Example'}, {}, THEMES[0], template, {'data_uri': 'data:image/png;base64,example'})['svg'])
    image_clip = root.find('.//s:clipPath[@id="image-frame"]/s:rect', NS)
    image_border = root.find('.//s:rect[@data-role="image-border"]', NS)
    card_border = root.find('.//s:rect[@data-role="card-border"]', NS)
    assert float(image_clip.attrib['rx']) == 12
    assert float(image_border.attrib['rx']) + float(image_border.attrib['stroke-width']) / 2 == 12
    assert float(card_border.attrib['rx']) + float(card_border.attrib['stroke-width']) / 2 == 16
    assert float(card_border.attrib['x']) - float(card_border.attrib['stroke-width']) / 2 == 0
    assert float(card_border.attrib['x']) + float(card_border.attrib['width']) + float(card_border.attrib['stroke-width']) / 2 == 180
    template.update(card_radius=0, image_radius=0, card_border_width=0, image_border_width=0)
    root = ET.fromstring(render_card({'common_name': 'Example'}, {}, THEMES[0], template)['svg'])
    assert root.find('.//s:rect[@data-role="card-border"]', NS) is None
    assert root.find('.//s:rect[@data-role="image-border"]', NS) is None
    assert float(root.find('.//s:rect[@data-role="image-placeholder"]', NS).attrib['rx']) == 0


def test_appearance_settings_save_reload_validate_and_preview(tmp_path):
    with TestClient(create_app(tmp_path, '123456')) as client:
        client.post('/api/teacher/login', headers=WRITE, json={'pin': '123456'})
        old = default_layout()
        for key in ('card_radius', 'image_radius', 'card_border_width', 'image_border_width'):
            old.pop(key)
        response = client.post('/api/teacher/layout/new', headers=WRITE, json={'title': 'Existing layout', 'expected_version': 0, 'template': old})
        assert response.status_code == 200
        project = response.json()
        template = project['template']
        assert template['image_radius'] == 8.5 and template['image_border_width'] == 0
        settings = {'card_radius': 15, 'image_radius': 10, 'card_border_width': 2.5, 'image_border_width': 1.5}
        template.update(settings)
        saved = client.post('/api/teacher/layout/' + project['id'], headers=WRITE, json={'title': 'Rounded', 'expected_version': 1, 'template': template})
        assert saved.status_code == 200
        loaded = client.get('/api/project', params={'project_id': project['id']}).json()
        assert all(loaded['template'][key] == value for key, value in settings.items())
        preview = client.post('/api/preview', headers=WRITE, json={'project_id': project['id'], 'values': {'common_name': 'Example'}})
        assert preview.status_code == 200 and 'stroke-width="2.5"' in preview.json()['svg']
        for key, value in [('card_radius', -1), ('image_radius', 91), ('card_border_width', 13), ('image_border_width', float('inf'))]:
            invalid = deepcopy(template)
            # JSON cannot transport infinity; use an encoded JSON number to test non-finite parsing.
            invalid[key] = value if value != float('inf') else 1e100
            assert client.post('/api/teacher/layout/' + project['id'], headers=WRITE, json={'title': 'Invalid', 'expected_version': 2, 'template': invalid}).status_code == 422
