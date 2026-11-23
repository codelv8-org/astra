use serde_json::Value;

#[derive(Default, Debug)]
pub struct ParsedEvent {
    pub completed: bool,
    pub error: Option<String>,
    pub session: Option<String>,
    pub text: Option<String>,
    pub usage: Option<Value>,
}

pub fn arguments(adapter: &str) -> Vec<&'static str> {
    match adapter {
        "claude" => vec![
            "--print",
            "--output-format",
            "stream-json",
            "--verbose",
            "--permission-mode",
            "plan",
            "--tools",
            "Read,Glob,Grep",
            "--disallowedTools",
            "Bash,PowerShell,Edit,Write,NotebookEdit,Agent",
            "--safe-mode",
            "--strict-mcp-config",
            "--mcp-config",
            "{\"mcpServers\":{}}",
            "--no-session-persistence",
            "--disable-slash-commands",
        ],
        "antigravity" => vec![
            "--output-format",
            "stream-json",
            "--mode",
            "plan",
            "--sandbox",
            "--print",
        ],
        _ => crate::runtime::codex_arguments(),
    }
}

/// path สำหรับส่งให้ CLI ภายนอก: ตัด prefix verbatim `\\?\` ที่ได้จาก canonicalize
pub fn plain_path(path: &str) -> String {
    path.trim_start_matches(r"\\?\").to_string()
}

fn secondary_folders(project: &crate::models::Project) -> Vec<String> {
    project
        .folders
        .iter()
        .filter(|f| !f.is_primary && f.exists)
        .map(|f| plain_path(&f.path))
        .collect()
}

/// `--add-dir` สำหรับ folder รอง: เฉพาะ claude (codex read-only อ่านได้อยู่แล้ว, antigravity ไม่รองรับ)
pub fn extra_dir_args(adapter: &str, project: &crate::models::Project) -> Vec<String> {
    if adapter != "claude" {
        return Vec::new();
    }
    secondary_folders(project)
        .into_iter()
        .flat_map(|p| ["--add-dir".to_string(), p])
        .collect()
}

/// บรรทัดบอก agent ว่ามี folder รองให้อ่าน; None เมื่อไม่มี
pub fn folders_context(project: &crate::models::Project) -> Option<String> {
    let folders = secondary_folders(project);
    (!folders.is_empty()).then(|| format!("Additional read-only folders: {}", folders.join("; ")))
}

pub fn input(adapter: &str, prompt: &str) -> String {
    let _ = adapter;
    prompt.into()
}

pub fn writing_arguments() -> Vec<&'static str> {
    let mut args = arguments("claude");
    args.retain(|a| *a != "--verbose");
    for (flag, value) in [
        ("--permission-mode", "default"),
        ("--output-format", "json"),
    ] {
        if let Some(index) = args.iter().position(|s| *s == flag) {
            args[index + 1] = value;
        }
    }
    if let Some(index) = args.iter().position(|s| *s == "--tools") {
        args[index + 1] = "";
    }
    args.extend(["--json-schema", r#"{"type":"object","additionalProperties":false,"properties":{"files":{"type":"array","minItems":1,"maxItems":8,"items":{"type":"object","additionalProperties":false,"properties":{"path":{"type":"string","minLength":1,"maxLength":180},"content":{"type":"string","maxLength":24000}},"required":["path","content"]}}},"required":["files"]}"#]);
    args
}

pub fn parse(adapter: &str, value: &Value) -> ParsedEvent {
    let mut event = ParsedEvent::default();
    let kind = value["type"].as_str().unwrap_or("");
    match adapter {
        "claude" => {
            event.session = value["session_id"].as_str().map(String::from);
            if kind == "assistant" {
                event.text = value["message"]["content"].as_array().map(|parts| {
                    parts
                        .iter()
                        .filter_map(|p| p["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("\n")
                });
            }
            if kind == "result" {
                event.completed =
                    value["is_error"].as_bool() == Some(false) && value["subtype"] == "success";
                if !event.completed {
                    event.error = Some(
                        value["result"]
                            .as_str()
                            .unwrap_or("Claude runtime failed")
                            .into(),
                    );
                }
                if value["permission_denials"]
                    .as_array()
                    .is_some_and(|a| !a.is_empty())
                {
                    event.error =
                        Some("Claude denied requested tools; task requires human review".into());
                }
                event.usage = value.get("usage").cloned();
                if value["structured_output"].is_object() {
                    event.text = Some(value["structured_output"].to_string());
                } else if event.text.is_none() {
                    event.text = value["result"].as_str().map(String::from);
                }
            }
        }
        "antigravity" => {
            if value["event"] == "result" {
                let result = &value["result"];
                event.completed = result["status"] == "SUCCESS";
                if !event.completed {
                    event.error = Some(
                        result["error"]
                            .as_str()
                            .unwrap_or("Antigravity runtime failed")
                            .into(),
                    );
                }
                event.session = result["conversation_id"].as_str().map(String::from);
                event.text = result["response"].as_str().map(String::from);
                event.usage = result.get("usage").cloned();
                if result["denied_actions"]
                    .as_array()
                    .is_some_and(|a| !a.is_empty())
                {
                    event.completed = false;
                    event.error = Some(
                        "Antigravity denied requested actions; task requires human review".into(),
                    );
                }
            }
        }
        _ => {
            if kind == "thread.started" {
                event.session = value["thread_id"].as_str().map(String::from);
            }
            if kind == "turn.completed" {
                event.completed = true;
                event.usage = value.get("usage").cloned();
            }
            if ["turn.failed", "error"].contains(&kind) {
                event.error = Some(
                    value["error"]["message"]
                        .as_str()
                        .or(value["message"].as_str())
                        .unwrap_or("Runtime reported an error")
                        .into(),
                );
            }
            if kind == "item.completed" && value["item"]["type"] == "agent_message" {
                event.text = value["item"]["text"].as_str().map(String::from);
            }
        }
    }
    event
}
