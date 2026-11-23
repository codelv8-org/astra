use crate::{execution_prompt, models::*, redact, store::Store, Result};
use rusqlite::params;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::{Child, Command},
    sync::{mpsc, watch},
};

type EventSink = Arc<dyn Fn(ExecutionEvent) + Send + Sync>;

// เว้นระยะระหว่าง mock steps เพื่อให้ผู้ใช้ตรวจ logs และยกเลิกผ่าน UI ได้จริง
const MOCK_STEP_DELAY: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub struct Core {
    pub store: Store,
    active: Arc<Mutex<HashMap<String, watch::Sender<bool>>>>,
    sink: EventSink,
    timeout: Duration,
    _instance_lock: Arc<std::fs::File>,
}

impl Core {
    pub fn new(store: Store, sink: EventSink) -> Result<Self> {
        let lock = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(store.path.with_extension("lock"))
            .map_err(|e| e.to_string())?;
        fs2::FileExt::try_lock_exclusive(&lock)
            .map_err(|_| "This Desktop database is already open in another CrewNest process")?;
        store.recover_interrupted()?;
        Ok(Self {
            store,
            active: Default::default(),
            sink,
            timeout: Duration::from_secs(120),
            _instance_lock: Arc::new(lock),
        })
    }

    fn emit(&self, id: &str, kind: &str, text: &str) -> Result<()> {
        let event = self.store.event(id, kind, text)?;
        (self.sink)(event);
        Ok(())
    }

    pub async fn diagnostics(&self) -> Vec<Diagnostic> {
        let mut result = vec![Diagnostic {
            adapter: "mock".into(),
            installed: true,
            version: Some("1.0".into()),
            authentication: "not_required".into(),
            executable: None,
            supported: true,
            message: "MOCK — deterministic test adapter; no AI execution".into(),
        }];
        for (adapter, binary) in [
            ("codex", "codex"),
            ("claude", "claude"),
            ("antigravity", "agy"),
        ] {
            let path = detect(binary);
            let mut diagnostic = Diagnostic {
                adapter: adapter.into(),
                installed: path.is_some(),
                version: None,
                authentication: "unknown".into(),
                executable: path.as_ref().map(|p| p.to_string_lossy().into()),
                supported: true,
                message: "Missing CLI; installation and login are managed by the user".into(),
            };
            if let Some(path) = path {
                match probe(&path, &["--version"]).await {
                    Ok((true, output)) => {
                        diagnostic.version = Some(output.chars().take(200).collect())
                    }
                    _ => {
                        diagnostic.message =
                            "CLI found but version probe failed or timed out".into()
                    }
                }
                diagnostic.authentication = match adapter {
                    "codex" => match probe(&path, &["login", "status"]).await {
                        Ok((true, _)) => "authenticated".into(),
                        Ok((false, output)) if output.to_lowercase().contains("not logged in") => {
                            "unauthenticated".into()
                        }
                        _ => "unknown".into(),
                    },
                    "claude" => match probe(&path, &["auth", "status", "--json"]).await {
                        Ok((_, output)) => match serde_json::from_str::<serde_json::Value>(&output)
                            .ok()
                            .and_then(|v| v["loggedIn"].as_bool())
                        {
                            Some(true) => "authenticated".into(),
                            Some(false) => "unauthenticated".into(),
                            None => "unknown".into(),
                        },
                        _ => "unknown".into(),
                    },
                    // agy ไม่มีคำสั่งตรวจ login จึงยืนยันจากรันที่จบล่าสุดว่าสำเร็จหรือไม่
                    "antigravity" => match self.store.runtime_confirmed_at(adapter) {
                        Ok(Some(_)) => "authenticated".into(),
                        _ => "unknown".into(),
                    },
                    _ => "unknown".into(),
                };
                match fingerprint(&path).and_then(|hash| {
                    self.store.connect()?.execute("INSERT INTO runtime_configs VALUES(?1,?2,?3) ON CONFLICT(adapter) DO UPDATE SET executable=excluded.executable,sha256=excluded.sha256",params![adapter,path.to_string_lossy(),hash]).map_err(|e|e.to_string())?; Ok(())
                }) {
                    Ok(()) => {
                        diagnostic.message = match (adapter, self.store.runtime_confirmed_at(adapter)) {
                            ("antigravity", Ok(Some(at))) => format!("Read-only/plan adapter; explicit task approval required. Antigravity authentication confirmed by the last successful run at {at}."),
                            _ => "Read-only/plan adapter; explicit task approval required. Antigravity authentication is confirmed only by actual execution.".into(),
                        }
                    }
                    Err(error) => {
                        diagnostic.supported = false;
                        diagnostic.message = error;
                    }
                }
            }
            result.push(diagnostic);
        }
        result
    }

