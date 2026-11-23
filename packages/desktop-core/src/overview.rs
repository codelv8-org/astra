//! Projects overview: read-only scan of local agent history (Claude Code, Codex, Antigravity),
//! git commits per project folder, and user-made session links.
use crate::{models::*, now, store::Store, Result};
use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::Serialize;
use std::io::BufRead;
use std::path::Path;

pub const AGENTS: [&str; 3] = ["claude", "codex", "antigravity"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub agent: String,
    pub id: String,
    pub title: String,
    pub cwd: Option<String>,
    pub updated_at: String,
    pub project_id: Option<String>,
    /// "auto" (path match) | "manual" (saved link) | None
    pub link: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub project_id: String,
    pub hash: String,
    pub author: String,
    pub at: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub since: String,
    pub sessions: Vec<AgentSession>,
    pub commits: Vec<Commit>,
    pub events: Vec<TaskEvent>,
}

fn session(agent: &str, id: String, title: String, cwd: Option<String>, at: DateTime<Utc>) -> AgentSession {
    AgentSession {
        agent: agent.into(),
        id,
        title,
        cwd,
        updated_at: at.to_rfc3339(),
        project_id: None,
        link: None,
    }
}

fn modified(path: &Path) -> Option<DateTime<Utc>> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok().map(Into::into)
}

/// ~/.claude/projects/<encoded>/<session>.jsonl — cwd and title are fields on jsonl lines.
pub fn scan_claude(home: &Path, since: DateTime<Utc>) -> Vec<AgentSession> {
    let mut out = Vec::new();
    let Ok(dirs) = std::fs::read_dir(home.join(".claude").join("projects")) else {
        return out;
    };
    for dir in dirs.flatten() {
        let Ok(files) = std::fs::read_dir(dir.path()) else { continue };
        for file in files.flatten() {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let Some(at) = modified(&path).filter(|at| *at >= since) else { continue };
            let Ok(handle) = std::fs::File::open(&path) else { continue };
            let (mut cwd, mut title) = (None::<String>, None::<String>);
            // shortcut: reads every line to find the latest title; fine for 7-day windows, index if slow.
            for line in std::io::BufReader::new(handle).lines().map_while(|l| l.ok()) {
                let wants_cwd = cwd.is_none() && line.contains("\"cwd\"");
                let wants_title = line.contains("-title\"");
                if !wants_cwd && !wants_title {
                    continue;
                }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
                if wants_cwd {
                    cwd = value["cwd"].as_str().map(String::from);
                }
                if let Some(t) = value["customTitle"].as_str().or(value["aiTitle"].as_str()) {
                    title = Some(t.into());
                }
            }
            let id = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
            let title = title.unwrap_or_else(|| {
                cwd.as_deref()
                    .and_then(|c| Path::new(c).file_name())
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| id.chars().take(8).collect())
            });
            out.push(session("claude", id, title, cwd, at));
        }
    }
    out
}

