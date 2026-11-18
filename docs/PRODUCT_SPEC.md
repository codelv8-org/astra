# CrewNest — AI Agent Command Center

รุ่นข้อกำหนด: 1.0 · วันที่: 2026-11-17 · baseline: MASTER BUILD PROMPT ที่ผู้ใช้ให้ในแชต · สถานะ: เริ่ม Phase 0–1 แล้ว ดู PHASE_1_REPORT.md สำหรับผลจริง

## เป้าหมายและขอบเขต

CrewNest เป็นแพลตฟอร์ม local-first สำหรับ multi-agent orchestration ใช้ CrewBots ซึ่งเป็นตัวละครหุ่นยนต์ต้นฉบับห้าตัวสำหรับแสดงตัวตนของ agents เปลี่ยน working identity จาก RiderOps — AI Agent Command Center เป็น CrewNest — AI Agent Command Center

การเปลี่ยนนี้ครอบคลุม branding, ชื่อตัวละคร, visual tokens, assets และข้อความที่เกี่ยวข้องเท่านั้น ต้องคง responsibilities เดิมทั้งหมด รวมถึง workflow, task dependencies, permissions, runtime integrations และข้อกำหนด architecture

ข้อจำกัดหลักฐานรอบ rebranding: เริ่มจาก workspace ว่าง ไม่มี source เดิมให้ migrate ผู้ใช้ให้ MASTER BUILD PROMPT เป็น baseline ฉบับ CrewNest อยู่ใน `MASTER_BUILD_PROMPT.md` รอบ implementation ปัจจุบันสร้าง foundation ใหม่ตาม Phase 0–1 และลงทะเบียน root ที่ผู้ใช้ยืนยันแล้ว ข้อกำหนดนี้ไม่ใช่หลักฐานว่า full MVP implement ครบ

## Agent roster

| Character key | ชื่อ | หน้าที่ | Runtime integration |
|---|---|---|---|
| astra | ASTRA | CEO / Orchestrator | OpenAI Codex |
| forge | FORGE | Software Engineering Lead | Claude Code |
| mira | MIRA | UI/UX Design Lead | Antigravity |
| vector | VECTOR | System Architect & Researcher | OpenAI Codex |
| scout | SCOUT | Reviewer, QA & UAT Lead | OpenAI Codex |

หน้าที่และข้อจำกัดย่อยทั้งหมดอยู่ใน MASTER_BUILD_PROMPT.md ห้ามให้สิทธิ์เพิ่มจากชื่อ CEO, Lead หรือลักษณะตัวละคร Mapping ที่ยืนยันจากบทบาทใน baseline คือ Decade → ASTRA, Giam (Gaim) → FORGE, Ex-Aid → MIRA, Double → VECTOR, Zi-O → SCOUT ชื่อเก่าในประโยคนี้มีไว้สำหรับ migration trace เท่านั้น

Character key ใช้สำหรับเลือกภาพเท่านั้น ไม่ใช่ runtime adapter ID, database primary key หรือ permission key การเปลี่ยนชื่อ display ต้องรักษา agent ID, foreign keys, task ownership, history และ audit references เดิม

## ข้อกำหนด architecture ที่ต้องคงไว้

| ส่วนระบบ | ข้อกำหนดที่ต้องรักษา |
|---|---|
| Windows desktop | Tauri 2 Windows Desktop |
| Web client | Separate React Web Application |
| Services | Central API ตาม contract เดิม |
| Execution | Local agent execution ผ่าน runtime adapters เดิม |
| Remote control | Secure remote control ตาม trust boundary และ authorization เดิม |
| Coordination | Multi-agent orchestration, task dependencies และลำดับการทำงานเดิม |
| Workspace | Project and task management เดิม |
| Governance | Human approval workflow และ permission checks เดิม |

ห้ามเปลี่ยน endpoints, payload contracts, adapter commands, executable paths, credentials, token scopes, IPC channels, storage locations, Tauri identifier, signing identity หรือ installer upgrade identity ด้วย global string replacement การเปลี่ยนค่าเทคนิคใดเพื่อ branding ต้องประเมิน compatibility แยกต่างหาก

## UI และการใช้ CrewBots

รักษา ATLAS-inspired futuristic command center เดิม ให้ controls, ข้อมูล และสถานะการทำงานเด่นกว่าตัวละคร ไม่สร้าง layout หรือ framework ใหม่เพียงเพื่อ rebranding