    pub fn approved_codex(&self) -> Result<PathBuf> {
        self.approved_runtime("codex")
    }

    pub fn approved_runtime(&self, adapter: &str) -> Result<PathBuf> {
        let (path, hash): (String, String) = self
            .store
            .connect()?
            .query_row(
                "SELECT executable,sha256 FROM runtime_configs WHERE adapter=?1",
                [adapter],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| "Run CLI diagnostics before using Codex")?;
        let path = PathBuf::from(path);
        if fingerprint(&path)? != hash {
            return Err(
                "Runtime binary changed; refresh diagnostics and review executable before approval"
                    .into(),
            );
        }
        Ok(path)
    }

    pub async fn start(&self, request: RunRequest) -> Result<Execution> {
        let agent = self.store.agent(&request.agent_id)?;
        let effective_prompt = execution_prompt(&agent, &request.prompt);
        let binary = if request.adapter != "mock" {
            Some(self.approved_runtime(&request.adapter)?)
        } else {
            None
        };
        if request.adapter == "codex" {
            match probe(
                binary.as_ref().ok_or("Missing Codex executable")?,
                &["login", "status"],
            )
            .await
            {
                Ok((true, _)) => (),
                _ => {
                    return Err(
                        "Codex authentication could not be confirmed; use the CLI to log in".into(),
                    )
                }
            }
        }
        let run = self.store.begin_run(
            &request,
            &binary
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|| "mock".into()),
        )?;
        let (sender, receiver) = watch::channel(false);
        self.active
            .lock()
            .map_err(|_| "Execution state unavailable")?
            .insert(run.id.clone(), sender);
        let core = self.clone();
        let id = run.id.clone();
        tokio::spawn(async move {
            let started = core.emit(
                &id,
                "started",
                if request.adapter == "mock" {
                    "MOCK execution started — no AI model is used"
                } else {
                    "Runtime execution started in read-only/plan mode"
                },
            );
            let outcome = if let Err(error) = started {
                Err(format!("Cannot persist execution log: {error}"))
            } else if let Some(binary) = binary {
                let mut effective_request = request.clone();
                effective_request.prompt = effective_prompt;
                core.run_codex(&id, &effective_request, &binary, receiver)
                    .await
            } else {
                if request.task_id.is_some() {
                    tokio::time::timeout(
                        Duration::from_secs(request.timeout_seconds),
                        core.run_mock(&id, receiver),
                    )
                    .await
                    .unwrap_or_else(|_| Err("Execution timed out".into()))
                } else {
                    core.run_mock(&id, receiver).await
                }
            };
            let (status, error) = match outcome {
                Ok(()) => ("completed", None),
                Err(error) if error == "Canceled by owner" => ("canceled", Some(error)),
                Err(error) => ("failed", Some(error)),
            };
            if let Err(storage_error) = core.store.finish(&id, status, error.as_deref()) {
                let _ = core.emit(&id, "storage_error", &storage_error);
            }
            let _ = core.emit(
                &id,
                status,
                error.as_deref().unwrap_or("Execution completed"),
            );
            let _ = core.store.reconcile_queue();
            if let Ok(mut active) = core.active.lock() {
                active.remove(&id);
            }
        });
        Ok(run)
    }

    pub fn cancel(&self, id: &str) -> Result<()> {
        let active = self
            .active
            .lock()
            .map_err(|_| "Execution state unavailable")?;
        let sender = active.get(id).ok_or("Execution is no longer active")?;
        sender.send(true).map_err(|_| "Execution already stopped")?;
        self.store.audit("cancellation_requested", id)
    }

    async fn run_mock(&self, id: &str, mut cancel: watch::Receiver<bool>) -> Result<()> {
        for step in [
            "MOCK: validate approved workspace",
            "MOCK: simulate planning",
            "MOCK: generate deterministic test result",
        ] {
            tokio::select! {
                _=cancel.changed()=>return Err("Canceled by owner".into()),
                _=tokio::time::sleep(MOCK_STEP_DELAY)=>self.emit(id,"mock",step)?,
            }
        }
        self.emit(id,"artifact","MOCK handoff artifact — deterministic test output, no real AI implementation or review")?;
        Ok(())
    }

    async fn run_codex(
        &self,
        id: &str,
        request: &RunRequest,
        binary: &Path,
        mut cancel: watch::Receiver<bool>,
    ) -> Result<()> {
        let project = self.store.project(&request.project_id)?;
        let writing = request
            .task_id
            .as_deref()
            .map(|id| self.store.writing_policy(id))
            .transpose()?
            .flatten()
            .is_some();
        let mut command = command(binary);
        command
            .args(if writing {
                crate::adapters::writing_arguments()
            } else {
                crate::adapters::arguments(&request.adapter)
            })
            .args(if writing {
                Vec::new()
            } else {
                crate::adapters::extra_dir_args(&request.adapter, &project)
            })
            .current_dir(&project.path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        // งาน writing ไม่บอก folder รอง: patch จำกัดใน primary
        let prompt = match crate::adapters::folders_context(&project).filter(|_| !writing) {
            Some(context) => format!("{context}

{}", request.prompt),
            None => request.prompt.clone(),
        };
        if request.adapter == "antigravity" {
            command.arg(&prompt);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Cannot start runtime: {e}"))?;
        let tree = ProcessTree::attach(&mut child)?;
        self.store
            .connect()?
            .execute(
                "UPDATE executions SET pid=?1 WHERE id=?2",
                params![child.id(), id],
            )
            .map_err(|e| e.to_string())?;
        if let Some(mut input) = child.stdin.take() {
            if request.adapter != "antigravity" {
                input
                    .write_all(crate::adapters::input(&request.adapter, &prompt).as_bytes())
                    .await
                    .map_err(|e| format!("Cannot send prompt: {e}"))?;
            }
            drop(input);
        }
        let stdout = child.stdout.take().ok_or("Missing stdout")?;
        let stderr = child.stderr.take().ok_or("Missing stderr")?;
        let (sender, mut lines) = mpsc::channel(64);
        let output_task = tokio::spawn(read_lines(stdout, "stdout", sender.clone()));
        let error_task = tokio::spawn(read_lines(stderr, "stderr", sender.clone()));
        drop(sender);
        let deadline = tokio::time::sleep(if request.task_id.is_some() {
            Duration::from_secs(request.timeout_seconds)
        } else {
            self.timeout
        });
        tokio::pin!(deadline);
        let mut saw_completed = false;
        let mut artifact = None;
        let mut runtime_error = None;
        let mut bytes = 0usize;
        let mut stop_reason = None;
        loop {
            tokio::select! {
                _=cancel.changed()=>{stop_reason=Some("Canceled by owner".to_string());break;},
                _=&mut deadline=>{stop_reason=Some("Execution timed out".to_string());break;},
                line=lines.recv()=>match line {
                    Some((kind,line))=>{
                        bytes+=line.len();
                        if bytes>2_000_000 {stop_reason=Some("Execution log limit exceeded".into());break;}
                        if kind=="reader_error" {stop_reason=Some(line);break;}
                        if kind=="stderr" && line.to_lowercase().contains("denied") {runtime_error=Some("Runtime reported a permission denial; review logs".into());}
                        if kind=="stdout" {
                            if let Ok(value)=serde_json::from_str::<serde_json::Value>(&line) {
                                let parsed=crate::adapters::parse(&request.adapter,&value);
                                if parsed.completed{saw_completed=true;}
                                if let Some(error)=parsed.error{runtime_error=Some(error);}
                                if let Some(session)=parsed.session{self.store.connect()?.execute("UPDATE executions SET session_id=?1 WHERE id=?2",params![session,id]).map_err(|e|e.to_string())?;}
                                if let Some(text)=parsed.text{self.emit(id,"artifact",&text)?;artifact=Some(text);}
                                if let Some(usage)=parsed.usage{self.emit(id,"usage",&usage.to_string())?;}

                            }
                        }
                        self.emit(id,kind,&line)?;
                    },
                    None=>break,
                }
            }
        }
        if stop_reason.is_some() {
            tree.terminate();
            let _ = child.kill().await;
        }
        let exit = tokio::time::timeout(Duration::from_secs(5), child.wait()).await;
        output_task.abort();
        error_task.abort();
        if let Some(reason) = stop_reason {
            return Err(reason);
        }
        let status = exit
            .map_err(|_| "Runtime did not exit after closing output")?
            .map_err(|e| e.to_string())?;
        if let Some(error) = runtime_error {
            return Err(redact(&error));
        }
        if !status.success() {
            return Err(format!(
                "Runtime exited with {status}; inspect sanitized execution logs"
            ));
        }
        if !saw_completed {
            return Err("Runtime exited without a structured turn.completed event".into());
        }
        if writing {
            self.store.stage_patch(
                request.task_id.as_deref().ok_or("Missing writing task")?,
                id,
                artifact
                    .as_deref()
                    .ok_or("Missing FORGE writing manifest")?,
            )?;
        }
        Ok(())
    }
}

pub fn codex_arguments() -> Vec<&'static str> {
    vec![
        "exec",
        "--json",
        "--sandbox",
        "read-only",
        "--ignore-user-config",
        "--ephemeral",
        "--skip-git-repo-check",
        "--color",
        "never",
        "-",
    ]
}

fn command(binary: &Path) -> Command {
    let mut command = Command::new(binary);
    // ส่งเฉพาะ environment ที่ runtime และระบบจำเป็นต้องใช้ ไม่ส่ง secrets ของแอปอื่นทั้งหมด
    command.env_clear();
    for key in [
        "PATH",
        "PATHEXT",
        "SystemRoot",
        "WINDIR",
        "COMSPEC",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "HOMEDRIVE",
        "HOMEPATH",
        "HOME",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "PROGRAMDATA",
        "CODEX_HOME",
        "OPENAI_API_KEY",
        "CODEX_ACCESS_TOKEN",
        "OPENAI_BASE_URL",
        "ANTHROPIC_API_KEY",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command
}

pub fn detect(name: &str) -> Option<PathBuf> {
    let filename = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    };
    std::env::split_paths(&std::env::var_os("PATH")?)
        .filter(|p| p.is_absolute())
        .map(|p| p.join(&filename))
        .find(|p| p.is_file())
        .and_then(|p| p.canonicalize().ok())
}

fn fingerprint(path: &Path) -> Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|_| "Runtime executable is unavailable")?;
    let mut hash = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

