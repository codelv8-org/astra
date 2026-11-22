import type { Agent, QueueTask, Snapshot } from "../../../../packages/shared/src";
import { agentName, sortTasks, stepLabels } from "./ceo";
import type { SceneStatus } from "./OfficeScene";

export const runtimeNames: Record<string, string> = {
  codex: "OpenAI Codex",
  claude: "Claude Code",
  antigravity: "Antigravity",
  mock: "Mock",
};
/** ตัวย่อ runtime ในวงกลม (ไม่ใช้โลโก้ของผู้ให้บริการ) */
export const runtimeMonogram: Record<string, string> = {
  codex: "CX",
  claude: "CL",
  antigravity: "AG",
  mock: "MK",
};

/**
 * Job desk ตามแม่แบบ workflow ของ Core (packages/desktop-core/src/queue.rs)
 * plan → plan_approval (คุณ) → architecture → design → implement → review → uat (คุณ) → summary
 */
export const jobDesks: Record<
  string,
  { takesFrom: string; handsOffTo: string; spot: string }
> = {
  astra: {
    takesFrom: "คุณ · SCOUT",
    handsOffTo: "VECTOR หลังคุณอนุมัติแผน",
    spot: "โต๊ะประชุมกลาง",
  },
  vector: { takesFrom: "ASTRA", handsOffTo: "MIRA", spot: "โต๊ะวางระบบ" },
  mira: { takesFrom: "VECTOR", handsOffTo: "FORGE", spot: "โต๊ะออกแบบ" },
  forge: { takesFrom: "MIRA", handsOffTo: "SCOUT", spot: "โต๊ะพัฒนา" },
  scout: {
    takesFrom: "FORGE",
    handsOffTo: "คุณ (UAT) แล้ว ASTRA สรุป",
    spot: "โต๊ะทดสอบ",
  },
};

export const sceneStatusLabels: Record<SceneStatus, string> = {
  working: "กำลังทำ",
  waiting: "รอคุณ",
  error: "ล้มเหลว",
  idle: "ว่าง",
  offline: "ออฟไลน์",
};
/** สิ่งที่ผู้ใช้เห็นหุ่นทำในฉาก ตามสถานะเดียวกับที่ฉากใช้ */
export const sceneBehaviour: Record<SceneStatus, string> = {
  working: "พิมพ์งานที่โต๊ะ",
  waiting: "ยืนรอที่โต๊ะ",
  error: "ก้มหน้าที่โต๊ะ",
  idle: "เดินเล่นในออฟฟิศ",
  offline: "ไม่อยู่ในออฟฟิศ",
};

export interface AgentFocus {
  task: QueueTask;
  /** ลำดับขั้นใน workflow เดียวกัน เริ่มที่ 1 */
  step: number;
  total: number;
  /** ชื่อผู้ส่งงานขั้นก่อนหน้า หรือ "คุณ" เมื่อเป็นขั้นแรก */
  handedBy: string;
  label: string;
}

/** งานที่ agent ถืออยู่ตอนนี้: กำลังทำ → รอคน → ล้มเหลว → งานล่าสุด */
export function agentFocus(data: Snapshot, agentId: string): AgentFocus | null {
  const tasks = data.tasks ?? [];
  const mine = tasks.filter((task) => task.agentId === agentId);
  if (!mine.length) return null;
  const latest = [...mine].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  const task =
    mine.find((item) => item.status === "running") ??
    sortTasks(mine).find((item) =>
      ["ready", "needs_review"].includes(item.status),
    ) ??
    mine.find((item) => item.status === "failed") ??
    latest;
  const steps = task.workflowId
    ? sortTasks(tasks.filter((item) => item.workflowId === task.workflowId))
    : [task];
  const index = Math.max(
    0,
    steps.findIndex((item) => item.id === task.id),
  );
  const previous = index > 0 ? steps[index - 1] : null;
  return {
    task,
    step: index + 1,
    total: steps.length,
    handedBy: previous
      ? previous.gate
        ? "คุณ"
        : agentName(data.agents, previous.agentId)
      : "คุณ",
    label: stepLabels[task.step] ?? task.title,
  };
}

/** จัดกลุ่ม agent ตามบทบาท โดยคงลำดับเดิมของ roster */
export function groupByRole(agents: Agent[], query = "") {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, Agent[]>();
  for (const agent of agents) {
    if (
      needle &&
      !`${agent.name} ${agent.role}`.toLowerCase().includes(needle)
    )
      continue;
    groups.set(agent.role, [...(groups.get(agent.role) ?? []), agent]);
  }
  return [...groups].map(([role, members]) => ({ role, members }));
}

/** สถิติจริงจาก executions ในเครื่องของ agent */
export function agentRunStats(data: Snapshot, agentId: string) {
  const runs = data.executions.filter((run) => run.agentId === agentId);
  return {
    total: runs.length,
    completed: runs.filter((run) => run.status === "completed").length,
    failed: runs.filter((run) => run.status === "failed").length,
  };
}
