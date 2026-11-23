import { useEffect, useMemo, useState } from "react";
import type {
  Diagnostic,
  Project,
  Snapshot,
} from "../../../packages/shared/src";
import { Modal } from "../../../packages/ui/src/Modal";
import { bridge } from "./bridge";
import { ExecutionResultView } from "./ExecutionResultView";
import { connectorCatalog, connectorStatus } from "./runtimeCatalog";
import {
  auditOf,
  buildTimeline,
  runtimesFor,
  sessionAgents,
  type AgentSession,
  type Overview,
  type TimelineKind,
} from "./projectFlow";
import "./projects-overview.css";

type NodeKind = "runtime" | "project" | "agents" | "git" | "audit" | "result";
type Selected = { kind: NodeKind; id: string } | null;

// Fixed geometry: nodes are absolutely placed with the same numbers the SVG lines use.
const LANE = 132;
const COL = { runtime: 0, project: 20, agents: 40, audit: 60, result: 80 };
const W = 16;
const RUNTIME_H = 52;

const emptyOverview: Overview = {
  since: "",
  sessions: [],
  commits: [],
  events: [],
};
const kindLabels: Record<TimelineKind, string> = {
  task: "งาน",
  run: "รัน",
  commit: "Commit",
  session: "Agent session",
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
const agentName = (id: string) =>
  sessionAgents.find((a) => a.id === id)?.name ?? id;

function curve(x1: number, y1: number, x2: number, y2: number) {
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

/** หน้า Projects: Node Flow ของทุกโปรเจกต์ + Timeline รายวัน */
export function ProjectsOverview({
  data,
  diagnostics,
  native,
}: {
  data: Snapshot;
  diagnostics: Diagnostic[];
  native: boolean;
}) {
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Selected>(null);
  const [filter, setFilter] = useState<string>("");
  const [result, setResult] = useState<{
    executionId: string;
    projectId: string;
  } | null>(null);
  const tasks = useMemo(() => data.tasks ?? [], [data.tasks]);
  const projectCount = data.projects.length;

  useEffect(() => {
    if (!native) return;
    let live = true;
    setLoading(true);
    bridge
      .projectOverview(days)
      .then((next) => live && (setOverview(next), setError("")))
      .catch((e: unknown) => live && setError(String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [native, days, reload, projectCount]);

  const projects = data.projects;
  const runtimes = connectorCatalog;
  const height = Math.max(projects.length * LANE, runtimes.length * 64, LANE);
  const runtimeY = (i: number) => (height / runtimes.length) * (i + 0.5);
  const laneY = (i: number) => i * LANE + LANE / 2;

  const lines: string[] = [];
  projects.forEach((project, i) => {
    const y = laneY(i);
    for (const adapter of runtimesFor(
      project,
      tasks,
      data.executions,
      overview.sessions,
    )) {
      const r = runtimes.findIndex((item) => item.adapter === adapter);
      if (r >= 0)
        lines.push(curve(COL.runtime + W, runtimeY(r), COL.project, y));
    }
    lines.push(
      curve(COL.project + W, y, COL.agents, y - 30),
      curve(COL.project + W, y, COL.agents, y + 30),
      curve(COL.agents + W, y - 30, COL.audit, y),
      curve(COL.agents + W, y + 30, COL.audit, y),
      curve(COL.audit + W, y, COL.result, y),
    );
  });

  const isSelected = (kind: NodeKind, id: string) =>
    selected?.kind === kind && selected.id === id;
  const node = (
    kind: NodeKind,
    id: string,
    left: number,
    top: number,
    h: number,
    label: string,
    body: React.ReactNode,
    tone = "",
  ) => (
    <button
      key={`${kind}-${id}`}
      type="button"
      className={`flow-node ${tone}`}
      style={{ left: `${left}%`, top, width: `${W}%`, height: h }}
      aria-pressed={isSelected(kind, id)}
      onClick={() => setSelected(isSelected(kind, id) ? null : { kind, id })}
    >
      <span className="flow-node-kind">{label}</span>
      {body}
    </button>
  );

  const timeline = useMemo(
    () => buildTimeline(overview, tasks, data.executions, filter || null),
    [overview, tasks, data.executions, filter],
  );

  async function link(session: AgentSession, projectId: string | null) {
    try {
      await bridge.linkSession(session.agent, session.id, projectId);
      setReload((n) => n + 1);
    } catch (e) {
      setError(String(e));
    }
  }

  const project = (id: string) => projects.find((p) => p.id === id);

  function panel() {
    if (!selected) return <p className="hint">เลือก node เพื่อดูรายละเอียด</p>;
    const p: Project | undefined = project(selected.id);
    if (selected.kind === "runtime") {
      const item = runtimes.find((r) => r.adapter === selected.id);
      const diagnostic = diagnostics.find((d) => d.adapter === selected.id);
      return (
        <>
          <h3>{item?.name}</h3>
          <p>{connectorStatus(diagnostic).label}</p>
          <p className="hint">{diagnostic?.message ?? item?.description}</p>
        </>
      );
    }
    if (!p) return null;
    const sessions = overview.sessions.filter((s) => s.projectId === p.id);
    if (selected.kind === "project")
      return (
        <>
          <h3>{p.name}</h3>
          <p>{p.goal || "ยังไม่ได้กำหนด objective"}</p>
          <ul className="flow-list">
            {(p.folders ?? []).map((f) => (
              <li key={f.id}>
                <code className="path">{f.path.replace(/^\\\\\?\\/, "")}</code>
                {f.isGit && <span className="chip">Git</span>}
              </li>
            ))}
          </ul>
        </>
      );
    if (selected.kind === "agents") {
      const others = overview.sessions
        .filter((s) => s.projectId !== p.id)
        .slice(0, 30);
      return (
        <>
          <h3>Agent sessions · {p.name}</h3>
          {!native && (
            <p className="hint">
              ต้องเปิด Astra Desktop เพื่อสแกนประวัติ agent
            </p>
          )}
          <ul className="flow-list">
            {sessions.map((s) => (
              <li key={`${s.agent}-${s.id}`}>
                <strong>{s.title || s.id}</strong>
                <span className="hint">
                  {agentName(s.agent)} · {when(s.updatedAt)} ·{" "}
                  {s.link === "manual" ? "ผูกเอง" : "ตรงตาม path"}
                </span>
                {s.link === "manual" && (
                  <button type="button" onClick={() => void link(s, null)}>
                    ยกเลิกการผูก
                  </button>
                )}
              </li>
            ))}
            {!sessions.length && (
              <li className="hint">ยังไม่มี session ที่ผูกกับโปรเจกต์นี้</li>
            )}
          </ul>
          {others.length > 0 && (
            <>
              <h4>ผูก session อื่นเข้าโปรเจกต์นี้</h4>
              <ul className="flow-list">
                {others.map((s) => (
                  <li key={`${s.agent}-${s.id}`}>
                    <strong>{s.title || s.id}</strong>
                    <span className="hint">
                      {agentName(s.agent)} · {when(s.updatedAt)}
                      {s.projectId
                        ? ` · อยู่ใน ${project(s.projectId)?.name ?? "โปรเจกต์อื่น"}`
                        : ""}
                    </span>
                    <button type="button" onClick={() => void link(s, p.id)}>
                      ผูกกับ {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      );
    }
    if (selected.kind === "git") {
      const commits = overview.commits.filter((c) => c.projectId === p.id);
      const isGit = (p.folders ?? []).some((f) => f.isGit) || p.isGit;
      return (
        <>
          <h3>Git · {p.name}</h3>
          {!isGit && (
            <p className="hint">ไม่พบ Git repo ใน folder ของโปรเจกต์</p>
          )}
          <ul className="flow-list">
            {commits.slice(0, 30).map((c) => (
              <li key={c.hash}>
                <strong>{c.subject}</strong>
                <span className="hint">
                  <code>{c.hash.slice(0, 7)}</code> · {c.author} · {when(c.at)}
                </span>
              </li>
            ))}
            {isGit && !commits.length && (
              <li className="hint">ไม่มี commit ในช่วงนี้</li>
            )}
          </ul>
        </>
      );
    }
    if (selected.kind === "audit") {
      const audit = auditOf(tasks.filter((t) => t.projectId === p.id));
      return (
        <>
          <h3>Audit · {p.name}</h3>
          <p className="hint">ขั้น review (agent) และ UAT (คุณ) ของ workflow</p>
          <ul className="flow-list">
            {audit.tasks.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong>
                <span className={`flow-status ${t.status}`}>{t.status}</span>
              </li>
            ))}
            {!audit.tasks.length && (
              <li className="hint">ยังไม่มีขั้น audit</li>
            )}
          </ul>
        </>
      );
    }
    const runs = data.executions
      .filter((e) => e.projectId === p.id)
      .slice(0, 10);
    const commits = overview.commits
      .filter((c) => c.projectId === p.id)
      .slice(0, 10);
    return (
      <>
        <h3>Result · {p.name}</h3>
        <h4>ผลการรันล่าสุด</h4>
        <ul className="flow-list">
          {runs.map((run) => (
            <li key={run.id}>
              <strong>
                {run.agentId.toUpperCase()} ·{" "}
                <span className={`flow-status ${run.status}`}>
                  {run.status}
                </span>
              </strong>
              <span className="hint">{when(run.createdAt)}</span>
              <button
                type="button"
                onClick={() =>
                  setResult({ executionId: run.id, projectId: p.id })
                }
              >
                ดูผล
              </button>
            </li>
          ))}
          {!runs.length && <li className="hint">ยังไม่มีการรัน</li>}
        </ul>
        <h4>Commit ล่าสุด</h4>
        <ul className="flow-list">
          {commits.map((c) => (
            <li key={c.hash}>
              <strong>{c.subject}</strong>
              <span className="hint">
                <code>{c.hash.slice(0, 7)}</code> · {when(c.at)}
              </span>
            </li>
          ))}
          {!commits.length && <li className="hint">ไม่มี commit ในช่วงนี้</li>}
        </ul>
      </>
    );
  }

  return (
    <div className="projects-overview span-12">
      <section className="tile">
        <div className="tile-head">
          <div>
            <h2>Project flow</h2>
            <p>
              Agent → Project → Agent project / Git → Audit → Result
              {loading ? " · กำลังสแกน…" : ""}
            </p>
          </div>
          {native && (
            <button type="button" onClick={() => setReload((n) => n + 1)}>
              สแกนใหม่
            </button>
          )}
        </div>
        {error && (
          <p className="hint flow-error" role="alert">
            {error}
          </p>
        )}
        {!native && (
          <p className="hint">
            Browser preview ไม่มี Desktop Core · session ของ agent และ Git
            จะแสดงใน Astra Desktop
          </p>
        )}
        {projects.length ? (
          <div className="flow-layout">
            <div className="flow-scroll">
              <div
                className="flow-canvas"
                style={{ height }}
                aria-label="Project flow"
              >
                <svg
                  className="flow-lines"
                  viewBox={`0 0 100 ${height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {lines.map((d, i) => (
                    <path key={i} d={d} vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
                {runtimes.map((r, i) => {
                  const status = connectorStatus(
                    diagnostics.find((d) => d.adapter === r.adapter),
                  );
                  return node(
                    "runtime",
                    r.adapter,
                    COL.runtime,
                    runtimeY(i) - RUNTIME_H / 2,
                    RUNTIME_H,
                    "Agent",
                    <span className="flow-node-title">
                      <span
                        className="flow-dot"
                        data-tone={status.tone}
                        aria-hidden="true"
                      />
                      {r.name}
                    </span>,
                  );
                })}
                {projects.map((p, i) => {
                  const top = i * LANE;
                  const own = overview.sessions.filter(
                    (s) => s.projectId === p.id,
                  );
                  const counts = sessionAgents
                    .map(
                      (a) =>
                        [
                          a.name,
                          own.filter((s) => s.agent === a.id).length,
                        ] as const,
                    )
                    .filter(([, n]) => n);
                  const commits = overview.commits.filter(
                    (c) => c.projectId === p.id,
                  ).length;
                  const isGit =
                    (p.folders ?? []).some((f) => f.isGit) || p.isGit;
                  const audit = auditOf(
                    tasks.filter((t) => t.projectId === p.id),
                  );
                  const latest = data.executions.find(
                    (e) => e.projectId === p.id,
                  );
                  return [
                    node(
                      "project",
                      p.id,
                      COL.project,
                      top + 22,
                      88,
                      "Project",
                      <>
                        <span className="flow-node-title">{p.name}</span>
                        <span className="flow-node-detail">
                          {p.goal || "ยังไม่ได้กำหนด objective"}
                        </span>
                      </>,
                    ),
                    node(
                      "agents",
                      p.id,
                      COL.agents,
                      top + 6,
                      54,
                      "Agent project",
                      <span className="flow-node-detail">
                        {counts.length
                          ? counts.map(([n, c]) => `${n} ${c}`).join(" · ")
                          : "ยังไม่มี session"}
                      </span>,
                    ),
                    node(
                      "git",
                      p.id,
                      COL.agents,
                      top + 72,
                      54,
                      "Git repo",
                      <span className="flow-node-detail">
                        {isGit
                          ? `${commits} commit · ${days} วัน`
                          : "ไม่พบ Git"}
                      </span>,
                      isGit ? "" : "muted",
                    ),
                    node(
                      "audit",
                      p.id,
                      COL.audit,
                      top + 22,
                      88,
                      "Audit",
                      <span className="flow-node-detail">
                        {audit.tasks.length
                          ? `ผ่าน ${audit.passed} · ไม่ผ่าน ${audit.failed} · รอ ${audit.waiting}`
                          : "ยังไม่มีขั้น audit"}
                      </span>,
                      audit.failed
                        ? "bad"
                        : audit.waiting
                          ? "wait"
                          : audit.passed
                            ? "ok"
                            : "",
                    ),
                    node(
                      "result",
                      p.id,
                      COL.result,
                      top + 22,
                      88,
                      "Result",
                      <span className="flow-node-detail">
                        {latest
                          ? `รันล่าสุด ${latest.status}`
                          : "ยังไม่มีการรัน"}{" "}
                        · {commits} commit
                      </span>,
                    ),
                  ];
                })}
              </div>
            </div>
            <aside className="flow-panel" aria-live="polite">
              {panel()}
            </aside>
          </div>
        ) : (
          <p className="hint">เพิ่มโปรเจกต์เพื่อดู flow</p>
        )}
      </section>

      <section className="tile">
        <div className="tile-head">
          <div>
            <h2>Timeline</h2>
            <p>แต่ละวันทำอะไรไปบ้าง · {days} วันล่าสุด</p>
          </div>
          <label className="inline-select">
            โปรเจกต์
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">ทุกโปรเจกต์</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {timeline.length ? (
          <ol className="timeline">
            {timeline.map(({ day, items }) => (
              <li key={day}>
                <h3>
                  {new Date(`${day}T00:00:00`).toLocaleDateString("th-TH", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  <span className="hint"> · {items.length} รายการ</span>
                </h3>
                <ul>
                  {items.map((item, i) => (
                    <li key={i} className={`timeline-item ${item.kind}`}>
                      <time dateTime={item.at}>{time(item.at)}</time>
                      <span className="chip">{kindLabels[item.kind]}</span>
                      <span className="timeline-text">
                        <strong>{item.title}</strong>
                        <span className="hint">
                          {item.projectId && !filter
                            ? `${project(item.projectId)?.name ?? ""} · `
                            : ""}
                          {item.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <p className="hint">ยังไม่มีกิจกรรมในช่วงนี้</p>
        )}
        <button type="button" onClick={() => setDays((d) => d + 7)}>
          โหลดย้อนหลังอีก 7 วัน
        </button>
      </section>

      {result && (
        <Modal title="ผลการรันที่บันทึกไว้" onClose={() => setResult(null)}>
          <ExecutionResultView {...result} agents={data.agents} />
        </Modal>
      )}
    </div>
  );
}
