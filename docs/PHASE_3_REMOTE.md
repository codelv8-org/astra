# Phase 3 — Central API / Web / secure remote control

## เริ่ม local development

ต้องมี PostgreSQL 18 binaries (`postgres`, `initdb`, `pg_ctl`, `psql`, `createdb`), OpenSSL, Node >=22.12, pnpm 11.25.0 และ Windows Rust/MSVC ตาม MANUAL

```powershell
pnpm install --frozen-lockfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/phase3-local.ps1 -Action setup
powershell -NoProfile -ExecutionPolicy Bypass -File tools/phase3-local.ps1 -Action api
```

เปิด PowerShell อีกหน้าต่าง:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/phase3-local.ps1 -Action web
```

Web: `https://127.0.0.1:7444`; API: `https://127.0.0.1:7443` PostgreSQL cluster แยกที่ `.local/phase3-dev/pg` port 55439 ไม่สร้าง Windows service หรือแก้ OS certificate trust local certificate หมดอายุ 30 วัน Browser ของเจ้าของต้อง trust private CA ด้วยตัวเองหรือใช้ trusted development certificate; automated browser test ยอมรับ certificate เฉพาะ test context ไม่ปิด TLS verification ของ API/Desktop

Bootstrap owner credentials สุ่มอยู่ `.local/phase3-dev/config.json` อ่านเฉพาะในเครื่อง ไม่ส่งมาใน chat ไม่รวมลง source หรือ report สคริปต์ owner สร้างครั้งแรกและไม่ reset password ที่มีอยู่ `api`/`web` เป็น foreground processes ใช้ Ctrl+C หยุดแต่ละ process แล้วหยุดเฉพาะ test clusterด้วย:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/phase3-local.ps1 -Action stop
```

## Pair และอนุญาต local execution

1. Login Web → จับคู่อุปกรณ์: code ใช้ครั้งเดียว 5 นาที
2. Desktop → Secure remote control → HTTPS API origin + code + device name → native confirmation หาก private CA ให้เลือก PEM/CRT ผ่าน native picker; ไม่ใช้ bypass TLS
3. Device token เก็บใน Windows Credential Manager (`CrewNest.Remote`) SQLite เก็บเพียง server/device/owner/public CA และ local policies ไม่ส่ง token กลับ renderer
4. Share project metadata เป็นรายโปรเจกต์ ผ่าน native confirmation; sanitized logs/artifacts ต้องเปิดเพิ่ม ข้อมูลที่เผยแพร่อาจมีเนื้อหาของงาน ห้ามถือว่า redaction เป็น DLP สมบูรณ์
5. Web ส่งงานเป็น draft → Desktop task detail ตรวจ exact prompt และ approve ในเครื่อง → Web Start เฉพาะ queued task ที่ approved แล้ว หาก local scheduler active อาจเริ่มงานเองหลัง approval ตามพฤติกรรม Phase 2; ใช้ Pause scheduling ในเครื่องเพื่อทดสอบ remote Start แยก
6. Web Cancel / Pause future scheduling / Refresh status ทำได้ตามสิทธิ์ owner และ local project policy Remote ไม่กำหนด binary/path/CLI args ไม่อนุมัติ human gates, writing apply/rollback หรือ high-risk actions; ให้ทำผ่าน Desktop
7. Desktop ต้องเปิดและ Windows ไม่ sleep/offline ข้อมูล connection ใช้ active socket + heartbeat; การออนไลน์ของเครื่องไม่ได้รับรอง runtime CLI authentication จนตรวจ/execute จริง
8. Revoke ใน Web ตัด connection และ invalidate credential/pending commands งาน local ที่เริ่มแล้วไม่ถูก terminate ด้วย revoke; ใช้ cancellation ก่อน revoke หากต้องการหยุดงาน Forget pairing locally ลบ credential ในเครื่อง ไม่แทน server revoke

## Ownership / contracts / trust boundaries

API PostgreSQL เป็นเจ้าของ users, hashed sessions/CSRF, pairing hashes, device credential hashes/revocation, device connections, shared project IDs/names, command envelopes/acknowledgments, sanitized event replicas และ audit logs Drizzle schema อยู่ `apps/api/src/schema.ts`; SQL migration แบบ transaction/advisory lock/version อยู่ `apps/api/migrations/001_remote.sql`

SQLite schema4 เป็นเจ้าของ local approved workspace paths, queue/workflows/approvals/runs และ remote share policy/command ledger/remote-to-local task mapping/event acknowledgment Desktop เป็นผู้สร้าง execution จริง API รับ published snapshot เท่านั้น ไม่มี bidirectional overwrite local tasks/permissions ข้อมูล private paths/instructions/auth configuration/PID/raw stdout/stderr ไม่อยู่ remote snapshot

`packages/protocol/src/index.ts` เป็น Zod contract: command UUID/device/project/task/requester, issue/expiry, idempotency key, authorization context และ optional typed submission payload Rust ใช้ deny_unknown_fields และตรวจซ้ำ TTL ไม่เกิน 60 วินาที/device/owner/exact local approval/shared project/runtime binding/action allowlist

Command claim ถูก persist ก่อน side effect, unique command/idempotency key, payload mismatch ถูกปฏิเสธ หลัง crash ไม่ replay claimed command อัตโนมัติ ถ้า action ทำแล้วแต่ ack หาย ใช้ snapshot reconciliation ตรวจผล ไม่อ้าง exactly-once completion ภายใต้ทุก crash window Remote start ต้องผ่าน local single-use task authorization อีกชั้น

Snapshot ส่งทุก 2 วินาที: shared projects สูงสุด 100, latest shared tasks 50, executions 100; logs ใช้ persisted event ack/dedup batches สูงสุด 10 events, event text สูงสุด 8000 chars เฉพาะ status/artifact/Mock ที่อนุญาต ไม่ส่ง raw provider JSON/stdout/stderr Web ใช้ TanStack Query poll 1.5 วินาที; WSS สำหรับ device transport ข้อมูล UI อาจหน่วงหนึ่งรอบ

Heartbeat timeout 12 วินาทีฝั่ง API / 15 วินาทีฝั่ง Desktop และ reconnect 3 วินาที ไม่เก็บคำสั่งใหม่ให้ device offline; pending ที่ยังไม่หมดอายุส่งใหม่เมื่อ reconnect ผ่าน ledger เดิม คำสั่ง expired ไม่ execute ไม่มี automatic high-risk approval

## API

| Method / path | สิทธิ์ / ผล |
|---|---|
| GET `/health` | DB readiness ไม่มีข้อมูลโครงการ |
| POST `/api/login` | exact Web Origin + rate limit, rotated opaque secure HttpOnly SameSite=Strict cookie |
| GET `/api/session` | session identity และ CSRF token |
| POST `/api/logout` | CSRF/Origin + revoke session |
| POST `/api/pairings` | owner สร้าง 256-bit single-use code |
| POST `/api/device/pair` | code exchange transaction ได้ revocable token |
| GET `/api/device/socket` | WSS bearer auth, reject browser Origin, heartbeat/snapshot/events/ack |
| GET `/api/devices` | owner-scoped devices/actual online/snapshots |
| POST `/api/devices/:id/revoke` | owner + CSRF; revoke token/pending commands |
| GET/POST `/api/devices/:id/commands` | owner read/validated allowed command, offline/changed-key rejection |
| GET `/api/devices/:id/events?executionId=...` | owner-scoped sanitized events |

Security: scrypt+salt password hashes, random tokens เก็บ SHA256 hashes, sessions 8 ชั่วโมง, code 5 นาที, credential revocation ตรวจทุก socket message/upgrade, bounded body/WebSocket frames, rate limits, strict DTOs, local/remote audit, TLS verification ไม่มี unrestricted remote terminal หรือ public local execution service

## Build / deployment

```powershell
pnpm build:api
pnpm build:web
pnpm desktop:build
```

API build อยู่ `apps/api/dist/apps/api/src/main.js`; รันผ่าน `pnpm --filter @crewnest/api start` ต้องตั้ง environment ตาม `apps/api/.env.example` โดย process manager ของเครื่อง ไม่โหลด `.env` เข้า source อัตโนมัติ ใช้ `pnpm --filter @crewnest/api migrate` ก่อนเริ่ม service และ `owner` พร้อม `CREWNEST_OWNER_NAME` / `CREWNEST_OWNER_PASSWORD` แบบ local bootstrap ไม่เปิด registration endpoint

Web build เป็น static `apps/web/dist` deploy แยกได้ ผ่าน HTTPS origin ของตัวเองและ reverse proxy `/api` ไป API HTTPS ที่ตรวจ certificate ถูกต้อง ไม่มี frontend API secrets ใช้ cookie same-origin ไม่เปิด wildcard CORS `infra/web.conf.template` เป็นตัวอย่าง Nginx รวม CSP/TLS; public API device URL ต้องเข้าถึง WSS route ได้

Docker Compose ตัวอย่างที่ `infra/compose.yaml` แยก postgres/api/web และ volume DB ต้องเตรียม certs `api.crt/api.key/api-ca.crt/web.crt/web.key` ภายนอก repository, ตั้ง `infra/.env.example` เป็น environment ของ deployment แล้ว migrate/bootstrap ก่อน API traffic ไม่ใช้ HTTP หรือปิด certificate verification

```powershell
docker compose -f infra/compose.yaml up -d postgres
docker compose -f infra/compose.yaml run --rm api pnpm --filter @crewnest/api migrate
docker compose -f infra/compose.yaml run --rm -e CREWNEST_OWNER_NAME -e CREWNEST_OWNER_PASSWORD api pnpm --filter @crewnest/api owner
docker compose -f infra/compose.yaml up -d api web
```

Compose bind ports เฉพาะ loopback เป็นค่าเริ่มต้น ต้องจัดการ trusted public ingress และ Web origin ของ deployment เอง ห้ามเปิด database port สู่ Internet Docker/public deployment ยังไม่ใช่ผลทดสอบบนเครื่องนี้

## Tests / rollback

หลัง setup และเปิด Web local HTTPS แล้ว:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/cargo.ps1 -Action remote-host-build
$env:NODE_EXTRA_CA_CERTS = Join-Path (Get-Location) '.local/phase3-dev/tls.crt'
pnpm test:remote
```

ต้องปิด standalone API ที่ใช้ port7443 ก่อน test เพราะ test สร้าง API HTTPS จริงเอง ต้องมี Google Chrome และ Codex authenticated; test ใช้ account quota ของ Codex ไม่ substitute Mock เมื่อ Codex missing/auth fails Local approval ผ่าน isolated Core test harness/control file ไม่ใช่ native owner approval click และไม่ได้เปิด test control interface ใน production binary ผลแยกอยู่ PHASE_3_REPORT

Rollback: หยุด new runs/remote client และสำรอง DB ด้วย SQLite backup API ก่อน migration มี baseline `.local/phase3-baseline/before.db` ห้ามเปิด schema4 ด้วย executable Phase2 ที่รองรับ schema3 หากย้อนจริงต้องใช้ baseline-compatible DB ใน data root สำรอง แยกข้อมูลที่เพิ่มใหม่ก่อน restore ไม่ downgrade/drop production DB อัตโนมัติ Central PostgreSQL migration เป็น additive ไม่ drop tables หรือ credential records โดยอัตโนมัติ ใช้ backup ที่ตรวจ restore แล้วก่อน production changes
