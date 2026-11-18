# ผล Native Writing UAT — CrewNest

ทดสอบวันที่ 2026-11-18 (Asia/Bangkok) จาก Windows executable จริงใน `D:\Projects\astraops\target\release\crewnest-desktop.exe` ผ่าน Computer Use ไม่ใช้ browser fixture หรือแก้ SQLite เพื่อข้าม approvals งานอยู่เฉพาะ Phase 2 ไม่มี commit/push/deploy หรือ Phase 3

## ขอบเขตและข้อมูลก่อนทดสอบ

- สำรอง production local SQLite เป็น `.local/native-writing-uat/before.db` และ source เป็น `source-before.zip`; baseline 1 project / 6 executions
- สร้างโปรเจกต์ `Native Writing UAT` ผ่าน native directory picker ไปที่ `.local/native-writing-uat/workspace` ซึ่งมีไฟล์ synthetic เท่านั้น
- ตรวจ runtime ผ่าน Desktop: Codex 0.159.2 authenticated, Claude Code 2.1.199 authenticated, Antigravity 1.5.10 installed / authentication unknown จนกว่าจะ execute; รอบนี้ไม่รัน MIRA/VECTOR ซ้ำ
- เพิ่ม native Approved writing template สำหรับแผนที่เจ้าของอนุมัติแล้ว โดยรักษา Full team 8 steps และทุก scope/run/apply/review/UAT approval แยกกัน

## ผลทดสอบจริง

| รายการ | ผล |
|---|---|
| สร้าง workflow จริง ไม่เลือก Mock | ผ่าน: `85bf8109-43d5-418b-9b45-613518c4e629` |
| FORGE / Claude สร้าง manifest | ผ่าน 2 runs; tools ปิด, scope เฉพาะ `calculator.mjs` |
| ก่อน apply | ตรวจไฟล์เดิมยังไม่เปลี่ยน; SCOUT blocked |
| ตรวจ Before/After | ผ่าน; apply disabled ก่อนติ๊ก content review |
| ปฏิเสธ native apply | ผ่าน: Cancel dialog แล้วไฟล์ไม่เปลี่ยน |
| อนุมัติ exact patch | ผ่าน; Rust เขียนไฟล์จริง, SCOUT จึง ready |
| Rollback | ผ่าน: native approval คืน original bytes ของไฟล์เดิม แล้ว block dependencies |
| Retry หลัง rollback | ผ่าน: ต้องอนุมัติ run และ patch ใหม่ ไม่ replay approval |
| Node tests หลัง apply | ผ่าน 4/4 ทั้งก่อน rollback และหลัง retry/apply |
| SCOUT Codex | ผ่าน: `QA_VERIFIED` จาก operator source/test evidence ระบุชัดว่าไม่ได้ใช้ tools/รัน tests เอง |
| Human review / UAT | ผ่าน native gates ของ isolated test; ไม่ใช่ final product หรือ production sign-off |
| ASTRA Codex summary | execution completed; เก็บผล/ข้อจำกัดจริง ดูหมายเหตุ handoff ด้านล่าง |
| Cancel Claude ที่กำลังรัน | ผ่าน: canceled, PID 18856 หยุด ไม่มี staged patch และ `cancel.mjs` bytes เดิม |
| Logs และ restart | ผ่าน: 2 projects / 11 executions คงอยู่, logs/patch/task history อ่านได้ ไม่มี running และ scheduling paused |
| SQLite integrity | `ok`; baseline execution IDs ยังอยู่ครบ |

Workflow หลักทั้ง 4 tasks completed: FORGE `f10a7748-5eb4-4f28-b5de-ab62608f932c`, SCOUT `73690c8b-be58-4f61-b42a-34fa384fdce1`, UAT `a839d1ed-493b-4a13-aff3-cb94de20ab4d`, ASTRA `a0442d6f-c92d-4ef2-839c-fa3b43a58097`

| Agent / เหตุการณ์ | Execution ID | ผล |
|---|---|---|
| FORGE ก่อน rollback | `f18ea118-55af-4673-a457-b0ed393b4584` | completed |
| FORGE fresh retry | `c7221644-33bc-42f6-ab37-c8aeaa9ddfd7` | completed |
| SCOUT | `de50a07d-f4e9-4249-9a1e-08833d470869` | completed |
| ASTRA | `6fc71659-1493-40ce-87a2-2b49ab789294` | completed |
| ASTRA factual follow-up แยก execution | `00653672-c731-4527-afca-3e530e1cdfc4` | completed บน final build |
| FORGE cancellation | `5ad6afc7-e79e-4f92-bc3b-953e61e696a6` | canceled: `Canceled by owner` |

Cancellation workflow `89737d64-890e-4b95-9085-deb98810835f` ยังคง active โดย FORGE canceled และ downstream blocked ตามจริง ไม่รายงานเป็น completed workflow

## ปัญหาที่แก้และการตรวจ

