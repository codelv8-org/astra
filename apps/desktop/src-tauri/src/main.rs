#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use crewnest_core::remote::{credential, RemoteService, RemoteStatus};
use crewnest_core::{models::*, store::Store, Core};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn remote_status(
    core: State<'_, Core>,
    service: State<'_, RemoteService>,
) -> Result<RemoteStatus, String> {
    let config = core.remote_config()?;
    Ok(RemoteStatus {
        connection: if config.is_some() {
            service.status.lock().clone()
        } else {
            "not_configured".into()
        },
        device_id: config.as_ref().map(|c| c.device_id.clone()),
        server: config.map(|c| c.server),
        shared: core.remote_shared()?,
    })
}
#[tauri::command]
async fn remote_pair(
    app: tauri::AppHandle,
    core: State<'_, Core>,
    service: State<'_, RemoteService>,
    server: String,
    code: String,
    name: String,
    custom_ca: bool,
) -> Result<(), String> {
    if core.remote_config()?.is_some() {
        return Err("Forget existing pairing first".into());
    }
    crewnest_core::remote::server_url(&server)?;
    if !app.dialog().message(format!("Pair with {server}? This grants remote submission/monitoring only for projects shared separately. Exact local task approval remains required. No remote terminal or remote writing approval.")).title("Astra — approve remote pairing").buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).blocking_show(){return Err("Pairing canceled".into());}
    let ca = if custom_ca {
        let f = app
            .dialog()
            .file()
            .add_filter("CA certificate", &["pem", "crt"])
            .blocking_pick_file()
            .ok_or("CA selection canceled")?;
        let path = f.into_path().map_err(|_| "Invalid CA path")?;
        let data = std::fs::read_to_string(path).map_err(|_| "Cannot read CA")?;
        if data.len() > 32768 {
            return Err("CA file too large".into());
        }
        Some(data)
    } else {
        None
    };
    let (config, token) = crewnest_core::remote::pair(&server, &code, &name, ca).await?;
    credential(&config)?
        .set_password(&token)
        .map_err(|e| e.to_string())?;
    core.save_remote_config(&config)?;
    service.start(core.inner().clone(), config, token)
}
#[tauri::command]
async fn remote_connect(
    core: State<'_, Core>,
    service: State<'_, RemoteService>,
) -> Result<(), String> {
    if service.status.lock().as_str() == "pairing_required" {
        return Err("Forget the old pairing locally and pair again".into());
    }
    let config = core.remote_config()?.ok_or("Pair device first")?;
    let token = credential(&config)?
        .get_password()
        .map_err(|_| "Device credential unavailable; pair again")?;
    service.start(core.inner().clone(), config, token)
}
#[tauri::command]
async fn remote_disconnect(service: State<'_, RemoteService>) -> Result<(), String> {
    service.disconnect();
    Ok(())
}
#[tauri::command]
async fn remote_forget(
    app: tauri::AppHandle,
    core: State<'_, Core>,
    service: State<'_, RemoteService>,
) -> Result<(), String> {
    if !app.dialog().message("Forget local pairing? Revoke the old device in Web to invalidate its server credential. Existing runs continue locally.").title("Astra — forget pairing").buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).blocking_show(){return Err("Canceled".into());}
    service.disconnect();
    if let Some(c) = core.remote_config()? {
        credential(&c)?
            .delete_credential()
            .map_err(|e| e.to_string())?;
    }
    core.store
        .connect()?
        .execute("DELETE FROM remote_settings", [])
        .map_err(|e| e.to_string())?;
    core.store
        .connect()?
        .execute("DELETE FROM remote_projects", [])
        .map_err(|e| e.to_string())?;
    core.store.audit("remote_forgotten", "local")
}
#[tauri::command]
async fn remote_share(
    app: tauri::AppHandle,
    core: State<'_, Core>,
    project_id: String,
    enabled: bool,
    logs: bool,
) -> Result<(), String> {
    let p = core.store.project(&project_id)?;
    if enabled&&!app.dialog().message(format!("Share {} metadata remotely? Logs/artifacts: {}. Outputs can contain project data; sanitization is not complete DLP. Only enable for content you allow to leave this device.",p.name,logs)).title("Astra — approve project sharing").buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).blocking_show(){return Err("Sharing canceled".into());}
    core.share_remote_project(&project_id, enabled, logs)
}

#[tauri::command]
async fn snapshot(
    core: State<'_, Core>,
    service: State<'_, RemoteService>,
) -> Result<Snapshot, String> {
    let mut snapshot = core.store.snapshot()?;
    if core.remote_config()?.is_some() {
        let connection = service.status.lock().clone();
        snapshot.remote_status = if connection.is_empty() {
            "disconnected".into()
        } else {
            connection
        };
    }
    Ok(snapshot)
}

#[tauri::command]
async fn diagnostics(core: State<'_, Core>) -> Result<Vec<Diagnostic>, String> {
    Ok(core.diagnostics().await)
}

