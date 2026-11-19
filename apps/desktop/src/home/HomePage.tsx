import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Agent, Snapshot } from "../../../../packages/shared/src";
import { bridge } from "../bridge";
import "./home.css";
import type { OfficeScene, SceneAgent } from "./OfficeScene";
import {
  acceptedReport,
  agentName,
  astraResultCandidates,
  changeReports,
  clip,
  diffTasks,
  displayPath,
  isProgressQuery,
  progressOf,
  progressReport,
  sceneAgents,
  sortTasks,
  statusLabels,
  statusMap,
  stepLabels,
  type ChatMessage,
  type StatusMap,
} from "./ceo";

const storageKey = "crewnest-ceo-chat-v1";
interface Stored {
  messages: ChatMessage[];
  baseline: StatusMap | null;
  seen: string[];
}
function load(): Stored {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (value && Array.isArray(value.messages)) return value as Stored;
  } catch {
    /* storage ใช้ไม่ได้ เริ่มใหม่ */
  }
  return { messages: [], baseline: null, seen: [] };
}
function save(value: Stored) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...value,
        messages: value.messages.slice(-200),
        seen: value.seen.slice(-200),
      }),
    );
  } catch {
    /* ไม่บังคับ */
  }
}
const id = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const time = (value: string) =>
  new Date(value).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
const statusTone: Record<string, string> = {
  completed: "ok",
  running: "run",
  failed: "bad",
  blocked: "bad",
  ready: "wait",
  needs_review: "wait",
  draft: "wait",
  queued: "run",
};

