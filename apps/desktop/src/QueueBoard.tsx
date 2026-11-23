import { useState, type FormEvent } from "react";
import type {
  Snapshot,
  QueueTask,
  AdapterId,
} from "../../../packages/shared/src";
import { Modal } from "../../../packages/ui/src/Modal";
import { bridge, desktopAvailable } from "./bridge";
import { QueueTaskDialog } from "./QueueTaskDialog";
import { agentName, statusLabels, stepLabels } from "./home/ceo";

const laneTone: Record<string, string> = {
  running: "run",
  queued: "run",
  ready: "wait",
  needs_review: "wait",
  blocked: "wait",
  failed: "bad",
  completed: "ok",
};

export function QueueBoard({
  data,
  filter,
  onFilterChange,
  onRefresh,
  onExecution,
}: {
  data: Snapshot;
  filter: string;
  onFilterChange: (id: string) => void;
  onRefresh: () => Promise<void>;
  onExecution: (id: string) => void;
}) {
  const [modal, setModal] = useState<"task" | "workflow" | QueueTask | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tasks = data.tasks ?? [];
  const workflows = data.workflows ?? [];
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
    ["รออนุมัติ", ["draft", "ready", "blocked"]],
    ["กำลังทำ", ["queued", "running"]],
    ["ตรวจ / ผลลัพธ์", ["needs_review", "completed", "failed", "canceled"]],
  ] as const;
  const paused = data.schedulerPaused ?? true;
  const visible = tasks.filter((t) => !filter || t.workflowId === filter);
  return (
    <section className="tile queue-panel" id="tasks" tabIndex={-1}>
      <div className="tile-head">
        <div>
          <h2>Task queue & workflows</h2>
          <p>
            {paused ? "Scheduling paused" : "Scheduling active"} · read-only /
            staged writing · human gates
          </p>
        </div>
        <div className="tile-actions">
          <button
            disabled={!desktopAvailable() || busy}
            onClick={() => void perform(() => bridge.scheduling(!paused))}
          >
            {paused ? "Resume scheduling" : "Pause scheduling"}
          </button>
          <button
            disabled={!desktopAvailable() || busy}
            onClick={() => {
              setError("");
              setModal("task");
            }}
          >
            <span className="plus" aria-hidden="true">
              ＋
            </span>
            Add task
          </button>
          <button
            className="primary"
            disabled={!desktopAvailable() || busy}
            onClick={() => {
              setError("");
              setModal("workflow");
            }}
          >
            <span className="plus" aria-hidden="true">
              ＋
            </span>
            New workflow
          </button>
        </div>
      </div>
      {!modal && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="queue-toolbar">
        <label className="inline-select">
          Workflow filter
          <select value={filter} onChange={(e) => onFilterChange(e.target.value)}>
            <option value="">All tasks</option>
            {workflows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.objective.slice(0, 60)} · {f.status} · rework {f.reworkCount}
                /2
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Pause หยุดเฉพาะงานใหม่ · FORGE ส่ง staged patch ให้คุณตรวจก่อน Core
          เขียนไฟล์
        </p>
      </div>
      <div className="queue-columns">
        {columns.map(([title, states]) => {
          const items = visible.filter((t) =>
            (states as readonly string[]).includes(t.status),
          );
          return (
            <section key={title} aria-label={title} className="lane well">
              <h3>
                {title} <span className="count">{items.length}</span>
              </h3>
              {items.map((task) => (
                <button
                  className="queue-card"
                  key={task.id}
                  data-tone={laneTone[task.status] ?? "idle"}
                  onClick={() => {
                    setError("");
                    setModal(task);
                  }}
                >
                  <span className="queue-title">
                    <img
                      className="agent-avatar"
                      data-agent={task.agentId}
                      src={`/crewbots/${task.agentId}/portrait.svg`}
                      width="32"
                      height="32"
                      alt=""
                    />
                    <span className="queue-name">
                      <b>{task.title}</b>
                      <small>
                        {agentName(data.agents, task.agentId)}
                        {task.step !== "task" && stepLabels[task.step]
                          ? ` · ${stepLabels[task.step]}`
                          : ""}
                      </small>
                    </span>
                  </span>
                  <span className="queue-meta">
                    <span className="chip" data-tone={laneTone[task.status] ?? "idle"}>
                      {statusLabels[task.status] ?? task.status}
                    </span>
                    {task.gate &&
                      !["completed", "failed", "canceled"].includes(
                        task.status,
                      ) && (
                        <span className="chip" data-tone="wait">
                          ต้องให้คุณอนุมัติ
                        </span>
                      )}
                    {task.adapter === "mock" && <span className="chip">MOCK</span>}
                    <span>
                      P{task.priority} · ลอง {task.attempts}/{task.retryLimit + 1}
                      {task.dependencies.length
                        ? ` · รอ ${task.dependencies.length} งาน`
                        : ""}
                    </span>
                  </span>
                  {task.blocker && (
                    <span className="queue-blocker">{task.blocker}</span>
                  )}
                </button>
              ))}
              {!items.length && (
                <p className="hint lane-empty">ยังไม่มี task ในสถานะนี้</p>
              )}
            </section>
          );
        })}
      </div>
      {selected && (
        <QueueTaskDialog
          key={selected.id}
          task={selected}
          tasks={tasks}
          onRefresh={onRefresh}
          onExecution={onExecution}
          onClose={() => setModal(null)}
        />
      )}
      {(modal === "task" || modal === "workflow") && (
        <Modal
          title={modal === "workflow" ? "New workflow" : "Add queue task"}
          busy={busy}
          onClose={() => setModal(null)}
        >
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
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
                <p className="hint">
                  Full team มี plan/UAT gates; Approved writing ใช้
                  objective/แบบที่เจ้าของอนุมัติแล้ว เริ่ม FORGE
                  โดยยังต้องอนุมัติ scope, run, exact patch และ UAT แยกทุกครั้ง
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
                  <textarea required name="prompt" maxLength={4000} rows={4} />
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
                <p className="hint">
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
        </Modal>
      )}
    </section>
  );
}
