use crewnest_core::store::Store;

fn setup() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join("workspace")).unwrap();
    let store = Store::open(dir.path().join("data/crewnest.db")).unwrap();
    (dir, store)
}

#[test]
fn v4_projects_backfilled_as_primary() {
    let (dir, store) = setup();
    let project = store
        .register_project("P", "goal", &dir.path().join("workspace"))
        .unwrap();
    store
        .connect()
        .unwrap()
        .execute_batch(
            "DROP TABLE project_folders; DELETE FROM schema_migrations WHERE version=5; PRAGMA user_version=4;",
        )
        .unwrap();
    let reopened = Store::open(&store.path).unwrap();
    let loaded = reopened.project(&project.id).unwrap();
    assert_eq!(loaded.folders.len(), 1);
    assert!(loaded.folders[0].is_primary);
    assert_eq!(loaded.folders[0].path, loaded.path);
    assert!(loaded.folders[0].exists);
}

mod inspection {
    use crewnest_core::folders::{inspect, Inspected};
    use crewnest_core::models::ProjectFolder;
    use std::path::Path;

    fn folder(i: &Inspected) -> ProjectFolder {
        ProjectFolder {
            id: i.path.clone(),
            path: i.path.clone(),
            repo_root: i.repo_root.clone(),
            is_git: i.is_git,
            is_primary: false,
            position: 0,
            exists: true,
        }
    }
    fn dir(root: &Path, rel: &str) -> std::path::PathBuf {
        let p = root.join(rel);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn plain_dir_is_not_git() {
        let t = tempfile::tempdir().unwrap();
        let r = inspect(&dir(t.path(), "a"), &[]).unwrap();
        assert!(!r.is_git);
        assert_eq!(r.repo_root, None);
        assert_eq!(r.warning, None);
    }

    #[test]
    fn repo_root_detected() {
        let t = tempfile::tempdir().unwrap();
        let a = dir(t.path(), "a");
        dir(&a, ".git");
        let r = inspect(&a, &[]).unwrap();
        assert!(r.is_git);
        assert_eq!(r.repo_root.as_deref(), Some(r.path.as_str()));
        assert_eq!(r.warning, None);
    }

    #[test]
    fn worktree_git_file_detected() {
        let t = tempfile::tempdir().unwrap();
        let a = dir(t.path(), "a");
        std::fs::write(a.join(".git"), "gitdir: elsewhere").unwrap();
        assert!(inspect(&a, &[]).unwrap().is_git);
    }

    #[test]
    fn subfolder_warns() {
        let t = tempfile::tempdir().unwrap();
        let a = dir(t.path(), "a");
        dir(&a, ".git");
        let root = inspect(&a, &[]).unwrap().path;
        let r = inspect(&dir(&a, "sub"), &[]).unwrap();
        assert!(r.is_git);
        assert_eq!(r.repo_root.as_deref(), Some(root.as_str()));
        assert!(r.warning.unwrap().contains(&root));
    }

    #[test]
    fn same_repo_subfolder_rejected() {
        let t = tempfile::tempdir().unwrap();
        let a = dir(t.path(), "a");
        dir(&a, ".git");
        let existing = [folder(&inspect(&a, &[]).unwrap())];
        assert!(inspect(&dir(&a, "sub"), &existing).is_err());
    }

    #[test]
    fn same_repo_sibling_subfolders_rejected() {
        let t = tempfile::tempdir().unwrap();
        let a = dir(t.path(), "a");
        dir(&a, ".git");
        let existing = [folder(&inspect(&dir(&a, "x"), &[]).unwrap())];
        assert!(inspect(&dir(&a, "y"), &existing).is_err());
    }

    #[test]
    fn nested_folder_rejected() {
        let t = tempfile::tempdir().unwrap();
        let a = dir(t.path(), "a");
        let b = dir(&a, "b");
        let outer = [folder(&inspect(&a, &[]).unwrap())];
        assert!(inspect(&b, &outer).is_err());
        let inner = [folder(&inspect(&b, &[]).unwrap())];
        assert!(inspect(&a, &inner).is_err());
    }

    #[test]
    fn sibling_with_common_prefix_is_not_nested() {
        let t = tempfile::tempdir().unwrap();
        let existing = [folder(&inspect(&dir(t.path(), "app"), &[]).unwrap())];
        assert!(inspect(&dir(t.path(), "app2"), &existing).is_ok());
    }

    #[test]
    fn duplicate_rejected() {
        let t = tempfile::tempdir().unwrap();
        let a = dir(t.path(), "Alpha");
        let existing = [folder(&inspect(&a, &[]).unwrap())];
        assert!(inspect(&a, &existing).is_err());
        assert!(inspect(&t.path().join("ALPHA"), &existing).is_err());
    }
}

mod operations {
    use crewnest_core::store::Store;
    use std::path::{Path, PathBuf};

