# Project Source Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หนึ่งโปรเจกต์มี source folder ได้หลายรายการ, ตรวจ git 1 folder : 1 repo อัตโนมัติ และตั้ง primary folder ได้

**Architecture:** ตารางใหม่ `project_folders`; `projects.path`/`projects.is_git` เป็น mirror ของ primary (อัปเดตใน transaction เดียว) ทำให้ caller เดิมทั้งหมด (runtime cwd, writing root, dialogs) ได้ primary โดยไม่แก้. กฎ git อยู่ใน module ใหม่ `folders.rs` ของ desktop-core

**Tech Stack:** Rust (rusqlite 0.43, tauri 2), React 19 + TS, zod, vitest, Playwright IPC fixture

**Spec:** `docs/superpowers/specs/2026-11-22-project-source-folders-design.md`

## Global Constraints

- Schema version ใหม่ = 5; `Store::open` ต้องปฏิเสธ `version > 5`
- path เปรียบเทียบแบบ case-insensitive (`COLLATE NOCASE`) เหมือน `projects.path`
- กฎ validate folder เดิม (ไม่มี drive root, ไม่มี UNC, ไม่อยู่ใต้ SystemRoot/ProgramFiles) ใช้กับทุก folder
- โปรเจกต์มี folder ได้สูงสุด 8 รายการ (my call: กันใบอนุมัติ/arg ยาวเกิน)
- writing patch ยังจำกัดใน primary (ไม่แตะ `writing.rs`)
- ข้อความ UI เป็นภาษาไทย เหมือนส่วนอื่นของแอป
- ห้ามแตะ hunk ที่ยังไม่ commit ของผู้ใช้ใน `App.tsx`/`main.rs` นอกเหนือส่วนที่งานนี้ต้องแก้

## Review Focus

- เพิ่ม folder ที่เป็น **subfolder ของ repo ที่มีอยู่แล้วในโปรเจกต์** → ต้องถูกปฏิเสธเพราะ repo_root ซ้ำ (Task 2 test `same_repo_subfolder_rejected`)
- **git worktree** (`.git` เป็นไฟล์) → นับเป็น git, repo_root = folder นั้น (Task 2 test `worktree_git_file_detected`)
- เปลี่ยน primary ระหว่างโปรเจกต์มี execution `running` → ปฏิเสธ (Task 3 test `primary_change_blocked_while_running`)
- DB เวอร์ชัน 4 ที่มีโปรเจกต์อยู่แล้ว → หลัง migrate ทุกโปรเจกต์มี primary folder ตรงกับ `path` (Task 1 test `v4_projects_backfilled_as_primary`)
- folder ถูกลบ/ย้ายออกจากดิสก์หลังลงทะเบียน → `project()` ยังโหลดได้ (ไม่ canonicalize ตอนอ่าน) และ UI แสดงป้าย "ไม่พบ folder" (Task 3 test `missing_folder_still_loads`, field `exists`)

---

### Task 1: Migration 005 + model

**Files:**
- Create: `packages/desktop-core/migrations/005_project_folders.sql`
- Modify: `packages/desktop-core/src/store.rs` (open: version guard 4→5, run 005 inside `BEGIN IMMEDIATE`/`COMMIT` เหมือน 002/003)
- Modify: `packages/desktop-core/src/models.rs`
- Test: `packages/desktop-core/tests/folders.rs` (ไฟล์ใหม่)

**Interfaces:**
- Produces:
  - SQL `project_folders(id TEXT PK, project_id TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL UNIQUE COLLATE NOCASE, repo_root TEXT, is_git INTEGER NOT NULL, is_primary INTEGER NOT NULL, position INTEGER NOT NULL, created_at TEXT NOT NULL)`; `CREATE UNIQUE INDEX one_primary_folder ON project_folders(project_id) WHERE is_primary=1`; backfill `INSERT ... SELECT lower(hex(randomblob(16))), id, path, CASE WHEN is_git THEN path END, is_git, 1, 0, created_at FROM projects`; `schema_migrations` 5; `PRAGMA user_version=5`
  - `models::ProjectFolder { id, path: String, repo_root: Option<String>, is_git: bool, is_primary: bool, position: i64, exists: bool }` (serde camelCase)
  - `Project` เพิ่ม `pub folders: Vec<ProjectFolder>`

