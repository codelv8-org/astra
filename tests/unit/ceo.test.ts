import { describe, it, expect } from "vitest";
import type { QueueTask, Snapshot, Agent } from "../../packages/shared/src";
import agents from "../../packages/shared/default-agents.json";
import {
  changeReports,
  diffTasks,
  displayPath,
  isProgressQuery,
  progressOf,
  progressReport,
  sceneAgents,
  statusMap,
} from "../../apps/desktop/src/home/ceo";

const projectId = "1a484ea5-b267-455c-8c8f-21f18bf08656";
const steps = [
  ["plan", "astra"],
  ["plan_approval", "astra"],
  ["architecture", "vector"],
  ["design", "mira"],
] as const;
function task(i: number, status: string): QueueTask {
  const [step, agentId] = steps[i];
  return {
    id: `t${i}`,
    projectId,
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
    gate: step === "plan_approval",
    approved: false,
    createdAt: `2026-11-18T00:00:0${i}Z`,
    lastExecutionId: null,
    blocker: null,
  };
}
function snapshot(tasks: QueueTask[]): Snapshot {
  return {
    agents: agents as Agent[],
    projects: [
      {
        id: projectId,
        name: "UNIT",
        goal: "",
        path: "X",
        isGit: false,
        createdAt: "",
      },
    ],
    executions: [],
    tasks,
    workflows: [
      {
        id: "wf1",
        projectId,
        objective: "UNIT objective",
        status: "active",
        createdAt: "",
        reworkCount: 0,
      },
    ],
    schedulerPaused: false,
    dataPath: "UNIT",
    remoteStatus: "not_configured",
  };
}

describe("Home CEO reports", () => {
  it("computes progress and current step from persisted task states", () => {
    const tasks = [
      task(0, "completed"),
      task(1, "completed"),
      task(2, "running"),
      task(3, "draft"),
    ];
    const progress = progressOf(tasks);
    expect(progress).toMatchObject({
      total: 4,
      completed: 2,
      running: 1,
      percent: 50,
    });
    expect(progress.current?.id).toBe("t2");
  });
  it("reports only real status transitions and flags approval gates", () => {
    const before = [task(0, "running"), task(1, "draft")];
    const after = [task(0, "completed"), task(1, "ready")];
    const changes = diffTasks(statusMap(before), after);
    expect(changes).toHaveLength(2);
    const [report] = changeReports(changes, snapshot(after));
    expect(report.source).toBe("core");
    expect(report.link).toBe("queue");
    expect(report.text).toContain("วางแผน (ASTRA): กำลังทำ → เสร็จ");
    expect(diffTasks(statusMap(after), after)).toHaveLength(0);
  });
  it("skips initial dependency scheduling noise", () => {
    const changes = diffTasks(statusMap([task(0, "draft"), task(2, "draft")]), [
      task(0, "ready"),
      task(2, "blocked"),
    ]);
    const [report] = changeReports(
      changes,
      snapshot([task(0, "ready"), task(2, "blocked")]),
    );
    expect(report.text).toContain("วางแผน (ASTRA)");
    expect(report.text).not.toContain("สถาปัตยกรรม");
  });
  it("does not report brand-new tasks as transitions", () => {
    expect(
      changeReports(diffTasks({}, [task(0, "draft")]), snapshot([])),
    ).toHaveLength(0);
  });
  it("maps agents to 3D states from tasks", () => {
    const states = sceneAgents(
      snapshot([task(2, "running"), task(1, "ready")]),
    );
    expect(states.find((a) => a.id === "vector")?.status).toBe("working");
    expect(states.find((a) => a.id === "astra")?.status).toBe("waiting");
    expect(states.find((a) => a.id === "forge")?.status).toBe("idle");
    const blocked = sceneAgents(snapshot([task(3, "blocked")]));
    expect(blocked.find((a) => a.id === "mira")?.status).toBe("idle");
  });
  it("strips the Windows verbatim prefix for display", () => {
    expect(displayPath(String.raw`\\?\D:\work`)).toBe(String.raw`D:\work`);
    expect(displayPath(String.raw`D:\work`)).toBe(String.raw`D:\work`);
  });
  it("detects short progress questions and summarizes workflows", () => {
    expect(isProgressQuery("สถานะ")).toBe(true);
    expect(isProgressQuery("ขอรายงานความคืบหน้า")).toBe(true);
    expect(isProgressQuery("เพิ่มหน้าตั้งค่าโปรไฟล์")).toBe(false);
    expect(
      progressReport(
        snapshot([task(0, "completed"), task(1, "ready")]),
        projectId,
      ),
    ).toContain("1/2 (50%)");
  });
});
