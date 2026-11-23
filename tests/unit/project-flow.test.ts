import { describe, expect, it } from "vitest";
import type { Execution, Project, QueueTask } from "../../packages/shared/src";
import {
  auditOf,
  buildTimeline,
  dayKey,
  runtimesFor,
  type Overview,
} from "../../apps/desktop/src/projectFlow";

const task = (over: Partial<QueueTask>): QueueTask =>
  ({
    id: "t",
    projectId: "p1",
    adapter: "codex",
    step: "task",
    status: "draft",
    title: "T",
    ...over,
  }) as QueueTask;
const project = { id: "p1", name: "P" } as Project;

describe("project flow", () => {
  it("counts only review/uat steps as audit", () => {
    const audit = auditOf([
      task({ id: "a", step: "review", status: "completed" }),
      task({ id: "b", step: "uat", status: "needs_review" }),
      task({ id: "c", step: "review", status: "failed" }),
      task({ id: "d", step: "implement", status: "failed" }),
    ]);
    expect([
      audit.tasks.length,
      audit.passed,
      audit.failed,
      audit.waiting,
    ]).toEqual([3, 1, 1, 1]);
  });

  it("links runtimes from tasks, runs and linked sessions", () => {
    const runs = [{ projectId: "p1", adapter: "mock" }] as Execution[];
    const sessions = [
      { agent: "antigravity", projectId: "p1" },
      { agent: "claude", projectId: "other" },
    ] as Overview["sessions"];
    expect(runtimesFor(project, [task({})], runs, sessions).sort()).toEqual([
      "antigravity",
      "codex",
      "mock",
    ]);
  });

  it("groups all sources by local day, newest first, and filters by project", () => {
    const overview: Overview = {
      since: "2026-11-01T00:00:00Z",
      events: [
        {
          id: 1,
          taskId: "t",
          kind: "approved",
          text: "",
          createdAt: "2026-11-20T10:00:00Z",
          initiator: "owner",
        },
      ],
      commits: [
        {
          projectId: "p2",
          hash: "abcdef123",
          author: "A",
          at: "2026-11-21T09:00:00Z",
          subject: "fix",
        },
      ],
      sessions: [
        {
          agent: "claude",
          id: "s",
          title: "S",
          cwd: null,
          updatedAt: "2026-11-21T08:00:00Z",
          projectId: "p1",
          link: "auto",
        },
        {
          agent: "codex",
          id: "x",
          title: "X",
          cwd: null,
          updatedAt: "2026-11-21T08:00:00Z",
          projectId: null,
          link: null,
        },
      ],
    };
    const runs = [
      {
        id: "r",
        projectId: "p1",
        agentId: "astra",
        adapter: "mock",
        status: "completed",
        prompt: "go",
        createdAt: "2026-11-20T11:00:00Z",
      },
      {
        id: "old",
        projectId: "p1",
        agentId: "astra",
        adapter: "mock",
        status: "completed",
        prompt: "go",
        createdAt: "2026-10-01T11:00:00Z",
      },
    ] as Execution[];
    const all = buildTimeline(overview, [task({})], runs, null);
    expect(all.map((d) => d.day)).toEqual(
      [dayKey("2026-11-21T09:00:00Z"), dayKey("2026-11-20T11:00:00Z")].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
    );
    expect(all.flatMap((d) => d.items).map((i) => i.kind)).toEqual([
      "commit",
      "session",
      "run",
      "task",
    ]);
    const p1 = buildTimeline(overview, [task({})], runs, "p1").flatMap(
      (d) => d.items,
    );
    expect(p1.map((i) => i.kind)).toEqual(["session", "run", "task"]);
  });
});