async fn probe(binary: &Path, args: &[&str]) -> Result<(bool, String)> {
    let mut cmd = command(binary);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let _tree = ProcessTree::attach(&mut child)?;
    let stdout = child.stdout.take().ok_or("Missing probe stdout")?;
    let stderr = child.stderr.take().ok_or("Missing probe stderr")?;
    let read = async move {
        let out = async move {
            let mut bytes = Vec::new();
            stdout.take(8192).read_to_end(&mut bytes).await?;
            Ok::<_, std::io::Error>(bytes)
        };
        let err = async move {
            let mut bytes = Vec::new();
            stderr.take(8192).read_to_end(&mut bytes).await?;
            Ok::<_, std::io::Error>(bytes)
        };
        tokio::try_join!(out, err, child.wait())
    };
    let (stdout, stderr, status) = tokio::time::timeout(Duration::from_secs(8), read)
        .await
        .map_err(|_| "CLI probe timed out")?
        .map_err(|e| e.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&stdout),
        String::from_utf8_lossy(&stderr)
    );
    Ok((status.success(), redact(text.trim())))
}

async fn read_lines(
    mut stream: impl AsyncRead + Unpin,
    kind: &'static str,
    sender: mpsc::Sender<(&'static str, String)>,
) {
    let mut chunk = [0u8; 4096];
    let mut line = Vec::new();
    loop {
        match stream.read(&mut chunk).await {
            Ok(0) => {
                if !line.is_empty() {
                    let _ = sender
                        .send((kind, String::from_utf8_lossy(&line).into()))
                        .await;
                }
                break;
            }
            Ok(n) => {
                for byte in &chunk[..n] {
                    if *byte == b'\n' {
                        if sender
                            .send((kind, String::from_utf8_lossy(&line).into()))
                            .await
                            .is_err()
                        {
                            return;
                        }
                        line.clear();
                    } else {
                        line.push(*byte);
                        if line.len() > 32768 {
                            let _ = sender
                                .send(("reader_error", "Runtime emitted an oversized event".into()))
                                .await;
                            return;
                        }
                    }
                }
            }
            Err(_) => {
                let _ = sender
                    .send(("reader_error", "Cannot read runtime output".into()))
                    .await;
                break;
            }
        }
    }
}

#[cfg(windows)]
struct ProcessTree(isize);
#[cfg(windows)]
impl ProcessTree {
    fn attach(child: &mut Child) -> Result<Self> {
        use windows_sys::Win32::{
            Foundation::CloseHandle,
            System::{JobObjects::*, Threading::*},
        };
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err("Cannot create execution job object".into());
            }
            let tree = Self(job as isize);
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of_val(&info) as u32,
            ) == 0
            {
                return Err("Cannot constrain process job".into());
            }
            let handle = OpenProcess(
                PROCESS_SET_QUOTA | PROCESS_TERMINATE,
                0,
                child.id().ok_or("Missing process ID")?,
            );
            if handle.is_null() {
                return Err("Cannot open runtime process".into());
            }
            let assigned = AssignProcessToJobObject(job, handle);
            CloseHandle(handle);
            if assigned == 0 {
                return Err("Cannot assign runtime to execution job".into());
            }
            Ok(tree)
        }
    }
    fn terminate(&self) {
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0 as _, 1);
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as _);
        }
    }
}
#[cfg(not(windows))]
struct ProcessTree;
#[cfg(not(windows))]
impl ProcessTree {
    fn attach(_: &mut Child) -> Result<Self> {
        Ok(Self)
    }
    fn terminate(&self) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::OnceLock;