| พื้นที่ | Asset และพฤติกรรม |
|---|---|
| Agent Dashboard | Full-body หรือ portrait พร้อมชื่อ บทบาท และสถานะข้อความ |
| Agent Cards | Portrait พร้อม status label; icon สำหรับ density สูง |
| Agent Detail Modal | Full-body และข้อมูลบทบาท/adapter เดิม โดยคง focus trap และคืน focus เมื่อปิด |
| Workflow Board | Compact icon ข้าง assignee; dependency และ task state ไม่เปลี่ยน |
| Execution Monitor | State asset ตาม execution event จริง พร้อม progress/logs และ controls เดิม |
| Agent Notifications | Compact icon หรือ portrait; accessible notification text เป็นข้อมูลหลัก |
| Empty states | Full-body idle พร้อมคำอธิบายและ action ที่ใช้งานได้ |
| Project reports | ภาพนิ่งตาม assignee เฉพาะจุดที่ช่วยอ่านรายงาน; ไม่ใส่ motion ในเอกสารพิมพ์ |

ใช้ LINE Seed Sans TH แบบ locally hosted ในแอปเมื่อมี asset ที่ตรวจ license แล้ว pack นี้ไม่ได้รวม font และไม่เพิ่ม runtime font request รักษา light/dark และ modal-based CRUD เดิม ให้ component ใหม่ใช้ Lucian UX/UI ตาม project instructions โดยต้องดึงโค้ดจริงก่อนใช้ pack นี้มีเฉพาะ original artwork และแผ่นตรวจ assets ไม่ได้อ้างว่าใช้ Lucian component

## การแสดงสถานะ

สถานะภาพประกอบ: idle, working, thinking, success, error เป็น presentation state ต้อง map จาก state model เดิมอย่างชัดเจนและตรวจสอบได้ หากไม่มี state ที่ตรงให้ใช้ idle พร้อมข้อความสถานะจริง อย่าแปลง blocked, cancelled, offline หรือ awaiting approval เป็น error/success โดยอัตโนมัติ

ภาพ success แสดงได้เมื่อ runtime ส่งผลสำเร็จจริง ภาพ error ไม่แทน error message, recovery action หรือ audit event สถานะ human approval ต้องมีข้อความและ controls เดิมเสมอ ตัวละครห้ามสร้าง execution event หรืออนุมัติ task เอง

## การเข้าถึงและประสิทธิภาพ

- ถ้ามีชื่อและสถานะอยู่ข้างภาพ ใช้ `alt=""` สำหรับภาพตกแต่ง; หากภาพให้ข้อมูลเพียงลำพัง ให้มีชื่อและสถานะใน accessible name
- ไม่ใช้สี รูปหน้า หรือ motion เป็นตัวบอกสถานะเพียงอย่างเดียว
- ใช้ `prefers-reduced-motion` ปิด animation; ไม่กะพริบ ไม่เล่นเสียง ไม่บังปุ่ม และไม่รับ pointer events ที่ภาพตกแต่ง
- กำหนด width/height คงที่ ป้องกัน layout shift; โหลด full-body เมื่อจำเป็นและใช้ icon ที่ 24–32px
- ใช้ live region เดิมสำหรับการเปลี่ยนสถานะ ไม่ประกาศซ้ำทุก animation cycle
- ตรวจ desktop/tablet/mobile, keyboard, zoom, contrast และ modal interaction ในแอปจริงก่อนยอมรับ UI integration

## การส่งมอบและ release gates

ส่งมอบ SVG 40 ไฟล์ (5 ตัว × full-body, portrait, icon, idle, working, thinking, success, error), manifest ที่มี SHA-256, generator, verifier และ design system ใช้ CSS animation ฝังใน state SVG พร้อม reduced-motion และ stylesheet สำหรับ tokens/containers

การเปลี่ยนเป็น PNG/WebP/GLB ต้องทำผ่าน asset manifest/resolver โดยรักษา character key, variant names และสถานะของระบบเดิม GLB ต้องมี static fallback, accessible text, reduced-motion และการจัดการ resource lifecycle โดยไม่เพิ่ม dependency จนกว่าจะมีงาน integration ที่อนุมัติ

ก่อน public release ต้องตรวจ source baseline, migration compatibility, runtime/approval regression, UI accessibility, provenance/license และทำ trademark/brand-name clearance review แยกต่างหากสำหรับ CrewNest, CrewBots และชื่อที่ใช้ทำตลาด ยังไม่ได้ทำ clearance และไม่มีการรับรองสิทธิ์ทางกฎหมายจากชุดเอกสารนี้
