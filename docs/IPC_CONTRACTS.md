# Local IPC contracts

Phase 2 เพิ่ม create_task/create_workflow/queue_action/queue_events/scheduling และขยาย snapshot/start_run ดู contract ปัจจุบันใน [PHASE_2_WORKFLOWS.md](PHASE_2_WORKFLOWS.md) ตารางด้านล่างเป็นฐาน Phase 1; adapter ปัจจุบันรองรับ mock/codex/claude/antigravity

## ฐาน Phase 1

Renderer เรียกเฉพาะ Tauri commands ผ่าน `apps/desktop/src/bridge.ts`; payload ใช้ camelCase และ server ตรวจซ้ำ ไม่มี REST execution API

| Command | Input | Output / ข้อจำกัด |
|---|---|---|
| snapshot | ไม่มี | agents, projects, latest 100 executions, dataPath, remoteStatus=not_configured |
| diagnostics | ไม่มี | install/version/auth/executable/supported/message ของ adapters |
| pick_folder | ไม่มี | Rust native directory picker; path ที่เลือกถูกจำไว้เป็น approved ในรอบการทำงานนี้; cancel คืน null |
| inspect_folder | path (ต้อง approved ผ่าน pick_folder), projectId? | preview: path, repoRoot, isGit, warning; ปฏิเสธ path ซ้ำ/ซ้อน/repo เดียวกัน (1 folder : 1 repo) |
| create_project | name 1–100 chars, goal ≤4000 chars, folders 1–8 path ที่ approved แล้ว, primary index | persist project + project_folders; projects.path = primary; renderer ส่ง path ที่ไม่ได้มาจาก picker ไม่ได้ |
| add_project_folder | projectId, path (approved) | เพิ่ม folder รอง (กฎ 1 folder : 1 repo) |
| remove_project_folder | projectId, folderId | ลบ folder รอง; ลบ primary หรือ folder สุดท้ายไม่ได้ |
| set_primary_folder | projectId, folderId | สลับ primary และ projects.path ใน transaction เดียว; ปฏิเสธขณะมี run ที่ running |
| storage_info | ไม่มี | status ok/error, error, info: dataDir, mode local/network, dbBytes, freeBytes, previous; ใช้ได้แม้เปิด storage ไม่สำเร็จ (หน้ากู้คืน) |
| pick_storage_folder | ไม่มี | Rust native directory picker; path ที่เลือกถูกจำไว้เป็น approved |
| change_storage_folder | path (approved), useExisting | ปกติ: VACUUM INTO + integrity/row-count check แล้วเขียน storage.json; หน้ากู้คืน: ชี้ไปที่ DB เดิมหรือสร้างใหม่หลัง native confirm; error `EXISTING_DB` เมื่อปลายทางมี DB และ useExisting=false; มีผลหลังรีสตาร์ท |
| revert_storage | ไม่มี | สลับ storage.json กลับไปตำแหน่งก่อนหน้า (ต้องมี DB ที่ใช้ได้) |
| delete_previous_storage | ไม่มี | native confirm แล้วลบเฉพาะไฟล์ crewnest.db* / lock ที่ตำแหน่งเดิม |
| restart_app | ไม่มี | รีสตาร์ทแอปเพื่อใช้ตำแหน่งใหม่ |
| start_run | request: projectId, agentId, adapter=mock/codex, prompt 1–8000 chars, approved=true | Native confirmation → auth/path/agent checks → Execution พร้อม stable task/execution IDs |
| execution_events | executionId, after | Cursor หลัง event ID; sorted, max 500 events |
| cancel_run | executionId | Request cancel เฉพาะ active run ที่ Core เป็นเจ้าของ |

Frontend Zod validation อยู่ packages/shared Rust RunRequest ใช้ deny_unknown_fields ไม่รับ executable/args/script จาก frontend Event `execution-event` emit หลัง persist แต่ UI ใช้ cursor polling เพื่อ recover missed events

Remote protocol schema อยู่ packages/protocol สำหรับ Phase 3 เท่านั้น ยังไม่มี transport, session auth, device credentials, authorization, expiry execution handler หรือ exactly-once delivery implementation