- [ ] **Step 1: Write failing test `v4_projects_backfilled_as_primary`** — สร้าง DB ด้วย `Store::open`, register project, จากนั้น `DROP TABLE project_folders; DELETE FROM schema_migrations WHERE version=5; PRAGMA user_version=4` แล้ว `Store::open` ซ้ำ; assert `project.folders.len()==1`, `folders[0].is_primary`, `folders[0].path == project.path`
- [ ] **Step 2: Run** `pnpm test:rust -- --test folders` → FAIL (no field `folders`)
- [ ] **Step 3: Implement** migration, guard, model; `Store::project()` โหลด folders เรียงตาม `position` (`exists = Path::new(&path).is_dir()`)
- [ ] **Step 4: Run** `pnpm test:rust` → PASS ทั้ง suite (รวม `migrations_seed_and_persistence_are_idempotent` ซึ่งต้องปรับจำนวน `schema_migrations` เป็น 5)
- [ ] **Step 5: Commit** `feat(core): add project_folders table and migration 005`

### Task 2: Folder inspection rules (`folders.rs`)

**Files:**
- Create: `packages/desktop-core/src/folders.rs`; register `pub mod folders;` ใน `lib.rs`
- Modify: `packages/desktop-core/src/store.rs` — ย้ายกฎ validate เดิมใน `register_project` ไปเป็น `folders::validate_dir`
- Test: `packages/desktop-core/tests/folders.rs`

**Interfaces:**
- Produces:
  - `pub fn validate_dir(selected: &Path) -> Result<PathBuf>` (canonical path, กฎเดิมทั้งหมด)
  - `pub fn repo_root(dir: &Path) -> Option<PathBuf>` — เดินขึ้นจาก `dir` จนเจอ `.git` (dir หรือ file)
  - `pub struct Inspected { pub path: String, pub repo_root: Option<String>, pub is_git: bool, pub warning: Option<String> }`
  - `pub fn inspect(selected: &Path, existing: &[ProjectFolder]) -> Result<Inspected>` — ปฏิเสธ (Err ข้อความไทย): path ซ้ำ, ซ้อนกัน (ancestor/descendant กับ folder ใดใน `existing`), `repo_root` ซ้ำ; `warning = Some("folder นี้อยู่ใน repo <root>")` เมื่อ repo_root ≠ path

- [ ] **Step 1: Write failing tests** (ใช้ tempdir + `std::fs::create_dir_all(".git")` / `write(".git","gitdir: x")`)
  - `plain_dir_is_not_git`: `inspect(a, &[])` → `is_git==false`, `repo_root==None`
  - `repo_root_detected`: a/.git → `repo_root==Some(a)`, `warning==None`
  - `worktree_git_file_detected`: a/.git เป็นไฟล์ → `is_git==true`
  - `subfolder_warns`: a/.git, inspect a/sub → `warning` มี path ของ a
  - `same_repo_subfolder_rejected`: existing=[a], inspect a/sub → Err
  - `nested_folder_rejected`: existing=[a] (ไม่ใช่ git), inspect a/b → Err; existing=[a/b], inspect a → Err
  - `duplicate_rejected`: existing=[a], inspect a (ต่าง case บน Windows) → Err
- [ ] **Step 2: Run** `pnpm test:rust -- --test folders` → FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; เปรียบเทียบ path ด้วย `to_lowercase()` ของ canonical string
- [ ] **Step 4: Run** `pnpm test:rust` → PASS
- [ ] **Step 5: Commit** `feat(core): folder inspection with 1-folder:1-repo rules`

### Task 3: Store operations

