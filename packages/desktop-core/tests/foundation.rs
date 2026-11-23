use crewnest_core::{models::RunRequest, redact, runtime::codex_arguments, store::Store, Core};
use std::{sync::Arc, time::Duration};

fn setup() -> (tempfile::TempDir, Store, String) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join("workspace")).unwrap();
    let store = Store::open(dir.path().join("data/crewnest.db")).unwrap();
    let project = store
        .register_project("Test project", "goal", &dir.path().join("workspace"))
        .unwrap();
    (dir, store, project.id)
}
fn request(project: &str) -> RunRequest {
    RunRequest {
        project_id: project.into(),
        agent_id: "astra".into(),
        adapter: "mock".into(),
        prompt: "Test only".into(),
        approved: true,
        task_id: None,
        timeout_seconds: 120,
    }
}

#[test]
fn migrations_seed_and_persistence_are_idempotent() {
    let (_dir, store, id) = setup();
    assert_eq!(store.snapshot().unwrap().agents.len(), 5);
    let db = store.connect().unwrap();
    db.execute("UPDATE agents SET record=json_set(record,'$.instructions','Custom instructions') WHERE id='astra'",[]).unwrap();
    let reopened = Store::open(&store.path).unwrap();
    assert_eq!(reopened.project(&id).unwrap().name, "Test project");
    assert_eq!(
        reopened.snapshot().unwrap().agents[0]["instructions"],
        "Custom instructions"
    );
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| r
            .get::<_, i32>(0))
            .unwrap(),
        7
    );
}

#[test]
fn rejects_invalid_paths_duplicate_workspace_and_invalid_names() {
    let (dir, store, _) = setup();
    assert!(store
        .register_project("Duplicate", "", &dir.path().join("workspace"))
        .is_err());
    assert!(store
        .register_project("Missing", "", &dir.path().join("missing"))
        .is_err());
    assert!(store.register_project(" ", "", dir.path()).is_err());
    assert!(store
        .register_project(&"x".repeat(101), "", dir.path())
        .is_err());
    let file = dir.path().join("file.txt");
    std::fs::write(&file, "x").unwrap();
    assert!(store.register_project("File", "", &file).is_err());
}

#[test]
fn approval_agent_runtime_and_workspace_locks_are_enforced() {
    let (dir, store, id) = setup();
    let mut input = request(&id);
    input.approved = false;
    assert!(store.begin_run(&input, "mock").is_err());
    input.approved = true;
    input.agent_id = "unknown".into();
    assert!(store.begin_run(&input, "mock").is_err());
    input.agent_id = "forge".into();
    input.adapter = "codex".into();
    assert!(store.begin_run(&input, "codex").is_err());
    input = request(&id);
    let run = store.begin_run(&input, "mock").unwrap();
    assert_eq!(
        store.snapshot().unwrap().agents[0]["assignedTaskId"],
        run.task_id
    );
    assert!(store.begin_run(&input, "mock").is_err());
    std::fs::create_dir(dir.path().join("second")).unwrap();
    let second = store
        .register_project("Second", "", &dir.path().join("second"))
        .unwrap();
    input.project_id = second.id;
    assert!(store.begin_run(&input, "mock").is_err());
    store.finish(&run.id, "completed", None).unwrap();
    assert!(store.begin_run(&input, "mock").is_ok());
}

#[test]
fn newer_schema_is_not_downgraded() {
    let (_dir, store, _) = setup();
    store
        .connect()
        .unwrap()
        .pragma_update(None, "user_version", 8)
        .unwrap();
    assert!(Store::open(&store.path).is_err());
}

#[test]
fn interrupted_runs_recover_and_second_instance_is_rejected() {
    let (_dir, store, id) = setup();
    let run = store.begin_run(&request(&id), "mock").unwrap();
    let core = Core::new(store.clone(), Arc::new(|_| {})).unwrap();
    assert_eq!(store.execution(&run.id).unwrap().status, "failed");
    assert!(Core::new(store.clone(), Arc::new(|_| {})).is_err());
    drop(core);
    assert!(Core::new(store.clone(), Arc::new(|_| {})).is_ok());
}

