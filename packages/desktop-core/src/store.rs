use crate::models::*;
use crate::{now, redact, Result};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone)]
pub struct Store {
    pub path: PathBuf,
    pub(crate) queue_lock: std::sync::Arc<parking_lot::ReentrantMutex<()>>,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let store = Self {
            path: path.as_ref().into(),
            queue_lock: Default::default(),
        };
        if let Some(parent) = store.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let db = store.connect()?;
        db.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;
        let version: i64 = db
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > 4 {
            return Err("Database schema is newer than this application".into());
        }
        db.execute_batch(include_str!("../migrations/001_initial.sql"))
            .map_err(|e| e.to_string())?;
        if version < 2 {
            db.execute_batch("BEGIN IMMEDIATE")
                .map_err(|e| e.to_string())?;
            if let Err(error) =
                db.execute_batch(include_str!("../migrations/002_orchestration.sql"))
            {
                let _ = db.execute_batch("ROLLBACK");
                return Err(error.to_string());
            }
            db.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        }
        if version < 3 {
            db.execute_batch("BEGIN IMMEDIATE")
                .map_err(|e| e.to_string())?;
            if let Err(error) = db.execute_batch(include_str!("../migrations/003_writing.sql")) {
                let _ = db.execute_batch("ROLLBACK");
                return Err(error.to_string());
            }
            db.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        }
        if version < 4 {
            db.execute_batch(include_str!("../migrations/004_remote.sql"))
                .map_err(|e| e.to_string())?;
        }
        let agents: Vec<serde_json::Value> =
            serde_json::from_str(include_str!("../../shared/default-agents.json"))
                .map_err(|e| e.to_string())?;
        for agent in agents {
            db.execute(
                "INSERT OR IGNORE INTO agents(id,record) VALUES(?1,?2)",
                params![agent["id"].as_str(), agent.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(store)
    }

    pub fn connect(&self) -> Result<Connection> {
        let db = Connection::open(&self.path).map_err(|e| e.to_string())?;
        db.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        db.pragma_update(None, "foreign_keys", true)
            .map_err(|e| e.to_string())?;
        Ok(db)
    }

    pub fn recover_interrupted(&self) -> Result<()> {
        let ids: Vec<String> = {
            let db = self.connect()?;
            let mut stmt = db
                .prepare("SELECT id FROM executions WHERE status='running'")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<std::result::Result<_, _>>()
                .map_err(|e| e.to_string())?
        };
        self.connect()?
            .execute("UPDATE scheduler_state SET paused=1 WHERE id=1", [])
            .map_err(|e| e.to_string())?;
        for id in ids {
            self.finish(
                &id,
                "failed",
                Some("Desktop stopped before execution completed"),
            )?;
        }
        self.reconcile_queue()?;
        Ok(())
    }

    pub fn register_project(&self, name: &str, goal: &str, selected: &Path) -> Result<Project> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 100 || goal.chars().count() > 4000 {
            return Err("Invalid project name or goal length".into());
        }
        let canonical = selected
            .canonicalize()
            .map_err(|_| "Selected directory does not exist")?;
        if !canonical.is_dir() || canonical.parent().is_none() {
            return Err("Select a project directory, not a drive root".into());
        }
        let text = canonical.to_string_lossy().to_string();
        if text.starts_with("\\\\") && !text.starts_with("\\\\?\\") {
            return Err("Network workspaces are not supported in Phase 1".into());
        }
        if text.starts_with("\\\\?\\UNC\\") {
            return Err("Network workspaces are not supported in Phase 1".into());
        }
        for protected in ["SystemRoot", "ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(value) = std::env::var(protected) {
                if let Ok(root) = Path::new(&value).canonicalize() {
                    if canonical.starts_with(root) {
                        return Err(
                            "System directories cannot be approved as project workspaces".into(),
                        );
                    }
                }
            }
        }
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            goal: goal.trim().into(),
            path: text,
            is_git: canonical.join(".git").exists(),
            created_at: now(),
        };
        self.connect()?
            .execute(
                "INSERT INTO projects VALUES(?1,?2,?3,?4,?5,?6)",
                params![
                    project.id,
                    project.name,
                    project.goal,
                    project.path,
                    project.is_git,
                    project.created_at
                ],
            )
            .map_err(|e| {
                format!("Cannot register project (directory may already be registered): {e}")
            })?;
        self.audit("workspace_approved", &project.id)?;
        Ok(project)
    }

    pub fn project(&self, id: &str) -> Result<Project> {
        self.connect()?
            .query_row(
                "SELECT id,name,goal,path,is_git,created_at FROM projects WHERE id=?1",
                [id],
                |r| {
                    Ok(Project {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        goal: r.get(2)?,
                        path: r.get(3)?,
                        is_git: r.get(4)?,
                        created_at: r.get(5)?,
                    })
                },
            )
            .map_err(|_| "Unknown project".into())
    }

    pub fn agent(&self, id: &str) -> Result<serde_json::Value> {
        let record: String = self
            .connect()?
            .query_row("SELECT record FROM agents WHERE id=?1", [id], |r| r.get(0))
            .map_err(|_| "Unknown agent")?;
        serde_json::from_str(&record).map_err(|e| e.to_string())
    }

    pub fn begin_run(&self, request: &RunRequest, executable: &str) -> Result<Execution> {
        let _queue_guard = self.queue_lock.lock();
        if !request.approved {
            return Err("Explicit human approval is required".into());
        }
        if request.prompt.trim().is_empty() || request.prompt.chars().count() > 8000 {
            return Err("Prompt must contain 1–8000 characters".into());
        }
        if !["mock", "codex", "claude", "antigravity"].contains(&request.adapter.as_str()) {
            return Err("Unsupported runtime adapter".into());
        }
        let project = self.project(&request.project_id)?;
        let canonical = Path::new(&project.path)
            .canonicalize()
            .map_err(|_| "Approved workspace is unavailable")?;
        if !canonical.is_dir() || canonical.to_string_lossy() != project.path {
            return Err("Approved workspace changed; register it again".into());
        }
        let mut db = self.connect()?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let recovering:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM writing_patches p JOIN tasks t ON t.id=p.task_id WHERE t.project_id=?1 AND json_extract(p.record,'$.state')='applying')",[&request.project_id],|r|r.get(0)).map_err(|e|e.to_string())?;
        if recovering {
            return Err(
                "Workspace has an interrupted patch; recover the journal before execution".into(),
            );
        }
        let record: String = tx
            .query_row(
                "SELECT record FROM agents WHERE id=?1",
                [&request.agent_id],
                |r| r.get(0),
            )
            .map_err(|_| "Unknown agent")?;
        let agent: serde_json::Value = serde_json::from_str(&record).map_err(|e| e.to_string())?;
        if request.adapter != "mock" && agent["runtimeAdapter"] != request.adapter {
            return Err("Adapter does not match this agent's configured runtime".into());
        }
        let task = request
            .task_id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        if request.task_id.is_some() {
            self.validate_task_authorization(&tx, &task, request)?;
        }
        let run = Execution {
            id: Uuid::new_v4().to_string(),
            task_id: task.clone(),
            project_id: request.project_id.clone(),
            agent_id: request.agent_id.clone(),
            adapter: request.adapter.clone(),
            prompt: redact(&request.prompt),
            status: "running".into(),
            created_at: now(),
            finished_at: None,
            error: None,
            pid: None,
            session_id: None,
        };
        if request.task_id.is_some() {
            tx.execute("UPDATE tasks SET status='running' WHERE id=?1", [&task])
                .map_err(|e| e.to_string())?;
        } else {
            tx.execute(
                "INSERT INTO tasks(id,project_id,agent_id,status) VALUES(?1,?2,?3,'running')",
                params![task, run.project_id, run.agent_id],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.execute("INSERT INTO executions(id,project_id,agent_id,task_id,adapter,prompt,status,created_at) VALUES(?1,?2,?3,?4,?5,?6,'running',?7)", params![run.id,run.project_id,run.agent_id,task,run.adapter,run.prompt,run.created_at]).map_err(|_| "This workspace or agent already has an active execution")?;
        tx.execute(
            "INSERT INTO approvals VALUES(?1,?2,?3,?4,'read-only',?5)",
            params![
                Uuid::new_v4().to_string(),
                run.id,
                format!(
                    "{:x}",
                    Sha256::digest(crate::execution_prompt(&agent, &request.prompt).as_bytes())
                ),
                executable,
                now()
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO audit_logs VALUES(?1,'execution_approved',?2,?3)",
            params![Uuid::new_v4().to_string(), run.id, now()],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(run)
    }

    pub fn finish(&self, id: &str, status: &str, error: Option<&str>) -> Result<()> {
        let mut db = self.connect()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE tasks SET status=?1 WHERE details IS NULL AND id=(SELECT task_id FROM executions WHERE id=?2 AND status='running')", params![status,id]).map_err(|e| e.to_string())?;
        tx.execute("UPDATE executions SET status=?1,finished_at=?2,error=?3 WHERE id=?4 AND status='running'",params![status,now(),error.map(redact),id]).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn event(&self, id: &str, kind: &str, text: &str) -> Result<ExecutionEvent> {
        let db = self.connect()?;
        let text: String = redact(text).chars().take(32768).collect();
        let timestamp = now();
        db.execute(
            "INSERT INTO execution_events(execution_id,kind,text,created_at) VALUES(?1,?2,?3,?4)",
            params![id, kind, text, timestamp],
        )
        .map_err(|e| e.to_string())?;
        Ok(ExecutionEvent {
            id: db.last_insert_rowid(),
            execution_id: id.into(),
            kind: kind.into(),
            text,
            created_at: timestamp,
        })
    }

    pub fn events(&self, id: &str, after: i64) -> Result<Vec<ExecutionEvent>> {
        let db = self.connect()?;
        let mut stmt = db.prepare("SELECT id,execution_id,kind,text,created_at FROM execution_events WHERE execution_id=?1 AND id>?2 ORDER BY id LIMIT 500").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![id, after.max(0)], |r| {
                Ok(ExecutionEvent {
                    id: r.get(0)?,
                    execution_id: r.get(1)?,
                    kind: r.get(2)?,
                    text: r.get(3)?,
                    created_at: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<_, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn execution(&self, id: &str) -> Result<Execution> {
        self.connect()?.query_row("SELECT id,project_id,agent_id,adapter,prompt,status,created_at,finished_at,error,pid,session_id,task_id FROM executions WHERE id=?1", [id], execution_row).map_err(|_| "Unknown execution".into())
    }

    pub fn snapshot(&self) -> Result<Snapshot> {
        let db = self.connect()?;
        let mut stmt = db
            .prepare("SELECT record FROM agents ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let data = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut agents: Vec<serde_json::Value> = data
            .iter()
            .map(|s| serde_json::from_str(s))
            .collect::<std::result::Result<_, _>>()
            .map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT id FROM projects ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let projects = ids
            .iter()
            .map(|id| self.project(id))
            .collect::<Result<Vec<_>>>()?;
        let mut stmt=db.prepare("SELECT id,project_id,agent_id,adapter,prompt,status,created_at,finished_at,error,pid,session_id,task_id FROM executions ORDER BY created_at DESC LIMIT 100").map_err(|e|e.to_string())?;
        let executions = stmt
            .query_map([], execution_row)
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for agent in &mut agents {
            let history: Vec<_> = executions
                .iter()
                .filter(|e| Some(e.agent_id.as_str()) == agent["id"].as_str())
                .collect();
            agent["runHistory"] =
                serde_json::json!(history.iter().map(|run| &run.id).collect::<Vec<_>>());
            if let Some(latest) = history.first() {
                agent["sessionId"] = serde_json::json!(latest.session_id);
                let raw:Option<String>=db.query_row("SELECT text FROM execution_events WHERE execution_id=?1 AND kind='stdout' AND (CASE WHEN json_valid(text) THEN json_extract(text,'$.type') END)='turn.completed' ORDER BY id DESC LIMIT 1",[&latest.id],|row|row.get(0)).optional().map_err(|e|e.to_string())?;
                agent["usage"] = raw
                    .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
                    .and_then(|value| value.get("usage").cloned())
                    .unwrap_or(serde_json::Value::Null);
            }
            if let Some(run) = executions.iter().find(|e| {
                Some(e.agent_id.as_str()) == agent["id"].as_str() && e.status == "running"
            }) {
                agent["status"] = "working".into();
                agent["assignedTaskId"] = run.task_id.clone().into();
            }
        }
        Ok(Snapshot {
            tasks: self.tasks()?,
            workflows: self.workflows()?,
            scheduler_paused: self.scheduler_paused()?,
            agents,
            projects,
            executions,
            data_path: self.path.to_string_lossy().into(),
            remote_status: "not_configured".into(),
        })
    }

    pub fn audit(&self, action: &str, subject: &str) -> Result<()> {
        self.connect()?
            .execute(
                "INSERT INTO audit_logs VALUES(?1,?2,?3,?4)",
                params![Uuid::new_v4().to_string(), action, subject, now()],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn execution_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Execution> {
    Ok(Execution {
        id: r.get(0)?,
        project_id: r.get(1)?,
        agent_id: r.get(2)?,
        adapter: r.get(3)?,
        prompt: r.get(4)?,
        status: r.get(5)?,
        created_at: r.get(6)?,
        finished_at: r.get(7)?,
        error: r.get(8)?,
        pid: r.get(9)?,
        session_id: r.get(10)?,
        task_id: r.get(11)?,
    })
}
