# Security — Phase 1 implementation และข้อจำกัด

## สิ่งที่ enforce แล้ว

- ไม่มี HTTP execution endpoint, remote terminal, shell plugin, generic process command หรือ arbitrary frontend file API
- Workspace root รับผ่าน Rust-owned native picker; canonicalize, reject missing/files/drive roots/network paths/system directories และ reject duplicate directories
- ตรวจ approved path อีกครั้งก่อน start ใช้ runtime binary ที่ detect จากชื่อ CLI คงที่ ไม่รับ executable หรือ shell args จาก renderer ตรวจ SHA-256 เทียบ diagnostics ก่อน execute
- Native confirmation แสดง adapter/executable/workspace/prompt และ read-only scope ทุกครั้งก่อน run พร้อม persisted approval/audit; backend ปฏิเสธ `approved:false`
- Codex ใช้ fixed arguments, stdin prompt, read-only sandbox, ignored user config, ephemeral session และไม่ใช้ bypass flags Agent/runtime binding ตรวจใน Rust; Mock override มี label ชัดเจน
- Child environment ใช้ allowlist ของ OS/CLI/auth/proxy variables ไม่ inherit secrets ของ services อื่นทั้งหมด
- Windows Job Object ใช้ kill-on-close; timeout/cancel terminates job แล้วรอ child เก็บ PID/session/logs จำกัด event 32KB และ output ต่อ run 2MB Execution timeout 120s
- Transaction/unique indexes จำกัด concurrent run ต่อ workspace และ agent Exclusive file lock ป้องกันหลาย Desktop instance ใช้ DB เดียวกัน
- Log/prompt/error redaction สำหรับ known token patterns และ sensitive environment values; frontend ใช้ text rendering ไม่ inject runtime output เป็น HTML
- CSP จำกัด assets/IPC ของแอป; capability มีเฉพาะ main local window ไม่มี remote origins; UI ไม่เก็บ secrets ใน frontend bundles

## ข้อจำกัดที่ต้องรู้ก่อนใช้

Read-only sandbox เป็น policy ของ Codex ที่ติดตั้ง ไม่ใช่ VM/container หรือการรับรองว่า process อ่านได้เฉพาะ approved directory การอนุมัติ workspace กำหนด working directory และขอบเขตงาน แต่ไม่ได้เป็น OS allowlist ของทุก filesystem read ห้ามใช้กับ untrusted prompts หรือ sensitive workspaces โดยอ้างว่าได้ isolation เต็มรูปแบบ

การตรวจ binary hash ลด accidental binary replacement แต่มีช่วงระหว่างตรวจ/สร้าง process และช่วงก่อน assign job; ไม่ใช่การป้องกัน local administrator หรือ malicious same-user process ไม่มี code-signature allowlist และยังไม่ได้ทำ adversarial sandbox audit

Redaction ไม่ใช่ DLP ครบทุกชนิด ห้ามใส่ secrets ใน prompts/logs ภาพ native picker/confirmation ยังรอ manual Windows UAT และการทดสอบผ่านแอปจริงครบเส้นทาง

Phase 1 ไม่เปิด writing/high-risk execution policy, remote auth/pairing, device secrets หรือ privileged operations การทำ approval แบบละเอียดสำหรับ push/protected branch/deploy/delete/outside-workspace/new integration เป็น Phase 2–3 และ agents อนุมัติเองไม่ได้ ไม่เพิ่ม OS-backed secret store จนกว่าจะมี device credentials ที่ต้องเก็บ

## Backup และ rollback

ใช้ app-local data แยกจาก source; debug ใช้ subdirectory `development` หรือ `CREWNEST_DATA_DIR` ที่ user ตั้งเอง เปิดแอป production ใช้ app-local data ของ `local.crewnest.desktop` ไม่มี autostart

หยุด Desktop/active runs ก่อนทำ backup SQLite; ใช้ SQLite backup API/tool ที่เหมาะสมหรือเก็บ DB/WAL/SHM ให้สอดคล้องกันพร้อมปิด app ไม่ลบ project directories ขณะ rollback source ย้อน source/dependency lockfiles และใช้ DB backup ที่ schema compatible ห้าม downgrade หรือ reset DB อัตโนมัติ
