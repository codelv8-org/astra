# CrewBots — ระบบออกแบบตัวละคร

## ภาษาภาพ

หุ่นยนต์ companion ต้นฉบับแบบ 2D vector, chibi, หัวใหญ่ ตัวเล็ก มือเท้าสั้น รูปทรงมน clean outline และ soft shading ใช้หน้าจอ digital face ที่มี expression ชัดเจน รูปทรงและอุปกรณ์เป็นชิ้นส่วนของหุ่นยนต์ ไม่มี costume, armor, weapons, transformation devices หรือท่าประจำจากแฟรนไชส์อื่น

สัดส่วน full-body ใช้ viewBox `0 0 240 280`; head portrait `25 12 190 160`; compact icon `40 22 160 120` พื้นหลังโปร่งใสทุกไฟล์ ไม่มีภาพ raster หรือ external resource ภายใน SVG

| ตัวละคร | สีหลัก / accent | Silhouette | ลักษณะเฉพาะ |
|---|---|---|---|
| ASTRA | Royal-blue `#4169E1` / gold `#F2C75C` | หัวและลำตัวทรงมน | เสาอากาศดาวเล็ก แผงอกทรงวงโคจร ท่าทางมั่นใจและครุ่นคิด |
| FORGE | Warm-orange `#E98B3A` / cream `#FFE0A3` | หัวสี่เหลี่ยมมุมมนและลำตัวกล่อง | แขนเครื่องมือขนาดเล็ก หน้าจอ terminal บนอก สีหน้ามุ่งมั่น |
| MIRA | Lavender `#A597E8` / pastel-pink `#F6BCD8` | หัวโค้งคล้ายหยดและลำตัวลื่นไหล | เสาอากาศปลาย stylus หน้าแสดงความสนุกและเป็นมิตร |
| VECTOR | Turquoise `#36B7B0` / pale-cyan `#A6F0E8` | หัวหกเหลี่ยมและตัว polygon มุมมน | ตา geometric แผง blueprint ข้างตัว สีหน้าวิเคราะห์ |
| SCOUT | Olive-green `#879B4A` / lime `#D5E89B` | หัวทรง capsule และตัวสั้นกะทัดรัด | optical lens ขนาดใหญ่และตาข้างเล็ก สีหน้าสงสัยใคร่รู้ |

สี outline `#24354B`, face panel `#152B42`, eye light `#E5F8FF` สี character เป็น identity token ไม่ใช่ semantic success/error color ของแอป ห้ามเปลี่ยน semantic tokens เดิมให้ตรง palette นี้โดยอัตโนมัติ

## Variants และสถานะ

| Variant | องค์ประกอบ | Motion |
|---|---|---|
| full-body | ภาพเต็มตัว หน้าประจำตัว | ไม่มี |
| portrait | หัวและ antenna รายละเอียดครบ | ไม่มี |
| icon | หัวแบบลดรายละเอียด เส้นหนาขึ้น | ไม่มี |
| idle | หน้าผ่อนคลายและ status glyph | ลอย 2px / 3.2s |
| working | ตาจดจ่อและเครื่องหมาย progress | จุด progress จางเข้าออก / 1.2s |
| thinking | ตาครุ่นคิดและจุดสามจุด | จุดจางเข้าออก / 1.8s |
| success | ตาโค้งยิ้มและ check | glyph ยกขึ้นเบา ๆ / 2.4s |
| error | ตาเฉียงกังวลและ exclamation | ภาพนิ่ง ไม่มี shake หรือ blink |

Motion ทุกแบบปิดด้วย `@media (prefers-reduced-motion: reduce)` และคง glyph ที่อ่านได้ หลีกเลี่ยงการขยายจนบัง hit targets ใช้ภาพ static เมื่ออยู่ในรายงานหรือผู้ใช้ปิด animation

## การใช้งานใน client

อ่าน `manifest.json` แล้วเลือก `agents[].assets[variant].src` ตาม character key path ใน manifest สัมพันธ์กับโฟลเดอร์ manifest ใช้ asset base URL จาก bundler ของ React/Tauri เดิม ไม่ใช้ absolute disk path และอย่า fetch จาก CDN เพื่อคง local-first

แนะนำ `<img>` สำหรับ MVP เพื่อแยก SVG IDs ระหว่าง instances และลด inline SVG surface หาก inline ต้อง prefix IDs และ references ต่อ instance ใช้เฉพาะ assets ที่ build ไว้ ห้ามนำ SVG ที่ผู้ใช้ upload มา inject โดยไม่ sanitize

ทุก asset มี `format`, `mimeType`, `src`, `sha256`, `viewBox` และ `fallback` โดย `fallback: null` สำหรับ SVG MVP หากเปลี่ยนเป็น raster/GLB ให้ระบุ static SVG fallback และรักษา schema keys เดิม resolver ของแอปต้อง allowlist formats และใช้ static fallback เมื่อ format/rendering ไม่รองรับ

ใช้ `crewbots.css` สำหรับ identity colors, container sizing และ optional transition เท่านั้น state animation อยู่ใน SVG จึงทำงานเมื่อโหลดผ่าน `<img>` ไฟล์ CSS ไม่มี global reset และไม่ทับ theme ของแอป

## ตรวจคุณภาพ

ตรวจแกลเลอรี `gallery.html` ใน light/dark และที่ 375px ดู silhouette, clipping, ความต่างของ expression และความอ่านได้ของ icon ที่ 24/32px ตรวจ reduced motion จริงผ่าน browser ก่อน release การตรวจ XML และ hashes เพียงอย่างเดียวไม่รับรอง visual accessibility ของแอปปลายทาง

## สิ่งที่ยังไม่ทำ

Phase 1 ใช้ SVG ใน React/Tauri source และเพิ่ม locally hosted font พร้อม license แล้ว ยังไม่มี character GLB/raster exports หรือ trademark clearance ภาพ CrewBots สร้างด้วย geometry ต้นฉบับใน generator ไม่ได้คัดลอก artwork ภายนอก
