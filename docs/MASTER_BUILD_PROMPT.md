# MASTER BUILD PROMPT — CrewNest

## บทบาทและเป้าหมาย

ทำหน้าที่ Principal Software Architect, Senior Full-Stack Engineer, Rust/Tauri Engineer, AI Agent Orchestration Specialist, Product Designer และ QA Automation Engineer เพื่อออกแบบและ implement MVP **CrewNest — AI Agent Command Center** ซึ่งเป็น local-first multi-agent orchestration platform

ใช้แนวคิด architecture ของ Paperclip เป็นแรงบันดาลใจ แต่ต้อง implement อย่างอิสระ มี original UI และ product identity ของตนเอง ห้ามหยุดที่ mockups, wireframes, architecture docs หรือ static frontend ต้องส่ง working source, executable services, tested integrations และ build instructions เมื่อดำเนินงาน build จริง

เอกสารนี้เป็นสเปก build ที่ปรับ branding จาก baseline ที่ผู้ใช้ให้ ไม่ใช่รายงานว่า build สำเร็จแล้ว งาน rebranding ส่งมอบสเปกและ original CrewBots แล้ว รอบ implementation ปัจจุบันผู้ใช้อนุมัติ Phase 0–1; ผลจริงอยู่ PHASE_1_REPORT.md

## 1. Product vision

CrewNest คือองค์กรพัฒนาซอฟต์แวร์ AI ส่วนบุคคล มี specialized agents แสดงตัวด้วยหุ่นยนต์ companion ต้นฉบับชื่อ CrewBots

**CrewNest Desktop** เป็น Windows application บน Tauri 2 เป็น trusted execution host สำหรับ local CLI sessions, processes, repositories และ workspaces ใช้งาน local ได้แม้ central backend ไม่เชื่อมต่อ และเชื่อม backend อย่างปลอดภัยเพื่อรับ remote tasks ได้

**CrewNest Web** เป็น browser application แยกต่างหากสำหรับ authenticated owner เพื่อ monitor/control registered Windows devices ดู agent activity, projects, task queues, execution status และ approved actions รองรับ desktop/tablet/mobile ไม่ execute local CLI โดยตรง และไม่ใช่ Desktop App ที่เปิดออก Internet

ทั้งสองแอปแชร์ selected types, API contracts, UI components และ business rules แต่ build, deploy และ version แยกกัน

## 2. Technology stack

| ชั้น | Baseline |
|---|---|
| Desktop | Tauri 2, Rust, React + TypeScript, Vite, Tailwind CSS, SQLite, constrained Rust process execution, Windows Credential Manager หรือ secure OS-backed secret storage |
| Web | React + TypeScript, Vite, Tailwind CSS, TanStack Query, responsive PWA-ready architecture |
| Central backend | Node.js + TypeScript, Fastify, PostgreSQL, Drizzle ORM, REST API, authenticated WebSocket over TLS, session-based user authentication, device pairing และ revocable credentials |
| Shared | pnpm workspaces, shared TypeScript contracts, Zod validation, shared UI design system, typed event/command protocols |
| Quality | Vitest, Playwright, Rust unit tests, API integration tests, GitHub Actions CI, ESLint, Prettier, TypeScript strict mode |

เลือก dependency versions ที่ stable และ compatible พร้อมบันทึก versions ที่เลือกเมื่อ implement ห้ามเพิ่ม Kubernetes, distributed microservices หรือ infrastructure ที่ไม่จำเป็น Versions ของ Phase 1 อยู่ DEPENDENCIES.md และ lockfiles

## 3. Repository structure

ชื่อ logical monorepo คือ `crewnest/` โดยไม่ต้องย้าย workspace ปัจจุบัน `D:\Projects\astraops` เพียงเพื่อ branding

```text
crewnest/
  apps/desktop/             # แอป Tauri Windows
  apps/web/                 # เว็บ remote console แยกอิสระ
  apps/api/                 # Central backend
  packages/ui/              # Components และ design tokens ร่วม
  packages/shared/          # Domain types และ schemas
  packages/protocol/        # Remote commands และ event contracts
  packages/agent-adapters/  # Adapter interfaces และ parsers ร่วม
  packages/config/          # Configuration ร่วม
  docs/                     # Architecture, API, security, workflows, คู่มือ
  tests/                    # Integration และ end-to-end ข้ามแอป
  infra/                    # Development และ deployment configuration
```

