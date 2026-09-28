CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    template_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE themes (id TEXT PRIMARY KEY, config_json TEXT NOT NULL);
CREATE TABLE teacher_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);

