# รายงาน Phase 2 — 2026-11-17

รายงานนี้เป็น snapshot ก่อนเพิ่ม staged writing ดูสถานะต่อเนื่องล่าสุดใน [PHASE_2_WRITING_REPORT.md](PHASE_2_WRITING_REPORT.md)

Source root `D:\Projects\astraops` ยืนยันโดยผู้ใช้; เป็น local worktree ยังไม่มี HEAD commit ไม่ได้ commit/push หรือ deploy ผลต่อไปนี้มาจากการรันจริงบนเครื่องนี้ ไม่ใช่ hosted CI หรือ human owner final UAT sign-off

## สิ่งที่ทำเสร็จ

- เพิ่ม Claude Code และ Antigravity native adapters ร่วมกับ Codex ใช้ constrained runner เดิม พร้อม structured terminal parsing, error/auth handling, persisted logs/artifact/session/usage และ cancellation/timeout controls
- SQLite schema 2 แบบ transaction เก็บ task definitions, dependency graph, workflows, approval fingerprints, scheduler และ handoff/event history โดยไม่ทับ custom agent records/schema1 history
- Persisted queue: assignment, priority, timeout, bounded retry, dependency gating, project/agent execution locks, manual approvals, pending/running cancellation และ pause เฉพาะ scheduling หลัง restart ไม่ auto replay
- Workflow 8 steps: ASTRA plan → human plan gate → VECTOR architecture → MIRA design → FORGE implementation proposal → SCOUT review → human UAT → ASTRA summary รองรับ FORGE/SCOUT rework สูงสุด 2 รอบก่อน escalate
- Task/Workflow Board, modal create/detail/history, workflow filter, approval/retry/cancel/rework และเปิด execution logs จาก task ได้ ไม่มี drag-and-drop ที่ bypass engine state
- คง Tauri Windows local-first boundary ไม่มี public execution API หรือ browser shell เพิ่มขึ้น แยก Web/API/remote control ยังไม่ได้ implement

Source หลัก: `packages/desktop-core/src/adapters.rs`, `runtime.rs`, `queue.rs`, `store.rs`, `models.rs`, migration `002_orchestration.sql`, `apps/desktop/src-tauri/src/main.rs`, `apps/desktop/src/QueueBoard.tsx` และ shared contracts

## ผลตรวจ

| รายการ | ผล |
|---|---|
| TypeScript / ESLint / Rust Clippy | ผ่าน |
| Rust Core | 26 tests ผ่าน: process fixtures 6, foundation 12, orchestration 8 |
| Headless Tauri IPC | 1 test ผ่าน ใช้ SQLite จริง; ไม่ใช่ native UI |
| Vitest | 4 tests ผ่าน |
| Playwright | 7 tests ผ่าน รวม queue IPC fixture; ไม่อ้างว่าเป็น native CLI execution |
| Windows release build | ผ่าน `pnpm desktop:build` |
| Full Mock workflow | ผ่านหลังแก้ review transition: 6 executions + 2 human gates + 1 explicit review acceptance โดย test harness |
| Real Codex queue | ผ่าน 2 dependent tasks และ predecessor artifact handoff |
| Real Antigravity | ผ่าน plan/sandbox stream-json พร้อม result/session/usage |
| Real Claude | ไม่ผ่าน authentication: `Not logged in · Please run /login`; persist failed ตามจริง |
| Native Windows | สร้าง workflow, native approval, queue/resume, Mock success, เปิด logs, pause และ restart persistence ผ่าน |

รวม automated tests 38 รายการแยกจาก smoke runs ด้านล่าง การ cancel/timeout/process tree ใช้ executable fixtures จริง; Phase 1 มี real Codex native cancel แล้ว Phase 2 ไม่ได้ทำ real Claude/Antigravity cancellation แยก

## หลักฐาน smoke และ Native UAT

- Full Mock workflow หลัง fix: `21c69375-fa94-442a-9ca1-ba5fbec7fb89` ใน `.local/phase2-workflow-smoke/workflow.db` เป็น completed มี execution_finished 6, human_approved 2, review_accepted 1; harness ตรวจว่าห้ามข้าม SCOUT needs_review และห้ามเหลือ authorization หลังจบ
- Real Codex tasks `cf597b64-7900-4145-af93-bff2059f4ba1` → `bda75683-939c-4c62-8cb0-dcea0da6cbc5` ใน `.local/phase2-real-queue/queue.db` ทั้งสอง completed; งานแรกส่ง `CREWNEST_QUEUE_HANDOFF_42` งานที่สองตอบ `CREWNEST_QUEUE_HANDOFF_42 VERIFIED`
- Antigravity 1.5.10 run `eeba98eb-f55f-4edf-8981-5f656ce803d0` completed ตอบ `CREWNEST_REAL_ADAPTER_OK` ใน `.local/smoke/crewnest.db`; underlying CLI เปลี่ยนจาก 1.4.3 เป็น 1.5.10 ระหว่างตรวจ ไม่ได้สั่งอัปเดต CLI หรือแก้ credentials
- Claude 2.1.199 run `f04a54b7-32b2-473f-9374-ec4f556b247a` failed จาก login แม้ probe ก่อนหน้านั้นเคยแสดง authenticated ต่อมาวินิจฉัยเป็น unauthenticated ไม่สร้าง fake result หรือ login แทน user
- Native workflow `38595a26-2f05-40b1-aeae-e9d0f740a11d` สร้าง 8 steps ผ่านแอป release; ASTRA Mock execution `0c9f55d2-1dbc-4108-aa73-ba144ecac43a` completed แล้วหยุดรอ human plan gate ไม่อนุมัติ UAT แทนเจ้าของ
- Native DB `%LOCALAPPDATA%\local.crewnest.desktop\crewnest.db` schema2, integrity_check=ok; project เดิม 1 และ execution history เดิม 5 ยังอยู่ เพิ่ม Mock native queue อีก 1 รวม 6 หลัง restart ยังอยู่ scheduler paused และไม่มี running execution
- Final executable `target/release/crewnest-desktop.exe` SHA256 `C8D4C4CC9E07C1EC1945B61DDCA658F304C90DA9F44199120C83D29B3E6A3A09` เปิด native หลัง rebuild ได้จริง เป็น unsigned executable ไม่ใช่ installer