เก็บ runtime-specific execution ใน trusted Desktop Core เท่านั้น ไม่อยู่ใน browser หรือ central API โครงสร้างข้างต้นเป็นเป้าหมาย monorepo; Phase 1 เพิ่ม packages/desktop-core เป็น Rust crate ที่ link เฉพาะ trusted Desktop ส่วน apps/web และ apps/api ยังเป็นขอบเขต Phase 3

## 4. CrewBot organization

สร้าง default agents เป็น configurable records ห้าม hardcode business logic ตามชื่อตัวละคร

**ASTRA — CEO / Orchestrator — OpenAI Codex**: รับ objectives, วิเคราะห์ project goals, สร้าง high-level execution plans, แตก requirements เป็น tasks, assign specialized agents, ติดตาม blockers/progress, ประสาน review/revision และทำ executive summaries ห้าม bypass human approvals

**FORGE — Software Engineering Lead — Claude Code**: implement application features, เขียน frontend/backend, แก้ bugs, refactor, รักษา coding standards, implement approved architecture/UI specifications และส่ง change summaries พร้อม execution evidence

**MIRA — UI/UX Design Lead — Antigravity**: วิเคราะห์ UX requirements, เสนอ layouts/component structures, สร้าง UI specifications, กำหนด tokens/interaction states, ออกแบบ responsive interfaces และส่ง implementation-ready handoff ต้องใช้ documented CLI interfaces ห้ามใช้ undocumented IDE automation

**VECTOR — System Architect & Researcher — OpenAI Codex**: วิเคราะห์ technical requirements, research approaches เมื่อมี tools ที่เหมาะสม, ออกแบบ architecture, ทำ database/API specifications, ระบุ technical/security risks, ทบทวน feasibility/dependencies และสร้าง ADRs

**SCOUT — Reviewer, QA & UAT Lead — OpenAI Codex**: review changes, รัน authorized automated tests, static analysis/regression, หา bugs/vulnerabilities, เทียบ acceptance criteria, ทำ QA/UAT preparation reports และแนะนำ rework Final UAT approval เป็นของ human owner

Agent record ทุกตัวต้องมี unique ID, name, avatar, role, description, parent/supervisor relationship, runtime adapter, model selection เมื่อรองรับ, local workspace permissions, instructions/system prompt, skills/capabilities, execution settings, concurrency limit, current status, assigned task, session information, last heartbeat, run history และ usage/cost metadata เมื่อมีข้อมูลจริง รองรับ agents เพิ่มและ configurable roles ภายหลัง

## 5. Workflow engine

Default workflow ใช้ dependencies และ persisted task states อย่างชัดเจน:

1. User สร้าง project และ objective
2. ASTRA วิเคราะห์และแตก tasks
3. Human review proposed plan
4. VECTOR สร้าง technical architecture
5. MIRA สร้าง UI/UX specification
6. FORGE implement approved work
7. SCOUT review และรัน tests
8. Failed checks สร้าง rework tasks ให้ FORGE
9. SCOUT ตรวจ implementation ที่แก้แล้ว
10. Human review deliverables และทำ UAT
11. ASTRA สรุปผล

Task states ต้องคง `draft`, `ready`, `queued`, `running`, `blocked`, `needs_review`, `completed`, `failed`, `canceled`

รองรับ task assignment, dependency graph, agent handoff, priority, retry limits, execution timeout, cancellation, explicit approval gates, event history, workflow progress และ blocker reporting ห้าม infinite autonomous loops Default automated rework สูงสุด **2 attempts** แล้ว escalate human owner

ห้ามหลาย writing agents แก้ working tree เดียวพร้อมกัน ใช้ execution locks หรือ isolated Git worktrees เมื่อ explicitly enabled parallel work

## 6. Runtime adapters และ process execution

Adapter interface ต้องรองรับ `detect()`, `getVersion()`, `checkAuthentication()`, `validateConfiguration()`, `start()`, `streamEvents()`, `requestCancellation()`, `getStatus()`, `getResult()`, `resume()` เฉพาะที่รองรับ และ `cleanup()`