    fn fixture() -> PathBuf {
        static DIR: OnceLock<tempfile::TempDir> = OnceLock::new();
        let dir = DIR.get_or_init(|| {
            let dir = tempfile::tempdir().unwrap();
            let source =
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/runtime.rs");
            let output = dir.path().join(if cfg!(windows) {
                "fixture.exe"
            } else {
                "fixture"
            });
            let status = std::process::Command::new("rustc")
                .args(["--edition=2021"])
                .arg(source)
                .arg("-o")
                .arg(output)
                .status()
                .unwrap();
            assert!(status.success());
            dir
        });
        dir.path().join(if cfg!(windows) {
            "fixture.exe"
        } else {
            "fixture"
        })
    }

    async fn execute(
        prompt: &str,
        timeout: Duration,
        cancel_after: Option<Duration>,
    ) -> (Result<()>, Vec<ExecutionEvent>) {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path().join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        let store = Store::open(dir.path().join("test.db")).unwrap();
        let project = store.register_project("Fixture", "", &workspace).unwrap();
        let mut core = Core::new(store.clone(), Arc::new(|_| {})).unwrap();
        core.timeout = timeout;
        let request = RunRequest {
            project_id: project.id,
            agent_id: "astra".into(),
            adapter: "mock".into(),
            prompt: prompt.into(),
            approved: true,
            task_id: None,
            timeout_seconds: 120,
        };
        let run = store.begin_run(&request, "fixture-only").unwrap();
        let (sender, receiver) = watch::channel(false);
        if let Some(delay) = cancel_after {
            let trigger = sender.clone();
            tokio::spawn(async move {
                tokio::time::sleep(delay).await;
                let _ = trigger.send(true);
            });
        }
        let result = core
            .run_codex(&run.id, &request, &fixture(), receiver)
            .await;
        drop(sender);
        (result, store.events(&run.id, 0).unwrap())
    }

