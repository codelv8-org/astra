# Phase 2 — local orchestration

Source root ยืนยันแล้ว `D:\Projects\astraops`; สานต่อ Phase 1 Native UAT โดยไม่เปลี่ยน trust boundary หรือเพิ่ม remote execution service

1. เพิ่ม native Claude/Antigravity adapters จาก local CLI help และ official headless docs ใช้ structured output, process tree/cancel/timeout/log bounds ร่วมกับ Codex; unknown auth และ permission denials ห้ามกลายเป็น fake success
2. SQLite schema 2 เพิ่ม persisted task details, dependencies, workflow/gates, events/handoff และ scheduler state พร้อม transaction migration/backup ก่อน apply
3. Queue ใช้ priority, max attempts, timeout, per-agent/project locks และ dependency checks ทุก run ต้อง approved task revision; restart scheduler paused โดยไม่ rerun interrupted tasks
4. Default workflow: ASTRA plan → human gate → VECTOR architecture → MIRA UI → FORGE implementation proposal → SCOUT review → human UAT → ASTRA summary มี rework FORGE/SCOUT จำกัด 2 รอบและ escalate
5. UI Task/Workflow Board ใช้ modal forms, task detail/history, human approve/reject, pause future scheduling และ execution monitor เดิม
6. ตรวจ migration จาก schema1, dependency safety, approvals, pause/cancel/retry/rework/restart, adapter parser/process fixtures, real CLI smoke และ build/native integration เท่าที่ environment รองรับ

ข้อจำกัด policy ที่ตรวจพบก่อน implement: Claude installed 2.1.199 ยังไม่รองรับ outside-workspace write guard ที่ official docs ระบุว่าเริ่ม 2.1.314 จึงไม่เปิด writing tools ในรอบนี้ FORGE ส่ง implementation artifact/proposal ให้ human แทน file edits; ไม่อ้างว่าได้ implement code บน project จริง Read-only/plan ไม่ใช่ VM isolation และต้อง review local runtime settings โดยเฉพาะ Antigravity
