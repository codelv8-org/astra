# ผลส่งมอบ CrewNest Phase 0–1

อัปเดตภายหลัง: Native UAT และ fixes ผ่านแล้วในรอบถัดไปวันที่ 2026-11-17 ดู `NATIVE_UAT_REPORT.md` ตาราง NOT RUN และ hash ด้านล่างเป็นประวัติ build แรก ไม่ใช่สถานะล่าสุด

วันที่ 2026-11-17 · Source: `D:\Projects\astraops` · ไม่มี source เดิมก่อนเริ่ม foundation และยังไม่มี HEAD commit

## สิ่งที่ implement แล้ว

- pnpm/Rust monorepo พร้อม shared domain/Zod schemas, protocol contract, adapter interface, UI และ config แยกจาก trusted Desktop Core
- Tauri 2 Windows Desktop เชื่อม React/Vite/Tailwind ผ่าน typed IPC พร้อม Dashboard, CrewBot Cards ทั้งห้า, detail modal, project modal, execution form, runtime diagnostics และ monitor
- Original SVG CrewBots, locally hosted LINE Seed Sans TH, light/dark, keyboard/focus/reduced motion และ responsive 375px โดยใช้ Lucian #039 ใน execution activity พร้อม MIT attribution
- SQLite migration/seed, approved native-picker project directories, Git association detection, persisted tasks/executions/events/approvals/audit, session และ reported usage metadata
- Mock Adapter มี label ทุกผลลัพธ์ และ Codex adapter แบบ fixed executable/arguments + read-only sandbox + stdin prompt + bounded logs + timeout/cancel + Windows process job
- Native execution approval, executable fingerprint, environment allowlist, agent/runtime binding, project/agent execution locks, data-root instance lock และ interrupted-run recovery
- คู่มือ build/run, architecture/security/IPC/adapter docs, versions/lockfiles และ CI workflow สำหรับตรวจบน Windows

## ผลตรวจจากการรันจริง

| Check | ผล | ขอบเขต |
|---|---|---|
| TypeScript strict typecheck | PASS | Frontend/shared/contracts/tests |
| ESLint | PASS | Zero warnings |
| Rust Clippy | PASS | Core และทุก target ของ core, warnings เป็น errors |
| Vitest | 4 PASS | Input/approval validation, roster/task states, initial protocol shape |
| Rust Core tests | 18 PASS | 6 real child-process fixture tests + 12 persistence/security/lifecycle tests |
| Headless Tauri IPC | 1 PASS | Real command handlers กับ SQLite ผ่าน MockRuntime; unknown commands ถูก reject |
| Playwright / Microsoft Edge | 6 PASS | 4 preview/accessibility/responsive tests + 2 explicitly mocked IPC UI integration tests |
| Character asset verifier | PASS | 40 SVGs, XML, hashes, references, local resources/reduced-motion rules |
| Vite production build | PASS | สร้าง embedded frontend assets |
| Windows release build | PASS | `target/release/crewnest-desktop.exe` แบบ unsigned executable, ไม่ใช่ installer |
| Native interactive UAT | NOT RUN | Automatic approval review บล็อกการ launch ผ่าน Start-Process |
| GitHub-hosted CI | NOT RUN | มี workflow source; ยังไม่ได้ push หรือเรียก hosted run |

Windows executable รุ่นนี้ขนาด 13,610,496 bytes; SHA-256 `94ECAD441F33B1110EF4A7DA46306B36DF0B5DE96C92BD6BCA74CEA7FEB4CFFD` ยังไม่มี code signing และไม่ใช่ public release

รวม automated tests ที่รันผ่าน **29 รายการ** ไม่รวม smoke execution และ asset validator ไม่มีการนำ fixture results ไปอ้างเป็น genuine AI execution

Rust tests ตรวจ migration/seed idempotency, persistence/reopen, invalid/duplicate directories, newer-schema rejection, approval binding กับ instructions/prompt, agent/runtime mismatch, workspace/agent locks, instance lock, interrupted recovery, log redaction/storage failure, reported session/usage/history, mock cancellation และ child-process success/error/missing completion/oversized output/timeout/tree cancellation

