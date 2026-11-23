import type { Snapshot, Workflow } from "../../../../../packages/shared/src";
import {
  agentName,
  clip,
  handoffStatus,
  progressOf,
  sortTasks,
  stepLabels,
} from "../ceo";
import type { GenBlock, GenSpec } from "./spec";

export function workflowGenUI(
  data: Snapshot,
  workflow: Workflow,
): GenSpec | undefined {
  const tasks = sortTasks(
    (data.tasks ?? []).filter((task) => task.workflowId === workflow.id),
  );
  if (!tasks.length) return;
  return {
    version: 1,
    blocks: [
      {
        type: "timeline",
        title: "แผนส่งต่องานตอนรับคำสั่ง",
        items: tasks.slice(0, 24).map((task) => ({
          label: `${task.gate ? "ผู้อนุมัติ" : agentName(data.agents, task.agentId)} · ${stepLabels[task.step] ?? clip(task.title, 85)}`,
          detail: handoffStatus(task),
          status:
            task.status === "completed"
              ? "done"
              : task.status === "running"
                ? "active"
                : task.status === "failed"
                  ? "failed"
                  : "pending",
        })),
      },
    ],
  };
}

export function progressGenUI(
  data: Snapshot,
  projectId: string | null,
): GenSpec | undefined {
  const flows = (data.workflows ?? []).filter(
    (flow) => !projectId || flow.projectId === projectId,
  );
  if (!flows.length) return;
  const workflowIds = new Set(flows.map((flow) => flow.id));
  const tasks = (data.tasks ?? []).filter(
    (task) => task.workflowId && workflowIds.has(task.workflowId),
  );
  const counts = progressOf(tasks);
  const blocks: GenBlock[] = [
    {
      type: "kpi",
      title: "ภาพรวม workflow",
      items: [
        { label: "Workflow", value: flows.length },
        { label: "ขั้นที่เสร็จ", value: `${counts.completed}/${counts.total}` },
        { label: "กำลังทำ", value: counts.running },
        {
          label: "รออนุมัติ",
          value: tasks.filter(
            (task) => task.status === "ready" || task.status === "needs_review",
          ).length,
        },
      ],
    },
  ];
  const states = [
    ["รออนุมัติ", ["ready", "needs_review"]],
    ["รอขั้นก่อนหน้า", ["draft", "blocked"]],
    ["เข้าคิว", ["queued"]],
    ["กำลังทำ", ["running"]],
    ["เสร็จ", ["completed"]],
    ["ล้มเหลว", ["failed"]],
    ["ยกเลิก", ["canceled"]],
  ] as const;
  if (tasks.length) {
    blocks.push({
      type: "chart",
      variant: "bar",
      title: "จำนวนขั้นตอนตามสถานะ",
      unit: "ขั้น",
      points: states.map(([label, statuses]) => ({
        label,
        value: tasks.filter((task) =>
          (statuses as readonly string[]).includes(task.status),
        ).length,
      })),
    });
  }
  blocks.push({
    type: "table",
    title: flows.length > 100 ? "100 workflow ล่าสุด" : "รายละเอียด workflow",
    columns: ["โปรเจกต์", "งาน", "ความคืบหน้า", "ขั้นปัจจุบัน"],
    rows: [...flows]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
      .map((flow) => {
        const progress = progressOf(
          tasks.filter((task) => task.workflowId === flow.id),
        );
        return [
          clip(
            data.projects.find((project) => project.id === flow.projectId)
              ?.name ?? "โปรเจกต์",
            100,
          ),
          clip(flow.objective, 100),
          `${progress.completed}/${progress.total}`,
          progress.current
            ? `${stepLabels[progress.current.step] ?? clip(progress.current.title, 85)} · ${handoffStatus(progress.current)}`
            : progress.total
              ? "สิ้นสุดแล้ว"
              : "ยังไม่มีขั้นตอน",
        ];
      }),
  });
  return { version: 1, blocks };
}
