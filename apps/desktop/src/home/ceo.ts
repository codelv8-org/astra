import type {
  Agent,
  Execution,
  QueueTask,
  Snapshot,
  Workflow,
} from "../../../../packages/shared/src";
import type { SceneAgent, SceneStatus } from "./OfficeScene";

/**
 * ตรรกะ CEO (ASTRA) บนหน้า Home
 * ข้อความรายงานสร้างจากสถานะที่ Core บันทึกจริงเท่านั้น ไม่สร้างผลงานหรือคำตอบ AI ขึ้นเอง
 * ผลลัพธ์ที่มาจาก model จริงจะถูกดึงจาก execution event ชนิด "result" และติดป้าย runtime
 */

export const stepOrder = [
  "plan",
  "plan_approval",
  "architecture",
  "design",
  "implement",
  "review",
  "uat",
  "summary",
] as const;
export const stepLabels: Record<string, string> = {
  plan: "วางแผน",
  plan_approval: "อนุมัติแผน",
  architecture: "สถาปัตยกรรม",
  design: "ออกแบบ UI/UX",
  implement: "พัฒนา",
  review: "ตรวจสอบ",
  uat: "UAT",
  summary: "สรุปผล",
  task: "งานเดี่ยว",
};
export const statusLabels: Record<string, string> = {
  draft: "ร่าง",
  ready: "รออนุมัติ",
  queued: "เข้าคิว",
  running: "กำลังทำ",
  blocked: "ติดขัด",
  needs_review: "รอตรวจ",
  completed: "เสร็จ",
  failed: "ล้มเหลว",
  canceled: "ยกเลิก",
};
const waitingStates = new Set(["draft", "ready", "blocked", "needs_review"]);

export interface ChatMessage {
  id: string;
  from: "owner" | "ceo";
  text: string;
  at: string;
  /** core = รายงานจากสถานะ Core, model = ผลจาก runtime จริง, mock = Mock Adapter */
  source?: "core" | "model" | "mock";
  runtime?: string;
  projectId?: string;
  workflowId?: string;
  link?: "queue";
}

export interface Progress {
  total: number;
  completed: number;
  running: number;
  waiting: number;
  failed: number;
  percent: number;
  current: QueueTask | null;
}

export function stepIndex(task: QueueTask) {
  const index = stepOrder.indexOf(task.step as (typeof stepOrder)[number]);
  return index < 0 ? stepOrder.length : index;
}

export function sortTasks(tasks: QueueTask[]) {
  return [...tasks].sort(
    (a, b) =>
      stepIndex(a) - stepIndex(b) || a.createdAt.localeCompare(b.createdAt),
  );
}

export function progressOf(tasks: QueueTask[]): Progress {
  const active = tasks.filter((task) => task.status !== "canceled");
  const completed = active.filter((task) => task.status === "completed").length;
  const ordered = sortTasks(active);
  const current =
    ordered.find((task) => task.status === "running") ??
    ordered.find((task) => task.status !== "completed") ??
    null;
  return {
    total: active.length,
    completed,
    running: active.filter((task) => task.status === "running").length,
    waiting: active.filter((task) => waitingStates.has(task.status)).length,
    failed: active.filter((task) => task.status === "failed").length,
    percent: active.length ? Math.round((completed / active.length) * 100) : 0,
    current,
  };
}

export function agentName(agents: Agent[], id: string) {
  return agents.find((agent) => agent.id === id)?.name ?? id.toUpperCase();
}

export function describeTask(task: QueueTask, agents: Agent[]) {
  return `${stepLabels[task.step] ?? task.title} · ${agentName(agents, task.agentId)} · ${statusLabels[task.status] ?? task.status}`;
}

