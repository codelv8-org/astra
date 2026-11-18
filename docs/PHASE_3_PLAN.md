# Phase 3 — แผน implementation

ใช้ worktree `D:\Projects\astraops` ต่อจาก Native Phase 2; ไม่ commit/push และไม่แก้ข้อมูล PostgreSQL ของโครงการอื่น

1. Central API: Fastify/TypeScript, PostgreSQL/Drizzle migrations, owner bootstrap ผ่าน CLI, hashed sessions/device credentials, CSRF/Origin validation, rate limit, authenticated WSS
2. Remote protocol: typed allowlist, short command expiry, idempotency, acknowledgment, durable local command ledger และ reconciliation; backend ไม่ถือ local paths/CLI credentials
3. Desktop: outbound HTTPS/WSS, Windows Credential Manager, explicit pairing/share policy, remote submission เป็น draft ที่ต้อง approve ในเครื่องก่อน start; remote ไม่อนุมัติ writing apply/high-risk actions
4. Independent Web: React/Vite/TanStack Query, login/logout/pairing/revoke, devices/projects/tasks/commands/logs; responsive และ CrewBots ร่วม design tokens เดิม
5. ทดสอบ PostgreSQL/API/TLS/WebSocket และ Rust execution จริงด้วย isolated synthetic workspace รวม duplicate/offline/reconnect/cancel/revoke และ browser workflow; แยก labeled Mock จาก real Codex และไม่อ้างว่า headless Core test เป็น native owner sign-off

Ownership: API เป็นเจ้าของ users/sessions/devices/pair codes/remote command requests; Desktop เป็นเจ้าของ approved workspaces, tasks, execution state, approvals และ sanitized published snapshots/events; central snapshots เป็น replica อ่านอย่างเดียว ห้าม sync ทับ local policy/state

Local test ใช้ PostgreSQL cluster/ports/certificates ใต้ `.local/phase3-dev` โดยไม่เพิ่ม OS certificate trust, firewall หรือ Windows service แบบถาวร Production ใช้ HTTPS certificate ที่ trusted และ explicit allowed Web origin
