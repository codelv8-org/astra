import { useEffect, useState, type FormEvent } from "react";
import type {
  Snapshot,
  QueueTask,
  TaskEvent,
  AdapterId,
} from "../../../packages/shared/src";
import { Modal } from "../../../packages/ui/src/Modal";
import { bridge, desktopAvailable } from "./bridge";
import { WritingPanel } from "./WritingPanel";

export function QueueBoard({
  data,
  onRefresh,
  onExecution,
}: {
  data: Snapshot;
  onRefresh: () => Promise<void>;
  onExecution: (id: string) => void;
}) {
  const [modal, setModal] = useState<"task" | "workflow" | QueueTask | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [filter, setFilter] = useState("");
  const tasks = data.tasks ?? [];
  const workflows = data.workflows ?? [];
  useEffect(() => {
    if (modal && typeof modal === "object") {
      let active = true;
      let timer: ReturnType<typeof setTimeout>;
      async function poll() {
        try {
          const result = await bridge.queueEvents((modal as QueueTask).id);
          if (active) setEvents(result);
        } catch (e) {
          if (active) setError(String(e));
        }
        if (active) timer = setTimeout(() => void poll(), 1000);
      }
      void poll();
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
    setEvents([]);
  }, [modal]);
  async function perform(action: () => Promise<unknown>, close = false) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onRefresh();
      if (close) setModal(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectId = String(form.get("projectId"));
    if (modal === "workflow") {
      await perform(
        () =>
          (form.get("template") === "writing"
            ? bridge.createWritingWorkflow
            : bridge.createWorkflow)(
            projectId,
            String(form.get("objective")),
            form.get("mock") === "on",
          ),
        true,
      );
      return;
    }
    await perform(
      () =>
        bridge.createTask({
          projectId,
          agentId: String(form.get("agentId")),
          adapter: String(form.get("adapter")) as AdapterId,
          title: String(form.get("title")),
          prompt: String(form.get("prompt")),
          dependencies: form.getAll("dependencies").map(String),
          priority: Number(form.get("priority")),
          timeoutSeconds: Number(form.get("timeout")),
          retryLimit: Number(form.get("retries")),
        }),
      true,
    );
  }
  const selected =
    typeof modal === "object" && modal
      ? (tasks.find((t) => t.id === modal.id) ?? modal)
      : null;
  const columns = [
    ["รออนุมัติ / Blocked", ["draft", "ready", "blocked"]],
    ["Queued / Running", ["queued", "running"]],
    ["Review / Results", ["needs_review", "completed", "failed", "canceled"]],
  ] as const;
  return (
    <section className="panel queue-panel" id="tasks">
      <div className="section-heading">
        <div>
          <h2>Task queue & workflows</h2>
          <p className="muted">
            {(data.schedulerPaused ?? true)
              ? "Scheduling paused"
              : "Scheduling active"}{" "}
            · Read-only / staged writing · Human approval gates
          </p>
        </div>
        <div className="queue-actions">
          <button
            disabled={!desktopAvailable() || busy}
            onClick={() =>
              void perform(() =>
                bridge.scheduling(!(data.schedulerPaused ?? true)),
              )
            }
          >
            {(data.schedulerPaused ?? true)
              ? "Resume scheduling"
              : "Pause scheduling"}
          </button>
          <button
            disabled={!desktopAvailable() || busy}
            onClick={() => {
              setError("");
              setModal("task");
            }}
          >
            ＋ Add task
          </button>
          <button
            disabled={!desktopAvailable() || busy}
            onClick={() => {
              setError("");
              setModal("workflow");
            }}
          >
            ＋ New workflow
          </button>
        </div>
      </div>
      <p className="muted">
        Pause หยุดเฉพาะงานใหม่ · Resume scheduling ไม่ใช่ resume session · FORGE
        ส่ง staged patch ให้ human ตรวจและอนุมัติก่อน Rust Core เขียนไฟล์
      </p>
      {!modal && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label>
        Workflow filter
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All tasks</option>
          {workflows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.objective.slice(0, 60)} · {f.status} · rework {f.reworkCount}/2
            </option>
          ))}
        </select>
      </label>
      <div className="queue-columns">
        {columns.map(([title, states]) => (
          <section key={title} aria-label={title}>
            <h3>{title}</h3>
            {tasks
              .filter(
                (t) =>
                  (!filter || t.workflowId === filter) &&
                  (states as readonly string[]).includes(t.status),
              )
              .map((task) => (
                <button
                  className="queue-card"
                  key={task.id}
                  onClick={() => {
                    setError("");
                    setNote("");
                    setModal(task);
                  }}
                >
                  <span>
                    <img
                      src={`/crewbots/${task.agentId}/icon.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                    {task.title}
                  </span>
                  <small>
                    {task.adapter === "mock" ? "MOCK · " : ""}
                    {task.status}
                    {task.gate ? " · HUMAN GATE" : ""} · P{task.priority}
                  </small>
                  <small>
                    Attempts {task.attempts}/{task.retryLimit + 1} ·{" "}
                    {task.dependencies.length} dependencies
                  </small>
                  {task.blocker && <small>{task.blocker}</small>}
                </button>
              ))}
            {!tasks.some(
              (t) =>
                (!filter || t.workflowId === filter) &&
                (states as readonly string[]).includes(t.status),
            ) && <p className="muted">ยังไม่มี task ในสถานะนี้</p>}
          </section>
        ))}
      </div>
      {modal && (
        <Modal
          title={
            selected
              ? selected.title
              : modal === "workflow"
                ? "New workflow"
                : "Add queue task"
          }
          busy={busy}
          onClose={() => setModal(null)}
        >
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {selected ? (
            <>
              <p>
                {selected.adapter === "mock"
                  ? "MOCK — no AI model"
                  : selected.adapter}{" "}
                · {selected.status} · {selected.step}
              </p>
              <pre className="task-prompt">{selected.prompt}</pre>
              <p className="muted">
                Dependencies:{" "}
                {selected.dependencies
                  .map((id) => tasks.find((t) => t.id === id)?.title ?? id)
                  .join(", ") || "None"}
              </p>
              <p className="muted">{selected.blocker}</p>
              {selected.step === "review" &&
                ["draft", "ready", "blocked"].includes(selected.status) && (
                  <section>
                    <label>
                      Owner verification evidence (ผลทดสอบภายนอก ไม่ใช่ผลที่
                      model รันเอง)
                      <textarea
                        rows={4}
                        maxLength={2000}
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={busy || !evidence.trim()}
                      onClick={() =>
                        void perform(
                          () =>
                            bridge.queueAction(
                              selected.id,
                              "review_evidence",
                              evidence,
                            ),
                          true,
                        )
                      }
                    >
                      Save review evidence
                    </button>
                  </section>
                )}
              <div className="queue-actions">
                {["draft", "ready", "blocked"].includes(selected.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () => bridge.queueAction(selected.id, "approve"),
                        true,
                      )
                    }
                  >
                    {selected.gate
                      ? "Approve human gate"
                      : "Review & approve queue task"}
                  </button>
                )}
                {["failed", "canceled"].includes(selected.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () => bridge.queueAction(selected.id, "retry"),
                        true,
                      )
                    }
                  >
                    Request fresh retry
                  </button>
                )}
                {!["completed", "canceled"].includes(selected.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () => bridge.queueAction(selected.id, "cancel"),
                        true,
                      )
                    }
                  >
                    Cancel task
                  </button>
                )}
                {selected.lastExecutionId && (
                  <button
                    onClick={() => {
                      onExecution(selected.lastExecutionId!);
                      setModal(null);
                      requestAnimationFrame(() =>
                        document.getElementById("monitor")?.scrollIntoView(),
                      );
                    }}
                  >
                    View execution logs
                  </button>
                )}
              </div>
              {selected.agentId === "forge" &&
                selected.adapter === "claude" && (
                  <WritingPanel
                    attempts={selected.attempts}
                    taskId={selected.id}
                    status={selected.status}
                    refresh={onRefresh}
                  />
                )}
              {selected.status === "needs_review" &&
                selected.step === "review" && (
                  <>
                    <label>
                      Human review note
                      <textarea
                        rows={3}
                        value={note}
                        maxLength={2000}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <div className="queue-actions">
                      <button
                        disabled={busy || !note.trim()}
                        onClick={() =>
                          void perform(
                            () =>
                              bridge.queueAction(
                                selected.id,
                                "accept_review",
                                note,
                              ),
                            true,
                          )
                        }
                      >
                        Accept review
                      </button>
                      <button
                        disabled={busy || !note.trim()}
                        onClick={() =>
                          void perform(
                            () =>
                              bridge.queueAction(selected.id, "rework", note),
                            true,
                          )
                        }
                      >
                        Request rework (max 2)
                      </button>
                    </div>
                  </>
                )}
              <h3>Task event history</h3>
              <div className="task-history">
                {events.map((e) => (
                  <p key={e.id}>
                    <b>{e.kind}</b> · {e.text}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <form onSubmit={(e) => void submit(e)}>
              <label>
                Project
                <select required name="projectId">
                  <option value="">เลือก approved project</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {modal === "workflow" ? (
                <>
                  <label>
                    Workflow template
                    <select name="template">
                      <option value="full">Full team · 8 steps</option>
                      <option value="writing">
                        Approved writing · FORGE → SCOUT → UAT → ASTRA
                      </option>
                    </select>
                  </label>
                  <label>
                    Workflow objective
                    <textarea
                      required
                      name="objective"
                      maxLength={2000}
                      rows={5}
                    />
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="mock" defaultChecked />
                    ใช้ Mock Adapter ทั้ง workflow (ไม่มี real AI results)
                  </label>
                  <p className="muted">
                    Full team มี plan/UAT gates; Approved writing ใช้
                    objective/แบบที่เจ้าของอนุมัติแล้ว เริ่ม FORGE
                    โดยยังต้องอนุมัติ scope, run, exact patch และ UAT
                    แยกทุกครั้ง
                  </p>
                </>
              ) : (
                <>
                  <label>
                    Task title
                    <input required name="title" maxLength={140} />
                  </label>
                  <div className="form-grid">
                    <label>
                      Agent
                      <select name="agentId">
                        {data.agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Runtime
                      <select name="adapter">
                        <option value="mock">MOCK — no AI</option>
                        <option value="codex">Codex</option>
                        <option value="claude">Claude Code</option>
                        <option value="antigravity">Antigravity</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Task prompt
                    <textarea
                      required
                      name="prompt"
                      maxLength={4000}
                      rows={4}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Priority (0–100)
                      <input
                        name="priority"
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={50}
                        required
                      />
                    </label>
                    <label>
                      Timeout seconds
                      <input
                        name="timeout"
                        type="number"
                        min={5}
                        max={600}
                        defaultValue={120}
                        required
                      />
                    </label>
                    <label>
                      Retry limit (0–2)
                      <input
                        name="retries"
                        type="number"
                        min={0}
                        max={2}
                        defaultValue={2}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Dependencies
                    <select name="dependencies" multiple size={4}>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} · {t.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    Dependencies ต้องอยู่ project เดียวกัน; task
                    ที่สร้างใหม่อ้างได้เฉพาะ task เดิม จึงไม่สร้าง cyclic graph
                  </p>
                </>
              )}
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
                  {busy ? "กำลังสร้าง…" : "Create draft"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}
