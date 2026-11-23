# Project source folders — design (short)

Status: draft, awaiting owner approval · 2026-11-22

## Intent
เพิ่มโปรเจกต์แล้วแนบ source folder ได้หลายรายการ แบบ Claude Code / Codex: มี **primary folder** หนึ่งอันเป็นที่ทำงานหลักของ agent ส่วน folder อื่นเป็นบริบทเพิ่ม และสลับ primary ได้

## Goals
- หนึ่งโปรเจกต์มี folder 1..N รายการ, มี primary เพียงหนึ่ง
- ตรวจ git อัตโนมัติ: 1 folder : 1 repo
- "Make primary" / เพิ่ม / ลบ folder ได้ทั้งตอนสร้างและในหน้า ProjectDetail
- โปรเจกต์เดิมย้ายมาเป็น primary folder อัตโนมัติ

## Non-goals
- writing patch ข้าม folder (รอบนี้ patch อยู่ใน primary เท่านั้น)
- network/UNC workspace (ยังปฏิเสธตามเดิม)

## Approaches
1. **ตาราง `project_folders` + `projects.path` mirror ของ primary** — เลือก (owner, 2026-11-22). call site เดิมทั้งหมดได้ primary อัตโนมัติ; ต้องคุม mirror ใน transaction เดียว
2. JSON column ใน `projects` — ไม่เลือก: DB บังคับ uniqueness ข้ามโปรเจกต์ไม่ได้
3. ตารางใหม่ + เลิกใช้ `projects.path` — ไม่เลือก: แตะทุก caller และ SQLite drop UNIQUE ยาก

## Design
- **Migration `005_project_folders.sql`**: `project_folders(id, project_id → projects, path UNIQUE NOCASE, repo_root NULL, is_git, is_primary, position, created_at)`; partial unique index `(project_id) WHERE is_primary=1`; backfill ทุก project เดิมเป็น primary
- **Git check (desktop-core)**: canonicalize → validate ด้วยกฎเดิมของ `register_project` (UNC/system dir) → เดินขึ้นหา `.git` (dir หรือ file ของ worktree) → `repo_root`
  - ปฏิเสธ: path ซ้ำ/อยู่ในโปรเจกต์อื่น, folder ซ้อนกัน, สอง folder ได้ `repo_root` เดียวกัน
  - folder เป็น subfolder ของ repo → รับได้แต่ส่งคำเตือนพร้อม repo root
  - non-git → รับได้, `is_git=false`
- **Primary**: `set_primary_folder` อัปเดต `is_primary` และ `projects.path`/`projects.is_git` ใน transaction เดียว; ลบ primary ไม่ได้ (ต้องย้าย primary ก่อน); ลบ folder สุดท้ายไม่ได้; ห้ามเปลี่ยนขณะโปรเจกต์มี run ที่ `running`
- **Runtime**: cwd = primary; folder อื่นส่ง `--add-dir <path>` ให้ claude และ codex; antigravity ไม่รองรับ → แสดงในใบอนุมัติว่าใช้เฉพาะ primary. ใบอนุมัติ run แสดงทุก folder
- **IPC**: `create_project(name, goal, folders[])` (picker เพิ่มทีละ folder ฝั่ง UI ผ่าน `pick_folder`), `add_project_folder`, `remove_project_folder`, `set_primary_folder`; `Project` ได้ field `folders: ProjectFolder[]`
- **UI**: ฟอร์มเพิ่มโปรเจกต์มีรายการ folder (path, ป้าย git/ไม่ใช่ git/คำเตือน, ★ primary, Make primary, ลบ) + ปุ่ม "+ เพิ่ม folder"; ProjectDetail ใช้ component เดียวกัน
- **Audit**: `folder_added`, `folder_removed`, `primary_changed`

## Left to the builder
ชื่อ component, ข้อความ UI, ลำดับ test (Rust unit สำหรับกฎ git + migration, vitest สำหรับ UI)
