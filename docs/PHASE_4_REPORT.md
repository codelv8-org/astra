# CrewNest Phase 4 — ผลตรวจและแพ็กเกจ Windows

ทดสอบ 2026-11-19 บน Windows x64 จาก `claude/home-3d-ceo-chat` ฐาน commit `db65663a1e981fc7d7215717e664bb6d5290ddff` พร้อมการแก้ไข Phase 4 ใน working tree

## ปิด Web E2E บน staging HTTPS

- ตั้ง Compose project `crewnest-phase4-staging` กับ PostgreSQL volume ใหม่ ใช้ Cloudflare Quick Tunnel ออก HTTPS ด้วยใบรับรองสาธารณะ และตรวจ TLS จาก tunnel agent ถึง Nginx ด้วย origin CA PostgreSQL เปิดเฉพาะในเครือข่าย Compose ใช้บัญชีทดสอบและโปรเจกต์สังเคราะห์เท่านั้น
- เปิด staging ผ่าน `@Browser` ของ session นี้โดยตรวจใบรับรองตามปกติ แล้ว login สร้าง pairing code จาก Web UI และใช้กับ Windows Core harness เห็นอุปกรณ์ `8d32052e-0987-4471-9038-9b2f86acba2a` ออนไลน์พร้อมโปรเจกต์ที่แชร์
- ส่ง draft ผ่าน Web แล้วเห็น `submit accepted` และ Start ปิดอยู่ เมื่ออนุมัติที่เครื่องผ่าน test harness แล้ว Start เปิด กด Start จาก Web ได้ `start accepted` และ execution `b26bbdb7-b782-4e30-b3ea-810249e633ae` จบ `completed` แบบ Mock
- ตรวจผลใน Web UI เห็น sanitized logs และ Mock handoff artifact ตรงกับข้อมูลที่เก็บใน SQLite และ PostgreSQL อย่างละ 6 events ครั้งนี้ทดสอบ Mock ผ่าน Web ส่วน Codex จริงมีผลจาก Docker E2E ด้านล่าง
- Revoke อุปกรณ์และออกจากระบบใน Web แล้ว ตรวจ PostgreSQL ยืนยันว่าอุปกรณ์ถูก revoke และ session เหลือ 0 ปิด Windows Core harness แล้วไม่เหลือ credential ของอุปกรณ์ทดสอบใน Credential Manager ปิด tunnel และ Compose ทั้งหมด เก็บ volume แยกไว้สำหรับตรวจหลักฐาน

## Security และ process lifecycle

