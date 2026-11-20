import { RemotePanel } from "./RemotePanel";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  Agent,
  Diagnostic,
  ExecutionEvent,
  Snapshot,
} from "../../../packages/shared/src";
import { projectInput, runInput } from "../../../packages/shared/src";
import agents from "../../../packages/shared/default-agents.json";
import { ActivityTabs } from "../../../packages/ui/src/Tabs";
import { Modal } from "../../../packages/ui/src/Modal";
import { bridge, desktopAvailable } from "./bridge";
import { QueueBoard } from "./QueueBoard";
import { HomePage } from "./home/HomePage";
import { sceneAgents } from "./home/ceo";
import { AstraMark, ThemeGlyph } from "../../../packages/ui/src/AstraMark";

const empty: Snapshot = {
  agents: agents as Agent[],
  projects: [],
  executions: [],
  dataPath: "",
  remoteStatus: "not_configured",
};
const displayError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const runtimeLabels: Record<string, string> = {
  codex: "CODEX",
  claude: "CLAUDE CODE",
  antigravity: "ANTIGRAVITY",
};

const adapterNames: Record<string, string> = {
  codex: "OpenAI Codex",
  claude: "Claude Code",
  antigravity: "Antigravity",
  mock: "Mock Adapter",
};
const agentColors: Record<string, string> = {
  astra: "#4169E1",
  forge: "#E98B3A",
  mira: "#A597E8",
  vector: "#36B7B0",
  scout: "#879B4A",
};
/** สถานะ → โทนสีของชิป */
const toneOf: Record<string, string> = {
  working: "run",
  running: "run",
  queued: "run",
  waiting: "wait",
  error: "bad",
  failed: "bad",
  canceled: "idle",
  completed: "ok",
  idle: "idle",
  offline: "idle",
};
/** สถานะ → ความสว่างของจุดแสงประจำ agent บนพื้นหลัง */
const glowLevel: Record<string, number> = {
  working: 0.56,
  waiting: 0.4,
  error: 0.32,
  offline: 0.05,
};