/// ~/.codex/state_N.sqlite `threads` table (opened read-only).
pub fn scan_codex(home: &Path, since: DateTime<Utc>) -> Vec<AgentSession> {
    let dir = home.join(".codex");
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    let db = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let n: u32 = name.strip_prefix("state_")?.strip_suffix(".sqlite")?.parse().ok()?;
            Some((n, e.path()))
        })
        .max_by_key(|(n, _)| *n);
    let Some((_, path)) = db else { return Vec::new() };
    let Ok(conn) = rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
    else {
        return Vec::new();
    };
    let query = "SELECT id, COALESCE(NULLIF(title,''), NULLIF(first_user_message,''), ''), cwd, updated_at \
                 FROM threads WHERE updated_at >= ?1 AND archived = 0 ORDER BY updated_at DESC LIMIT 500";
    let Ok(mut stmt) = conn.prepare(query) else { return Vec::new() };
    let rows = stmt.query_map([since.timestamp()], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, i64>(3)?))
    });
    let Ok(rows) = rows else { return Vec::new() };
    rows.flatten()
        .map(|(id, title, cwd, at)| {
            let cwd = cwd.map(|c| c.trim_start_matches(r"\\?\").to_string());
            let title: String = title.lines().next().unwrap_or("").chars().take(120).collect();
            let at = DateTime::from_timestamp(at, 0).unwrap_or_default();
            session("codex", id, title, cwd, at)
        })
        .collect()
}

/// ~/.gemini/antigravity/annotations/<id>.pbtxt — only title + last view time, no folder.
pub fn scan_antigravity(home: &Path, since: DateTime<Utc>) -> Vec<AgentSession> {
    let dir = home.join(".gemini").join("antigravity").join("annotations");
    let Ok(files) = std::fs::read_dir(dir) else { return Vec::new() };
    let title_re = regex::Regex::new(r#"title:"((?:[^"\\]|\\.)*)""#).expect("fixed pattern");
    let time_re = regex::Regex::new(r"last_user_view_time:\{seconds:(\d+)").expect("fixed pattern");
    let mut out = Vec::new();
    for file in files.flatten() {
        let path = file.path();
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let at = time_re
            .captures(&text)
            .and_then(|c| c[1].parse().ok())
            .and_then(|s| DateTime::from_timestamp(s, 0))
            .or_else(|| modified(&path));
        let Some(at) = at.filter(|at| *at >= since) else { continue };
        let title = title_re.captures(&text).map(|c| unescape_pbtxt(&c[1])).unwrap_or_default();
        let id = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        out.push(session("antigravity", id, title, None, at));
    }
    out
}

/// protobuf text-format string escapes (\ooo octal bytes for UTF-8, \" \\ \n).
pub fn unescape_pbtxt(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 1 < bytes.len() {
            let next = bytes[i + 1];
            if next.is_ascii_digit() {
                let end = (i + 1..(i + 4).min(bytes.len())).take_while(|&j| (b'0'..=b'7').contains(&bytes[j])).last().unwrap_or(i + 1);
                let digits = std::str::from_utf8(&bytes[i + 1..=end]).unwrap_or("0");
                out.push(u8::from_str_radix(digits, 8).unwrap_or(b'?'));
                i = end + 1;
                continue;
            }
            out.push(match next {
                b'n' => b'\n',
                b't' => b'\t',
                other => other,
            });
            i += 2;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn norm(path: &str) -> String {
    path.trim_start_matches(r"\\?\").replace('\\', "/").trim_end_matches('/').to_lowercase()
}

/// The project whose folder contains `cwd` (deepest folder wins).
pub fn match_project(cwd: &str, projects: &[Project]) -> Option<String> {
    let cwd = norm(cwd);
    projects
        .iter()
        .flat_map(|p| p.folders.iter().map(move |f| (p, norm(&f.path))))
        .filter(|(_, folder)| cwd == *folder || cwd.starts_with(&format!("{folder}/")))
        .max_by_key(|(_, folder)| folder.len())
        .map(|(p, _)| p.id.clone())
}

/// git log since `since` for one repo; empty when git is missing or the folder is not a repo.
pub fn git_log(repo: &Path, project_id: &str, since: DateTime<Utc>) -> Vec<Commit> {
    let mut command = std::process::Command::new("git");
    command
        .arg("-C")
        .arg(repo)
        .args(["log", "-n", "300", "--pretty=format:%H%x1f%an%x1f%aI%x1f%s"])
        .arg(format!("--since={}", since.to_rfc3339()));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let Ok(output) = command.output() else { return Vec::new() };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, '\x1f');
            Some(Commit {
                project_id: project_id.into(),
                hash: parts.next()?.into(),
                author: parts.next()?.into(),
                at: parts.next()?.into(),
                subject: parts.next()?.into(),
            })
        })
        .collect()
}

impl Store {
    pub fn session_links(&self) -> Result<Vec<(String, String, String)>> {
        let db = self.connect()?;
        let mut stmt = db
            .prepare("SELECT agent, session_id, project_id FROM session_links")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// `project_id: None` removes the saved link (auto path matching still applies).
    pub fn link_session(&self, agent: &str, session_id: &str, project_id: Option<&str>) -> Result<()> {
        if !AGENTS.contains(&agent) {
            return Err(format!("Unknown agent: {agent}"));
        }
        if session_id.trim().is_empty() || session_id.len() > 200 {
            return Err("Invalid session id".into());
        }
        let db = self.connect()?;
        match project_id {
            Some(project) => {
                self.project(project)?;
                db.execute(
                    "INSERT INTO session_links(agent,session_id,project_id,created_at) VALUES(?1,?2,?3,?4) \
                     ON CONFLICT(agent,session_id) DO UPDATE SET project_id=excluded.project_id",
                    params![agent, session_id, project, now()],
                )
            }
            None => db.execute(
                "DELETE FROM session_links WHERE agent=?1 AND session_id=?2",
                params![agent, session_id],
            ),
        }
        .map_err(|e| e.to_string())?;
        self.audit("session_link_changed", &format!("{agent}:{session_id}"))
    }

    pub fn task_events_since(&self, since: &str) -> Result<Vec<TaskEvent>> {
        let db = self.connect()?;
        let mut stmt = db
            .prepare("SELECT id,task_id,kind,text,created_at,initiator,initiator_ref FROM task_events WHERE created_at >= ?1 ORDER BY id DESC LIMIT 2000")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([since], |r| {
                Ok(TaskEvent {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    kind: r.get(2)?,
                    text: r.get(3)?,
                    created_at: r.get(4)?,
                    initiator: r.get(5)?,
                    initiator_ref: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// Everything the Projects overview needs for the last `days` days.
    pub fn overview(&self, home: &Path, days: u32) -> Result<Overview> {
        let since = Utc::now() - chrono::Duration::days(days.clamp(1, 365) as i64);
        let projects: Vec<Project> = self.snapshot()?.projects;
        let links = self.session_links()?;
        let mut sessions = scan_claude(home, since);
        sessions.extend(scan_codex(home, since));
        sessions.extend(scan_antigravity(home, since));
        for s in &mut sessions {
            if let Some((_, _, project)) = links.iter().find(|(a, id, _)| *a == s.agent && *id == s.id) {
                s.project_id = Some(project.clone());
                s.link = Some("manual".into());
            } else if let Some(project) = s.cwd.as_deref().and_then(|c| match_project(c, &projects)) {
                s.project_id = Some(project);
                s.link = Some("auto".into());
            }
        }
        sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        let mut commits = Vec::new();
        for project in &projects {
            let mut roots: Vec<&str> = project.folders.iter().filter_map(|f| f.repo_root.as_deref()).collect();
            roots.sort();
            roots.dedup();
            for root in roots {
                commits.extend(git_log(Path::new(root), &project.id, since));
            }
        }
        Ok(Overview {
            since: since.to_rfc3339(),
            sessions,
            commits,
            events: self.task_events_since(&since.to_rfc3339())?,
        })
    }
}
