# Astra — AI Agent Command Center

> ชื่อผลิตภัณฑ์เดิมคือ CrewNest ตัวระบุภายใน (`@crewnest/*`, `crewnest_core`, `CREWNEST_*`, `local.crewnest.desktop`, `crewnest.db`) คงไว้เพื่อรักษาข้อมูลและการจับคู่เดิม

แพลตฟอร์ม local-first สำหรับควบคุมและประสานงาน AI agents โดยใช้ตัวละครหุ่นยนต์ต้นฉบับ **CrewBots** เป็นอัตลักษณ์

- [ข้อกำหนดผลิตภัณฑ์](docs/PRODUCT_SPEC.md)
- [MASTER BUILD PROMPT ฉบับ CrewNest](docs/MASTER_BUILD_PROMPT.md)
- [ระบบออกแบบ CrewBots](docs/CREWBOTS_DESIGN_SYSTEM.md)
- [ที่มาและสิทธิ์ของ assets](docs/ASSET_LICENSES.md)
- [รายการย้าย branding และตรวจ preservation](docs/REBRANDING_CHECKLIST.md)
- [แกลเลอรี assets](assets/crewbots/gallery.html) — เปิดด้วย browser ได้โดยตรง
- [Asset manifest](assets/crewbots/manifest.json)

## สถานะ Phase 3

Central API (Fastify/PostgreSQL/Drizzle) และ Web Console (React/Vite/TanStack Query) แยกจาก Desktop แล้ว มี HTTPS/WSS device pairing, Windows Credential Manager, owner sessions/CSRF, project sharing, remote draft/start/cancel/pause/status และ sanitized logs ทดสอบ PostgreSQL → Web → WSS → Windows Rust Core → Mock/Codex จริงแล้ว ดู [รายงาน Phase 3](docs/PHASE_3_REPORT.md) และ [วิธีเริ่ม API/Web/remote](docs/PHASE_3_REMOTE.md)

Local execution approval และ writing/high-risk approvals ยังคงทำใน Desktop; ไม่เปิด remote terminal ไม่ถือว่า localhost E2E เป็น public production deployment หรือ native owner UAT ของ remote ทุกขั้น

## ประวัติ Phase 2

เพิ่ม FORGE staged writing แล้ว และ real workflow ทั้ง 5 agents จบผ่าน Core/CLI harness หลังเจ้าของ login Claude ดู [ผลทดสอบและข้อจำกัด](docs/PHASE_2_WRITING_REPORT.md) และ [วิธีใช้ writing/rollback](docs/WRITING_EXECUTION.md) Native writing UAT ผ่าน FORGE → review/apply → SCOUT → UAT → ASTRA พร้อม cancellation, rollback และ restart แล้ว ดู [รายงาน Native Writing UAT](docs/NATIVE_WRITING_UAT_REPORT.md) SCOUT review จาก operator evidence; owner final product sign-off ยังแยกต่างหาก

เพิ่ม local runtime adapters สำหรับ Codex/Claude Code/Antigravity, persisted task queue/dependencies, workflow handoff, human plan/UAT gates, bounded retry/rework และ Task Board แล้ว ผลทดสอบและข้อจำกัดอยู่ [PHASE_2_REPORT.md](docs/PHASE_2_REPORT.md) วิธีใช้ queue อยู่ [PHASE_2_WORKFLOWS.md](docs/PHASE_2_WORKFLOWS.md)

FORGE ใช้ schema-conforming Claude output แล้วให้ Rust เขียนเฉพาะ exact paths หลังแยก approval ของเนื้อหาจริง ส่วน agent อื่นยังใช้ read-only/plan Installer/production packaging ยังอยู่ Phase 4

## ประวัติ Phase 0–1

เริ่ม implementation จาก MASTER BUILD PROMPT ตามคำสั่งผู้ใช้วันที่ 2026-11-17 แล้ว มี Tauri 2 Windows Desktop source, React Dashboard/CrewBot Cards, native-picker project registration, SQLite persistence, runtime diagnostics, labeled Mock Adapter และ Codex read-only execution จริง พร้อม native approval, logs, cancellation/timeout และ restart recovery

Phase 0 architecture/plan อยู่ [PHASE_0_PLAN.md](docs/PHASE_0_PLAN.md) และ [ARCHITECTURE.md](docs/ARCHITECTURE.md) ผลตรวจเดิมอยู่ [PHASE_1_REPORT.md](docs/PHASE_1_REPORT.md) สถานะปัจจุบันให้ใช้รายงาน Phase 2

## เริ่มใช้งาน Windows

```powershell
pnpm install --frozen-lockfile
pnpm desktop
```

ใช้ Node >=22.12, pnpm 11.25.0, Rust stable MSVC, C++ Build Tools/Windows SDK และ WebView2 คู่มือครบอยู่ [MANUAL.md](MANUAL.md) และ [DEVELOPMENT.md](docs/DEVELOPMENT.md)

ไฟล์ Windows executable ที่ build อยู่ `target/release/crewnest-desktop.exe` เปิดได้โดยไม่ต้องรัน Vite ด้วยตัวเอง Native UAT ผ่านแล้ว: สร้าง project, Mock/Codex success, logs, approval rejection, cancellation และ restart persistence ดู [NATIVE_UAT_REPORT.md](docs/NATIVE_UAT_REPORT.md) สำหรับ build fingerprint และข้อจำกัด

`pnpm dev` เป็น frontend preview เท่านั้น ปุ่ม execution ถูก disable หากไม่มี Tauri Core ไม่ใช่ separate remote Web App

## ตรวจและสร้าง assets

ใช้ Python standard library โดยไม่ติดตั้ง dependencies เพิ่ม:

```powershell
python tools/build_crewbots.py
python tools/verify_crewbots.py
```

การสร้างซ้ำเขียนเฉพาะไฟล์ที่ generator เป็นเจ้าของใน `assets/crewbots/` ควรเก็บสำเนาหรือ commit ก่อนแก้ assets ด้วยมือ