- **Codex**: detect local installation, ใช้ documented `codex exec` สำหรับ initial non-interactive execution, parse structured JSONL เมื่อรองรับ, reliable errors/cancellation และเปิดทาง future SDK/app-server integration
- **Claude Code**: detect installation, supported non-interactive CLI, streamed output/session metadata เมื่อมี และ documented permission/approval controls
- **Antigravity**: ตรวจ CLI `agy`, supported headless execution, JSON/stream-json, authentication failure และ documented permissions ทั้งหมดต้อง verify จาก runtime version และเอกสารจริงก่อน implement ถ้าความสามารถไม่มีให้รายงาน unsupported โดยไม่สร้าง CLI flags หรือใช้ IDE automation ทดแทน
- **Mock Agent Adapter**: แยก label ชัดเจน ใช้ automated tests/demo เท่านั้น ห้ามนำผลมาแสดงเป็น real AI execution

การติดตั้ง adapter ไม่ได้ติดตั้งหรือ authenticate AI tool ห้ามสร้างผลสำเร็จเมื่อ CLI missing/authentication failed

Process execution ใช้เฉพาะ approved runtime binaries และ argument arrays ห้าม interpolated shell strings ตรวจ executable paths/working directories เก็บ process IDs/execution IDs จับ stdout/stderr, parse supported structured events, persist logs, handle timeout/cancel, ป้องกัน orphaned child processes เท่าที่ทำได้, redact sensitive values และไม่ใช้ unrestricted/bypass-permission modes เป็น default

MVP Pause หมายถึงหยุด scheduling งานใหม่ ไม่อ้างว่าหยุด process ที่กำลังรันได้หาก runtime ไม่รองรับ Resume ต้องแยก session continuation ที่รองรับออกจาก fresh run

## 7. Desktop features

**Dashboard**: device status, active projects, total/running agents, queued/failed tasks, pending approvals, recent executions, runtime health และ large CrewBot team visual

**Agent Command Center**: CrewBot Cards ทั้งห้า มี chibi avatar, name/role, runtime/provider badge, current activity, status, project/task, last execution และ Start/Stop/Details ตามสิทธิ์ Visual operational states คง Idle, Working, Waiting, Blocked, Error, Offline; character thinking/success เป็น presentation เพิ่ม ไม่แทน domain state เปิด detail modal/panel สำหรับ configuration, assigned work, recent runs และ logs

**Project Manager**: create project, select approved local directory, associate existing Git repository, define goal/workflow, assign agents, progress, artifacts, Git changes, decisions/blockers

**Task Board**: Kanban/list, detail modal, dependencies, assignee, priority, execution history, comments/handoff notes

**Execution Monitor**: realtime events, live logs, structured tool activity เมื่อมี, errors, duration, cancellation และ usage/cost เฉพาะที่ runtime รายงานจริง

**Local Runtime Settings**: CLI diagnostics, executable paths, authentication, defaults, trusted directories, execution policies, remote connectivity, pairing และ local storage

**System Tray**: show/hide, running count, connection status, stop active tasks พร้อม confirmation, quit; minimize-to-tray เมื่อเปิดใช้ Execution ต้องมี Desktop runtime ทำงาน Windows ที่ดับหรือ sleep รันงานไม่ได้ Autostart optional และต้อง explicitly enabled โดย user

## 8. Independent Web features

- Authentication: secure owner login, sessions, logout, pairing/revocation
- Remote Dashboard: Windows devices, online/offline/last-seen, agents, running tasks, queue, approvals
- Projects: browse registered projects, task boards, approved remote task submission, workflow progress, non-sensitive artifacts/reports
- Agents: CrewBot Cards, runtime status, live progress, sanitized logs, completed tasks
- Remote actions: assign, start approved task, cancel eligible task, pause future scheduling, approve/reject guarded operations, request status refresh

ห้าม unrestricted remote terminal, arbitrary local file reads หรือ Windows executable invocation จาก Web โดยตรง Backend และ trusted Desktop ต้อง validate/authorize remote commands ทั้งคู่

## 9. Secure remote communication

Windows Desktop เชื่อม outbound authenticated WSS ไป backend:

```text
Web App → API → Authenticated Device Connection → Windows Desktop → Agent Adapter
```

ทุก command มี `command_id`, `device_id`, `project_id`, `task_id`, `action`, `requested_by`, `issued_at`, `expires_at`, `idempotency_key` และ authorization context

