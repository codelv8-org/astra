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
    let mut snapshot = core.store.snapshot().map_err(friendly_storage_error)?;
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

/// folder ที่ผู้ใช้อนุมัติผ่าน native picker ในรอบการทำงานนี้; renderer ส่ง path อื่นมาไม่ได้
#[derive(Default)]
struct ApprovedFolders(std::sync::Mutex<std::collections::HashSet<String>>);

impl ApprovedFolders {
    fn key(path: &std::path::Path) -> Option<String> {
        path.canonicalize()
            .ok()
            .map(|p| p.to_string_lossy().to_lowercase())
    }
    fn approve(&self, path: &std::path::Path) {
        if let (Some(key), Ok(mut set)) = (Self::key(path), self.0.lock()) {
            set.insert(key);
        }
    }
    fn require(&self, path: &str) -> Result<std::path::PathBuf, String> {
        let path = std::path::PathBuf::from(path);
        let approved = Self::key(&path)
            .zip(self.0.lock().ok())
            .is_some_and(|(key, set)| set.contains(&key));
        if approved {
            Ok(path)
        } else {
            Err("Folder must be approved with the native folder picker".into())
        }
    }
}

#[tauri::command]
async fn pick_folder(
    app: tauri::AppHandle,
    approved: State<'_, ApprovedFolders>,
) -> Result<Option<String>, String> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Astra — approve a source folder")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = selected else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    approved.approve(&path);
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// preview ป้าย git/คำเตือนก่อนบันทึก; path จาก UI ถูกตรวจซ้ำทุกครั้งใน store
#[tauri::command]
async fn inspect_folder(
    core: State<'_, Core>,
    approved: State<'_, ApprovedFolders>,
    path: String,
    project_id: Option<String>,
) -> Result<crewnest_core::folders::Inspected, String> {
    let path = approved.require(&path)?;
    let existing = match project_id {
        Some(id) => core.store.project(&id)?.folders,
        None => Vec::new(),
    };
    crewnest_core::folders::inspect(&path, &existing)
}

#[tauri::command]
async fn create_project(
    core: State<'_, Core>,
    approved: State<'_, ApprovedFolders>,
    name: String,
    goal: String,
    folders: Vec<String>,
    primary: usize,
) -> Result<Project, String> {
    let folders = folders
        .iter()
        .map(|path| approved.require(path))
        .collect::<Result<Vec<_>, _>>()?;
    core.store
        .register_project_folders(&name, &goal, &folders, primary)
}

#[tauri::command]
async fn add_project_folder(
    core: State<'_, Core>,
    approved: State<'_, ApprovedFolders>,
    project_id: String,
    path: String,
) -> Result<Project, String> {
    core.store
        .add_project_folder(&project_id, &approved.require(&path)?)
}

#[tauri::command]
async fn remove_project_folder(
    core: State<'_, Core>,
    project_id: String,
    folder_id: String,
) -> Result<Project, String> {
    core.store.remove_project_folder(&project_id, &folder_id)
}

#[tauri::command]
async fn set_primary_folder(
    core: State<'_, Core>,
    project_id: String,
    folder_id: String,
) -> Result<Project, String> {
    core.store.set_primary_folder(&project_id, &folder_id)
}

