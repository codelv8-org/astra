# FORGE staged writing — Phase 2

สถานะเพิ่มจาก Phase 2 เดิม: รองรับการสร้าง/แก้ source files ผ่าน trusted Rust Core แล้ว Claude Code ไม่ได้สิทธิ์เขียนไฟล์โดยตรง ไม่เปลี่ยน machine-wide CLI permissions หรือเพิ่ม bypass mode การใช้งาน model จริงยังต้องมี Claude authentication ของเจ้าของเครื่อง

## ขั้นตอนผ่าน Desktop

1. สร้าง real workflow หรือ task ที่ agent=FORGE, runtime=Claude Code หากมี objective/แผนที่เจ้าของอนุมัติแล้ว เลือก New workflow → Approved writing · FORGE → SCOUT → UAT → ASTRA และเอา Mock ออก; Full team 8 steps ยังคง plan/VECTOR/MIRA และ approval gates เดิม
2. เปิด task detail → FORGE · Staged writing ใส่ relative paths หนึ่งไฟล์ต่อบรรทัด แล้ว Review writing scope ตรวจ workspace/paths ใน native dialog ก่อนยืนยัน
3. Core ตรวจ path แล้วเก็บ original UTF-8 contents/null สำหรับไฟล์ใหม่ใน local SQLite สร้าง prompt จาก approved snapshots พร้อม predecessor context ทุก real workflow implementation ต้องตั้ง writing scope ก่อนอนุมัติ run
4. Review & approve queue task → Resume scheduling Claude writer ใช้ permission-mode default, safe-mode, empty MCP, `--tools ""`, output-format json และ JSON Schema โดยอ่าน manifest จาก structured_output ไม่มี file/shell tools ไม่ใช่การเปิด acceptEdits/bypassPermissions; plan mode เดิมทำให้ model คืน prose แทน manifest จึงไม่ใช้กับ writer ส่วน read-only adapter ปกติยังคง plan
5. เมื่อ runtime terminal success Core ตรวจ manifest แล้ว stage ไว้ task หยุดที่ needs_review ไฟล์ใน workspace ยังไม่เปลี่ยน SCOUT ยังเริ่มไม่ได้
6. เปิด detail ตรวจ Before/After ทุกไฟล์ ติ๊กว่าตรวจแล้ว → Approve & apply exact patch ตรวจ SHA256/workspace/paths ใน native dialog หาก bytes/digest/path หรือ original file เปลี่ยนจะปฏิเสธ
7. Rust บันทึก journal ก่อนเขียน ใช้ atomic replacement ต่อไฟล์ แล้วบันทึก patch_applied/audit และปลด dependency ให้ SCOUT หลัง apply สำเร็จ Human review/UAT gates เดิมยังอยู่

ก่อนอนุมัติ SCOUT ที่ยังไม่เริ่ม สามารถกรอก Owner verification evidence → Save review evidence โดยระบุ source/test evidence และผู้รันจริง Core ผูก evidence เข้ากับ exact-prompt approval; แก้ไม่ได้หลัง approved/เริ่ม execution SCOUT ไม่ควรอ้างว่า execute tests เองหาก review จาก evidence หลัง SCOUT จบต้อง Accept review พร้อม note แล้วอนุมัติ human UAT ก่อน ASTRA แยกอีกครั้ง Core ส่งสถานะ gate ให้ downstream prompt เพื่อแยกข้อมูลปัจจุบันจาก predecessor prose เก่า

ผล Native UAT ล่าสุดและข้อจำกัดอยู่ [NATIVE_WRITING_UAT_REPORT.md](NATIVE_WRITING_UAT_REPORT.md)