## ปัญหาที่พบและแก้

1. Antigravity print arguments: วาง `--print` ต่อด้วย prompt โดยตรง มิฉะนั้น flag ถัดไปถูกตีความเป็น prompt และ CLI ล้มเหลว เอา disable-slash-commands ออกเพราะขัดกับ system plan command ตรวจ init event มี plan และผล terminal SUCCESS จริง
2. Task finish transition: Store เคยอัปเดต queue task completed ก่อน reconcile ทำให้ข้าม SCOUT needs_review และขาด execution_finished เปลี่ยนให้ finish อัปเดต task legacy เท่านั้น ส่วน queue reconcile เป็นผู้ตัดสิน transition พร้อม consume approval เพิ่ม regression ที่ reconcile running ก่อน finish และตรวจ completion event/authorization
3. Retry ต้องไม่อ่านผลรันเก่าเป็นผลใหม่ แก้เงื่อนไข reconcile พร้อม regression เดิมผ่านหลัง fix
4. Native confirmation เป็น separate window; automation ที่คลิก parent จะเปิด parent บัง dialog ต้องเลือก returned dialog window โดยตรง ไม่ใช่ queue deadlock

## ข้อจำกัดที่ยังไม่เสร็จ

- **Phase 2 ยังไม่ครบ MASTER BUILD PROMPT ด้าน writing agents** ทุก real adapter ใช้ read-only/plan; FORGE ส่ง implementation proposal/artifact ยังไม่แก้ source หรือรัน arbitrary project test commands Claude installed 2.1.199 ยังไม่ได้ยืนยัน outside-workspace write guard ที่จำเป็น ไม่เปิด unrestricted bypass เพื่อให้ demo ผ่าน
- Claude ต้องให้เจ้าของ login เองก่อนตรวจ successful model execution รอบใหม่ Full real workflow ทั้งห้า agents ยังไม่ผ่านเพราะ Claude auth และ writing policy
- Runtime plan/sandbox ไม่ใช่ VM isolation โดยเฉพาะ Antigravity ยังต้องตรวจ local runtime permissions/config ก่อนใช้กับข้อมูลอ่อนไหว Prompt ของ agy ส่งผ่าน argv ตาม print interface; อาจมองเห็นจาก local process inspection จึงไม่ควรใส่ secrets
- Rework/failure decision ให้ human ตรวจ SCOUT artifacts ไม่ได้อ้างว่า model วิเคราะห์ผล QA อัตโนมัติได้ครบ ไม่มี autonomous retry จ่ายเงินเอง
- Session resume, model/config editing UI, parallel Git worktrees, exported project reports และ richer artifact attachments ยังไม่ทำ Handoff text จำกัด 3000 chars ต่อ dependency และ effective prompt รวม 8000 chars
- Separate Web/API, PostgreSQL, pairing/remote transport อยู่ Phase 3; installer/signing/packaging อยู่ Phase 4 ไม่มี production deployment หรือ hosted CI ในรอบนี้
- Public brand/trademark clearance และ artwork distribution license approval ยังรอเจ้าของตาม ASSET_LICENSES.md

## วิธีใช้และ rollback

เปิด executable ข้างบน หรือ `pnpm desktop` ดู [MANUAL.md](../MANUAL.md) และ [PHASE_2_WORKFLOWS.md](PHASE_2_WORKFLOWS.md) สำหรับ workflow/adapter commands ข้อมูลปัจจุบันคงไว้ในเครื่องและ scheduler ถูกพักหลัง Native UAT

Backup ก่อน schema2 อยู่ `.local/phase2-baseline/source.zip` และ `crewnest.schema1.db` หาก rollback ต้องปิด Desktop สำรอง schema2 ปัจจุบัน แล้ว restore schema1 คู่กับ binary/source เดิม ห้าม downgrade DB schema2 ด้วย executable Phase 1

Graph refreshed 502 nodes / 1605 edges; migrations/examples/assets/browser fixtures อยู่นอก coverage และตรวจโดยตรง รายงานนี้เป็นการส่งมอบ local orchestration ที่ทดสอบแล้วพร้อมข้อจำกัด ไม่ใช่การรับรอง full MVP
