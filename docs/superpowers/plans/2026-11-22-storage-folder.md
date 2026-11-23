# Storage Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้เลือกที่เก็บข้อมูลแอป (local / mapped drive / UNC share) ได้ ย้ายข้อมูลเดิมอย่างปลอดภัย และแอปเปิดเข้าหน้ากู้คืนเมื่อ storage ใช้ไม่ได้

**Architecture:** module ใหม่ `storage.rs` ใน desktop-core จัดการ pointer file, mode detection, instance lock และการย้าย (`VACUUM INTO` + integrity check). `Store::open_with(path, mode)` เลือก journal mode. Tauri `setup` resolve storage ก่อน; ถ้าล้มเหลว manage `StorageStatus` แบบ error แทน `Core` และ UI แสดงหน้า recovery

**Tech Stack:** Rust (rusqlite, fs2 สำหรับ file lock + free space, windows-sys `Win32_Storage_FileSystem` สำหรับ `GetDriveTypeW`), tauri 2, React

**Spec:** `docs/superpowers/specs/2026-11-22-storage-folder-design.md`

## Global Constraints

- pointer file: `<app_local_data_dir>/storage.json` = `{ "dataDir": string, "previous": string | null }`, เขียนแบบ atomic (temp + rename)
- ไม่มี pointer → default เดิม (`app_local_data_dir`, debug เคารพ `CREWNEST_DATA_DIR`)
- local → `journal_mode=WAL`; network → `journal_mode=DELETE`; ห้ามใช้ `locking_mode=EXCLUSIVE`
- lock file `<dataDir>/crewnest.lock` exclusive ตลอดอายุแอป, เนื้อหา `hostname pid rfc3339`
- พื้นที่ว่างปลายทาง ≥ ขนาด DB × 1.2
- ห้ามสร้าง DB ใหม่เงียบ ๆ เมื่อ storage ที่ตั้งไว้หาไม่เจอ
- ข้อมูลที่ตำแหน่งเดิมไม่ลบอัตโนมัติ
- UNC อนุญาตเฉพาะ storage (กฎ workspace เดิมไม่เปลี่ยน)

## Review Focus

- share หลุด **ระหว่าง** แอปทำงาน → query ล้มเหลวเป็น error ปกติ ไม่ panic/ไม่ทำ DB เสีย; ข้อความบอกให้ตรวจการเชื่อมต่อ (Task 4: map rusqlite IO error ใน `snapshot` เป็นข้อความไทย, test ด้วย path ที่ถูกลบหลังเปิด)
- แอปปิดกะทันหันระหว่างย้าย → pointer ยังชี้ที่เดิม (เขียน pointer เป็นขั้นสุดท้าย) และไฟล์ปลายทางที่ค้างถูกลบในครั้งถัดไป (Task 3 test `interrupted_copy_leaves_pointer_unchanged`)
- เลือกปลายทางที่มี `crewnest.db` อยู่แล้ว (เช่น ย้ายกลับ) → ต้องถามว่าจะใช้ข้อมูลที่มีอยู่ ไม่เขียนทับ (Task 3 test `existing_db_requires_use_existing`)
- lock file ค้างจากแอปที่ crash → OS ปล่อย lock เมื่อ process ตาย จึงเปิดได้ (Task 2 test `stale_lock_file_is_reacquired`)
- เลือกปลายทาง = ตำแหน่งปัจจุบัน หรือเป็น subfolder ของมัน → ปฏิเสธ (Task 3 test `same_or_nested_destination_rejected`)

---

### Task 1: Pointer file + mode detection

**Files:**
- Create: `packages/desktop-core/src/storage.rs`; `pub mod storage;` ใน `lib.rs`
- Modify: `packages/desktop-core/Cargo.toml` (windows-sys feature `Win32_Storage_FileSystem`)
- Test: `packages/desktop-core/tests/storage.rs`