**Files:**
- Modify: `packages/desktop-core/src/store.rs`
- Test: `packages/desktop-core/tests/folders.rs`

**Interfaces:**
- Consumes: `folders::inspect`, `ProjectFolder`
- Produces:
  - `pub fn register_project(&self, name: &str, goal: &str, folders: &[PathBuf], primary: usize) -> Result<Project>` (แทน signature เดิม; ต้องมี ≥1 และ ≤8 folder; ตรวจทุก folder กับ folder ก่อนหน้าในรายการเดียวกัน และกับ `project_folders` ทั้งตาราง)
  - `pub fn add_project_folder(&self, project_id: &str, selected: &Path) -> Result<Project>`
  - `pub fn remove_project_folder(&self, project_id: &str, folder_id: &str) -> Result<Project>` — Err ถ้าเป็น primary หรือเหลือ folder เดียว
  - `pub fn set_primary_folder(&self, project_id: &str, folder_id: &str) -> Result<Project>` — transaction เดียว: clear/set `is_primary`, `UPDATE projects SET path, is_git`; Err ถ้ามี `executions.status='running'` ของโปรเจกต์
  - audit actions: `workspace_approved` (เดิม), `folder_added`, `folder_removed`, `primary_changed`
- เปลี่ยน caller เดิม `register_project(name, goal, &path)` ใน tests ทั้งหมด → `register_project(name, goal, &[path], 0)`

- [ ] **Step 1: Write failing tests**
  - `register_multi_folder_sets_primary`: 2 folders, primary=1 → `project.path == folders[1]`, `folders.iter().filter(is_primary).count()==1`
  - `primary_switch_updates_project_path`: set_primary → `project(id).path` เปลี่ยน และ `is_git` ตาม folder ใหม่
  - `cannot_remove_primary_or_last`: ทั้งสองกรณี Err
  - `folder_used_by_other_project_rejected`
  - `primary_change_blocked_while_running`: insert execution `running` ตรง ๆ ผ่าน `connect()` → Err
  - `missing_folder_still_loads`: ลบ dir ที่ไม่ใช่ primary หลัง register → `project()` Ok และ `exists==false`
  - `more_than_eight_rejected`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `pnpm test:rust` → PASS (รวม test เดิมที่ปรับ signature)
- [ ] **Step 5: Commit** `feat(core): multi-folder project store operations`

### Task 4: Runtime — additional folders

**Files:**
- Modify: `packages/desktop-core/src/runtime.rs` (`run_codex`, บริเวณ `.current_dir(&project.path)`)
- Modify: `packages/desktop-core/src/lib.rs` (`execution_prompt`)
- Test: `packages/desktop-core/tests/folders.rs`

**Interfaces:**
- Produces:
  - `pub fn extra_dir_args(adapter: &str, project: &Project) -> Vec<String>` ใน `adapters.rs` — `claude` (ไม่ใช่ writing mode): `["--add-dir", p]` ต่อทุก folder ที่ไม่ใช่ primary และ `exists`; adapter อื่น → `vec![]`
  - `execution_prompt` ได้บรรทัด `Additional read-only folders: <p1>; <p2>` เมื่อมี folder เพิ่ม (codex read-only sandbox อ่านได้อยู่แล้ว; antigravity sandbox อาจอ่านไม่ได้ — ระบุในใบอนุมัติ)
- [ ] **Step 1: Write failing tests** `claude_gets_add_dir_for_secondary_only` (primary ไม่อยู่ใน args, folder `exists==false` ถูกข้าม), `codex_and_antigravity_get_no_add_dir`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**; ใน writing mode ไม่เพิ่ม `--add-dir` (patch อยู่ใน primary)
- [ ] **Step 4: Run** `pnpm test:rust` → PASS
- [ ] **Step 5: Commit** `feat(core): pass secondary folders to runtimes`

