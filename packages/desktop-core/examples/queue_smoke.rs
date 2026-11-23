use crewnest_core::{models::TaskInput, store::Store, Core};
use std::{path::PathBuf, sync::Arc, time::Duration};

#[tokio::main]
async fn main() -> Result<(), String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/phase2-real-queue");
    std::fs::create_dir_all(root.join("workspace")).map_err(|e| e.to_string())?;
    let store = Store::open(root.join("queue.db"))?;
    let core = Core::new(
        store.clone(),
        Arc::new(|e| println!("{} {}", e.kind, e.text)),
    )?;
    let diagnostics = core.diagnostics().await;
    println!(
        "{}",
        serde_json::to_string(&diagnostics).map_err(|e| e.to_string())?
    );
    let project = store
        .snapshot()?
        .projects
        .into_iter()
        .next()
        .map(Ok)
        .unwrap_or_else(|| {
            store.register_project(
                "Real queue smoke",
                "Synthetic read-only handoff",
                &root.join("workspace"),
            )
        })?;
    let first = store.create_task(TaskInput {
        project_id: project.id.clone(),
        agent_id: "astra".into(),
        adapter: "codex".into(),
        title: "ASTRA synthetic plan".into(),
        prompt: "Do not use tools, files or commands. Reply only: CREWNEST_QUEUE_HANDOFF_42".into(),
        dependencies: vec![],
        priority: 60,
        timeout_seconds: 120,
        retry_limit: 0,
    }, &crewnest_core::models::Initiator::Owner)?;
    let second=store.create_task(TaskInput{project_id:project.id,agent_id:"scout".into(),adapter:"codex".into(),title:"SCOUT synthetic handoff verification".into(),prompt:"Do not use tools, files or commands. Read predecessor handoff text, then reply only with the marker it contains plus VERIFIED.".into(),dependencies:vec![first.id.clone()],priority:50,timeout_seconds:120,retry_limit:0}, &crewnest_core::models::Initiator::Owner)?;
    assert!(store.approve_task(&second.id).is_err());
    store.set_scheduler_paused(false)?;
    for task in [&first, &second] {
        store.reconcile_queue()?;
        store.approve_task(&task.id)?;
        let execution = core.scheduler_tick().await?.ok_or("Task not dispatched")?;
        tokio::time::timeout(Duration::from_secs(130), async {
            loop {
                let run = store.execution(&execution)?;
                if run.status != "running" {
                    if run.status != "completed" {
                        return Err(run.error.unwrap_or(run.status));
                    }
                    break;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Ok::<(), String>(())
        })
        .await
        .map_err(|_| "Queue smoke timed out")??;
    }
    store.set_scheduler_paused(true)?;
    println!("REAL_QUEUE_COMPLETED {} {}", first.id, second.id);
    Ok(())
}
