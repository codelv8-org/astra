# Local IPC contracts

Phase 2 เพิ่ม create_task/create_workflow/queue_action/queue_events/scheduling และขยาย snapshot/start_run ดู contract ปัจจุบันใน [PHASE_2_WORKFLOWS.md](PHASE_2_WORKFLOWS.md) ตารางด้านล่างเป็นฐาน Phase 1; adapter ปัจจุบันรองรับ mock/codex/claude/antigravity

## ฐาน Phase 1

Renderer เรียกเฉพาะ Tauri commands ผ่าน `apps/desktop/src/bridge.ts`; payload ใช้ camelCase และ server ตรวจซ้ำ ไม่มี REST execution API

| Command | Input | Output / ข้อจำกัด |
|---|---|---|
| snapshot | ไม่มี | agents, projects, latest 100 executions, dataPath, remoteStatus=not_configured |
| diagnostics | ไม่มี | install/version/auth/executable/supported/message ของ adapters |
| create_project | name 1–100 chars, goal ≤4000 chars | Rust native directory picker แล้ว persist; cancel คืน null; ไม่รับ path จาก renderer |
| start_run | request: projectId, agentId, adapter=mock/codex, prompt 1–8000 chars, approved=true | Native confirmation → auth/path/agent checks → Execution พร้อม stable task/execution IDs |
| execution_events | executionId, after | Cursor หลัง event ID; sorted, max 500 events |
| cancel_run | executionId | Request cancel เฉพาะ active run ที่ Core เป็นเจ้าของ |

Frontend Zod validation อยู่ packages/shared Rust RunRequest ใช้ deny_unknown_fields ไม่รับ executable/args/script จาก frontend Event `execution-event` emit หลัง persist แต่ UI ใช้ cursor polling เพื่อ recover missed events

Remote protocol schema อยู่ packages/protocol สำหรับ Phase 3 เท่านั้น ยังไม่มี transport, session auth, device credentials, authorization, expiry execution handler หรือ exactly-once delivery implementation
