"""Keep the play-tested turn guide and all three demo card formats aligned."""
import csv
import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from app.config import ROOT, THEMES
from app.layouts import default_layout
from app.rendering import render_card

DEMO = ROOT / 'demo'
FIELDS = ('common_name', 'binomial_name', 'family', 'categories', 'image_filename',
          'mechanic_1', 'mechanic_2', 'extra_info', 'card_id', 'card_kind', 'copies', 'theme')


def test_demo_rule_revision_and_render_fit():
    guide = (DEMO / 'v2' / 'campus-food-web-turn-guide.md').read_text()
    assert all(text in guide for text in ('black-eyed peas', 'Both heads', 'Both tails', 'One of each',
                                          'at most 3 Water', 'repeatedly spend', 'face up on top of Compost',
                                          'face down on the bottom', '20 or more'))
    rows = list(csv.DictReader((DEMO / 'v2' / 'campus-food-web-cards.csv').open(encoding='utf-8-sig', newline='')))
    data = json.loads((DEMO / 'v2' / 'campus-food-web-cards.json').read_text())['cards']
    assert len(rows) == len(data) == 22
    assert sum(int(row['copies']) for row in rows) == 48
    assert tuple(rows[0]) == FIELDS
    assert len({row['card_id'] for row in rows}) == 22
    assert all(row == {key: str(card[key]) for key in FIELDS} for row, card in zip(rows, data))
    cards = {row['card_id']: row for row in rows}
    for card in rows:
        text = ' '.join(card[k] for k in ('mechanic_1', 'mechanic_2', 'extra_info'))
        assert card['extra_info'] == ''
        assert not any(old in text.lower() for old in ('activate once per round', 'repeat while able', 'play instead of an organism', 'effect cards never score'))
        assert not any(old in text.lower() for old in ('nutrient', 'compost counter', 'move lost population to compost', 'sunny weather'))
        assert not render_card({field['key']: card[field['key']] for field in default_layout()['fields']},
                               {}, next(theme for theme in THEMES if theme['id'] == card['theme']),
                               default_layout())['issues'], card['card_id']
    for key in ('aquatic-milkweed', 'frogfruit', 'blue-mistflower', 'texas-bluebonnet', 'common-sunflower'):
        assert 'Grow:' not in cards[key]['mechanic_1']
    assert 'Hot day' in cards['frogfruit']['mechanic_1']
    assert '3-Water cap' in cards['rainstorm']['mechanic_1']
    assert 'including nonnative demo plants' in cards['native-plant-boom']['mechanic_1']
    assert 'Native Plant Boom may target any of the five Plant card types' in guide
    assert 'Drought and Heat Wave Effect cards still remove their Water' in guide
    assert 'organism card from your hand' in cards['compost-addition']['mechanic_1']
    assert cards['soil-bacterium']['mechanic_2'] == 'Multiply: turn 1 face-up organism in Compost face down on bottom. Give this organism +1 Population.'
    for key in ('soil-bacterium', 'turkey-tail-fungus'):
        assert 'face-up organism' in cards[key]['mechanic_1']
        assert 'plants +1 Population' in cards[key]['mechanic_1']
    for card in rows:
        if card['card_kind'] == 'effect':
            assert card['mechanic_2'] == ''


def test_demo_workbook_matches_csv():
    rows = list(csv.DictReader((DEMO / 'v2' / 'campus-food-web-cards.csv').open(encoding='utf-8-sig', newline='')))
    ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with ZipFile(DEMO / 'v2' / 'campus-food-web-cards.xlsx') as archive:
        assert all(f'xl/worksheets/sheet{i}.xml' in archive.namelist() for i in (1, 2))
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            strings = [''.join(t.text or '' for t in item.findall('.//x:t', ns)) for item in root.findall('x:si', ns)]
        xml = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    matrix = []
    for row in xml.findall('.//x:sheetData/x:row', ns):
        cells = []
        for cell in row.findall('x:c', ns):
            value = cell.find('x:v', ns)
            inline = cell.find('x:is', ns)
            content = ''.join(t.text or '' for t in inline.findall('.//x:t', ns)) if inline is not None else value.text if value is not None else ''
            if cell.get('t') == 's':
                content = strings[int(content)]
            cells.append(content)
        matrix.append(cells)
    assert matrix[0] == list(FIELDS)
    assert len(matrix) == 23
    for spreadsheet, record in zip(matrix[1:], rows):
        assert spreadsheet == [record[key] for key in FIELDS]