/// บรรทัด Workspace + folder รอง สำหรับใบอนุมัติทุกแบบ
fn approval_folders_note(project: &Project, adapter: &str) -> String {
    let extra = crewnest_core::adapters::folders_context(project)
        .map(|folders| {
            let note = if adapter == "antigravity" {
                "\nNote: antigravity uses the primary folder only"
            } else {
                ""
            };
            format!("{folders}{note}\n")
        })
        .unwrap_or_default();
    format!(
        "Workspace: {}\n{extra}",
        crewnest_core::adapters::plain_path(&project.path)
    )
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
    let content=format!("Adapter: {}\nExecutable: {}\n{}Scope: read-only; no high-risk actions\n\nPrompt:\n{}",request.adapter,executable,approval_folders_note(&project, &request.adapter),request.prompt);
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
    core.store.create_task(input, &Initiator::Owner)
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
            let folders = approval_folders_note(&core.store.project(&task.project_id)?, &task.adapter);
            let message=format!("Task: {}\nRuntime: {}\nExecutable: {}\n{folders}Human gate: {}\nScope: read-only/plan\nTimeout: {} seconds\n\n{}",task.title,task.adapter,executable,task.gate,task.timeout_seconds,prompt);
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
        "cancel" => core.cancel_task(&task, &Initiator::Owner),
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
    let digest = patch.as_ref().map(|patch| patch.digest()).transpose()?;
    Ok(
        serde_json::json!({"policy":core.store.writing_policy(&task_id)?,"digest":digest,"patch":patch}),
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
    let patch = core.store.patch(&task_id)?.ok_or("No patch")?;
    if patch.digest()? != digest {
        return Err("Patch changed; refresh and review again".into());
    }
    let task = core.store.task(&task_id)?;
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
async fn execution_result(
    core: State<'_, Core>,
    execution_id: String,
    project_id: String,
) -> Result<ExecutionResult, String> {
    core.store.execution_result(&execution_id, &project_id)
}

#[tauri::command]
async fn project_overview(
    core: State<'_, Core>,
    days: u32,
) -> Result<crewnest_core::overview::Overview, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .ok_or("Home folder not found")?;
    core.store.overview(std::path::Path::new(&home), days)
}

#[tauri::command]
async fn link_session(
    core: State<'_, Core>,
    agent: String,
    session_id: String,
    project_id: Option<String>,
) -> Result<(), String> {
    core.store
        .link_session(&agent, &session_id, project_id.as_deref())
}

#[tauri::command]
async fn cancel_run(core: State<'_, Core>, execution_id: String) -> Result<(), String> {
    core.cancel(&execution_id)
}

const STORAGE_UNREACHABLE: &str =
    "เข้าถึงพื้นที่จัดเก็บไม่ได้ — ตรวจการเชื่อมต่อ File Sharing แล้วลองใหม่";

/// แปลง error ของ SQLite ที่มาจาก IO (share หลุด) เป็นข้อความที่ผู้ใช้ทำต่อได้
fn friendly_storage_error(error: String) -> String {
    let lower = error.to_lowercase();
    if lower.contains("unable to open database")
        || lower.contains("disk i/o error")
        || lower.contains("network path")
    {
        STORAGE_UNREACHABLE.into()
    } else {
        error
    }
}

struct ResolvedStorage {
    data_dir: std::path::PathBuf,
    previous: Option<std::path::PathBuf>,
    lock: crewnest_core::storage::InstanceLock,
    store: Store,
}

/// อ่าน pointer แล้วเปิด DB: ถ้า pointer ชี้ที่ที่หาไม่เจอ ให้ Err (ไม่สร้าง DB ใหม่เงียบ ๆ)
fn resolve_storage(
    local_dir: &std::path::Path,
    default_dir: std::path::PathBuf,
) -> Result<ResolvedStorage, String> {
    use crewnest_core::storage::{detect_mode, read_pointer, InstanceLock, DB_FILE};
    let (data_dir, previous) = match read_pointer(local_dir)? {
        Some(pointer) => {
            if !pointer.data_dir.is_dir() {
                return Err(format!(
                    "ไม่พบที่จัดเก็บ {} — {STORAGE_UNREACHABLE}",
                    pointer.data_dir.display()
                ));
            }
            if !pointer.data_dir.join(DB_FILE).exists() {
                return Err(format!(
                    "ไม่พบฐานข้อมูลที่ {}",
                    pointer.data_dir.display()
                ));
            }
            (pointer.data_dir, pointer.previous)
        }
        None => (default_dir, None),
    };
    let lock = InstanceLock::acquire(&data_dir)?;
    let store = Store::open_with(data_dir.join(DB_FILE), detect_mode(&data_dir))
        .map_err(friendly_storage_error)?;
    Ok(ResolvedStorage {
        data_dir,
        previous,
        lock,
        store,
    })
}

/// สถานะที่จัดเก็บ: manage เสมอ แม้ตอนเปิดไม่สำเร็จ (หน้ากู้คืนใช้)
struct StorageState {
    local_dir: std::path::PathBuf,
    data_dir: Option<std::path::PathBuf>,
    previous: Option<std::path::PathBuf>,
    error: Option<String>,
    _lock: Option<crewnest_core::storage::InstanceLock>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageStatus {
    status: &'static str,
    error: Option<String>,
    info: Option<crewnest_core::storage::Info>,
    previous: Option<String>,
}

#[tauri::command]
async fn storage_info(state: State<'_, StorageState>) -> Result<StorageStatus, String> {
    let info = state
        .data_dir
        .as_deref()
        .map(|dir| crewnest_core::storage::info(dir, state.previous.as_deref()))
        .transpose()
        .map_err(friendly_storage_error)?;
    Ok(StorageStatus {
        status: if state.error.is_some() { "error" } else { "ok" },
        error: state.error.clone(),
        info,
        previous: state
            .previous
            .as_ref()
            .map(|p| crewnest_core::adapters::plain_path(&p.to_string_lossy())),
    })
}

#[tauri::command]
async fn pick_storage_folder(
    app: tauri::AppHandle,
    approved: State<'_, ApprovedFolders>,
) -> Result<Option<String>, String> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Astra — choose a storage folder")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = selected else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    approved.approve(&path);
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// ย้ายที่จัดเก็บ (ปกติ) หรือชี้ไปที่ใหม่ (หน้ากู้คืน); สำเร็จแล้วแอปรีสตาร์ทเอง
#[tauri::command]
async fn change_storage_folder(
    app: tauri::AppHandle,
    state: State<'_, StorageState>,
    approved: State<'_, ApprovedFolders>,
    path: String,
    use_existing: bool,
) -> Result<(), String> {
    use crewnest_core::storage::{adopt, create_new, migrate, Target};
    let dest = approved.require(&path)?;
    let local = state.local_dir.clone();
    let current = state.data_dir.clone();
    if use_existing {
        adopt(&local, current.as_deref(), &dest)?;
        restart_soon(app);
        return Ok(());
    }
    if let (Some(core), Some(current)) = (app.try_state::<Core>(), current.as_deref()) {
        migrate(&core.store, &local, current, &dest, Target::Copy)?;
        restart_soon(app);
        return Ok(());
    }
    if dest.join(crewnest_core::storage::DB_FILE).exists() {
        return Err("EXISTING_DB".into());
    }
    let text = format!(
        "สร้างฐานข้อมูลใหม่ที่ {} ?\nข้อมูลเดิมจะไม่ถูกย้ายมา",
        dest.display()
    );
    let dialog_app = app.clone();
    let confirmed = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .message(text)
            .title("Astra — create new storage")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())?;
    if !confirmed {
        return Err("ยกเลิกแล้ว".into());
    }
    create_new(&local, current.as_deref(), &dest)?;
    restart_soon(app);
    Ok(())
}

/// รีสตาร์ทหลังตอบ IPC แล้ว: ปิดช่วงที่แอปยังเขียนลงฐานข้อมูลเดิมหลังสลับ pointer
fn restart_soon(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(800));
        app.restart();
    });
}