#[test]
fn logs_and_stored_prompts_are_redacted() {
    let (_dir, store, id) = setup();
    let mut input = request(&id);
    input.prompt = "api_key=private-value sk-1234567890secret Bearer token-content".into();
    let run = store.begin_run(&input, "mock").unwrap();
    store.event(&run.id, "output", &input.prompt).unwrap();
    let text = store.events(&run.id, 0).unwrap()[0].text.clone();
    assert!(!text.contains("private-value"));
    assert!(!text.contains("1234567890secret"));
    assert!(!text.contains("token-content"));
    assert_eq!(redact(&input.prompt), run.prompt);
    assert_eq!(store.events(&run.id, 1).unwrap().len(), 0);
}

#[test]
fn recorded_result_is_project_scoped_and_independent_of_recent_executions() {
    let (_dir, store, project_id) = setup();
    let run = store.begin_run(&request(&project_id), "mock").unwrap();
    store.event(&run.id, "output", "log only").unwrap();
    assert!(store
        .execution_result(&run.id, &project_id)
        .unwrap()
        .event
        .is_none());
    store.event(&run.id, "result", "old result").unwrap();
    let fallback = store.event(&run.id, "result", "latest result").unwrap();
    assert_eq!(
        store
            .execution_result(&run.id, &project_id)
            .unwrap()
            .event
            .unwrap()
            .id,
        fallback.id
    );
    store.event(&run.id, "artifact", "old artifact").unwrap();
    let text = format!("api_key=private-value {}", "ภาษาไทย".repeat(5000));
    let artifact = store.event(&run.id, "artifact", &text).unwrap();
    store.event(&run.id, "result", "later result").unwrap();
    store.finish(&run.id, "completed", None).unwrap();
    for _ in 0..100 {
        let newer = store.begin_run(&request(&project_id), "mock").unwrap();
        store.finish(&newer.id, "completed", None).unwrap();
    }
    assert!(!store
        .snapshot()
        .unwrap()
        .executions
        .iter()
        .any(|item| item.id == run.id));
    assert!(store.execution_result(&run.id, "other-project").is_err());
    assert!(store.execution_result("missing", &project_id).is_err());
    let result = store.execution_result(&run.id, &project_id).unwrap();
    assert_eq!(result.agent_id, "astra");
    assert_eq!(result.adapter, "mock");
    let saved = result.event.unwrap();
    assert_eq!(saved.id, artifact.id);
    assert_eq!(saved.text, artifact.text);
    assert_eq!(saved.text.chars().count(), 32768);
    assert!(!saved.text.contains("private-value"));
}

#[test]
fn codex_command_is_read_only_without_shell_or_bypass_flags() {
    let args = codex_arguments();
    assert!(args.windows(2).any(|a| a == ["--sandbox", "read-only"]));
    assert!(!args
        .iter()
        .any(|a| a.contains("dangerously") || a.contains("full-access")));
    assert!(args.contains(&"--ignore-user-config"));
    assert_eq!(args.last(), Some(&"-"));
}

