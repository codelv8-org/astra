# Task Event Initiator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทุกแถวใหม่ใน `task_events` บอกผู้สั่ง และกล่องรายละเอียดงานแสดงป้าย "สั่งโดย"

**Architecture:** migration 006 เพิ่มคอลัมน์ใน `task_events`; Rust enum `Initiator` เป็นพารามิเตอร์บังคับของ `task_event`/`append_event` (ลืมใส่ = compile ไม่ผ่าน); ผู้เริ่ม run (scheduler/remote) เขียน event ของตัวเอง *ก่อน* เรียก `start` ส่วน `reconcile_queue` ที่แค่สังเกตผล ใช้ `System`

**Tech Stack:** Rust (rusqlite, tokio), Tauri 2, React/TS, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-11-22-task-event-initiator-design.md`

## Global Constraints

- ค่า `initiator` ที่เก็บ: `owner` | `remote` | `scheduler` | `handoff` | `system` | `unknown` (แถวเก่าเท่านั้น)
- `initiator_ref`: device id (remote), task id ต้นทาง (handoff), อื่นๆ NULL
- ไม่มีค่า default ในโค้ด Rust; ห้ามเดาผู้สั่งของแถวเก่า
- ป้าย UI: คุณ / Remote (อุปกรณ์ …) / ตัวจัดคิว / ส่งต่อจากงาน … / ระบบ / ไม่ทราบ (ก่อนอัปเดต)
- **ต่างจาก spec (ผู้วางแผนตัดสิน):** ไม่มี variant `Retry` เพราะ `retry_task` เป็นคำขอของเจ้าของเสมอ (ต้องอนุมัติใหม่) → `owner`; `execution_started`/`execution_finished` มาจาก `reconcile_queue` ซึ่งไม่รู้ผู้เริ่ม → `system` และเพิ่ม event `dispatch_requested` (scheduler) ก่อน start แทน
- ไม่ commit ระหว่างทาง: repo ยังไม่มี HEAD และมีงานผู้ใช้ที่ยังไม่ commit ปนในไฟล์เดียวกัน — ขั้น checkpoint คือรันชุดทดสอบให้ผ่าน

## Review Focus

- DB เดิม schema 5 ที่มีแถว `task_events` แล้ว เปิดด้วยแอปใหม่ → แถวเก่าเป็น `unknown` ไม่ error (Task 1 test `legacy_task_events_read_as_unknown`)
- DB บน network share (journal_mode=DELETE) migration ต้องอยู่ใน `BEGIN IMMEDIATE`/`ROLLBACK` แบบเดียวกับ 005 (Task 1 Step 3)
- remote command ซ้ำ (replay ด้วย idempotency key เดิม) ต้องไม่เขียน `remote_command` ซ้ำ — event เขียนหลังผ่านการตรวจ replay เท่านั้น (Task 2 test)
- remote start ที่ถูกปฏิเสธ ต้องมีทั้ง `remote_command` และ `remote_rejected` ในงานนั้น และไม่มี `execution_started` (Task 2 test)
- `redact` ยังครอบ `text` เหมือนเดิม; `initiator_ref` เป็น device id/task id เท่านั้น ห้ามใส่ข้อความอิสระ (Task 1 Step 3)

---

### Task 1: Core — migration, `Initiator`, ผู้สั่งทุก call site

**Files:**
- Create: `packages/desktop-core/migrations/006_task_event_initiator.sql`
- Modify: `packages/desktop-core/src/store.rs` (`SCHEMA_VERSION` = 6, บล็อก `if version < 6`)
- Modify: `packages/desktop-core/src/models.rs` (`Initiator`, `TaskEvent`)
- Modify: `packages/desktop-core/src/queue.rs`, `src/writing.rs`, `src/runtime.rs` (เฉพาะ create_task ใน test module ~L740), `src/remote.rs` (ส่ง `Remote` ให้ create/cancel)
- Modify: `apps/desktop/src-tauri/src/main.rs:312,380` (ส่ง `&Initiator::Owner`)
- Modify: `packages/desktop-core/examples/queue_smoke.rs`, `tests/orchestration.rs`, `tests/writing.rs` (caller ใหม่)
- Test: `packages/desktop-core/tests/orchestration.rs`

**Interfaces:**
- Produces:
  - `pub enum Initiator { Owner, Remote(String), Scheduler, Handoff(String), System }` (derive Debug, Clone, PartialEq, Eq) ใน `models.rs` พร้อม `pub fn kind(&self) -> &'static str` และ `pub fn reference(&self) -> Option<&str>`
  - `TaskEvent` เพิ่ม `pub initiator: String`, `pub initiator_ref: Option<String>` (serde camelCase → `initiator`, `initiatorRef`)
  - `Store::task_event(&self, id: &str, kind: &str, text: &str, by: &Initiator) -> Result<()>`
  - `Store::create_task(&self, input: TaskInput, by: &Initiator) -> Result<Task>`
  - `Store::cancel_pending_task(&self, id: &str, by: &Initiator) -> Result<()>`