1. Execution monitor เคย hardcode `CODEX · READ-ONLY` แม้เป็น Claude: แก้ใช้ adapter จริง ตรวจ regression fixture และเปิด release ใหม่เห็น `CLAUDE CODE · canceled · PID 18856`
2. Task event history เคยโหลดครั้งเดียวตอนเปิด modal: เพิ่ม polling พร้อม cleanup; regression ตรวจ event ใหม่หลัง apply โดยไม่ปิด modal
3. Writing scope form เคยแสดงใน retry ทั้งที่ Core ไม่อนุญาตเปลี่ยน scope หลังเริ่มแล้ว: แสดงเฉพาะ attempts=0; native release หลัง restart แสดง approved scope โดยไม่มีช่องแก้ที่ใช้ไม่ได้
4. ASTRA รับ prose จาก SCOUT ที่ยังระบุรอ UAT จึงสรุป conservative ว่า pending แม้ Core gate completed แล้ว: เพิ่ม Core gate status/approved ลง exact prompt ของ downstream พร้อม regression ตรวจ UAT completed/approved และข้อความไม่ใช่ production sign-off ผล ASTRA เดิมคงไว้ตามจริง ไม่แก้ artifact ย้อนหลัง หลังแก้เปิด final build แล้วรัน ASTRA factual follow-up ผ่าน New approved execution/native approval แยก โดยส่งสถานะ Core ที่ operator ตรวจแล้ว ผลภาษาไทยยืนยัน local UAT completed และไม่รับรอง production ใช้ supplied evidence ไม่ใช่การ rerun workflow เดิมทั้งชุด; automatic gate-context path ตรวจด้วย Core regression

เพิ่ม Owner verification evidence ใน SCOUT detail: ใช้ได้เฉพาะ review task ก่อน approval/attempt แรก ผูกกับ approval fingerprint ไม่ยกระดับสิทธิ์ runtime ไม่แก้ underlying CLI credentials/settings

## หลักฐานและผลตรวจ

- Node `node --test calculator.test.mjs`: zero, numbers, reject nonfinite/nonnumber, overflow รวม 4 passed / 0 failed / 0 skipped รันโดยผู้ทดสอบผ่าน terminal ไม่ใช่ SCOUT หรือ native test runner
- Applied source SHA256: `603ba1cda077e98cb8106c0909ec9960a04cf6fc6abb81d311f8ee5631658bdb`
- Trusted tests SHA256: `635a5be183685d48a08925af872aa5831782192e5d685d83196118299d011a53`
- `cancel.mjs` original เป็น UTF-8 พร้อม CRLF; ตรวจ bytes เทียบต้นฉบับ ไม่ normalize newline
- Patch staged digest `b7fafcf70a553a273e5dd5a7894560010f20c2518bb2a1fca8ce65de9ea9a722`; task events เก็บ apply → rollback → fresh retry → apply ทั้งหมด แม้ current patch record แสดงรอบล่าสุด
- หลักฐาน local-only: `.local/native-writing-uat/evidence.json`, `before.db`, `after.db` และ synthetic workspace ห้ามเผยแพร่ SQLite/logs จริงโดยไม่ตรวจข้อมูล
- Automated checks: Rust Core 34 (process 7 + foundation 12 + orchestration 10 + writing 5), Tauri IPC 1, Vitest 4, Playwright 9 รวม 48 tests; fixtures ไม่ใช่ real AI executions
- TypeScript strict, ESLint, Clippy และ Windows release build ตรวจแยกจาก Native UAT
- Final executable SHA256: `CA4103F48202300D55ED19D436455B02E4B3CC6CDD6E5C252EE4F6B72B9689CA`; build ด้วย `pnpm desktop:build` แบบ `--no-bundle` เปิด standalone ได้
- หลัง factual follow-up มี 12 executions / 2 projects; workflow หลักยัง completed, ไม่มี running, scheduling paused และตรวจ backup/integrity อีกครั้ง เก็บผลใหม่ใน `after.db`/`evidence.json`
- Graph ล่าสุด 562 nodes / 2085 edges; docs/migrations/examples/fixtures อยู่นอก coverage จึงตรวจและรันแยก

## ข้อจำกัด

Native UAT นี้ใช้ authorized agent-driven interaction ใน isolated sample ไม่แทนเจ้าของรับรองผลิตภัณฑ์สุดท้าย SCOUT ตรวจ supplied evidence เท่านั้น Writer เป็น tool-less manifest → Rust apply ไม่ใช่ Claude CLI edit/shell session โดยตรง Rollback ทดสอบ existing-file restore ก่อนเริ่ม downstream; ไม่ทดสอบการลบไฟล์ใหม่ผ่าน native UI หรือ multi-file power-loss fault บนเครื่องจริง Bounds/guards เดิมยังใช้

ยังไม่มี Separate Web/API/remote control/installer และไม่เริ่ม Phase 3 ผล five-agent full workflow เดิมอยู่ใน Core/CLI harness แยกจาก native four-step writing continuation รอบนี้