- `pnpm audit --prod` พบ advisory 2 รายการใน `ws@8.18.3` ระดับสูงและปานกลาง อัปเดต dependency ตรงและ resolution ของ `@fastify/websocket` เป็น `8.21.1` ยืนยันใน API container และ audit ซ้ำได้ `No known vulnerabilities found` [GHSA-96hv-2xvq-fx4p](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p) · [GHSA-58qx-3vcg-4xpx](https://github.com/websockets/ws/security/advisories/GHSA-58qx-3vcg-4xpx)
- ตรวจจาก source และรัน regression ของ trust boundary ฝั่ง Desktop ครอบคลุม project sharing, device/owner binding, exact local approval, runtime binding, TTL, durable idempotency และ snapshot ที่ไม่ส่ง workspace paths ชุด writing ตรวจการปฏิเสธ path traversal, junctions และการ apply ที่ไม่อนุมัติ
- Windows Rust tests ใช้ process fixture จริงตรวจ structured result, non-zero exit, missing completion, oversized output, timeout และ cancellation ยืนยัน child process หยุดหลัง timeout/cancel ส่วน startup recovery ตรวจจากสถานะ interrupted ที่ persist ไว้ และทดสอบว่าเปิด Core instance ที่สองใน data directory เดียวกันไม่ได้
- Rust Core 39 tests, Tauri IPC 1 test, Vitest 11 tests, TypeScript, ESLint, Clippy และ API/Web builds ผ่าน ยังไม่ได้ทดสอบตัดไฟหรือ sleep/resume ของเครื่อง และการทดสอบ audit รอบนี้ครอบคลุม production pnpm graph

## Docker E2E และ offline/reconnect

ทดสอบกับ PostgreSQL, API และ Nginx ของ Compose บน loopback และ Windows Core harness โดยตรวจ TLS ด้วย private CA ของชุดทดสอบ ใช้ HTTPS owner API สำหรับส่งงานและอ่านผล

| Runtime | Execution | ผล | Events |
| --- | --- | --- | ---: |
| Mock | `7c9210a0-66c0-4c51-b3cc-efe48ef731aa` | completed | 6 |
| Codex จริง | `2e6facbf-9eb4-4231-a1a3-cc8f97856cbc` | completed | 3 |

- ทั้งสองรอบตรวจ HTTP 401 เมื่อไม่มี owner session หรือใช้ pairing code ซ้ำ, HTTP 403 เมื่อ CSRF/Origin ไม่ตรงหรือเริ่มงานใน project ที่ไม่ได้แชร์
- สั่ง Disconnect แล้ว API เห็น offline และปฏิเสธคำสั่งใหม่ด้วย HTTP 409 โดยไม่บันทึกเป็นคิว เมื่อ Connect ด้วย device เดิมแล้ว submit → approve ที่ Core → start → execution artifact ผ่านทั้งสองรอบ หลัง revoke ตรวจว่า Core เข้าสู่สถานะ terminal และ credential เดิมถูกปฏิเสธด้วย HTTP 401
- หลักฐานใน `.local/phase3-compose/phase4-*/result.json` หยุด Compose ชุดทดสอบแล้ว
- Browser E2E รอบนี้ยังค้างที่หน้าแรก In-app browser ปฏิเสธ private CA ด้วย `net::ERR_CERT_AUTHORITY_INVALID` จึงยังไม่ได้ยืนยัน login, pairing และ dispatch ผ่าน Web UI รอบ Phase 4
- ผู้ใช้อนุมัติ CA ทดสอบอายุหนึ่งวันสำหรับ `127.0.0.1` ยืนยันว่ามีใน Windows CurrentUser Root แล้ว Nginx เสิร์ฟสายใบรับรองใหม่และ Node.js ที่ระบุ CA ตรวจ TLS ได้ HTTP 200 แต่ `@Browser` ยังแจ้ง `ERR_CERT_AUTHORITY_INVALID` ทั้งแท็บใหม่และเมื่อส่งสายใบรับรองครบ จึงยังไม่ได้ทดสอบ login, pairing, dispatch และการอ่านผลผ่าน Browser
- ถอน CA ทดสอบออกจาก Windows CurrentUser Root แล้ว ตรวจยืนยันว่าไม่มี CA และใบรับรองรายใบใน store ที่ใช้ทดสอบ หยุด Compose ชุดทดสอบแล้ว รอบถัดไปต้องใช้ HTTPS origin ที่ `@Browser` เชื่อถือได้

## Installer และติดตั้งจริง

- NSIS `currentUser` x64 สร้างผ่านด้วย `tools/cargo.ps1 -Action desktop-installer` ได้ `target/release/bundle/nsis/CrewNest_0.1.0_x64-setup.exe` SHA-256 `F1473D43B2710AECE95E68F8D1E66784AEF1C244210EF800BEA5BB815217BF6C`
- ทดสอบติดตั้งจริงผ่าน `/S` ได้ exit code 0 และรายการ CrewNest `0.1.0` ใน HKCU ไฟล์ติดตั้งลง `%LOCALAPPDATA%\CrewNest` เปิด executable จากตำแหน่งนั้นแล้ว Windows รายงาน main window และ process ตอบสนอง การตรวจเนื้อหาหน้าต่างผ่าน Computer Use ถูกหยุดด้วย Escape
- สำรอง SQLite ก่อนติดตั้งด้วย backup API และตรวจ `quick_check` เทียบหลังติดตั้งพบข้อมูล 2 projects, 12 executions และ remote settings/projects/tasks/commands ตรงกับ backup
- ตรวจ UI ซ้ำจาก `%LOCALAPPDATA%\CrewNest\crewnest-desktop.exe` ที่ติดตั้งด้วย NSIS เห็นฉาก Home และปุ่ม Console ใน viewport คลิก Console แล้ว Tauri WebView2 เปลี่ยนเป็น `?view=console` พร้อมแสดง Command Center และสถานะ Desktop Core connected
- Artifact ยังไม่มีลายเซ็น Authenticode ตรวจบนเครื่องเดียวที่มี WebView2 แล้ว การติดตั้งบนเครื่องสะอาดและ upgrade/uninstall ยังไม่ได้ทดสอบ การติดตั้งทดสอบยังคงอยู่ในบัญชี Windows ปัจจุบัน

## Deployment และข้อจำกัด

ใช้ [คู่มือ Windows build และติดตั้ง](../MANUAL.md) และ [คู่มือ Central API / Web / TLS](PHASE_3_REMOTE.md) สำหรับ migration, owner bootstrap และ rollback Web E2E ใช้ staging ชั่วคราวกับ Windows Core harness และ Native Home → Console ทดสอบกับตัวติดตั้งจริงแยกกัน ยังไม่มี deployment ไป production การติดตั้งบนเครื่องสะอาด และการทดสอบ upgrade/uninstall