Protocol ต้องมี acknowledgment, validation, status updates, event streaming, idempotent handling, heartbeats, reconnection, state reconciliation, duplicate execution prevention และ stale expiration Desktop enforce local policy เองเสมอ Device offline ต้องแสดง offline จริง ไม่อ้างว่า remote tasks execute ได้ขณะ disconnected ไม่ auto-execute expired/high-risk commands หลัง reconnect Local-only execution ยังคงทำงานได้เมื่อ Desktop ทำงานและ backend ไม่เชื่อมต่อ

## 10. Security model

ไม่มี public local execution API, arbitrary shell endpoint หรือ remote access ไป unapproved directories ห้ามเก็บ CLI account credentials ใน central DB หรือ secrets ใน frontend bundles Device credentials ต้อง revoke ได้ ใช้ secure auth/authz, local execution allowlists, input validation, sensitive-operation audit, safe errors และ controlled/redacted logging

ต้องมี human approval ก่อน push remote Git, merge/delete protected branches, deploy production, delete project data, modify outside approved workspaces, privileged system commands และ access new sensitive external integrations Agents อนุมัติ high-risk actions ของตนเองไม่ได้

## 11. Data and persistence

Minimal relational domain: `users`, `devices`, `device_connections`, `projects`, `agents`, `runtime_configs`, `workflows`, `workflow_steps`, `tasks`, `task_dependencies`, `executions`, `execution_events`, `approvals`, `artifacts`, `audit_logs`

ใช้ central PostgreSQL และ local SQLite ระบุ ownership ของแต่ละ data category ชัดเจน หลีกเลี่ยง ambiguous bidirectional sync ใช้ stable IDs, idempotency keys, schema versions และ migrations Local workspace paths อยู่เฉพาะ trusted Desktop; remote อ้างด้วย opaque project IDs Sensitive runtime configuration อยู่ local

## 12. Design system — CrewNest Command Center

คง ATLAS-inspired sci-fi command center: dark futuristic dashboard, deep navy/charcoal surfaces, subtle neon accents, hierarchy ชัดเจน, floating panels, soft glows, precise borders, modern typography, restrained motion และ responsive layout

| Token | ค่า |
|---|---|
| Background | `#0B1020` |
| Surface | `#151D2F` |
| Elevated Surface | `#202A40` |
| Primary Text | `#F4F7FB` |
| Secondary Text | `#98A5BC` |
| ASTRA | `#4169E1` / `#F2C75C` |
| FORGE | `#E98B3A` / `#FFE0A3` |
| MIRA | `#A597E8` / `#F6BCD8` |
| VECTOR | `#36B7B0` / `#A6F0E8` |
| SCOUT | `#879B4A` / `#D5E89B` |

CrewBots เป็น original futuristic companion robots: cute 2D vector, chibi oversized heads, rounded geometric bodies, small hands/feet, expressive digital faces, distinct silhouettes, soft shading/clean outlines, friendly professional quality และ transparent background ห้ามเลียนแบบ identifiable third-party characters หรือ recognizable costume, helmet, armor, symbols, transformation devices, weapons และ poses ห้ามคัดลอก external artwork

ใช้ full-body, portrait, compact icon, idle, working, thinking, success, error สำหรับแต่ละตัว Prefer SVG/CSS MVP พร้อมอนาคต PNG/WebP/GLB และ accessible fallback ตาม `CREWBOTS_DESIGN_SYSTEM.md` เก็บ provenance/license ใน `ASSET_LICENSES.md` และทำ brand/trademark clearance แยกก่อน public release

แสดง characters ใน Dashboard, Agent Cards, Detail Modal, Workflow Board, Execution Monitor, Notifications, Empty states และ reports เมื่อเหมาะสม UI controls/accessibility สำคัญกว่าภาพ

Desktop layout: floating top navbar, left navigation, central workspace, optional right context, status summary, CrewBot card collection Web ใช้ visual language เดียวกันพร้อม responsive navigation, compact mobile cards, remote status ที่เห็นเสมอและ touch-friendly controls ใช้ modals/drawers สำหรับ Add/Edit/View รองรับ Thai/English ใช้ LINE Seed Sans TH สำหรับ Web UI ตาม project rules ไม่เพิ่ม excessive animation, unnecessary 3D หรือ decoration ที่ลด usability

## 13. MVP boundaries

Must have: working Tauri Windows, independent Web/API, local SQLite/central PostgreSQL, five configurable default CrewBots, adapters, CLI diagnostics, genuine authorized installed-runtime execution, live logs, project/task creation/assignment, basic orchestration/handoffs, queue/locks, secure device pairing, remote submission/monitoring, authentication/approval gates, persisted history, automated tests และ development/deployment docs