Writing scope สำหรับ MVP: 1–8 exact paths, parent directories ต้องมีอยู่แล้ว; extensions `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `rs`, `py`, `css`, `html`, `md`, `txt`; approved input snapshots serialized รวมไม่เกิน 3000 bytes; proposed contents รวมไม่เกิน 24000 bytes และ manifest ไม่เกิน 32000 bytes ถ้าเกินให้แบ่ง task

Core ปฏิเสธ absolute/drive/UNC/backslash/traversal/alternate streams, dot directories, Windows devices, junction/reparse points, duplicate paths แบบไม่แยกตัวเล็กใหญ่, protected credential/config-like paths, unsupported types และ known sensitive token patterns ไม่รับ delete operations หรือ executable scripts จาก renderer ไม่สร้างโฟลเดอร์ ไม่แก้ `.git`, `.env`, agent configuration หรือ integrations ไม่มี shell/deploy/push/privileged execution

## Journal และ rollback

SQLite schema3 เก็บ writing_policies และ writing_patches แยกจาก task/approval/execution records มี before bytes, proposed bytes, execution ID และ state `staged` → `applying` → `applied`; rollback เป็น `rolled_back` Journal ต้องอยู่ใน local DB และ backup ของ DB ต้องรักษาสิทธิ์การอ่านตาม workspace

การเขียนหลายไฟล์ไม่ใช่ atomic transaction ทั้งชุด หากเกิด I/O error หรือ crash ระหว่าง apply จะคง `applying` และ block execution ใหม่ทั้ง project ห้าม retry ทับโดยอัตโนมัติ เปิด patch detail ตรวจ journal แล้ว Review rollback พร้อม native confirmation

Rollback ตรวจทุกไฟล์ว่าเป็น bytes เดิมหรือ bytes จาก patch เท่านั้น ไม่ทับ unrelated edits และไม่ให้ rollback ขณะมี active execution/dependent work เริ่มแล้ว ไฟล์ใหม่ที่สร้างโดย patch จะถูกลบเฉพาะหลังยืนยัน rollback ถ้ามี conflict ต้องให้เจ้าของ reconcile เอง เก็บ DB backup ก่อนดำเนินการ ห้ามแก้ journal เพื่อข้าม checks

หลัง rollback task failed และ dependencies blocked การเลือก scope ใหม่สำหรับ context ที่เปลี่ยนต้องสร้าง task ใหม่/จัดแผนใหม่โดย human; ไม่มี automatic merge หรือ force overwrite ที่ซ่อนอยู่

## ขอบเขตความปลอดภัย

CLI อ่าน/เขียน tools ถูกปิดเฉพาะ FORGE staged writer; model ได้เฉพาะ supplied prompt/snapshots และส่งข้อความกลับ Rust เป็นผู้เขียนจริงหลัง human approval การตรวจ known secret patterns ไม่ใช่ DLP ครบทุกชนิด ต้องตรวจไฟล์ก่อนส่ง model

Path checks, same-Core locks และ hash guards ลด accidental escapes/local edit loss ไม่ใช่ OS sandbox ที่ต้าน malicious same-user process/local admin หรือป้องกัน filesystem race ทุกชนิด ต้องใช้ approved trusted workspace และ review model-generated code ก่อน apply โค้ดที่เขียนอาจมีผลเมื่อรันในภายหลัง แม้ไฟล์อยู่ใน allowlist

ไม่ได้เปิด unrestricted writing ของ Claude เวอร์ชันเก่า ไม่ต้องเปลี่ยนเวอร์ชันหรือ auth configuration ของ CLI เพื่อ bypass policy การรับรอง arbitrary multi-file projects, binary assets, renames/deletes, symlinked workspaces, Git-worktree parallel editing และ full adversarial security audit ยังอยู่นอกขอบเขตที่ตรวจแล้ว

## IPC

| Command | Input | ผล |
|---|---|---|
| configure_writing | taskId, paths | Native scope approval → validated snapshots ของ unstarted FORGE/Claude task |
| writing_info | taskId | policy, patch before/after/state และ exact digest |
| writing_action | taskId, action=apply/rollback, digest | Native confirmation แล้วตรวจ digest/ownership/workspace/locks/context ก่อนเปลี่ยนไฟล์ |

Implementation: `packages/desktop-core/src/writing.rs`, migration `003_writing.sql`, `runtime.rs`, `queue.rs`, native Tauri commands และ `apps/desktop/src/WritingPanel.tsx`

อ้างอิง interface ที่ตรวจ: local `claude --help`, `claude auth login --help`, `claude auth status --help` และ official [headless](https://code.claude.com/docs/en/headless), [authentication](https://code.claude.com/docs/en/authentication), [settings](https://code.claude.com/docs/en/settings) ตรวจเมื่อ 2026-11-17 สิทธิ์และ options ที่ใช้จริงตรงกับ CLI 2.1.199 ที่ติดตั้ง
