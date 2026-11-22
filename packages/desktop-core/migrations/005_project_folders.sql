CREATE TABLE project_folders(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),path TEXT NOT NULL UNIQUE COLLATE NOCASE,repo_root TEXT,is_git INTEGER NOT NULL,is_primary INTEGER NOT NULL,position INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE UNIQUE INDEX one_primary_folder ON project_folders(project_id) WHERE is_primary=1;
INSERT INTO project_folders SELECT lower(hex(randomblob(16))),id,path,CASE WHEN is_git THEN path END,is_git,1,0,created_at FROM projects;
INSERT INTO schema_migrations(version) VALUES(5);
PRAGMA user_version=5;
