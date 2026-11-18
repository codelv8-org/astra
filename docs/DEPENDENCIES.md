# Toolchain และ versions ที่เลือก

วันที่ตรวจ 2026-11-17; npm direct dependencies pin ใน package.json และ transitive dependencies pin ใน pnpm-lock.yaml Rust dependencies resolve ใน Cargo.lock หลีกเลี่ยง Tauri 3 alpha โดยใช้ stable 2.x ตาม requirement

| ส่วน | Version |
|---|---|
| Node / pnpm ในเครื่อง | 24.22.1 / 11.25.0 |
| Rust/Cargo | 1.95.0 MSVC x86_64 |
| C++ Build Tools ที่ใช้ | Visual Studio 18 BuildTools, MSVC 14.50.35717 |
| WebView2 ในเครื่อง | 157.0.4341.46 |
| React / React DOM | 19.3.1 |
| TypeScript / Vite | 5.9.3 / 7.3.8 |
| Tailwind / plugin | 4.3.5 |
| Tauri Rust / JS API / CLI | 2.12.6 / 2.12.5 / 2.12.5 |
| Tauri build / dialog | 2.7.5 / 2.8.4 |
| rusqlite | 0.43.0, bundled SQLite |
| parking_lot (Phase 2 queue lock) | 0.12.5 ใน Cargo.lock |
| Zod / TanStack Query | 4.6.7 / ยังไม่ใช้จน Phase 3 Web |
| Vitest / Playwright | 4.1.12 / 1.65.1 |
| ESLint / typescript-eslint | 10.15.0 / 8.73.0 |
| Prettier | 3.7.4 |

pnpm 11 ใช้ `allowBuilds: esbuild: true` โดยไม่เปิด lifecycle scripts ของทุก package มี minimumReleaseAgeExclude แบบ pin ที่ pnpm สร้างสำหรับ direct packages ที่ตรวจ version แล้ว ไม่มี wildcard อนุญาตทุก package

Windows release build ผ่านโดยไม่ ignore Tauri version mismatches; Rollup รายงาน non-fatal annotation warnings จาก Zod ใน dependency source โดยไม่แก้ third-party code

Fastify/PostgreSQL/Drizzle/WebSocket deployment versions ยังไม่เลือกเพราะอยู่นอก Phase 0–1 ไม่เพิ่ม services ที่ไม่ใช้งานใน foundation
