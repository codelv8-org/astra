# แผนเปลี่ยน UX/UI Astra ตามแนว Guildhall

> สถานะ (ยังไม่ commit): **Phase 1 เสร็จ** · **Phase 2 เสร็จทุกหน้าของ Desktop** · build NSIS และตรวจหน้าต่าง native (debug + ข้อมูลแยก) แล้ว ยังไม่ติดตั้งทับ · Phase 3 (Core/ข้อมูลใหม่) ยังไม่เริ่ม · `apps/web` ยังเป็น glass · จัดทำ 2026-11-21 · อ้างอิง Dribbble shots ชุด "Guildhall" ของ Kretya (9 ลิงก์)
>
> Phase 1: `packages/ui/src/guildhall.css` (เปิดด้วย `<html data-skin="guildhall">` ถอดเพื่อกลับเป็น Liquid Glass), ฟอนต์ IBM Plex Sans Thai, `packages/ui/src/icons.tsx`, `apps/desktop/src/AppRail.tsx`, page header ใน Console · `apps/web` ยังใช้ glass เดิม
>
> Phase 2 ข้อ 1–2: Home เป็น Workspace — `home/WorkspaceSidebar.tsx` (agent ตามบทบาท + ค้นหา + โปรเจกต์), `home/OfficeScene.ts` เขียนใหม่เป็นห้อง isometric แบบ pixel (กล้อง orthographic, วาด 1/3 แล้วขยาย pixelated, ลาก/ซูม/โฟกัส, ไม่มีภาพภายนอก), toolbar/zoom/`home/Minimap.tsx`/แถบเล่นภาพ, drawer ขวาเป็นแชท CEO หรือ `home/AgentPanel.tsx` (กิจกรรม/การตั้งค่า), ข้อมูลจาก `home/workspace.ts` · ใช้ตัวเลือก A (three.js pixel isometric) และคง CrewBots เป็นหุ่นยนต์
>
> Phase 2 ข้อ 3: หน้า "ผลการรัน" เป็น Review — `ReviewPage.tsx` (หัวงานพร้อม breadcrumb, แท็บ การเปลี่ยนแปลง/Log/ผลลัพธ์), `ReviewDiff.tsx` (ไฟล์ที่เปลี่ยน +/−, diff ทีละไฟล์, ไฟล์เต็ม), แผง "สิ่งที่ agent ทำ" + การตรวจจากสถานะจริง (การรัน, patch, SCOUT, UAT) + อนุมัติ patch ผ่าน `WritingPanel` เดิม (`diff={false}`) · ไม่แสดง type check/lint/unit test เพราะ Core ยังไม่บันทึก (เป็นงาน Phase 3 `ExecutionCheck`) · ไม่มีแท็บ Editor/Preview/Trace เพราะยังไม่มีข้อมูล
>
> Job desks: หน้า "ทีม" เป็น `JobDesks.tsx` — แถบลำดับการส่งต่องาน 5 ขั้นตามแม่แบบ Core (`desks.ts`) พร้อมภาพเส้น isometric ที่วาดเอง (`packages/ui/src/IsoArt.tsx`) และการ์ดโต๊ะงานต่อ agent (ภาพ CrewBot ตามสถานะ, ป้ายที่นั่ง, บทบาท, agent chip + runtime, รับงานจาก/ส่งต่อให้, จำนวนงานเสร็จ/ค้างจริง, ปุ่มรายละเอียดเปิด modal เดิม) · ไม่มีปุ่ม Edit เพราะ Core ยังแก้ job desk ไม่ได้
>
> Connectors: หน้า "Runtime" เป็น `Connectors.tsx` — แท็บ ทีมใช้อยู่/ทั้งหมด, hero พร้อมปุ่ม Check runtimes, การ์ดต่อ runtime (Claude Code, OpenAI Codex, Antigravity, Mock จาก `runtimeCatalog.ts`) แสดง agent ที่ใช้, สถานะจากผลตรวจ CLI ล่าสุด, เวอร์ชัน/login/ที่อยู่ executable/ข้อความ CLI และวิธีเชื่อม · ไม่มีชิป "API key"/"2 min setup" และไม่มีปุ่มเชื่อม เพราะ Astra ใช้ CLI ในเครื่องและไม่ติดตั้งหรือ login ให้
>
> Themes: หน้าใหม่ "ธีมโลก" (`page=themes`, ไอคอน layers ล่างของ rail) `Themes.tsx` — hero ของโลกที่ใช้อยู่ + การ์ด 5 โลก (`home/worlds.ts`: ออฟฟิศ, โรงไม้ทางเหนือ, สถานีอวกาศ, ดาดฟ้าเรือ, เมืองชายแดน) ภาพตัวอย่างวาดจริงด้วย `OfficeScene.preview()` · ต่างกันที่พื้น (ไม้/แผ่นโลหะ) สีผนัง หน้าต่าง (ดาวสำหรับสถานีอวกาศ) พรม ต้นไม้ และสีไฟ ผังโต๊ะและงานเหมือนเดิม จำค่าใน localStorage `astra-world` · ยังไม่มีของตกแต่งเฉพาะโลก (เช่น เสากระโดงเรือ, ชุดอวกาศ) และไม่มีแท็บ Installed/New เพราะไม่มีระบบติดตั้งธีม
>
> หน้าที่เหลือ: `console.css` (โหลดหลัง styles.css) — ภาพรวมเป็นแถบตัวเลข 4 ช่องพร้อมคำอธิบาย + Activity แบบแถว + "รอคุณตัดสิน" (gate ที่พร้อมอนุมัติและงานรอตรวจ), คิวงานเป็นการ์ดมี avatar ชื่อ agent ขั้น สถานะภาษาไทย และป้าย "ต้องให้คุณอนุมัติ" เฉพาะ gate ที่ยังเปิด, โปรเจกต์เป็นการ์ดพร้อม progress และตัวเลข workflow/กำลังทำ/รอคุณ/execution, Remote และ diff ในหน้าต่างงานปรับตาม token ใหม่
> ใช้ skill `design-to-system-planner` · ภาพอ้างอิงดาวน์โหลดไว้เฉพาะ scratchpad ของ session ไม่ได้นำเข้า repo