- [ ] **Step 1: เขียน test ที่ fail ใน `tests/orchestration.rs`**

```rust
#[test]
fn legacy_task_events_read_as_unknown() {
    let (_d, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    core.store.connect().unwrap().execute(
        "INSERT INTO task_events(task_id,kind,text,created_at) VALUES(?1,'legacy','old row','2026-01-01')",
        [&task.id]).unwrap();
    let legacy = core.store.task_events(&task.id).unwrap().into_iter().find(|e| e.kind == "legacy").unwrap();
    assert_eq!(legacy.initiator, "unknown");
    assert_eq!(legacy.initiator_ref, None);
}

#[test]
fn owner_actions_are_attributed_to_owner() {
    let (_d, core, project) = setup();
    let task = core.store.create_task(input(&project), &Initiator::Owner).unwrap();
    core.store.cancel_pending_task(&task.id, &Initiator::Owner).unwrap();
    let events = core.store.task_events(&task.id).unwrap();
    assert!(events.iter().all(|e| e.initiator == "owner"));
    assert!(events.iter().any(|e| e.kind == "canceled"));
}

#[tokio::test]
async fn scheduler_dispatch_is_recorded_before_start() {
    // ใช้ task mock ที่อนุมัติแล้วและ queued ตาม pattern ของ test dispatch เดิมในไฟล์นี้
    // เรียก core.scheduler_tick().await
    // คาดหวัง (events เรียง id DESC): มี "dispatch_requested" initiator "scheduler"
    //   และ id ของมัน < id ของ "execution_started" ซึ่ง initiator "system"
}
```

- [ ] **Step 2: รัน `powershell -File tools/cargo.ps1 -Action core-test`** — คาดว่า compile fail (`Initiator` ไม่มี / จำนวนพารามิเตอร์ผิด)

- [ ] **Step 3: Implement**
  - `006_task_event_initiator.sql`: `ALTER TABLE task_events ADD COLUMN initiator TEXT NOT NULL DEFAULT 'unknown'; ALTER TABLE task_events ADD COLUMN initiator_ref TEXT; PRAGMA user_version=6;` และใน `store.rs` บล็อก `if version < 6` ห่อ `BEGIN IMMEDIATE`/`ROLLBACK`/`COMMIT` เหมือน 005
  - `append_event(db, id, kind, text, by)` INSERT `initiator=by.kind()`, `initiator_ref=by.reference()`, `text` ยังผ่าน `redact`; SELECT ใน `task_events` อ่านสองคอลัมน์ใหม่
  - `scheduler_tick`: ก่อน `self.start(request)` เขียน `task_event(&task.id, "dispatch_requested", "Scheduler started approved task", &Initiator::Scheduler)`
  - ผู้สั่งต่อ call site:

