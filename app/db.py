"""Small, explicit SQLite migrations; connections never span requests."""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.config import ROOT, TEMPLATE, THEMES, SAMPLE
from fastapi import HTTPException


def effective_template(template):
    template.setdefault("instructions", "Observe your organism carefully. Use your own words and accurate facts. Save a draft while you work, then submit it for teacher review.")
    for field in template["fields"]:
        field.setdefault("instructions", "Write a short, accurate response. Keep the text within the limit and check the card preview.")
        field.setdefault("example", SAMPLE.get(field["key"], ""))
    return template


@contextmanager
def connect(path):
    connection = sqlite3.connect(path, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        migrations = sorted((ROOT / "migrations").glob("[0-9]*.sql"))
        if version > len(migrations):
            raise RuntimeError("Database is newer than this app. Use the matching app version.")
        for number, migration in enumerate(migrations, 1):
            if number > version:
                db.executescript(f"BEGIN IMMEDIATE;\n{migration.read_text()}\nPRAGMA user_version={number};\nCOMMIT;")
        db.execute("INSERT OR IGNORE INTO projects(id,title,template_json) VALUES(?,?,?)",
                   ("field-guide", "Classroom field guide", json.dumps(TEMPLATE)))
        for theme in THEMES:
            db.execute("INSERT OR IGNORE INTO themes(id,config_json) VALUES(?,?)",
                       (theme["id"], json.dumps(theme)))
        # Upgrade existing projects to portable SVG designs without altering their layouts.
        from app.design_svg import design_svg
        for row in db.execute("SELECT id,title,template_json FROM projects WHERE design_svg IS NULL AND deleted_at IS NULL"):
            db.execute("UPDATE projects SET design_svg=? WHERE id=?",
                       (design_svg(row['title'], effective_template(json.loads(row['template_json']))), row['id']))


def project(path, identifier="field-guide"):
    with connect(path) as db:
        row = db.execute("SELECT * FROM projects WHERE id=? AND deleted_at IS NULL", (identifier,)).fetchone()
        themes = [json.loads(r[0]) for r in db.execute("SELECT config_json FROM themes ORDER BY rowid")]
    if identifier is None:
        row = {"id": None, "title": "New field guide", "version": 0, "template_json": json.dumps(TEMPLATE)}
    if row is None:
        raise HTTPException(404, "Project not found.")
    template = effective_template(json.loads(row["template_json"]))
    return {"id": row["id"], "title": row["title"], "version": row["version"], "template": template, "themes": themes}