## 0. ขอบเขต "เหมือน 100%" และขอบเขตลิขสิทธิ์

| ทำให้เหมือน 100% ได้ | ต้องสร้างเอง (ห้ามคัดลอก) |
|---|---|
| Layout, grid, ระยะห่าง, radius, ลำดับข้อมูล | ภาพ pixel art ฉาก office/viking/space/pirate/west |
| Palette, typography scale, สถานะสี | ภาพ avatar ตัวละคร (Atlas/Forge/Scout/Relay/Quill) |
| รูปแบบ component และ interaction (rail, drawer, tabs, label บนฉาก, minimap, checks modal) | โลโก้ 9 จุดและชื่อ "Guildhall" |
| ภาษาภาพ isometric line illustration (วาดใหม่) | Copy การตลาดคำต่อคำ |

เหตุผล: `docs/ASSET_LICENSES.md` ห้ามฝัง/trace artwork ภายนอก ดังนั้น **โครงและสไตล์เหมือนแบบ แต่ภาพทั้งหมดเป็นของ Astra เอง** (CrewBots: ASTRA, VECTOR, MIRA, FORGE, SCOUT)

### Shots ที่อ่านได้

| # | Shot | อ่านได้ | ใช้กับหน้า Astra |
|---|---|---|---|
| 1 | Landing Page for an AI Agent Workspace | ✅ 10 ภาพ | Web landing (ทางเลือก) + ภาษาภาพ isometric |
| 2 | Join the Conversation Between AI Agents | ✅ | Home → แชท CEO / drawer สนทนา |
| 3 | Pick the World Your AI Agents Work In | ✅ | หน้าใหม่ "ธีมโลก" |
| 4 | Connect the AI Agents You Already Run | ✅ | Runtime → Connectors |
| 5 | Review What Your AI Agent Changed | ✅ | ผลการรัน + FORGE staged patch |
| 6 | Job Desks for a Team of AI Agents | ✅ | ทีม → Job desks |
| 7 | Every AI Agent at Its Desk | ❌ Dribbble rate-limit | **สมมติฐาน:** agent detail drawer + desk cards (เห็นบางส่วนใน shot 6 และ 9) |
| 8 | One AI Workspace, Five Worlds | ✅ | ธีมโลก |
| 9 | A Pixel Office for AI Agents | ✅ | Home workspace (ฉากหลัก) |