    fn setup() -> (tempfile::TempDir, Store) {
        let t = tempfile::tempdir().unwrap();
        let store = Store::open(t.path().join("data/crewnest.db")).unwrap();
        (t, store)
    }
    fn dir(root: &Path, rel: &str) -> PathBuf {
        let p = root.join(rel);
        std::fs::create_dir_all(&p).unwrap();
        p
    }
    fn primary_count(store: &Store, id: &str) -> usize {
        store.project(id).unwrap().folders.iter().filter(|f| f.is_primary).count()
    }

    #[test]
    fn register_multi_folder_sets_primary() {
        let (t, store) = setup();
        let (a, b) = (dir(t.path(), "a"), dir(t.path(), "b"));
        dir(&b, ".git");
        let p = store.register_project_folders("P", "", &[a, b], 1).unwrap();
        assert_eq!(p.folders.len(), 2);
        assert_eq!(primary_count(&store, &p.id), 1);
        assert!(p.folders[1].is_primary);
        assert_eq!(p.path, p.folders[1].path);
        assert!(p.is_git);
    }

    #[test]
    fn register_rejects_same_repo_within_request() {
        let (t, store) = setup();
        let a = dir(t.path(), "a");
        dir(&a, ".git");
        let err = store.register_project_folders("P", "", &[dir(&a, "x"), dir(&a, "y")], 0);
        assert!(err.is_err());
        assert!(store.snapshot().unwrap().projects.is_empty());
    }

    #[test]
    fn primary_switch_updates_project_path() {
        let (t, store) = setup();
        let (a, b) = (dir(t.path(), "a"), dir(t.path(), "b"));
        dir(&b, ".git");
        let p = store.register_project_folders("P", "", &[a, b], 0).unwrap();
        assert!(!p.is_git);
        let switched = store.set_primary_folder(&p.id, &p.folders[1].id).unwrap();
        assert_eq!(switched.path, p.folders[1].path);
        assert!(switched.is_git);
        assert!(switched.folders[1].is_primary && !switched.folders[0].is_primary);
        assert_eq!(store.project(&p.id).unwrap().path, p.folders[1].path);
    }

    #[test]
    fn add_folder_appends_non_primary() {
        let (t, store) = setup();
        let p = store.register_project_folders("P", "", &[dir(t.path(), "a")], 0).unwrap();
        let added = store.add_project_folder(&p.id, &dir(t.path(), "b")).unwrap();
        assert_eq!(added.folders.len(), 2);
        assert!(!added.folders[1].is_primary);
        assert_eq!(added.path, p.path);
    }

    #[test]
    fn add_folder_applies_repo_rule() {
        let (t, store) = setup();
        let a = dir(t.path(), "a");
        dir(&a, ".git");
        let p = store.register_project_folders("P", "", std::slice::from_ref(&a), 0).unwrap();
        assert!(store.add_project_folder(&p.id, &dir(&a, "sub")).is_err());
    }

    #[test]
    fn cannot_remove_primary_or_last() {
        let (t, store) = setup();
        let p = store
            .register_project_folders("P", "", &[dir(t.path(), "a"), dir(t.path(), "b")], 0)
            .unwrap();
        assert!(store.remove_project_folder(&p.id, &p.folders[0].id).is_err());
        let left = store.remove_project_folder(&p.id, &p.folders[1].id).unwrap();
        assert_eq!(left.folders.len(), 1);
        assert!(store.remove_project_folder(&p.id, &left.folders[0].id).is_err());
    }

    #[test]
    fn folder_used_by_other_project_rejected() {
        let (t, store) = setup();
        let a = dir(t.path(), "a");
        store.register_project_folders("P", "", std::slice::from_ref(&a), 0).unwrap();
        let q = store.register_project_folders("Q", "", &[dir(t.path(), "b")], 0).unwrap();
        assert!(store.add_project_folder(&q.id, &a).is_err());
        assert!(store.add_project_folder(&q.id, &dir(&a, "inner")).is_err());
        assert!(store.register_project_folders("R", "", &[a], 0).is_err());
    }

