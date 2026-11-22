use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub goal: String,
    pub path: String,
    pub is_git: bool,
    pub created_at: String,
    pub folders: Vec<ProjectFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolder {
    pub id: String,
    pub path: String,
    pub repo_root: Option<String>,
    pub is_git: bool,
    pub is_primary: bool,
    pub position: i64,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Execution {
    pub id: String,
    pub task_id: String,
    pub project_id: String,
    pub agent_id: String,
    pub adapter: String,
    pub prompt: String,
    pub status: String,
    pub created_at: String,
    pub finished_at: Option<String>,
    pub error: Option<String>,
    pub pid: Option<u32>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionEvent {
    pub id: i64,
    pub execution_id: String,
    pub kind: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionResult {
    pub execution_id: String,
    pub project_id: String,
    pub agent_id: String,
    pub adapter: String,
    pub event: Option<ExecutionEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunRequest {
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
    pub project_id: String,
    pub agent_id: String,
    pub adapter: String,
    pub prompt: String,
    pub approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub adapter: String,
    pub installed: bool,
    pub version: Option<String>,
    pub authentication: String,
    pub executable: Option<String>,
    pub supported: bool,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub tasks: Vec<Task>,
    pub workflows: Vec<Workflow>,
    pub scheduler_paused: bool,
    pub agents: Vec<serde_json::Value>,
    pub projects: Vec<Project>,
    pub executions: Vec<Execution>,
    pub data_path: String,
    pub remote_status: String,
}

fn default_timeout() -> u64 {
    120
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskInput {
    pub project_id: String,
    pub agent_id: String,
    pub adapter: String,
    pub title: String,
    pub prompt: String,
    pub dependencies: Vec<String>,
    pub priority: i64,
    pub timeout_seconds: u64,
    pub retry_limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub agent_id: String,
    pub adapter: String,
    pub title: String,
    pub prompt: String,
    pub dependencies: Vec<String>,
    pub priority: i64,
    pub timeout_seconds: u64,
    pub retry_limit: u32,
    pub attempts: u32,
    pub status: String,
    pub workflow_id: Option<String>,
    pub step: String,
    pub gate: bool,
    pub approved: bool,
    pub created_at: String,
    pub last_execution_id: Option<String>,
    pub blocker: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub id: String,
    pub project_id: String,
    pub objective: String,
    pub status: String,
    pub created_at: String,
    pub rework_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEvent {
    pub id: i64,
    pub task_id: String,
    pub kind: String,
    pub text: String,
    pub created_at: String,
}
