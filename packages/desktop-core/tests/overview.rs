use chrono::{Duration, Utc};
use crewnest_core::overview::*;
use crewnest_core::store::Store;

fn setup() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join("workspace")).unwrap();
    let store = Store::open(dir.path().join("data/crewnest.db")).unwrap();
    (dir, store)
}

#[test]
fn match_project_by_folder_prefix_case_insensitive() {
    let (dir, store) = setup();
    std::fs::create_dir(dir.path().join("web")).unwrap();
    let a = store.register_project("A", "", &dir.path().join("workspace")).unwrap();
    let b = store.register_project("B", "", &dir.path().join("web")).unwrap();
    let projects = vec![a.clone(), b.clone()];
    let root = a.folders[0].path.to_uppercase();
    assert_eq!(match_project(&format!(r"{root}\SRC"), &projects), Some(a.id));
    assert_eq!(match_project(&b.folders[0].path, &projects), Some(b.id));
    assert_eq!(match_project(&format!("{root}x"), &projects), None);
}

#[test]
fn unescape_pbtxt_decodes_octal_utf8() {
    // "ทด" as UTF-8 octal escapes
    assert_eq!(unescape_pbtxt(r#"\340\270\227\340\270\224 \"ok\""#), "ทด \"ok\"");
}

#[test]
fn scans_each_agent_history_and_skips_old() {
    let home = tempfile::tempdir().unwrap();
    let h = home.path();
    let since = Utc::now() - Duration::days(7);

    let claude = h.join(".claude/projects/D--work");
    std::fs::create_dir_all(&claude).unwrap();
    std::fs::write(
        claude.join("abc.jsonl"),
        "{\"type\":\"user\",\"cwd\":\"D:\\\\work\"}\n{\"type\":\"custom-title\",\"customTitle\":\"Fix login\"}\n",
    )
    .unwrap();
    let claude = scan_claude(h, since);
    assert_eq!(claude.len(), 1);
    assert_eq!(claude[0].title, "Fix login");
    assert_eq!(claude[0].cwd.as_deref(), Some(r"D:\work"));
    assert!(scan_claude(h, Utc::now() + Duration::days(1)).is_empty());

    std::fs::create_dir_all(h.join(".codex")).unwrap();
    let db = rusqlite::Connection::open(h.join(".codex/state_5.sqlite")).unwrap();
    db.execute_batch("CREATE TABLE threads(id TEXT, title TEXT, first_user_message TEXT, cwd TEXT, updated_at INTEGER, archived INTEGER);").unwrap();
    db.execute(
        "INSERT INTO threads VALUES('t1','', 'hello\nmore', ?1, ?2, 0), ('old','x','', 'C:/a', 1, 0)",
        rusqlite::params![r"\\?\D:\work", Utc::now().timestamp()],
    )
    .unwrap();
    drop(db);
    let codex = scan_codex(h, since);
    assert_eq!(codex.len(), 1);
    assert_eq!(codex[0].title, "hello");
    assert_eq!(codex[0].cwd.as_deref(), Some(r"D:\work"));

    let ag = h.join(".gemini/antigravity/annotations");
    std::fs::create_dir_all(&ag).unwrap();
    std::fs::write(
        ag.join("g1.pbtxt"),
        format!("title:\"Plan\" last_user_view_time:{{seconds:{} nanos:0}}", Utc::now().timestamp()),
    )
    .unwrap();
    std::fs::write(ag.join("g2.pbtxt"), "title:\"Old\" last_user_view_time:{seconds:100}").unwrap();
    let ag = scan_antigravity(h, since);
    assert_eq!(ag.len(), 1);
    assert_eq!(ag[0].title, "Plan");
    assert!(ag[0].cwd.is_none());
}

#[test]
fn overview_auto_matches_and_manual_link_overrides() {
    let (dir, store) = setup();
    let ws = dir.path().join("workspace");
    let a = store.register_project("A", "", &ws).unwrap();
    std::fs::create_dir(dir.path().join("other")).unwrap();
    let b = store.register_project("B", "", &dir.path().join("other")).unwrap();
    let home = tempfile::tempdir().unwrap();
    let claude = home.path().join(".claude/projects/x");
    std::fs::create_dir_all(&claude).unwrap();
    let cwd = serde_json::to_string(&format!(r"{}\src", a.folders[0].path)).unwrap();
    std::fs::write(claude.join("s1.jsonl"), format!("{{\"cwd\":{cwd}}}\n")).unwrap();

    let ov = store.overview(home.path(), 7).unwrap();
    assert_eq!(ov.sessions[0].project_id.as_deref(), Some(a.id.as_str()));
    assert_eq!(ov.sessions[0].link.as_deref(), Some("auto"));

    store.link_session("claude", "s1", Some(&b.id)).unwrap();
    let ov = store.overview(home.path(), 7).unwrap();
    assert_eq!(ov.sessions[0].project_id.as_deref(), Some(b.id.as_str()));
    assert_eq!(ov.sessions[0].link.as_deref(), Some("manual"));

    store.link_session("claude", "s1", None).unwrap();
    assert!(store.session_links().unwrap().is_empty());
    assert!(store.link_session("cursor", "s1", Some(&a.id)).is_err());
    assert!(store.link_session("claude", "s1", Some("missing")).is_err());
}

#[test]
fn git_log_reads_recent_commits() {
    let dir = tempfile::tempdir().unwrap();
    let git = |args: &[&str]| std::process::Command::new("git").arg("-C").arg(dir.path()).args(args).output();
    if git(&["init", "-q"]).is_err() {
        return; // git not installed
    }
    git(&["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "first"]).unwrap();
    let commits = git_log(dir.path(), "p1", Utc::now() - Duration::days(1));
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0].subject, "first");
    assert_eq!(commits[0].project_id, "p1");
    assert!(git_log(&dir.path().join("nope"), "p1", Utc::now()).is_empty());
}
