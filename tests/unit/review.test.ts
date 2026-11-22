import { describe, it, expect } from "vitest";
import type { Agent, QueueTask, Snapshot } from "../../packages/shared/src";
import agents from "../../packages/shared/default-agents.json";
import { diffStats, reviewChecks, reviewModel } from "../../apps/desktop/src/review";

const steps = [
  ["implement", "forge", "claude"],
  ["review", "scout", "codex"],
  ["uat", "scout", "codex"],
] as const;
function task(i: number, status: string, lastExecutionId: string | null = null): QueueTask {
  const [step, agentId, adapter] = steps[i];
  return {
    id: `t${i}`,
    projectId: "p",
    agentId,
    adapter,
    title: step,
    prompt: "",
    dependencies: [],
    priority: 1,
    timeoutSeconds: 60,
    retryLimit: 2,
    attempts: 1,
    status,
    workflowId: "wf1",
    step,
    gate: step === "uat",
    approved: false,
    createdAt: `2026-11-18T00:00:0${i}Z`,
    lastExecutionId,
    blocker: null,
  };
}
function snapshot(tasks: QueueTask[], runStatus = "completed"): Snapshot {
  return {
    agents: agents as Agent[],
    projects: [
      { id: "p", name: "P", goal: "", path: "X", isGit: true, createdAt: "" },
    ],
    executions: [
      {
        id: "e1",
        taskId: "t0",
        projectId: "p",
        agentId: "forge",
        adapter: "claude",
        prompt: "",
        status: runStatus,
        createdAt: "",
        finishedAt: null,
        error: null,
        pid: null,
        sessionId: null,
      },
    ],
    tasks,
    workflows: [
      {
        id: "wf1",
        projectId: "p",
        objective: "Build page",
        status: "active",
        createdAt: "",
        reworkCount: 0,
      },
    ],
    dataPath: "X",
    remoteStatus: "not_configured",
  };
}

describe("review model", () => {
  it("links an execution to its task, workflow and later checks", () => {
    const model = reviewModel(
      snapshot([task(0, "needs_review"), task(1, "blocked"), task(2, "draft")]),
      "e1",
    )!;
    expect(model.task?.id).toBe("t0");
    expect(model.workflow?.objective).toBe("Build page");
    expect(model.label).toBe("พัฒนา");
    expect(model.step).toBe(1);
    expect(model.total).toBe(3);
    expect(model.writes).toBe(true);
    expect(reviewModel(snapshot([]), "missing")).toBeNull();
  });
  it("builds checks only from recorded state", () => {
    const model = reviewModel(
      snapshot([task(0, "needs_review"), task(1, "completed"), task(2, "ready")]),
      "e1",
    )!;
    expect(reviewChecks(model, "staged")).toEqual([
      expect.objectContaining({ id: "run", state: "passed" }),
      expect.objectContaining({ id: "patch", state: "pending", detail: "รอคุณตรวจ" }),
      expect.objectContaining({ id: "review", state: "passed" }),
      expect.objectContaining({ id: "uat", state: "pending" }),
    ]);
    const failed = reviewModel(snapshot([task(0, "failed")], "failed"), "e1")!;
    expect(reviewChecks(failed, null).map((c) => [c.id, c.state])).toEqual([
      ["run", "failed"],
      ["patch", "pending"],
    ]);
  });
  it("counts added and removed lines", () => {
    expect(diffStats("a\nb\n", "a\nc\nd\n")).toEqual({ adds: 2, removes: 1 });
    expect(diffStats(null, "x\n")).toEqual({ adds: 1, removes: 0 });
  });
});
