import copy
import json
import re
import secrets
from io import BytesIO
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
import qrcode
import qrcode.image.svg

from app import auth, db, images
from app.cards import CardStore, history, update_project_cards
from app.config import TEMPLATE
from app.schemas import CardWrite, ProjectWrite, ProjectDelete, ImportIdentity, Review, Model, safe_text
from pydantic import Field, field_validator
from app.design_svg import design_svg, finished_card_svg
from app.rendering import render_card
from app.schemas import Crop


class ProjectRename(Model):
    title: str = Field(min_length=1, max_length=100)
    expected_version: int = Field(ge=1)

    @field_validator('title')
    @classmethod
    def clean_title(cls, value):
        return safe_text(value).strip()


def owner_hash(request):
    token = request.headers.get('x-edit-token', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        raise HTTPException(401, 'Open a saved card on this device or enter its recovery code.')
    return auth.digest(token)


def routes(database, uploads, require_teacher):
    router = APIRouter()
    store = CardStore(database, uploads)

    @router.get('/api/projects')
    def projects():
        with db.connect(database) as connection:
            return [dict(row) for row in connection.execute('SELECT id,title,version FROM projects WHERE deleted_at IS NULL ORDER BY created_at,id')]

    @router.get('/api/student/card')
    def student_card(request: Request):
        return store.by_token(owner_hash(request))

    @router.post('/api/student/card')
    def save_card(body: CardWrite, request: Request):
        return store.save(body, owner_hash(request))

    @router.post('/api/student/images')
    async def upload_image(request: Request):
        owner = owner_hash(request)
        with db.connect(database) as connection:
            card = connection.execute('SELECT status,deleted_at FROM cards WHERE edit_hash=?', (owner,)).fetchone()
        if card and (card['deleted_at'] or card['status'] in ('Submitted', 'Approved')):
            raise HTTPException(409, 'This card is not open for student edits.')
        # The middleware caps this route at 12 MB, before decoding.
        content = await request.body()
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(images.upload, database, uploads, owner, content, unquote(request.headers.get('x-file-name', 'image')))

    @router.get('/api/teacher/cards')
    def list_cards(request: Request, project_id: str = '', class_name: str = '', status: str = '', page: int = 1):
        require_teacher(request)
        if status and status not in ('Draft', 'Submitted', 'Needs Revision', 'Approved') or page < 1:
            raise HTTPException(422, 'Invalid review filter.')
        clauses, params = ['c.deleted_at IS NULL'], []
        for key, value in [('project_id', project_id), ('class_name', class_name), ('status', status)]:
            if value:
                clauses.append(f'c.{key}=?')
                params.append(value)
        where = ' AND '.join(clauses)
        with db.connect(database) as connection:
            total = connection.execute('SELECT count(*) FROM cards c WHERE ' + where, params).fetchone()[0]
            rows = connection.execute('SELECT c.id,c.student_name,c.class_name,c.status,c.version,c.updated_at,c.project_id,p.title AS project_title,COALESCE(json_extract(c.values_json,\'$.common_name\'),json_extract(c.values_json,\'$.title\'),json_extract(c.values_json,\'$.\' || json_extract(p.template_json,\'$.fields[0].key\'))) AS title FROM cards c JOIN projects p ON p.id=c.project_id WHERE ' + where + ' ORDER BY c.updated_at DESC,c.id LIMIT 30 OFFSET ?', (*params, (page - 1) * 30)).fetchall()
            classes = [row[0] for row in connection.execute('SELECT DISTINCT class_name FROM cards WHERE deleted_at IS NULL AND class_name<>\'\' ORDER BY class_name')]
        return {'cards': [dict(row) for row in rows], 'total': total, 'page': page, 'page_size': 30, 'classes': classes}

    @router.get('/api/teacher/cards/{identifier}')
    def teacher_card(identifier: str, request: Request):
        require_teacher(request)
        return store.detail(store.by_id(identifier))

    @router.get('/api/teacher/cards/{identifier}/card.svg')
    def download_card_svg(identifier: str, request: Request):
        require_teacher(request)
        row = store.by_id(identifier)
        card = store.detail(row)
        project = db.project(database, row['project_id'])
        theme = next(item for item in project['themes'] if item['id'] == card['theme'])
        artwork = None
        if row['image_id']:
            with db.connect(database) as connection:
                image = connection.execute('SELECT * FROM images WHERE id=?', (row['image_id'],)).fetchone()
            if not image:
                raise HTTPException(503, 'Card image is missing.')
            artwork = images.render_image(image, uploads, Crop(**card['crop']), project['template']['image_box'])
        rendered = render_card(card['values'], {}, theme, project['template'], artwork)['svg']
        return Response(finished_card_svg(rendered, card, project), media_type='image/svg+xml',
                        headers={'Content-Disposition': 'attachment; filename="finished-card.svg"'})

    @router.post('/api/teacher/cards/{identifier}/image')
    async def teacher_image(identifier: str, request: Request):
        require_teacher(request)
        card = store.by_id(identifier)
        content = await request.body()
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(images.upload, database, uploads, card['edit_hash'], content, unquote(request.headers.get('x-file-name', 'image')))

    @router.post('/api/teacher/cards/{identifier}/save')
    def teacher_save(identifier: str, body: CardWrite, request: Request):
        require_teacher(request)
        if body.action != 'save':
            raise HTTPException(422, 'Use the review action to change card status.')
        return store.save(body, None, identifier)

    @router.post('/api/teacher/cards/{identifier}/review')
    def teacher_review(identifier: str, body: Review, request: Request):
        require_teacher(request)
        return store.review(identifier, body)

    def save_project(body, identifier=None):
        with db.connect(database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            if identifier:
                row = connection.execute('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', (identifier,)).fetchone()
                if not row:
                    raise HTTPException(404, 'Project not found.')
                if row['version'] != body.expected_version:
                    raise HTTPException(409, 'This project changed in another tab. Reload before saving settings.')
                template = json.loads(row['template_json'])
            else:
                if body.expected_version != 0:
                    raise HTTPException(409, 'A new project must start at version zero.')
                identifier, template = secrets.token_hex(12), copy.deepcopy(TEMPLATE)
            fields = {field['key']: field for field in template['fields']}
            from app.layouts import LayoutField
            keys = [f.key for f in body.fields]
            reserved = {'card_id', 'copies', 'card_kind', 'theme', 'image_filename', 'student_name', 'class_name', 'image'}
            if len(set(keys)) != len(keys) or set(keys) & reserved or any(not re.fullmatch(r'[a-z][a-z0-9_]{0,49}', key) for key in keys):
                raise HTTPException(422, 'Use unique lowercase field keys, excluding reserved metadata names.')
            themes = {row[0] for row in connection.execute('SELECT id FROM themes')}
            if len(set(body.themes)) != len(body.themes) or not set(body.themes) <= themes or not body.title:
                raise HTTPException(422, 'Enter a project title and choose approved themes.')
            for field in body.fields:
                if field.key not in fields:
                    fields[field.key] = LayoutField(**field.model_dump(), box=[13, 175, 150, 25], font_size=7, line_height=8).model_dump()
                else:
                    fields[field.key].update(field.model_dump())
            template['fields'] = [fields[field.key] for field in body.fields]
            template['instructions'], template['themes'] = body.instructions, body.themes
            svg = design_svg(body.title, template)
            if body.expected_version:
                connection.execute('UPDATE projects SET title=?,template_json=?,design_svg=?,version=version+1 WHERE id=?', (body.title, json.dumps(template), svg, identifier))
                update_project_cards(connection, identifier, template, 'Project settings changed; approval needs review')
            else:
                connection.execute('INSERT INTO projects(id,title,template_json,design_svg) VALUES(?,?,?,?)', (identifier, body.title, json.dumps(template), svg))
        return db.project(database, identifier)

    @router.post('/api/teacher/projects')
    def create_project(body: ProjectWrite, request: Request):
        require_teacher(request)
        return save_project(body)

    @router.post('/api/teacher/projects/{identifier}')
    def update_project(identifier: str, body: ProjectWrite, request: Request):
        require_teacher(request)
        return save_project(body, identifier)

    @router.post('/api/teacher/projects/{identifier}/rename')
    def rename_project(identifier: str, body: ProjectRename, request: Request):
        require_teacher(request)
        if not body.title:
            raise HTTPException(422, 'Enter a project name.')
        with db.connect(database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute('SELECT version,template_json FROM projects WHERE id=? AND deleted_at IS NULL', (identifier,)).fetchone()
            if not row:
                raise HTTPException(404, 'Project not found.')
            if row['version'] != body.expected_version:
                raise HTTPException(409, 'Project changed. Reload before renaming it.')
            template = json.loads(row['template_json'])
            connection.execute('UPDATE projects SET title=?,design_svg=?,version=version+1 WHERE id=?',
                               (body.title, design_svg(body.title, template), identifier))
        return db.project(database, identifier)

    @router.post('/api/teacher/projects/{identifier}/import-identity')
    def import_identity(identifier: str, body: ImportIdentity, request: Request):
        require_teacher(request)
        if body.student_name is None and body.class_name is None:
            raise HTTPException(422, 'Choose Student, Class, or both to update.')
        with db.connect(database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            project = connection.execute('SELECT version FROM projects WHERE id=? AND deleted_at IS NULL', (identifier,)).fetchone()
            if not project or project['version'] != body.expected_version:
                raise HTTPException(409, 'Project changed. Reload its settings before updating imported cards.')
            rows = connection.execute('SELECT * FROM cards WHERE project_id=? AND external_id IS NOT NULL AND deleted_at IS NULL', (identifier,)).fetchall()
            for row in rows:
                connection.execute("UPDATE cards SET student_name=?,class_name=?,status=?,version=version+1,last_mutation=NULL,last_payload=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                                   (body.student_name if body.student_name is not None else row['student_name'],
                                    body.class_name if body.class_name is not None else row['class_name'],
                                    'Submitted' if row['status'] == 'Approved' else row['status'], row['id']))
                history(connection, connection.execute('SELECT * FROM cards WHERE id=?', (row['id'],)).fetchone(), 'teacher', 'Update imported Student/Class')
            if rows:
                connection.execute('UPDATE projects SET version=version+1 WHERE id=?', (identifier,))
        return {'updated': len(rows)}

    @router.post('/api/teacher/projects/{identifier}/delete')
    def delete_project(identifier: str, body: ProjectDelete, request: Request):
        require_teacher(request)
        with db.connect(database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', (identifier,)).fetchone()
            if not row:
                raise HTTPException(404, 'Project not found.')
            if row['version'] != body.expected_version:
                raise HTTPException(409, 'This project changed in another tab. Reload before deleting.')
            connection.execute('UPDATE projects SET deleted_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?', (identifier,))
            cards = connection.execute('SELECT id FROM cards WHERE project_id=? AND deleted_at IS NULL', (identifier,)).fetchall()
            for card in cards:
                connection.execute('UPDATE cards SET deleted_at=CURRENT_TIMESTAMP,version=version+1,last_mutation=NULL,last_payload=NULL WHERE id=?', (card['id'],))
                history(connection, connection.execute('SELECT * FROM cards WHERE id=?', (card['id'],)).fetchone(), 'teacher', 'Project deleted')
        return {'ok': True}

    @router.get('/api/teacher/qr')
    def qr(request: Request, project_id: str = 'field-guide'):
        require_teacher(request)
        db.project(database, project_id)
        url = str(request.base_url).rstrip('/') + '/student?project=' + project_id
        image = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, border=4)
        output = BytesIO()
        image.save(output)
        return Response(output.getvalue(), media_type='image/svg+xml')

    return router



