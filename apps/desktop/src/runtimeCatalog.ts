import type { Diagnostic } from "../../../packages/shared/src";

/**
 * Runtime ที่ Desktop Core รองรับ (docs/RUNTIME_ADAPTERS.md)
 * ทุกตัวยกเว้น Mock รันผ่าน CLI ในเครื่อง ไม่ใช้ API key และ Astra ไม่ติดตั้งหรือ login ให้
 */
export const connectorCatalog: {
  adapter: string;
  name: string;
  description: string;
  connect: string;
  auth: string;
}[] = [
  {
    adapter: "claude",
    name: "Claude Code",
    description:
      "Coding agent ผ่าน CLI ในเครื่อง FORGE ใช้เสนอไฟล์เป็น patch ให้คุณตรวจก่อนเขียน",
    connect: "CLI ในเครื่อง",
    auth: "auth status ของ CLI",
  },
  {
    adapter: "codex",
    name: "OpenAI Codex",
    description:
      "Coding agent ผ่าน CLI รันแบบอ่านอย่างเดียว ส่งต่องานตามลำดับใน workflow ได้",
    connect: "CLI ในเครื่อง",
    auth: "login status ของ CLI",
  },
  {
    adapter: "antigravity",
    name: "Antigravity",
    description: "Agent ผ่าน CLI agy ในโหมดวางแผนและ sandbox พร้อม session และ usage",
    connect: "CLI agy ในเครื่อง",
    auth: "ยืนยันจากรันสำเร็จล่าสุด",
  },
  {
    adapter: "mock",
    name: "Mock Adapter",
    description:
      "ตัวทดสอบในตัว ไม่มี AI model ใช้ลอง workflow และคิวงานโดยไม่เสียค่าใช้จ่าย",
    connect: "มีในตัว",
    auth: "ไม่ต้องล็อกอิน",
  },
];

export type ConnectorTone = "ok" | "wait" | "bad" | "idle";

/** สถานะจากผลตรวจ CLI ล่าสุด หรือ "ยังไม่ได้ตรวจ" เมื่อยังไม่มีผล */
export function connectorStatus(diagnostic: Diagnostic | undefined): {
  tone: ConnectorTone;
  label: string;
} {
  if (!diagnostic) return { tone: "idle", label: "ยังไม่ได้ตรวจ" };
  if (!diagnostic.installed) return { tone: "bad", label: "ไม่พบ CLI" };
  if (!diagnostic.supported) return { tone: "bad", label: "รุ่นที่ไม่รองรับ" };
  if (diagnostic.authentication === "unauthenticated")
    return { tone: "wait", label: "ต้อง login ใน CLI" };
  if (diagnostic.authentication === "unknown")
    return { tone: "wait", label: "พร้อม · ตรวจ login ตอนรัน" };
  return { tone: "ok", label: "พร้อมใช้" };
}

export const authLabels: Record<Diagnostic["authentication"], string> = {
  authenticated: "login แล้ว",
  unauthenticated: "ยังไม่ login",
  unknown: "ไม่ทราบจนกว่าจะรัน",
  not_required: "ไม่ต้อง login",
};
