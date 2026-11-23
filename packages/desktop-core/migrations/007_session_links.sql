CREATE TABLE IF NOT EXISTS session_links(
  agent TEXT NOT NULL,
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(agent, session_id)
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(7);
PRAGMA user_version=7;