Browser fixture tests ตรวจ project creation request, explicit checkbox ก่อน start, error handling ที่คง prompt, mock label และ log output ที่ไม่ execute HTML Native picker/confirmation ไม่ได้ถูกทดสอบด้วย fixture นี้

## Genuine Codex execution

ตรวจ CLI 0.159.2 และ authenticated state ผ่าน `login status` แล้วรันจาก Rust Core ใน `.local/smoke-workspace` โดยไม่ใช้ shell interpolation หรือ bypass mode Prompt ขอเพียง `CREWNEST_REAL_ADAPTER_OK` และห้ามเรียก tools

ผลจริง: structured `thread.started`, `turn.started`, `item.completed` ที่มีข้อความตามคำขอ และ `turn.completed` พร้อม usage ก่อน persist `completed` การรันท้ายสุดใช้ execution ID `7c8a05ee-3f20-4e94-8980-e79483e62919` ใน DB `.local/smoke/crewnest.db` ผ่านหลังเพิ่ม agent instructions และ environment allowlist แล้ว

Codex smoke เป็นการยืนยัน detect/auth/process/JSONL/session/logs/result จริง ไม่ใช่การทดสอบ tool-driven coding, file changes หรือ workflow ทั้งทีม และไม่ใช่ end-to-end ผ่าน native WebView

Claude Code 2.1.199 และ Antigravity 1.4.3 ตรวจ installation/version ได้จริง ยังไม่ตรวจ authentication หรือ execution ของสองตัวนี้ ไม่อ้างว่า adapter พร้อมใช้งานแล้ว

## Build issues ที่พบและแก้

- Rust เลือก Visual Studio installation ที่ไม่มี `msvcrt.lib`: เพิ่ม process-local MSVC initialization wrapper โดยใช้ vswhere/C++ workload ที่มี libraries ครบ
- pnpm 11 ไม่ใช้ onlyBuiltDependencies: เปลี่ยนเป็น explicit allowBuilds เฉพาะ esbuild
- Initial frontend import/type configuration: แก้ path และ type resolution แล้ว typecheck/build ผ่าน
- Browser image-load assertion ตรวจเร็วเกินไป: เปลี่ยนเป็นรอ decode/load condition โดยยัง reject broken images
- UI fixture selector อ่าน wrapping label ไม่ตรง accessible combobox: ใช้ role/name แล้ว 6 tests ผ่าน
- Zod มี non-fatal Rollup annotation warnings ใน dependency code; build ผ่านโดยไม่แก้ third-party source

## ข้อจำกัดและงานต่อ

Phase 1 foundation ทำงานและตรวจเป็นชั้นแล้ว แต่ยังไม่ผ่าน native interactive acceptance ทั้งเส้นทาง เพราะ automatic approval review ปฏิเสธ `Start-Process` ด้วยเหตุผลเพียง “blocked by policy” จึงไม่ได้พยายาม launch ทางอื่น ไม่มีการขอเปลี่ยน security policy

ยังไม่มี workflow queue/dependency engine/rework loops, writing agents, config/model editing UI, full locale switching, tray/autostart, remote Web/API/PostgreSQL/auth/pairing/WSS, device secret storage, installer/signing หรือ production deployment Resume และ pause-running-process ไม่รองรับ Dashboard อ่าน latest 100 runs; logs ใน UI แสดงล่าสุด 500 events ขณะที่ DB เก็บประวัติจริง

Read-only Codex sandbox ไม่เท่ากับ isolated filesystem VM และ approved working directory ไม่รับรองว่าปิด filesystem reads นอก root ดูรายละเอียด security boundaries ใน SECURITY.md ผลทดสอบไม่ใช่ production readiness หรือ full MVP acceptance

## วิธีเริ่ม

```powershell
pnpm install --frozen-lockfile
pnpm desktop
```

หรือเปิด `target/release/crewnest-desktop.exe` ที่ build แล้ว ใช้ `pnpm dev` เฉพาะ frontend preview ดู DEVELOPMENT.md และ MANUAL.md สำหรับ test/build/smoke commands และ local data behavior
