# Architecture ที่ implement ใน Phase 0–1

Source root: `D:\Projects\astraops` · สถานะ source: worktree ใหม่ ยังไม่มี HEAD commit · ใช้ graph project `crewnest`; refresh index หลัง checks

Index หลัง implementation 2026-11-17: 381 nodes / 946 edges เป็นหลักฐานของ worktree รุ่นนี้ ไม่ใช่ commit ที่เผยแพร่ Graph ไม่ครอบคลุม assets, migrations, smoke example หรือ browser/process fixtures จึงตรวจไฟล์และรันทดสอบส่วนเหล่านั้นโดยตรงด้วย

## เส้นทางจริง

```text
React/Vite/Tailwind renderer (apps/desktop/src)
  → typed bridge.ts / Tauri invoke
  → allowlisted commands (apps/desktop/src-tauri/src/main.rs)
  → Rust Core (packages/desktop-core)
    → native directory picker / native execution confirmation
    → SQLite (projects, agents, tasks, executions, events, approvals, audit)
    → approved executable + fixed argument array + stdin prompt
      → Codex read-only sandbox / labeled Mock Adapter
```

Desktop Core ไม่เปิด HTTP execution service Browser preview ไม่มี backend และปุ่ม execute ถูก disable Separate Web/API ยังเป็น Phase 3 ไม่ใช่ Desktop server ที่เปิดสู่ Internet

## Domain และ persistence

`packages/shared/default-agents.json` เป็น seed source ของห้า configurable records ใช้ stable agent IDs และ `INSERT OR IGNORE` จึงไม่ทับ instructions ที่แก้ใน DB Agent instructions และ role ส่งเข้า effective execution prompt; approval hash ครอบคลุม agent instructions และ owner prompt

SQLite schema/migration อยู่ `packages/desktop-core/migrations/001_initial.sql` ใช้ foreign keys, WAL, busy timeout และ schema version 1 เปิด schema ที่ใหม่กว่าไม่ได้ สร้าง unique partial indexes จำกัดหนึ่ง running execution ต่อ project และต่อ agent การเริ่ม run เป็น transaction เดียวกับ task, approval และ audit

`Store::snapshot` คืน latest 100 runs; events อ่านด้วย cursor ครั้งละไม่เกิน 500 รายการ UI เก็บล่าสุด 500 events ในหน้าจอ แต่ฐานข้อมูลเก็บประวัติจริง การ poll snapshot ทุก 1s และ logs ทุก 500ms เป็น bounded UI refresh; Core emit Tauri event เพิ่มด้วยโดยไม่ใช้ frontend polling เป็น execution scheduler

Core ถือ exclusive lock ของ data root ป้องกันสอง instance กู้สถานะทับกัน หลัง restart เปลี่ยน interrupted `running` เป็น `failed` พร้อมสาเหตุ ไม่ resume หรือ retry อัตโนมัติ ไม่มี autonomous workflow loop ใน Phase 1

## Local ownership และขอบเขตที่เลื่อนออก

SQLite เป็นเจ้าของ paths, agent config, task/execution history, approvals/audit และ executable fingerprint ไม่มี credentials ของ CLI ใน DB Authentication ตรวจด้วย CLI exit status แล้วเก็บเพียง diagnostic state

Central PostgreSQL และ users/devices/connections/workflows/dependencies/artifacts/remote command queue อยู่ Phase 2–3 ต้องระบุ ownership และ idempotency ก่อน implementation Shared protocol schema ใน Phase 1 เป็น contract เริ่มต้น ยังไม่ใช่ remote authorization implementation

## UI

React Dashboard มี agent cards/detail modal, native-picker project creation, diagnostics, approved execution form, cancellation และ persistent monitor ใช้ original CrewBots/locally hosted LINE Seed Sans TH รองรับ dark/light, native dialog focus containment, keyboard และ reduced motion

Lucian #039 Sliding pill tabs ใช้ใน execution activity: port DOM lifecycle เป็น React effect, textContent แทน sample HTML strings, เปลี่ยนข้อมูลเป็น run history/ภาษาไทย, map theme tokens, รักษา shapes และ durations/easing/stagger เดิม เพิ่ม ResizeObserver cleanup และ max-width สำหรับ mobile ส่วน project/execution modals เป็น component ใหม่ใช้ theme เดียวกันและ native `<dialog>`

## แหล่งเทคนิคที่ตรวจ

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri commands](https://v2.tauri.app/develop/calling-rust/)
- [Native dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [Mock testing APIs](https://v2.tauri.app/develop/tests/mocking/)
- Local Codex CLI 0.159.2: `exec --help`, `login --help`, actual `login status` และ genuine smoke run
