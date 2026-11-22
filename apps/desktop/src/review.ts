import type { Snapshot } from "../../../packages/shared/src";
import { patchDiff } from "./patchDiff";
import { sortTasks, statusLabels, stepLabels } from "./home/ceo";

export type CheckState = "passed" | "failed" | "running" | "pending";
export interface ReviewCheck {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

/** รวมข้อมูลจริงที่เกี่ยวกับ execution หนึ่งรายการสำหรับหน้า Review */
export function reviewModel(data: Snapshot, executionId: string) {
  const run = data.executions.find((item) => item.id === executionId);
  if (!run) return null;
  const tasks = data.tasks ?? [];
  const task =
    tasks.find((item) => item.id === run.taskId) ??
    tasks.find((item) => item.lastExecutionId === run.id) ??
    null;
  const steps = task?.workflowId
    ? sortTasks(tasks.filter((item) => item.workflowId === task.workflowId))
    : [];
  const workflow = task?.workflowId
    ? (data.workflows ?? []).find((flow) => flow.id === task.workflowId)
    : undefined;
  return {
    run,
    task,
    workflow,
    agent: data.agents.find((agent) => agent.id === run.agentId),
    project: data.projects.find((project) => project.id === run.projectId),
    review: steps.find((item) => item.step === "review") ?? null,
    uat: steps.find((item) => item.step === "uat") ?? null,
    step: task ? steps.findIndex((item) => item.id === task.id) + 1 : 0,
    total: steps.length,
    label: task ? (stepLabels[task.step] ?? task.title) : "การรันเดี่ยว",
    /** FORGE ที่รันด้วย Claude เท่านั้นที่ส่ง staged patch ให้ตรวจ */
    writes: task?.agentId === "forge" && task.adapter === "claude",
  };
}
export type ReviewModel = NonNullable<ReturnType<typeof reviewModel>>;

/** จำนวนบรรทัดที่เพิ่ม/ลบ หรือ null เมื่อไฟล์ใหญ่เกินกว่าจะคำนวณ diff */
export function diffStats(before: string | null, after: string) {
  const lines = patchDiff(before ?? "", after);
  if (!lines) return null;
  return {
    adds: lines.filter((line) => line.kind === "add").length,
    removes: lines.filter((line) => line.kind === "remove").length,
  };
}

const taskState = (status: string | undefined): CheckState =>
  status === "completed"
    ? "passed"
    : status === "failed"
      ? "failed"
      : status === "running"
        ? "running"
        : "pending";

/**
 * รายการตรวจจากข้อมูลที่ Core บันทึกจริงเท่านั้น
 * (Core ยังไม่บันทึกผล type check/lint/unit test แยก จึงไม่แสดงรายการเหล่านั้น)
 */
export function reviewChecks(
  model: ReviewModel,
  patchState: string | null,
): ReviewCheck[] {
  const { run, review, uat, writes } = model;
  const checks: ReviewCheck[] = [
    {
      id: "run",
      label: "การรันของ agent",
      state:
        run.status === "completed"
          ? "passed"
          : run.status === "failed" || run.status === "canceled"
            ? "failed"
            : run.status === "running"
              ? "running"
              : "pending",
      detail: statusLabels[run.status] ?? run.status,
    },
  ];
  if (writes)
    checks.push({
      id: "patch",
      label: "คุณตรวจและนำ patch ไปใช้",
      state:
        patchState === "applied"
          ? "passed"
          : patchState === "rolled_back"
            ? "failed"
            : patchState === "applying"
              ? "running"
              : "pending",
      detail:
        patchState === "applied"
          ? "นำไปใช้แล้ว"
          : patchState === "rolled_back"
            ? "ย้อนกลับแล้ว"
            : patchState === "staged"
              ? "รอคุณตรวจ"
              : patchState === "applying"
                ? "กำลังเขียนไฟล์"
                : "ยังไม่มี patch",
    });
  if (review && review.id !== model.task?.id)
    checks.push({
      id: "review",
      label: "ตรวจโดย SCOUT",
      state: taskState(review.status),
      detail: statusLabels[review.status] ?? review.status,
    });
  if (uat)
    checks.push({
      id: "uat",
      label: "UAT โดยคุณ",
      state: taskState(uat.status),
      detail: statusLabels[uat.status] ?? uat.status,
    });
  return checks;
}