---

## 1. ภาพรวมและแนวคิดการออกแบบ

**เป้าหมายของหน้าจอ:** ผู้ใช้ "ตั้งเป้าหมายครั้งเดียว แล้วดูทีม agent ทำงานส่งต่อกันในห้องเดียว" จากนั้นตรวจและอนุมัติผล ซึ่งตรงกับ flow ของ Astra อยู่แล้ว (ASTRA วางแผน → VECTOR → MIRA → FORGE → SCOUT → อนุมัติ)

**Look & Feel:** Dark, warm, flat, editorial-minimal
- พื้นดำอมน้ำตาล (Tailwind *stone*) แทนม่วงกลางคืน
- สีเน้นมีสีเดียวคือ **amber** ใช้กับ tab underline, กรอบ label ที่ active, จุดสถานะ และเลขลำดับ
- **ไม่มี glass, blur, gradient หรือ glow** ซึ่งตรงข้ามกับ Liquid Glass ปัจจุบัน ความลึกมาจากชั้นสีพื้น 3–4 ระดับ + hairline
- ภาพเล่าเรื่องมี 2 แบบ: (1) ฉาก pixel isometric อบอุ่น (2) isometric line-art บนพื้นจุด (dot grid)
- Typography: grotesk น้ำหนักบาง (Light 300) สำหรับหัวใหญ่ + mono ตัวพิมพ์ใหญ่ห่างตัวอักษรสำหรับ eyebrow (`[01] CONNECT`, `/ BRING YOUR STACK`)

**Visual hierarchy (หน้า workspace):** ฉากโลก (กลาง ใหญ่สุด) → label agent ที่กรอบ amber (คนที่กำลังคุยกับคุณ) → toolbar บน (workflow + Running + New goal) → รายชื่อ agent ซ้าย → drawer ขวา

---

## 2. Design tokens (ค่าที่ดูดสีจากภาพจริง)

```css
/* Guildhall-like · dark (default) */
--bg-frame:   #110f0d;  /* กรอบแอป / พื้นหลังสุด */
--bg:         #14120f;  /* rail, code, card ฝังลึก */
--surface:    #1a1815;  /* sidebar, header, drawer, stat card */
--surface-2:  #1c1917;  /* ปุ่มรอง (= stone-900) */
--input:      #262421;  /* search, input */
--selected:   #312f2c;  /* แถวที่เลือก, nav ที่ active */
--canvas:     #0c0a09;  /* พื้นภาพ isometric (= stone-950) */
--dot:        #2b2926;  /* จุด dot-grid */
--line:       rgb(255 255 255 / .07);
--line-2:     rgb(255 255 255 / .12);
--text:       #f5f5f4;  /* = stone-100, ใช้กับปุ่มหลักด้วย */
--text-2:     #a8a29e;  /* stone-400 */
--text-3:     #78716c;  /* stone-500 */
--accent:     #ebae42;  /* amber: underline, กรอบ active, เลขลำดับ */
--accent-hi:  #f5b544;  /* จุด/ไฟสถานะ */
--accent-soft: rgb(235 174 66 / .14);
--ok:         #22c55e;  --ok-bg:  #13261a;   /* Running / Working / Active */
--bad:        #ef4444;  --bad-bg: #321514;
--diff-add:   #112515;  --diff-del: #321514;
--btn-primary-bg: #f5f5f4; --btn-primary-fg: #14120f;
```

