use crewnest_core::{adapters, models::*, store::Store, Core};
use std::{sync::Arc, time::Duration};

fn setup() -> (tempfile::TempDir, Core, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("workspace");
    std::fs::create_dir(&root).unwrap();
    let store = Store::open(dir.path().join("db.sqlite")).unwrap();
    let id = store.register_project("Queue test", "", &root).unwrap().id;
    let core = Core::new(store, Arc::new(|_| {})).unwrap();
    (dir, core, id)
}
fn input(project: &str) -> TaskInput {
    TaskInput {
        project_id: project.into(),
        agent_id: "astra".into(),
        adapter: "mock".into(),
        title: "Test task".into(),
        prompt: "Synthetic test".into(),
        dependencies: vec![],
        priority: 50,
        timeout_seconds: 5,
        retry_limit: 2,
    }
}
fn request(store: &Store, id: &str) -> RunRequest {
    let task = store.task(id).unwrap();
    RunRequest {
        task_id: Some(id.into()),
        project_id: task.project_id.clone(),
        agent_id: task.agent_id.clone(),
        adapter: task.adapter.clone(),
        prompt: store.task_prompt(&task).unwrap(),
        approved: true,
        timeout_seconds: task.timeout_seconds,
    }
}

#[test]
fn migration_from_schema1_preserves_runs_and_agent_customization() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("old.db");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    db.pragma_update(None, "user_version", 1).unwrap();
    db.execute(
        "INSERT INTO agents VALUES('custom','{\"id\":\"custom\",\"instructions\":\"keep\"}')",
        [],
    )
    .unwrap();
    drop(db);
    let store = Store::open(path).unwrap();
    assert_eq!(store.agent("custom").unwrap()["instructions"], "keep");
    assert_eq!(
        store
            .connect()
            .unwrap()
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        crewnest_core::store::SCHEMA_VERSION
    );
    assert!(store.scheduler_paused().unwrap());
}

#[test]
fn dependencies_gate_approval_and_cross_project_links() {
    let (_dir, core, project) = setup();
    let first = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    let mut second = input(&project);
    second.dependencies = vec![first.id.clone()];
    let second = core.store.create_task(second, &Initiator::Owner).unwrap();
    assert!(core.store.approve_task(&second.id).is_err());
    assert!(core
        .store
        .create_task(TaskInput {
            dependencies: vec!["unknown".into()],
            ..input(&project)
        }, &Initiator::Owner)
        .is_err());
    assert!(core
        .store
        .create_task(TaskInput {
            retry_limit: 3,
            ..input(&project)
        }, &Initiator::Owner)
        .is_err());
    core.store.approve_task(&first.id).unwrap();
    let run = core
        .store
        .begin_run(&request(&core.store, &first.id), "mock")
        .unwrap();
    core.store.finish(&run.id, "completed", None).unwrap();
    core.store.reconcile_queue().unwrap();
    core.store.approve_task(&second.id).unwrap();
    assert_eq!(core.store.task(&second.id).unwrap().status, "queued");
}

