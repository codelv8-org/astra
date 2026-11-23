# ใครสั่ง: initiator ในไทม์ไลน์งาน (Design, ฉบับสั้น)

สถานะ: อนุมัติโดยผู้ใช้ · 2026-11-22

## เจตนา
ตอนงานพัง เจ้าของต้องไล่ดูได้ว่าแต่ละขั้นในไทม์ไลน์งานเกิดจากใครหรืออะไร (คุณ, remote, ตัวจัดคิว, handoff, retry, ระบบ) ในจุดที่ดูอยู่แล้ว คือกล่องรายละเอียดงาน (`QueueTaskDialog`)

## Goals / Non-goals / Anti-goals
- Goal: ทุกแถวใน `task_events` ใหม่มีผู้สั่ง และกล่องรายละเอียดงานแสดงผู้สั่งทุกแถว
- Non-goals: ไม่แก้ `audit_logs`, ไม่มีหน้า audit แยก, ไม่มีช่อง decision (allow/deny), ไม่ครอบคลุมการกระทำที่ไม่ผูกกับงาน (storage, pairing) — เป็นแบบ B/C ไว้ทีหลัง
- Anti-goal: ป้ายผู้สั่งผิด (เช่น งานที่ remote ส่งมาแต่ขึ้นว่า "คุณ") แย่กว่าไม่มีป้าย จึงต้องบังคับให้ทุกจุดระบุเองตอน compile ไม่ใช้ค่า default

## Approaches
- **A (เลือก):** เพิ่ม initiator ใน `task_events` — เล็กสุด อยู่ในที่ที่ใช้ไล่ปัญหาอยู่แล้ว
- B: ขยาย `audit_logs` + รวมเข้าไทม์ไลน์ — ครอบคลุมกว่า ใหญ่ราว 2 เท่า
- C: B + หน้า audit แยกพร้อมตัวกรอง — ใหญ่สุด
ผู้ใช้เลือก A เพราะตอบทั้ง "ไล่สาเหตุงานพัง" และ "ใครสั่ง" ในที่เดิม

## การออกแบบ
1. **Migration `006_task_event_initiator.sql`** (schema 6):
   `ALTER TABLE task_events ADD COLUMN initiator TEXT NOT NULL DEFAULT 'unknown'` และ `ADD COLUMN initiator_ref TEXT` แถวเดิมเป็น `unknown`
2. **Rust:** enum `Initiator { Owner, Remote{device_id}, Scheduler, Handoff{from_task}, Retry{attempt}, System }` ใน `models.rs` เก็บเป็น `initiator` (ชื่อ) + `initiator_ref` (device id / task id ต้นทาง / ครั้งที่ลอง)
   - `task_event` และ `append_event` ใน `queue.rs` รับ `Initiator` เป็นพารามิเตอร์บังคับ ทุก call site (~17 จุดใน queue.rs, writing.rs) ระบุเอง
   - ฟังก์ชันที่ทั้งคนและ remote เรียก (`create_task`, `cancel_pending_task`, การ cancel run ที่ผูกงาน) รับ `Initiator` เพิ่ม; IPC ของ desktop ส่ง `Owner`, `remote.rs` ส่ง `Remote{device_id}`
   - `remote.rs` เขียน event `remote_command` (initiator Remote, text = action + command id) **ก่อน** เรียก effect สำหรับงานที่มีอยู่แล้ว ถ้า effect ถูกปฏิเสธเขียนแถว `remote_rejected` ตามมา
   - dispatch/timeout/recovery ใน scheduler = `Scheduler` หรือ `System`, rework/handoff = `Handoff{from_task}`, retry = `Retry{attempt}`
3. **TS:** `TaskEvent` ใน `packages/shared` เพิ่ม `initiator`, `initiatorRef?` แล้ว `QueueTaskDialog` แสดงป้ายต่อแถว: คุณ / Remote (อุปกรณ์ …) / ตัวจัดคิว / ส่งต่อจากงาน … / ลองใหม่ครั้งที่ n / ระบบ / ไม่ทราบ (ก่อนอัปเดต)
4. **Tests:** Rust — migration ให้แถวเก่าเป็น unknown; remote submit/cancel ได้ initiator Remote และ event ก่อน effect; scheduler dispatch ได้ Scheduler; retry/handoff ได้ ref ถูก. Vitest/Playwright — fixture ไทม์ไลน์แสดงป้ายครบ

## การตัดสินใจของผู้ออกแบบ (แก้ได้)
- ไม่เพิ่มคอลัมน์ `reason` เพราะ `text` เดิมเป็นเหตุผลอยู่แล้ว ใช้ `initiator_ref` แทนสำหรับข้อมูลอ้างอิง
- ไม่ backfill เดาผู้สั่งของแถวเก่า แสดงเป็น "ไม่ทราบ"

## เหลือให้ผู้ build
ชื่อ enum/ฟังก์ชันจริง, ข้อความป้ายภาษาไทยสุดท้าย, การอัปเดต `docs/IPC_CONTRACTS.md` ส่วนโน้ต Database ใน vault เป็น protected — เสนอการแก้แยก