export function HomePage({
  data,
  native,
  theme,
  onToggleTheme,
  onOpenConsole,
  onSelectAgent,
  onAddProject,
  onRefresh,
}: {
  data: Snapshot;
  native: boolean;
  theme: string;
  onToggleTheme: () => void;
  onOpenConsole: (anchor?: string) => void;
  onSelectAgent: (agent: Agent) => void;
  onAddProject: () => void;
  onRefresh: () => Promise<void>;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<OfficeScene | null>(null);
  const [webgl] = useState(() => {
    try {
      return Boolean(
        window.WebGL2RenderingContext &&
        document.createElement("canvas").getContext("webgl2"),
      );
    } catch {
      return false;
    }
  });
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const statesRef = useRef<SceneAgent[]>([]);
  const reduced = useMemo(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );
  const agentsRef = useRef(data.agents);
  agentsRef.current = data.agents;

  const [selected, setSelected] = useState<string | null>(null);
  const [chatProject, setChatProject] = useState("");
  const [stored, setStored] = useState<Stored>(load);
  const [draft, setDraft] = useState("");
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const log = useRef<HTMLOListElement>(null);
  const loaded = native && Boolean(data.dataPath);
  const tasks = useMemo(() => data.tasks ?? [], [data.tasks]);
  const workflows = useMemo(() => data.workflows ?? [], [data.workflows]);

  // ---- 3D scene (โหลด three.js แบบ lazy เพื่อให้ Console เปิดได้เร็ว) ----
  useEffect(() => {
    if (!webgl || !stage.current) return;
    let instance: OfficeScene | null = null;
    let cancelled = false;
    void import("./OfficeScene").then(({ OfficeScene }) => {
      if (cancelled || !stage.current) return;
      instance = new OfficeScene(stage.current, {
        theme: themeRef.current === "light" ? "light" : "dark",
        reducedMotion: reduced,
        onSelect: (agentId) => {
          const agent = agentsRef.current.find((item) => item.id === agentId);
          if (agent) onSelectAgent(agent);
        },
      });
      instance.setAgents(statesRef.current);
      scene.current = instance;
    });
    return () => {
      cancelled = true;
      instance?.dispose();
      scene.current = null;
    };
  }, [webgl]);
  useEffect(
    () => scene.current?.setTheme(theme === "light" ? "light" : "dark"),
    [theme],
  );
  const agentStates = useMemo(() => sceneAgents(data), [data]);
  statesRef.current = agentStates;
  useEffect(() => scene.current?.setAgents(agentStates), [agentStates]);

  // ---- CEO chat: ติดตามการเปลี่ยนสถานะจริงจาก Core ----
  function append(
    list: Omit<ChatMessage, "id" | "at">[],
    patch?: Partial<Stored>,
  ) {
    setStored((previous) => {
      const next = {
        ...previous,
        ...patch,
        messages: [
          ...previous.messages,
          ...list.map((message) => ({
            ...message,
            id: id(),
            at: new Date().toISOString(),
          })),
        ],
      };
      save(next);
      return next;
    });
  }
  const storedRef = useRef(stored);
  storedRef.current = stored;
  useEffect(() => {
    if (!loaded) return;
    const current = storedRef.current;
    if (!current.baseline) {
      // ครั้งแรก: จำสถานะปัจจุบันเป็นจุดตั้งต้น ไม่ย้อนรายงานประวัติทั้งหมด
      const seen = (data.tasks ?? [])
        .map((task) => task.lastExecutionId)
        .filter((value): value is string => Boolean(value));
      append(
        [
          {
            from: "ceo",
            source: "core",
            text: `สวัสดีครับ ผม ASTRA หัวหน้าทีม CrewBots\nพิมพ์เป้าหมายงานแล้วเลือกโปรเจกต์ ผมจะแตกงานเป็นแผนให้คุณอนุมัติ และรายงานทุกครั้งที่สถานะเปลี่ยน\n\n${progressReport(data, null)}`,
          },
        ],
        { baseline: statusMap(tasks), seen },
      );
      return;
    }
    const changes = diffTasks(current.baseline, tasks);
    if (changes.length)
      append(changeReports(changes, data), { baseline: statusMap(tasks) });
    // ผลจริงของ ASTRA (plan/summary) จาก execution event ชนิด result
    const seen = new Set(current.seen);
    const candidates = astraResultCandidates(data, seen);
    if (!candidates.length) return;
    candidates.forEach(({ execution }) => seen.add(execution.id));
    setStored((previous) => ({ ...previous, seen: [...seen] }));
    void Promise.all(
      candidates.map(async ({ task, execution }) => {
        const events = await bridge.events(execution.id, 0).catch(() => []);
        const result = [...events]
          .reverse()
          .find((event) => event.kind === "result");
        if (!result?.text) return null;
        const mockRun = execution.adapter === "mock";
        return {
          from: "ceo" as const,
          source: mockRun ? ("mock" as const) : ("model" as const),
          runtime: mockRun
            ? "MOCK · ไม่มี AI model"
            : execution.adapter.toUpperCase(),
          projectId: task.projectId,
          workflowId: task.workflowId ?? undefined,
          text: `${stepLabels[task.step] ?? task.title}:\n${clip(result.text, 1800)}`,
        };
      }),
    ).then((messages) =>
      append(
        messages.filter((item) => item !== null),
        { seen: [...seen] },
      ),
    );
  }, [loaded, tasks]);

  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [stored.messages.length]);
  useEffect(() => {
    if (!chatProject && data.projects.length)
      setChatProject(data.projects[0].id);
  }, [chatProject, data.projects]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setChatError("");
    if (isProgressQuery(text)) {
      append([
        { from: "owner", text },
        {
          from: "ceo",
          source: "core",
          text: progressReport(data, chatProject || null),
        },
      ]);
      setDraft("");
      return;
    }
    if (!chatProject) {
      setChatError("เลือกโปรเจกต์ก่อนสั่งงาน");
      return;
    }
    setBusy(true);
    try {
      const workflow = await bridge.createWorkflow(chatProject, text, mock);
      // ใช้ snapshot ล่าสุดหลังสร้าง เพื่อรายงานขั้นตอนที่ Core สร้างจริง
      const fresh = await bridge.snapshot().catch(() => null);
      await onRefresh();
      setDraft("");
      append([
        {
          from: "owner",
          text,
          projectId: chatProject,
          workflowId: workflow.id,
        },
        {
          from: "ceo",
          source: "core",
          projectId: chatProject,
          workflowId: workflow.id,
          link: "queue",
          text: acceptedReport(
            workflow,
            fresh ?? { ...data, workflows: [...workflows, workflow] },
            mock,
          ),
        },
      ]);
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  function quickReport(scope: "project" | "all") {
    append([
      {
        from: "owner",
        text:
          scope === "all" ? "ขอสรุปสถานะทุกโปรเจกต์" : "ขอรายงานความคืบหน้า",
      },
      {
        from: "ceo",
        source: "core",
        text: progressReport(
          data,
          scope === "all" ? null : chatProject || null,
        ),
      },
    ]);
  }

  const project = data.projects.find((item) => item.id === selected) ?? null;
  const running = tasks.filter((task) => task.status === "running").length;
  const approvals = tasks.filter(
    (task) => task.gate && ["ready", "needs_review"].includes(task.status),
  ).length;

  return (
    <div className="home">
      <header className="home-topbar">
        <a
          className="brand"
          href="#home"
          onClick={(event) => event.preventDefault()}
        >
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span>
            CrewNest<small>AI AGENT COMMAND CENTER</small>
          </span>
        </a>
        <div className="home-pills" aria-label="สถานะสรุป">
          <span className="pill">
            <span className="status-dot" />
            {native
              ? "Desktop Core connected"
              : "Browser preview · Desktop required"}
          </span>
          <span className="pill">กำลังทำ {running}</span>
          <span className="pill">รออนุมัติ {approvals}</span>
        </div>
        <div className="actions">
          <button onClick={onToggleTheme} aria-label="สลับ light/dark theme">
            {theme === "dark" ? "Light" : "Dark"} theme
          </button>
          <button className="primary" onClick={() => onOpenConsole()}>
            Console
          </button>
        </div>
      </header>

      <div
        className="home-stage"
        ref={stage}
        role="img"
        aria-label={`ออฟฟิศ 3D ของ CrewBots: ${agentStates.map((agent) => `${agent.name} ${agent.activity}`).join(", ")}`}
      >
        {!webgl && (
          <div className="stage-fallback">
            {data.agents.map((agent) => (
              <button key={agent.id} onClick={() => onSelectAgent(agent)}>
                <img
                  src={`/crewbots/${agent.characterKey}/idle.svg`}
                  alt=""
                  width="90"
                  height="105"
                />
                {agent.name}
              </button>
            ))}
            <small>อุปกรณ์นี้ไม่รองรับ WebGL2 จึงแสดงแบบ 2D</small>
          </div>
        )}
      </div>

      <aside className="home-card home-projects" aria-label="รายการโปรเจกต์">
        {project ? (
          <ProjectDetail
            project={project}
            data={data}
            onBack={() => setSelected(null)}
            onAssign={() => {
              setChatProject(project.id);
              document.getElementById("ceo-input")?.focus();
            }}
            onOpenConsole={onOpenConsole}
          />
        ) : (
          <>
            <div className="card-head">
              <div>
                <h2>Projects</h2>
                <p className="muted">
                  {data.projects.length} approved workspaces
                </p>
              </div>
              <button
                disabled={!native}
                onClick={onAddProject}
                aria-label="เพิ่มโปรเจกต์"
              >
                ＋
              </button>
            </div>
            {data.projects.length ? (
              <ul className="home-project-list">
                {data.projects.map((item) => {
                  const progress = progressOf(
                    tasks.filter((task) => task.projectId === item.id),
                  );
                  const count = workflows.filter(
                    (flow) => flow.projectId === item.id,
                  ).length;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setSelected(item.id)}
                        aria-label={`ดูรายละเอียด ${item.name}`}
                      >
                        <span className="row">
                          <b>{item.name}</b>
                          <span className="tag">
                            {item.isGit ? "GIT" : "DIR"}
                          </span>
                        </span>
                        <small>
                          {item.goal
                            ? clip(item.goal, 70)
                            : "ยังไม่ได้กำหนด objective"}
                        </small>
                        <span className="meter" aria-hidden="true">
                          <span style={{ width: `${progress.percent}%` }} />
                        </span>
                        <small className="row">
                          <span>
                            {count} งาน · {progress.completed}/{progress.total}{" "}
                            ขั้น
                          </span>
                          <span>
                            {progress.running
                              ? `กำลังทำ ${progress.running}`
                              : progress.waiting
                                ? `รอ ${progress.waiting}`
                                : `${progress.percent}%`}
                          </span>
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="empty compact">
                <img
                  src="/crewbots/astra/portrait.svg"
                  alt=""
                  width="64"
                  height="59"
                />
                <p>
                  {native
                    ? "ยังไม่มีโปรเจกต์ กด ＋ เพื่อเลือก directory"
                    : "เปิด CrewNest Desktop เพื่อดูโปรเจกต์"}
                </p>
              </div>
            )}
          </>
        )}
      </aside>

      <aside className="home-card home-chat" aria-label="แชทกับ CEO">
        <div className="card-head">
          <img
            src="/crewbots/astra/portrait.svg"
            alt=""
            width="40"
            height="37"
          />
          <div>
            <h2>ASTRA · CEO</h2>
            <p className="muted">รับงาน แตกแผน และรายงานความคืบหน้า</p>
          </div>
        </div>
        <ol className="chat-log" ref={log} aria-live="polite">
          {stored.messages.map((message) => (
            <li key={message.id} className={`bubble ${message.from}`}>
              {message.from === "ceo" && (
                <span className="bubble-meta">
                  {message.source === "model"
                    ? `ASTRA · ${message.runtime}`
                    : message.source === "mock"
                      ? message.runtime
                      : "ASTRA · สรุปจากสถานะ Core"}
                </span>
              )}
              <p>{message.text}</p>
              <span className="bubble-time">
                {time(message.at)}
                {message.link === "queue" && (
                  <button
                    className="link"
                    onClick={() => onOpenConsole("tasks")}
                  >
                    เปิด Task queue ↗
                  </button>
                )}
              </span>
            </li>
          ))}
          {!stored.messages.length && (
            <li className="bubble ceo">
              <p>
                {native
                  ? "กำลังเชื่อมต่อ Core…"
                  : "แชทกับ CEO ใช้ได้ใน CrewNest Desktop เท่านั้น"}
              </p>
            </li>
          )}
        </ol>
        <div className="chips">
          <button disabled={!loaded} onClick={() => quickReport("project")}>
            รายงานความคืบหน้า
          </button>
          <button disabled={!loaded} onClick={() => quickReport("all")}>
            ทุกโปรเจกต์
          </button>
        </div>
        <form className="chat-form" onSubmit={(event) => void send(event)}>
          <div className="row">
            <label className="sr-only" htmlFor="ceo-project">
              โปรเจกต์ที่สั่งงาน
            </label>
            <select
              id="ceo-project"
              value={chatProject}
              disabled={!loaded || busy}
              onChange={(event) => setChatProject(event.target.value)}
            >
              <option value="">เลือกโปรเจกต์</option>
              {data.projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <label className="mock-toggle">
              <input
                type="checkbox"
                checked={mock}
                disabled={!loaded || busy}
                onChange={(event) => setMock(event.target.checked)}
              />
              Mock
            </label>
          </div>
          {chatError && (
            <p role="alert" className="error-text">
              {chatError}
            </p>
          )}
          <div className="row">
            <label className="sr-only" htmlFor="ceo-input">
              ข้อความถึง CEO
            </label>
            <textarea
              id="ceo-input"
              rows={2}
              maxLength={4000}
              value={draft}
              disabled={!loaded || busy}
              placeholder="สั่งงาน เช่น “เพิ่มหน้าตั้งค่าโปรไฟล์” หรือพิมพ์ “สถานะ”"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              className="primary"
              disabled={!loaded || busy || !draft.trim()}
            >
              {busy ? "…" : "ส่ง"}
            </button>
          </div>
        </form>
      </aside>

      <div className="home-legend" aria-hidden="true">
        {[
          ["working", "กำลังทำ"],
          ["waiting", "รออนุมัติ/ตรวจ"],
          ["error", "ล้มเหลว"],
          ["idle", "ว่าง"],
        ].map(([key, label]) => (
          <span key={key} data-status={key}>
            {label}
          </span>
        ))}
        <span className="hint">ลากเพื่อหมุน · คลิกหุ่นเพื่อดูรายละเอียด</span>
      </div>
    </div>
  );
}

function ProjectDetail({
  project,
  data,
  onBack,
  onAssign,
  onOpenConsole,
}: {
  project: Snapshot["projects"][number];
  data: Snapshot;
  onBack: () => void;
  onAssign: () => void;
  onOpenConsole: (anchor?: string) => void;
}) {
  const tasks = (data.tasks ?? []).filter(
    (task) => task.projectId === project.id,
  );
  const flows = (data.workflows ?? [])
    .filter((flow) => flow.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const runs = data.executions
    .filter((run) => run.projectId === project.id)
    .slice(0, 5);
  const progress = progressOf(tasks);
  return (
    <div className="project-detail">
      <button className="link back" onClick={onBack}>
        ← Projects
      </button>
      <h2>{project.name}</h2>
      <p>{project.goal || "ยังไม่ได้กำหนด objective"}</p>
      <code>{displayPath(project.path)}</code>
      <dl className="mini-metrics">
        <div>
          <dt>ความคืบหน้า</dt>
          <dd>{progress.percent}%</dd>
        </div>
        <div>
          <dt>กำลังทำ</dt>
          <dd>{progress.running}</dd>
        </div>
        <div>
          <dt>รอ</dt>
          <dd>{progress.waiting}</dd>
        </div>
        <div>
          <dt>ล้มเหลว</dt>
          <dd>{progress.failed}</dd>
        </div>
      </dl>
      <h3>Workflows</h3>
      {flows.length ? (
        <ul className="flow-list">
          {flows.map((flow) => {
            const steps = sortTasks(
              tasks.filter((task) => task.workflowId === flow.id),
            );
            const p = progressOf(steps);
            return (
              <li key={flow.id}>
                <b>{clip(flow.objective, 80)}</b>
                <small>
                  {flow.status} · {p.completed}/{p.total} ·{" "}
                  {new Date(flow.createdAt).toLocaleDateString("th-TH")}
                </small>
                <ol className="steps" aria-label="ขั้นตอน">
                  {steps.map((task) => (
                    <li
                      key={task.id}
                      data-tone={statusTone[task.status] ?? "idle"}
                      title={`${stepLabels[task.step] ?? task.title} · ${agentName(data.agents, task.agentId)} · ${statusLabels[task.status] ?? task.status}`}
                    >
                      <span className="sr-only">
                        {stepLabels[task.step] ?? task.title}{" "}
                        {statusLabels[task.status] ?? task.status}
                      </span>
                    </li>
                  ))}
                </ol>
                {p.current && (
                  <small>
                    ตอนนี้: {stepLabels[p.current.step] ?? p.current.title} ·{" "}
                    {agentName(data.agents, p.current.agentId)} ·{" "}
                    {statusLabels[p.current.status] ?? p.current.status}
                    {p.current.blocker
                      ? ` — ${clip(p.current.blocker, 80)}`
                      : ""}
                  </small>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">ยังไม่มี workflow สั่งงานผ่าน CEO ได้ทางขวา</p>
      )}
      <h3>Executions ล่าสุด</h3>
      {runs.length ? (
        <ul className="run-list">
          {runs.map((run) => (
            <li key={run.id}>
              <span>
                {run.adapter === "mock" ? "[MOCK] " : ""}
                {agentName(data.agents, run.agentId)}
              </span>
              <small>
                {run.status} · {time(run.createdAt)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">ยังไม่มี execution</p>
      )}
      <div className="detail-actions">
        <button className="primary" onClick={onAssign}>
          สั่งงาน CEO
        </button>
        <button onClick={() => onOpenConsole("tasks")}>เปิด Task queue</button>
      </div>
    </div>
  );
}
