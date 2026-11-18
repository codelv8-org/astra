use crewnest_core::{models::RunRequest, store::Store, Core};
use std::{path::PathBuf, sync::Arc, time::Duration};

#[tokio::main]
async fn main() -> Result<(), String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local");
    let workspace = root.join("smoke-workspace");
    std::fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
    let store = Store::open(root.join("smoke/crewnest.db"))?;
    let core = Core::new(
        store.clone(),
        Arc::new(|event| println!("{} {}", event.kind, event.text)),
    )?;
    let project = store
        .snapshot()?
        .projects
        .into_iter()
        .next()
        .map(Ok)
        .unwrap_or_else(|| {
            store.register_project("Smoke workspace", "Isolated adapter smoke test", &workspace)
        })?;
    let real = std::env::args().any(|s| s == "--real");
    let adapter = std::env::var("CREWNEST_SMOKE_ADAPTER")
        .unwrap_or_else(|_| if real { "codex" } else { "mock" }.into());
    let agent = match adapter.as_str() {
        "claude" => "forge",
        "antigravity" => "mira",
        _ => "astra",
    };
    let diagnostics = core.diagnostics().await;
    println!(
        "{}",
        serde_json::to_string_pretty(&diagnostics).map_err(|e| e.to_string())?
    );
    let run=core.start(RunRequest{project_id:project.id,agent_id:agent.into(),adapter:adapter.clone(),prompt:"Do not call any tools or inspect any files. Respond only with CREWNEST_REAL_ADAPTER_OK.".into(),approved:true,task_id:None,timeout_seconds:120}).await?;
    loop {
        let state = store.execution(&run.id)?;
        if state.status != "running" {
            println!("RESULT {} {}", state.id, state.status);
            if state.status != "completed" {
                return Err(state.error.unwrap_or(state.status));
            }
            break;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Ok(())
}