- **Radius:** กรอบแอป 20 · panel/drawer 16 · card 12 · ปุ่ม/input 10 · chip/pill 999
- **Spacing:** ฐาน 4px; padding panel 24, รายการ 12/16, gap card 16
- **Type scale (app):** 28/34 Regular (หัวหน้า) · 20 Medium (หัว section) · 15 Regular (body) · 13 (meta) · 11 mono uppercase tracking .08em (eyebrow)
- **Type scale (landing):** 56/60 Light · 32 Light · 16
- **Font:** ละติน = Inter / Geist (Light–Medium), mono = Geist Mono หรือ JetBrains Mono · **ไทย = ต้องเลือก** (ดูข้อ 6) เพราะ LINE Seed Sans TH ปัจจุบันโค้งมนกว่าแนว grotesk ของแบบ
- **Light theme:** แบบไม่มี light mode ข้อเสนอคือ map stone-50/100/200 + amber-600 เพื่อคงปุ่มสลับธีมเดิม (สมมติฐาน)

---

## 3. Layout และ Component Breakdown

### 3.1 App shell (ใช้ทุกหน้า แทน header กระจก + แถบเมนูปัจจุบัน)

```
AppFrame (bg-frame, radius 20)
├─ IconRail 64px (bg) ── logo · search · Workspace(map) · Runs(activity) · Connectors(plug) · Team(users) · Notifications(bell) … [ล่าง] Themes(layers) · Settings
├─ ContextSidebar 320px (surface, ยุบได้ «)  ← เฉพาะหน้า Workspace
└─ Main (surface, radius 16)
     ├─ PageHeader: Title 28 + subtitle text-2 + hairline
     ├─ Tabs (underline amber 2px, label "Connected · 5")
     └─ Content
```
- Responsive: <1024px ยุบ sidebar เป็น overlay; <768px rail ย้ายเป็น bottom bar 5 ไอคอน, drawer ขวากลายเป็น bottom sheet
- แทนที่ `consolePages` เดิม 7 หน้า ด้วย rail 7 ไอคอน (ไม่มีแถบเมนูข้อความ)

### 3.2 การจับคู่หน้าจอ

| Astra ตอนนี้ | หน้าใหม่ตามแบบ | Shot |
|---|---|---|
| Home (OfficeScene + แชท CEO + โปรเจกต์) | **Workspace**: sidebar agent + ฉากโลก + drawer | 2, 9 |
| แชท CEO (หน้าเต็ม) | Drawer "Conversation / Shared context" ในหน้า Workspace (คง route `?view=chat` ไว้เปิด drawer) | 2 |
| ทีม (agents) | **Job desks**: How work flows + desk cards | 6, 7 |
| ผลการรัน + Diff ของ FORGE | **Review**: Changes / Editor / Preview / Terminal / Trace + Checks | 5 |
| Runtime | **Connectors**: Connected · Catalog | 4 |
| — | **Themes** (ธีมโลก) | 3, 8 |
| ภาพรวม / คิวงาน / โปรเจกต์ / Remote | ไม่มีในแบบ → ใช้ shell + tokens + pattern การ์ด/ตาราง ของแบบ (สมมติฐาน) | — |

### 3.3 Components

