import { describe, it, expect } from "vitest";
import type { Agent, QueueTask, Snapshot } from "../../packages/shared/src";
import agents from "../../packages/shared/default-agents.json";
import {
  agentFocus,
  agentRunStats,
  groupByRole,
  jobDesks,
} from "../../apps/desktop/src/home/workspace";

const steps = [
  ["plan", "astra", false],
  ["plan_approval", "astra", true],
  ["architecture", "vector", false],
  ["design", "mira", false],
] as const;
function task(i: number, status: string): QueueTask {
  const [step, agentId, gate] = steps[i];
  return {
    id: `t${i}`,
    projectId: "p",
    agentId,
    adapter: "mock",
    title: step,
    prompt: "",
    dependencies: [],
    priority: 1,
    timeoutSeconds: 60,
    retryLimit: 2,
    attempts: 0,
    status,
    workflowId: "wf1",
    step,
    gate,
    approved: false,
    createdAt: `2026-11-18T00:00:0${i}Z`,
    lastExecutionId: null,
    blocker: null,
  };
}
function snapshot(tasks: QueueTask[], runs: string[] = []): Snapshot {
  return {
    agents: agents as Agent[],
    projects: [],
    executions: runs.map((status, i) => ({
      id: `e${i}`,
      projectId: "p",
      agentId: "vector",
      adapter: "mock",
      status,
      prompt: "",
      createdAt: "",
      startedAt: null,
      finishedAt: null,
      pid: null,
      error: null,
    })) as unknown as Snapshot["executions"],
    tasks,
    workflows: [],
    dataPath: "X",
    remoteStatus: "not_configured",
  };
}

describe("workspace helpers", () => {
  it("finds the task an agent holds and who handed it over", () => {
    const data = snapshot([
      task(0, "completed"),
      task(1, "completed"),
      task(2, "running"),
      task(3, "blocked"),
    ]);
    const focus = agentFocus(data, "vector");
    expect(focus?.task.id).toBe("t2");
    expect(focus?.step).toBe(3);
    expect(focus?.total).toBe(4);
    // ขั้นก่อนหน้าเป็น gate ของคน จึงส่งต่อมาจากคุณ
    expect(focus?.handedBy).toBe("คุณ");
    expect(agentFocus(data, "mira")?.handedBy).toBe("VECTOR");
    expect(agentFocus(data, "forge")).toBeNull();
  });
  it("prefers waiting work over completed history", () => {
    const focus = agentFocus(
      snapshot([task(0, "completed"), task(1, "ready")]),
      "astra",
    );
    expect(focus?.task.id).toBe("t1");
    expect(focus?.label).toBe("อนุมัติแผน");
  });
  it("groups agents by role and filters by name or role", () => {
    const all = groupByRole(agents as Agent[]);
    expect(all).toHaveLength(5);
    expect(all[0].members[0].id).toBe("astra");
    expect(
      groupByRole(agents as Agent[], "qa").map((g) => g.members[0].id),
    ).toEqual(["scout"]);
    expect(groupByRole(agents as Agent[], "forge")[0].role).toBe(
      "Software Engineering Lead",
    );
  });
  it("counts real executions per agent", () => {
    expect(
      agentRunStats(snapshot([], ["completed", "failed", "running"]), "vector"),
    ).toEqual({ total: 3, completed: 1, failed: 1 });
  });
  it("has a job desk for every roster agent", () => {
    for (const agent of agents) expect(jobDesks[agent.id]).toBeDefined();
  });
});