#[tauri::command]
async fn create_project(
    app: tauri::AppHandle,
    core: State<'_, Core>,
    name: String,
    goal: String,
) -> Result<Option<Project>, String> {
    if name.trim().is_empty() || name.chars().count() > 100 || goal.chars().count() > 4000 {
        return Err("Invalid project name or goal length".into());
    }
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Astra — approve a local project directory")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    match selected {
        None => Ok(None),
        Some(path) => Ok(Some(core.store.register_project(
            &name,
            &goal,
            &path.into_path().map_err(|e| e.to_string())?,
        )?)),
    }
}

#[tauri::command]
async fn start_run(
    app: tauri::AppHandle,
    core: State<'_, Core>,
    request: RunRequest,
) -> Result<Execution, String> {
    let project = core.store.project(&request.project_id)?;
    if !request.approved {
        return Err("Explicit human approval is required".into());
    }
    if request.prompt.trim().is_empty() || request.prompt.chars().count() > 8000 {
        return Err("Prompt must contain 1–8000 characters".into());
    }
    let executable = match request.adapter.as_str() {
        "mock" => "MOCK — no AI model".to_string(),
        "codex" | "claude" | "antigravity" => core
            .approved_runtime(&request.adapter)?
            .to_string_lossy()
            .into_owned(),
        _ => return Err("Unsupported execution adapter".into()),
    };
    let content=format!("Adapter: {}\nExecutable: {}\nWorkspace: {}\nScope: read-only; no high-risk actions\n\nPrompt:\n{}",request.adapter,executable,project.path,request.prompt);
    let approved = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(content)
            .title("Astra — approve this execution")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())?;
    if !approved {
        return Err("Execution approval canceled".into());
    }
    if request.task_id.is_some() {
        return Err("Use the queue approval command for persisted tasks".into());
    }
    core.start(request).await
}

#[tauri::command]
async fn create_task(core: State<'_, Core>, input: TaskInput) -> Result<Task, String> {
    core.store.create_task(input)
}

#[tauri::command]
async fn create_workflow(
    core: State<'_, Core>,
    project_id: String,
    objective: String,
    mock: bool,
) -> Result<Workflow, String> {
    core.store.create_workflow(&project_id, &objective, mock)
}

#[tauri::command]
async fn create_writing_workflow(
    core: State<'_, Core>,
    project_id: String,
    objective: String,
    mock: bool,
) -> Result<Workflow, String> {
    core.store
        .create_writing_workflow(&project_id, &objective, mock)
}

#[tauri::command]
async fn queue_action(
    app: tauri::AppHandle,
    core: State<'_, Core>,
    task_id: String,
    action: String,
    note: Option<String>,
) -> Result<(), String> {
    let task = core.store.task(&task_id)?;
    match action.as_str() {
        "approve" => {
            let prompt = core.store.task_prompt(&task)?;
            let executable = if task.gate || task.adapter == "mock" {
                task.adapter.clone()
            } else {
                core.approved_runtime(&task.adapter)?
                    .to_string_lossy()
                    .into_owned()
            };
            let message=format!("Task: {}\nRuntime: {}\nExecutable: {}\nHuman gate: {}\nScope: read-only/plan\nTimeout: {} seconds\n\n{}",task.title,task.adapter,executable,task.gate,task.timeout_seconds,prompt);
            let approved = tauri::async_runtime::spawn_blocking(move || {
                app.dialog()
                    .message(message)
                    .title("Astra — approve queue task / human gate")
                    .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
                    .blocking_show()
            })
            .await
            .map_err(|e| e.to_string())?;
            if !approved {
                return Err("Task approval canceled".into());
            }
            core.store.approve_task(&task_id)
        }
        "retry" => core.store.retry_task(&task_id),
        "review_evidence" => core
            .store
            .set_review_evidence(&task_id, note.as_deref().unwrap_or("")),
        "cancel" => {
            if task.status == "running" {
                let run = task.last_execution_id.ok_or("No active execution")?;
                core.cancel(&run)
            } else {
                core.store.cancel_pending_task(&task_id)
            }
        }
        "accept_review" | "rework" => core.store.review_task(
            &task_id,
            action == "accept_review",
            note.as_deref().unwrap_or(""),
        ),
        _ => Err("Unsupported queue action".into()),
    }
}

#[tauri::command]
async fn queue_events(core: State<'_, Core>, task_id: String) -> Result<Vec<TaskEvent>, String> {
    core.store.task_events(&task_id)
}

#[tauri::command]
async fn scheduling(core: State<'_, Core>, paused: bool) -> Result<(), String> {
    core.store.set_scheduler_paused(paused)
}

#[tauri::command]
async fn writing_info(core: State<'_, Core>, task_id: String) -> Result<serde_json::Value, String> {
    let patch = core.store.patch(&task_id)?;
    Ok(
        serde_json::json!({"policy":core.store.writing_policy(&task_id)?,"digest":if patch.is_some(){Some(core.store.patch_digest(&task_id)?)}else{None},"patch":patch}),
    )
}