### Task 5: Tauri IPC

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs` (`create_project`, approval dialog ใน `start_run`, `generate_handler!`)
- Modify: `docs/IPC_CONTRACTS.md`
- Test: IPC tests ใน `main.rs` (`pnpm test:ipc`)

**Interfaces:**
- Produces commands:
  - `pick_folder() -> Option<String>` (native picker, title "Astra — approve a source folder")
  - `inspect_folder(path: String, project_id: Option<String>) -> Inspected` (preview ป้ายก่อนบันทึก; `existing` = folders ของโปรเจกต์นั้นหรือ `[]`)
  - `create_project(name, goal, folders: Vec<String>, primary: usize) -> Project`
  - `add_project_folder(project_id, path) -> Project`, `remove_project_folder(project_id, folder_id) -> Project`, `set_primary_folder(project_id, folder_id) -> Project`
- ใบอนุมัติ `start_run`: `Workspace: <primary>` + `Additional folders: ...` + เมื่อ adapter=antigravity และมี folder เพิ่ม: `Note: antigravity uses the primary folder only`
- security: path จาก UI ต้องผ่าน `folders::validate_dir` อีกครั้งเสมอ (ไม่เชื่อ client)
- [ ] **Step 1: Write failing IPC test** `create_project_with_two_folders` ด้วย tempdir เรียก `create_project` → `folders.len()==2`
- [ ] **Step 2: Run** `pnpm test:ipc` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `pnpm test:ipc` → PASS
- [ ] **Step 5: Commit** `feat(desktop): IPC for multi-folder projects`

### Task 6: UI — folder list in create form and ProjectDetail

**Files:**
- Create: `apps/desktop/src/home/FolderList.tsx`
- Modify: `packages/shared/src/index.ts` (`ProjectFolder`, `Project.folders`, `Inspected`)
- Modify: `apps/desktop/src/bridge.ts`, `apps/desktop/src/App.tsx` (`createProject` + modal form), `apps/desktop/src/home/ProjectDetail.tsx`, `apps/desktop/src/home/home.css`
- Modify: `tests/e2e/ipc-fixture.spec.ts` (mock commands ใหม่)
- Test: `tests/unit/folder-list.test.ts`, `tests/e2e/home.spec.ts` หรือ spec ใหม่ `tests/e2e/project-folders.spec.ts`

**Interfaces:**
- `FolderList({ folders, busy, onAdd, onRemove, onMakePrimary })` — แถว: path (`displayPath`), ป้าย `git` / `ไม่ใช่ git` / warning / `ไม่พบ folder`, ★ "Primary" หรือปุ่ม "ตั้งเป็น primary", ปุ่ม "ลบ" (disabled สำหรับ primary และเมื่อเหลือแถวเดียว); ปุ่ม "+ เพิ่ม folder" ซ่อนเมื่อครบ 8
- ฟอร์มสร้าง: เก็บ draft `Inspected[]` ใน state; folder แรกเป็น primary โดย default; ปุ่ม submit "สร้างโปรเจกต์" disabled จนมี ≥1 folder
- [ ] **Step 1: Write failing unit test** — pure helper `canRemove(folder, folders)` และ `nextPrimaryAfterAdd` ใน `FolderList.tsx` export
- [ ] **Step 2: Write failing e2e** `project-folders.spec.ts`: เปิด modal → เพิ่ม 2 folder (fixture `pick_folder` คืน path ต่างกัน) → ตั้งแถวที่ 2 เป็น primary → สร้าง → ProjectDetail แสดง 2 แถวและ ★ ที่แถว 2
- [ ] **Step 3: Run** `pnpm test` และ `pnpm test:e2e project-folders` → FAIL
- [ ] **Step 4: Implement**
- [ ] **Step 5: Run** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` → PASS
- [ ] **Step 6: Verify ใน in-app browser** (dev server) — ฟอร์มเพิ่ม folder, ป้าย, primary, ProjectDetail; screenshot
- [ ] **Step 7: Commit** `feat(desktop): multi-folder project UI with primary selection`
