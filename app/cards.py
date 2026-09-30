"""Card persistence and transitions. Every write is version checked in SQLite."""
import hashlib
import json
import secrets

from fastapi import HTTPException

from app import db, images
from app.schemas import Crop, Preview
from app.rendering import render_card


def record(row):
    value = dict(row)
    value['values'] = json.loads(value.pop('values_json'))
    value['crop'] = json.loads(value.pop('crop_json'))
    for key in ('edit_hash', 'last_payload', 'last_mutation', 'deleted_at'):
        value.pop(key, None)
    return value


def history(connection, row, actor, action):
    connection.execute('INSERT INTO card_history(card_id,actor,action,snapshot_json) VALUES(?,?,?,?)',
                       (row['id'], actor, action, json.dumps(record(row))))


def update_project_cards(connection, identifier, template, action):
    keys = {f['key'] for f in template['fields']}
    rows = connection.execute('SELECT * FROM cards WHERE project_id=? AND deleted_at IS NULL', (identifier,)).fetchall()
    for row in rows:
        values = json.loads(row['values_json'])
        filtered = {k: v for k, v in values.items() if k in keys}
        removed = filtered != values
        if removed or row['status'] == 'Approved':
            if removed:
                history(connection, row, 'teacher', 'Before field removal (original content retained here)')
            connection.execute("UPDATE cards SET values_json=?,status=?,version=version+1,last_mutation=NULL,last_payload=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                               (json.dumps(filtered), 'Submitted' if row['status'] == 'Approved' else row['status'], row['id']))
            history(connection, connection.execute('SELECT * FROM cards WHERE id=?', (row['id'],)).fetchone(), 'teacher', action)


class CardStore:
    def __init__(self, database, uploads):
        self.database, self.uploads = database, uploads

    def by_token(self, owner):
        with db.connect(self.database) as connection:
            row = connection.execute('SELECT * FROM cards WHERE edit_hash=?', (owner,)).fetchone()
        if row is None:
            raise HTTPException(404, 'No saved card yet. Start a draft below.')
        if row['deleted_at']:
            raise HTTPException(410, 'Your teacher deleted this card. Start a new card to continue.')
        return self.detail(row)

    def by_id(self, identifier):
        with db.connect(self.database) as connection:
            row = connection.execute('SELECT * FROM cards WHERE id=? AND deleted_at IS NULL', (identifier,)).fetchone()
        if row is None:
            raise HTTPException(404, 'Card not found.')
        return row

    def detail(self, row):
        result = record(row)
        project = db.project(self.database, row['project_id'])
        result['project_version'] = project['version']
        result['project_title'] = project['title']
        result['image'] = None
        if row['image_id']:
            with db.connect(self.database) as connection:
                image = connection.execute('SELECT * FROM images WHERE id=?', (row['image_id'],)).fetchone()
            if image:
                result['image'] = images.public_image(image)
        with db.connect(self.database) as connection:
            result['history'] = [dict(item) for item in connection.execute(
                'SELECT actor,action,created_at FROM card_history WHERE card_id=? ORDER BY id DESC LIMIT 20', (row['id'],))]
        return result

    def preview(self, body, owner=None, teacher=False):
        project = db.project(self.database, body.project_id)
        template = project['template']
        fields = {f['key'] for f in template['fields']}
        label_fields = {f['key'] for f in template['fields'] if f['label_box']}
        if set(body.values) - fields or set(body.labels) - label_fields:
            raise HTTPException(422, 'Unknown card field or label.')
        theme = next((t for t in project['themes'] if t['id'] == body.theme and t['id'] in template['themes']), None)
        if theme is None:
            raise HTTPException(422, 'Choose an approved theme.')
        artwork = None
        if body.image_id:
            with db.connect(self.database) as connection:
                row = connection.execute('SELECT * FROM images WHERE id=?', (body.image_id,)).fetchone()
                deleted = connection.execute('SELECT 1 FROM cards WHERE edit_hash=? AND deleted_at IS NOT NULL', (owner,)).fetchone() if owner else None
            if not row or (not teacher and (row['owner_hash'] != owner or deleted)):
                raise HTTPException(404, 'Image not found for this card.')
            artwork = images.render_image(row, self.uploads, body.crop, template['image_box'])
        result = render_card(body.values, body.labels, theme, template, artwork)
        result['warnings'] = [artwork['warning']] if artwork and artwork['warning'] else []
        result['image_dpi'] = artwork['dpi'] if artwork else None
        return result, project

    def validate_write(self, body, owner, teacher=False, existing=None):
        if body.labels:
            raise HTTPException(422, 'Card labels are controlled by the project. Reload the project directions.')
        rendered, project = self.preview(body, owner, teacher)
        issues = [i for i in rendered['issues'] if i['code'] != 'required' or body.action == 'submit']
        if body.action == 'submit':
            if not body.student_name:
                issues.append({'field': 'student_name', 'message': 'Enter your name before submitting.'})
            if not body.class_name:
                issues.append({'field': 'class_name', 'message': 'Enter your class or period before submitting.'})
        if teacher and existing and body.values == json.loads(existing['values_json']) and body.action == 'save':
            issues = []  # Allow identity, quantity, and image corrections while existing text awaits review.
        if issues:
            raise HTTPException(422, {'message': 'Please fix the marked fields. Your text has not been changed.', 'issues': issues})
        if body.project_version != project['version']:
            raise HTTPException(409, 'The project directions changed. Reload the project before saving; your local text is retained.')
        return project

    def save(self, body, owner, teacher_id=None):
        # Validation and image processing occur before taking the write lock.
        if not teacher_id and body.copies is not None:
            raise HTTPException(403, 'Only teachers can change print quantity.')
        existing = self.by_id(teacher_id) if teacher_id else None
        project = self.validate_write(body, owner, teacher_id is not None, existing)
        fingerprint = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        with db.connect(self.database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            if teacher_id:
                row = connection.execute('SELECT * FROM cards WHERE id=?', (teacher_id,)).fetchone()
            else:
                row = connection.execute('SELECT * FROM cards WHERE edit_hash=?', (owner,)).fetchone()
            if row and row['deleted_at']:
                raise HTTPException(410, 'This card was deleted. Your changes were not saved.')
            if row and row['last_mutation'] == body.mutation_id and row['last_payload'] == fingerprint:
                return record(row)
            current_project = connection.execute('SELECT version FROM projects WHERE id=?', (body.project_id,)).fetchone()
            if not current_project or current_project[0] != project['version']:
                raise HTTPException(409, 'The project changed while saving. Reload its directions and retry.')
            if row:
                if row['version'] != body.expected_version:
                    raise HTTPException(409, 'A newer version exists. Load the latest card before saving; your unsaved text is retained on this device.')
                if row['project_id'] != body.project_id:
                    raise HTTPException(422, 'An existing card cannot switch projects. Start a new card instead.')
                if not teacher_id and row['status'] in ('Submitted', 'Approved'):
                    raise HTTPException(409, 'This card is with your teacher. It can be edited again after Needs Revision.')
                status = 'Submitted' if body.action == 'submit' or row['status'] == 'Approved' else row['status']
                identifier = row['id']
                connection.execute('UPDATE cards SET student_name=?,class_name=?,values_json=?,theme=?,image_id=?,crop_json=?,status=?,copies=?,version=version+1,last_mutation=?,last_payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                                   (body.student_name, body.class_name, json.dumps(body.values), body.theme, body.image_id, body.crop.model_dump_json(), status, body.copies if teacher_id and body.copies is not None else row['copies'], body.mutation_id, fingerprint, identifier))
            else:
                if teacher_id or body.expected_version != 0:
                    raise HTTPException(409, 'The saved card was not found. Reload before continuing.')
                identifier = secrets.token_hex(16)
                connection.execute('INSERT INTO cards(id,project_id,edit_hash,student_name,class_name,values_json,theme,image_id,crop_json,status,last_mutation,last_payload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                                   (identifier, body.project_id, owner, body.student_name, body.class_name, json.dumps(body.values), body.theme, body.image_id, body.crop.model_dump_json(), 'Submitted' if body.action == 'submit' else 'Draft', body.mutation_id, fingerprint))
            saved = connection.execute('SELECT * FROM cards WHERE id=?', (identifier,)).fetchone()
            history(connection, saved, 'teacher' if teacher_id else 'student', 'Edit card' if teacher_id else ('Submit' if body.action == 'submit' else 'Save draft'))
        return record(saved)

    def review(self, identifier, body):
        initial = self.by_id(identifier)
        project = None
        if body.action == 'approve':
            preview = Preview(values=json.loads(initial['values_json']), theme=initial['theme'], project_id=initial['project_id'], image_id=initial['image_id'], crop=Crop(**json.loads(initial['crop_json'])))
            rendered, project = self.preview(preview, teacher=True)
            if not rendered['valid'] or not initial['student_name'] or not initial['class_name']:
                raise HTTPException(422, {'message': 'This card needs valid text, student name, and class before approval.', 'issues': rendered['issues']})
        if body.action == 'revision' and not body.note:
            raise HTTPException(422, 'Add a short revision note so the student knows what to change.')
        with db.connect(self.database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute('SELECT * FROM cards WHERE id=? AND deleted_at IS NULL', (identifier,)).fetchone()
            if not row:
                raise HTTPException(404, 'Card not found.')
            if row['version'] != body.expected_version or row['version'] != initial['version']:
                raise HTTPException(409, 'This card changed. Load the latest version before reviewing.')
            if project and connection.execute('SELECT version FROM projects WHERE id=?', (row['project_id'],)).fetchone()[0] != project['version']:
                raise HTTPException(409, 'Project directions changed. Reload before approving.')
            if body.action == 'approve' and row['status'] != 'Submitted' and not (row['external_id'] and row['status'] == 'Needs Revision'):
                raise HTTPException(409, 'Only submitted cards can be approved.')
            if body.action == 'revision' and row['status'] not in ('Submitted', 'Approved'):
                raise HTTPException(409, 'Request revision from a submitted or approved card.')
            if body.action == 'delete':
                connection.execute('UPDATE cards SET deleted_at=CURRENT_TIMESTAMP,version=version+1,last_mutation=NULL,last_payload=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?', (identifier,))
            else:
                connection.execute('UPDATE cards SET status=?,teacher_note=?,version=version+1,last_mutation=NULL,last_payload=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                                   ('Approved' if body.action == 'approve' else 'Needs Revision', body.note, identifier))
            saved = connection.execute('SELECT * FROM cards WHERE id=?', (identifier,)).fetchone()
            history(connection, saved, 'teacher', body.action)
        return record(saved)


