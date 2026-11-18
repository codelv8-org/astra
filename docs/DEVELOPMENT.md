# การพัฒนาและรัน Phase 1

ใช้ Windows x64; Node >=22.12, pnpm 11.25.0, Rust stable MSVC, Visual Studio Desktop development with C++/Windows SDK และ WebView2

```powershell
pnpm install --frozen-lockfile
pnpm desktop
```

wrapper `tools/cargo.ps1` เลือก Visual Studio ที่มี C++ workload แล้วโหลด environment เฉพาะ child process ไม่แก้ global PATH หรือ Windows configuration เครื่องนี้มี installation อีกตัวที่ไม่มี msvcrt.lib จึงต้องใช้ wrapper

## ลองใช้งาน

Mock ใช้เวลาประมาณ 15 วินาที (สาม steps) เพื่อให้ตรวจ logs/cancellation ได้ หลัง start แอปเลื่อนและย้าย focus ไป Execution monitor อัตโนมัติ ผล Native UAT ล่าสุดอยู่ NATIVE_UAT_REPORT.md

1. เปิด Desktop แล้ว Add project กรอกชื่อ/goal เลือกและอนุมัติ local project directory ผ่าน native picker
2. กด Check runtimes เพื่อดู actual installation/version/authentication
3. New execution เลือก project/agent/adapter กรอก prompt ยืนยัน read-only แล้ว review native confirmation
4. ใช้ Mock เพื่อทดสอบระบบโดยไม่ใช้ AI account; ทุกผลมี MOCK label ใช้ Codex เฉพาะ ASTRA/VECTOR/SCOUT ที่ configured runtime ตรงกัน และ Codex login อยู่แล้ว
5. ดู persisted events ใน Execution monitor; Cancel ส่ง cancellation ไปยัง active run ไม่ใช่ pause

CLI ที่ missing/unauthenticated ต้องติดตั้ง/login ผ่าน documented CLI ของผู้ใช้เอง ไม่มี fake-success fallback

## Data และ build

Debug default data อยู่ app-local directory ของ `local.crewnest.desktop` ใต้ `development`; release ใช้ app-local directory โดยตรง แยกจาก source ตั้ง `CREWNEST_DATA_DIR` ได้เฉพาะ debug build ขณะทดสอบ ไม่อ่าน `.env` เข้ามาเป็น execution config อัตโนมัติ

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rust
powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action ipc-test
pnpm test:e2e
pnpm desktop:build
```

ผล build คือ `target/release/crewnest-desktop.exe` แบบ standalone executable ที่ยังไม่ลงนาม ไม่ใช่ installer; packaging/signing/release เป็น Phase 4 ไม่มีการติดตั้ง service, autostart หรือเปิด firewall

Browser tests ใช้ installed Microsoft Edge แบบ headless ต้องมี Edge ในเครื่อง CI workflow อยู่ `.github/workflows/ci.yml` ยังไม่ได้รันบน GitHub จริง

## Real adapter smoke test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action real-smoke
```

ทดสอบ Rust Core/Codex ใน `.local/smoke-workspace` พร้อม DB แยก `.local/smoke/crewnest.db` ไม่อ่าน source หรือแก้ files Prompt ขอเพียงข้อความยืนยันและห้ามใช้ tools อาจใช้ account quota ไม่ใช่ native WebView UAT หากต้องการ mock ใช้ `-Action core-smoke`

## Phases ถัดไป

Phase 2: real Claude/Antigravity execution, config/model editing, queue/workflow dependencies, handoffs/rework limits และ writing policy/approval granularity Phase 3: standalone Web/API, PostgreSQL, session auth, pairing/revocation, WSS/idempotency/reconciliation Phase 4: Windows interactive lifecycle UAT, installer/signing และ deployment validation
