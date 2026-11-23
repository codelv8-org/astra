import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import type { Snapshot } from "../../../../packages/shared/src";
import { bridge } from "../bridge";
import {
  chatExecutionRef,
  readExecutionResult,
  type ExecutionResultRef,
} from "../executionResult";
import { ExecutionResultView } from "../ExecutionResultView";
import { Modal } from "../../../../packages/ui/src/Modal";
import { pageHref, type DesktopPage } from "../pages";
import { worldById, type WorldId } from "./worlds";
import "./home.css";
import type { OfficeScene, SceneAgent } from "./OfficeScene";
import { AgentPanel } from "./AgentPanel";
import { Minimap } from "./Minimap";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { ChatApprovals } from "./ChatApprovals";
import { GenUI } from "./genui/GenUI";
import { parseGenUI, validateGenUI } from "./genui/spec";
import { progressGenUI, workflowGenUI } from "./genui/workflow";
import {
  acceptedReport,
  agentName,
  agentResultCandidates,
  changeReports,
  chatTarget,
  directTaskInput,
  diffTasks,
  handoffRoute,
  handoffStatus,
  isProgressQuery,
  progressOf,
  progressReport,
  sceneAgents,
  sortTasks,
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
    if (value && Array.isArray(value.messages)) {
      const stored = value as Stored;
      return {
        ...stored,
        messages: stored.messages.map((message) => ({
          ...message,
          genUI:
            message.from === "owner" ? undefined : validateGenUI(message.genUI),
        })),
      };
    }
  } catch {
    /* storage ใช้ไม่ได้ เริ่มใหม่ */
  }
  return { messages: [], baseline: null, seen: [] };
}
function save(value: Stored) {
  try {
    const next = {
      ...value,
      messages: value.messages.slice(-200),
      seen: value.seen.slice(-200),
    };
    let encoded = JSON.stringify(next);
    while (encoded.length > 2_000_000 && next.messages.length > 1) {
      next.messages.splice(0, Math.ceil(next.messages.length / 4));
      encoded = JSON.stringify(next);
    }
    localStorage.setItem(storageKey, encoded);
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
const sidebarKey = "astra-workspace-sidebar";
function readSidebar() {
  try {
    return localStorage.getItem(sidebarKey) !== "closed";
  } catch {
    return true;
  }
}

export function HomePage({
  chatOnly,
  data,
  native,
  theme,
  world,
  onOpenPage,
  onAddProject,
  onRefresh,
}: {
  chatOnly: boolean;
  data: Snapshot;
  native: boolean;
  theme: string;
  world: WorldId;
  onOpenPage: (
    page: DesktopPage,
    event?: MouseEvent<HTMLAnchorElement>,
  ) => void;
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
  const worldRef = useRef(world);
  worldRef.current = world;
  const statesRef = useRef<SceneAgent[]>([]);
  const reduced = useMemo(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );
  const [focused, setFocused] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"chat" | "agent" | null>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(readSidebar);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  function selectAgent(agentId: string | null) {
    setFocused(agentId);
    setDrawer(agentId ? "agent" : "chat");
    scene.current?.setFocus(agentId);
  }
  const selectRef = useRef(selectAgent);
  selectRef.current = selectAgent;
  function toggleSidebar(open: boolean) {
    setSidebarOpen(open);
    try {
      localStorage.setItem(sidebarKey, open ? "open" : "closed");
    } catch {
      /* ไม่บังคับ */
    }
  }

  const [selected, setSelected] = useState<string | null>(null);
  const [chatProject, setChatProject] = useState("");
  const [stored, setStored] = useState<Stored>(load);
  const [draft, setDraft] = useState("");
  const [mock, setMock] = useState(false);
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<ChatMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [preview, setPreview] = useState<ExecutionResultRef | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const loaded = native && Boolean(data.dataPath);
  const tasks = useMemo(() => data.tasks ?? [], [data.tasks]);
  const workflows = useMemo(() => data.workflows ?? [], [data.workflows]);
  const chatWorkflow = workflows
    .filter((workflow) => workflow.projectId === chatProject)
    .reduce<
      (typeof workflows)[number] | null
    >((latest, workflow) => (!latest || workflow.createdAt > latest.createdAt ? workflow : latest), null);
  const chatSteps = chatWorkflow
    ? sortTasks(tasks.filter((task) => task.workflowId === chatWorkflow.id))
    : [];
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const currentStep = progressOf(chatSteps).current;

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
        world: worldRef.current,
        onSelect: (agentId) => selectRef.current(agentId),
      });
      instance.setAgents(statesRef.current);
      scene.current = instance;
    });
    return () => {
      cancelled = true;
      instance?.dispose();
      scene.current = null;
    };
  }, [chatOnly, webgl]);
  useEffect(
    () => scene.current?.setTheme(theme === "light" ? "light" : "dark"),
    [theme],
  );
  const agentStates = useMemo(() => sceneAgents(data), [data]);
  statesRef.current = agentStates;
  useEffect(() => scene.current?.setAgents(agentStates), [agentStates]);
  useEffect(() => scene.current?.setPaused(paused), [paused]);
  useEffect(() => scene.current?.setWorld(world), [world]);
  useEffect(() => scene.current?.setSpeed(speed), [speed]);

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
  const readingResults = useRef(new Set<string>());
  const chatMounted = useRef(false);
  useEffect(() => {
    chatMounted.current = true;
    return () => {
      chatMounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const current = storedRef.current;
    if (!current.baseline) {
      // ครั้งแรก: จำสถานะปัจจุบันเป็นจุดตั้งต้น ไม่ย้อนรายงานประวัติทั้งหมด
      const seen = data.executions
        .filter((run) => run.status === "completed")
        .map((run) => run.id);
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
    const pending = readingResults.current;
    const candidates = agentResultCandidates(
      data,
      new Set([...current.seen, ...pending]),
    );
    if (!candidates.length) return;
    candidates.forEach(({ execution }) => pending.add(execution.id));
    void Promise.all(
      candidates.map(async ({ task, execution }) => {
        const result = await readExecutionResult((after) =>
          bridge.events(execution.id, after),
        ).catch(() => null);
        if (result === null) return null;
        const mockRun = execution.adapter === "mock";
        const output =
          result &&
          (mockRun
            ? { text: result.text, ui: undefined }
            : parseGenUI(result.text));
        return {
          executionId: execution.id,
          message: result?.text.trim()
            ? {
                id: `execution:${execution.id}`,
                at: result.createdAt,
                from:
                  task.agentId === "astra"
                    ? ("ceo" as const)
                    : ("agent" as const),
                agentId: task.agentId,
                source: mockRun ? ("mock" as const) : ("model" as const),
                runtime: mockRun
                  ? "MOCK · ไม่มี AI model"
                  : execution.adapter.toUpperCase(),
                projectId: task.projectId,
                workflowId: task.workflowId ?? undefined,
                text: `ส่งผลขั้น${stepLabels[task.step] ?? task.title}${output?.text ? `\n${output.text.length > 1800 ? `${output.text.slice(0, 1799)}…` : output.text}` : ""}`,
                genUI: output?.ui,
              }
            : null,
        };
      }),
    )
      .then((results) => {
        if (!chatMounted.current) return;
        const read = results.filter((result) => result !== null);
        if (!read.length) return;
        setStored((previous) => {
          const seen = new Set(previous.seen);
          const fresh = read.filter((result) => !seen.has(result.executionId));
          if (!fresh.length) return previous;
          const next = {
            ...previous,
            seen: [...seen, ...fresh.map((result) => result.executionId)],
            messages: [
              ...previous.messages,
              ...fresh.flatMap(({ message }) => (message ? [message] : [])),
            ],
          };
          save(next);
          return next;
        });
      })
      .finally(() =>
        candidates.forEach(({ execution }) => pending.delete(execution.id)),
      );
  }, [loaded, tasks, data.executions]);

  useEffect(() => {
    const message = log.current?.lastElementChild;
    message?.scrollIntoView({
      block: message.classList.contains("has-genui") ? "start" : "end",
    });
  }, [chatOnly, stored.messages.length]);
  useEffect(() => {
    if (!chatProject && data.projects.length)
      setChatProject(data.projects[0].id);
  }, [chatProject, data.projects]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const target = chatTarget(draft, data.agents, to);
    const text = target.text;
    const agent = data.agents.find((item) => item.id === target.agentId);
    setChatError("");
    if (!agent && isProgressQuery(text)) {
      append([
        { from: "owner", text },
        {
          from: "ceo",
          source: "core",
          text: progressReport(data, chatProject || null),
          genUI: progressGenUI(data, chatProject || null),
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
    if (agent) {
      try {
        await bridge.createTask(
          directTaskInput(agent, chatProject, text, mock),
        );
        await onRefresh();
        setDraft("");
        append([
          { from: "owner", to: agent.id, text, projectId: chatProject },
          {
            from: agent.id === "astra" ? "ceo" : "agent",
            agentId: agent.id,
            source: "core",
            projectId: chatProject,
            link: "queue",
            text: `${agent.name} ได้รับข้อความแล้ว กดอนุมัติในแถบด้านบนเพื่อให้เริ่มตอบ${mock ? " (Mock · ไม่มี AI model)" : ""}`,
          },
        ]);
      } catch (cause) {
        setChatError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
      return;
    }
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
          genUI: fresh ? workflowGenUI(fresh, workflow) : undefined,
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
        genUI: progressGenUI(
          data,
          scope === "all" ? null : chatProject || null,
        ),
      },
    ]);
  }

  function draftFromGenUI(text: string, projectId?: string) {
    if (!loaded || busy) return;
    const target = projectId ?? chatProject;
    if (target && !data.projects.some((project) => project.id === target)) {
      setChatError("ไม่พบโปรเจกต์ของผลลัพธ์นี้");
      return;
    }
    if (draft.trim() && target !== chatProject) {
      setChatError("ยังมีร่างข้อความของโปรเจกต์ที่เลือกอยู่");
      document.getElementById("ceo-input")?.focus();
      return;
    }
    const next = [draft.trim(), text.trim()].filter(Boolean).join("\n\n");
    if (next.length > 4000) {
      setChatError("ร่างข้อความยาวเกิน 4,000 ตัวอักษร กรุณาย่อข้อความก่อน");
      return;
    }
    setChatError("");
    if (target) setChatProject(target);
    setDraft(next);
    document.getElementById("ceo-input")?.focus();
  }

  const running = tasks.filter((task) => task.status === "running").length;
  const chatProgress = progressOf(chatSteps);
  const flowTone = chatProgress.running
    ? ["run", "กำลังทำ"]
    : chatProgress.waiting
      ? ["wait", "รอคุณ"]
      : chatProgress.total && chatProgress.completed === chatProgress.total
        ? ["ok", "เสร็จแล้ว"]
        : ["idle", chatWorkflow ? "หยุดอยู่" : "ยังไม่มีงาน"];
  const focusedAgent = data.agents.find((agent) => agent.id === focused);

  function openNewGoal() {
    setDrawer("chat");
    requestAnimationFrame(() => document.getElementById("ceo-input")?.focus());
  }

  const projectSelect = (
    <>
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
    </>
  );

  const chatPanel = (
    <section
      className="drawer-panel home-chat"
      id="home-chat"
      tabIndex={-1}
      aria-label="ห้องแชทรวม"
    >
      <header className="drawer-head">
        <span className="room-avatars" aria-hidden="true">
          {data.agents.map((agent) => (
            <img
              key={agent.id}
              className="agent-avatar"
              data-agent={agent.characterKey}
              src={`/crewbots/${agent.characterKey}/portrait.svg`}
              alt=""
              width="32"
              height="32"
            />
          ))}
        </span>
        <div className="drawer-title">
          <h2>ห้องแชทรวม</h2>
          <p>
            {chatWorkflow
              ? `การส่งต่องาน · ${chatWorkflow.id.slice(0, 8)} · ${flowTone[1]}`
              : `${data.agents.length} agent · คุยกับทั้งทีม หรือพิมพ์ @ชื่อ เพื่อคุยตรง`}
          </p>
        </div>
        {!chatOnly && (
          <button
            type="button"
            className="icon quiet"
            aria-label="ปิดแชท"
            onClick={() => setDrawer(null)}
          >
            ×
          </button>
        )}
      </header>
      <div className="chat-thread">
        {loaded && chatProject && (
          <ChatApprovals
            key={chatProject}
            data={data}
            projectId={chatProject}
            onRefresh={onRefresh}
          />
        )}
        {chatWorkflow && chatSteps.length > 0 && (
          <details className="chat-handoffs" key={chatWorkflow.id}>
            <summary>
              <strong>การส่งต่องาน · {chatWorkflow.id.slice(0, 8)}</strong>
              <span>
                {currentStep
                  ? `${handoffRoute(currentStep, tasksById, data.agents)} · ${handoffStatus(currentStep)}`
                  : "ทุกขั้นสิ้นสุดแล้ว"}
              </span>
            </summary>
            <p>{chatWorkflow.objective}</p>
            <ol aria-label="ลำดับการส่งต่องาน">
              {chatSteps.map((task) => (
                <li key={task.id}>
                  <strong>{handoffRoute(task, tasksById, data.agents)}</strong>
                  <span>
                    {stepLabels[task.step] ?? task.title} ·{" "}
                    {handoffStatus(task)}
                  </span>
                </li>
              ))}
            </ol>
            <button className="link" onClick={() => onOpenPage("tasks")}>
              เปิด Task queue ↗
            </button>
          </details>
        )}
        <ol className="chat-log" ref={log} aria-live="polite">
          {stored.messages.map((message) => {
            const resultRef = native && chatExecutionRef(message);
            const speaker = message.agentId ?? "astra";
            const character =
              data.agents.find((agent) => agent.id === speaker)
                ?.characterKey ?? speaker;
            return (
              <li
                key={message.id}
                className={`bubble ${message.from}${message.genUI ? " has-genui" : ""}`}
              >
                {message.from === "owner" && (
                  <span className="bubble-meta">
                    ถึง{" "}
                    {message.to
                      ? agentName(data.agents, message.to)
                      : "ทั้งทีม"}
                  </span>
                )}
                {message.from !== "owner" && (
                  <span className="bubble-meta">
                    <img
                      className="agent-avatar"
                      data-agent={character}
                      src={`/crewbots/${character}/portrait.svg`}
                      alt=""
                      width="20"
                      height="20"
                    />
                    {agentName(data.agents, speaker)} ·{" "}
                    {message.runtime ?? "สถานะจาก Core"}
                    {message.workflowId &&
                      ` · ${message.workflowId.slice(0, 8)}`}
                  </span>
                )}
                <div className="bubble-body">
                  <p>{message.text}</p>
                  {message.genUI && (
                    <GenUI
                      spec={message.genUI}
                      onDraft={(text) => draftFromGenUI(text, message.projectId)}
                    />
                  )}
                </div>
                <span className="bubble-time">
                  {time(message.at)}
                  {resultRef && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => setPreview(resultRef)}
                    >
                      ดูผลการรัน
                    </button>
                  )}
                  {message.genUI && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => setExpanded(message)}
                    >
                      ขยายเต็มจอ
                    </button>
                  )}
                  {message.link === "queue" && (
                    <button
                      className="link"
                      onClick={() => onOpenPage("tasks")}
                    >
                      เปิด Task queue ↗
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {!stored.messages.length && (
            <li className="bubble ceo">
              <div className="bubble-body">
                <p>
                  {native
                    ? "กำลังเชื่อมต่อ Core…"
                    : "แชทรวมใช้ได้ใน Astra Desktop เท่านั้น"}
                </p>
              </div>
            </li>
          )}
        </ol>
      </div>
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
          {chatOnly ? (
            projectSelect
          ) : (
            <span className="chat-target">
              สั่งงานใน{" "}
              <b>
                {data.projects.find((item) => item.id === chatProject)?.name ??
                  "— เลือกโปรเจกต์ด้านบน"}
              </b>
            </span>
          )}
          <label className="chat-to">
            ส่งถึง
            <select
              value={to}
              disabled={!loaded || busy}
              onChange={(event) => setTo(event.target.value)}
            >
              <option value="">ทั้งทีม (ASTRA แตกงาน)</option>
              {data.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {agent.role}
                </option>
              ))}
            </select>
          </label>
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
        <div className="chat-compose">
          <label className="sr-only" htmlFor="ceo-input">
            ข้อความในห้องแชทรวม
          </label>
          <textarea
            id="ceo-input"
            rows={2}
            maxLength={4000}
            value={draft}
            disabled={!loaded || busy}
            placeholder="ข้อความ เช่น “เพิ่มหน้าตั้งค่าโปรไฟล์”, “@mira ช่วยดูหน้า login” หรือ “สถานะ”"
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
    </section>
  );

  const previewModal = (
    <>
      {preview && (
        <Modal title="ผลการรันที่บันทึกไว้" onClose={() => setPreview(null)}>
          <ExecutionResultView {...preview} agents={data.agents} />
        </Modal>
      )}
      {expanded?.genUI && (
        <Modal
          title={`${agentName(data.agents, expanded.agentId ?? "astra")} · ผลลัพธ์`}
          onClose={() => setExpanded(null)}
        >
          {expanded.text && <p className="genui-full-text">{expanded.text}</p>}
          <GenUI
            spec={expanded.genUI}
            onDraft={(text) => {
              setExpanded(null);
              draftFromGenUI(text, expanded.projectId);
            }}
          />
        </Modal>
      )}
    </>
  );

  if (chatOnly)
    return (
      <main className="home home-chat-page" id="chat" tabIndex={-1}>
        <header className="page-head">
          <h1>แชทรวม</h1>
          <span className="chip" data-tone={native ? "ok" : "wait"}>
            <span className="dot" />
            {native
              ? "Desktop Core connected"
              : "Browser preview · Desktop required"}
          </span>
        </header>
        {chatPanel}
        {previewModal}
      </main>
    );

  return (
    <main
      className="home workspace"
      id="home"
      tabIndex={-1}
      data-sidebar={sidebarOpen ? "open" : "closed"}
      data-drawer={drawer ? "open" : "closed"}
    >
      {sidebarOpen && (
        <WorkspaceSidebar
          data={data}
          native={native}
          states={agentStates}
          focused={focused}
          selectedProject={selected}
          onSelectProject={setSelected}
          onSelectAgent={(agent) => selectAgent(agent.id)}
          onAddProject={onAddProject}
          onRefresh={onRefresh}
          onAssignProject={(projectId) => {
            setChatProject(projectId);
            openNewGoal();
          }}
          onOpenRuntimes={() => onOpenPage("runtimes")}
          onOpenQueue={() => onOpenPage("tasks")}
          onCollapse={() => toggleSidebar(false)}
        />
      )}

      <section className="ws-stage" aria-labelledby="office-title">
        <h2 id="office-title" className="sr-only">
          ออฟฟิศ CrewBots
        </h2>
        <div
          className="home-stage"
          ref={stage}
          role={webgl ? "img" : undefined}
          aria-label={
            webgl
              ? agentStates
                  .map((agent) => `${agent.name} ${agent.activity}`)
                  .join(", ")
              : undefined
          }
        >
          {!webgl && (
            <div className="stage-fallback">
              {data.agents.map((agent) => (
                <button key={agent.id} onClick={() => selectAgent(agent.id)}>
                  <img
                    src={`/crewbots/${agent.characterKey}/idle.svg`}
                    alt=""
                    width="72"
                    height="84"
                  />
                  {agent.name}
                </button>
              ))}
              <small>อุปกรณ์นี้ไม่รองรับ WebGL2 จึงแสดงแบบ 2D</small>
            </div>
          )}
        </div>

        <div className="stage-toolbar">
          {!sidebarOpen && (
            <button
              type="button"
              className="icon quiet"
              aria-label="แสดงแถบทีม"
              onClick={() => toggleSidebar(true)}
            >
              »
            </button>
          )}
          {projectSelect}
          <span className="chip" data-tone={flowTone[0]}>
            {flowTone[1]}
          </span>
          <button
            type="button"
            className="primary"
            disabled={!loaded}
            onClick={openNewGoal}
          >
            ＋ งานใหม่
          </button>
        </div>

        {webgl && (
          <div className="stage-zoom" role="group" aria-label="มุมมองฉาก">
            <button
              type="button"
              className="icon quiet"
              aria-label="ซูมเข้า"
              onClick={() => scene.current?.zoomBy(1.25)}
            >
              ＋
            </button>
            <button
              type="button"
              className="icon quiet"
              aria-label="ซูมออก"
              onClick={() => scene.current?.zoomBy(0.8)}
            >
              －
            </button>
            <button
              type="button"
              className="icon quiet"
              aria-label="ดูทั้งห้อง"
              onClick={() => scene.current?.fit()}
            >
              ⛶
            </button>
          </div>
        )}
        {webgl && <Minimap scene={scene} />}

        <div className="stage-playback" role="group" aria-label="การแสดงผลฉาก">
          {webgl && (
            <button
              type="button"
              className="quiet"
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? "▶ เล่นต่อ" : "❚❚ หยุดภาพ"}
            </button>
          )}
          <span
            className="chip"
            data-tone={native ? "ok" : "wait"}
            title={
              native
                ? "Desktop Core connected"
                : "Browser preview · Desktop required"
            }
          >
            <span className="dot" />
            {native ? "Live" : "Preview"}
          </span>
          {webgl && (
            <button
              type="button"
              className="quiet"
              aria-label={`ความเร็วภาพ ${speed}x`}
              onClick={() => setSpeed(speed === 1 ? 2 : 1)}
            >
              {speed}x
            </button>
          )}
          <a
            className="playback-note"
            href={pageHref("themes")}
            onClick={(event) => onOpenPage("themes", event)}
          >
            ธีม: {worldById(world).name}
          </a>
          {running > 0 && (
            <span className="playback-note">กำลังทำ {running}</span>
          )}
          <button
            type="button"
            className="quiet"
            aria-pressed={drawer === "chat"}
            onClick={() => setDrawer(drawer === "chat" ? null : "chat")}
          >
            แชท
          </button>
        </div>
      </section>

      {drawer && (
        <aside className="ws-drawer" aria-label="แผงรายละเอียด">
          {drawer === "agent" && focusedAgent ? (
            <AgentPanel
              agent={focusedAgent}
              state={agentStates.find((item) => item.id === focusedAgent.id)}
              data={data}
              onClose={() => selectAgent(null)}
              onChat={() => {
                setTo(focusedAgent.id);
                setFocused(null);
                scene.current?.setFocus(null);
                openNewGoal();
              }}
              onOpenQueue={() => onOpenPage("tasks")}
              onOpenResult={(executionId, projectId) =>
                setPreview({ executionId, projectId })
              }
            />
          ) : (
            chatPanel
          )}
        </aside>
      )}
      {previewModal}
    </main>
  );
}
