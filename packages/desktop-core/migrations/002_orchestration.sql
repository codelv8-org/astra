ALTER TABLE tasks ADD COLUMN details TEXT;
CREATE TABLE workflows(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),objective TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,rework_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE task_dependencies(task_id TEXT NOT NULL REFERENCES tasks(id),depends_on TEXT NOT NULL REFERENCES tasks(id),PRIMARY KEY(task_id,depends_on),CHECK(task_id<>depends_on));
CREATE TABLE task_events(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL REFERENCES tasks(id),kind TEXT NOT NULL,text TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE task_authorizations(task_id TEXT PRIMARY KEY REFERENCES tasks(id),fingerprint TEXT NOT NULL,approved_at TEXT NOT NULL);
CREATE TABLE scheduler_state(id INTEGER PRIMARY KEY CHECK(id=1),paused INTEGER NOT NULL);
INSERT INTO scheduler_state VALUES(1,1);
INSERT INTO schema_migrations(version) VALUES(2);
PRAGMA user_version=2;
