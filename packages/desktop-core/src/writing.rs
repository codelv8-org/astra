use crate::{store::Store, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileChange {
    pub path: String,
    pub content: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Proposal {
    pub files: Vec<FileChange>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshot {
    pub path: String,
    pub before: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingPatch {
    pub state: String,
    pub before: Vec<FileSnapshot>,
    pub files: Vec<FileChange>,
}

fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
fn read(path: &Path) -> Result<Option<String>> {
    match std::fs::symlink_metadata(path) {
        Ok(m) => {
            if !m.is_file() || m.len() > 24000 || linked(&m) {
                return Err("Unsafe writing target".into());
            }
            std::fs::read_to_string(path)
                .map(Some)
                .map_err(|_| "Writing supports UTF-8 text only".into())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
fn linked(m: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        m.file_attributes() & 0x400 != 0 || m.is_symlink()
    }
    #[cfg(not(windows))]
    {
        m.is_symlink()
    }
}
pub fn checked_path(root: &Path, relative: &str) -> Result<PathBuf> {
    if relative.len() > 180
        || relative.is_empty()
        || relative.contains('\\')
        || relative.contains(':')
    {
        return Err("Use a short relative forward-slash path".into());
    }
    let mut path = root.to_path_buf();
    for part in relative.split('/') {
        let lower = part.to_lowercase();
        let stem = lower.split('.').next().unwrap_or("");
        if part.is_empty()
            || part.starts_with('.')
            || part.ends_with(['.', ' '])
            || !part
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
            || ["node_modules", "target", "dist", "con", "prn", "aux", "nul"].contains(&stem)
            || stem.starts_with("com") && stem[3..].parse::<u8>().is_ok()
            || stem.starts_with("lpt") && stem[3..].parse::<u8>().is_ok()
            || [
                "secret",
                "credential",
                "password",
                "token",
                "security",
                "agents",
                "claude",
                "manual",
            ]
            .iter()
            .any(|s| lower.contains(s))
        {
            return Err("Protected or invalid writing path".into());
        }
        path.push(part);
        if let Ok(m) = std::fs::symlink_metadata(&path) {
            if linked(&m) {
                return Err("Links and Windows reparse points are forbidden".into());
            }
        }
    }
    if ![
        "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "py", "css", "html", "md", "txt",
    ]
    .contains(&path.extension().and_then(|s| s.to_str()).unwrap_or(""))
    {
        return Err("File extension is not in the source-text allowlist".into());
    }
    let parent = path
        .parent()
        .ok_or("Missing parent")?
        .canonicalize()
        .map_err(|_| "Parent directory must already exist")?;
    if !parent.starts_with(root) {
        return Err("Writing path escapes workspace".into());
    }
    Ok(path)
}
fn write(path: &Path, content: &str) -> Result<()> {
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Missing parent")?)
        .map_err(|e| e.to_string())?;
    temp.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
impl Store {
    pub fn writing_policy(&self, id: &str) -> Result<Option<Vec<FileSnapshot>>> {
        let value: Option<String> = self
            .connect()?
            .query_row(
                "SELECT record FROM writing_policies WHERE task_id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        value
            .map(|v| serde_json::from_str(&v).map_err(|e| e.to_string()))
            .transpose()
    }
    pub fn configure_writing(&self, id: &str, paths: Vec<String>) -> Result<()> {
        let _guard = self.queue_lock.lock();
        let task = self.task(id)?;
        if task.agent_id != "forge"
            || task.adapter != "claude"
            || !["draft", "ready", "blocked"].contains(&task.status.as_str())
            || task.attempts != 0
            || task.approved
            || paths.is_empty()
            || paths.len() > 8
        {
            return Err(
                "Writing requires an unapproved, unstarted FORGE/Claude task and 1–8 paths".into(),
            );
        }
        let root = PathBuf::from(self.project(&task.project_id)?.path);
        let mut unique = HashSet::new();
        let mut snapshots = Vec::new();
        for path in paths {
            if !unique.insert(path.to_lowercase()) {
                return Err("Duplicate writing path".into());
            }
            let before = read(&checked_path(&root, &path)?)?;
            if before
                .as_ref()
                .is_some_and(|text| crate::redact(text) != *text)
            {
                return Err(
                    "Writing input contains a sensitive value; select a different source file"
                        .into(),
                );
            }
            snapshots.push(FileSnapshot { path, before });
        }
        if serde_json::to_string(&snapshots)
            .map_err(|e| e.to_string())?
            .len()
            > 3000
        {
            return Err("Writing input exceeds 3000 bytes; split into smaller tasks".into());
        }
        self.connect()?.execute("INSERT INTO writing_policies VALUES(?1,?2) ON CONFLICT(task_id) DO UPDATE SET record=excluded.record",params![id,serde_json::to_string(&snapshots).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        self.task_event(
            id,
            "writing_configured",
            "Human selected exact source paths; content requires a separate approval before apply",
        )
    }
    pub fn writing_context(&self, id: &str) -> Result<Option<String>> {
        Ok(self.writing_policy(id)?.map(|p|format!("\nCREWNEST STAGED WRITING: Do not call any tools. Return ONLY a JSON object {{\"files\":[{{\"path\":\"relative/path.js\",\"content\":\"complete UTF-8 file contents\"}}]}}. Use only the exact approved paths below. No deletions, shell, credentials, hooks, integrations or permission changes. At most 24000 bytes total content. A human must review the staged result before Rust Core writes it. Approved snapshots (null means new file): {}",serde_json::to_string(&p).unwrap_or_default())))
    }
    pub fn patch(&self, id: &str) -> Result<Option<WritingPatch>> {
        let v: Option<String> = self
            .connect()?
            .query_row(
                "SELECT record FROM writing_patches WHERE task_id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        v.map(|v| serde_json::from_str(&v).map_err(|e| e.to_string()))
            .transpose()
    }
    fn save_patch(&self, id: &str, run: &str, p: &WritingPatch) -> Result<()> {
        self.connect()?.execute("INSERT INTO writing_patches VALUES(?1,?2,?3) ON CONFLICT(task_id) DO UPDATE SET record=excluded.record,execution_id=excluded.execution_id",params![id,run,serde_json::to_string(p).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn stage_patch(&self, id: &str, run: &str, text: &str) -> Result<()> {
        let _guard = self.queue_lock.lock();
        let execution = self.execution(run)?;
        if execution.task_id != id || execution.status != "running" {
            return Err("Writing result is not owned by this active task".into());
        }
        let before = self.writing_policy(id)?.ok_or("No writing policy")?;
        let text = text.trim();
        let text = if text.starts_with("```json\n") && text.ends_with("```") {
            &text[8..text.len() - 3]
        } else {
            text
        };
        if text.len() > 32000 {
            return Err("Writing manifest exceeds limit".into());
        }
        let proposal: Proposal = serde_json::from_str(text)
            .map_err(|_| "FORGE must return the exact JSON files manifest")?;
        if proposal.files.is_empty() || proposal.files.len() > before.len() {
            return Err("Invalid proposed file count".into());
        }
        let mut unique = HashSet::new();
        let mut bytes = 0;
        let root = PathBuf::from(self.project(&execution.project_id)?.path);
        for file in &proposal.files {
            bytes += file.content.len();
            if !unique.insert(&file.path)
                || !before.iter().any(|s| s.path == file.path)
                || file.content.contains('\0')
                || crate::redact(&file.content) != file.content
                || bytes > 24000
            {
                return Err(
                    "Unapproved path, duplicate, sensitive value or oversized content in proposal"
                        .into(),
                );
            }
            let path = checked_path(&root, &file.path)?;
            if read(&path)?
                != before
                    .iter()
                    .find(|s| s.path == file.path)
                    .ok_or("Unapproved path")?
                    .before
            {
                return Err("Workspace changed since writing authorization".into());
            }
        }
        self.save_patch(
            id,
            run,
            &WritingPatch {
                state: "staged".into(),
                before,
                files: proposal.files,
            },
        )?;
        self.task_event(id,"patch_staged","FORGE output staged; files unchanged until human reviews exact content and approves apply")
    }
    pub fn patch_digest(&self, id: &str) -> Result<String> {
        Ok(hash(
            &serde_json::to_string(&self.patch(id)?.ok_or("No staged patch")?)
                .map_err(|e| e.to_string())?,
        ))
    }
    pub fn apply_patch(&self, id: &str, digest: &str) -> Result<()> {
        let _guard = self.queue_lock.lock();
        let task = self.task(id)?;
        let mut patch = self.patch(id)?.ok_or("No staged patch")?;
        if self.patch_digest(id)? != digest
            || task.status != "needs_review"
            || patch.state != "staged"
        {
            return Err("Patch changed, already applied or not awaiting approval".into());
        }
        let root = PathBuf::from(self.project(&task.project_id)?.path);
        let busy: bool = self
            .connect()?
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM executions WHERE project_id=?1 AND status='running')",
                [&task.project_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if busy {
            return Err("Workspace has an active execution".into());
        }
        let run = task
            .last_execution_id
            .as_deref()
            .ok_or("No patch execution")?;
        for file in &patch.files {
            if read(&checked_path(&root, &file.path)?)?
                != patch
                    .before
                    .iter()
                    .find(|s| s.path == file.path)
                    .ok_or("Unapproved path")?
                    .before
            {
                return Err("Workspace changed; do not overwrite local edits".into());
            }
        }
        patch.state = "applying".into();
        self.save_patch(id, run, &patch)?;
        for file in &patch.files {
            let result =
                checked_path(&root, &file.path).and_then(|path| write(&path, &file.content));
            if let Err(error) = result {
                self.task_event(id, "patch_recovery_required", &error)?;
                return Err(
                    "Apply interrupted; journal retained. Review and rollback before continuing"
                        .into(),
                );
            }
        }
        patch.state = "applied".into();
        self.save_patch(id, run, &patch)?;
        self.connect()?
            .execute("UPDATE tasks SET status='completed' WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        self.task_event(
            id,
            "patch_applied",
            &format!(
                "Human approved exact patch {digest}; original contents retained in local journal"
            ),
        )?;
        self.audit("patch_applied", &format!("{id}:{digest}"))?;
        self.reconcile_queue()
    }
    pub fn rollback_patch(&self, id: &str, digest: &str) -> Result<()> {
        let _guard = self.queue_lock.lock();
        let task = self.task(id)?;
        let mut patch = self.patch(id)?.ok_or("No patch journal")?;
        if self.patch_digest(id)? != digest
            || !["applied", "applying"].contains(&patch.state.as_str())
        {
            return Err("Patch not eligible for rollback".into());
        }
        let root = PathBuf::from(self.project(&task.project_id)?.path);
        let busy: bool = self
            .connect()?
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM executions WHERE project_id=?1 AND status='running')",
                [&task.project_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if busy
            || self.tasks()?.iter().any(|t| {
                t.dependencies.contains(&task.id)
                    && !["draft", "ready", "blocked"].contains(&t.status.as_str())
            })
        {
            return Err("Stop dependent work before rollback".into());
        }
        for file in &patch.files {
            let original = patch
                .before
                .iter()
                .find(|s| s.path == file.path)
                .ok_or("Missing snapshot")?;
            let current = read(&checked_path(&root, &file.path)?)?;
            if current != original.before && current.as_deref() != Some(&file.content) {
                return Err("Rollback would overwrite unrelated edits".into());
            }
        }
        for file in &patch.files {
            let path = checked_path(&root, &file.path)?;
            let original = patch
                .before
                .iter()
                .find(|s| s.path == file.path)
                .ok_or("Missing snapshot")?;
            if let Some(text) = &original.before {
                write(&path, text)?;
            } else if path.exists() {
                std::fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        patch.state = "rolled_back".into();
        self.save_patch(
            id,
            task.last_execution_id.as_deref().ok_or("Missing run")?,
            &patch,
        )?;
        self.connect()?
            .execute("UPDATE tasks SET status='failed' WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        self.task_event(
            id,
            "patch_rolled_back",
            "Human approved journal rollback; dependencies blocked",
        )?;
        self.audit("patch_rolled_back", &format!("{id}:{digest}"))?;
        self.reconcile_queue()
    }
}
