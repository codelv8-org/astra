import type { Snapshot } from "../../../packages/shared/src";
import type { IconName } from "../../../packages/ui/src/icons";
import type { IsoVariant } from "../../../packages/ui/src/IsoArt";

/**
 * ลำดับการส่งต่องานตามแม่แบบ workflow ของ Core (packages/desktop-core/src/queue.rs)
 * plan → plan_approval → architecture → design → implement → review → uat → summary
 */
export const flowStages: {
  id: string;
  title: string;
  agents: string[];
  withYou: boolean;
  text: string;
  art: IsoVariant;
}[] = [
  {
    id: "plan",
    title: "วางแผน",
    agents: ["astra"],
    withYou: true,
    text: "แตกเป้าหมายเป็นงานและเกณฑ์รับงาน แล้วรอคุณอนุมัติแผน",
    art: "hub",
  },
  {
    id: "design",
    title: "ออกแบบ",
    agents: ["vector", "mira"],
    withYou: false,
    text: "วางสถาปัตยกรรม API และข้อมูล แล้วทำสเปก UI/UX ที่พร้อมพัฒนา",
    art: "double",
  },
  {
    id: "build",
    title: "พัฒนา",
    agents: ["forge"],
    withYou: false,
    text: "เสนอไฟล์เป็น patch ให้คุณตรวจก่อนเขียนลงเครื่อง",
    art: "single",
  },
  {
    id: "review",
    title: "ตรวจ",
    agents: ["scout"],
    withYou: false,
    text: "ตรวจงานตามเกณฑ์รับงานและบอกสิ่งที่ยังต้อง UAT",
    art: "single",
  },
  {
    id: "ship",
    title: "ส่งมอบ",
    agents: ["astra"],
    withYou: true,
    text: "คุณทำ UAT แล้ว ASTRA สรุปผลและข้อจำกัดที่เหลือ",
    art: "you",
  },
];

export const deskIcons: Record<string, IconName> = {
  astra: "route",
  vector: "layers",
  mira: "pen",
  forge: "code",
  scout: "shield",
};

/** จำนวนงานจริงของ agent: เสร็จแล้ว และที่ยังค้าง (กำลังทำหรือรอคุณ) */
export function deskStats(data: Snapshot, agentId: string) {
  const tasks = (data.tasks ?? []).filter((task) => task.agentId === agentId);
  return {
    done: tasks.filter((task) => task.status === "completed").length,
    open: tasks.filter((task) =>
      ["running", "queued", "ready", "needs_review"].includes(task.status),
    ).length,
  };
}
