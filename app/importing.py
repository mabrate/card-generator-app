"""Staged CSV imports and teacher layout authoring; commit is transactional/idempotent."""
import csv
import hashlib
import io
import json
import re
import secrets
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import Field
from starlette.concurrency import run_in_threadpool

from app import db, images
from app.cards import history
from app.config import THEMES
from app.layouts import Layout, LayoutWrite, default_layout
from app.rendering import render_card
from app.schemas import Model, Crop, safe_text
from app.spreadsheet import export_template, template_headers

META = ['card_id', 'card_kind', 'copies', 'image_filename', 'theme']


class CSVInput(Model):
    csv: str = Field(max_length=1_000_000)


class ImportInput(CSVInput):
    project_id: str = Field(max_length=64)
    mapping: dict[str, str] = Field(max_length=17)
    assets: dict[str, str] = Field(default_factory=dict, max_length=200)
    duplicate: str = Field(pattern='^(skip|update|copy)$')


class StudioPreview(Model):
    template: Layout
    values: dict[str, str] = Field(max_length=12)
    theme: str = 'sage'
    image_id: str | None = None
    crop: Crop = Field(default_factory=Crop)


def read_csv(text):
    try:
        reader = csv.reader(io.StringIO(text.lstrip('\ufeff'), newline=''), strict=True)
        headers = next(reader)
        if not headers or len(headers) > 40 or any(not h or len(h) > 100 for h in headers) or len(set(headers)) != len(headers):
            raise ValueError('Use 1–40 unique, nonempty column names (up to 100 characters).')
        rows = []
        for number, cells in enumerate(reader, 2):
            if not cells or not any(cells):
                continue
            if len(cells) != len(headers):
                raise ValueError(f'CSV row {number} has {len(cells)} cells; expected {len(headers)}.')
            rows.append({'row': number, 'data': dict(zip(headers, cells))})
            if len(rows) > 500:
                raise ValueError('Import at most 500 cards at a time.')
        if not rows:
            raise ValueError('The CSV has headers but no card rows.')
        return headers, rows
    except (csv.Error, StopIteration, ValueError) as error:
        raise HTTPException(422, str(error) or 'Choose a nonempty UTF-8 CSV file.')