    #[tokio::test]
    async fn genuine_child_process_success_and_structured_result() {
        let (result, events) = execute("success", Duration::from_secs(5), None).await;
        assert!(result.is_ok(), "{result:?}");
        assert!(events.iter().any(|e| e.text.contains("FIXTURE_ONLY")));
    }
    #[tokio::test]
    async fn fixture_writer_process_stages_without_writing_until_approval() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path().join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        let store = Store::open(dir.path().join("fixture.db")).unwrap();
        let core = Core::new(store.clone(), Arc::new(|_| {})).unwrap();
        let project = store
            .register_project("WRITER PROCESS FIXTURE", "no AI model", &workspace)
            .unwrap();
        let task = store
            .create_task(TaskInput {
                project_id: project.id.clone(),
                agent_id: "forge".into(),
                adapter: "claude".into(),
                title: "FIXTURE ONLY".into(),
                prompt: "writer".into(),
                dependencies: vec![],
                priority: 50,
                timeout_seconds: 30,
                retry_limit: 0,
            }, &crate::models::Initiator::Owner)
            .unwrap();
        store
            .configure_writing(&task.id, vec!["example.mjs".into()])
            .unwrap();
        store.approve_task(&task.id).unwrap();
        let mut request = RunRequest {
            task_id: Some(task.id.clone()),
            timeout_seconds: 30,
            project_id: project.id,
            agent_id: "forge".into(),
            adapter: "claude".into(),
            prompt: store.task_prompt(&task).unwrap(),
            approved: true,
        };
        let run = store.begin_run(&request, "WRITER FIXTURE ONLY").unwrap();
        request.prompt = "writer".into();
        let (_sender, receiver) = watch::channel(false);
        core.run_codex(&run.id, &request, &fixture(), receiver)
            .await
            .unwrap();
        store.finish(&run.id, "completed", None).unwrap();
        store.reconcile_queue().unwrap();
        assert!(!workspace.join("example.mjs").exists());
        assert_eq!(store.task(&task.id).unwrap().status, "needs_review");
        store
            .apply_patch(&task.id, &store.patch_digest(&task.id).unwrap())
            .unwrap();
        assert!(std::fs::read_to_string(workspace.join("example.mjs"))
            .unwrap()
            .contains("fixture = true"));
    }
    #[tokio::test]
    async fn process_error_is_not_fabricated_as_success() {
        let (result, events) = execute("error", Duration::from_secs(5), None).await;
        assert!(result.unwrap_err().contains("Fixture failed"));
        assert!(!events.iter().any(|e| e.text.contains("fixture-secret")));
    }
    #[tokio::test]
    async fn successful_exit_without_completion_is_failure() {
        let (result, _) = execute("malformed", Duration::from_secs(5), None).await;
        assert!(result.unwrap_err().contains("without a structured"));
    }
    #[tokio::test]
    async fn oversized_output_is_bounded() {
        let (result, _) = execute("large", Duration::from_secs(5), None).await;
        assert!(result.unwrap_err().contains("oversized"));
    }
    #[tokio::test]
    async fn timeout_terminates_process_tree() {
        let (result, events) = execute("sleep", Duration::from_millis(350), None).await;
        assert!(result.unwrap_err().contains("timed out"));
        assert_child_stopped(&events).await;
    }
    #[tokio::test]
    async fn cancellation_terminates_process_tree() {
        let (result, events) = execute(
            "sleep",
            Duration::from_secs(5),
            Some(Duration::from_millis(350)),
        )
        .await;
        assert_eq!(result.unwrap_err(), "Canceled by owner");
        assert_child_stopped(&events).await;
    }
    async fn assert_child_stopped(events: &[ExecutionEvent]) {
        let pid = events
            .iter()
            .filter_map(|e| serde_json::from_str::<serde_json::Value>(&e.text).ok())
            .find_map(|v| v["pid"].as_u64())
            .expect("fixture emitted child pid");
        tokio::time::sleep(Duration::from_millis(100)).await;
        #[cfg(windows)]
        unsafe {
            use windows_sys::Win32::{Foundation::CloseHandle, System::Threading::*};
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid as u32);
            if !handle.is_null() {
                let mut code = 0;
                assert_ne!(GetExitCodeProcess(handle, &mut code), 0);
                CloseHandle(handle);
                assert_ne!(code, 259, "child must not remain active");
            }
        }
        #[cfg(not(windows))]
        let _ = pid;
    }
}