    #[test]
    fn primary_change_blocked_while_running() {
        let (t, store) = setup();
        let p = store
            .register_project_folders("P", "", &[dir(t.path(), "a"), dir(t.path(), "b")], 0)
            .unwrap();
        let db = store.connect().unwrap();
        db.execute("INSERT INTO tasks(id,project_id,agent_id,status) VALUES('t',?1,'astra','running')", [&p.id]).unwrap();
        db.execute("INSERT INTO executions(id,project_id,agent_id,task_id,adapter,prompt,status,created_at) VALUES('e',?1,'astra','t','mock','x','running','now')", [&p.id]).unwrap();
        assert!(store.set_primary_folder(&p.id, &p.folders[1].id).is_err());
        assert!(store.remove_project_folder(&p.id, &p.folders[1].id).is_ok());
    }

    #[test]
    fn missing_folder_still_loads() {
        let (t, store) = setup();
        let b = dir(t.path(), "b");
        let p = store
            .register_project_folders("P", "", &[dir(t.path(), "a"), b.clone()], 0)
            .unwrap();
        std::fs::remove_dir(&b).unwrap();
        let loaded = store.project(&p.id).unwrap();
        assert!(loaded.folders[0].exists);
        assert!(!loaded.folders[1].exists);
    }

    #[test]
    fn more_than_eight_rejected() {
        let (t, store) = setup();
        let many: Vec<_> = (0..9).map(|i| dir(t.path(), &format!("f{i}"))).collect();
        assert!(store.register_project_folders("P", "", &many, 0).is_err());
        let p = store.register_project_folders("P", "", &many[..8], 0).unwrap();
        assert!(store.add_project_folder(&p.id, &many[8]).is_err());
    }

    #[test]
    fn register_requires_folder_and_valid_primary() {
        let (t, store) = setup();
        assert!(store.register_project_folders("P", "", &[], 0).is_err());
        assert!(store.register_project_folders("P", "", &[dir(t.path(), "a")], 1).is_err());
    }
}

mod runtime_args {
    use crewnest_core::adapters::{extra_dir_args, folders_context};
    use crewnest_core::store::Store;

    fn project() -> (tempfile::TempDir, crewnest_core::models::Project) {
        let t = tempfile::tempdir().unwrap();
        let store = Store::open(t.path().join("data/crewnest.db")).unwrap();
        let dirs: Vec<_> = ["a", "b", "c"]
            .iter()
            .map(|n| {
                let p = t.path().join(n);
                std::fs::create_dir_all(&p).unwrap();
                p
            })
            .collect();
        let p = store.register_project_folders("P", "", &dirs, 0).unwrap();
        std::fs::remove_dir(&dirs[2]).unwrap();
        (t, store.project(&p.id).unwrap())
    }

    #[test]
    fn claude_gets_add_dir_for_secondary_only() {
        let (_t, p) = project();
        let args = extra_dir_args("claude", &p);
        // ส่งแบบไม่มี prefix verbatim `\\?\` เพื่อให้ CLI ภายนอกอ่าน path ได้
        let plain = |s: &str| s.trim_start_matches(r"\\?\").to_string();
        assert_eq!(args, vec!["--add-dir".to_string(), plain(&p.folders[1].path)]);
        assert!(!args.contains(&plain(&p.path)));
    }

    #[test]
    fn codex_and_antigravity_get_no_add_dir() {
        let (_t, p) = project();
        assert!(extra_dir_args("codex", &p).is_empty());
        assert!(extra_dir_args("antigravity", &p).is_empty());
        assert!(extra_dir_args("mock", &p).is_empty());
    }

    #[test]
    fn folders_context_lists_existing_secondary_folders() {
        let (_t, p) = project();
        let text = folders_context(&p).unwrap();
        assert!(text.contains(p.folders[1].path.trim_start_matches(r"\\?\")));
        assert!(!text.contains(p.folders[2].path.trim_start_matches(r"\\?\")));
        assert!(text.starts_with("Additional read-only folders:"));
    }

    #[test]
    fn single_folder_has_no_context() {
        let t = tempfile::tempdir().unwrap();
        let store = Store::open(t.path().join("data/crewnest.db")).unwrap();
        std::fs::create_dir(t.path().join("w")).unwrap();
        let p = store.register_project("P", "", &t.path().join("w")).unwrap();
        assert!(folders_context(&p).is_none());
        assert!(extra_dir_args("claude", &p).is_empty());
    }
}
