BEGIN IMMEDIATE;
CREATE TABLE remote_settings(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL);
CREATE TABLE remote_projects(project_id TEXT PRIMARY KEY REFERENCES projects(id),share_logs INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remote_commands(id TEXT PRIMARY KEY,idem TEXT NOT NULL UNIQUE,envelope TEXT NOT NULL,state TEXT NOT NULL,detail TEXT NOT NULL);
CREATE TABLE remote_tasks(remote_id TEXT PRIMARY KEY,local_id TEXT NOT NULL UNIQUE REFERENCES tasks(id));
CREATE TABLE remote_event_ack(id TEXT PRIMARY KEY);
INSERT INTO schema_migrations(version) VALUES(4);
PRAGMA user_version=4;
COMMIT;
