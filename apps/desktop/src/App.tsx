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
              data.agents.find((agent) => agent.id === run.agentId)
                ?.characterKey === "forge"
                ? "#E98B3A"
                : "#4169E1",
          })),
      })),
    [data.executions, data.agents],
  );
  const running = data.executions.filter((run) => run.status === "running");
  const run = data.executions.find((item) => item.id === selectedRun);
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
        <div className="app-shell">
          <aside className="sidebar">
            <a className="brand" href="#dashboard">
              <span className="brand-mark" aria-hidden="true">
                C
              </span>
              <span>
                CrewNest<small>AI AGENT COMMAND CENTER</small>
              </span>
            </a>
            <div className="nav-label">WORKSPACE</div>
            <nav aria-label="เมนูหลัก">
              <a
                href="?"
                onClick={(event) => {
                  event.preventDefault();
                  openView("home");
                }}
              >
                ← Home 3D
              </a>
              <a href="#dashboard">
                Overview <span>01</span>
              </a>
              <a href="#agents">
                CrewBots <span>05</span>
              </a>
              <a href="#projects">
                Projects <span>{data.projects.length}</span>
              </a>
              <a href="#monitor">
                Executions <span>{data.executions.length}</span>
              </a>
              <a href="#runtimes">Runtime health</a>
            </nav>
            <div className="local-note">
              <span className="status-dot" /> Local-first
              <small>
                Remote control: {data.remoteStatus}
                <br />
                Phase 3 · secure remote control
              </small>
            </div>
          </aside>
          <main id="dashboard">
            <header className="topbar">
              <div>
                <span className="eyebrow">PERSONAL AI WORKSPACE</span>
                <p>
                  <span className="status-dot" />
                  {native
                    ? "Desktop Core connected"
                    : "Browser preview · Desktop required"}
                </p>
              </div>
              <div className="actions">
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label="สลับ light/dark theme"
                >
                  {theme === "dark" ? "Light" : "Dark"} theme
                </button>
                <span className="version">v0.1.0 / LOCAL</span>
              </div>
            </header>
            {!native && (
              <div className="banner">
                นี่คือ frontend preview ไม่มี local execution
                หรือข้อมูลจำลองว่าเป็นผลจริง เปิดแอปด้วย{" "}
                <code>pnpm desktop</code>
              </div>
            )}
            <div className="page-heading">
              <div>
                <p className="eyebrow">COMMAND CENTER</p>
                <h1>ทีมพร้อมรับภารกิจของคุณ</h1>
                <p className="muted">
                  จัดการโปรเจกต์ ตรวจ runtime และติดตามทุก execution ในเครื่อง
                </p>
              </div>
              <button
                className="primary"
                disabled={!native}
                onClick={() => {
                  setError("");
                  setModal("run");
                }}
              >
                ＋ New execution
              </button>
            </div>
            {error && !modal && (
              <div role="alert" className="error">
                {error}
                <button aria-label="ปิดข้อผิดพลาด" onClick={() => setError("")}>
                  ×
                </button>
              </div>
            )}
            <p role="status" className="notice">
              {notice}
            </p>
            <section className="metrics" aria-label="สถานะสรุป">
              {[
                ["Projects", data.projects.length],
                ["CrewBots", data.agents.length],
                ["Running", running.length],
                [
                  "Failed",
                  data.executions.filter((run) => run.status === "failed")
                    .length,
                ],
              ].map(([label, value]) => (
                <div className="metric" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>
                    {label === "CrewBots"
                      ? "Configurable agent records"
                      : "Local persistent state"}
                  </small>
                </div>
              ))}
            </section>
            <section id="agents">
              <div className="section-heading">
                <div>
                  <h2>Your CrewBots</h2>
                  <p className="muted">ห้าบทบาท หนึ่งเป้าหมายร่วมกัน</p>
                </div>
                <span className="tag">HUMAN APPROVAL REQUIRED</span>
              </div>
              <div className="agent-grid">
                {data.agents.map((agent) => (
                  <article
                    className="agent-card"
                    key={agent.id}
                    style={
                      {
                        "--agent-color": (
                          {
                            astra: "#4169E1",
                            forge: "#E98B3A",
                            mira: "#A597E8",
                            vector: "#36B7B0",
                            scout: "#879B4A",
                          } as Record<string, string>
                        )[agent.characterKey],
                      } as React.CSSProperties
                    }
                  >
                    <div className="agent-card-top">
                      <span className="agent-number">
                        {agent.id.toUpperCase()}
                      </span>
                      <span className="state">
                        <span className="status-dot" />
                        {agent.status}
                      </span>
                    </div>
                    <div className="avatar-stage">
                      <img
                        src={`/crewbots/${agent.characterKey}/${agent.status === "working" ? "working" : "idle"}.svg`}
                        width="180"
                        height="210"
                        alt=""
                      />
                    </div>
                    <h3>{agent.name}</h3>
                    <p className="role">{agent.role}</p>
                    <p className="provider">
                      {
                        {
                          codex: "OpenAI Codex",
                          claude: "Claude Code",
                          antigravity: "Antigravity",
                          mock: "Mock Adapter",
                        }[agent.runtimeAdapter]
                      }
                    </p>
                    <button
                      onClick={() => {
                        setError("");
                        setModal(agent);
                      }}
                    >
                      รายละเอียด <span aria-hidden="true">↗</span>
                    </button>
                  </article>
                ))}
              </div>
            </section>
            <div className="workspace-grid">
              <div>
                <section className="panel" id="projects">
                  <div className="section-heading">
                    <div>
                      <h2>Projects</h2>
                      <p className="muted">Approved local workspaces</p>
                    </div>
                    <button
                      disabled={!native}
                      onClick={() => {
                        setError("");
                        setModal("project");
                      }}
                    >
                      ＋ Add project
                    </button>
                  </div>
                  {data.projects.length ? (
                    <div className="project-list">
                      {data.projects.map((project) => (
                        <article key={project.id}>
                          <div>
                            <h3>{project.name}</h3>
                            <p>{project.goal || "ยังไม่ได้กำหนด objective"}</p>
                            <code>{project.path}</code>
                          </div>
                          <span className="tag">
                            {project.isGit
                              ? "GIT REPOSITORY"
                              : "LOCAL DIRECTORY"}
                          </span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty">
                      <img
                        src="/crewbots/astra/portrait.svg"
                        alt=""
                        width="80"
                        height="74"
                      />
                      <h3>เริ่มจากโปรเจกต์แรก</h3>
                      <p>
                        เลือก directory ผ่าน native dialog เพื่ออนุมัติ
                        workspace
                      </p>
                    </div>
                  )}
                </section>
                <section className="panel" id="runtimes">
                  <div className="section-heading">
                    <div>
                      <h2>Runtime health</h2>
                      <p className="muted">
                        ตรวจ installation และ authentication โดยไม่อ่าน
                        credentials
                      </p>
                    </div>
                    <button
                      disabled={!native || checking}
                      onClick={() => void checkRuntimes()}
                    >
                      {checking ? "กำลังตรวจ…" : "Check runtimes"}
                    </button>
                  </div>
                  {!diagnostics.length && (
                    <p className="muted">ยังไม่ได้ตรวจ CLI ใน session นี้</p>
                  )}
                  {diagnostics.map((item) => (
                    <article className="runtime-row" key={item.adapter}>
                      <div>
                        <h3>
                          {item.adapter.toUpperCase()}{" "}
                          <span className="tag">
                            {item.installed ? "INSTALLED" : "MISSING"}
                          </span>
                        </h3>
                        <p>
                          {item.version || "Version unavailable"} · Auth:{" "}
                          {item.authentication}
                        </p>
                        <small>{item.message}</small>
                        {item.executable && <code>{item.executable}</code>}
                      </div>
                      <span className="state">
                        {item.supported ? "SUPPORTED" : "UNAVAILABLE"}
                      </span>
                    </article>
                  ))}
                </section>
              </div>
              <aside className="panel activity">
                <div className="section-heading">
                  <div>
                    <h2>Execution activity</h2>
                    <p className="muted">Recent 100 runs · local history</p>
                  </div>
                </div>
                <ActivityTabs groups={groups} />
                <div className="boundary-note">
                  <h3>คุณเป็นผู้อนุมัติ</h3>
                  <p>
                    ใช้ read-only / staged writing ไม่มี push, deploy หรือ
                    remote terminal
                  </p>
                </div>
              </aside>
            </div>
            {native && <RemotePanel projects={data.projects} />}
            <QueueBoard
              data={data}
              onRefresh={refresh}
              onExecution={setSelectedRun}
            />
            <section className="panel" id="monitor" tabIndex={-1}>
              <div className="section-heading">
                <div>
                  <h2>Execution monitor</h2>
                  <p className="muted">
                    Actual persisted events · sensitive patterns redacted
                  </p>
                </div>
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
              <label>
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
              {run && (
                <p className="run-meta">
                  {run.adapter === "mock"
                    ? "MOCK — no AI model"
                    : (runtimeLabels[run.adapter] ?? run.adapter)}{" "}
                  · {run.status} · PID {run.pid ?? "—"}
                  {run.error && (
                    <span className="error-text"> · {run.error}</span>
                  )}
                </p>
              )}
              <div
                className="log-view"
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
                  <p className="muted">
                    ยังไม่มี events สำหรับ execution ที่เลือก
                  </p>
                )}
              </div>
            </section>
            <footer>
              CREWNEST · LOCAL-FIRST AI OPERATIONS{" "}
              <span>{data.dataPath || "No Desktop database connected"}</span>
            </footer>
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
              <p className="muted">
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
              <p className="muted">
                Mock ใช้เวลาประมาณ 15 วินาทีเพื่อให้ตรวจ logs และ cancellation
                ได้ Runtime ต้องตรง agent: Codex สำหรับ ASTRA/VECTOR/SCOUT,
                Claude สำหรับ FORGE, Antigravity สำหรับ MIRA หลังตรวจ
                diagnostics จะมี native confirmation ก่อนเริ่ม ไม่รองรับ writing
                หรือ high-risk actions
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
                <p className="muted">
                  Role records เก็บใน SQLite · Configuration editing อยู่ Phase
                  2
                </p>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
