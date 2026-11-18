use crewnest_core::{
    remote::{Envelope, RemoteConfig},
    store::Store,
    Core,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;
fn setup() -> (tempfile::TempDir, Core, String, RemoteConfig) {
    let d = tempfile::tempdir().unwrap();
    std::fs::create_dir(d.path().join("workspace")).unwrap();
    let core = Core::new(
        Store::open(d.path().join("host.db")).unwrap(),
        Arc::new(|_| {}),
    )
    .unwrap();
    let p = core
        .store
        .register_project("TEST ONLY", "", &d.path().join("workspace"))
        .unwrap();
    let config = RemoteConfig {
        server: "https://example.invalid".into(),
        device_id: Uuid::new_v4().to_string(),
        owner_id: Uuid::new_v4().to_string(),
        ca_pem: None,
    };
    (d, core, p.id, config)
}
fn envelope(config: &RemoteConfig, project: &str, task: &str, action: &str) -> Value {
    json!({"command_id":Uuid::new_v4().to_string(),"device_id":config.device_id,"requested_by":config.owner_id,"project_id":project,"task_id":task,"action":action,"issued_at":chrono::Utc::now().to_rfc3339(),"expires_at":(chrono::Utc::now()+chrono::Duration::seconds(50)).to_rfc3339(),"idempotency_key":Uuid::new_v4().to_string(),"authorization_context":{"approval_id":null}})
}
#[tokio::test]
async fn remote_requires_shared_project_and_exact_local_approval() {
    let (_d, core, p, c) = setup();
    let task = Uuid::new_v4().to_string();
    let mut command = envelope(&c, &p, &task, "submit");
    command["payload"] =
        json!({"agentId":"astra","adapter":"mock","title":"test","prompt":"test only"});
    let ack = core
        .handle_remote(&c, serde_json::from_value(command.clone()).unwrap())
        .await
        .unwrap();
    assert_eq!(ack["state"], "rejected");
    assert!(core.store.tasks().unwrap().is_empty());
    core.share_remote_project(&p, true, false).unwrap();
    command["command_id"] = json!(Uuid::new_v4().to_string());
    command["idempotency_key"] = json!(Uuid::new_v4().to_string());
    let ack = core
        .handle_remote(&c, serde_json::from_value(command).unwrap())
        .await
        .unwrap();
    assert_eq!(ack["state"], "accepted");
    let tasks = core.store.tasks().unwrap();
    assert_eq!(tasks.len(), 1);
    assert!(!tasks[0].approved);
    let ack = core
        .handle_remote(
            &c,
            serde_json::from_value(envelope(&c, &p, &task, "start")).unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ack["state"], "rejected");
    assert!(core.store.snapshot().unwrap().executions.is_empty());
}
#[tokio::test]
async fn replay_is_durable_and_changed_payload_or_expiry_cannot_execute() {
    let (d, core, p, c) = setup();
    core.share_remote_project(&p, true, false).unwrap();
    let mut v = envelope(&c, &p, &Uuid::new_v4().to_string(), "submit");
    v["payload"] = json!({"agentId":"astra","adapter":"mock","title":"test","prompt":"test only"});
    core.handle_remote(&c, serde_json::from_value(v.clone()).unwrap())
        .await
        .unwrap();
    core.handle_remote(&c, serde_json::from_value(v.clone()).unwrap())
        .await
        .unwrap();
    assert_eq!(core.store.tasks().unwrap().len(), 1);
    drop(core);
    let reopened = Core::new(
        Store::open(d.path().join("host.db")).unwrap(),
        Arc::new(|_| {}),
    )
    .unwrap();
    reopened
        .handle_remote(&c, serde_json::from_value(v.clone()).unwrap())
        .await
        .unwrap();
    assert_eq!(reopened.store.tasks().unwrap().len(), 1);
    v["payload"]["prompt"] = json!("changed");
    assert!(reopened
        .handle_remote(&c, serde_json::from_value(v.clone()).unwrap())
        .await
        .is_err());
    v["expires_at"] = json!((chrono::Utc::now() - chrono::Duration::seconds(1)).to_rfc3339());
    assert!(reopened
        .handle_remote(&c, serde_json::from_value(v).unwrap())
        .await
        .is_err());
}
#[tokio::test]
async fn device_owner_action_and_runtime_binding_fail_closed() {
    let (_d, core, p, c) = setup();
    core.share_remote_project(&p, true, false).unwrap();
    let mut v = envelope(&c, &p, &Uuid::new_v4().to_string(), "status");
    v["requested_by"] = json!(Uuid::new_v4().to_string());
    assert!(core
        .handle_remote(&c, serde_json::from_value(v).unwrap())
        .await
        .is_err());
    let ack = core
        .handle_remote(
            &c,
            serde_json::from_value(envelope(&c, &p, &Uuid::new_v4().to_string(), "shell")).unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ack["state"], "rejected");
    let mut v = envelope(&c, &p, &Uuid::new_v4().to_string(), "submit");
    v["payload"] =
        json!({"agentId":"astra","adapter":"claude","title":"test","prompt":"test only"});
    let ack = core
        .handle_remote(&c, serde_json::from_value(v).unwrap())
        .await
        .unwrap();
    assert_eq!(ack["state"], "rejected");
    assert!(serde_json::from_value::<Envelope>(json!({"shell":"whoami"})).is_err());
}
#[test]
fn snapshot_does_not_publish_paths_or_private_projects_and_tls_is_required() {
    let (_d, core, p, _c) = setup();
    assert!(crewnest_core::remote::server_url("http://localhost:7443").is_err());
    assert!(crewnest_core::remote::server_url("https://user:password@example.com").is_err());
    assert_eq!(core.remote_snapshot().unwrap()["projects"], json!([]));
    core.share_remote_project(&p, true, false).unwrap();
    let snapshot = core.remote_snapshot().unwrap();
    assert_eq!(snapshot["projects"].as_array().unwrap().len(), 1);
    assert!(!snapshot.to_string().contains("workspace"));
    assert!(!core
        .remote_safe("password=secret-value sk-abcdefghij")
        .contains("secret-value"));
}

#[tokio::test]
async fn immediate_remote_cancel_resolves_the_new_execution_without_scheduler_tick() {
    let (_d, core, p, c) = setup();
    core.share_remote_project(&p, true, false).unwrap();
    let task = Uuid::new_v4().to_string();
    let mut submit = envelope(&c, &p, &task, "submit");
    submit["payload"] =
        json!({"agentId":"astra","adapter":"mock","title":"cancel fixture","prompt":"MOCK only"});
    core.handle_remote(&c, serde_json::from_value(submit).unwrap())
        .await
        .unwrap();
    core.store
        .approve_task(&core.store.tasks().unwrap()[0].id)
        .unwrap();
    let start = envelope(&c, &p, &task, "start");
    let started = core
        .handle_remote(&c, serde_json::from_value(start.clone()).unwrap())
        .await
        .unwrap();
    assert_eq!(started["state"], "accepted");
    assert_eq!(
        core.handle_remote(&c, serde_json::from_value(start).unwrap())
            .await
            .unwrap()["state"],
        "accepted"
    );
    assert_eq!(core.store.snapshot().unwrap().executions.len(), 1);
    let canceled = core
        .handle_remote(
            &c,
            serde_json::from_value(envelope(&c, &p, &task, "cancel")).unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(canceled["state"], "accepted");
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            if core.store.snapshot().unwrap().executions[0].status == "canceled" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        }
    })
    .await
    .unwrap();
}
