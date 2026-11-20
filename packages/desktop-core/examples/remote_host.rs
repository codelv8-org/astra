use crewnest_core::{
    remote::{self, RemoteService},
    store::Store,
    Core,
};
use serde_json::json;
use std::{path::PathBuf, sync::Arc};

// ตัวทดสอบ Core แยกจาก production Desktop; control file ใช้เฉพาะ local test harness ไม่ใช่ remote approval API
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::var("CREWNEST_REMOTE_TEST_ROOT")?);
    std::fs::create_dir_all(root.join("workspace"))?;
    let core = Core::new(Store::open(root.join("host.db"))?, Arc::new(|_| {}))?;
    let p = if let Some(p) = core.store.snapshot()?.projects.into_iter().next() {
        p
    } else {
        core.store.register_project(
            "REMOTE E2E SAMPLE",
            "Synthetic local test only",
            &root.join("workspace"),
        )?
    };
    core.share_remote_project(&p.id, true, true)?;
    let ca = std::fs::read_to_string(std::env::var("CREWNEST_REMOTE_TEST_CA")?)?;
    let (config, token) = remote::pair(
        &std::env::var("CREWNEST_REMOTE_TEST_SERVER")?,
        &std::env::var("CREWNEST_REMOTE_TEST_CODE")?,
        "E2E Windows Core",
        Some(ca),
    )
    .await?;
    remote::credential(&config)?.set_password(&token)?;
    assert_eq!(remote::credential(&config)?.get_password()?, token);
    core.save_remote_config(&config)?;
    let service = RemoteService::default();
    service.start(core.clone(), config.clone(), token.clone())?;
    let diagnostics = if std::env::var_os("CREWNEST_REMOTE_TEST_CODEX").is_some() {
        core.diagnostics().await
    } else {
        vec![]
    };
    std::fs::write(
        root.join("ready.json"),
        serde_json::to_vec(
            &json!({"projectId":p.id,"deviceId":config.device_id,"ownerId":config.owner_id,"codex":diagnostics.into_iter().find(|d|d.adapter=="codex").map(|d|json!({"installed":d.installed,"authentication":d.authentication}))}),
        )?,
    )?;
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let control = root.join("control.txt");
        if !control.exists() {
            continue;
        }
        let action = std::fs::read_to_string(&control)?;
        std::fs::remove_file(control)?;
        match action.trim() {
            "approve" => {
                for t in core.store.tasks()? {
                    if ["draft", "ready"].contains(&t.status.as_str()) && !t.approved {
                        core.store.approve_task(&t.id)?;
                    }
                }
            }
            "disconnect" => service.disconnect(),
            "verify revoked" => {
                let wait_for_terminal = |client: RemoteService| async move {
                    tokio::time::timeout(std::time::Duration::from_secs(12), async {
                        while client.running.load(std::sync::atomic::Ordering::SeqCst) {
                            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                        }
                    })
                    .await
                    .unwrap();
                    assert_eq!(client.status.lock().as_str(), "pairing_required");
                };
                wait_for_terminal(service.clone()).await;
                let fresh = RemoteService::default();
                fresh.start(core.clone(), config.clone(), token.clone())?;
                wait_for_terminal(fresh.clone()).await;
                tokio::time::sleep(std::time::Duration::from_secs(4)).await;
                assert!(!fresh.running.load(std::sync::atomic::Ordering::SeqCst));
                assert_eq!(fresh.status.lock().as_str(), "pairing_required");
                std::fs::write(
                    root.join("revoked-verified.txt"),
                    "close and HTTP 401 terminal",
                )?;
            }
            "connect" => {
                while service.running.load(std::sync::atomic::Ordering::SeqCst) {
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                }
                service.start(core.clone(), config.clone(), token.clone())?;
            }
            "stop" => break,
            _ => return Err("Unknown local harness control".into()),
        }
    }
    service.disconnect();
    remote::credential(&config)?.delete_credential()?;
    Ok(())
}
