# ผล Phase 3 — Central API / Web / secure remote control

## 2026-11-19 — แก้ขนาดฉาก Home และทดสอบ Windows release

- วางแถบนำทางก่อนฉาก 3D ในลำดับหน้า ให้ CSS จำกัด canvas ตามกรอบ `.home-stage` และให้ WebGL ปรับเฉพาะขนาดบัฟเฟอร์วาดภาพ
- `pnpm desktop:build` ผ่าน ไฟล์ `target/release/crewnest-desktop.exe` SHA-256 `EFF6417C57A8E6ABA006834E55100E76B482C4D13B16BD2CBE65574A60ECDB66`
- ทดสอบกับหน้าต่าง Tauri/WebView2 จริงที่ขนาดเริ่มต้น เปิดจากไฟล์ release โดยตรง เห็นปุ่ม Console ทันทีโดยไม่เลื่อนหน้า คลิกแล้วเข้า Command Center ได้ และคลิก Home 3D กลับมาเห็นฉาก 3D อีกครั้ง
- TypeScript, ESLint, Vitest 11 tests และ `git diff --check` ผ่าน รอบนี้ทดสอบบน Desktop โดยตรง ยังไม่เริ่ม Phase 4

## Native UAT หลังแก้ revoke

- ทดสอบ `target/release/crewnest-desktop.exe` SHA-256 `173649346BBEF8AD4FB604D74CA183447EE30B88EAE69B18FBA9EBC81BF2F583` กับ Docker HTTPS/WSS บน loopback ใช้ฟอร์มใน WebView2 จริง กล่องยืนยันและ CA picker ของ Windows จริง
- จับคู่ด้วยโค้ดใหม่ได้ device `537ad464-e88a-452b-94d0-949b71763494` Desktop ขึ้น `connected` และ API ขึ้น online จากนั้น Disconnect และ Connect ทำให้ API เปลี่ยน offline → online ด้วย ID เดิม
- Owner revoke แล้ว Desktop ขึ้น `pairing_required` ปิด Connect และแจ้งให้กด Forget pairing locally แล้วใช้โค้ดใหม่ PostgreSQL มี 2 connection records และปิดทั้งคู่ ภายในช่วงเฝ้าดู 26 วินาที Nginx บันทึกเพียง WSS เดิมที่สิ้นสุด ไม่มี handshake ซ้ำ
- Forget pairing locally แล้วหน้า Desktop กลับเป็น `not_configured` จับคู่ด้วยโค้ดชุดที่สองได้ device `966b9649-1573-4d48-9b96-62d98f6a90a8` ซึ่งขึ้น connected/online ขณะ device เดิมยัง revoked/offline
- Release ใช้ SQLite ปกติเพราะ `CREWNEST_DATA_DIR` รองรับเฉพาะ debug ชุดทดสอบไม่มีการแชร์โปรเจกต์หรือส่งคำสั่ง หลังตรวจได้ revoke อุปกรณ์ทดสอบทั้งสองและลืมการจับคู่ใน Desktop แล้ว ตรวจ SQLite read-only พบ integrity `ok` ข้อมูล 2 โปรเจกต์และ 12 executions ตรงกับ baseline และการตั้งค่า remote กลับเป็นว่าง รายการ audit ของการทดสอบยังอยู่ ปิด Desktop และ Compose ชุดทดสอบแล้ว
- หน้า Home ของ binary ที่ทดสอบแสดง canvas สูงจนปุ่ม Console อยู่นอก viewport จึงเปิด `?view=console#remote` ใน WebView2 ของ release เดิมเพื่อทดสอบ remote controls

## ผลทดสอบซ้ำหลังแก้ revoke และตรวจเวลา WSL

- Desktop Core หยุด reconnect เมื่อได้รับ close `4003 Revoked` หรือ HTTP 401 ระหว่าง WSS handshake และรายงาน `pairing_required` หน้าจอปิดปุ่มเชื่อมต่อและแจ้งให้ลืมการจับคู่ในเครื่องแล้วใช้โค้ดใหม่ การตัดการเชื่อมต่อทั่วไปยัง retry ตามเดิม
- Windows System Event Log (`Microsoft-Windows-Kernel-General`, ID 1) บันทึกว่า `HOSMy.exe` ปรับเวลา Windows ย้อน 527.070 วินาที Windows Time รายงาน `Local CMOS Clock` และสถานะ unsynchronized ส่วน `systemd-timesyncd` ใน WSL ใช้ `ntp.ubuntu.com` เมื่อตั้งเวลา WSL ตาม Windows แล้วเปิดบริการกลับ WSL และ API container เร็วกว่า Windows อีก 527 วินาที
- Docker E2E ผ่านบน Windows Core harness → HTTPS/WSS ผ่าน Nginx → Central API/PostgreSQL เมื่อพัก `systemd-timesyncd` ชั่วคราวและซิงก์เวลา WSL หนึ่งครั้ง ระบบใช้ TTL เดิมและตรวจความต่างของเวลาก่อนส่งคำสั่ง รอบ Mock จบ `completed` ที่ execution `9218ae9a-da67-420f-9dbd-0d04803f9afe` มี 6 events รอบ Codex จริงจบ `completed` ที่ execution `8446b411-3f92-4de0-b2e6-ecdf3b2a3a92` มี 3 events
- ทั้งสองรอบยืนยันสถานะ `pairing_required` หลัง server revoke และหลังเริ่ม Core service ใหม่ด้วย credential เดิมที่ได้ HTTP 401 หลักฐานอยู่ใน result และ marker ภายใต้ `.local/phase3-compose/host-9aec6633-71b1-469c-a2d8-bf073f47cc08/` และ `.local/phase3-compose/host-bea9ffdf-5e07-492d-bb0f-181ef4be4e01/`
- `pnpm test:remote` ผ่าน 1 ชุด รวม disconnect/reconnect ปกติและการปฏิเสธ credential หลัง revoke ส่วน Playwright ผ่าน 12 tests รวม fixture ที่ตรวจข้อความแจ้งเตือน ปุ่ม Connect ถูกปิด และฟอร์ม Pair device กลับมาหลัง Forget pairing locally
- คืนบริการเวลา WSL และหยุด Compose ชุดทดสอบแล้ว การตั้งค่าเวลา Windows/HOSMy ยังเหมือนก่อนทดสอบ Windows release build ผ่าน ยังไม่ได้ทำ Native Desktop UAT ซ้ำหลังแก้