| Component | รายละเอียด | States |
|---|---|---|
| `IconRail` / `RailButton` | ไอคอน stroke 1.5, ปุ่ม 48 radius 12 | default, hover (`--input`), active (`--selected`), badge จุด amber |
| `ConnectCard` | "Bring your agents together" + แถวไอคอน runtime วงกลม + ปุ่ม Connect agent + ปุ่มลิงก์ | empty (ยังไม่มี runtime) |
| `AgentSearch` | input radius 10 ไอคอนซ้าย | focus ring amber 1px |
| `AgentGroup` + `AgentRow` | หัวกลุ่ม "Programmer (2)", avatar 40 + ชื่อ + activity line + ไอคอน runtime ขวา | idle, working, waiting, talking-to-you (`--selected`), error, offline |
| `WorkflowSwitcher` | pill "Launch week campaign ▾" + `StatusPill` + ปุ่มขาว "+ New goal" | Running / Paused / Waiting approval / Done |
| `WorldCanvas` | ฉาก isometric + `SceneLabel` ลอยเหนือตัวละคร | loading, live, paused, reduced-motion |
| `SceneLabel` | กล่องดำ radius 10: ไอคอน runtime + ชื่อ + "บทบาท · กิจกรรม" | normal, focused (กรอบ amber 2px), typing (bubble •••), speech bubble |
| `ZoomControls` | + / − / fit แนวตั้ง | disabled ที่ขีดจำกัด |
| `Minimap` | มุมซ้ายล่าง, กรอบ viewport + จุดสี agent | drag viewport |
| `PlaybackBar` | ❚❚ · ◉ Live · 1x speed · Theme: Office · 💬 · ⋯ | live / replay |
| `ConversationDrawer` | avatar คู่ + "Atlas, Quill and you" + pill Joined + meta "Handoff · … · started 14:33" + tabs | joined / observing |
| `MessageBubble` | agent = เทา `--input` ซ้าย; you = **ขาว** ขวา + avatar ตัวย่อ; system line ไอคอน + text-2 | sending, typing, error |
| `HandoffEvent` | "📄 ASTRA handed off the brief · 3 files" | คลิกเปิดไฟล์ |
| `AgentDrawer` | หัว: avatar + ชื่อ + pill Working + "บทบาท · runtime" · tabs Activity / Trace / Config | |
| `KeyValueCard` | Current task: shown in world as / handed off by / step + ปุ่ม "Open work · 4 files changed" | |
| `StatTile` | Tokens / Cost / Avg latency | ไม่มีข้อมูล → "—" |
| `FlowStrip` | การ์ดยาวแบ่งช่อง: ภาพ isometric บน dot-grid + "Step 1 · Plan" + avatar stack + ชื่อบทบาท + คำอธิบาย | คลิกเปิด modal ขยาย |
| `DeskCard` | ภาพฉากโต๊ะ + caption chip "Sits at the meeting table" + ไอคอนบทบาท + agent chip + Takes work from / Hands off to + "22 tasks planned this week" + Edit | |
| `ReviewHeader` | ← + avatar + ชื่องาน + pill In progress + breadcrumb workflow·task·agent·branch + Open in VS Code / Request changes / Approve | approve disabled เมื่อ checks ไม่ผ่าน |
| `ChangedFiles` | +86 −12 รวม, แถวไฟล์ + delta + avatar ผู้แก้ | selected |
| `DiffView` | mono, เลขบรรทัด, แถบ add/del, toggle Diff / Full file | ใช้ `PatchFileDiff` เดิม restyle |
| `ChecksModal` | Type check / Lint / Unit tests / QA by SCOUT, ไอคอนวง ✓ ✗ ◌ | passed, failing (n of m), not started, running |
| `TerminalPanel` | "Terminal · run by FORGE 12s ago" + pill "2 failing" | |
| `ConnectorCard` | ไอคอนวงกลม 96 + ชื่อ + คำอธิบาย + chips "API key" "2 min setup" + pill "FORGE connected" + ปุ่ม | connected, available, error |
| `ThemeHero` / `ThemeCard` | ภาพฉากเต็มกว้าง มืดลง + pill Active + ชื่อ + avatar stack | active, installed, new |
| `Eyebrow` | mono uppercase `[01] CONNECT` ซ้าย / `/ BRING YOUR STACK` ขวา | |
| `IsoIllustration` | SVG isometric line-art (stroke `--line-2`, ไฮไลต์ amber, จุดไฟ LED) | |

---

## 4. ระบบหลังบ้านและข้อมูลที่ต้องเพิ่ม

ของเดิมใน Core พอสำหรับ: projects, workflows, tasks, executions, execution events, writing/patch, approvals (IPC `snapshot`, `queue_events`, `execution_events`, `execution_result`, `writing_action`, `queue_action`, `start_run`, `cancel_run`, `scheduling` …)

### 4.1 Entities / fields ใหม่