/** สถานะหุ่นในฉาก 3D คำนวณจาก task/execution จริง */
export function sceneAgents(data: Snapshot): SceneAgent[] {
  const tasks = data.tasks ?? [];
  return data.agents.map((agent) => {
    const mine = tasks.filter((task) => task.agentId === agent.id);
    const runningTask = mine.find((task) => task.status === "running");
    const runningExec = data.executions.find(
      (run) => run.agentId === agent.id && run.status === "running",
    );
    const waiting = sortTasks(mine).find((task) =>
      // blocked = รอ dependency ไม่ใช่งานที่หุ่นถืออยู่ จึงแสดงเฉพาะขั้นที่รอคน
      ["ready", "needs_review"].includes(task.status),
    );
    const failed = mine.find((task) => task.status === "failed");
    let status: SceneStatus = "idle";
    let activity = agent.role;
    if (runningTask || runningExec) {
      status = "working";
      activity = runningTask
        ? `กำลังทำ · ${stepLabels[runningTask.step] ?? runningTask.title}`
        : "กำลังทำ execution";
    } else if (waiting) {
      status = "waiting";
      activity = `${statusLabels[waiting.status]} · ${stepLabels[waiting.step] ?? waiting.title}`;
    } else if (failed) {
      status = "error";
      activity = `ล้มเหลว · ${stepLabels[failed.step] ?? failed.title}`;
    } else if (agent.status === "offline") status = "offline";
    return {
      id: agent.id,
      name: agent.name,
      characterKey: agent.characterKey,
      status,
      activity,
    };
  });
}

export type StatusMap = Record<string, string>;
export function statusMap(tasks: QueueTask[]): StatusMap {
  return Object.fromEntries(tasks.map((task) => [task.id, task.status]));
}

export interface Change {
  task: QueueTask;
  from: string | null;
  to: string;
}
export function diffTasks(previous: StatusMap, tasks: QueueTask[]): Change[] {
  return tasks
    .filter((task) => previous[task.id] !== task.status)
    .map((task) => ({
      task,
      from: previous[task.id] ?? null,
      to: task.status,
    }));
}

