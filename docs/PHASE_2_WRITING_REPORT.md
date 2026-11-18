# Phase 2 ต่อเนื่อง — staged writing และ real workflow

ผล Native writing UAT เพิ่มเติมวันที่ 2026-11-18 อยู่ [NATIVE_WRITING_UAT_REPORT.md](NATIVE_WRITING_UAT_REPORT.md) รายงานด้านล่างเก็บผล Core/CLI harness เดิม ไม่ใช่ผล native รอบใหม่

วันที่ตรวจ 2026-11-17; source `D:\Projects\astraops`; local worktree ไม่มี HEAD commit ไม่ commit/push/deploy และไม่เริ่ม Phase 3

Code graph หลังตรวจ source ล่าสุด 554 nodes / 2027 edges; migration/examples/fixtures อยู่นอก graph coverage จึงตรวจ source และรันจริงแยก

## Implemented

- FORGE/Claude สร้าง JSON file manifest ด้วย tools ปิดทั้งหมด แล้ว trusted Rust Core stage/validate/review/apply แยก approval ไม่ต้องเปิด unrestricted CLI edits
- Exact-path allowlist, original-content guards, native scope/patch confirmations, Before/After UI, digest binding, per-project locks, apply journal และ guarded rollback; SCOUT รอ writing task completed หลัง apply จริง
- SQLite migration 3 แบบ transaction และ schema2 backup; อ่าน [WRITING_EXECUTION.md](WRITING_EXECUTION.md) สำหรับ bounds, recovery และข้อจำกัด
- เพิ่ม Antigravity denied_actions parsing แม้ CLI รายงาน status SUCCESS ก็ห้ามถือว่างานสำเร็จเมื่อมี permission denial และให้ design handoff ใช้ supplied context โดยไม่เรียก commands
- เพิ่ม real five-agent workflow harness ที่ resume persisted state และ retry เฉพาะเมื่อเรียก `-RetryFailed` อย่างชัดเจน ไม่มี runtime substitution หรือ auto-approve production workflow
- หลัง login จริงพบ plan-mode ตอบ prose แทน manifest จึงเปลี่ยน writer profile เป็น permission-mode default, tools ว่าง, JSON Schema output และอ่าน structured_output โดยตรง ตาม [documented interface](https://code.claude.com/docs/en/headless) ไม่เปิด acceptEdits หรือ bypass permissions
- เพิ่ม follow-up verification ใน workflow เดิมโดย append review/UAT/summary ใหม่และคงประวัติเดิมครบ Test harness ปฏิเสธ automatic review/UAT หาก SCOUT ไม่ให้ QA_VERIFIED; regression ตรวจ fresh approval/dependency gates

## ผลทดสอบที่รันแล้ว

- รอบล่าสุด Rust Core 33 tests ผ่าน: process fixtures 7, foundation 12, orchestration 9, writing 5 รวม actual child-process writer fixture ที่ตรวจ `--tools ""`, JSON Schema, permission-mode default และไม่มี file write ก่อน apply
- Writing tests ผ่าน traversal/protected paths/Windows devices/unapproved paths, Windows junction จริง, local edits, digest mismatch, replay prevention, journal reopen, interrupted apply guard และ rollback
- Baseline ก่อนรอบ login: Playwright 8, Vitest 4, TypeScript และ ESLint ผ่าน; ไม่มีการเปลี่ยน frontend ในรอบนี้ ไม่อ้าง fixture เป็น native model execution
- รอบล่าสุด Clippy และ headless Tauri IPC 1 test ผ่าน พร้อม release rebuild

รวมผลตรวจที่ยืนยันแล้ว 46 automated tests (33 Core + 1 IPC รอบนี้ และ frontend baseline 12) แยกจาก sample Node tests 4/4 และ real model runs ไม่มีการอ้าง paid model success จาก fixture

Windows release build ล่าสุดผ่าน `pnpm desktop:build`; executable `target/release/crewnest-desktop.exe` SHA256 `C32F264BD248313EF48FC528636E7471CC8A1B777B5C9EA7E035F64C88CC5D28` เป็น unsigned executable ไม่ใช่ installer Production local DB แยกจาก harness DB ไม่ย้าย run records ทับประวัติเดิม

## Workflow จริงที่ตรวจ

Workflow `af6ffb2d-cd97-4820-b003-e73fb1198e55` เก็บที่ `.local/phase2-real-workflow/workflow.db`; synthetic workspace `.local/phase2-real-workflow/workspace` มี original counter.mjs และ trusted counter.test.mjs ใช้ task จริงและ runtime binding ของ default roster

| Agent | ผลจริง |
|---|---|
| ASTRA / Codex | plan completed; human plan gate ผ่านด้วย explicit test-harness approval |
| VECTOR / Codex | architecture contract/risks completed |
| MIRA / Antigravity | ครั้งแรก failed เพราะ headless denied command; retry แบบ supplied-context-only completed โดยคง permissions เดิม |
| FORGE / Claude | authenticated จริง ส่ง schema-conforming manifest แล้ว Core stage/apply counter.mjs; run 52e2dc20-b906-46da-b38a-ea39b324e81a completed |
| SCOUT / Codex | รอบแรก shell inspection ถูก policy บล็อก; follow-up review จาก source snapshot/Core test evidence ให้ QA_VERIFIED โดยไม่อ้างว่า model รัน tests เอง |
| UAT gate / ASTRA summary | follow-up gate ผ่านด้วย explicit test-harness approval แล้ว ASTRA สรุปผล/ข้อจำกัดจริง completed; owner final UAT sign-off ยัง pending |

FORGE task `523abb03-adbc-459a-94e2-121ac6681f87`; successful Claude session `ed863b36-c781-43ad-a848-09efba5210b4`; CLI 2.1.199 หลังเจ้าของ login ตรวจได้ `loggedIn:true`, `authMethod:claude.ai` ไม่มีการพิมพ์ token/account metadata หรือแก้ credentials แทนเจ้าของ เก็บ auth failure และ manifest failure เดิมไว้ตามจริง โดยใช้ retry สูงสุดตาม limit เดิม ไม่ reset attempt counter

Workflow integration จบแล้ว: 11 persisted tasks completed (8 ขั้นเดิม + verification follow-up 3), 11 executions รวม success 8 / failed 3 จากประวัติทั้งหมด, patch state applied, SQLite integrity_check=ok, scheduler paused และไม่มี running execution ไม่มีการทำ Phase 3 ผลนี้ยืนยัน real workflow ทั้ง 5 agents ในขอบเขต synthetic task นี้ ไม่ใช่การรับรองทุก Phase 2 scenario หรือ owner UAT acceptance

Core/test harness รัน `node --test counter.test.mjs` จริง ผล 4 passed / 0 failed และตรวจ source ตรงกับ approved patch ก่อนส่งให้ SCOUT Source SHA256 `2221419055226844041e4cfb4d1485e36ccb0ffc15722e4e5a3f08af3e883451`; trusted tests SHA256 `a4060b7d54158fd3b8576e8c42f50c2c401ebfe08839b008324bf3b60744bcc6`

หลักฐานอ่านได้ใน [evidence.json](../.local/phase2-real-workflow/evidence.json), [ไฟล์ที่ FORGE สร้าง](../.local/phase2-real-workflow/workspace/counter.mjs) และ [trusted tests](../.local/phase2-real-workflow/workspace/counter.test.mjs) สำเนา completed DB อยู่ `.local/phase2-real-workflow/completed.db` ทั้งหมดเป็น local synthetic evidence ไม่ใช่ central/remote state

## การตรวจซ้ำ

การต่อรอบนี้ใช้ `-RetryFailed` หลัง login ตามคู่มือ การตรวจ source/test evidence แล้ว append SCOUT/UAT/summary ใหม่ใน workflow เดิม ใช้คำสั่งต่อไปนี้เฉพาะเมื่อต้องการตรวจซ้ำ เพราะจะเรียก paid runtimes อีก:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action real-workflow -Reverify
```

Harness ไม่ overwrite trusted tests ที่มีอยู่ หากเนื้อหาเปลี่ยนจะหยุด ไม่เปลี่ยน runtime policy เพื่อให้ SCOUT shell command ผ่าน ทุก follow-up ต้องมี review/UAT approvals ใหม่ ไม่แก้ status ของประวัติเดิมเพื่อให้ผ่าน

## Backup และข้อจำกัด

ก่อนแก้เก็บ `.local/phase2-writing-baseline/source.zip`, executable เดิม และ `crewnest.schema2.db` เมื่อ rollback ให้ปิด Desktop/active jobs สำรอง schema3 ปัจจุบัน แล้ว restore schema2 คู่กับ binary เดิม ห้าม downgrade DB ด้วย binary เก่า

ยังไม่รองรับ direct Claude file/shell tools, binary files/renames/deletes, arbitrary large patches, automatic merge/force overwrite หรือ parallel worktrees Full workflow รอบนี้รันผ่าน production Rust Core/CLI harness ไม่ใช่ native UI approval ทุกขั้น; native end-to-end staged writing และ owner final UAT ยังไม่รับรอง SCOUT ไม่ได้ execute tests เองและได้เฉพาะ source/test result+hash ไม่ได้เห็น test contents สำหรับ independent model inspection ทุก task/apply ในแอปยังต้อง human review ไม่ bypass runtime permissions Follow-up API อยู่ใน Core/harness ยังไม่มีปุ่มเฉพาะใน Desktop
