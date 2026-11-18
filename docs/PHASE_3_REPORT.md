# ผล Phase 3 — Central API / Web / secure remote control

วันที่ตรวจ 2026-11-18 Asia/Bangkok · source `D:\Projects\astraops` · ไม่มี HEAD commit และไม่ commit/push/deploy

## สิ่งที่ implement และใช้งานจริง

- `apps/api`: Fastify 5.12.8, PostgreSQL, Drizzle 0.45.4 schema/migration/version/advisory lock, secure owner sessions, scrypt password hashes, CSRF/Origin checks และ rate limits
- Pairing 256-bit single-use code อายุ 5 นาที, revocable device token เก็บ hash ฝั่ง API และ Windows Credential Manager ฝั่ง Desktop ไม่ส่ง token ให้ renderer หรือเก็บ CLI account credentials ที่ API
- Desktop outbound HTTPS/WSS พร้อม certificate verification/private CA ที่เลือกเอง, heartbeat/reconnect, explicit per-project sharing และ opt-in sanitized logs/artifacts
- Remote actions: submit draft, start งานที่มี exact local approval แล้ว, cancel, pause future scheduling, status refresh ตรวจ backend ownership/online/shared project/schema/runtime binding และตรวจซ้ำที่ Core
- Durable local command claim/idempotency/payload binding, remote/local task ID mapping, event acknowledgment/dedup และ snapshot reconciliation ไม่มี remote terminal/arbitrary binary/path/args หรือ remote writing approval
- `apps/web`: React/Vite/TanStack Query แยก build/deploy จาก Desktop มี login/logout, pairing/revoke, devices/actual online, shared projects/workflow status/task dependencies, draft submission, controls/command acknowledgments และ logs
- Shared CrewBots/font/design components; Lucian [#039 Sliding pill tabs](https://lucianlabs.dev/uxui-prompt/#039) ใช้ใน Execution activity จาก component ที่ port ไว้เดิม ตรวจ source ต้นฉบับซ้ำแล้ว ปรับเป็น real remote execution groups/Thai text/map theme tokens รักษา interaction/motion และ MIT attribution; modal/device/task layout เป็น component ใหม่ใน theme เดียวกัน
- Dockerfiles/Compose/Nginx TLS template/env examples และคู่มือ run/build/pair/security/ownership/rollback ที่ [PHASE_3_REMOTE.md](PHASE_3_REMOTE.md)

## ผล E2E จริง

รัน Node integration test ด้วย PostgreSQL 18.4 cluster แยกใน `.local/phase3-dev/pg` port55439, Fastify HTTPS7443, Web HTTPS7444, Chromium/Google Chrome และ Windows Rust Core executable `remote_host.exe` ใช้ WSS/TLS จริง ไม่ใช่ mocked API/WebSocket หรือ browser IPC fixture

ผลรอบสุดท้าย: **PASS**, 77.8 วินาที

| หลักฐาน | ค่า |
|---|---|
| Device | `3e25b2f7-729f-44e3-800d-4aa886cb2090` |
| Approved synthetic project | `7d48afb3-12c2-4626-9f4a-8670ff020444` |
| Mock success execution | `6d839785-b6f1-424e-bd86-99bfb4ed5e03` |
| Real Codex execution | `aafd38d9-ce84-4589-bf91-a5471f913eec` |
| Codex artifact | `CREWNEST_REMOTE_CODEX_OK` |
| Evidence root | `.local/phase3-dev/e2e-b5735b9d-2b99-43cb-af6d-2af590fdd86d` |

ตรวจผ่านจริง:

1. ไม่มี session → 401; wrong password → 401; wrong Origin/CSRF → 403; owner อื่นอ่าน device commands ไม่ได้ → 404
2. Pair ผ่าน HTTPS แล้ว credential roundtrip กับ Windows Credential Manager; code เดิมใช้ซ้ำไม่ได้ และ browser Origin ใช้ device socket ไม่ได้
3. Web login/เลือก device/ส่ง Mock draft ผ่าน modal ได้; start ก่อน local approval ถูก Core reject และไม่มี execution
4. หลัง isolated test harness อนุมัติ exact local task แล้ว start ผ่าน WSS ได้, duplicate idempotency key ไม่เพิ่ม execution, เปลี่ยน action ด้วย key เดิม → 409
5. Mock completed จริงใน Rust Core พร้อม labeled Mock logs/artifact ถึง Web ไม่อ้างว่าเป็น AI output; remote snapshot ไม่มี workspace paths
6. Browser screenshot ที่ desktop1440px/mobile375px ทั้ง dark/light, reduced-motion และไม่มี horizontal overflow; logout ผ่าน Web แล้วกลับ login
7. Mock task อีกงานถูก cancel ขณะ running แล้ว status canceled; pause scheduling ใช้ได้และไม่อ้างว่าหยุด process ที่รันแล้ว
8. Disconnect → offline จริง; คำสั่งใหม่ถูก reject 409 ไม่ queue ไว้แอบรัน หลัง reconnect completed task ไม่ execute ซ้ำ
9. Codex authenticated จริง, local approval จริงผ่าน test harness, remote Start → genuine local Codex run → artifact/logs กลับ API ผ่าน WSS โดยไม่ substitute Mock
10. Revoke → credential/connection ใช้ต่อไม่ได้และ status offline; คำสั่งใหม่ถูก reject 403

`result.json`, `host.db`, `ready.json`, `web-desktop.png`, `web-mobile.png`, `web-mobile-light.png` อยู่ใน evidence root ข้อมูลเหล่านี้เป็น local-only ไม่รวม commit/source bundles

## ปัญหาที่พบและแก้

- Remote Cancel ทันทีหลัง Start เคยหา lastExecutionId ไม่พบเพราะรอ scheduler reconcile: เพิ่ม reconcile หลัง start/ก่อน command effect และ regression เรียก start→duplicate→cancel โดยไม่มี scheduler tick
- OpenSSL ของเครื่องหา global config ไม่พบ: ใช้ config เฉพาะ test directory ไม่เปลี่ยน OS config/trust
- Browser test ครั้งแรกไม่มี bundled headless Chromium: ใช้ Google Chrome ที่ติดตั้งจริง การแก้ expectation ของ socket rejection เป็น403 ตรงกับ browser-Origin guard
- SQLite migration expectations เดิมยังเป็น3: อัปเดต expected schema4 และ future-schema refusal เป็น5 โดยคง preservation assertions
- Desktop fixture checkbox selector เดิมไม่ scoped: จำกัด approval checkbox ให้อยู่ใน execution dialog หลังมี pairing CA checkbox ใหม่
- เพิ่ม sanitize Windows absolute/UNC paths ใน published texts นอกเหนือจาก known-token/environment redaction, bounded published task/event batches และ runtime binding ฝั่ง API; ไม่อ้างว่าเป็น DLP สมบูรณ์

## Checks / builds

| Check | ผล |
|---|---|
| Rust Core | 39 passed: process7 + foundation12 + orchestration10 + remote5 + writing5 |
| Tauri IPC | 1 passed |
| Vitest | 4 passed |
| Desktop Playwright regression | 9 passed |
| PostgreSQL/HTTPS/Web/WSS/Rust/Codex integration suite | 1 passed, ไม่มี skipped |
| TypeScript strict / API TypeScript build / ESLint | ผ่าน |
| Clippy | ผ่าน |
| Independent Web/API builds | ผ่าน |
| Windows release `--no-bundle` | ผ่าน |

รวม **54 automated tests** (E2E suite นับเป็น1 มีหลาย scenario ภายใน) ไม่รวมผล Native Phase2 ที่รันใน turn ก่อน

Desktop executable: `target/release/crewnest-desktop.exe`

SHA256: `021F2BB7E99B7F302D183621FEB99248910D6C48C0BD458D50DD8C807AF6AF98`

เปิด native release ได้จริง หน้า Secure remote control พร้อม pairing form/status; production localDB migrate3→4 integrity `ok`, 2projects/12executions เดิมครบ ไม่มี running และ scheduler paused ไม่ย้ายข้อมูล harness มาทับ production DB ไม่ pair production Desktop อัตโนมัติ สำรองก่อน/หลังที่ `.local/phase3-baseline/before.db` / `after.db` และ source snapshot

Code graph generation หลัง implementation: 735 nodes / 2621 edges (`crewnest`) ส่วน migrations/examples/browser fixtures/docs อยู่นอก coverage จึงตรวจไฟล์และ execute แยก

## ข้อจำกัดและงานที่ยังต้องตรวจ

- E2E เป็น network/TLS/process จริงบนเครื่องเดียว ใช้ isolated Windows Core host และ local harness approvals ไม่ใช่การกด native pairing/approval ครบทุกขั้นใน production Desktop และไม่ใช่ owner final UAT sign-off ข้ามเครื่อง/Internet ยังไม่ได้ตรวจ
- Remote approvals ของ execution, plan/UAT gate, exact writing apply/rollback/high-risk operations ยังต้องทำที่ Desktop ไม่เปิด approve/reject high-risk จาก Web; Web ยกเลิก eligible task ได้ Phase3 นี้จึงยังไม่ครอบคลุมทุก remote approval action ใน MASTER BUILD PROMPT
- Browser realtime ใช้ authenticated HTTPS polling 1.5วินาที; device realtime ใช้ authenticated WSS ทุก2วินาที Snapshot เป็น bounded replica ไม่ใช่ full remote filesystem/session/terminal
- Native app ไม่ auto-connect remote หลัง restart ต้องกด Connect remote เอง; reconnect ขณะ service active ทำอัตโนมัติ Revocation ไม่ terminate local runs ที่เริ่มไปแล้ว
- Crash window หลัง command claim อาจจบเป็น interrupted/rejected โดยไม่ replay ไม่รับรอง exactly-once completion ในทุก failure model ใช้ idempotency/approval consumption/snapshot เพื่อกัน execution ซ้ำและตรวจผลจริง
- ใช้ single API instance/in-memory active socket registry; ไม่มี horizontal scaling, MFA/password recovery UI, server-side retention/archival หรือ comprehensive adversarial security audit ยังไม่ใช่ public production readiness
- API owner/bootstrap/start เพิ่มเติมถูก automatic approval review ปฏิเสธคำสั่ง โดยระบุเพียง `blocked by policy`; ไม่ฝืนคำสั่งนั้น ไม่อ้างว่าเปิด persistent API/owner instance ทิ้งไว้แล้ว API test instance ปิดหลัง suite มีคำสั่งเริ่ม service ให้เจ้าของรันเองในคู่มือ
- Docker daemon มี แต่ไม่มี `docker compose` plugin ในเครื่อง จึงยังไม่ได้ตรวจ Compose deployment/image build/public trusted certificate/ingress และ installer เป็น Phase4
- Private local CA ใช้เฉพาะ explicit test trust (`NODE_EXTRA_CA_CERTS`, Rust supplied CA, isolated browser test context) ไม่ติดตั้ง certificate ลง OS ไม่แก้ firewall/Windows service ไม่ปิด production TLS verification
- Adapter ที่ทดสอบ remote จริงรอบนี้คือ Mock และ Codex; Claude/Antigravity remote execution ยังไม่ได้ทดสอบซ้ำ Writing workflow Phase2 คงเดิมและผ่าน regression

## วิธีใช้และหลักฐานอ้างอิง

ใช้ [PHASE_3_REMOTE.md](PHASE_3_REMOTE.md) สำหรับ setup/pair/build/deploy/test/rollback และ local credentials ไม่ส่ง password/token มาใน chat

เทคนิคอ้างอิงที่ตรวจระหว่าง implementation: [Fastify WebSocket](https://github.com/fastify/fastify-websocket), [Fastify Cookie](https://github.com/fastify/fastify-cookie), [Fastify Rate Limit](https://github.com/fastify/fastify-rate-limit), [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql), [Tokio Tungstenite](https://docs.rs/tokio-tungstenite/latest/tokio_tungstenite/index.html) เวอร์ชันที่เลือกจริงล็อกใน pnpm/Cargo lockfiles
