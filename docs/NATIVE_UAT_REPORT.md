# CrewNest Native UAT — Phase 1

วันที่ 2026-11-17 (Asia/Bangkok) · ทดสอบ Windows executable จริงผ่าน native UI ด้วย computer-use ไม่ใช้ browser IPC fixture แทนผล native

## ผลทดสอบ

| Scenario | ผลและหลักฐาน |
|---|---|
| เปิด executable ที่ build | PASS: Desktop Core connected; CrewBots ทั้งห้าแสดงผล |
| สร้างโปรเจกต์ | PASS: `CrewNest Native UAT` ผ่าน native picker ไปยัง `D:\Projects\astraops\.local\native-uat-workspace` |
| Runtime diagnostics | PASS: Codex 0.159.2 authenticated; Claude/Antigravity แสดง installed แต่ execution ยัง Phase 2 |
| Mock completion | PASS: original build และ final build; final run `9a207735-0759-42a5-9ee2-65d05f334cc9` มีสาม mock steps และ completed |
| Mock cancellation | PASS: `b9ce2da7-e825-463a-94b3-017bb81f1f1d` canceled จากปุ่มใน native monitor; log `Canceled by owner` |
| ปฏิเสธ native approval | PASS: Cancel ที่ confirmation ไม่สร้าง Codex execution; prompt/selection ยังคงในฟอร์ม |
| Genuine Codex completion | PASS: `357e9220-b126-4086-89c2-31053f431267`, PID 5132, ข้อความ `CREWNEST_NATIVE_CODEX_OK`, structured turn.completed และ persisted completed |
| Genuine Codex cancellation | PASS: `9ae7eb0c-a81f-4c33-91c1-bf0a8b23d782`, PID 4180, เห็น thread.started/turn.started ก่อน Cancel; canceled และตรวจว่า PID หยุดแล้ว |
| Logs | PASS: เห็น native execution events จริง; ตรวจ SQLite events ประกอบ |
| Locks หลัง cancel | PASS: เริ่ม run ถัดไปบน project/agent เดิมได้ และ final Mock completed |
| Restart persistence | PASS: ปิดหลังทุก run จบ เปิดใหม่แล้ว project และประวัติ 5 runs ยังอยู่; เลือก final Mock แล้วโหลด started/สาม steps/completed กลับมาได้ |
| Native dark/light | PASS: ตรวจภาพจริงทั้งสอง theme และ modal อยู่กึ่งกลางหลังแก้ |
| SQLite integrity | PASS: PRAGMA integrity_check = ok |

Codex ใช้ synthetic prompts ที่ห้าม tools/files/commands ไม่อ่านหรือแก้ source project และไม่ใช่การยืนยัน full coding workflow ทั้งทีม ไม่มี Phase 2 implementation ในรอบนี้

## ปัญหาที่แก้และทดสอบซ้ำ

1. Tailwind reset ทำให้ native HTML dialog ชิดซ้ายบน: กำหนด `margin:auto` และเพิ่ม browser regression ตรวจตำแหน่งกึ่งกลาง ตรวจภาพ native หลัง rebuild ผ่าน
2. หลังเริ่ม execution ยังอยู่บนหน้าเดิม ทำให้ไปกด cancellation ช้า: scroll/focus ไป Execution monitor หลัง start สำเร็จ เพิ่ม focus regression; native Mock/Codex cancel ผ่าน
3. Mock เดิมจบประมาณ 1 วินาที: เพิ่มช่วง deterministic steps เป็น 5 วินาทีต่อ step รวมประมาณ 15 วินาที พร้อมข้อความอธิบายในฟอร์ม เพื่อให้ตรวจ logs/cancel ได้จริง ปรับ test deadline ตามระยะเวลาและทดสอบ completion/cancel ผ่าน
4. required marker ของชื่อโปรเจกต์แยกบรรทัดจาก flex label: รวม label text/marker ใน span

สำรอง source ที่แก้, executable เดิม และ SQLite backup ก่อนแก้ไว้ `.local/native-uat-baseline` ไม่ลบหรือ reset ข้อมูลเดิม

## Verification หลังแก้

