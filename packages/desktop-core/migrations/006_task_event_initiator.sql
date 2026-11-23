ALTER TABLE task_events ADD COLUMN initiator TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE task_events ADD COLUMN initiator_ref TEXT;
INSERT INTO schema_migrations(version) VALUES(6);
PRAGMA user_version=6;
