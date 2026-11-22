import { describe, it, expect } from "vitest";
import type {
  QueueTask,
  Snapshot,
  Agent,
  ExecutionEvent,
} from "../../packages/shared/src";
import { readExecutionResult } from "../../apps/desktop/src/executionResult";
import agents from "../../packages/shared/default-agents.json";
import {
  agentResultCandidates,
  changeReports,
  chatApprovalLabel,
  diffTasks,
  displayPath,
  handoffRoute,
  handoffStatus,
  isProgressQuery,
  pendingChatApprovals,
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
  it("offers confirmations only for an active workflow's actionable tasks", () => {
    const active = new Set(["wf1"]);
    const waiting = task(0, "ready");
    expect(chatApprovalLabel(waiting, active)).toBe("ตรวจและอนุมัติ");
    expect(chatApprovalLabel(waiting, new Set())).toBeNull();
    expect(
      chatApprovalLabel({ ...waiting, approved: true }, active),
    ).toBeNull();
    expect(chatApprovalLabel(task(2, "blocked"), active)).toBeNull();
    expect(chatApprovalLabel(task(1, "ready"), active)).toBe("ยืนยันแผน");
    expect(
      chatApprovalLabel({ ...task(1, "ready"), step: "uat" }, active),
    ).toBe("ยืนยัน UAT");
    expect(
      chatApprovalLabel({ ...task(2, "needs_review"), step: "review" }, active),
    ).toBe("ตรวจและยืนยันผล");
    expect(
      chatApprovalLabel(
        { ...waiting, step: "implement", agentId: "forge", adapter: "claude" },
        active,
      ),
    ).toBe("ตรวจขอบเขตและอนุมัติ");
    expect(
      chatApprovalLabel(
        {
          ...waiting,
          status: "needs_review",
          step: "implement",
          agentId: "forge",
          adapter: "claude",
        },
        active,
      ),
    ).toBe("ตรวจและยืนยัน patch");
  });
  it("lists ready tasks only for the selected project and removes them after queueing", () => {
    const other = { ...task(1, "ready"), projectId: "other", workflowId: null };
    const first = task(0, "ready");
    const active = new Set(["wf1"]);
    expect(
      pendingChatApprovals(
        [first, task(2, "blocked"), other],
        projectId,
        active,
      ),
    ).toEqual([{ task: first, label: "ตรวจและอนุมัติ" }]);
    expect(
      pendingChatApprovals(
        [{ ...first, status: "queued", approved: true }, other],
        projectId,
        active,
      ),
    ).toEqual([]);
  });
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
  it("shows the actual handoff through human approval without implying work started", () => {
    const plan = task(0, "completed");
    const approval = { ...task(1, "ready"), dependencies: [plan.id] };
    const architecture = {
      ...task(2, "blocked"),
      dependencies: [approval.id],
      blocker: "Waiting for dependencies / human gates",
    };
    const data = snapshot([plan, approval, architecture]);
    const byId = new Map(data.tasks?.map((item) => [item.id, item]));
    expect(handoffRoute(architecture, byId, data.agents)).toBe(
      "ASTRA → ผู้อนุมัติ → VECTOR",
    );
    expect(handoffStatus(architecture)).toBe("รอขั้นก่อนหน้า");
    const running = { ...architecture, status: "running", blocker: null };
    expect(
      changeReports(diffTasks(statusMap([architecture]), [running]), data),
    ).toMatchObject([
      {
        from: "agent",
        agentId: "vector",
        source: "core",
        text: expect.stringContaining("กำลังทำ"),
      },
    ]);
  });
  it("reads the latest runtime artifact for a non-CEO agent awaiting review", async () => {
    const architecture = { ...task(2, "needs_review"), lastExecutionId: "run" };
    const data = snapshot([architecture]);
    data.executions = [
      {
        id: "run",
        taskId: architecture.id,
        agentId: "vector",
        projectId,
        adapter: "codex",
        status: "completed",
        prompt: "",
        createdAt: "",
        finishedAt: "",
        error: null,
        pid: null,
        sessionId: null,
      },
    ];
    expect(agentResultCandidates(data, new Set())).toMatchObject([
      { task: { agentId: "vector" } },
    ]);
    expect(agentResultCandidates(data, new Set(["run"]))).toEqual([]);
    data.executions[0].status = "failed";
    expect(agentResultCandidates(data, new Set())).toEqual([]);
    const event = (id: number, kind: string): ExecutionEvent => ({
      id,
      kind,
      executionId: "run",
      text: kind,
      createdAt: "",
    });
    const oldPage = Array.from({ length: 500 }, (_, index) =>
      event(index + 1, "stdout"),
    );
    oldPage[0] = event(1, "artifact");
    const artifact = event(501, "artifact");
    const cursors: number[] = [];
    expect(
      await readExecutionResult(async (after) => {
        cursors.push(after);
        return after === 0 ? oldPage : [artifact, event(502, "stderr")];
      }),
    ).toEqual(artifact);
    expect(cursors).toEqual([0, 500]);
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