#[tauri::command]
async fn configure_writing(
    app: tauri::AppHandle,
    core: State<'_, Core>,
    task_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    if paths.is_empty() || paths.len() > 8 || paths.iter().any(|p| p.len() > 180) {
        return Err("Writing requires 1–8 short relative paths".into());
    }
    let task = core.store.task(&task_id)?;
    let workspace = core.store.project(&task.project_id)?.path;
    let content=format!("FORGE staged writing\nWorkspace: {workspace}\nPaths: {}\nRead selected snapshots into the prompt. No file writes until a second approval of exact proposed contents. No shell/delete/deploy/push.",paths.join(", "));
    let approved = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(content)
            .title("Astra — approve writing scope")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())?;
    if !approved {
        return Err("Writing scope approval canceled".into());
    }
    core.store.configure_writing(&task_id, paths)
}

#[tauri::command]
async fn writing_action(
    app: tauri::AppHandle,
    core: State<'_, Core>,
    task_id: String,
    action: String,
    digest: String,
) -> Result<(), String> {
    if !["apply", "rollback"].contains(&action.as_str()) {
        return Err("Unsupported writing action".into());
    }
    if core.store.patch_digest(&task_id)? != digest {
        return Err("Patch changed; refresh and review again".into());
    }
    let task = core.store.task(&task_id)?;
    let patch = core.store.patch(&task_id)?.ok_or("No patch")?;
    let content=format!("Action: {action}\nWorkspace: {}\nExact patch SHA256: {digest}\nFiles: {}\nConfirm only after reviewing all before/after contents in the patch panel. Rollback may remove files created by this patch; unrelated edits are never overwritten.",core.store.project(&task.project_id)?.path,patch.files.iter().map(|f|f.path.clone()).collect::<Vec<_>>().join(", "));
    let approved = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(content)
            .title("Astra — approve exact file changes")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())?;
    if !approved {
        return Err("File change approval canceled".into());
    }
    if action == "apply" {
        core.store.apply_patch(&task_id, &digest)
    } else {
        core.store.rollback_patch(&task_id, &digest)
    }
}

#[tauri::command]
async fn execution_events(
    core: State<'_, Core>,
    execution_id: String,
    after: i64,
) -> Result<Vec<ExecutionEvent>, String> {
    core.store.events(&execution_id, after)
}

#[tauri::command]
async fn cancel_run(core: State<'_, Core>, execution_id: String) -> Result<(), String> {
    core.cancel(&execution_id)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data = if cfg!(debug_assertions) {
                std::env::var_os("CREWNEST_DATA_DIR")
                    .map(std::path::PathBuf::from)
                    .unwrap_or(app.path().app_local_data_dir()?.join("development"))
            } else {
                app.path().app_local_data_dir()?
            };
            let store = Store::open(data.join("crewnest.db")).map_err(std::io::Error::other)?;
            let handle = app.handle().clone();
            let core = Core::new(
                store,
                Arc::new(move |event| {
                    let _ = handle.emit("execution-event", event);
                }),
            )
            .map_err(std::io::Error::other)?;
            let scheduler = core.clone();
            tauri::async_runtime::spawn(async move {
                scheduler.spawn_scheduler();
            });
            app.manage(core);
            app.manage(RemoteService::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            remote_status,
            remote_pair,
            remote_connect,
            remote_disconnect,
            remote_forget,
            remote_share,
            diagnostics,
            create_project,
            start_run,
            execution_events,
            cancel_run,
            create_task,
            create_workflow,
            create_writing_workflow,
            queue_action,
            queue_events,
            scheduling,
            writing_info,
            configure_writing,
            writing_action
        ])
        .run(tauri::generate_context!())
        .expect("Astra desktop failed");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn headless_ipc_roundtrip_uses_real_sqlite_and_rejects_unknown_commands() {
        let dir = tempfile::tempdir().unwrap();
        let core = Core::new(
            Store::open(dir.path().join("ipc.db")).unwrap(),
            Arc::new(|_| {}),
        )
        .unwrap();
        let app = tauri::test::mock_builder()
            .manage(core)
            .manage(RemoteService::default())
            .invoke_handler(tauri::generate_handler![
                snapshot,
                execution_events,
                cancel_run
            ])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let invoke = |cmd: &str, body: serde_json::Value| {
            tauri::test::get_ipc_response(
                &window,
                tauri::webview::InvokeRequest {
                    cmd: cmd.into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: "http://tauri.localhost".parse().unwrap(),
                    body: tauri::ipc::InvokeBody::Json(body),
                    headers: Default::default(),
                    invoke_key: tauri::test::INVOKE_KEY.to_string(),
                },
            )
        };
        let response = invoke("snapshot", serde_json::json!({}))
            .unwrap()
            .deserialize::<serde_json::Value>()
            .unwrap();
        assert_eq!(response["agents"].as_array().unwrap().len(), 5);
        assert_eq!(response["remoteStatus"], "not_configured");
        assert!(invoke("arbitrary_shell", serde_json::json!({"command":"whoami"})).is_err());
        assert!(invoke("cancel_run", serde_json::json!({"executionId":"unknown"})).is_err());
        assert_eq!(
            invoke(
                "execution_events",
                serde_json::json!({"executionId":"unknown","after":0})
            )
            .unwrap()
            .deserialize::<Vec<ExecutionEvent>>()
            .unwrap()
            .len(),
            0
        );
    }
}