| ไฟล์:บรรทัด (ก่อนแก้) | kind | Initiator |
|---|---|---|
| queue.rs:146 `create_task` | created | `by` |
| queue.rs:236 workflow tasks | created | Owner |
| queue.rs:274 | owner_evidence_updated | Owner |
| queue.rs:348 | verification_followup | Owner |
| queue.rs:469, 486 `approve_task` | human_approved / approved | Owner |
| queue.rs:544, 569 `reconcile_queue` | execution_started / execution_finished | System |
| queue.rs:628 `retry_task` | retry_requested | Owner |
| queue.rs:646 `cancel_pending_task` | canceled | `by` |
| queue.rs:660 `review_task` | review_* | Owner |
| queue.rs:686 | escalated | System |
| queue.rs:743 rework | handoff | `Handoff(<review task id>)` |
| queue.rs:811 | dispatch_blocked | Scheduler |
| writing.rs:198 `configure_writing` | writing_configured | Owner |
| writing.rs:281 `stage_patch` | patch_staged | System |
| writing.rs:330 | patch_recovery_required | System |
| writing.rs:342 `apply_patch`, 411 `rollback_patch` | patch_applied / patch_rolled_back | Owner |
| remote.rs:357 submit, 411 cancel | (ผ่าน create/cancel) | `Remote(c.device_id.clone())` |

  - ข้อความ `"Pending task canceled by owner"` เปลี่ยนเป็น `"Pending task canceled"` (ผู้สั่งอยู่ในป้ายแล้ว)

- [ ] **Step 4: รัน `tools/cargo.ps1 -Action core-test` และ `-Action ipc-test` และ `-Action core-clippy`** — ผ่านทั้งหมด

---

### Task 2: Remote — บันทึกก่อนลงมือ และเมื่อถูกปฏิเสธ

**Files:**
- Modify: `packages/desktop-core/src/remote.rs` (`handle_remote` ~L310-325)
- Test: `packages/desktop-core/tests/remote.rs`

**Interfaces:**
- Consumes: `Store::task_event(.., &Initiator)`, `Initiator::Remote(String)` จาก Task 1

- [ ] **Step 1: เขียน test ที่ fail**

```rust
#[tokio::test]
async fn remote_commands_are_attributed_before_effect_and_on_rejection() {
    let (_d, core, p, c) = setup();
    core.share_remote_project(&p, true, false).unwrap();
    let remote_task = Uuid::new_v4().to_string();
    let mut submit = envelope(&c, &p, &remote_task, "submit");
    submit["payload"] = json!({"agentId":"astra","adapter":"mock","title":"test","prompt":"test only"});
    core.handle_remote(&c, serde_json::from_value(submit).unwrap()).await.unwrap();
    let local = core.store.tasks().unwrap()[0].id.clone();
    let created = core.store.task_events(&local).unwrap();
    assert!(created.iter().any(|e| e.kind == "created" && e.initiator == "remote"
        && e.initiator_ref.as_deref() == Some(c.device_id.as_str())));

    let start = envelope(&c, &p, &remote_task, "start"); // ยังไม่อนุมัติ → ถูกปฏิเสธ
    core.handle_remote(&c, serde_json::from_value(start.clone()).unwrap()).await.unwrap();
    let events = core.store.task_events(&local).unwrap();
    let cmd = events.iter().find(|e| e.kind == "remote_command").unwrap();
    let rej = events.iter().find(|e| e.kind == "remote_rejected").unwrap();
    assert!(cmd.id < rej.id && cmd.initiator == "remote" && rej.initiator == "remote");
    assert!(!events.iter().any(|e| e.kind == "execution_started"));

    // replay คำสั่งเดิม → ไม่มีแถว remote_command เพิ่ม
    core.handle_remote(&c, serde_json::from_value(start).unwrap()).await.unwrap();
    let again = core.store.task_events(&local).unwrap();
    assert_eq!(again.iter().filter(|e| e.kind == "remote_command").count(), 1);
}
```

- [ ] **Step 2: รัน `tools/cargo.ps1 -Action core-test`** — คาดว่า fail ที่ไม่พบ `remote_command`

