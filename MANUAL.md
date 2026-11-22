# คำสั่งพัฒนา Astra

Phase 3 API/Web/pairing/test/deployment ดู [PHASE_3_REMOTE.md](docs/PHASE_3_REMOTE.md) คำสั่ง `pnpm api`, `pnpm web`, `pnpm build:api`, `pnpm build:web`, `pnpm test:remote` แยกจาก Desktop ต้องตั้ง TLS/DB environment ตามคู่มือ

ใช้จาก `D:\Projects\astraops` ต้องมี Node >=22.12, pnpm 11.25.0, Rust stable MSVC, Visual Studio C++ Build Tools/Windows SDK และ WebView2

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:rust
pnpm test:ipc
pnpm lint:rust
pnpm dev
pnpm desktop
pnpm desktop:build
pnpm test:e2e
```

## สร้าง Windows installer

ใช้ Windows x64 และเครื่องมือ MSVC ตามรายการข้างต้น รันจาก root ของ repository

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action desktop-installer
Get-FileHash target/release/bundle/nsis/Astra_0.1.0_x64-setup.exe -Algorithm SHA256
```

Installer แบบ NSIS ติดตั้งเฉพาะผู้ใช้ปัจจุบัน ค่าเริ่มต้นคือ `%LOCALAPPDATA%\Astra` (รุ่นที่ติดตั้งชื่อ CrewNest ก่อนหน้าอยู่ `%LOCALAPPDATA%\CrewNest` ให้ถอนการติดตั้งเดิมก่อน ฐานข้อมูลอ้าง identifier เดิมจึงไม่หาย) ไฟล์ทดสอบยังไม่มีลายเซ็น Authenticode ถ้าเครื่องยังไม่มี WebView2 วิธีติดตั้งเริ่มต้นจะดาวน์โหลด bootstrapper จึงต้องมีอินเทอร์เน็ตในขั้นตอนนั้น การทดสอบ Web UI ให้ใช้ in-app browser ที่เชื่อถือใบรับรองของ test origin

ก่อนอัปเกรด ให้หยุด scheduling และงานที่กำลังรัน จากนั้นปิด Desktop และสำรอง SQLite ด้วย SQLite backup API ฐานข้อมูลของ release อยู่ใน `%LOCALAPPDATA%\local.crewnest.desktop` ให้เก็บแยกจากไฟล์ติดตั้ง ใช้ [คู่มือ Phase 3](docs/PHASE_3_REMOTE.md) สำหรับ TLS, migration, deployment และ rollback ของ Web/API

`pnpm dev` เปิดเฉพาะ frontend preview บน loopback `127.0.0.1:1420` ไม่มี local execution backend ต้องใช้ `pnpm desktop` สำหรับแอปจริง `tools/cargo.ps1` เตรียม MSVC environment เฉพาะ process; ไม่เปลี่ยน Windows configuration

Runtime Codex ที่ตรวจในเครื่องนี้: `codex exec --help`, `codex login --help`, `codex login status` Adapter ใช้ `exec --json --sandbox read-only --ignore-user-config --ephemeral --skip-git-repo-check --color never -` และส่ง prompt ผ่าน stdin ไม่มี shell interpolation หรือ bypass flag ไม่รองรับ custom user-config provider ใน Phase 1

Core smoke test: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action core-smoke` ใช้ Mock Adapter ส่วน `-Action real-smoke` ใช้ Codex จริงใน `.local/smoke-workspace` ด้วย prompt ตายตัวที่ขอเพียงตอบข้อความและห้ามเรียก tools ต้องมี Codex login และอาจใช้ quota ของบัญชี

สร้าง/ตรวจ original assets ด้วย `python tools/build_crewbots.py` และ `python tools/verify_crewbots.py`

Phase 2 workflow smoke (Mock เท่านั้น มี explicit test-harness approvals ไม่ใช่ human UAT sign-off): `powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action workflow-smoke`

ทดสอบ real adapter โดยตั้ง `$env:CREWNEST_SMOKE_ADAPTER='claude'` หรือ `'antigravity'` หรือ `'codex'` แล้วใช้ `-Action real-smoke` ตามข้างบน ไม่เปลี่ยน underlying CLI auth/settings; failure บันทึกตามจริงและอาจใช้ quota หาก authenticated

Real queue/dependency/handoff smoke ใช้ Codex สอง tasks ใน workspace แยก: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action queue-smoke` ใช้ synthetic prompts ไม่เรียก tools/อ่าน files และอาจใช้ account quota

Real five-agent writing workflow: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action real-workflow` ใช้ synthetic workspace `.local/phase2-real-workflow/workspace` และ explicit test-harness approvals ไม่ใช่ owner UAT sign-off ใช้ account quota ของ Codex/Claude/Antigravity หากรันค้าง/failed จะหยุดและเก็บ state; หลังแก้เหตุแล้วใช้คำสั่งเดิมพร้อม `-RetryFailed` เพื่อขอ retry ที่ยังเหลือสิทธิ์ ห้ามใช้ flag นี้วนลูป

Claude authentication: `claude auth status --json` (ตรวจ locally อย่าเผยแพร่ account metadata), `claude auth login` ให้เจ้าของทำ browser login เอง ไม่ใส่ token/password ใน Astra หรือ chat; กด Check runtimes หลัง login

หลัง workflow completed หากต้องการตรวจ source ที่ apply แล้วและ Node tests ซ้ำก่อน append SCOUT review/UAT/ASTRA summary ใหม่ ใช้ `powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action real-workflow -Reverify` มี paid runtime calls และ explicit test-harness approvals; ไม่ใช่ owner UAT sign-off ไม่รัน ASTRA plan/VECTOR/MIRA/FORGE ซ้ำ ไม่ override runtime command denial และไม่ overwrite trusted tests ที่เปลี่ยนจากต้นฉบับ