## ผลตรวจงานค้างบน Docker และ Windows

- Native Desktop UAT บน debug build และ SQLite แยก `.local/phase3-native-ui` ผ่าน Pair device ด้วยโค้ดใหม่, native approval และ CA picker สำหรับ Docker loopback ตรวจ device `c1c02ef1-289c-4979-8a5f-44786934c9ad` จากทั้ง Desktop และ API สถานะ API เปลี่ยน online → offline หลัง Disconnect remote → online หลัง Connect remote ด้วย ID เดิม → offline/revoked หลัง owner revoke ผ่าน API PostgreSQL เก็บ 2 connection records ทั้งคู่ปิดแล้ว การลองใช้ credential เดิมหลัง revoke ได้ HTTP 401 ที่ WSS upgrade
- หลัง revoke Desktop แสดง `disconnected` แต่ background reconnect ยังลองซ้ำ และกด Connect ระหว่างนั้นอาจขึ้น `Remote connection already active; disconnect first` API ปฏิเสธ credential ทุกครั้ง หยุด Desktop และ Compose ชุดทดสอบหลังตรวจแล้ว การทดสอบข้ามเครื่องและ public TLS ยังอยู่นอกผลรอบนี้

- หลังซิงก์เวลา Windows → WSL รอบใหม่ ตรวจเวลา API container ให้ต่างจาก Windows ไม่เกิน 2 วินาทีก่อนส่งแต่ละคำสั่ง Docker E2E ผ่าน HTTPS/WSS ผ่าน Nginx, submit และ start ได้ acknowledgement `accepted` ทั้งคู่ จากนั้น Mock execution `ca2d8907-6edc-4f1c-8532-acc19b196ccd` จบ `completed` ส่งกลับ 6 events รวม artifact และ revoke แล้ว device offline หลักฐานอยู่ `.local/phase3-compose/host-7e0b9333-65bc-4ca3-9ceb-a62748e31fc9/result.json`
- ทดสอบซ้ำด้วย Codex ที่ authenticated แล้วบน stack เดียวกัน ใช้ prompt ตัวอย่างโดยไม่เรียก tools งาน `792842c9-a1f4-48aa-aac2-b368f05c2ce7` จบ `completed` ส่ง 3 events รวม artifact `CREWNEST_DOCKER_PHASE3_OK` และ revoke แล้ว device offline หลักฐานอยู่ `.local/phase3-compose/host-14df0f7d-03a4-46a4-bb68-c543e80c7847/result.json`
- WSL กลับไปเร็วกว่า Windows ประมาณ 8 นาที 46 วินาทีหลังซิงก์ชั่วคราว จึงยังต้องตรวจกลไกซิงก์เวลาของ host ก่อนใช้งานต่อเนื่อง ผล E2E รอบผ่านใช้การตรวจและซิงก์เวลาเฉพาะช่วงทดสอบตามที่จำเป็น โดยใช้กติกา TTL ของแอปตามเดิม

- Docker Compose standalone v5.6.0 ผ่าน checksum ตามรายการของ Docker ทั้ง API และ Web image build สำเร็จ PostgreSQL 18.4 healthy และ migration ผ่าน [คู่มือ Docker Compose standalone](https://docs.docker.com/compose/install/standalone/)
- พบว่า `pnpm owner` ชนคำสั่งภายในของ pnpm แก้เป็น `pnpm run owner` แล้ว bootstrap บัญชีทดสอบใน container สำเร็จ
- ตรวจ TLS โดยระบุ private CA ของชุดทดสอบ API health และหน้า Web ตอบ HTTP 200, API session ที่ยังไม่ login ตอบ 401 และ login ผ่าน Nginx ตอบ 200
- Windows Core harness จับคู่ผ่าน HTTPS และเชื่อม WSS ผ่าน Nginx ได้ HTTP 101 เว็บอ่านสถานะ device, heartbeat และ metadata ของโปรเจกต์ตัวอย่างได้ การส่ง draft ถูกปฏิเสธด้วย `Expired or invalid command lifetime` เพราะเวลา API ใน WSL เร็วกว่า Windows ประมาณ 9 นาที ดังนั้นรอบ Docker ยืนยันได้ถึง pairing, snapshot และการปฏิเสธตามกติกาเวลา ส่วน execution มีผลผ่านจาก E2E เดิมด้านล่าง
- เปิด Native Desktop ด้วยฐานข้อมูลทดสอบแยกสำเร็จ เครื่องมือ Computer Use รายงานว่าตรวจพบ input จากผู้ใช้แม้ตรวจภาพใหม่แล้ว จึงหยุดก่อนกด pairing การจับคู่ผ่านหน้าต่าง Desktop ข้ามเครื่องและ public TLS ยังรอตรวจบน staging ที่ระบุ

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
