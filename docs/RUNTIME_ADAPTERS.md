# Runtime adapters — Phase 2

เพิ่ม FORGE tool-less staged writer ที่ให้ Rust เขียนหลังแยก exact-content approval แล้ว ดู [WRITING_EXECUTION.md](WRITING_EXECUTION.md) และ [ผลทดสอบล่าสุด](PHASE_2_WRITING_REPORT.md) ข้อมูลตารางด้านล่างเป็นฐานก่อน writing extension

Implementation ปัจจุบันอยู่ `runtime.rs`, `adapters.rs`, `queue.rs` ใน `packages/desktop-core/src/` ใช้ runner/process safety ร่วมกันทั้งสาม CLI รายละเอียด policy อยู่ [PHASE_2_WORKFLOWS.md](PHASE_2_WORKFLOWS.md) ผลที่ทดสอบจริงอยู่ [PHASE_2_REPORT.md](PHASE_2_REPORT.md)

| Runtime | Authentication | Execution ที่ตรวจจริง |
|---|---|---|
| Mock | not_required | Full workflow/queue ผ่าน ไม่มี AI model |
| Codex 0.159.2 | login status | Genuine read-only run และ 2-task dependency/handoff ผ่าน |
| Claude Code 2.1.199 | auth status --json | รองรับ plan/stream-json; real run failed เพราะ Not logged in |
| Antigravity 1.5.10 | unknown จน execution | Genuine plan/sandbox print stream-json ผ่าน พร้อม session/usage |

ทั้งสามมี timeout/cancellation/log persistence ผ่าน shared runner แต่ Claude/Antigravity real cancellation ยังไม่ได้ทดสอบแยก Parser errors/permission denials และ missing terminal success ทำให้ run failed Resume session ยังไม่รองรับ Pause หยุดเฉพาะ future scheduling FORGE ยังเป็น implementation proposal ไม่เปิด write tools

## ข้อมูล Phase 1 เดิม

| Runtime | Detect/version | Authentication | Execution |
|---|---|---|---|
| Mock | Built-in 1.0 | not_required | Deterministic labeled steps; ไม่มี model/API |
| Codex | Fixed CLI name และ `--version` | `login status` | JSONL, read-only, timeout/cancel, persistent events/PID/session |
| Claude Code | Fixed CLI name และ `--version` | unknown | unsupported จน Phase 2 |
| Antigravity | `agy` และ `--version` | unknown | unsupported จน Phase 2 |

Missing binary เป็น `installed:false` ไม่ execute Authentication failure/unknown ของ Codex ปฏิเสธ execution ไม่ติดตั้งหรือ login runtime แทน user Installer ของ CrewNest ไม่ได้ติดตั้ง underlying CLI

TypeScript contract อยู่ `packages/agent-adapters/src/index.ts`; Rust implementation อยู่ `packages/desktop-core/src/runtime.rs` และ `store.rs`: detect/getVersion/auth ผ่าน diagnostics, validateConfiguration ผ่าน path/fingerprint/agent checks, start ผ่าน Core::start, streamEvents ผ่าน persisted cursor/Tauri events, requestCancellation ผ่าน Core::cancel, getStatus/getResult ผ่าน Store::execution/events และ cleanup ผ่าน process/job RAII

Resume ไม่รองรับและไม่มีปุ่ม resume Pause process ไม่รองรับ Task scheduling/workflow queue เป็น Phase 2 จึงไม่แสดงว่า pause active process ได้

Supported verified version ในเครื่อง: Codex 0.159.2, Claude Code 2.1.199, Antigravity 1.4.3 เฉพาะ Codex ถูกทดสอบ genuine model execution ไม่ใช้ paid accounts ใน automated fixture tests Custom Codex user-config providers ไม่รองรับเพราะตั้ง `--ignore-user-config`

Codex exit code สำเร็จอย่างเดียวไม่พอ ต้องมี structured `turn.completed` และไม่มี `turn.failed`/`error` จึง mark completed Usage ที่ CLI รายงานอยู่ใน persisted JSONL events; ยังไม่มี cost estimator หรือ usage aggregation

Default role records configurable ใน SQLite แต่ยังไม่มี config-editing UI/model picker/executable picker ใน Phase 1 การแก้ defaults ใช้ได้กับ DB ใหม่เท่านั้นเพื่อไม่ทับ user configuration เดิม