export function App() {
  const [data, setData] = useState<Snapshot>(empty);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [modal, setModal] = useState<"project" | "run" | Agent | null>(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("crewnest-theme") || "dark",
  );
  const [selectedRun, setSelectedRun] = useState("");
  const [view, setView] = useState<"home" | "console">(() =>
    new URLSearchParams(location.search).get("view") === "console"
      ? "console"
      : "home",
  );
  function openView(next: "home" | "console", anchor?: string) {
    setView(next);
    history.replaceState(
      null,
      "",
      `${next === "console" ? "?view=console" : location.pathname}${anchor ? `#${anchor}` : ""}`,
    );
    requestAnimationFrame(() => {
      if (anchor)
        document.getElementById(anchor)?.scrollIntoView({ block: "start" });
      else window.scrollTo(0, 0);
    });
  }
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const eventCursor = useRef(0);
  const native = desktopAvailable();
  const refresh = useCallback(async () => {
    if (desktopAvailable()) setData(await bridge.snapshot());
  }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (desktopAvailable()) {
          const result = await bridge.snapshot();
          if (active) setData(result);
        }
      } catch (cause) {
        if (active) setError(displayError(cause));
      }
      if (active) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("crewnest-theme", theme);
  }, [theme]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    eventCursor.current = 0;
    setEvents([]);
    async function poll() {
      if (!selectedRun || !desktopAvailable()) return;
      try {
        const next = await bridge.events(selectedRun, eventCursor.current);
        if (active && next.length) {
          eventCursor.current = next[next.length - 1].id;
          setEvents((previous) => [...previous, ...next].slice(-500));
        }
      } catch (cause) {
        if (active) setError(displayError(cause));
      }
      if (active) timer = setTimeout(poll, 500);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedRun]);
  async function checkRuntimes() {
    setChecking(true);
    setError("");
    try {
      setDiagnostics(await bridge.diagnostics());
      setNotice("ตรวจ CLI diagnostics แล้ว");
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setChecking(false);
    }
  }
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = projectInput.safeParse({
      name: form.get("name"),
      goal: form.get("goal"),
    });
    if (!input.success) {
      setError(
        "กรอกชื่อโปรเจกต์ 1–100 ตัวอักษร และ goal ไม่เกิน 4000 ตัวอักษร",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await bridge.createProject(
        input.data.name,
        input.data.goal,
      );
      if (result) {
        await refresh();
        setModal(null);
        setNotice("สร้างโปรเจกต์และอนุมัติ directory แล้ว");
      }
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function startRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = runInput.safeParse({
      projectId: form.get("projectId"),
      agentId: form.get("agentId"),
      adapter: form.get("adapter"),
      prompt: form.get("prompt"),
      approved: form.get("approved") === "on",
    });
    if (!result.success) {
      setError("กรอกข้อมูลให้ครบและยืนยัน read-only execution");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const run = await bridge.start(result.data);
      setSelectedRun(run.id);
      await refresh();
      setModal(null);
      setNotice(
        `เริ่ม ${run.adapter === "mock" ? "MOCK · ไม่มี AI model" : (runtimeLabels[run.adapter] ?? run.adapter)} แล้ว`,
      );
      requestAnimationFrame(() => {
        const monitor = document.getElementById("monitor");
        monitor?.scrollIntoView({ behavior: "instant", block: "start" });
        monitor?.focus({ preventScroll: true });
      });
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setBusy(false);
    }
  }
  const groups = useMemo(
    () =>
      ["ทั้งหมด", "กำลังรัน", "สำเร็จ", "ล้มเหลว"].map((label, index) => ({
        label,
        items: data.executions
          .filter(
            (run) =>
              index === 0 ||
              run.status === ["", "running", "completed", "failed"][index],
          )
          .map((run) => ({
            title:
              data.agents.find((agent) => agent.id === run.agentId)?.name ||
              run.agentId,
            subtitle: `${run.adapter === "mock" ? "MOCK · " : ""}${run.status}`,
            detail: new Date(run.createdAt).toLocaleTimeString("th-TH", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            color:
              agentColors[
                data.agents.find((agent) => agent.id === run.agentId)
                  ?.characterKey ?? "astra"
              ] ?? agentColors.astra,
          })),
      })),
    [data.executions, data.agents],
  );
  const running = data.executions.filter((run) => run.status === "running");
  const failed = data.executions.filter((run) => run.status === "failed");
  const approvals = (data.tasks ?? []).filter(
    (task) => task.gate && ["ready", "needs_review"].includes(task.status),
  ).length;
  const run = data.executions.find((item) => item.id === selectedRun);
  const crew = useMemo(() => sceneAgents(data), [data]);
  // ท้องฟ้าของทีม: จุดแสงของ agent สว่างขึ้นตามสถานะจริงจาก Core
  useEffect(() => {
    const root = document.documentElement.style;
    for (const agent of crew)
      root.setProperty(
        `--glow-${agent.characterKey}`,
        String(glowLevel[agent.status] ?? "var(--glow-floor)"),
      );
  }, [crew]);
  const pulse: [string, number, string][] = [
    ["กำลังรัน", running.length, running.length ? "run" : "idle"],
    ["รออนุมัติ", approvals, approvals ? "wait" : "idle"],
    ["ล้มเหลว", failed.length, failed.length ? "bad" : "idle"],
    ["โปรเจกต์", data.projects.length, "idle"],
  ];
  return (
    <>
      {view === "home" ? (
        <HomePage
          data={data}
          native={native}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onOpenConsole={(anchor) => openView("console", anchor)}
          onSelectAgent={(agent) => {
            setError("");
            setModal(agent);
          }}
          onAddProject={() => {
            setError("");
            setModal("project");
          }}
          onRefresh={refresh}
        />
      ) : (
        <div className="console">
          <header className="dock glass">
            <a className="brand" href="#overview">
              <AstraMark />
              <span>Astra</span>
            </a>
            <nav className="dock-nav" aria-label="เมนูหลัก">
              <a
                href="?"
                onClick={(event) => {
                  event.preventDefault();
                  openView("home");
                }}
              >
                Home
              </a>
              <a href="#overview">Overview</a>
              <a href="#tasks">
                Queue <span>{(data.tasks ?? []).length}</span>
              </a>
              <a href="#monitor">
                Runs <span>{data.executions.length}</span>
              </a>
              {native && <a href="#remote">Remote</a>}
            </nav>
            <span className="chip core-chip" data-tone={native ? "ok" : "wait"}>
              <span className="dot" />
              {native
                ? "Desktop Core connected"
                : "Browser preview · Desktop required"}
            </span>
            <div className="dock-actions">
              <button
                className="icon quiet"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="สลับ light/dark theme"
                title={theme === "dark" ? "ธีมสว่าง" : "ธีมมืด"}
              >
                <ThemeGlyph theme={theme} />
              </button>
              <button
                className="primary"
                disabled={!native}
                onClick={() => {
                  setError("");
                  setModal("run");
                }}
              >
                <span className="plus" aria-hidden="true">
                  ＋
                </span>
                New execution
              </button>
            </div>
          </header>
          <main className="bento" id="overview">
            {!native && (
              <p className="preview-note span-12">
                Frontend preview: ไม่มี local execution และไม่แสดงข้อมูลจำลองเป็นผลจริง
                เปิดแอปด้วย <code>pnpm desktop</code>
              </p>
            )}
            {error && !modal && (
              <div role="alert" className="error span-12">
                {error}
                <button aria-label="ปิดข้อผิดพลาด" onClick={() => setError("")}>
                  ×
                </button>
              </div>
            )}
            <p role="status" className="notice span-12">
              {notice}
            </p>

            <section className="tile pulse span-4" aria-label="สถานะสรุป">
              <div className="tile-head">
                <h2>Pulse</h2>
                <span className="chip">
                  {(data.schedulerPaused ?? true)
                    ? "Scheduling paused"
                    : "Scheduling active"}
                </span>
              </div>
              <dl className="pulse-grid">
                {pulse.map(([label, value, tone]) => (
                  <div key={label} data-tone={tone}>
                    <dt>
                      <span className="dot" />
                      {label}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="tile crew span-8" id="agents">
              <div className="tile-head">
                <div>
                  <h2>Crew</h2>
                  <p>ห้าบทบาท ทุกงานรอคุณอนุมัติ</p>
                </div>
              </div>
              <div className="crew-grid">
                {data.agents.map((agent) => {
                  const live = crew.find((item) => item.id === agent.id);
                  const tone = toneOf[live?.status ?? "idle"];
                  return (
                    <article
                      className="crew-card well"
                      key={agent.id}
                      style={
                        {
                          "--agent": `var(--c-${agent.characterKey})`,
                        } as React.CSSProperties
                      }
                    >
                      <img
                        src={`/crewbots/${agent.characterKey}/portrait.svg`}
                        width="44"
                        height="41"
                        alt=""
                      />
                      <div className="crew-text">
                        <h3>{agent.name}</h3>
                        <p className="crew-role">{agent.role}</p>
                      </div>
                      <p className="crew-live" data-tone={tone}>
                        <span className="dot" />
                        <span>
                          {!live || live.activity === agent.role
                            ? live?.status === "offline"
                              ? "ออฟไลน์"
                              : "ว่าง พร้อมรับงาน"
                            : live.activity}
                        </span>
                      </p>
                      <div className="crew-foot">
                        <span className="chip">
                          {adapterNames[agent.runtimeAdapter] ??
                            agent.runtimeAdapter}
                        </span>
                        <button
                          className="link"
                          onClick={() => {
                            setError("");
                            setModal(agent);
                          }}
                        >
                          รายละเอียด
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <div className="span-8 queue-slot">
              <QueueBoard
                data={data}
                onRefresh={refresh}
                onExecution={setSelectedRun}
              />
            </div>

            <aside className="tile activity span-4">
              <div className="tile-head">
                <div>
                  <h2>Activity</h2>
                  <p>100 runs ล่าสุดในเครื่อง</p>
                </div>
              </div>
              <ActivityTabs groups={groups} />
            </aside>

            <section
              className={`tile ${native ? "span-4" : "span-6"}`}
              id="projects"
            >
              <div className="tile-head">
                <div>
                  <h2>Projects</h2>
                  <p>{data.projects.length} workspaces ที่อนุมัติแล้ว</p>
                </div>
                <button
                  disabled={!native}
                  onClick={() => {
                    setError("");
                    setModal("project");
                  }}
                >
                  <span className="plus" aria-hidden="true">
                    ＋
                  </span>
                  Add project
                </button>
              </div>
              {data.projects.length ? (
                <ul className="rows">
                  {data.projects.map((project) => (
                    <li key={project.id} className="row-item">
                      <div className="row-main">
                        <h3>{project.name}</h3>
                        <p className="muted clip">
                          {project.goal || "ยังไม่ได้กำหนด objective"}
                        </p>
                        <code className="path">{project.path}</code>
                      </div>
                      <span className="chip">
                        {project.isGit ? "Git" : "Folder"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty">
                  <img
                    src="/crewbots/astra/portrait.svg"
                    alt=""
                    width="56"
                    height="52"
                  />
                  <div>
                    <h3>เริ่มจากโปรเจกต์แรก</h3>
                    <p className="hint">
                      เลือก directory ผ่าน native dialog เพื่ออนุมัติ workspace
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section
              className={`tile ${native ? "span-4" : "span-6"}`}
              id="runtimes"
            >
              <div className="tile-head">
                <div>
                  <h2>Runtime health</h2>
                  <p>ตรวจการติดตั้งและ auth โดยไม่อ่าน credentials</p>
                </div>
                <button
                  disabled={!native || checking}
                  onClick={() => void checkRuntimes()}
                >
                  {checking ? "กำลังตรวจ…" : "Check runtimes"}
                </button>
              </div>
              {diagnostics.length ? (
                <ul className="rows">
                  {diagnostics.map((item) => (
                    <li className="row-item" key={item.adapter}>
                      <div className="row-main">
                        <h3>
                          {adapterNames[item.adapter] ?? item.adapter}
                        </h3>
                        <p className="muted">
                          {item.version || "Version unavailable"} · Auth:{" "}
                          {item.authentication}
                        </p>
                        <p className="hint">{item.message}</p>
                        {item.executable && (
                          <code className="path">{item.executable}</code>
                        )}
                      </div>
                      <span
                        className="chip"
                        data-tone={
                          item.installed && item.supported ? "ok" : "bad"
                        }
                      >
                        <span className="dot" />
                        {!item.installed
                          ? "Missing"
                          : item.supported
                            ? "Ready"
                            : "Unsupported"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">ยังไม่ได้ตรวจ CLI ใน session นี้</p>
              )}
              <p className="db-path">
                <span>Database</span>
                <code>{data.dataPath || "ยังไม่เชื่อมต่อ Desktop"}</code>
              </p>
            </section>

            {native && (
              <div className="span-4 remote-slot">
                <RemotePanel projects={data.projects} />
              </div>
            )}

            <section className="tile span-12" id="monitor" tabIndex={-1}>
              <div className="tile-head">
                <div>
                  <h2>Execution monitor</h2>
                  <p>Events จริงที่บันทึกไว้ · ปิดบังรูปแบบข้อมูลอ่อนไหว</p>
                </div>
                <div className="tile-actions monitor-controls">
                  <label className="inline-select">
                    Execution
                    <select
                      value={selectedRun}
                      onChange={(event) => setSelectedRun(event.target.value)}
                    >
                      <option value="">เลือก execution เพื่อดู logs</option>
                      {data.executions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.adapter === "mock" ? "[MOCK] " : ""}
                          {item.agentId} · {item.status} · {item.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {run?.status === "running" && (
                    <button
                      className="danger"
                      onClick={() => {
                        void bridge
                          .cancel(run.id)
                          .then(() => setNotice("ส่ง cancellation request แล้ว"))
                          .catch((cause) => setError(displayError(cause)));
                      }}
                    >
                      Cancel execution
                    </button>
                  )}
                </div>
              </div>
              {run && (
                <p className="run-meta">
                  <span className="chip">
                    {run.adapter === "mock"
                      ? "MOCK — no AI model"
                      : (runtimeLabels[run.adapter] ?? run.adapter)}
                  </span>
                  <span className="chip" data-tone={toneOf[run.status]}>
                    <span className="dot" />
                    {run.status}
                  </span>
                  <span className="chip">PID {run.pid ?? "—"}</span>
                  {run.error && <span className="error-text">{run.error}</span>}
                </p>
              )}
              <div
                className="log-view well"
                role="region"
                aria-label="Execution logs"
                tabIndex={0}
              >
                {events.length ? (
                  events.map((item) => (
                    <div className="log-line" key={item.id}>
                      <span>
                        {new Date(item.createdAt).toLocaleTimeString("th-TH")}
                      </span>
                      <b>{item.kind}</b>
                      <pre>{item.text}</pre>
                    </div>
                  ))
                ) : (
                  <p className="hint">ยังไม่มี events สำหรับ execution ที่เลือก</p>
                )}
              </div>
            </section>
          </main>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "project"
              ? "เพิ่มโปรเจกต์"
              : modal === "run"
                ? "New approved execution"
                : `${modal.name} · Agent details`
          }
          onClose={() => {
            setModal(null);
            setError("");
          }}
          busy={busy}
        >
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {modal === "project" ? (
            <form onSubmit={(event) => void createProject(event)}>
              <label>
                <span>
                  ชื่อโปรเจกต์ <span aria-hidden="true">*</span>
                </span>
                <input
                  name="name"
                  maxLength={100}
                  required
                  autoFocus
                  disabled={busy}
                />
              </label>
              <label>
                Project objective
                <textarea
                  name="goal"
                  maxLength={4000}
                  rows={4}
                  disabled={busy}
                />
              </label>
              <p className="hint">
                ขั้นต่อไปเปิด native picker การเลือก directory เป็นการอนุมัติ
                workspace นี้
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  ยกเลิก
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "รอเลือก directory…" : "เลือก directory และสร้าง"}
                </button>
              </div>
            </form>
          ) : modal === "run" ? (
            <form onSubmit={(event) => void startRun(event)}>
              <label>
                Project
                <select name="projectId" required disabled={busy}>
                  <option value="">เลือก approved workspace</option>
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Agent
                  <select name="agentId" disabled={busy}>
                    {data.agents.map((agent) => (
                      <option value={agent.id} key={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Adapter
                  <select name="adapter" disabled={busy}>
                    <option value="mock">MOCK — no AI model</option>
                    <option
                      value="codex"
                      disabled={
                        !diagnostics.some(
                          (item) =>
                            item.adapter === "codex" &&
                            item.authentication === "authenticated" &&
                            item.supported,
                        )
                      }
                    >
                      Codex · read-only
                    </option>
                    <option
                      value="claude"
                      disabled={
                        !diagnostics.some(
                          (item) =>
                            item.adapter === "claude" &&
                            item.installed &&
                            item.supported,
                        )
                      }
                    >
                      Claude Code · plan
                    </option>
                    <option
                      value="antigravity"
                      disabled={
                        !diagnostics.some(
                          (item) =>
                            item.adapter === "antigravity" &&
                            item.installed &&
                            item.supported,
                        )
                      }
                    >
                      Antigravity · plan
                    </option>
                  </select>
                </label>
              </div>
              <label>
                Task prompt
                <textarea
                  name="prompt"
                  required
                  maxLength={8000}
                  rows={5}
                  placeholder="อธิบายงานแบบ read-only ที่ต้องการ"
                  disabled={busy}
                />
              </label>
              <label className="checkbox">
                <input
                  name="approved"
                  type="checkbox"
                  required
                  disabled={busy}
                />
                ฉันอนุมัติ prompt นี้ใน workspace ที่เลือกแบบ read-only
              </label>
              <p className="hint">
                Runtime ต้องตรง agent: Codex สำหรับ ASTRA/VECTOR/SCOUT, Claude
                สำหรับ FORGE, Antigravity สำหรับ MIRA · Mock ใช้ราว 15 วินาที ·
                มี native confirmation ก่อนเริ่ม ไม่รองรับ writing หรือ high-risk
                actions
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  ยกเลิก
                </button>
                <button
                  className="primary"
                  disabled={busy || !data.projects.length}
                >
                  {busy ? "กำลังเริ่ม…" : "Review & start"}
                </button>
              </div>
            </form>
          ) : (
            <div className="agent-detail">
              <img
                src={`/crewbots/${modal.characterKey}/full-body.svg`}
                alt=""
                width="180"
                height="210"
              />
              <div>
                <h3>{modal.role}</h3>
                <p>{modal.description}</p>
                <dl>
                  <dt>Adapter</dt>
                  <dd>{modal.runtimeAdapter}</dd>
                  <dt>Supervisor</dt>
                  <dd>{modal.supervisorId || "Human owner"}</dd>
                  <dt>Concurrency limit</dt>
                  <dd>{modal.concurrencyLimit}</dd>
                  <dt>Permissions</dt>
                  <dd>{modal.workspacePermissions.join(", ")}</dd>
                  <dt>Capabilities</dt>
                  <dd>{modal.capabilities.join(", ")}</dd>
                </dl>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
