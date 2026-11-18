# รายการย้าย branding และรักษาระบบเดิม

## ข้อจำกัด baseline

`D:\Projects\astraops` ว่าง ณ เริ่มงาน 2026-11-17 ไม่มี source, tests, default records หรือ config ให้แก้เทียบ ผู้ใช้ให้ MASTER BUILD PROMPT เดิมในแชตแล้วและปรับเป็น `MASTER_BUILD_PROMPT.md` Registry และ codebase_memory ไม่มี project นี้ จึงไม่ index หรือเดา root อื่น การตรวจ source migration ยัง pending จนกว่าจะมี implementation

## ก่อนแก้ระบบเดิม

- ระบุ source root, commit และสเปก baseline ที่ตรวจสอบได้ อ่าน project notes และ graph ตาม Agent Flow
- เก็บ diff/backup รวม uncommitted changes; บันทึก snapshot ของ agent IDs, roles, permissions, runtime mappings, task ownership และ approval rules โดยไม่ export secrets
- ใช้ mapping ตาม baseline: Decade → ASTRA; Giam (Gaim) → FORGE; Ex-Aid → MIRA; Double → VECTOR; Zi-O → SCOUT แล้วตรวจ stable IDs ของ implementation จริงก่อนแก้ records
- ทำ dry run แสดงไฟล์และ fields ที่จะเปลี่ยนก่อน apply

## พื้นที่ที่ต้องตรวจและเปลี่ยน

| พื้นที่ | การเปลี่ยน | ตรวจรักษาพฤติกรรม |
|---|---|---|
| UI labels และ app metadata | CrewNest และ CrewBots | routing, controls, localization keys |
| Default agent records | ชื่อ/ภาพตาม role mapping | IDs, adapter binding, permissions, existing records และ idempotent seed |
| Agent Dashboard/Cards/Detail Modal | assets และชื่อ | filters, pagination, keyboard/focus |
| Workflow Board/Execution Monitor | icon และ state mapping | dependencies, execution lifecycle, cancel/retry |
| Notifications/empty states/reports | ภาพและข้อความ | accessible names, event semantics, report data |
| Source/config/design docs | branding references | technical contracts และ architecture เดิม |
| Tests/fixtures/snapshots | expected labels/assets | คง assertions ด้าน workflow/security เดิม |
| Installer/update metadata | display branding ที่รองรับ | signing, app identifier, updater และ data path เดิม |

ค้นหา old identity, old character names, case variants, filenames, alt text, screenshots และ default data แบบ scoped ไม่แก้ lockfiles, dependencies หรือ third-party license ด้วย blanket replace เก็บคำอ้างอิงเก่าเฉพาะ migration history ที่จำเป็น

## เกณฑ์ยอมรับ

- รัน test/build commands จาก MANUAL.md หรือ project scripts ที่อ่านแล้ว ห้ามเดาคำสั่ง adapter
- เทียบ contracts, permission matrix, workflow/dependency fixtures และ approval events กับ baseline เดิม
- ทดสอบ runtime adapters ทั้งสาม, local execution และ secure remote control ในสภาพแวดล้อมที่อนุญาต
- ตรวจ UI ทุกพื้นที่ที่ระบุ พร้อม light/dark, 375px, keyboard, screen reader text และ reduced-motion
- ค้นซ้ำให้ไม่มี branding เก่าใน active product; migration history ต้องระบุเหตุผล
- คืน branding ได้จาก commit/backup โดยไม่ reset database หรือทำลาย task history
- append factual work log ใน canonical project notes หลัง checks ผ่านและ project entry ถูก resolve; ไม่สร้าง registry หรือแก้ curated architecture เอง

## ผลในชุดส่งมอบนี้

มีข้อกำหนดใหม่และ original asset pack; การ migrate source/config/tests/default records, preservation regression และ app UAT ยัง pending เพราะไม่มี baseline ห้ามรายงานว่า rebranding ระบบเดิมครบแล้ว
