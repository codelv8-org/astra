import { RemotePanel } from "./RemotePanel";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
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
import {
  agentName,
  displayPath,
  progressOf,
  sceneAgents,
  statusLabels,
  stepLabels,
} from "./home/ceo";
import { AppRail } from "./AppRail";
import { consolePages, pageHref, readPage, type DesktopPage } from "./pages";
import { runtimeLabels } from "./ExecutionResultView";
import { ReviewPage, type ReviewTab } from "./ReviewPage";
import { JobDesks } from "./JobDesks";
import { Connectors } from "./Connectors";
import { Themes } from "./Themes";
import { readWorld, saveWorld, type WorldId } from "./home/worlds";
import { FolderList } from "./home/FolderList";
import { StoragePanel } from "./StoragePanel";
import { SecondBrainPanel } from "./SecondBrainPanel";
import { addDraft, removeDraft, type FolderRow } from "./home/folders";

const empty: Snapshot = {
  agents: agents as Agent[],
  projects: [],
  executions: [],
  dataPath: "",
  remoteStatus: "not_configured",
};
const displayError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function focusPage(page: DesktopPage) {
  window.scrollTo({ top: 0, behavior: "instant" });
  const id =
    page === "home" || page === "chat" || page === "monitor"
      ? page
      : `page-${page}`;
  document.getElementById(id)?.focus({ preventScroll: true });
}
const agentColors: Record<string, string> = {
  astra: "#4169E1",
  forge: "#E98B3A",
  mira: "#A597E8",
  vector: "#36B7B0",
  scout: "#879B4A",
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
  const [drafts, setDrafts] = useState<FolderRow[]>([]);
  const [draftPrimary, setDraftPrimary] = useState(0);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("crewnest-theme") || "dark",
  );
  const [selectedRun, setSelectedRun] = useState("");
  const [world, setWorld] = useState<WorldId>(readWorld);
  function chooseWorld(next: WorldId) {
    setWorld(next);
    saveWorld(next);
    setNotice("เปลี่ยนธีมโลกแล้ว เห็นผลที่หน้า Home");
  }
  const [monitorTab, setMonitorTab] = useState<ReviewTab>("changes");
  const [queueFilter, setQueueFilter] = useState("");
  const native = desktopAvailable();
  const [page, setPage] = useState(() => readPage(location, native));
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const eventCursor = useRef(0);
  const pageFocus = useRef(0);

  const showPage = useCallback((next: DesktopPage) => {
    setPage(next);
    cancelAnimationFrame(pageFocus.current);
    pageFocus.current = requestAnimationFrame(() => focusPage(next));
  }, []);

  function openPage(next: DesktopPage, event?: MouseEvent<HTMLAnchorElement>) {
    if (event) {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
    }
    if (next !== readPage(location, native)) {
      history.pushState(null, "", pageHref(next));
    }
    showPage(next);
  }

  function openExecution(id: string) {
    setSelectedRun(id);
    setMonitorTab("logs");
    openPage("monitor");
  }

  useEffect(() => {
    const syncPage = () => showPage(readPage(location, native));
    window.addEventListener("popstate", syncPage);
    window.addEventListener("hashchange", syncPage);
    return () => {
      window.removeEventListener("popstate", syncPage);
      window.removeEventListener("hashchange", syncPage);
      cancelAnimationFrame(pageFocus.current);
    };
  }, [native, showPage]);
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
      if (page !== "monitor" || !selectedRun || !desktopAvailable()) return;
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
  }, [page, selectedRun]);
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
  function openProjectModal() {
    setError("");
    setDrafts([]);
    setDraftPrimary(0);
    setModal("project");
  }
  async function addDraftFolder() {
    setError("");
    try {
      const path = await bridge.pickFolder();
      if (!path) return;
      const inspected = await bridge.inspectFolder(path, null);
      const next = addDraft(drafts, {
        ...inspected,
        exists: true,
        isPrimary: false,
      });
      if ("error" in next) setError(next.error);
      else setDrafts(next.drafts);
    } catch (cause) {
      setError(displayError(cause));
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
    if (!drafts.length) {
      setError("เพิ่ม source folder อย่างน้อย 1 รายการ");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await bridge.createProject(
        input.data.name,
        input.data.goal,
        drafts.map((draft) => draft.path),
        draftPrimary,
      );
      await refresh();
      setModal(null);
      setNotice("สร้างโปรเจกต์และอนุมัติ source folders แล้ว");
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
      await refresh();
      setModal(null);
      setNotice(
        `เริ่ม ${run.adapter === "mock" ? "MOCK · ไม่มี AI model" : (runtimeLabels[run.adapter] ?? run.adapter)} แล้ว`,
      );
      openExecution(run.id);
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
            subtitle: `${run.adapter === "mock" ? "MOCK · " : ""}${statusLabels[run.status] ?? run.status}`,
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
  // หน้า Review เปิดมาแล้วเลือก execution ล่าสุดให้เลย แทนหน้าว่าง
  const latestRun = data.executions[0]?.id ?? "";
  useEffect(() => {
    if (page === "monitor" && !selectedRun && latestRun) setSelectedRun(latestRun);
  }, [page, selectedRun, latestRun]);
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
  const pulse: [string, number, string, string][] = [
    ["กำลังรัน", running.length, running.length ? "run" : "idle", "execution ในเครื่องตอนนี้"],
    ["รออนุมัติ", approvals, approvals ? "wait" : "idle", "ขั้นที่ต้องให้คุณตัดสิน"],
    ["ล้มเหลว", failed.length, failed.length ? "bad" : "idle", "จาก 100 execution ล่าสุด"],
    ["โปรเจกต์", data.projects.length, "idle", "workspace ที่อนุญาตแล้ว"],
  ];
  // งานที่หยุดรอคน: gate ที่พร้อมให้อนุมัติ หรือผลที่รอตรวจ
  const waitingOnYou = (data.tasks ?? []).filter(
    (task) =>
      task.status === "needs_review" || (task.gate && task.status === "ready"),
  );
  return (
    <div className="app-shell">
      <AppRail
        page={page}
        native={native}
        theme={theme}
        badges={{
          tasks: { count: approvals, label: "รออนุมัติ" },
          monitor: { count: running.length, label: "กำลังรัน" },
        }}
        onOpenPage={openPage}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      <div className="app-main">
      {page === "home" || page === "chat" ? (
        <HomePage
          chatOnly={page === "chat"}
          data={data}
          native={native}
          theme={theme}
          world={world}
          onOpenPage={openPage}
          onAddProject={openProjectModal}
          onRefresh={refresh}
        />
      ) : (
        <div className="console">
          <main
            className="bento"
            id={page === "monitor" ? "monitor" : `page-${page}`}
            tabIndex={-1}
          >
            <header className="page-head span-12">
              <h1>
                {page === "overview"
                  ? "Console"
                  : consolePages.find(({ id }) => id === page)?.label}
              </h1>
              <div className="page-actions">
                <span className="chip" data-tone={native ? "ok" : "wait"}>
                  <span className="dot" />
                  {native
                    ? "Desktop Core connected"
                    : "Browser preview · Desktop required"}
                </span>
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
            {!native && (
              <p className="preview-note span-12">
                Frontend preview: ไม่มี local execution
                และไม่แสดงข้อมูลจำลองเป็นผลจริง เปิดแอปด้วย{" "}
                <code>pnpm desktop</code>
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

            {page === "overview" && (
              <section className="pulse span-12" aria-label="สถานะสรุป">
                <div className="pulse-head">
                  <h2>Pulse</h2>
                  <span className="chip" data-tone={(data.schedulerPaused ?? true) ? "wait" : "ok"}>
                    {(data.schedulerPaused ?? true)
                      ? "Scheduling paused"
                      : "Scheduling active"}
                  </span>
                </div>
                <dl className="pulse-grid">
                  {pulse.map(([label, value, tone, caption]) => (
                    <div key={label} data-tone={tone}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                      <dd className="pulse-caption">{caption}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {page === "agents" && (
              <JobDesks
                data={data}
                states={crew}
                onDetails={(agent) => {
                  setError("");
                  setModal(agent);
                }}
              />
            )}

            {page === "tasks" && (
              <div className="span-12 queue-slot">
                <QueueBoard
                  data={data}
                  filter={queueFilter}
                  onFilterChange={setQueueFilter}
                  onRefresh={refresh}
                  onExecution={openExecution}
                />
              </div>
            )}

            {page === "overview" && (
              <aside className="tile activity span-8">
                <div className="tile-head">
                  <div>
                    <h2>Activity</h2>
                    <p>100 runs ล่าสุดในเครื่อง</p>
                  </div>
                </div>
                <ActivityTabs groups={groups} />
              </aside>
            )}

            {page === "overview" && (
              <section className="tile waiting span-4" aria-label="งานที่รอคุณ">
                <div className="tile-head">
                  <div>
                    <h2>รอคุณตัดสิน</h2>
                    <p>{waitingOnYou.length} ขั้นที่หยุดรอคุณ</p>
                  </div>
                </div>
                {waitingOnYou.length ? (
                  <ul className="waiting-list">
                    {waitingOnYou.slice(0, 6).map((task) => (
                      <li key={task.id}>
                        <a
                          href={pageHref("tasks")}
                          onClick={(event) => openPage("tasks", event)}
                        >
                          <img
                            className="agent-avatar"
                            data-agent={task.agentId}
                            src={`/crewbots/${task.agentId}/portrait.svg`}
                            alt=""
                            width="32"
                            height="32"
                          />
                          <span>
                            <b>
                              {task.step === "task"
                                ? task.title
                                : (stepLabels[task.step] ?? task.title)}
                            </b>
                            <small>
                              {agentName(data.agents, task.agentId)} ·{" "}
                              {data.projects.find((item) => item.id === task.projectId)
                                ?.name ?? "—"}
                            </small>
                          </span>
                          <span className="chip" data-tone="wait">
                            {statusLabels[task.status] ?? task.status}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">ไม่มีงานรอคุณ ทีมเดินงานต่อได้เอง</p>
                )}
              </section>
            )}

            {page === "projects" && (
              <section className="tile span-12">
                <div className="tile-head">
                  <div>
                    <h2>Projects</h2>
                    <p>{data.projects.length} workspaces ที่อนุมัติแล้ว</p>
                  </div>
                  <button
                    disabled={!native}
                    onClick={openProjectModal}
                  >
                    <span className="plus" aria-hidden="true">
                      ＋
                    </span>
                    Add project
                  </button>
                </div>
                {data.projects.length ? (
                  <ul className="project-grid">
                    {data.projects.map((project) => {
                      const projectTasks = (data.tasks ?? []).filter(
                        (task) => task.projectId === project.id,
                      );
                      const progress = progressOf(projectTasks);
                      const flows = (data.workflows ?? []).filter(
                        (flow) => flow.projectId === project.id,
                      ).length;
                      const runs = data.executions.filter(
                        (item) => item.projectId === project.id,
                      ).length;
                      return (
                        <li key={project.id} className="project-card">
                          <div className="project-card-head">
                            <h3>{project.name}</h3>
                            <span className="chip">
                              {project.isGit ? "Git" : "Folder"}
                            </span>
                            {(project.folders?.length ?? 1) > 1 && (
                              <span className="chip">
                                {project.folders?.length} folders
                              </span>
                            )}
                          </div>
                          <p className="project-goal">
                            {project.goal || "ยังไม่ได้กำหนด objective"}
                          </p>
                          <code className="path">{displayPath(project.path)}</code>
                          <div className="project-progress">
                            <span className="meter" aria-hidden="true">
                              <span style={{ width: `${progress.percent}%` }} />
                            </span>
                            <span>
                              {progress.completed}/{progress.total} ขั้น ·{" "}
                              {progress.percent}%
                            </span>
                          </div>
                          <dl className="project-stats">
                            <div>
                              <dt>Workflow</dt>
                              <dd>{flows}</dd>
                            </div>
                            <div>
                              <dt>กำลังทำ</dt>
                              <dd>{progress.running}</dd>
                            </div>
                            <div>
                              <dt>รอคุณ</dt>
                              <dd>{progress.waiting}</dd>
                            </div>
                            <div>
                              <dt>Execution</dt>
                              <dd>{runs}</dd>
                            </div>
                          </dl>
                        </li>
                      );
                    })}
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
                        เลือก directory ผ่าน native dialog เพื่ออนุมัติ
                        workspace
                      </p>
                    </div>
                  </div>
                )}
              </section>
            )}

            {page === "themes" && (
              <Themes
                data={data}
                states={crew}
                theme={theme === "light" ? "light" : "dark"}
                world={world}
                onSelect={chooseWorld}
              />
            )}

            {page === "storage" && <StoragePanel native={native} />}
            {page === "brain" && <SecondBrainPanel native={native} />}
            {page === "runtimes" && (
              <Connectors
                data={data}
                diagnostics={diagnostics}
                checking={checking}
                native={native}
                onCheck={() => void checkRuntimes()}
              />
            )}

            {native && page === "remote" && (
              <div className="span-12 remote-slot">
                <RemotePanel projects={data.projects} />
              </div>
            )}

            {page === "monitor" && (
              <ReviewPage
                data={data}
                selectedRun={selectedRun}
                onSelectRun={setSelectedRun}
                events={events}
                tab={monitorTab}
                onTab={setMonitorTab}
                onCancel={(id) => {
                  void bridge
                    .cancel(id)
                    .then(() => setNotice("ส่ง cancellation request แล้ว"))
                    .catch((cause) => setError(displayError(cause)));
                }}
                onRefresh={refresh}
                onOpenQueue={() => openPage("tasks")}
              />
            )}
          </main>
        </div>
      )}
      </div>
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
              <fieldset className="folder-field">
                <legend>Source folders</legend>
                <FolderList
                  rows={drafts.map((draft, index) => ({
                    ...draft,
                    isPrimary: index === draftPrimary,
                  }))}
                  busy={busy}
                  onAdd={() => void addDraftFolder()}
                  onRemove={(index) => {
                    const next = removeDraft(drafts, index, draftPrimary);
                    setDrafts(next.drafts);
                    setDraftPrimary(next.primary);
                  }}
                  onMakePrimary={setDraftPrimary}
                />
                <p className="hint">
                  เลือก folder ผ่าน native picker เป็นการอนุมัติ workspace;
                  primary คือที่ agent ทำงาน folder อื่นเป็นบริบทแบบอ่านอย่างเดียว
                  (1 folder ต่อ 1 git repo)
                </p>
              </fieldset>
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  ยกเลิก
                </button>
                <button className="primary" disabled={busy || !drafts.length}>
                  {busy ? "กำลังสร้าง…" : "สร้างโปรเจกต์"}
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
                มี native confirmation ก่อนเริ่ม ไม่รองรับ writing หรือ
                high-risk actions
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
    </div>
  );
}