#[tauri::command]
async fn revert_storage(state: State<'_, StorageState>) -> Result<(), String> {
    crewnest_core::storage::revert(&state.local_dir)
}

#[tauri::command]
async fn delete_previous_storage(
    app: tauri::AppHandle,
    state: State<'_, StorageState>,
) -> Result<(), String> {
    let previous = state.previous.clone().ok_or("ไม่มีข้อมูลที่ตำแหน่งเดิม")?;
    let text = format!(
        "ลบไฟล์ฐานข้อมูลที่ {} ถาวร?\nลบแล้วกู้คืนไม่ได้ ไฟล์อื่นใน folder นั้นจะไม่ถูกลบ",
        previous.display()
    );
    let confirmed = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(text)
            .title("Astra — delete old storage")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())?;
    if !confirmed {
        return Err("ยกเลิกแล้ว".into());
    }
    crewnest_core::storage::delete_previous(&state.local_dir, state.data_dir.as_deref().ok_or("ที่จัดเก็บยังเปิดไม่ได้")?)
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // pointer อยู่ในโฟลเดอร์ default ในเครื่องเสมอ (dev แยกจาก production)
            let local = if cfg!(debug_assertions) {
                std::env::var_os("CREWNEST_DATA_DIR")
                    .map(std::path::PathBuf::from)
                    .unwrap_or(app.path().app_local_data_dir()?.join("development"))
            } else {
                app.path().app_local_data_dir()?
            };
            app.manage(ApprovedFolders::default());
            app.manage(RemoteService::default());
            let resolved = match resolve_storage(&local, local.clone()) {
                Ok(resolved) => resolved,
                Err(error) => {
                    // โหมดกู้คืน: ไม่เปิด Core/scheduler; UI แสดงหน้าเลือกที่จัดเก็บ
                    let previous = crewnest_core::storage::read_pointer(&local)
                        .ok()
                        .flatten()
                        .and_then(|p| p.previous);
                    app.manage(StorageState {
                        local_dir: local,
                        data_dir: None,
                        previous,
                        error: Some(error),
                        _lock: None,
                    });
                    return Ok(());
                }
            };
            app.manage(StorageState {
                local_dir: local,
                data_dir: Some(resolved.data_dir),
                previous: resolved.previous,
                error: None,
                _lock: Some(resolved.lock),
            });
            let store = resolved.store;
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
            pick_folder,
            inspect_folder,
            storage_info,
            pick_storage_folder,
            change_storage_folder,
            revert_storage,
            delete_previous_storage,
            restart_app,
            create_project,
            add_project_folder,
            remove_project_folder,
            set_primary_folder,
            start_run,
            execution_events,
            execution_result,
            cancel_run,
            create_task,
            create_workflow,
            create_writing_workflow,
            queue_action,
            queue_events,
            scheduling,
            writing_info,
            configure_writing,
            writing_action,
            project_overview,
            link_session
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
        let workspace = dir.path().join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        let project = core
            .store
            .register_project("IPC fixture", "", &workspace)
            .unwrap();
        let run = core
            .store
            .begin_run(
                &RunRequest {
                    task_id: None,
                    timeout_seconds: 30,
                    project_id: project.id.clone(),
                    agent_id: "astra".into(),
                    adapter: "mock".into(),
                    prompt: "fixture".into(),
                    approved: true,
                },
                "mock",
            )
            .unwrap();
        core.store
            .event(&run.id, "artifact", "ข้อความทดสอบ")
            .unwrap();
        core.store.finish(&run.id, "completed", None).unwrap();
        let app = tauri::test::mock_builder()
            .manage(core)
            .manage(RemoteService::default())
            .invoke_handler(tauri::generate_handler![
                snapshot,
                execution_events,
                execution_result,
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
        let result = invoke(
            "execution_result",
            serde_json::json!({"executionId":run.id,"projectId":project.id}),
        )
        .unwrap()
        .deserialize::<serde_json::Value>()
        .unwrap();
        assert_eq!(result["executionId"], run.id);
        assert_eq!(result["projectId"], project.id);
        assert_eq!(result["adapter"], "mock");
        assert_eq!(result["event"]["text"], "ข้อความทดสอบ");
        assert!(result.get("prompt").is_none());
        assert!(invoke(
            "execution_result",
            serde_json::json!({"executionId":run.id,"projectId":"other-project"}),
        )
        .is_err());
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

    #[test]
    fn create_project_with_two_folders() {
        let dir = tempfile::tempdir().unwrap();
        let core = Core::new(
            Store::open(dir.path().join("ipc.db")).unwrap(),
            Arc::new(|_| {}),
        )
        .unwrap();
        let (a, b, c) = (dir.path().join("a"), dir.path().join("b"), dir.path().join("c"));
        for d in [&a, &b, &c] {
            std::fs::create_dir(d).unwrap();
        }
        std::fs::create_dir(b.join(".git")).unwrap();
        let unapproved = dir.path().join("d");
        std::fs::create_dir(&unapproved).unwrap();
        let approved = ApprovedFolders::default();
        for d in [&a, &b, &c] {
            approved.approve(d);
        }
        let app = tauri::test::mock_builder()
            .manage(core)
            .manage(approved)
            .invoke_handler(tauri::generate_handler![
                inspect_folder,
                create_project,
                add_project_folder,
                remove_project_folder,
                set_primary_folder
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
            .map(|r| r.deserialize::<serde_json::Value>().unwrap())
        };
        let inspected = invoke("inspect_folder", serde_json::json!({"path": b, "projectId": null})).unwrap();
        assert_eq!(inspected["isGit"], true);
        let project = invoke(
            "create_project",
            serde_json::json!({"name":"Multi","goal":"","folders":[a, b],"primary":1}),
        )
        .unwrap();
        assert_eq!(project["folders"].as_array().unwrap().len(), 2);
        assert_eq!(project["folders"][1]["isPrimary"], true);
        assert_eq!(project["isGit"], true);
        let id = project["id"].as_str().unwrap();
        assert!(invoke("inspect_folder", serde_json::json!({"path": b.join("sub"), "projectId": id})).is_err());
        let added = invoke("add_project_folder", serde_json::json!({"projectId": id, "path": c})).unwrap();
        assert_eq!(added["folders"].as_array().unwrap().len(), 3);
        let first = added["folders"][0]["id"].as_str().unwrap();
        let switched = invoke("set_primary_folder", serde_json::json!({"projectId": id, "folderId": first})).unwrap();
        assert_eq!(switched["path"], added["folders"][0]["path"]);
        let third = added["folders"][2]["id"].as_str().unwrap();
        let removed = invoke("remove_project_folder", serde_json::json!({"projectId": id, "folderId": third})).unwrap();
        assert_eq!(removed["folders"].as_array().unwrap().len(), 2);
        assert!(invoke("add_project_folder", serde_json::json!({"projectId": id, "path": unapproved})).is_err());
        assert!(invoke("create_project", serde_json::json!({"name":"X","goal":"","folders":[unapproved],"primary":0})).is_err());
        assert!(invoke("create_project", serde_json::json!({"name":"Dup","goal":"","folders":[a],"primary":0})).is_err());
    }

    #[test]
    fn resolve_storage_defaults_without_pointer() {
        let dir = tempfile::tempdir().unwrap();
        let default = dir.path().join("default");
        let resolved = resolve_storage(&dir.path().join("local"), default.clone()).unwrap();
        assert_eq!(resolved.data_dir, default);
        assert!(default.join("crewnest.db").exists());
        assert_eq!(resolved.previous, None);
    }

    #[test]
    fn resolve_storage_errors_when_pointer_target_missing() {
        let dir = tempfile::tempdir().unwrap();
        let local = dir.path().join("local");
        let share = dir.path().join("share");
        std::fs::create_dir(&share).unwrap();
        crewnest_core::storage::write_pointer(
            &local,
            &crewnest_core::storage::Pointer {
                data_dir: share.clone(),
                previous: None,
            },
        )
        .unwrap();
        let err = resolve_storage(&local, dir.path().join("default")).err().unwrap();
        assert!(err.contains("ไม่พบฐานข้อมูล"));
        assert!(!share.join("crewnest.db").exists());
        std::fs::remove_dir(&share).unwrap();
        assert!(resolve_storage(&local, dir.path().join("default")).is_err());
        assert!(!dir.path().join("default").exists());
    }

    #[test]
    fn resolve_storage_uses_pointer_and_locks() {
        let dir = tempfile::tempdir().unwrap();
        let local = dir.path().join("local");
        let share = dir.path().join("share");
        drop(Store::open(share.join("crewnest.db")).unwrap());
        crewnest_core::storage::write_pointer(
            &local,
            &crewnest_core::storage::Pointer {
                data_dir: share.clone(),
                previous: Some(dir.path().join("old")),
            },
        )
        .unwrap();
        let first = resolve_storage(&local, dir.path().join("default")).unwrap();
        assert_eq!(first.data_dir, share);
        assert_eq!(first.previous, Some(dir.path().join("old")));
        let second = resolve_storage(&local, dir.path().join("default")).err().unwrap();
        assert!(second.contains("กำลังถูกใช้"));
    }

    #[test]
    fn storage_io_errors_get_a_friendly_message() {
        assert_eq!(
            friendly_storage_error("unable to open database file".into()),
            STORAGE_UNREACHABLE
        );
        assert_eq!(friendly_storage_error("disk I/O error".into()), STORAGE_UNREACHABLE);
        assert_eq!(friendly_storage_error("Unknown project".into()), "Unknown project");
    }

    #[test]
    fn resolved_storage_can_start_core() {
        let dir = tempfile::tempdir().unwrap();
        let resolved = resolve_storage(&dir.path().join("local"), dir.path().join("default")).unwrap();
        assert!(Core::new(resolved.store, Arc::new(|_| {})).is_ok());
    }

    #[test]
    fn approval_folders_note_lists_secondary_folders() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a"), dir.path().join("b"));
        std::fs::create_dir(&a).unwrap();
        std::fs::create_dir(&b).unwrap();
        let store = Store::open(dir.path().join("x.db")).unwrap();
        let project = store.register_project_folders("P", "", &[a, b], 0).unwrap();
        let secondary = crewnest_core::adapters::plain_path(&project.folders[1].path);
        let claude = approval_folders_note(&project, "claude");
        assert!(claude.contains(&secondary));
        assert!(!claude.contains("antigravity"));
        assert!(approval_folders_note(&project, "antigravity").contains("primary folder only"));
    }
}