/** รวมการเปลี่ยนสถานะใน workflow เดียวกันเป็นรายงานหนึ่งข้อความ */
export function changeReports(
  changes: Change[],
  data: Snapshot,
): Omit<ChatMessage, "id" | "at">[] {
  const groups = new Map<string, Change[]>();
  for (const change of changes) {
    if (!change.from) continue; // task ใหม่ถูกรายงานตอนรับงานแล้ว
    // ร่าง → ติดขัด คือ Core จัดคิวรอ dependency ตอนสร้าง workflow ไม่ใช่ความคืบหน้า
    if (change.from === "draft" && change.to === "blocked") continue;
    const key = change.task.workflowId ?? `task:${change.task.id}`;
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  const tasks = data.tasks ?? [];
  return [...groups.entries()].map(([key, list]) => {
    const workflow = data.workflows?.find((item) => item.id === key);
    const project = data.projects.find(
      (item) => item.id === list[0].task.projectId,
    );
    const progress = progressOf(
      workflow
        ? tasks.filter((task) => task.workflowId === key)
        : [list[0].task],
    );
    const lines = sortTasks(list.map((change) => change.task)).map((task) => {
      const change = list.find((item) => item.task.id === task.id)!;
      return `• ${stepLabels[task.step] ?? task.title} (${agentName(data.agents, task.agentId)}): ${statusLabels[change.from!] ?? change.from} → ${statusLabels[change.to] ?? change.to}${task.blocker && ["blocked", "failed", "ready"].includes(task.status) ? ` — ${task.blocker}` : ""}`;
    });
    const gate = list.some(
      (change) =>
        change.task.gate &&
        ["ready", "needs_review"].includes(change.task.status),
    );
    return {
      from: "ceo" as const,
      source: "core" as const,
      projectId: list[0].task.projectId,
      workflowId: workflow?.id,
      link: gate ? ("queue" as const) : undefined,
      text: [
        `อัปเดต ${project?.name ?? "โปรเจกต์"}${workflow ? ` — “${clip(workflow.objective, 60)}”` : ""}`,
        ...lines,
        `ความคืบหน้า ${progress.completed}/${progress.total} ขั้น (${progress.percent}%)`,
        gate ? "มีขั้นตอนที่ต้องให้คุณอนุมัติใน Task queue" : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  });
}

export function progressReport(
  data: Snapshot,
  projectId: string | null,
): string {
  const tasks = data.tasks ?? [];
  const workflows = (data.workflows ?? [])
    .filter((item) => !projectId || item.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const project = data.projects.find((item) => item.id === projectId);
  if (!workflows.length)
    return `${project ? `โปรเจกต์ ${project.name} ` : ""}ยังไม่มีงานที่สั่งผ่าน workflow พิมพ์เป้าหมายงานแล้วกดส่ง ผมจะสร้างแผนให้คุณอนุมัติก่อนเริ่ม`;
  const lines = workflows.slice(0, 5).map((workflow) => {
    const progress = progressOf(
      tasks.filter((task) => task.workflowId === workflow.id),
    );
    const name =
      data.projects.find((item) => item.id === workflow.projectId)?.name ?? "";
    const now = progress.current
      ? describeTask(progress.current, data.agents)
      : "ครบทุกขั้น";
    return `• ${projectId ? "" : `[${name}] `}“${clip(workflow.objective, 56)}” — ${progress.completed}/${progress.total} (${progress.percent}%) · ตอนนี้: ${now}${progress.failed ? ` · ล้มเหลว ${progress.failed}` : ""}`;
  });
  const waiting = tasks.filter(
    (task) =>
      (!projectId || task.projectId === projectId) &&
      task.gate &&
      ["ready", "needs_review"].includes(task.status),
  ).length;
  return [
    `สรุปสถานะ${project ? ` ${project.name}` : "ทุกโปรเจกต์"} (${workflows.length} งาน)`,
    ...lines,
    workflows.length > 5 ? `…และอีก ${workflows.length - 5} งาน` : "",
    waiting ? `รอคุณอนุมัติ ${waiting} ขั้นตอน` : "ไม่มีขั้นตอนที่รอคุณอนุมัติ",
    (data.schedulerPaused ?? true)
      ? "หมายเหตุ: Scheduling ถูก pause อยู่ งานที่อนุมัติแล้วจะยังไม่เริ่มจนกว่าจะ Resume"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function acceptedReport(
  workflow: Workflow,
  data: Snapshot,
  mock: boolean,
): string {
  const tasks = sortTasks(
    (data.tasks ?? []).filter((task) => task.workflowId === workflow.id),
  );
  const project = data.projects.find((item) => item.id === workflow.projectId);
  const steps = tasks.length
    ? tasks
        .map(
          (task) =>
            `${stepLabels[task.step] ?? task.title} (${agentName(data.agents, task.agentId)})`,
        )
        .join(" → ")
    : "Core กำลังสร้างขั้นตอน";
  return [
    `รับงานแล้วครับ — ${project?.name ?? "โปรเจกต์"}`,
    `สร้าง workflow ${workflow.id.slice(0, 8)}${mock ? " แบบ MOCK (ไม่มี AI model)" : ""}`,
    `ลำดับงาน: ${steps}`,
    "ทุกขั้นยังไม่เริ่มจนกว่าคุณอนุมัติใน Task queue ผมจะรายงานที่นี่เมื่อสถานะเปลี่ยน",
  ].join("\n");
}

const progressPattern =
  /^(ขอ)?(สถานะ|ความคืบหน้า|รายงาน|อัปเดต|อัพเดท|progress|status|report|update)/i;
export function isProgressQuery(text: string) {
  const value = text.trim();
  return value.length <= 60 && progressPattern.test(value);
}

/** task ของ ASTRA ที่เสร็จแล้วและมีผล model ให้ดึงมาแสดงในแชท */
export function astraResultCandidates(
  data: Snapshot,
  seen: Set<string>,
): { task: QueueTask; execution: Execution }[] {
  return (data.tasks ?? [])
    .filter(
      (task) =>
        task.agentId === "astra" &&
        task.status === "completed" &&
        task.lastExecutionId &&
        !seen.has(task.lastExecutionId),
    )
    .map((task) => ({
      task,
      execution: data.executions.find(
        (run) => run.id === task.lastExecutionId,
      )!,
    }))
    .filter((item) => item.execution);
}

export function clip(text: string, length: number) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

/** ตัด Windows verbatim prefix ออกเพื่อแสดงผล */
export function displayPath(path: string) {
  return path.startsWith("\\\\?\\") ? path.slice(4) : path;
}
