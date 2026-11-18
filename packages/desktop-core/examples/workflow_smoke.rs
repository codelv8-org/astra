use crewnest_core::{store::Store, Core};
use std::{path::PathBuf, sync::Arc, time::Duration};

#[tokio::main]
async fn main() -> Result<(), String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/phase2-workflow-smoke");
    std::fs::create_dir_all(root.join("workspace")).map_err(|e| e.to_string())?;
    let store = Store::open(root.join("workflow.db"))?;
    let core = Core::new(
        store.clone(),
        Arc::new(|event| println!("{}: {}", event.kind, event.text)),
    )?;
    let project = store
        .snapshot()?
        .projects
        .into_iter()
        .next()
        .map(Ok)
        .unwrap_or_else(|| {
            store.register_project(
                "Phase 2 workflow smoke",
                "Synthetic queue demonstration",
                &root.join("workspace"),
            )
        })?;
    let workflow=store.create_workflow(&project.id,"MOCK ONLY: demonstrate objective, plan approval, architecture/design handoff, implementation proposal, QA review, human UAT and final summary.",true)?;
    println!("MOCK workflow {} — approvals below are explicit test-harness decisions, not native human UAT sign-off",workflow.id);
    store.set_scheduler_paused(false)?;
    let run = async {
        let mut reviewed = false;
        loop {
            store.reconcile_queue()?;
            let tasks = store.tasks()?;
            for task in tasks
                .iter()
                .filter(|t| t.workflow_id.as_deref() == Some(&workflow.id))
            {
                if task.status == "ready" {
                    println!("TEST HARNESS APPROVAL {} {}", task.id, task.step);
                    store.approve_task(&task.id)?;
                }
                if task.status == "needs_review" {
                    store.review_task(&task.id,true,"MOCK TEST HARNESS: accept synthetic result for orchestration verification only")?;
                    reviewed = true;
                }
                if ["failed", "canceled"].contains(&task.status.as_str()) {
                    return Err(format!("Unexpected terminal task state: {}", task.status));
                }
            }
            core.scheduler_tick().await?;
            if store
                .workflows()?
                .iter()
                .any(|w| w.id == workflow.id && w.status == "completed")
            {
                if !reviewed {
                    return Err("SCOUT review gate was skipped".into());
                }
                for task in store
                    .tasks()?
                    .iter()
                    .filter(|t| t.workflow_id.as_deref() == Some(&workflow.id) && !t.gate)
                {
                    if task.approved
                        || !store
                            .task_events(&task.id)?
                            .iter()
                            .any(|e| e.kind == "execution_finished")
                    {
                        return Err("Missing completion event or unconsumed authorization".into());
                    }
                }
                break;
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
        Ok::<(), String>(())
    };
    tokio::time::timeout(Duration::from_secs(180), run)
        .await
        .map_err(|_| "Workflow smoke timed out")??;
    store.set_scheduler_paused(true)?;
    println!("WORKFLOW_COMPLETED {}", workflow.id);
    Ok(())
}
