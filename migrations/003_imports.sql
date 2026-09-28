ALTER TABLE cards ADD COLUMN external_id TEXT;
ALTER TABLE cards ADD COLUMN copies INTEGER NOT NULL DEFAULT 1 CHECK(copies BETWEEN 1 AND 999);
ALTER TABLE cards ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'organism';
CREATE UNIQUE INDEX cards_external_id ON cards(project_id,external_id) WHERE deleted_at IS NULL AND external_id IS NOT NULL;
CREATE TABLE import_jobs (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id),
 project_version INTEGER NOT NULL,
 payload_json TEXT NOT NULL,
 result_json TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
