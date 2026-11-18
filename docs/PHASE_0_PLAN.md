# Phase 0–1 — แผนและขอบเขต implementation

วันที่ 2026-11-17 · source root ยืนยันโดยผู้ใช้: `D:\Projects\astraops`

## ลำดับและ milestones

1. ตรวจ Node/pnpm, Rust MSVC, C++ Build Tools, WebView2 และ runtime CLI โดยไม่ติดตั้งหรือ login tools แทนผู้ใช้
2. สร้าง pnpm/Rust monorepo ตาม MASTER_BUILD_PROMPT รักษา assets เดิม แยก shared types, protocol, UI, adapter contracts และ config
3. สร้าง Rust Desktop Core ที่ทดสอบแยกจาก WebView ได้: SQLite migrations, default agent records, approved project directories, executions/events/approvals และ crash recovery
4. เพิ่ม explicit labeled Mock Adapter และ Codex adapter แบบ read-only พร้อม timeout/cancel และ persistent logs ห้ามอ้าง mock เป็น real AI
5. Tauri 2 bridge + React Dashboard/Cards, project modal/native picker, runtime diagnostics, approved execution modal และ monitor
6. รัน Rust tests, TypeScript checks, Vitest, frontend tests, Windows build และ native smoke test หาก environment รองรับ

## Core domain และ ownership

Phase 1 SQLite เป็นเจ้าของ agents, projects/local paths, runtime diagnostic settings, tasks, executions, events, local human approvals และ audit records ใช้ stable UUIDs และ versioned migrations ข้อมูล sensitive ไม่ส่งออก มี migration สำหรับแก้ interrupted running executions เป็น failed หลัง restart

Central model ใน Phase 3 จะเพิ่ม users/devices/connections และ central projects/workflows/commands โดยใช้ opaque project IDs ห้าม sync workspace paths หรือ runtime secrets PostgreSQL ไม่ใช่ dependency ของ local phase นี้

## Adapter design

TypeScript ประกาศ contract; Rust เป็น implementation และ execution boundary จริง Phase 1 รองรับ mock และ Codex เท่านั้น Claude/Antigravity แสดง installed diagnostics แต่ execution เป็น unsupported จนกว่า Phase 2 จะตรวจ documented contracts ครบ Resume ยังไม่รองรับและไม่แสดงว่า pause process ได้

## Communication และ trust boundaries

React renderer → allowlisted Tauri commands → Rust Core → SQLite/native directory picker/approved Codex executable ไม่มี HTTP execution server, shell plugin หรือ browser execution fallback Native picker เป็นจุดอนุมัติ project root ทุก execution ต้อง human-approved prompt และจำกัด read-only ไม่เปิด writing/high-risk actions ใน Phase 1

Phase 3: Web → authenticated API → outbound authenticated device WSS → local authorization/expiry/idempotency checks → Desktop execution ไม่มี arbitrary remote terminal

## Rollback และข้อจำกัด

งานใหม่เพิ่มเป็นส่วนใหญ่ เก็บ docs/assets เดิม ไม่เปลี่ยน CLI account configuration ไม่อ่าน credentials โดยตรง ไม่มี autostart/network listener production SQLite อยู่ app-local data ไม่อยู่ repository; dev/test ใช้ data root แยก หยุดแอปก่อน backup SQLite และเก็บ DB/WAL/SHM ให้สอดคล้องกัน ไม่ downgrade schema อัตโนมัติ

Full workflow engine, writing agents, remote authentication/pairing, OS secret storage สำหรับ device credentials, tray และ installer release เป็น milestones ภายหลัง ไม่ใส่ controls ที่อ้างว่ารองรับแล้ว
