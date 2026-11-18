CREATE TABLE writing_policies(task_id TEXT PRIMARY KEY REFERENCES tasks(id),record TEXT NOT NULL);
CREATE TABLE writing_patches(task_id TEXT PRIMARY KEY REFERENCES tasks(id),execution_id TEXT NOT NULL REFERENCES executions(id),record TEXT NOT NULL);
INSERT INTO schema_migrations(version) VALUES(3);
PRAGMA user_version=3;