**Interfaces:**
- Produces:
  - `#[derive(Serialize, Deserialize)] pub struct Pointer { pub data_dir: PathBuf, pub previous: Option<PathBuf> }` (camelCase)
  - `pub fn read_pointer(local_dir: &Path) -> Result<Option<Pointer>>` (ไฟล์เสีย → Err ไม่ใช่ None)
  - `pub fn write_pointer(local_dir: &Path, p: &Pointer) -> Result<()>` (atomic)
  - `#[derive(Serialize, Clone, Copy, PartialEq)] #[serde(rename_all="lowercase")] pub enum Mode { Local, Network }`
  - `pub fn detect_mode(dir: &Path) -> Mode` — UNC prefix (`\\` หรือ `\\?\UNC\`) → Network; Windows: `GetDriveTypeW(root) == DRIVE_REMOTE` → Network; อื่น ๆ Local
- [ ] **Step 1: Failing tests** `pointer_roundtrip`, `missing_pointer_is_none`, `corrupt_pointer_is_error`, `unc_is_network` (`detect_mode(Path::new(r"\\server\share\x")) == Network`), `tempdir_is_local`
- [ ] **Step 2: Run** `pnpm test:rust -- --test storage` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(core): storage pointer and mode detection`

### Task 2: Instance lock + Store journal mode

**Files:**
- Modify: `packages/desktop-core/src/storage.rs`, `packages/desktop-core/src/store.rs`
- Test: `packages/desktop-core/tests/storage.rs`

**Interfaces:**
- Produces:
  - `pub struct InstanceLock(std::fs::File)` — `pub fn acquire(dir: &Path) -> Result<InstanceLock>` ใช้ `fs2::FileExt::try_lock_exclusive`; ล้มเหลว → Err `"ข้อมูลกำลังถูกใช้โดย <เนื้อหาไฟล์>"`; สำเร็จ → truncate แล้วเขียน `hostname pid now()`
  - `Store::open_with(path: impl AsRef<Path>, mode: Mode) -> Result<Store>`; `Store::open(path)` = `open_with(path, Mode::Local)` (test เดิมไม่ต้องแก้)
- [ ] **Step 1: Failing tests** `second_lock_in_same_dir_fails` (acquire สองครั้ง ตัวที่สอง Err มีคำว่า "กำลังถูกใช้"), `stale_lock_file_is_reacquired` (drop ตัวแรกแล้ว acquire ใหม่ได้), `network_mode_uses_delete_journal` (`PRAGMA journal_mode` == "delete"), `local_mode_uses_wal`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `pnpm test:rust` → PASS ทั้ง suite
- [ ] **Step 5: Commit** `feat(core): instance lock and per-mode journal`

### Task 3: Migrate storage

**Files:**
- Modify: `packages/desktop-core/src/storage.rs`
- Test: `packages/desktop-core/tests/storage.rs`

**Interfaces:**
- Consumes: `Pointer`, `write_pointer`, `detect_mode`, `Store`
- Produces:
  - `#[derive(Serialize)] pub struct Info { pub data_dir: String, pub mode: Mode, pub db_bytes: u64, pub free_bytes: u64, pub previous: Option<String> }`
  - `pub fn info(data_dir: &Path, previous: Option<&Path>) -> Result<Info>` (`fs2::available_space`)
  - `pub enum Target { Copy, UseExisting }`
  - `pub fn migrate(store: &Store, local_dir: &Path, current: &Path, dest: &Path, target: Target) -> Result<()>`:
    1. validate: dest มีอยู่และเขียนได้ (สร้าง/ลบ `.crewnest-write-test`), dest ≠ current และไม่ซ้อนกัน
    2. `Copy` + `dest/crewnest.db` มีอยู่ → Err `"EXISTING_DB"` (UI แปลเป็นคำถาม); `UseExisting` + ไม่มี → Err
    3. Copy: ตรวจพื้นที่ ≥ ×1.2; ปฏิเสธถ้ามี execution `running`; ลบ `dest/crewnest.db.partial` ค้าง; `VACUUM INTO 'dest/crewnest.db.partial'`; เปิดไฟล์นั้น `PRAGMA integrity_check`=="ok" และ COUNT ของ `projects, tasks, executions, execution_events, workflows` เท่าต้นทาง; rename `.partial` → `crewnest.db`; เปิด DB ปลายทางแล้วบันทึก audit `storage_changed` (subject = dest path)
    4. UseExisting: เปิดแบบ read-only ตรวจ `integrity_check` และ `user_version <= ` เวอร์ชันแอป
    5. สุดท้าย `write_pointer(local_dir, Pointer{ data_dir: dest, previous: Some(current) })`
  - `pub fn delete_previous(local_dir: &Path) -> Result<()>` — ลบ `crewnest.db*` ใน `previous` (ไม่ลบ folder), ตั้ง `previous=None`; Err ถ้า previous == data_dir
- [ ] **Step 1: Failing tests** `copy_migrates_rows_and_updates_pointer`, `existing_db_requires_use_existing`, `use_existing_switches_pointer_only`, `same_or_nested_destination_rejected`, `running_execution_blocks_migration`, `interrupted_copy_leaves_pointer_unchanged` (สร้าง `.partial` ปลอมที่ dest แล้ว migrate สำเร็จ = ไฟล์ค้างถูกแทน; และ pointer ไม่เปลี่ยนเมื่อ integrity ล้มเหลว — จำลองด้วย dest ที่เขียนไม่ได้), `delete_previous_removes_db_files_only`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `pnpm test:rust` → PASS
- [ ] **Step 5: Commit** `feat(core): safe storage migration`

### Task 4: Tauri bootstrap, recovery mode, IPC

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs` (`setup`, commands, `generate_handler!`)
- Modify: `docs/IPC_CONTRACTS.md`
- Test: IPC tests (`pnpm test:ipc`)

**Interfaces:**
- Consumes: Task 1–3
- Produces:
  - `fn resolve_storage(local_dir: &Path, default_dir: PathBuf) -> Result<(PathBuf, Mode, InstanceLock, Store), String>` — pointer มีแต่ dir/DB ไม่มี → Err (ไม่สร้างใหม่); ไม่มี pointer → default (สร้างได้ตามเดิม)
  - managed `StorageState { status: "ok" | "error", error: Option<String>, data_dir, previous, local_dir, _lock: Option<InstanceLock> }`; สถานะ error → ไม่ manage `Core`, ไม่ spawn scheduler
  - commands: `storage_info() -> { status, error, info: Option<Info> }`, `pick_storage_folder() -> Option<String>`, `change_storage_folder(path: String, use_existing: bool) -> ()` (ใช้ได้ทั้งโหมด ok และ recovery; ใน recovery `use_existing=false` กับ folder ว่าง = ตั้ง pointer ไปที่นั้นและสร้าง DB ใหม่หลังผู้ใช้ยืนยันใน native dialog "สร้างฐานข้อมูลใหม่ที่ …?"), `revert_storage() -> ()` (สลับ pointer ไป `previous`), `delete_previous_storage() -> ()` (native confirm ก่อน), `restart_app()` (`app.restart()`)
  - `snapshot` แปลง error ที่มาจาก IO/`SQLITE_CANTOPEN`/`SQLITE_IOERR` เป็น `"เข้าถึงพื้นที่จัดเก็บไม่ได้ — ตรวจการเชื่อมต่อ File Sharing แล้วลองใหม่"`
- [ ] **Step 1: Failing IPC tests** `resolve_storage_errors_when_pointer_target_missing` (ไม่มีไฟล์ DB ถูกสร้าง), `resolve_storage_defaults_without_pointer`
- [ ] **Step 2: Run** `pnpm test:ipc` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `pnpm test:ipc && pnpm lint:rust` → PASS
- [ ] **Step 5: Commit** `feat(desktop): configurable storage bootstrap and recovery`

### Task 5: UI — Storage page + recovery screen

**Files:**
- Create: `apps/desktop/src/StoragePanel.tsx`, `apps/desktop/src/StorageRecovery.tsx`
- Modify: `apps/desktop/src/pages.ts` (page `storage`), `apps/desktop/src/AppRail.tsx` (entry `{ page: "storage", label: "พื้นที่จัดเก็บ", icon: <ไอคอนที่มีอยู่แล้วใน icons> }` ต่อจาก runtimes), `apps/desktop/src/App.tsx` (render page; ก่อน snapshot แรกเรียก `storage_info` → status error ⇒ render `StorageRecovery` แทนทั้งแอป), `apps/desktop/src/bridge.ts`, `packages/shared/src/index.ts` (`StorageInfo`)
- Modify: `tests/e2e/ipc-fixture.spec.ts` (mock commands)
- Test: `tests/e2e/storage.spec.ts`

**Interfaces:**
- StoragePanel: หัวข้อ "ข้อมูลของคุณเก็บอยู่ที่" + path, ป้าย `Local`/`Network`, ขนาด DB, พื้นที่ว่าง; ปุ่ม "เปลี่ยนที่จัดเก็บ…" → pick → ถ้า Err `EXISTING_DB` ถามด้วย modal "พบข้อมูลเดิมที่ตำแหน่งนี้ — ใช้ข้อมูลนี้แทน?" → สำเร็จแสดง "ย้ายเสร็จแล้ว — รีสตาร์ทเพื่อใช้ตำแหน่งใหม่" + ปุ่ม "รีสตาร์ทเลย"; เมื่อมี previous: ปุ่ม "ลบข้อมูลที่ตำแหน่งเดิม"; คำอธิบายสั้น ๆ ว่า Network ใช้ได้ทีละเครื่อง
- StorageRecovery: แสดง error + ปุ่ม "ลองใหม่" (`restart_app`), "เลือก folder อื่น", "กลับไปใช้ตำแหน่งเดิม" (แสดงเมื่อมี previous)
- [ ] **Step 1: Failing e2e** `storage.spec.ts`: (a) หน้า storage แสดง path จาก fixture + ป้าย Network; (b) fixture ตอบ `EXISTING_DB` → modal ถาม → ยืนยัน → ข้อความรีสตาร์ท; (c) fixture `storage_info.status="error"` → หน้า recovery มี 3 ปุ่ม
- [ ] **Step 2: Run** `pnpm test:e2e storage` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` → PASS
- [ ] **Step 5: Verify ใน in-app browser** — หน้า storage + recovery (fixture), screenshot
- [ ] **Step 6: Manual UAT (native)** — `pnpm desktop`: ย้ายไป `D:` แล้วไป UNC share จริง, รีสตาร์ท, ตัด share แล้วเปิดแอป → หน้า recovery; บันทึกผลใน `docs/NATIVE_UAT_REPORT.md`
- [ ] **Step 7: Commit** `feat(desktop): storage settings page and recovery screen`
