"""Teacher-only, snapshot-validated six-up Letter PDF imposition.

Cards remain canonical SVGs; Cairo preserves their glyph outlines and clips.
ReportLab draws only sheet furniture, never a second card design.
"""
from io import BytesIO
import base64
import xml.etree.ElementTree as ET
import json
import math

import cairosvg
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import Field, field_validator
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

from app import db, images
from app.schemas import Model, Crop
from app.rendering import render_card

PAGE = (792, 612)  # Landscape US Letter, in PDF points.
TRIM = (180, 252)
BLEED = 9  # 0.125 inches / 3.175 mm.
MAX_COPIES = 600


class PrintCard(Model):
    id: str = Field(min_length=1, max_length=64)
    version: int = Field(ge=1)


class PrintSelection(Model):
    project_id: str = Field(min_length=1, max_length=64)
    project_version: int = Field(ge=1)
    cards: list[PrintCard] = Field(min_length=1, max_length=200)
    expand_copies: bool = True
    include_imported: bool = False
    black_and_white: bool = False

    @field_validator('cards')
    @classmethod
    def unique_cards(cls, cards):
        if len({c.id for c in cards}) != len(cards):
            raise ValueError('Select each card only once; use copy expansion for repeats.')
        return cards


def slot(index):
    """Trim lower-left position, reading left-to-right then top-to-bottom."""
    return 99 + (index % 3) * 207, 319.5 - (index // 3) * 279


def safe_box(box, radius):
    x, y, w, h = box
    for px, py in ((x, y), (x + w, y), (x, y + h), (x + w, y + h)):
        dx, dy = min(px, 180 - px), min(py, 252 - py)
        # Conservative 3 mm punch corner exclusion, plus actual visual clip.
        if radius > 0 and dx < 9 and dy < 9:
            return False
        if dx < radius and dy < radius and math.hypot(radius - dx, radius - dy) > radius:
            return False
    return True


def prepare(database, uploads, body):
    # One SQLite read snapshot: approval, versions, text and layout agree.
    with db.connect(database) as connection:
        connection.execute('BEGIN')
        project = connection.execute('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', (body.project_id,)).fetchone()
        if not project or project['version'] != body.project_version:
            raise HTTPException(409, 'The project changed. Reload the print selection before exporting.')
        template = json.loads(project['template_json'])
        themes = {r['id']: json.loads(r['config_json']) for r in connection.execute('SELECT * FROM themes')}
        snapshots = []
        for selected in body.cards:
            row = connection.execute('SELECT * FROM cards WHERE id=? AND deleted_at IS NULL', (selected.id,)).fetchone()
            if not row or row['version'] != selected.version or row['project_id'] != body.project_id:
                raise HTTPException(409, 'A selected card changed or was removed. Reload the print selection.')
            if row['status'] != 'Approved' and not (body.include_imported and row['external_id']):
                raise HTTPException(422, 'Only approved cards can print unless you explicitly include imported cards.')
            image = connection.execute('SELECT * FROM images WHERE id=?', (row['image_id'],)).fetchone() if row['image_id'] else None
            if row['image_id'] and not image:
                raise HTTPException(503, 'A selected card image is missing. Restore its stored files before printing.')
            snapshots.append((dict(row), dict(image) if image else None))
    count = sum(row['copies'] if body.expand_copies else 1 for row, _ in snapshots)
    if count > MAX_COPIES:
        raise HTTPException(422, f'Export at most {MAX_COPIES} copies at a time. Select fewer cards or turn off copy expansion.')
    cards, issues, warnings = [], [], []
    for row, image in snapshots:
        values = json.loads(row['values_json'])
        title = values.get('common_name') or values.get('title') or values.get(template['fields'][0]['key']) or 'Untitled card'
        theme = themes.get(row['theme'])
        if theme is None or row['theme'] not in template['themes']:
            issues.append({'card_id': row['id'], 'title': title, 'message': 'Choose an enabled project theme.'})
            continue
        artwork = images.render_image(image, uploads, Crop(**json.loads(row['crop_json'])), template['image_box'], for_print=True, black_and_white=body.black_and_white) if image else None
        rendered = render_card(values, {}, theme, template, artwork, bleed=BLEED, black_and_white=body.black_and_white)
        for issue in rendered['issues']:
            issues.append({'card_id': row['id'], 'title': title, 'message': issue['message']})
        radius = template.get('card_radius', 5 if template.get('version') == 2 else 0)
        for field in template['fields']:
            if not values.get(field['key'], '').strip():
                continue
            if any(not safe_box(box, radius) for box in (field['box'], field.get('label_box')) if box):
                issues.append({'card_id': row['id'], 'title': title, 'message': f"{field['label']}: move the text box away from the rounded/punched corners in Layout & CSV studio."})
        if artwork and artwork['warning']:
            warnings.append({'card_id': row['id'], 'title': title, 'message': artwork['warning']})
        if row['status'] != 'Approved':
            warnings.append({'card_id': row['id'], 'title': title, 'message': 'Imported card has not been approved.'})
        cards.append({'id': row['id'], 'title': title, 'copies': row['copies'] if body.expand_copies else 1, 'svg': rendered['svg']})
    return {'project': project['title'], 'cards': cards, 'records': len(snapshots), 'copies': count,
            'pages': math.ceil(count / 6), 'issues': issues, 'warnings': warnings, 'valid': not issues}


def crop_marks(sheet, x, y):
    # Eight short, square-aligned marks entirely outside the bleed.
    sheet.setStrokeColorRGB(0, 0, 0)
    sheet.setLineWidth(.3)
    for px in (x, x + 180):
        sheet.line(px, y - 10, px, y - 16)
        sheet.line(px, y + 262, px, y + 268)
    for py in (y, y + 252):
        sheet.line(x - 10, py, x - 16, py)
        sheet.line(x + 190, py, x + 196, py)


def make_pdf(plan):
    # Convert each unique card once, then place reused vector pages unscaled.
    sources = {}
    for card in plan['cards']:
        pdf = cairosvg.svg2pdf(bytestring=card['svg'].encode(), unsafe=False)
        source = PdfReader(BytesIO(pdf)).pages[0]
        # Cairo decodes our JPEG to a bulky RGB/Flate stream. Retain the exact
        # existing JPEG bytes instead: same pixels/quality, no second encoding.
        node = ET.fromstring(card['svg']).find('{http://www.w3.org/2000/svg}g/{http://www.w3.org/2000/svg}image')
        if node is not None:
            from pypdf.generic import NameObject
            jpeg = base64.b64decode(node.attrib['href'].split(',', 1)[1])
            for key, reference in source['/Resources'].get('/XObject', {}).items():
                original = reference.get_object()
                if original.get('/Subtype') == '/Image' and original.get('/ColorSpace') == '/DeviceRGB':
                    original._data = jpeg
                    original.decoded_self = None
                    original[NameObject('/Filter')] = NameObject('/DCTDecode')
                    original.pop('/DecodeParms', None)
        sources[card['id']] = source
    expanded = [card for card in plan['cards'] for _ in range(card['copies'])]
    writer = PdfWriter()
    for page_number, start in enumerate(range(0, len(expanded), 6), 1):
        batch = expanded[start:start + 6]
        furniture = BytesIO()
        sheet = canvas.Canvas(furniture, pagesize=PAGE, pageCompression=1)
        for index in range(len(batch)):
            crop_marks(sheet, *slot(index))
        sheet.setFillColor(HexColor('#444444'))
        sheet.setFont('Helvetica', 7)
        sheet.drawCentredString(396, 12, f"Actual Size / 100% - trim 2.5 x 3.5 in - trim at crop marks - {page_number}/{plan['pages']}")
        sheet.showPage()
        sheet.save()
        page = writer.add_page(PdfReader(BytesIO(furniture.getvalue())).pages[0])
        for index, card in enumerate(batch):
            x, y = slot(index)
            page.merge_transformed_page(sources[card['id']], Transformation().translate(x - BLEED, y - BLEED))
    writer.add_metadata({'/Title': plan['project'] + ' - print sheets', '/Subject': f"{plan['copies']} cards; 180 x 252 pt trim; 9 pt bleed; print Actual Size"})
    from pypdf.generic import DictionaryObject, NameObject
    writer._root_object[NameObject('/ViewerPreferences')] = DictionaryObject({NameObject('/PrintScaling'): NameObject('/None')})
    # Merging expands content streams. Recompress losslessly; reuse repeated assets.
    for page in writer.pages:
        page.compress_content_streams(level=6)
    writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def print_routes(database, uploads, require_teacher):
    router = APIRouter()

    @router.get('/api/teacher/print/cards')
    def candidates(request: Request, project_id: str, include_imported: bool = False, class_name: str = ''):
        require_teacher(request)
        with db.connect(database) as connection:
            connection.execute('BEGIN')
            project = connection.execute('SELECT id,title,version FROM projects WHERE id=? AND deleted_at IS NULL', (project_id,)).fetchone()
            if not project:
                raise HTTPException(404, 'Project not found.')
            rows = connection.execute('SELECT id,version,values_json,status,student_name,class_name,copies,external_id FROM cards WHERE project_id=? AND deleted_at IS NULL ORDER BY created_at,id', (project_id,)).fetchall()
        result = []
        for row in rows:
            if (row['status'] != 'Approved' and not (include_imported and row['external_id'])) or (class_name and row['class_name'] != class_name):
                continue
            card = dict(row)
            values = json.loads(card.pop('values_json'))
            card['title'] = values.get('common_name') or values.get('title') or next((v for v in values.values() if v), 'Untitled card')
            result.append(card)
        return {'project': dict(project), 'cards': result, 'classes': sorted({r['class_name'] for r in rows if r['class_name']})}

    @router.post('/api/teacher/print/preview')
    def preview(body: PrintSelection, request: Request):
        require_teacher(request)
        plan = prepare(database, uploads, body)
        return {k: v for k, v in plan.items() if k != 'cards'}

    @router.post('/api/teacher/print/pdf')
    def export(body: PrintSelection, request: Request):
        require_teacher(request)
        plan = prepare(database, uploads, body)
        if not plan['valid']:
            raise HTTPException(422, {'message': 'Fix the selected cards before printing. No text has been changed.', 'issues': plan['issues']})
        return Response(make_pdf(plan), media_type='application/pdf', headers={'Content-Disposition': 'attachment; filename="card-print-sheets.pdf"'})

    return router





