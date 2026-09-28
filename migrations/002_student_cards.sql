ALTER TABLE projects ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE images (
    id TEXT PRIMARY KEY,
    owner_hash TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_path TEXT NOT NULL,
    preview_path TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_hash, sha256)
);
CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    edit_hash TEXT NOT NULL UNIQUE,
    student_name TEXT NOT NULL DEFAULT '',
    class_name TEXT NOT NULL DEFAULT '',
    values_json TEXT NOT NULL DEFAULT '{}',
    theme TEXT NOT NULL REFERENCES themes(id),
    image_id TEXT REFERENCES images(id),
    crop_json TEXT NOT NULL DEFAULT '{"x":0.5,"y":0.5,"zoom":1,"rotation":0}',
    status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Submitted','Needs Revision','Approved')),
    teacher_note TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    last_mutation TEXT,
    last_payload TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
);
CREATE INDEX cards_review ON cards(project_id, class_name, status, deleted_at);
CREATE TABLE card_history (
    id INTEGER PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
