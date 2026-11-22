//! กฎการรับ source folder ของโปรเจกต์: 1 folder : 1 git repo
use crate::models::ProjectFolder;
use crate::Result;
use std::path::{Path, PathBuf};

pub const MAX_FOLDERS: usize = 8;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspected {
    pub path: String,
    pub repo_root: Option<String>,
    pub is_git: bool,
    pub warning: Option<String>,
}

/// canonicalize และตรวจกฎ workspace เดิม (ไม่ใช่ drive root, ไม่ใช่ network, ไม่ใช่ system dir)
pub fn validate_dir(selected: &Path) -> Result<PathBuf> {
    let canonical = selected
        .canonicalize()
        .map_err(|_| "Selected directory does not exist")?;
    if !canonical.is_dir() || canonical.parent().is_none() {
        return Err("Select a project directory, not a drive root".into());
    }
    let text = canonical.to_string_lossy();
    if (text.starts_with("\\\\") && !text.starts_with("\\\\?\\"))
        || text.starts_with("\\\\?\\UNC\\")
    {
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
    Ok(canonical)
}

/// เดินขึ้นจาก `dir` จนเจอ `.git` (โฟลเดอร์ หรือไฟล์ของ worktree)
pub fn repo_root(dir: &Path) -> Option<PathBuf> {
    dir.ancestors()
        .find(|p| p.join(".git").exists())
        .map(Path::to_path_buf)
}

fn key(path: &str) -> String {
    path.trim_end_matches('\\').to_lowercase()
}

fn contains(outer: &str, inner: &str) -> bool {
    inner == outer || inner.starts_with(&format!("{outer}\\"))
}

pub fn inspect(selected: &Path, existing: &[ProjectFolder]) -> Result<Inspected> {
    let canonical = validate_dir(selected)?;
    let path = canonical.to_string_lossy().to_string();
    let root = repo_root(&canonical).map(|p| p.to_string_lossy().to_string());
    let me = key(&path);
    for folder in existing {
        let other = key(&folder.path);
        if other == me {
            return Err(format!("เพิ่ม folder นี้ไว้แล้ว: {}", folder.path));
        }
        if contains(&other, &me) || contains(&me, &other) {
            return Err(format!("folder ซ้อนกับ folder ที่มีอยู่: {}", folder.path));
        }
        if let (Some(a), Some(b)) = (&root, &folder.repo_root) {
            if key(a) == key(b) {
                return Err(format!(
                    "folder นี้อยู่ใน repo เดียวกับ {} (1 folder ต่อ 1 repo)",
                    folder.path
                ));
            }
        }
    }
    let warning = root
        .as_ref()
        .filter(|r| key(r) != me)
        .map(|r| format!("folder นี้อยู่ใน repo {r}"));
    Ok(Inspected {
        is_git: root.is_some(),
        repo_root: root,
        path,
        warning,
    })
}