| Entity | Fields | เหตุผลจาก UI |
|---|---|---|
| `AgentDesk` (config) | `agent_id`, `role_label`, `desk_spot` (meeting table / test bench …), `takes_from[]`, `hands_off_to[]` | Job desks, AgentDrawer → Job desk (อนุมานจาก workflow template ได้ก่อน ไม่ต้องมีตารางใหม่ใน v1) |
| `AgentActivity` (derived) | `agent_id`, `state`, `activity_text`, `step`, `step_total`, `talking_to` | แถว agent "Writing code · step 14 of 22", SceneLabel |
| `ExecutionMetrics` | `tokens_in`, `tokens_out`, `cost_usd`, `avg_latency_ms` | StatTile "This run" — **ตอนนี้ `Execution` ไม่มี field เหล่านี้** ต้องดึงจาก runtime adapter (Claude/Codex usage) ถ้าไม่มีให้แสดง "—" |
| `ExecutionCheck` | `execution_id`, `kind` (typecheck/lint/test/qa), `status`, `passed`, `total`, `log_ref` | ChecksModal, gate ปุ่ม Approve |
| `ConversationThread` | `id`, `workflow_id`, `participants[]`, `topic`, `started_at`, `user_joined` | ConversationDrawer (ใช้ข้อความแชท CEO เดิมจัดกลุ่มตาม workflow) |
| `UserPrefs` | `world_theme`, `playback_speed`, `sidebar_collapsed` | Themes, PlaybackBar (เก็บ local ได้) |

> ⚠️ การเพิ่มคอลัมน์/ตาราง SQLite เป็นงาน **Database/schema (protected)** ต้องเสนอ migration และรออนุมัติก่อน

### 4.2 Actions → IPC

| การกระทำบนจอ | IPC / Logic |
|---|---|
| + New goal | `create_workflow` (เดิม) |
| เลือก workflow ใน switcher | กรอง `snapshot` ฝั่ง client |
| ❚❚ Pause / Resume | `scheduling` (เดิม มีผลทุกโปรเจกต์ ต้องคงการยืนยัน) |
| Reassign / Message team (Run controls) | ใหม่: `task_reassign`, `thread_post` |
| ส่งข้อความใน drawer | แชท CEO เดิม (`ceo.ts`) + ผูก `thread_id` |
| Approve / Request changes | `writing_action` / `queue_action` (เดิม) + native confirmation เดิม |
| Open in VS Code | ใหม่: `open_in_editor(path)` ฝั่ง Tauri (scope เฉพาะโฟลเดอร์โปรเจกต์ที่อนุญาต) |
| Checks | ใหม่: `execution_checks(execution_id)` |
| Connect agent / Catalog | `diagnostics` (เดิม) + หน้า runtime config |
| เปลี่ยนธีมโลก | local pref + `OfficeScene.setWorld()` |

### 4.3 Business logic และ edge cases
- ปุ่ม **Approve ต้อง disable** เมื่อ check ใด failing และต้องคง native confirmation + SHA256 patch เดิม
- "Pause the run" ใน Guildhall เป็นราย run แต่ `scheduling` ของ Astra หยุดทุกโปรเจกต์ → UI ต้องบอกให้ชัด หรือเพิ่ม pause ราย workflow
- ข้อความ "you" ใน drawer ห้ามเลี่ยง approval gate (เติมร่างเท่านั้น เหมือน GenUI เดิม)
- Agent มากกว่า label ที่ใส่ได้: label ซ้อนกัน → จัด collision + ซ่อน label ไม่ active เมื่อ zoom out
- MOCK runtime ต้องมีป้าย MOCK บน SceneLabel/AgentRow เหมือนเดิม
- Cost เป็นค่าประมาณจาก adapter ห้ามแสดงเหมือนบิลจริง
- reduced-motion: หยุดเดินตัวละคร/ไฟกะพริบ, สถานะต้องมีข้อความไม่ใช้สีอย่างเดียว (ตาม PRODUCT_SPEC)
- Remote Web (`apps/web`) ใช้ tokens เดียวกันผ่าน `packages/ui`

---

## 5. แผนดำเนินงาน

**Phase 1 — Tokens และ Shell (≈2–3 วัน)**
- สร้าง `packages/ui/src/guildhall.css` (tokens ข้อ 2) แทน `astra-glass.css` ผ่าน `data-skin` เพื่อสลับกลับได้ระหว่างเปลี่ยน
- ตัดสินใจฟอนต์ไทย + mono, เพิ่มลง `ASSET_LICENSES.md`
- `AppFrame`, `IconRail`, `PageHeader`, `Tabs` (underline amber), `StatusPill`, `Button` (primary ขาว / secondary stone-900), `Eyebrow`
- แทน header กระจก + แถบเมนูข้อความ ด้วย rail และคง URL `?view=console&page=…` เดิม