def import_routes(database, uploads, require_teacher):
    router = APIRouter()

    @router.get('/api/teacher/layout/default')
    def default(request: Request):
        require_teacher(request)
        return default_layout()

    @router.post('/api/teacher/layout/preview')
    def preview(body: StudioPreview, request: Request):
        require_teacher(request)
        for text in body.values.values():
            if len(text) > 2000:
                raise HTTPException(422, 'Each field is limited to 2,000 source characters.')
            try:
                safe_text(text)
            except ValueError as error:
                raise HTTPException(422, str(error))
        template = body.template.model_dump()
        theme = next((t for t in THEMES if t['id'] == body.theme), None)
        if not theme:
            raise HTTPException(422, 'Unknown theme.')
        artwork = None
        if body.image_id:
            with db.connect(database) as connection:
                image = connection.execute('SELECT * FROM images WHERE id=?', (body.image_id,)).fetchone()
            if not image:
                raise HTTPException(404, 'Image not found.')
            artwork = images.render_image(image, uploads, body.crop, template['image_box'])
        return render_card(body.values, {}, theme, template, artwork)

    @router.post('/api/teacher/layout/{identifier}')
    def save_layout(identifier: str, body: LayoutWrite, request: Request):
        require_teacher(request)
        template = body.template.model_dump()
        if not body.title or not set(template['themes']) <= {t['id'] for t in THEMES}:
            raise HTTPException(422, 'Enter a title and valid themes.')
        with db.connect(database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            if identifier == 'new':
                if body.expected_version != 0:
                    raise HTTPException(409, 'A new layout starts at version zero.')
                identifier = secrets.token_hex(12)
                connection.execute('INSERT INTO projects(id,title,template_json) VALUES(?,?,?)', (identifier, body.title, json.dumps(template)))
            else:
                row = connection.execute('SELECT * FROM projects WHERE id=?', (identifier,)).fetchone()
                if not row or row['version'] != body.expected_version:
                    raise HTTPException(409, 'Project changed. Reopen its saved layout before editing.')
                old = json.loads(row['template_json'])
                removed = {f['key'] for f in old['fields']} - {f['key'] for f in template['fields']}
                if removed and connection.execute('SELECT 1 FROM cards WHERE project_id=? AND deleted_at IS NULL', (identifier,)).fetchone():
                    raise HTTPException(422, 'Cannot remove or rename field keys while this project has cards. Create a new layout instead.')
                connection.execute('UPDATE projects SET title=?,template_json=?,version=version+1 WHERE id=?', (body.title, json.dumps(template), identifier))
                approved = connection.execute("SELECT id FROM cards WHERE project_id=? AND status='Approved' AND deleted_at IS NULL", (identifier,)).fetchall()
                for card in approved:
                    connection.execute("UPDATE cards SET status='Submitted',version=version+1,last_mutation=NULL,last_payload=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", (card['id'],))
                    history(connection, connection.execute('SELECT * FROM cards WHERE id=?', (card['id'],)).fetchone(), 'teacher', 'Layout changed; approval needs review')
        return db.project(database, identifier)

    @router.get('/api/teacher/layout/{identifier}/template.csv')
    def template_csv(identifier: str, request: Request):
        require_teacher(request)
        template = db.project(database, identifier)['template']
        out = io.StringIO(newline='')
        writer = csv.writer(out)
        # Header-only: a teacher supplies actual card data, never imports an example row by accident.
        writer.writerow(template_headers(template))
        return Response('\ufeff' + out.getvalue(), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': 'attachment; filename="card-data-template.csv"'})

    @router.get('/api/teacher/layout/{identifier}/template.xlsx')
    def template_xlsx(identifier: str, request: Request):
        require_teacher(request)
        content = export_template(db.project(database, identifier))
        return Response(content, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        headers={'Content-Disposition': 'attachment; filename="card-data-template.xlsx"'})

    @router.post('/api/teacher/import/inspect')
    def inspect_csv(body: CSVInput, request: Request):
        require_teacher(request)
        headers, rows = read_csv(body.csv)
        return {'headers': headers, 'rows': rows, 'count': len(rows)}

    @router.post('/api/teacher/import/image')
    async def image_upload(request: Request):
        require_teacher(request)
        content = await request.body()
        owner = 'import-' + hashlib.sha256(content).hexdigest()
        return await run_in_threadpool(images.upload, database, uploads, owner, content, unquote(request.headers.get('x-file-name', 'image')))

    @router.post('/api/teacher/import/preview')
    def stage(body: ImportInput, request: Request):
        require_teacher(request)
        headers, source_rows = read_csv(body.csv)
        project = db.project(database, body.project_id)
        template = project['template']
        keys = [f['key'] for f in template['fields']]
        if set(body.mapping) - set(keys + META) or any(h not in headers for h in body.mapping.values()):
            raise HTTPException(422, 'Choose CSV columns from this file for this layout.')
        if len(set(body.mapping.values())) != len(body.mapping):
            raise HTTPException(422, 'Map each source column only once.')
        required = [f['label'] for f in template['fields'] if f['required'] and f['key'] not in body.mapping]
        if required:
            raise HTTPException(422, 'Map required fields: ' + ', '.join(required))
        rows, seen = [], set()
        with db.connect(database) as connection:
            for source in source_rows:
                raw = source['data']
                mapped = {k: raw[h] for k, h in body.mapping.items()}
                values = {k: mapped.get(k, '') for k in keys}
                errors, warnings = [], []
                for k, value in mapped.items():
                    try:
                        safe_text(value)
                    except ValueError:
                        errors.append(f'{k}: unsupported control characters.')
                    if len(value) > 2000:
                        errors.append(f'{k}: exceeds the 2,000-character source limit; nothing will be truncated.')
                external = mapped.get('card_id', '').strip() or secrets.token_hex(12)
                if len(external) > 100:
                    errors.append('card_id must be at most 100 characters.')
                if external in seen:
                    errors.append('Repeated card_id within this file.')
                seen.add(external)
                copies_text = mapped.get('copies', '') or '1'
                copies = int(copies_text) if re.fullmatch(r'[0-9]{1,3}', copies_text) else 0
                if not 1 <= copies <= 999:
                    errors.append('copies must be an integer from 1 to 999.')
                theme_id = mapped.get('theme') or template['themes'][0]
                theme = next((t for t in project['themes'] if t['id'] == theme_id and t['id'] in template['themes']), None)
                if not theme:
                    errors.append('Theme is not approved for this project.')
                filename = mapped.get('image_filename', '')
                image_id, artwork = body.assets.get(filename), None
                if filename:
                    image = connection.execute('SELECT * FROM images WHERE id=?', (image_id,)).fetchone() if image_id else None
                    if not image:
                        errors.append(f'Missing image asset: {filename}. Select the matching image file.')
                    else:
                        artwork = images.render_image(image, uploads, Crop(), template['image_box'])
                        if artwork['warning']:
                            warnings.append(artwork['warning'])
                result = render_card(values, {}, theme, template, artwork) if not errors else None
                issues = result['issues'] if result else []
                existing = connection.execute('SELECT id,version FROM cards WHERE project_id=? AND external_id=? AND deleted_at IS NULL', (body.project_id, external)).fetchone()
                action = body.duplicate if existing else 'create'
                rows.append({'row': source['row'], 'external_id': external, 'values': values, 'copies': copies,
                             'card_kind': mapped.get('card_kind') or 'organism', 'theme': theme_id,
                             'image_id': image_id if filename else None, 'errors': errors, 'issues': issues,
                             'warnings': warnings, 'action': action, 'existing': dict(existing) if existing else None})
            identifier = secrets.token_hex(16)
            payload = {'rows': rows, 'source_csv': body.csv, 'mapping': body.mapping, 'duplicate': body.duplicate}
            connection.execute('INSERT INTO import_jobs(id,project_id,project_version,payload_json) VALUES(?,?,?,?)',
                               (identifier, body.project_id, project['version'], json.dumps(payload)))
        return {'id': identifier, 'rows': rows, 'project_version': project['version'],
                'unmapped': [h for h in headers if h not in body.mapping.values()],
                'ready': sum(not r['errors'] and r['action'] != 'skip' for r in rows),
                'copies': sum(r['copies'] for r in rows if not r['errors'] and r['action'] != 'skip')}

    @router.post('/api/teacher/import/{identifier}/commit')
    def commit(identifier: str, request: Request):
        require_teacher(request)
        with db.connect(database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            job = connection.execute('SELECT * FROM import_jobs WHERE id=?', (identifier,)).fetchone()
            if not job:
                raise HTTPException(404, 'Import preview not found.')
            if job['result_json']:
                return json.loads(job['result_json'])
            version = connection.execute('SELECT version FROM projects WHERE id=?', (job['project_id'],)).fetchone()[0]
            if version != job['project_version']:
                raise HTTPException(409, 'Layout changed after preview. Validate the CSV again before importing.')
            result = {'created': 0, 'updated': 0, 'skipped': 0, 'rejected': 0, 'needs_review': 0, 'copies': 0, 'card_ids': []}
            for row in json.loads(job['payload_json'])['rows']:
                if row['errors']:
                    result['rejected'] += 1
                    continue
                current = connection.execute('SELECT id,version FROM cards WHERE project_id=? AND external_id=? AND deleted_at IS NULL', (job['project_id'], row['external_id'])).fetchone()
                if (dict(current) if current else None) != row['existing']:
                    raise HTTPException(409, 'A matching card changed after preview. Validate again; no cards were imported.')
                if row['action'] == 'skip':
                    result['skipped'] += 1
                    continue
                status = 'Needs Revision' if row['issues'] else 'Submitted'
                note = 'Import needs review: ' + '; '.join(i['message'] for i in row['issues']) if row['issues'] else ''
                external = row['external_id'] + '-' + secrets.token_hex(4) if row['action'] == 'copy' else row['external_id']
                params = (json.dumps(row['values']), row['theme'], row['image_id'], status, note, external, row['copies'], row['card_kind'])
                if row['action'] == 'update':
                    card_id = current['id']
                    connection.execute("UPDATE cards SET values_json=?,theme=?,image_id=?,status=?,teacher_note=?,external_id=?,copies=?,card_kind=?,crop_json='{\"x\":0.5,\"y\":0.5,\"zoom\":1,\"rotation\":0}',version=version+1,last_mutation=NULL,last_payload=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", (*params, card_id))
                    result['updated'] += 1
                else:
                    card_id = secrets.token_hex(16)
                    connection.execute('INSERT INTO cards(values_json,theme,image_id,status,teacher_note,external_id,copies,card_kind,id,project_id,edit_hash,student_name,class_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                       (*params, card_id, job['project_id'], secrets.token_hex(32), 'Teacher import', 'CSV import'))
                    result['created'] += 1
                history(connection, connection.execute('SELECT * FROM cards WHERE id=?', (card_id,)).fetchone(), 'teacher', 'CSV import ' + row['action'])
                result['needs_review'] += bool(row['issues'])
                result['copies'] += row['copies']
                result['card_ids'].append(card_id)
            connection.execute('UPDATE import_jobs SET result_json=? WHERE id=?', (json.dumps(result), identifier))
        return result

    return router

