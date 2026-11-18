use crate::{models::TaskInput, redact, Core, Result};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio_tungstenite::{
    tungstenite::{client::IntoClientRequest, Message},
    Connector,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteConfig {
    pub server: String,
    pub device_id: String,
    pub owner_id: String,
    pub ca_pem: Option<String>,
}
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    pub connection: String,
    pub device_id: Option<String>,
    pub server: Option<String>,
    pub shared: Vec<Value>,
}
#[derive(Clone, Default)]
pub struct RemoteService {
    pub status: Arc<parking_lot::Mutex<String>>,
    pub stop: Arc<AtomicBool>,
    pub running: Arc<AtomicBool>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub command_id: String,
    pub device_id: String,
    pub project_id: String,
    pub task_id: String,
    pub action: String,
    pub requested_by: String,
    pub issued_at: String,
    pub expires_at: String,
    pub idempotency_key: String,
    pub authorization_context: Authorization,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Submission>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Authorization {
    pub approval_id: Option<String>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Submission {
    pub agent_id: String,
    pub adapter: String,
    pub title: String,
    pub prompt: String,
}

pub fn server_url(server: &str) -> Result<reqwest::Url> {
    let u = reqwest::Url::parse(server).map_err(|_| "Invalid HTTPS server")?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
    {
        return Err("Server must be an HTTPS origin without path or credentials".into());
    }
    Ok(u)
}
fn client(ca: Option<&str>) -> Result<reqwest::Client> {
    let mut b = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none());
    if let Some(pem) = ca {
        b = b.add_root_certificate(
            reqwest::Certificate::from_pem(pem.as_bytes())
                .map_err(|_| "Invalid trusted CA certificate")?,
        );
    }
    b.build().map_err(|e| e.to_string())
}
pub async fn pair(
    server: &str,
    code: &str,
    name: &str,
    ca: Option<String>,
) -> Result<(RemoteConfig, String)> {
    server_url(server)?;
    let r = client(ca.as_deref())?
        .post(format!("{}/api/device/pair", server.trim_end_matches('/')))
        .json(&json!({"code":code,"name":name}))
        .send()
        .await
        .map_err(|_| "Cannot reach trusted HTTPS API")?;
    if !r.status().is_success() {
        return Err(format!("Pairing rejected: {}", r.status()));
    }
    let v: Value = r.json().await.map_err(|_| "Invalid pairing response")?;
    let field = |key: &str| {
        v[key]
            .as_str()
            .ok_or_else(|| "Invalid pairing response".to_string())
            .map(str::to_string)
    };
    let device_id = field("deviceId")?;
    let owner_id = field("ownerId")?;
    uuid::Uuid::parse_str(&device_id).map_err(|_| "Invalid device ID")?;
    uuid::Uuid::parse_str(&owner_id).map_err(|_| "Invalid owner ID")?;
    let token = field("token")?;
    if token.len() < 40 || token.len() > 100 {
        return Err("Invalid credential".into());
    }
    Ok((
        RemoteConfig {
            server: server.trim_end_matches('/').into(),
            device_id,
            owner_id,
            ca_pem: ca,
        },
        token,
    ))
}
pub fn credential(config: &RemoteConfig) -> Result<keyring::Entry> {
    keyring::Entry::new("CrewNest.Remote", &config.device_id).map_err(|e| e.to_string())
}

impl Core {
    pub fn remote_config(&self) -> Result<Option<RemoteConfig>> {
        let s: Option<String> = self
            .store
            .connect()?
            .query_row("SELECT record FROM remote_settings WHERE id=1", [], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        s.map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
            .transpose()
    }
    pub fn save_remote_config(&self, c: &RemoteConfig) -> Result<()> {
        server_url(&c.server)?;
        self.store.connect()?.execute("INSERT INTO remote_settings VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET record=excluded.record",[serde_json::to_string(c).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        self.store.audit("remote_paired", &c.device_id)
    }
    pub fn share_remote_project(&self, id: &str, enabled: bool, logs: bool) -> Result<()> {
        self.store.project(id)?;
        let db = self.store.connect()?;
        if enabled {
            db.execute("INSERT INTO remote_projects VALUES(?1,?2) ON CONFLICT(project_id) DO UPDATE SET share_logs=excluded.share_logs",params![id,logs]).map_err(|e|e.to_string())?;
        } else {
            db.execute("DELETE FROM remote_projects WHERE project_id=?1", [id])
                .map_err(|e| e.to_string())?;
        }
        self.store.audit("remote_sharing_changed", id)
    }
    pub fn remote_shared(&self) -> Result<Vec<Value>> {
        let db = self.store.connect()?;
        let mut s = db
            .prepare("SELECT project_id,share_logs FROM remote_projects")
            .map_err(|e| e.to_string())?;
        let rows = s
            .query_map([], |r| {
                Ok(json!({"projectId":r.get::<_,String>(0)?,"logs":r.get::<_,bool>(1)?}))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<_, _>>()
            .map_err(|e| e.to_string())
    }
    fn published_id(&self, local: &str) -> String {
        self.store
            .connect()
            .ok()
            .and_then(|db| {
                db.query_row(
                    "SELECT remote_id FROM remote_tasks WHERE local_id=?1",
                    [local],
                    |r| r.get(0),
                )
                .optional()
                .ok()
                .flatten()
            })
            .unwrap_or_else(|| local.into())
    }
    fn local_remote_id(&self, remote: &str) -> Result<String> {
        Ok(self
            .store
            .connect()?
            .query_row(
                "SELECT local_id FROM remote_tasks WHERE remote_id=?1",
                [remote],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| remote.into()))
    }
    pub fn remote_snapshot(&self) -> Result<Value> {
        let snap = self.store.snapshot()?;
        let shared = self.remote_shared()?;
        let allowed = |id: &str| shared.iter().any(|p| p["projectId"] == id);
        let safe = |s: &str| self.remote_safe(s);
        Ok(
            json!({"projects":snap.projects.iter().filter(|p|allowed(&p.id)).take(100).map(|p|json!({"id":p.id,"name":safe(&p.name)})).collect::<Vec<_>>(),
   "tasks":snap.tasks.iter().filter(|t|allowed(&t.project_id)).rev().take(50).map(|t|json!({"id":self.published_id(&t.id),"projectId":t.project_id,"agentId":t.agent_id,"adapter":t.adapter,"title":safe(&t.title).chars().take(100).collect::<String>(),"status":t.status,"approved":t.approved,"gate":t.gate,"attempts":t.attempts,"lastExecutionId":t.last_execution_id,"workflowId":t.workflow_id,"dependencies":t.dependencies.iter().map(|d|self.published_id(d)).collect::<Vec<_>>()})).collect::<Vec<_>>(),
   "executions":snap.executions.iter().filter(|e|allowed(&e.project_id)).take(100).map(|e|json!({"id":e.id,"taskId":self.published_id(&e.task_id),"projectId":e.project_id,"agentId":e.agent_id,"adapter":e.adapter,"status":e.status})).collect::<Vec<_>>(),"workflows":snap.workflows.iter().filter(|w|allowed(&w.project_id)).rev().take(50).map(|w|json!({"id":w.id,"projectId":w.project_id,"objective":safe(&w.objective).chars().take(300).collect::<String>(),"status":w.status,"reworkCount":w.rework_count})).collect::<Vec<_>>(),"schedulerPaused":snap.scheduler_paused}),
        )
    }
    pub fn remote_safe(&self, text: &str) -> String {
        let mut s = redact(text);
        static PATHS: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
        s = PATHS
            .get_or_init(|| {
                regex::Regex::new(r#"(?i)(?:[a-z]:[\\/]|\\\\)[^\s\"<>]+"#)
                    .expect("fixed path pattern")
            })
            .replace_all(&s, "[LOCAL_PATH]")
            .into_owned();
        if let Ok(snap) = self.store.snapshot() {
            for p in snap.projects {
                for path in [
                    p.path.clone(),
                    p.path.replace('\\', "/"),
                    p.path.trim_start_matches("\\\\?\\").to_string(),
                ] {
                    s = s.replace(&path, "[LOCAL_WORKSPACE]");
                }
            }
        }
        if let Some(home) = std::env::var_os("USERPROFILE") {
            s = s.replace(home.to_string_lossy().as_ref(), "[LOCAL_USER]");
        }
        s.chars().take(8000).collect()
    }
    fn remote_events(&self) -> Result<Vec<Value>> {
        let db = self.store.connect()?;
        let mut s=db.prepare("SELECT e.id,e.execution_id,e.kind,e.text FROM execution_events e JOIN executions x ON x.id=e.execution_id JOIN remote_projects p ON p.project_id=x.project_id LEFT JOIN remote_event_ack a ON a.id=CAST(e.id AS TEXT) WHERE p.share_logs=1 AND a.id IS NULL AND e.kind IN ('started','artifact','mock','completed','failed','canceled') ORDER BY e.id LIMIT 10").map_err(|e|e.to_string())?;
        let rows = s
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.map(|r|{let(id,run,kind,text)=r.map_err(|e|e.to_string())?;Ok(json!({"id":id.to_string(),"executionId":run,"kind":kind,"text":self.remote_safe(&text)}))}).collect()
    }
    pub async fn handle_remote(&self, config: &RemoteConfig, c: Envelope) -> Result<Value> {
        for id in [
            &c.command_id,
            &c.device_id,
            &c.project_id,
            &c.task_id,
            &c.requested_by,
        ] {
            uuid::Uuid::parse_str(id).map_err(|_| "Invalid command UUID")?;
        }
        if c.device_id != config.device_id
            || c.requested_by != config.owner_id
            || c.authorization_context.approval_id.is_some()
        {
            return Err("Wrong device/owner or unsupported remote approval".into());
        }
        let issued =
            DateTime::parse_from_rfc3339(&c.issued_at).map_err(|_| "Invalid command date")?;
        let expires = DateTime::parse_from_rfc3339(&c.expires_at).map_err(|_| "Invalid expiry")?;
        if expires <= Utc::now()
            || issued > Utc::now() + chrono::Duration::seconds(5)
            || expires <= issued
            || expires - issued > chrono::Duration::seconds(60)
            || c.idempotency_key.is_empty()
            || c.idempotency_key.len() > 100
        {
            return Err("Expired or invalid command lifetime".into());
        }
        let envelope = serde_json::to_string(&c).map_err(|e| e.to_string())?;
        {
            let _lock = self.store.queue_lock.lock();
            let db = self.store.connect()?;
            let old: Option<(String, String, String)> = db
                .query_row(
                    "SELECT envelope,state,detail FROM remote_commands WHERE id=?1 OR idem=?2",
                    params![c.command_id, c.idempotency_key],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some((old, state, detail)) = old {
                if old != envelope {
                    return Err("Command replay payload mismatch".into());
                }
                return Ok(
                    json!({"type":"ack","commandId":c.command_id,"state":if state=="accepted"{"accepted"}else{"rejected"},"detail":detail}),
                );
            }
            db.execute("INSERT INTO remote_commands VALUES(?1,?2,?3,'claimed','Interrupted command; no automatic replay')",params![c.command_id,c.idempotency_key,envelope]).map_err(|e|e.to_string())?;
        }
        let result = self.remote_effect(&c).await;
        let (state, detail) = match result {
            Ok(s) => ("accepted", s),
            Err(e) => ("rejected", self.remote_safe(&e)),
        };
        self.store
            .connect()?
            .execute(
                "UPDATE remote_commands SET state=?1,detail=?2 WHERE id=?3",
                params![state, detail, c.command_id],
            )
            .map_err(|e| e.to_string())?;
        self.store.audit("remote_command", &c.command_id)?;
        Ok(
            json!({"type":"ack","commandId":c.command_id,"state":state,"detail":detail.chars().take(500).collect::<String>()}),
        )
    }
    async fn remote_effect(&self, c: &Envelope) -> Result<String> {
        self.store.reconcile_queue()?;
        if c.action != "submit" && c.payload.is_some() {
            return Err("Unexpected payload".into());
        }
        match c.action.as_str() {
            "status" => return Ok("Status refresh accepted".into()),
            "pause_scheduling" => {
                self.store.set_scheduler_paused(true)?;
                return Ok("New scheduling paused; active runs continue".into());
            }
            _ => {}
        }
        let shared = self.remote_shared()?;
        if !shared.iter().any(|p| p["projectId"] == c.project_id) {
            return Err("Project not shared by local owner".into());
        }
        match c.action.as_str() {
            "submit" => {
                let p = c.payload.as_ref().ok_or("Missing submission")?;
                if self.store.task(&c.task_id).is_ok()
                    || self.local_remote_id(&c.task_id)? != c.task_id
                {
                    return Err("Task already exists".into());
                }
                if p.prompt.len() > 4000 || p.title.chars().count() > 100 {
                    return Err("Submission too long".into());
                }
                let t = self.store.create_task(TaskInput {
                    project_id: c.project_id.clone(),
                    agent_id: p.agent_id.clone(),
                    adapter: p.adapter.clone(),
                    title: p.title.clone(),
                    prompt: p.prompt.clone(),
                    dependencies: vec![],
                    priority: 50,
                    timeout_seconds: 120,
                    retry_limit: 2,
                })?;
                self.store
                    .connect()?
                    .execute(
                        "INSERT INTO remote_tasks VALUES(?1,?2)",
                        params![c.task_id, t.id],
                    )
                    .map_err(|e| e.to_string())?;
                Ok("Draft submitted; local human approval required".into())
            }
            "start" => {
                let id = self.local_remote_id(&c.task_id)?;
                let t = self.store.task(&id)?;
                if t.project_id != c.project_id || !t.approved || t.gate || t.status != "queued" {
                    return Err("Exact local approval and queued non-gate task required".into());
                }
                let prompt = self.store.task_prompt(&t)?;
                let run = self
                    .start(crate::models::RunRequest {
                        task_id: Some(t.id),
                        project_id: t.project_id,
                        agent_id: t.agent_id,
                        adapter: t.adapter,
                        prompt,
                        approved: true,
                        timeout_seconds: t.timeout_seconds,
                    })
                    .await?;
                self.store.reconcile_queue()?;
                Ok(format!("Execution {} started", run.id))
            }
            "cancel" => {
                let id = self.local_remote_id(&c.task_id)?;
                let t = self.store.task(&id)?;
                if t.project_id != c.project_id {
                    return Err("Project mismatch".into());
                }
                if t.status == "running" {
                    self.cancel(
                        t.last_execution_id
                            .as_deref()
                            .ok_or("No active execution")?,
                    )?;
                } else {
                    self.store.cancel_pending_task(&id)?;
                }
                Ok("Cancellation requested".into())
            }
            _ => Err("Remote action denied by local policy".into()),
        }
    }
}

impl RemoteService {
    pub fn start(&self, core: Core, config: RemoteConfig, token: String) -> Result<()> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Err("Remote connection already active; disconnect first".into());
        }
        self.stop.store(false, Ordering::SeqCst);
        let service = self.clone();
        tokio::spawn(async move {
            while !service.stop.load(Ordering::SeqCst) {
                *service.status.lock() = "connecting".into();
                let result = service.session(&core, &config, &token).await;
                if service.stop.load(Ordering::SeqCst) {
                    break;
                }
                *service.status.lock() = if result.is_err() {
                    "disconnected"
                } else {
                    "offline"
                }
                .into();
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            }
            *service.status.lock() = "disconnected".into();
            service.running.store(false, Ordering::SeqCst);
        });
        Ok(())
    }
    pub fn disconnect(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }
    async fn session(&self, core: &Core, c: &RemoteConfig, token: &str) -> Result<()> {
        let mut url = server_url(&c.server)?;
        url.set_scheme("wss").map_err(|_| "Invalid WSS")?;
        url.set_path("/api/device/socket");
        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|e| e.to_string())?;
        request.headers_mut().insert(
            "Authorization",
            format!("Bearer {token}")
                .parse()
                .map_err(|_| "Invalid credential header")?,
        );
        let mut builder = native_tls::TlsConnector::builder();
        if let Some(pem) = &c.ca_pem {
            builder.add_root_certificate(
                native_tls::Certificate::from_pem(pem.as_bytes()).map_err(|_| "Invalid CA")?,
            );
        }
        let connector = Connector::NativeTls(builder.build().map_err(|e| e.to_string())?);
        let (mut ws, _) =
            tokio_tungstenite::connect_async_tls_with_config(request, None, false, Some(connector))
                .await
                .map_err(|_| "Cannot connect to trusted WSS")?;
        *self.status.lock() = "connected".into();
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        let mut last_receive = std::time::Instant::now();
        let mut pending = std::collections::HashSet::<String>::new();
        loop {
            tokio::select! {
                                     _=interval.tick()=>{if self.stop.load(Ordering::SeqCst){let _=ws.close(None).await;return Ok(());}
                        if last_receive.elapsed()>std::time::Duration::from_secs(15){return Err("Server heartbeat expired".into());}ws.send(Message::Text(json!({"type":"snapshot","data":core.remote_snapshot()?}).to_string().into())).await.map_err(|e|e.to_string())?;let events=core.remote_events()?;pending.extend(events.iter().filter_map(|e|e["id"].as_str().map(str::to_string)));ws.send(Message::Text(json!({"type":"events","events":events}).to_string().into())).await.map_err(|e|e.to_string())?;},
                                     message=ws.next()=>{if self.stop.load(Ordering::SeqCst){let _=ws.close(None).await;return Ok(());}
            let m=message.ok_or("WSS closed")?.map_err(|e|e.to_string())?;last_receive=std::time::Instant::now();if m.is_close(){return Err("WSS closed".into());}
                        if !m.is_text(){continue;}let v:Value=serde_json::from_str(m.to_text().map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
                                      match v["type"].as_str(){Some("command")=>{let ack=match serde_json::from_value::<Envelope>(v["command"].clone()){Ok(command)=>{let id=command.command_id.clone();match core.handle_remote(c,command).await{Ok(ack)=>ack,Err(e)=>json!({"type":"ack","commandId":id,"state":"rejected","detail":core.remote_safe(&e).chars().take(500).collect::<String>()})}},Err(_)=>return Err("Invalid command schema".into())};ws.send(Message::Text(ack.to_string().into())).await.map_err(|e|e.to_string())?;},Some("events_ack")=>{if let Some(ids)=v["ids"].as_array(){for id in ids.iter().take(100).filter_map(Value::as_str){if pending.remove(id){core.store.connect()?.execute("INSERT OR IGNORE INTO remote_event_ack VALUES(?1)",[id]).map_err(|e|e.to_string())?;}}}},Some("ready")=>{},_=>return Err("Invalid server message".into())}
                                     }
                                    }
        }
    }
}
