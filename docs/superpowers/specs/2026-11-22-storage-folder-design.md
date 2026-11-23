# Storage folder (local / File Sharing) — design (short)

Status: draft, awaiting owner approval · 2026-11-22

## Intent
พื้นที่บน Local PC ไม่พอ ผู้ใช้ต้องการเลือกที่เก็บข้อมูลของแอป (artifacts, scheduled/queue tasks, runs, logs) ไปไว้ไดรฟ์อื่นหรือ File Share (SMB/UNC) — **ใช้เครื่องเดียว** ไม่ใช่การแชร์ข้อมูลหลายเครื่อง

## Goals
- Settings → Storage folder: แสดงตำแหน่งปัจจุบัน ("ข้อมูลของคุณเก็บอยู่ที่ …") และเปลี่ยนได้
- รองรับ path ในเครื่อง, mapped drive และ UNC `\\server\share\...`
- ย้ายข้อมูลเดิมไปที่ใหม่อย่างปลอดภัย ไม่ทำข้อมูลหาย
- กันไม่ให้ DB บน share ถูกเปิดซ้อนจากเครื่องอื่น

## Non-goals / anti-goals
- sync หรือใช้ข้อมูลร่วมหลายเครื่อง
- แยก artifact ออกเป็นไฟล์ (แบบ S2)
- **anti-goal:** สร้าง DB ใหม่เงียบ ๆ เมื่อ share หาย (ผู้ใช้จะคิดว่าข้อมูลหาย)
- source folder บน UNC ยังไม่รองรับ (กฎเดิมคงไว้)

## Approaches
- **S1 ย้ายทั้ง data folder (รองรับ UNC)** — เลือก (owner, 2026-11-22)
- S2 DB local + blob บน share — ไม่เลือก: artifact เป็นแถวใน DB ต้องรื้อ queue/remote/runtime
- S3 local drive เท่านั้น — ไม่เลือก: ไม่ตอบโจทย์ File Sharing

## Design
- **Pointer file**: `app_local_data_dir/storage.json` = `{ "dataDir": "<path>", "previous": "<path>|null" }`. ไม่มีไฟล์ = ค่า default เดิม (`app_local_data_dir`, dev ยังเคารพ `CREWNEST_DATA_DIR`)
- **Storage mode** ตัดสินจาก path: UNC หรือ drive ที่ `GetDriveTypeW == DRIVE_REMOTE` → `network`, อื่น ๆ → `local`
  - `local`: `journal_mode=WAL` (เหมือนเดิม)
  - `network`: `journal_mode=DELETE` (WAL ไม่ปลอดภัยบน SMB) — ตั้งตอน `Store::open`
  - หมายเหตุ: ไม่ใช้ `locking_mode=EXCLUSIVE` เพราะ `Store::connect()` เปิด connection ใหม่ทุกครั้ง จะล็อกตัวเอง
- **Instance lock**: `<dataDir>/crewnest.lock` เปิดด้วย exclusive OS lock ตลอดอายุแอป (เขียน hostname + pid + เวลา). เปิดไม่ได้ → แจ้ง "ข้อมูลกำลังถูกใช้โดย <host>" ไม่เปิด DB
- **ย้ายข้อมูล** (`change_storage_folder(path)`):
  1. ตรวจปลายทาง: เขียน/ลบไฟล์ทดสอบได้, ไม่มี `crewnest.db` อยู่แล้ว (ถ้ามี → ถามว่าจะ "ใช้ข้อมูลที่มีอยู่" แทนการคัดลอก), พื้นที่ว่าง ≥ ขนาด DB × 1.2
  2. หยุด scheduler ชั่วคราว; ปฏิเสธถ้ามี run `running`
  3. `VACUUM INTO '<dest>/crewnest.db'` (snapshot สม่ำเสมอ ไม่ต้องสนใจไฟล์ -wal)
  4. เปิดไฟล์ปลายทาง `PRAGMA integrity_check` + เทียบจำนวนแถวตารางหลัก
  5. เขียน `storage.json` แบบ atomic (เขียน temp แล้ว rename) → แจ้งให้รีสตาร์ท (ปุ่ม "รีสตาร์ทเลย")
  6. ข้อมูลที่เดิมไม่ลบ; Settings มีปุ่ม "ลบข้อมูลที่ตำแหน่งเดิม" แยก (ยืนยันก่อนลบ)
- **ตอนเปิดแอปแล้ว storage ใช้ไม่ได้** (share หลุด/ไม่มีสิทธิ์/lock ไม่ได้/ไม่พบ DB): ไม่ panic, เปิดหน้า Storage recovery: "ลองใหม่", "เลือก folder อื่น", "กลับไปใช้ตำแหน่งเดิม" (ถ้า `previous` ยังมี DB)
- **IPC**: `storage_info()` → `{ dataDir, mode, dbBytes, freeBytes, previous }`; `pick_storage_folder()`; `change_storage_folder(path, useExisting)`; `restart_app()`; `delete_previous_storage()`
- **UI**: section "Storage" ใน Settings (ตำแหน่ง, ป้าย Local/Network, ขนาด DB, พื้นที่ว่าง, ปุ่มเปลี่ยน) + หน้า recovery
- **Audit**: `storage_changed` (ในที่ใหม่หลังรีสตาร์ท)

## Left to the builder
ตำแหน่ง Settings ใน UI ปัจจุบัน (AppRail/WorkspaceSidebar), ข้อความ UI, การทดสอบ (Rust unit: mode detection, migration + integrity, lock conflict ด้วย temp dir; UNC ทดสอบด้วย share จริงแบบ manual UAT)