- [ ] **Step 3: Implement ใน `handle_remote`** หลัง INSERT `remote_commands` (ผ่านการตรวจ replay แล้ว) และก่อน `remote_effect`: ถ้า `self.local_remote_id(&c.task_id)` ชี้งานที่มีอยู่ (`self.store.task(&id).is_ok()`) เขียน `remote_command` text `"{action} · {command_id}"`, `Initiator::Remote(c.device_id.clone())`; หลัง effect ถ้า `Err` และงานมีอยู่ เขียน `remote_rejected` text = `self.remote_safe(&e)` ส่วน submit งานยังไม่มีก่อน effect จึงอาศัย `created` จาก Task 1

- [ ] **Step 4: รัน `core-test`, `ipc-test`, `core-clippy`** — ผ่าน

---

### Task 3: Desktop UI — ป้าย "สั่งโดย"

**Files:**
- Modify: `packages/shared/src/index.ts` (`TaskEvent` เพิ่ม `initiator: string; initiatorRef?: string | null`)
- Create: `apps/desktop/src/initiator.ts`
- Modify: `apps/desktop/src/QueueTaskDialog.tsx:259-263`
- Test: `tests/unit/initiator.test.ts`, `tests/e2e/queue.spec.ts` (fixture `queue_events`), `tests/e2e/writing.spec.ts` (เพิ่ม `initiator` ใน fixture)

**Interfaces:**
- Consumes: JSON `initiator`, `initiatorRef` จาก IPC `queue_events` (Task 1)
- Produces: `export function initiatorLabel(e: Pick<TaskEvent, "initiator" | "initiatorRef">): string`

- [ ] **Step 1: เขียน test ที่ fail ใน `tests/unit/initiator.test.ts`**

```ts
expect(initiatorLabel({ initiator: "owner" })).toBe("คุณ");
expect(initiatorLabel({ initiator: "remote", initiatorRef: "dev-1234abcd" })).toBe("Remote (อุปกรณ์ dev-1234)");
expect(initiatorLabel({ initiator: "scheduler" })).toBe("ตัวจัดคิว");
expect(initiatorLabel({ initiator: "handoff", initiatorRef: "abcdef123456" })).toBe("ส่งต่อจากงาน abcdef12");
expect(initiatorLabel({ initiator: "system" })).toBe("ระบบ");
expect(initiatorLabel({ initiator: "unknown" })).toBe("ไม่ทราบ (ก่อนอัปเดต)");
expect(initiatorLabel({ initiator: "something-new" })).toBe("ไม่ทราบ (ก่อนอัปเดต)");
```
(ref แสดง 8 ตัวแรก)

- [ ] **Step 2: รัน `pnpm test -- initiator`** — fail (ไม่มีโมดูล)

- [ ] **Step 3: Implement `initiatorLabel`** และในแถวประวัติแสดง `<span className="initiator-chip">สั่งโดย {initiatorLabel(e)}</span>` ต่อจาก `<b>{e.kind}</b>` ใช้ token สีที่มีใน `console.css` เท่านั้น; fixture e2e ใส่ `initiator: "owner"` และเพิ่ม assertion ใน `queue.spec.ts` ว่าเห็นข้อความ "สั่งโดย คุณ" ในกล่องรายละเอียดงาน

- [ ] **Step 4: รัน `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`** — ผ่านทั้งหมด และ `ai-design-check` 0 error

---

### Task 4: เอกสารและตรวจรวม

**Files:**
- Modify: `docs/IPC_CONTRACTS.md` (ฟิลด์ `initiator`/`initiatorRef` ของ `queue_events`, schema 6)

- [ ] **Step 1:** อัปเดต `docs/IPC_CONTRACTS.md`
- [ ] **Step 2:** รันชุดเต็ม: `core-test`, `ipc-test`, `core-clippy`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` — ผ่านทั้งหมด
- [ ] **Step 3:** ตรวจกล่องรายละเอียดงานใน built-in browser ด้วย fixture ที่ 1440×900 และ 375px (ไม่ล้นแนวนอน)
- [ ] **Step 4:** เพิ่มบันทึกข้อเท็จจริงใน `X:\second-brain\Projects\crewnest\Changelog\Agent Work Log.md` และเสนอ (ไม่แก้เอง) การอัปเดตโน้ต Database ใน vault