Future เท่านั้น: multiple organizations, advanced financial/token budgets, automatic provider failover, complex multi-machine balancing, autonomous scheduled operations, full terminal streaming, remote desktop, Agent/Skill marketplace, 3D office, voice, Telegram และ enterprise SSO ออกแบบ extensibility โดยไม่ implement ทั้งหมดใน MVP

## 14. Development strategy

ใช้ vertical slices ไม่สร้าง frontend pages ทั้งหมดก่อน

1. **Phase 0 — Architecture/validation**: inspect environment/toolchains, PRD/scope, architecture/trust boundaries, API/runtime contracts และ implementation plan
2. **Phase 1 — Desktop foundation**: Tauri scaffold, persistence, directory management, diagnostics, labeled Mock Adapter และหนึ่ง working real adapter, Dashboard/Cards
3. **Phase 2 — Local orchestration**: Codex/Claude Code/Antigravity adapters, queue/run manager, streaming, handoff, cancellation/results และ small end-to-end workflow
4. **Phase 3 — Remote control**: API/Web scaffold, auth, pairing, outbound device connection, authenticated commands, live status, disconnect/reconnect
5. **Phase 4 — Validation/packaging**: automated tests, security boundaries, Windows process lifecycle, Desktop → API → Web → Desktop, offline behavior, installer, production instructions และ limitations

แต่ละ phase ต้องมี working demonstration ห้ามผ่าน failing build โดยไม่ report และพยายามแก้

## 15. Acceptance criteria

MVP ยอมรับได้เมื่อ scenarios ต่อไปนี้ทำงานจริง:

1. เปิด CrewNest Windows application
2. เห็น CrewBot Cards ทั้งห้า
3. Diagnostics แยก installed/missing/unauthenticated ถูกต้อง
4. สร้าง project บน approved workspace
5. Assign task ให้ CrewBot agent
6. Installed runtime execute local task จริง
7. UI stream actual status และ persist result
8. Failed execution แสดงสาเหตุจริง ไม่ fake success
9. Pair Windows device กับ backend
10. Login separate Web App
11. Web แสดง actual connection status
12. Submit permitted remote task
13. Desktop รับและ execute task exactly once
14. Remote เห็น progress/sanitized logs
15. Dangerous operations ต้อง explicit human authorization
16. Windows disconnect/reconnect ปลอดภัย
17. Restart แล้ว completed run history ยังอยู่
18. Integration tests ผ่านด้วย clearly labeled Mock Adapter โดยไม่ต้องมี paid AI accounts
19. Build Windows installer ได้
20. Deploy Web/API แยกกันได้

ผล tests ต้องมาจากการรันจริง Character pack validation ไม่เท่ากับ MVP acceptance

## 16. Required build deliverables

Complete source, architecture, database schema/migrations, API/WebSocket docs, adapter docs, security model, dev setup, environment examples, Windows build instructions, central-service Docker Compose, automated tests, known limitations และ next-phase roadmap

เมื่อ build เสร็จ report สิ่งที่ implement จริง, adapters ที่ทดสอบ, tests pass/fail, วิธีรันแต่ละแอป, Windows installer build, Web/API deploy และ blockers ห้ามรายงาน visual placeholder ว่า implement feature แล้ว

## 17. Execution instructions สำหรับงาน build ภายหลัง

เริ่มจาก workspace ปัจจุบัน ถ้าว่างให้ initialize monorepo ทำงาน autonomous ภายใน authorized local workspace/safety boundaries ส่ง concise implementation plan, proposed monorepo structure, core domain model, adapter design, Desktop/remote architecture และ MVP milestones ก่อน จากนั้น implement เป็น small testable increments

ใช้ working code, real typed APIs, persistence และ real integration tests เลี่ยง unnecessary complexity, fabricated output และ mock-only functionality เป้าหมายสุดท้ายคือ practical CrewNest MVP ที่ควบคุม local AI development team และ monitor/manage จาก separate Web ได้อย่างปลอดภัย

ขอบเขต implementation รอบปัจจุบันคือ Phase 0–1 ตามคำสั่งผู้ใช้ ไม่ขยายไป build Phase 2–4 โดยอัตโนมัติ และไม่รายงาน full MVP acceptance จากผลตรวจ foundation เพียงอย่างเดียว
