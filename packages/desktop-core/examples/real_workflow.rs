use crewnest_core::{store::Store, Core};
use std::{path::PathBuf, sync::Arc, time::Duration};

#[tokio::main]
async fn main() -> Result<(), String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/phase2-real-workflow");
    let workspace = root.join("workspace");
    std::fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
    let target = workspace.join("counter.mjs");
    if !target.exists() {
        std::fs::write(
            &target,
            "export function formatCount(value) { throw new Error('not implemented'); }\n",
        )
        .map_err(|e| e.to_string())?;
    }
    let tests = r#"import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatCount} from './counter.mjs';
test('zero',()=>assert.deepEqual(formatCount(0),{label:'0 tasks',ariaLabel:'0 queued tasks'}));
test('singular',()=>assert.deepEqual(formatCount(1),{label:'1 task',ariaLabel:'1 queued task'}));
test('plural',()=>assert.deepEqual(formatCount(8),{label:'8 tasks',ariaLabel:'8 queued tasks'}));
test('reject invalid',()=>{for(const v of [-1,1.5,'2',NaN,Infinity,null])assert.throws(()=>formatCount(v),TypeError);});
"#;
    let test_path = workspace.join("counter.test.mjs");
    if test_path.exists() {
        if std::fs::read_to_string(&test_path).map_err(|e| e.to_string())? != tests {
            return Err("Trusted tests changed; refusing to overwrite or verify".into());
        }
    } else {
        std::fs::write(&test_path, tests).map_err(|e| e.to_string())?;
    }
    let store = Store::open(root.join("workflow.db"))?;
    let core = Core::new(
        store.clone(),
        Arc::new(|event| {
            println!(
                "{}: {}",
                event.kind,
                event.text.chars().take(500).collect::<String>()
            )
        }),
    )?;
    let project = store
        .snapshot()?
        .projects
        .into_iter()
        .next()
        .map(Ok)
        .unwrap_or_else(|| {
            store.register_project(
                "Real five-agent workflow",
                "Synthetic non-sensitive writing UAT",
                &workspace,
            )
        })?;
    let workflow=store.workflows()?.into_iter().find(|f|f.status=="active" || (std::env::args().any(|a|a=="--reverify") && f.status=="completed")).map(Ok).unwrap_or_else(||store.create_workflow(&project.id,"Implement counter.mjs exporting formatCount(value). Accept only nonnegative integers; otherwise throw TypeError. Return {label,ariaLabel}: 0 -> {label:'0 tasks',ariaLabel:'0 queued tasks'}, 1 -> {label:'1 task',ariaLabel:'1 queued task'}, 8 -> {label:'8 tasks',ariaLabel:'8 queued tasks'}. Preserve counter.test.mjs (trusted tests). ASTRA: concise plan and final summary. VECTOR: concise module contract/risks. MIRA: concise accessible copy and handoff; do not edit files. FORGE: exact JSON files manifest for counter.mjs, no tool calls; Rust applies after separate test-harness approval. SCOUT: inspect the applied file and run node --test counter.test.mjs using read-only sandbox, report actual results. First line QA_VERIFIED only if source and tests have verified evidence, otherwise QA_BLOCKED. No network tools, no credentials, no commits, no other files. Keep each response under 1500 characters except FORGE JSON.",false))?;
    println!("REAL_WORKFLOW {} — approval decisions here are explicit synthetic test-harness decisions, not human-owner UAT sign-off",workflow.id);
    if std::env::args().any(|a| a == "--reverify") && workflow.status == "completed" {
        let implementation = store
            .tasks()?
            .into_iter()
            .find(|t| {
                t.workflow_id.as_deref() == Some(&workflow.id)
                    && t.step == "implement"
                    && t.status == "completed"
            })
            .ok_or("No implementation")?;
        let patch = store.patch(&implementation.id)?.ok_or("No applied patch")?;
        let source = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
        if patch.state != "applied"
            || !patch
                .files
                .iter()
                .any(|f| f.path == "counter.mjs" && f.content == source)
        {
            return Err("Applied source differs from the approved patch".into());
        }
        let output = tokio::process::Command::new("node")
            .args(["--test", "counter.test.mjs"])
            .current_dir(&workspace)
            .output()
            .await
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("Core verification tests failed".into());
        }
        use sha2::{Digest, Sha256};
        let evidence=format!("Core/test-harness verification, not model tool execution. counter.mjs matches the applied approved patch. Source SHA256 {:x}; trusted tests SHA256 {:x}.\nActual source:\n{}\nActual command: node --test counter.test.mjs\nExit code: 0\nstdout:\n{}",Sha256::digest(source.as_bytes()),Sha256::digest(tests.as_bytes()),source,String::from_utf8_lossy(&output.stdout));
        println!("CORE_VERIFICATION_EVIDENCE {evidence}");
        store.append_verification(&workflow.id, &evidence)?;
    }
    if std::env::args().any(|a| a == "--retry-failed") {
        for task in store
            .tasks()?
            .iter()
            .filter(|t| t.workflow_id.as_deref() == Some(&workflow.id) && t.status == "failed")
        {
            println!("EXPLICIT TEST HARNESS RETRY {}", task.id);
            store.retry_task(&task.id)?;
        }
    }
    for d in core.diagnostics().await {
        println!(
            "DIAGNOSTIC {} installed={} authentication={} version={}",
            d.adapter,
            d.installed,
            d.authentication,
            d.version.unwrap_or_default().trim()
        );
    }
    store.set_scheduler_paused(false)?;
    let result=tokio::time::timeout(Duration::from_secs(1800),async {
        loop {
            store.reconcile_queue()?;
            for task in store.tasks()?.iter().filter(|t|t.workflow_id.as_deref()==Some(&workflow.id)) {
                if task.status=="ready" {
                    if task.agent_id=="forge" && store.writing_policy(&task.id)?.is_none() { store.configure_writing(&task.id,vec!["counter.mjs".into()])?; }
                    println!("TEST HARNESS APPROVAL {} {}",task.id,task.step);
                    store.approve_task(&task.id)?;
                }
                if task.status=="needs_review" {
                    if task.agent_id=="forge" {
                        let patch=store.patch(&task.id)?.ok_or("No writing patch")?;
                        println!("TEST HARNESS EXACT PATCH REVIEW {}",serde_json::to_string(&patch).map_err(|e|e.to_string())?);
                        store.apply_patch(&task.id,&store.patch_digest(&task.id)?)?;
                        let output=tokio::process::Command::new("node").args(["--test","counter.test.mjs"]).current_dir(&workspace).output().await.map_err(|e|e.to_string())?;
                        println!("INDEPENDENT NODE TESTS {}",String::from_utf8_lossy(&output.stdout));
                        if !output.status.success(){return Err("Independent tests failed; human rework required".into());}
                    } else {
                        let last=store.events(task.last_execution_id.as_deref().ok_or("No SCOUT run")?,0)?.into_iter().rfind(|e|e.kind=="artifact").ok_or("No SCOUT report")?;
                        if !last.text.trim_start().starts_with("QA_VERIFIED") {return Err("SCOUT did not verify the evidence; refusing automatic test-harness review/UAT approval".into());}
                        store.review_task(&task.id,true,"TEST HARNESS: independently executed Node tests passed; accept synthetic SCOUT report")?;
                    }
                }
                if ["failed","canceled"].contains(&task.status.as_str()) { return Err(format!("Real workflow stopped at {} ({}). Inspect persisted logs; no fabricated continuation",task.step,task.status)); }
            }
            core.scheduler_tick().await?;
            if store.workflows()?.iter().any(|f|f.id==workflow.id && f.status=="completed") {return Ok::<(),String>(());}
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }).await.map_err(|_|"Real workflow timed out".to_string()).and_then(|r|r);
    store.set_scheduler_paused(true)?;
    result?;
    println!("REAL_FIVE_AGENT_WORKFLOW_COMPLETED {}", workflow.id);
    Ok(())
}
