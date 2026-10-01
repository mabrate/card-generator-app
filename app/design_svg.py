"""Portable, visible project designs with machine-readable editing metadata."""
import json
import xml.etree.ElementTree as ET

from fastapi import HTTPException

from app.config import THEMES
from app.layouts import Layout
from app.rendering import render_card

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)


def design_svg(title, template):
    """The same renderer used for cards supplies the visible Inkscape artwork."""
    theme = next(theme for theme in THEMES if theme['id'] == template['themes'][0])
    sample = {field['key']: (field.get('example') or field['label'])[:field['max_chars']]
              for field in template['fields']}
    root = ET.fromstring(render_card(sample, {}, theme, template)['svg'])
    root.set('data-card-app', 'project-design')
    root.set('data-format-version', '1')
    metadata = ET.Element(f'{{{SVG}}}metadata', {'id': 'card-app-design'})
    metadata.text = json.dumps({'kind': 'project-design', 'version': 1, 'title': title,
                                'template': template}, ensure_ascii=False)
    root.insert(1, metadata)
    for field in template['fields']:
        for element in root.iter():
            if element.get('data-field') == field['key']:
                element.set('data-editable', 'true')
                element.set('data-field-type', 'text')
                element.set('data-field-key', field['key'])
                element.set('data-required', str(field['required']).lower())
                element.set('data-instructions', field.get('instructions', ''))
                element.set('data-box', json.dumps(field['box']))
                break
    image = next((element for element in root.iter() if element.get('data-role') == 'image-placeholder'), None)
    if image is not None:
        image.set('data-editable', 'true')
        image.set('data-field-type', 'image')
        image.set('data-box', json.dumps(template['image_box']))
    return ET.tostring(root, encoding='unicode')


def read_design_svg(source):
    if len(source) > 500_000 or '<!DOCTYPE' in source.upper() or '<!ENTITY' in source.upper():
        raise HTTPException(422, 'Choose a project design SVG under 500 KB without XML entities.')
    try:
        root = ET.fromstring(source)
        if root.tag != f'{{{SVG}}}svg' or root.get('data-card-app') != 'project-design':
            raise ValueError('This is not a Classroom Cards project design SVG.')
        metadata = root.find(f'{{{SVG}}}metadata[@id="card-app-design"]')
        payload = json.loads(metadata.text if metadata is not None else '')
        if payload.get('kind') != 'project-design' or payload.get('version') != 1:
            raise ValueError('Unsupported project design metadata.')
        source_template = payload['template']
        if source_template.get('version') == 1:
            source_template = {**source_template, 'version': 2, 'safe_pt': 4, 'card_radius': 0}
        template = Layout.model_validate(source_template).model_dump()
        if not set(template['themes']) <= {theme['id'] for theme in THEMES}:
            raise ValueError('The design names an unknown theme.')
        title = str(payload.get('title', '')).strip()
        if not title or len(title) > 100:
            raise ValueError('The design needs a project title.')
        return {'title': title, 'template': template}
    except (ET.ParseError, ValueError, KeyError, TypeError) as error:
        raise HTTPException(422, f'Cannot read project design SVG: {error}') from error


def finished_card_svg(rendered, card, project):
    root = ET.fromstring(rendered)
    root.set('data-card-app', 'finished-card')
    root.set('data-format-version', '1')
    metadata = ET.Element(f'{{{SVG}}}metadata', {'id': 'card-app-card'})
    metadata.text = json.dumps({'kind': 'finished-card', 'version': 1,
                                'project_id': project['id'], 'card_id': card['id'],
                                'project_version': project['version'], 'values': card['values'],
                                'theme': card['theme'], 'student_name': card['student_name'],
                                'class_name': card['class_name'], 'copies': card['copies'],
                                'card_kind': card['card_kind'], 'status': card['status']}, ensure_ascii=False)
    root.insert(1, metadata)
    return ET.tostring(root, encoding='unicode')
