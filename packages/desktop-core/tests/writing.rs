use crewnest_core::{models::*, store::Store, writing::checked_path};
use std::path::Path;

fn setup() -> (tempfile::TempDir, Store, String, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("workspace");
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("example.mjs"), "export const value = 1;\n").unwrap();
    let store = Store::open(dir.path().join("db.sqlite")).unwrap();
    let project = store
        .register_project("Writer fixture", "", &root)
        .unwrap()
        .id;
    let task = store
        .create_task(TaskInput {
            project_id: project.clone(),
            agent_id: "forge".into(),
            adapter: "claude".into(),
            title: "Writing fixture".into(),
            prompt: "Return an exact manifest".into(),
            dependencies: vec![],
            priority: 50,
            timeout_seconds: 30,
            retry_limit: 2,
        })
        .unwrap()
        .id;
    (dir, store, project, task)
}
fn stage(store: &Store, project: &str, id: &str, files: serde_json::Value) -> String {
    store.approve_task(id).unwrap();
    let task = store.task(id).unwrap();
    let run = store
        .begin_run(
            &RunRequest {
                task_id: Some(id.into()),
                timeout_seconds: task.timeout_seconds,
                project_id: project.into(),
                agent_id: "forge".into(),
                adapter: "claude".into(),
                prompt: store.task_prompt(&task).unwrap(),
                approved: true,
            },
            "fixture-claude",
        )
        .unwrap();
    store.reconcile_queue().unwrap();
    store.stage_patch(id, &run.id, &files.to_string()).unwrap();
    store.finish(&run.id, "completed", None).unwrap();
    store.reconcile_queue().unwrap();
    run.id
}
#[test]
fn writer_stages_then_requires_exact_approval_and_blocks_dependents_until_apply() {
    let (dir, store, project, id) = setup();
    store
        .configure_writing(&id, vec!["example.mjs".into(), "new.mjs".into()])
        .unwrap();
    stage(
        &store,
        &project,
        &id,
        serde_json::json!({"files":[{"path":"example.mjs","content":"export const value = 2;\n"},{"path":"new.mjs","content":"export const added = true;\n"}]}),
    );
    assert_eq!(store.task(&id).unwrap().status, "needs_review");
    assert_eq!(
        std::fs::read_to_string(dir.path().join("workspace/example.mjs")).unwrap(),
        "export const value = 1;\n"
    );
    assert!(!dir.path().join("workspace/new.mjs").exists());
    assert!(store.review_task(&id, true, "bypass").is_err());
    assert!(store.apply_patch(&id, "wrong-digest").is_err());
    store
        .apply_patch(&id, &store.patch_digest(&id).unwrap())
        .unwrap();
    assert_eq!(store.task(&id).unwrap().status, "completed");
    assert!(dir.path().join("workspace/new.mjs").exists());
    assert!(store
        .apply_patch(&id, &store.patch_digest(&id).unwrap())
        .is_err());
    store
        .rollback_patch(&id, &store.patch_digest(&id).unwrap())
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.path().join("workspace/example.mjs")).unwrap(),
        "export const value = 1;\n"
    );
    assert!(!dir.path().join("workspace/new.mjs").exists());
}
#[test]
fn rejects_traversal_protected_paths_and_unapproved_files() {
    let (_dir, store, project, id) = setup();
    let root = store.project(&project).unwrap().path;
    for path in [
        "../outside.js",
        "/outside.js",
        "C:/outside.js",
        "a\\b.js",
        ".git/config",
        ".env",
        "AGENTS.md",
        "settings.json",
        "src/../a.js",
        "NUL.txt",
        "node_modules/a.js",
        "secret.txt",
    ] {
        assert!(checked_path(Path::new(&root), path).is_err(), "{path}");
    }
    store
        .configure_writing(&id, vec!["example.mjs".into()])
        .unwrap();
    store.approve_task(&id).unwrap();
    let task = store.task(&id).unwrap();
    let run = store
        .begin_run(
            &RunRequest {
                task_id: Some(id.clone()),
                timeout_seconds: 30,
                project_id: project,
                agent_id: "forge".into(),
                adapter: "claude".into(),
                prompt: store.task_prompt(&task).unwrap(),
                approved: true,
            },
            "fixture",
        )
        .unwrap();
    assert!(store
        .stage_patch(
            &id,
            &run.id,
            r#"{"files":[{"path":"other.mjs","content":"x"}]}"#
        )
        .is_err());
    assert!(store.stage_patch(&id,&run.id,r#"{"files":[{"path":"example.mjs","content":"x"},{"path":"example.mjs","content":"y"}]}"#).is_err());
}
#[test]
fn preserves_concurrent_local_edits_and_persistent_journal() {
    let (dir, store, project, id) = setup();
    store
        .configure_writing(&id, vec!["example.mjs".into()])
        .unwrap();
    stage(
        &store,
        &project,
        &id,
        serde_json::json!({"files":[{"path":"example.mjs","content":"changed\n"}]}),
    );
    let path = dir.path().join("workspace/example.mjs");
    std::fs::write(&path, "human local edit").unwrap();
    let reopened = Store::open(&store.path).unwrap();
    assert!(reopened
        .apply_patch(&id, &reopened.patch_digest(&id).unwrap())
        .is_err());
    assert_eq!(std::fs::read_to_string(path).unwrap(), "human local edit");
    assert_eq!(reopened.patch(&id).unwrap().unwrap().state, "staged");
}
#[cfg(windows)]
#[test]
fn rejects_junctions_without_requiring_symlink_privilege() {
    let (dir, store, project, _id) = setup();
    let outside = dir.path().join("outside");
    std::fs::create_dir(&outside).unwrap();
    let link = dir.path().join("workspace").join("linked");
    let output = std::process::Command::new("cmd.exe")
        .args(["/d", "/c", "mklink", "/J"])
        .arg(&link)
        .arg(&outside)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let root = store.project(&project).unwrap().path;
    assert!(checked_path(Path::new(&root), "linked/outside.mjs").is_err());
    std::fs::remove_dir(link).unwrap();
}
#[test]
fn interrupted_apply_blocks_execution_and_rollback_preserves_unrelated_edits() {
    let (dir, store, project, id) = setup();
    store
        .configure_writing(&id, vec!["example.mjs".into()])
        .unwrap();
    stage(
        &store,
        &project,
        &id,
        serde_json::json!({"files":[{"path":"example.mjs","content":"changed\n"}]}),
    );
    store.connect().unwrap().execute("UPDATE writing_patches SET record=json_set(record,'$.state','applying') WHERE task_id=?1",[&id]).unwrap();
    let req = RunRequest {
        task_id: None,
        timeout_seconds: 30,
        project_id: project,
        agent_id: "astra".into(),
        adapter: "mock".into(),
        prompt: "test".into(),
        approved: true,
    };
    assert!(store.begin_run(&req, "mock").is_err());
    std::fs::write(dir.path().join("workspace/example.mjs"), "human edit").unwrap();
    assert!(store
        .rollback_patch(&id, &store.patch_digest(&id).unwrap())
        .is_err());
    std::fs::write(dir.path().join("workspace/example.mjs"), "changed\n").unwrap();
    store
        .rollback_patch(&id, &store.patch_digest(&id).unwrap())
        .unwrap();
    assert!(store.begin_run(&req, "mock").is_ok());
}