- TypeScript, ESLint และ Rust Clippy ผ่าน
- Rust Core 18, headless Tauri IPC 1, Vitest 4, Playwright 6 ผ่าน รวม automated tests 29 รายการ
- Windows release rebuild ผ่าน; final executable 13,611,008 bytes
- SHA-256: `62877414522067423919D634B7C37EF5471278445D7623AD1D753A6EAAAA979E`
- Graph refreshed: crewnest 382 nodes / 946 edges; uncommitted worktree ไม่มี HEAD commit

## ข้อจำกัด

Native UAT นี้ปิด gap ของ Phase 1 ตามรายการขอแล้ว ไม่ใช่ human owner final UAT sign-off หรือ full MVP acceptance ยังไม่ตรวจ installer/signing, sleep/forced-kill ทุกกรณี, uninstalled/unauthenticated native environment, writing agents หรือ remote control; process timeout/tree cleanup มี automated fixtures ทดสอบแยก

Read-only sandbox ไม่ใช่ VM isolation; CLI costs/quota เป็นของบัญชีที่ login; Claude/Antigravity execution ยัง unsupported ตาม Phase 1 เปิดแอปค้างไว้พร้อม history และไม่มี active execution ณจบ UAT

## Storage folder บน File Sharing — 2026-11-22

ใช้ข้อมูลทดสอบเท่านั้น ไม่แตะข้อมูลจริงของผู้ใช้ share ที่ใช้: `X:` = `\sg1-ai\AI_Storage` (ผู้ใช้เลือก) ใน folder ทดสอบแยก

Core (`packages/desktop-core/tests/storage_uat.rs`, `#[ignore]`, รันด้วย `CREWNEST_UAT_SHARE`):

| ขั้น | X: (mapped) | `\sg1-ai\AI_Storage` (UNC) |
|---|---|---|
| detect_mode = Network | ผ่าน | ผ่าน |
| migrate local → share (VACUUM INTO + integrity + row count) | 1.4 วิ | 0.3 วิ |
| journal_mode = delete, ไม่มี `-wal` | ผ่าน | ผ่าน |
| InstanceLock ซ้อนไม่ได้ / ปล่อยแล้วได้ใหม่ | ผ่าน | ผ่าน |
| เขียน 200 ครั้งจาก 4 thread, integrity_check ok | 24.7 วิ | 9.6 วิ |
| migrate share → share, delete_previous ไม่ลบขณะต้นทางถูก lock | ผ่าน | ผ่าน |

Native debug build (`tauri build --debug --no-bundle`, `CREWNEST_DATA_DIR` แยก, อ่านหน้าผ่าน WebView2 CDP):

- ไม่มี storage.json: เปิดได้, DB ในเครื่อง, มีทั้ง `crewnest.lock` และ `crewnest.instance.lock` (ยืนยันการแก้ lock ซ้อนตอนเปิดแอป)
- storage.json ชี้ X:: Desktop Core connected, หน้าพื้นที่จัดเก็บแสดง Network/ขนาด/พื้นที่ว่าง, บน share ไม่มี `-wal`
- เปิด instance ที่สองขณะตัวแรกเปิดอยู่: หน้ากู้คืน "ข้อมูลกำลังถูกใช้โดย <host> pid <n>" ไม่เปิด DB ซ้อน
- storage.json ชี้ path ที่ไม่มี: หน้ากู้คืน ไม่สร้าง folder/DB ใหม่
- กด "กลับไปใช้ตำแหน่งเดิม" ในหน้ากู้คืน: pointer สลับ, แอปรีสตาร์ทเองและเปิดบน share ได้

ยังไม่ได้ตรวจ: ปุ่ม "เปลี่ยนที่จัดเก็บ…" ผ่าน native folder picker จริง (logic เดียวกับ core migrate และ e2e fixture), share หลุดระหว่างแอปทำงาน, เครื่องที่สองจริงบน network
ข้อสังเกต: เขียนบน share ครั้งละ ~50–120 ms (เปิด connection ต่อครั้ง + journal DELETE) ข้อความหน้ากู้คืนกรณี lock และ hint หน้าพื้นที่จัดเก็บแก้แล้วหลัง UAT (หัวข้อ "ข้อมูลเปิดอยู่บนเครื่องอื่น" + บอกให้ปิด Astra เครื่องนั้น, hint บอกว่าแอปรีสตาร์ทเอง) มี e2e คุมใน `tests/e2e/storage.spec.ts`
