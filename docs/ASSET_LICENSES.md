# ที่มาและสิทธิ์ของ assets

## Original CrewBots

| รายการ | รายละเอียด |
|---|---|
| ผลิตภัณฑ์ | CrewNest — AI Agent Command Center |
| ชุดภาพ | CrewBots: ASTRA, FORGE, MIRA, VECTOR, SCOUT |
| วันที่สร้าง | 2026-11-17 |
| ผู้จัดทำ | Codex ตาม art direction และคำขอของเจ้าของโปรเจกต์ |
| วิธีสร้าง | เขียน vector geometry และ expression ใหม่ใน `tools/build_crewbots.py` |
| ไฟล์ | `assets/crewbots/{astra,forge,mira,vector,scout}/{full-body,portrait,icon,idle,working,thinking,success,error}.svg` |
| Animation | CSS ที่เขียนขึ้นใน generator ฝังใน SVG พร้อม reduced-motion |
| Provenance | ไม่มีภาพอ้างอิง ไม่มีการดาวน์โหลด คัดลอก trace หรือฝัง artwork ภายนอก ไม่ใช้ image generation service |
| ความสมบูรณ์ | SHA-256 รายไฟล์อยู่ใน `assets/crewbots/manifest.json`; ตรวจด้วย `tools/verify_crewbots.py` |
| สิทธิ์เผยแพร่ | ยังไม่กำหนด public license; เจ้าของโปรเจกต์ต้องเลือกเงื่อนไขก่อนเผยแพร่ ชุดนี้ไม่ให้สิทธิ์บุคคลภายนอกโดยอัตโนมัติ |

เอกสารนี้บันทึกกระบวนการสร้าง ไม่ใช่การรับรอง exclusivity, copyrightability หรือ trademark clearance ไม่ควรเพิ่มชื่อผู้ถือ copyright ที่ยังไม่ได้รับการยืนยัน

## ข้อจำกัดและการเพิ่ม assets ภายหลัง

ห้ามเลียนแบบตัวละครที่ระบุได้จากแฟรนไชส์อื่น รวมถึง costume, helmet/armor silhouette, symbols, transformation devices, weapons และ character-specific poses การปรับตัวละครต้องรักษาความเป็น companion robot ต้นฉบับ

เมื่อเพิ่ม PNG, WebP, GLB, fonts หรือ artwork จากภายนอก ให้บันทึกผู้สร้าง, URL ต้นทาง, license/version, วันที่ได้รับ, attribution, ข้อจำกัดการแก้ไข/เผยแพร่ และ hash ห้ามเผยแพร่ asset ที่สิทธิ์ไม่ชัดเจน เก็บ license notices ของ third-party code/assets ตามต้นทาง

ชุด rebranding เดิมมีเฉพาะ original CrewBots; Phase 1 เพิ่ม third-party font และ component ด้านล่างโดยแยกที่มาออกจาก original artwork

## Assets และ component ที่เพิ่มใน Phase 1

| รายการ | ที่มา / สิทธิ์ / การปรับ |
|---|---|
| LINE Seed Sans TH WOFF2 Regular/Bold v1.003 | ดาวน์โหลด [official ZIP](https://seed.line.me/src/images/fonts/LINE_Seed_Sans_TH.zip) วันที่ 2026-11-17; ไม่มีการแก้ font; ใช้ SIL OFL 1.1 ตาม [official notice](https://seed.line.me/index_en.html) |
| Font provenance | รายไฟล์และ SHA-256 อยู่ `assets/fonts/provenance.json`; notice และ full OFL อยู่ `assets/licenses/LINE_SEED_NOTICE.txt` และ `LINE_SEED_OFL.txt` จาก official `line/seed` repository |
| Lucian #039 Sliding pill tabs | [component](https://lucianlabs.dev/uxui-prompt/#039), MIT © 2026 Seokwoooo; source reference `assets/references/lucian/lucian-039_EN.html`; React port ใน packages/ui/src/Tabs.tsx พร้อม original attribution |
| Lucian tokens | `assets/lucian-tokens.css`; map สีเข้ากับ CrewNest light/dark, ใช้ LINE Seed Sans TH; full MIT notice อยู่ `assets/licenses/LUCIAN_MIT_LICENSE.txt` |
| App icon | เขียน geometry ต้นฉบับใน `assets/app-icon.svg`; PNG/ICO/ICNS/platform sizes สร้างด้วย Tauri CLI icon generator ใน apps/desktop/src-tauri/icons ไม่ใช่ artwork ภายนอก |

## Assets ที่เพิ่มกับ Guildhall skin (2026-11-21)

| รายการ | ที่มา / สิทธิ์ / การปรับ |
|---|---|
| IBM Plex Sans Thai WOFF2 400/500/600 (subset thai, latin, latin-ext) | © 2019 IBM Corp.; SIL OFL 1.1; ได้จาก npm `@fontsource/ibm-plex-sans-thai@5.3.0` (Fontsource จัด subset จากไฟล์ทางการของ [IBM/plex](https://github.com/IBM/plex)) วันที่ 2026-11-21; ไม่มีการแก้ font; ใช้เฉพาะเมื่อ `data-skin="guildhall"` ผ่าน `packages/ui/src/guildhall.css` |
| Font provenance | รายไฟล์และ SHA-256 อยู่ `assets/fonts/provenance.json`; full OFL พร้อม copyright notice ต้นฉบับอยู่ `assets/licenses/IBM_PLEX_SANS_THAI_OFL.txt` |
| ไอคอนเส้นใน `packages/ui/src/icons.tsx` | วาด path ใหม่เอง ไม่ได้คัดลอกชุดไอคอนภายนอก |

รักษา font/MIT licenses เป็นข้อความต้นฉบับ ไม่แปลหรือเปลี่ยน attribution ปรับ Lucian เฉพาะข้อมูล/ภาษา/theme, React lifecycle/cleanup และ responsive container โดยรักษาโครงสร้างและ motion หลัก ตรวจ keyboard/light-dark/375px/reduced-motion ผ่าน browser tests; native WebView ยังรอ UAT

## ก่อน public release

Phase 2 เพิ่ม QueueBoard ที่เขียนเองตาม theme เดิม อ่าน Lucian #255 Kanban เป็น reference (`assets/references/lucian/lucian-255_EN.html`) แต่ไม่ได้ port drag-and-drop หรืออ้างว่าใช้ component #255 ใน application; retained reference อยู่ภายใต้ MIT notice เดิม ActivityTabs ยังคงใช้ #039 ตามตารางข้างบน

- ให้เจ้าของสิทธิ์เลือก license สำหรับ artwork และ code ของโปรเจกต์ให้ชัดเจน
- ตรวจ independent character design และ asset provenance แยกจาก functional QA
- ทำ trademark และ brand-name clearance review แยกต่างหากสำหรับ CrewNest, CrewBots และชื่อที่ใช้ทำตลาดตามเขตอำนาจ/ประเภทสินค้าที่จะเผยแพร่
- บันทึกผู้ตรวจ วันที่ ขอบเขต และผล review ก่อนปลด release gate

สถานะ: ยังไม่ได้ทำ trademark/brand-name clearance และยังไม่ได้อนุญาต public release
