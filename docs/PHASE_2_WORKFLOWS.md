# การใช้งาน local queue — Phase 2

เอกสารนี้อธิบายฐานก่อน staged writing สำหรับ FORGE แบบเขียนไฟล์จริงผ่าน Rust หลัง human approval ให้อ่าน [WRITING_EXECUTION.md](WRITING_EXECUTION.md) ซึ่งใช้แทนข้อจำกัด proposal-only ด้านล่าง

เปิด `target/release/crewnest-desktop.exe` หรือใช้ `pnpm desktop` จาก root ตาม `MANUAL.md` Execution ต้องมี Desktop runtime ทำงานอยู่ เครื่อง sleep/offline ไม่ได้ทำให้งานรันต่อเอง

1. สร้าง project ผ่าน native directory picker หรือเลือก project เดิม
2. กด New workflow ใส่ objective; Mock ถูกเลือกเป็นค่าเริ่มต้นและแสดงชัดว่าไม่มี AI model หากเลือก real workflow ต้องมี runtime ของแต่ละ agent ติดตั้งและ authenticated
3. เปิด ASTRA plan แล้ว Review & approve queue task ตรวจ native confirmation ก่อนยืนยัน จากนั้น Resume scheduling
4. หลัง plan สำเร็จ เปิด human plan_approval gate ตรวจผลจาก View execution logs ก่อนอนุมัติ งานถัดไปจึง ready แต่ยังต้อง review/approve exact prompt และ predecessor handoff ก่อน dispatch ทุกครั้ง
5. VECTOR → MIRA → FORGE proposal → SCOUT review ตาม dependencies งาน SCOUT ที่สำเร็จหยุดที่ needs_review ให้ human รับผลหรือใส่เหตุผล Request rework
6. Rework สร้าง FORGE/SCOUT รอบใหม่สูงสุด 2 รอบ ถ้ายังไม่ผ่าน workflow จะ escalated ต้องให้ human จัดการ ไม่วนอัตโนมัติ
7. Human UAT gate ต้องอนุมัติแยก จากนั้น ASTRA summary จึงทำงานได้ ไม่มี agent อนุมัติแทน human

Add task สร้าง task นอก workflow ได้ เลือก agent/runtime ให้ตรง default record, priority 0–100, timeout 5–600 วินาที, retry limit 0–2 และเลือก dependencies ใน project เดียวกัน Dependencies อ้างได้เฉพาะ task ที่มีอยู่แล้วเพื่อป้องกันวงจร Retry ต้องกดเองและอนุมัติ prompt ใหม่ ไม่ทำ paid retry อัตโนมัติ

Pause scheduling หยุด dispatch ใหม่เท่านั้น งานที่กำลังรันยังทำต่อ Cancel task/run ส่ง cancellation ไป process tree ที่ Core เป็นเจ้าของ Resume scheduling ไม่ใช่ resume runtime session CLI session resume ยังไม่รองรับ

Queue เก็บ exact authorization fingerprint ของ task, effective prompt/handoff, agent record, runtime และ timeout การเปลี่ยน payload ทำให้ dispatch ถูกปฏิเสธ Native Core ยังตรวจ executable fingerprint, workspace และ runtime auth อีกครั้ง ไม่รับ arbitrary args/shell จาก renderer ใช้ project/agent execution locks ห้ามสองงานใน working tree เดียวกันรันพร้อมกัน ยังไม่ใช้ parallel Git worktrees

SQLite schema 2 ย้าย schema1 แบบ transaction เก็บ tasks/workflows/dependencies/events/authorizations/scheduler state ใน local DB หลัง restart scheduler paused และ interrupted execution เป็น failed ต้อง retry/approve ใหม่ ไม่มี auto replay งานค้าง สำรอง schema1 ก่อนอัปเกรดอยู่ `.local/phase2-baseline/crewnest.schema1.db` เมื่อต้อง rollback ให้ปิด Desktop แล้วเก็บ DB schema2 ปัจจุบันแยกก่อน restore สำเนา schema1 พร้อม binary เดิม ห้ามเปิด binary เก่ากับ schema2

## Local IPC เพิ่มจาก Phase 1

| Command | Input | ผลลัพธ์ |
|---|---|---|
| create_task | input: projectId, agentId, adapter, title, prompt, dependencies, priority, timeoutSeconds, retryLimit | Task ที่ยังไม่อนุมัติ |
| create_workflow | projectId, objective, mock | Workflow และ 8 steps ที่ persist |
| queue_action | taskId, action, note? | approve/retry/cancel/accept_review/rework; approve ใช้ native dialog |
| queue_events | taskId | Persisted task history |
| scheduling | paused | เปลี่ยน scheduling พร้อม audit |
| snapshot | ไม่มี | เพิ่ม tasks, workflows, schedulerPaused |

start_run รองรับ mock/codex/claude/antigravity แต่ปฏิเสธ taskId จาก renderer เพื่อไม่ bypass queue authorization Logs/artifacts/usage ใช้ execution_events เดิม ค่า usage มาจาก CLI เท่านั้น ไม่ประมาณค่าใช้จ่าย

## Adapter policy และข้อจำกัด

- Codex: documented `exec --json`, read-only sandbox, ignore user config, no ephemeral session resume
- Claude: print stream-json/plan, allow เฉพาะ Read/Glob/Grep, deny shell/edit/write/Agent, safe-mode, strict empty MCP และ no slash commands; installed 2.1.199 ยังไม่เปิด writing tools ผลทดสอบจริงติด login
- Antigravity: `--output-format stream-json --mode plan --sandbox --print <prompt>` ต้องวาง print ก่อน prompt โดยตรง การใช้ disable-slash-commands ร่วมกับ plan ทำให้ plan command ไม่ทำงานจึงไม่ใช้ flag นั้น Sandbox/plan เป็น runtime controls ต้องตรวจ local configuration; ไม่ใช่ VM isolation
- Mock: ผลลัพธ์ติด MOCK ทุกครั้ง สำหรับ deterministic tests เท่านั้น

ทุก adapter ใช้ constrained Rust process runner เดียวกัน: argument arrays, limited environment, stdout/stderr bounds/redaction, persisted execution/PID/session, timeout/cancel และ Windows Job Objects การตรวจ success ต้องมี structured terminal success และไม่มี runtime error/permission denial ไม่ถือ exit 0 เพียงอย่างเดียวเป็น success

UI ใช้ QueueBoard สร้างเพิ่มตาม theme เดิม อ่าน Lucian #255 เป็น reference แล้วไม่ได้ใช้ drag-and-drop เพราะสถานะต้องมาจาก engine/approval ส่วน ActivityTabs เดิมยังใช้ Lucian #039 และคง license เดิม
