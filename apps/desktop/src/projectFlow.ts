import type {
  Execution,
  Project,
  QueueTask,
  TaskEvent,
} from "../../../packages/shared/src";

export type SessionAgent = "claude" | "codex" | "antigravity";

export interface AgentSession {
  agent: SessionAgent;
  id: string;
  title: string;
  cwd: string | null;
  updatedAt: string;
  projectId: string | null;
  link: "auto" | "manual" | null;
}

export interface Commit {
  projectId: string;
  hash: string;
  author: string;
  at: string;
  subject: string;
}

export interface Overview {
  since: string;
  sessions: AgentSession[];
  commits: Commit[];
  events: TaskEvent[];
}

export const sessionAgents: { id: SessionAgent; name: string }[] = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "antigravity", name: "Antigravity" },
];

/** Workflow steps that count as the project's audit (review by agent, UAT by owner). */
export const auditSteps = ["review", "uat"];

export function auditOf(tasks: QueueTask[]) {
  const audit = tasks.filter((task) => auditSteps.includes(task.step));
  return {
    tasks: audit,
    passed: audit.filter((t) => t.status === "completed").length,
    failed: audit.filter((t) => t.status === "failed").length,
    waiting: audit.filter((t) =>
      [
        "needs_review",
        "blocked",
        "draft",
        "ready",
        "queued",
        "running",
      ].includes(t.status),
    ).length,
  };
}

/** Runtimes linked to a project: Astra ran them there, or a linked agent session exists. */
export function runtimesFor(
  project: Project,
  tasks: QueueTask[],
  executions: Execution[],
  sessions: AgentSession[],
): string[] {
  const used = new Set<string>();
  for (const t of tasks) if (t.projectId === project.id) used.add(t.adapter);
  for (const e of executions)
    if (e.projectId === project.id) used.add(e.adapter);
  for (const s of sessions) if (s.projectId === project.id) used.add(s.agent);
  return [...used];
}

export type TimelineKind = "task" | "run" | "commit" | "session";

export interface TimelineItem {
  at: string;
  kind: TimelineKind;
  projectId: string | null;
  title: string;
  detail: string;
}

/** Local calendar day key (YYYY-MM-DD) so items group by the user's day, not UTC. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildTimeline(
  overview: Overview,
  tasks: QueueTask[],
  executions: Execution[],
  projectId: string | null,
): { day: string; items: TimelineItem[] }[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const items: TimelineItem[] = [
    ...overview.events.map((e) => {
      const task = taskById.get(e.taskId);
      return {
        at: e.createdAt,
        kind: "task" as const,
        projectId: task?.projectId ?? null,
        title: task?.title ?? e.taskId,
        detail: `${e.kind}${e.text ? ` · ${e.text}` : ""}`,
      };
    }),
    ...executions
      .filter((e) => e.createdAt >= overview.since)
      .map((e) => ({
        at: e.createdAt,
        kind: "run" as const,
        projectId: e.projectId,
        title: `${e.agentId.toUpperCase()} · ${e.adapter}`,
        detail: `${e.status} · ${e.prompt.slice(0, 120)}`,
      })),
    ...overview.commits.map((c) => ({
      at: c.at,
      kind: "commit" as const,
      projectId: c.projectId,
      title: c.subject,
      detail: `${c.hash.slice(0, 7)} · ${c.author}`,
    })),
    ...overview.sessions
      .filter((s) => s.projectId)
      .map((s) => ({
        at: s.updatedAt,
        kind: "session" as const,
        projectId: s.projectId,
        title: s.title || s.id,
        detail: sessionAgents.find((a) => a.id === s.agent)?.name ?? s.agent,
      })),
  ].filter((item) => !projectId || item.projectId === projectId);
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const days = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const key = dayKey(item.at);
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  return [...days].map(([day, list]) => ({ day, items: list }));
}