#[test]
fn approval_hash_binds_agent_instructions_and_owner_prompt() {
    use sha2::{Digest, Sha256};
    let (_dir, store, id) = setup();
    let input = request(&id);
    let run = store.begin_run(&input, "mock").unwrap();
    let expected = format!(
        "{:x}",
        Sha256::digest(
            crewnest_core::execution_prompt(&store.agent("astra").unwrap(), &input.prompt)
                .as_bytes()
        )
    );
    let hash: String = store
        .connect()
        .unwrap()
        .query_row(
            "SELECT prompt_hash FROM approvals WHERE execution_id=?1",
            [run.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(hash, expected);
}

#[test]
fn snapshot_exposes_reported_usage_session_and_history() {
    let (_dir, store, id) = setup();
    let run = store.begin_run(&request(&id), "mock").unwrap();
    store
        .connect()
        .unwrap()
        .execute(
            "UPDATE executions SET session_id='reported-session' WHERE id=?1",
            [&run.id],
        )
        .unwrap();
    store
        .event(
            &run.id,
            "stdout",
            r#"{"type":"turn.completed","usage":{"input_tokens":123,"output_tokens":7}}"#,
        )
        .unwrap();
    store.finish(&run.id, "completed", None).unwrap();
    let agent = store.snapshot().unwrap().agents.remove(0);
    assert_eq!(agent["usage"]["input_tokens"], 123);
    assert_eq!(agent["sessionId"], "reported-session");
    assert_eq!(agent["runHistory"][0], run.id);
}

async fn terminal(store: &Store, id: &str) -> String {
    tokio::time::timeout(Duration::from_secs(20), async {
        loop {
            let run = store.execution(id).unwrap();
            if run.status != "running" {
                return run.status;
            }
            tokio::time::sleep(Duration::from_millis(30)).await;
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn mock_runs_emit_persisted_events_and_survive_reopen() {
    let (_dir, store, id) = setup();
    let core = Core::new(store.clone(), Arc::new(|_| {})).unwrap();
    let run = core.start(request(&id)).await.unwrap();
    assert_eq!(terminal(&store, &run.id).await, "completed");
    let events = store.events(&run.id, 0).unwrap();
    assert!(events.iter().any(|e| e.kind == "mock"));
    assert_eq!(
        Store::open(&store.path)
            .unwrap()
            .execution(&run.id)
            .unwrap()
            .status,
        "completed"
    );
}

#[tokio::test]
async fn mock_cancellation_releases_lock() {
    let (_dir, store, id) = setup();
    let core = Core::new(store.clone(), Arc::new(|_| {})).unwrap();
    let run = core.start(request(&id)).await.unwrap();
    core.cancel(&run.id).unwrap();
    assert_eq!(terminal(&store, &run.id).await, "canceled");
    assert!(core.cancel("unknown").is_err());
    assert!(core.start(request(&id)).await.is_ok());
}

#[tokio::test]
async fn log_storage_failure_never_reports_success() {
    let (_dir, store, id) = setup();
    let core = Core::new(store.clone(), Arc::new(|_| {})).unwrap();
    store
        .connect()
        .unwrap()
        .execute(
            "ALTER TABLE execution_events RENAME TO unavailable_events",
            [],
        )
        .unwrap();
    let run = core.start(request(&id)).await.unwrap();
    assert_eq!(terminal(&store, &run.id).await, "failed");
    assert!(store
        .execution(&run.id)
        .unwrap()
        .error
        .unwrap()
        .contains("Cannot persist"));
}

#[test]
fn antigravity_login_is_confirmed_only_by_latest_finished_run() {
    let (_dir, store, id) = setup();
    store
        .connect()
        .unwrap()
        .execute("UPDATE agents SET record=json_set(record,'$.runtimeAdapter','antigravity') WHERE id='astra'", [])
        .unwrap();
    let input = RunRequest {
        adapter: "antigravity".into(),
        ..request(&id)
    };
    assert_eq!(store.runtime_confirmed_at("antigravity").unwrap(), None);

    let run = store.begin_run(&input, "agy").unwrap();
    assert_eq!(store.runtime_confirmed_at("antigravity").unwrap(), None);
    store.finish(&run.id, "completed", None).unwrap();
    let confirmed = store.runtime_confirmed_at("antigravity").unwrap();
    assert!(confirmed.is_some());
    assert_eq!(store.runtime_confirmed_at("claude").unwrap(), None);

    // ยกเลิกเองไม่บอกอะไรเรื่อง login จึงไม่ลบผลยืนยันเดิม
    let run = store.begin_run(&input, "agy").unwrap();
    store
        .finish(&run.id, "canceled", Some("Canceled by owner"))
        .unwrap();
    assert_eq!(
        store.runtime_confirmed_at("antigravity").unwrap(),
        confirmed
    );

    // รันล้มเหลวล่าสุดอาจเป็นเพราะหลุด login จึงกลับไปเป็นไม่ทราบ
    let run = store.begin_run(&input, "agy").unwrap();
    store
        .finish(&run.id, "failed", Some("auth required"))
        .unwrap();
    assert_eq!(store.runtime_confirmed_at("antigravity").unwrap(), None);
}