**Phase 2 — หน้าจอด้วย mock data (≈5–7 วัน)**
1. Workspace: `ContextSidebar` + `WorldCanvas` (ปรับ OfficeScene) + `SceneLabel` + toolbar + zoom + minimap + `PlaybackBar`
2. Drawers: Conversation (ย้ายแชท CEO), AgentDrawer (Activity/Trace/Config)
3. Review: header + tabs + ChangedFiles + Diff (restyle `PatchFileDiff`) + ChecksModal + Terminal
4. Job desks, Connectors, Themes
5. Restyle หน้าที่ไม่มีในแบบ: ภาพรวม, คิวงาน (`QueueBoard`), โปรเจกต์, Remote
6. วาด `IsoIllustration` ชุดใหม่ (goal/PM/programmer/QA/docs/hub) เป็น SVG ของเราเอง

**Phase 3 — Core / ข้อมูล (≈3–5 วัน, ต้องอนุมัติ schema)**
- `AgentActivity` derived ใน Rust จาก task/execution events
- `ExecutionMetrics` จาก adapter (Claude/Codex usage) + migration
- `execution_checks`, `open_in_editor`, thread grouping
- Vitest + Rust tests ของ IPC ใหม่

**Phase 4 — Integration และ Polish (≈3 วัน)**
- ผูกทุกจอกับ Core จริง, loading/empty/error states, keyboard (rail ↑↓, `P` pause, `R` reassign, `M` message ตาม Run controls ในแบบ), focus ring
- Responsive 3 ขนาด, contrast ≥ 4.5:1 (text-3 บน surface ต้องตรวจ), reduced-motion
- Playwright e2e เดิมทุกไฟล์ใน `tests/e2e/` ต้องปรับ selector, ตรวจ Native Windows build และติดตั้งตามขั้นตอนเดิม (backup SQLite ก่อน)

---

## 6. เรื่องที่ต้องตัดสินใจก่อนเริ่ม

1. **ฉากโลก:** (A) ใช้ three.js เดิม เปลี่ยนเป็นกล้อง orthographic isometric + render ความละเอียดต่ำแล้วขยายแบบ nearest-neighbor ให้ดูเป็น pixel *(แนะนำ ทำได้เร็ว ใช้ CrewBots เดิม)* หรือ (B) เปลี่ยนเป็น 2D sprite/tilemap pixel art จริง ต้องผลิต art ใหม่ทั้งชุด ซึ่งเป็นงานใหญ่
2. **ตัวละคร:** คง CrewBots หุ่นยนต์ (เปลี่ยนเป็น pixel portrait ของหุ่น) หรือทำตัวละครมนุษย์ pixel ใหม่ (ห้ามลอกของ Guildhall)
3. **ฟอนต์ไทย:** IBM Plex Sans Thai + IBM Plex Mono *(แนะนำ เส้นตรงเข้ากับ grotesk)* / Noto Sans Thai + Inter / คง LINE Seed Sans TH
4. **ธีมโลกหลายแบบ (shot 3, 8):** ทำใน v1 หรือเลื่อนไปหลังจากฉาก Office เสร็จ
5. **Light theme:** คงไว้ (ต้องออกแบบเพิ่ม) หรือ dark-only ตามแบบ
6. **Landing page (shot 1):** ต้องการไหม (`apps/web` ตอนนี้เป็น Remote console ไม่ใช่เว็บการตลาด)

## สมมติฐาน
- Shot 7 อ่านไม่ได้เพราะ rate-limit; ใช้ desk cards และ agent drawer ที่เห็นใน shot 6/9 แทน
- ค่าสีมาจากการดูดสีภาพ PNG ที่ถูกบีบอัด อาจคลาดเคลื่อน ±2 ต่อช่องสี
- หน้า ภาพรวม/คิวงาน/โปรเจกต์/Remote ไม่มีในแบบ จึงออกแบบต่อจาก pattern ของแบบ
- ไม่มีรายละเอียด light mode, mobile, error state ในแบบ จึงต้องออกแบบเพิ่ม
