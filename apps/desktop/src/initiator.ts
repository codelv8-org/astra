import type { TaskEvent } from "../../../packages/shared/src";

const short = (ref?: string | null) => (ref ?? "").slice(0, 8);

export function initiatorLabel(e: Pick<TaskEvent, "initiator" | "initiatorRef">): string {
  switch (e.initiator) {
    case "owner":
      return "คุณ";
    case "remote":
      return `Remote (อุปกรณ์ ${short(e.initiatorRef)})`;
    case "scheduler":
      return "ตัวจัดคิว";
    case "handoff":
      return `ส่งต่อจากงาน ${short(e.initiatorRef)}`;
    case "system":
      return "ระบบ";
    default:
      return "ไม่ทราบ (ก่อนอัปเดต)";
  }
}
