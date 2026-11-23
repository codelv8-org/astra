pub mod adapters;
pub mod folders;
pub mod models;
pub mod overview;
pub mod queue;
pub mod remote;
pub mod runtime;
pub mod storage;
pub mod store;
pub mod writing;
pub use runtime::Core;
pub type Result<T> = std::result::Result<T, String>;

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn execution_prompt(agent: &serde_json::Value, prompt: &str) -> String {
    format!(
        "CrewNest agent: {}\nRole: {}\nAgent instructions: {}\nExecution policy: read-only. Never bypass human approvals. Do not perform high-risk operations.\n\nOwner task:\n{}",
        agent["name"].as_str().unwrap_or("Agent"),
        agent["role"].as_str().unwrap_or(""),
        agent["instructions"].as_str().unwrap_or(""),
        prompt
    )
}

pub fn redact(text: &str) -> String {
    use std::sync::OnceLock;
    static PATTERNS: OnceLock<Vec<regex::Regex>> = OnceLock::new();
    let patterns = PATTERNS.get_or_init(|| {
        [
            r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+",
            r"\bsk-[A-Za-z0-9_-]{8,}",
            r"(?i)\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+",
        ]
        .iter()
        .map(|p| regex::Regex::new(p).expect("fixed redaction pattern"))
        .collect()
    });
    let mut safe = text.to_string();
    for pattern in patterns {
        safe = pattern.replace_all(&safe, "[REDACTED]").into_owned();
    }
    for (key, value) in std::env::vars() {
        let key = key.to_uppercase();
        if value.len() >= 8
            && ["TOKEN", "SECRET", "PASSWORD", "API_KEY"]
                .iter()
                .any(|p| key.contains(p))
        {
            safe = safe.replace(&value, "[REDACTED]");
        }
    }
    safe
}
