import { describe, it, expect } from "vitest";
import type { Agent, QueueTask, Snapshot } from "../../packages/shared/src";
import agents from "../../packages/shared/default-agents.json";
import { deskIcons, deskStats, flowStages } from "../../apps/desktop/src/desks";
import { stepOrder } from "../../apps/desktop/src/home/ceo";

const task = (id: string, agentId: string, status: string) =>
  ({ id, agentId, status }) as QueueTask;

describe("job desks", () => {
  it("follows the Core workflow order and staffs every agent", () => {
    // ขั้นใน Core: plan → plan_approval → architecture → design → implement → review → uat → summary
    expect(stepOrder).toEqual([
      "plan",
      "plan_approval",
      "architecture",
      "design",
      "implement",
      "review",
      "uat",
      "summary",
    ]);
    expect(flowStages.map((stage) => stage.agents)).toEqual([
      ["astra"],
      ["vector", "mira"],
      ["forge"],
      ["scout"],
      ["astra"],
    ]);
    // มีคนอนุมัติแผนและทำ UAT
    expect(flowStages.filter((stage) => stage.withYou).map((s) => s.id)).toEqual([
      "plan",
      "ship",
    ]);
    for (const agent of agents) expect(deskIcons[agent.id]).toBeDefined();
  });
  it("counts finished and open work per agent", () => {
    const data = {
      agents: agents as Agent[],
      tasks: [
        task("a", "forge", "completed"),
        task("b", "forge", "needs_review"),
        task("c", "forge", "running"),
        task("d", "forge", "blocked"),
        task("e", "scout", "completed"),
      ],
    } as Snapshot;
    expect(deskStats(data, "forge")).toEqual({ done: 1, open: 2 });
    expect(deskStats(data, "mira")).toEqual({ done: 0, open: 0 });
  });
});