#[test]
fn authorization_binds_payload_handoff_and_instructions() {
    let (_dir, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    assert!(core
        .store
        .begin_run(&request(&core.store, &task.id), "mock")
        .is_err());
    core.store.approve_task(&task.id).unwrap();
    let mut wrong = request(&core.store, &task.id);
    wrong.prompt = "tampered".into();
    assert!(core.store.begin_run(&wrong, "mock").is_err());
    core.store
        .connect()
        .unwrap()
        .execute(
            "UPDATE agents SET record=json_set(record,'$.instructions','changed') WHERE id='astra'",
            [],
        )
        .unwrap();
    assert!(core
        .store
        .begin_run(&request(&core.store, &task.id), "mock")
        .is_err());
}

#[test]
fn retries_are_bounded_require_approval_and_do_not_replay_old_result() {
    let (_dir, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    for attempt in 0..3 {
        if attempt > 0 {
            core.store.retry_task(&task.id).unwrap();
        }
        core.store.approve_task(&task.id).unwrap();
        core.store.reconcile_queue().unwrap();
        assert_eq!(core.store.task(&task.id).unwrap().status, "queued");
        let run = core
            .store
            .begin_run(&request(&core.store, &task.id), "mock")
            .unwrap();
        core.store
            .finish(&run.id, "failed", Some("fixture failure"))
            .unwrap();
        core.store.reconcile_queue().unwrap();
    }
    assert_eq!(core.store.task(&task.id).unwrap().attempts, 3);
    assert!(core.store.retry_task(&task.id).is_err());
}

#[test]
fn cancellation_of_pending_tasks_never_dispatches() {
    let (_dir, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    core.store.approve_task(&task.id).unwrap();
    core.store.cancel_pending_task(&task.id, &Initiator::Owner).unwrap();
    assert!(core
        .store
        .begin_run(&request(&core.store, &task.id), "mock")
        .is_err());
    assert!(core
        .store
        .task_events(&task.id)
        .unwrap()
        .iter()
        .any(|e| e.kind == "canceled"));
}

#[test]
fn workflow_rework_is_bounded_and_human_uat_remains_guarded() {
    let (_dir, core, project) = setup();
    let flow = core
        .store
        .create_workflow(&project, "Synthetic workflow", true)
        .unwrap();
    let mut reviewed = 0;
    loop {
        core.store.reconcile_queue().unwrap();
        let tasks = core.store.tasks().unwrap();
        let next = tasks.iter().find(|t| t.status == "ready").cloned();
        if let Some(task) = next {
            if task.step == "uat" {
                panic!("UAT must remain blocked until successful review");
            }
            core.store.approve_task(&task.id).unwrap();
            if !task.gate {
                let run = core
                    .store
                    .begin_run(&request(&core.store, &task.id), "fixture")
                    .unwrap();
                core.store.reconcile_queue().unwrap();
                assert_eq!(core.store.task(&task.id).unwrap().status, "running");
                core.store
                    .event(&run.id, "artifact", "MOCK fixture output")
                    .unwrap();
                core.store.finish(&run.id, "completed", None).unwrap();
            }
            continue;
        }
        if let Some(task) = tasks.iter().find(|t| t.status == "needs_review") {
            reviewed += 1;
            core.store
                .review_task(&task.id, false, "Synthetic failure; rework needed")
                .unwrap();
            if reviewed == 3 {
                break;
            }
            continue;
        }
        panic!("Workflow made no progress");
    }
    let flow = core
        .store
        .workflows()
        .unwrap()
        .into_iter()
        .find(|f| f.id == flow.id)
        .unwrap();
    assert_eq!(flow.rework_count, 2);
    assert_eq!(flow.status, "escalated");
    let uat = core
        .store
        .tasks()
        .unwrap()
        .into_iter()
        .find(|t| t.step == "uat")
        .unwrap();
    assert!(core.store.approve_task(&uat.id).is_err());
}

#[tokio::test]
async fn queue_pause_dispatch_locks_and_cancel_real_mock_execution() {
    let (_dir, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    core.store.approve_task(&task.id).unwrap();
    assert!(core.scheduler_tick().await.unwrap().is_none());
    core.store.set_scheduler_paused(false).unwrap();
    let run = core.scheduler_tick().await.unwrap().unwrap();
    assert!(core.scheduler_tick().await.unwrap().is_none());
    core.store.set_scheduler_paused(true).unwrap();
    assert_eq!(core.store.execution(&run).unwrap().status, "running");
    core.cancel(&run).unwrap();
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if core.store.execution(&run).unwrap().status == "canceled" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    core.store.reconcile_queue().unwrap();
    assert_eq!(core.store.task(&task.id).unwrap().status, "canceled");
    assert!(!core.store.task(&task.id).unwrap().approved);
    assert_eq!(
        core.store
            .task_events(&task.id)
            .unwrap()
            .iter()
            .filter(|e| e.kind == "execution_finished")
            .count(),
        1
    );
}

#[test]
fn parsers_require_real_terminal_success_and_preserve_usage() {
    let denied = adapters::parse(
        "antigravity",
        &serde_json::json!({"event":"result","result":{"status":"SUCCESS","response":"","denied_actions":[{"action":"command"}]}}),
    );
    assert!(!denied.completed);
    assert!(denied.error.is_some());
    let claude = adapters::parse(
        "claude",
        &serde_json::json!({"type":"result","subtype":"success","is_error":false,"session_id":"one","result":"hello","usage":{"input_tokens":2}}),
    );
    assert!(claude.completed);
    assert_eq!(claude.text.as_deref(), Some("hello"));
    let structured = adapters::parse(
        "claude",
        &serde_json::json!({"type":"result","subtype":"success","is_error":false,"result":"Prose must not override the manifest","structured_output":{"files":[{"path":"a.mjs","content":"export {};"}]}}),
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(structured.text.as_deref().unwrap()).unwrap()
            ["files"][0]["path"],
        "a.mjs"
    );
    assert!(!adapters::parse("claude", &serde_json::json!({"type":"assistant"})).completed);
    assert!(adapters::parse(
        "claude",
        &serde_json::json!({"type":"result","subtype":"error","is_error":true})
    )
    .error
    .is_some());
    let agy = adapters::parse(
        "antigravity",
        &serde_json::json!({"event":"result","result":{"status":"SUCCESS","response":"ok","conversation_id":"two"}}),
    );
    assert!(agy.completed);
    assert_eq!(agy.session.as_deref(), Some("two"));
    assert!(adapters::parse("antigravity",&serde_json::json!({"event":"result","result":{"status":"ERROR","error":"authentication failed"}})).error.is_some());
    for id in ["codex", "claude", "antigravity"] {
        let args = adapters::arguments(id);
        assert!(!args.iter().any(|a| a.contains("dangerously")
            || a.contains("bypassPermissions")
            || a.contains("accept-edits")));
    }
}

#[test]
fn verification_followup_preserves_history_and_requires_new_review_and_uat() {
    let (_dir, core, project) = setup();
    let flow = core
        .store
        .create_workflow(&project, "Verification fixture", true)
        .unwrap();
    assert!(core
        .store
        .append_verification(&flow.id, "evidence")
        .is_err());
    for _ in 0..20 {
        core.store.reconcile_queue().unwrap();
        if core
            .store
            .workflows()
            .unwrap()
            .iter()
            .any(|f| f.id == flow.id && f.status == "completed")
        {
            break;
        }
        let tasks = core.store.tasks().unwrap();
        if let Some(task) = tasks.iter().find(|t| t.status == "needs_review") {
            core.store
                .review_task(&task.id, true, "Fixture review accepted")
                .unwrap();
            continue;
        }
        let task = tasks.iter().find(|t| t.status == "ready").unwrap();
        core.store.approve_task(&task.id).unwrap();
        if !task.gate {
            let run = core
                .store
                .begin_run(&request(&core.store, &task.id), "MOCK FIXTURE ONLY")
                .unwrap();
            core.store.finish(&run.id, "completed", None).unwrap();
        }
    }
    let original = core.store.tasks().unwrap();
    assert_eq!(original.len(), 8);
    assert!(original.iter().all(|t| t.status == "completed"));
    core.store
        .append_verification(&flow.id, "Core verified source and tests; fixture only")
        .unwrap();
    assert!(core
        .store
        .append_verification(&flow.id, "Cannot append while active")
        .is_err());
    core.store.reconcile_queue().unwrap();
    let tasks = core.store.tasks().unwrap();
    assert_eq!(tasks.len(), 11);
    assert!(original.iter().all(|old| tasks
        .iter()
        .any(|new| new.id == old.id && new.status == old.status)));
    let review = &tasks[8];
    let uat = &tasks[9];
    let summary = &tasks[10];
    assert_eq!(review.status, "ready");
    assert_eq!(uat.status, "blocked");
    assert_eq!(summary.status, "blocked");
    assert!(core.store.approve_task(&uat.id).is_err());
    core.store.approve_task(&review.id).unwrap();
    let run = core
        .store
        .begin_run(&request(&core.store, &review.id), "MOCK FIXTURE ONLY")
        .unwrap();
    core.store.finish(&run.id, "completed", None).unwrap();
    core.store.reconcile_queue().unwrap();
    assert!(core.store.approve_task(&uat.id).is_err());
    core.store
        .review_task(&review.id, true, "Fixture review accepted")
        .unwrap();
    assert!(core.store.approve_task(&summary.id).is_err());
    core.store.approve_task(&uat.id).unwrap();
    assert_eq!(core.store.task(&summary.id).unwrap().status, "ready");
    let summary_prompt = core
        .store
        .task_prompt(&core.store.task(&summary.id).unwrap())
        .unwrap();
    assert!(summary_prompt.contains("Core gate record: step=uat"));
    assert!(summary_prompt.contains("status=completed, approved=true"));
    assert!(summary_prompt.contains("not production release"));
}

#[test]
fn native_writing_template_keeps_apply_dependency_and_evidence_approval_guards() {
    let (_dir, core, project) = setup();
    let flow = core
        .store
        .create_writing_workflow(&project, "Approved writing fixture", false)
        .unwrap();
    core.store.reconcile_queue().unwrap();
    let tasks = core.store.tasks().unwrap();
    assert_eq!(tasks.len(), 4);
    assert_eq!(
        tasks.iter().map(|t| t.step.as_str()).collect::<Vec<_>>(),
        vec!["implement", "review", "uat", "summary"]
    );
    assert!(tasks
        .iter()
        .all(|t| t.workflow_id.as_deref() == Some(&flow.id)));
    let forge = &tasks[0];
    let scout = &tasks[1];
    let uat = &tasks[2];
    assert!(core.store.approve_task(&forge.id).is_err());
    core.store
        .configure_writing(&forge.id, vec!["native.mjs".into()])
        .unwrap();
    core.store.approve_task(&forge.id).unwrap();
    let run = core
        .store
        .begin_run(&request(&core.store, &forge.id), "FIXTURE ONLY")
        .unwrap();
    core.store
        .stage_patch(
            &forge.id,
            &run.id,
            r#"{"files":[{"path":"native.mjs","content":"export const fixture = true;"}]}"#,
        )
        .unwrap();
    core.store.finish(&run.id, "completed", None).unwrap();
    core.store.reconcile_queue().unwrap();
    assert!(core.store.approve_task(&scout.id).is_err());
    core.store
        .apply_patch(&forge.id, &core.store.patch_digest(&forge.id).unwrap())
        .unwrap();
    assert!(core
        .store
        .set_review_evidence(&forge.id, "wrong agent")
        .is_err());
    core.store
        .set_review_evidence(&scout.id, "Owner ran fixed tests: fixture passed")
        .unwrap();
    assert!(core
        .store
        .task_prompt(&core.store.task(&scout.id).unwrap())
        .unwrap()
        .contains("QA_VERIFIED"));
    core.store.approve_task(&scout.id).unwrap();
    assert!(core
        .store
        .set_review_evidence(&scout.id, "approval must not be changed")
        .is_err());
    assert!(core.store.approve_task(&uat.id).is_err());
}

#[test]
fn legacy_task_events_read_as_unknown() {
    let (_d, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    // emulate a schema-5 database that already holds an event row, then reopen to migrate
    core.store
        .connect()
        .unwrap()
        .execute_batch(&format!(
            "ALTER TABLE task_events DROP COLUMN initiator; ALTER TABLE task_events DROP COLUMN initiator_ref;              DELETE FROM schema_migrations WHERE version=6; PRAGMA user_version=5;              INSERT INTO task_events(task_id,kind,text,created_at) VALUES('{}','legacy','old row','2026-01-01');",
            task.id
        ))
        .unwrap();
    let reopened = Store::open(&core.store.path).unwrap();
    let legacy = reopened
        .task_events(&task.id)
        .unwrap()
        .into_iter()
        .find(|e| e.kind == "legacy")
        .unwrap();
    assert_eq!(legacy.initiator, "unknown");
    assert_eq!(legacy.initiator_ref, None);
}

#[test]
fn owner_actions_are_attributed_to_owner() {
    let (_d, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    core.store.cancel_pending_task(&task.id, &Initiator::Owner).unwrap();
    let events = core.store.task_events(&task.id).unwrap();
    assert!(events.iter().any(|e| e.kind == "canceled"));
    assert!(events.iter().all(|e| e.initiator == "owner" && e.initiator_ref.is_none()));
}

#[tokio::test]
async fn scheduler_dispatch_is_recorded_before_start() {
    let (_d, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    core.store.approve_task(&task.id).unwrap();
    core.store.set_scheduler_paused(false).unwrap();
    let run = core.scheduler_tick().await.unwrap().unwrap();
    let events = core.store.task_events(&task.id).unwrap();
    let dispatch = events.iter().find(|e| e.kind == "dispatch_requested").unwrap();
    let started = events.iter().find(|e| e.kind == "execution_started").unwrap();
    assert_eq!(dispatch.initiator, "scheduler");
    assert_eq!(started.initiator, "system");
    assert!(dispatch.id < started.id);
    core.cancel(&run).unwrap();
}

#[tokio::test]
async fn owner_cancel_of_running_task_is_attributed() {
    let (_d, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    core.store.approve_task(&task.id).unwrap();
    core.store.set_scheduler_paused(false).unwrap();
    let run = core.scheduler_tick().await.unwrap().unwrap();
    let running = core.store.task(&task.id).unwrap();
    assert_eq!(running.status, "running");
    core.cancel_task(&running, &Initiator::Owner).unwrap();
    let events = core.store.task_events(&task.id).unwrap();
    let cancel = events.iter().find(|e| e.kind == "cancel_requested").unwrap();
    assert_eq!(cancel.initiator, "owner");
    assert_eq!(cancel.text, run);
}
