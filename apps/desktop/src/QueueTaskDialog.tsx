import { useEffect, useState } from "react";
import type {
  ExecutionEvent,
  QueueTask,
  TaskEvent,
} from "../../../packages/shared/src";
import { Modal } from "../../../packages/ui/src/Modal";
import { bridge } from "./bridge";
import { WritingPanel } from "./WritingPanel";
import { readExecutionResult } from "./executionResult";

export function QueueTaskDialog({
  task: selected,
  tasks,
  onClose,
  onRefresh,
  onExecution,
  approvalOnly = false,
  canApprove,
  canReview,
}: {
  task: QueueTask;
  tasks: QueueTask[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onExecution?: (id: string) => void;
  approvalOnly?: boolean;
  canApprove?: boolean;
  canReview?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [writingBusy, setWritingBusy] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reviewResult, setReviewResult] = useState<ExecutionEvent | null>();
  const [reviewError, setReviewError] = useState("");
  const taskId = selected.id;
  const combinedBusy = busy || writingBusy;
  const mayApprove =
    canApprove ?? ["draft", "ready", "blocked"].includes(selected.status);
  const mayReview =
    canReview ??
    (selected.status === "needs_review" && selected.step === "review");
  const reviewRun = mayReview ? selected.lastExecutionId : null;
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await bridge.queueEvents(taskId);
        if (active) setEvents(result);
      } catch (cause) {
        if (active) setError(String(cause));
      }
      if (active) timer = setTimeout(() => void poll(), 1000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [taskId]);
  useEffect(() => {
    if (!reviewRun) return;
    let active = true;
    setReviewResult(undefined);
    setReviewError("");
    void readExecutionResult((after) => bridge.events(reviewRun, after))
      .then((result) => {
        if (active) setReviewResult(result ?? null);
      })
      .catch((cause) => {
        if (active) setReviewError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [reviewRun]);

  async function perform(action: () => Promise<unknown>, close = false) {
    if (combinedBusy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      await onRefresh();
      if (close) onClose();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={selected.title} busy={combinedBusy} onClose={onClose}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p>
        {selected.adapter === "mock" ? "MOCK — no AI model" : selected.adapter}{" "}
        · {selected.status} · {selected.step}
      </p>
      <pre className="task-prompt">{selected.prompt}</pre>
      <p className="hint">
        Dependencies:{" "}
        {selected.dependencies
          .map((id) => tasks.find((t) => t.id === id)?.title ?? id)
          .join(", ") || "None"}
      </p>
      <p className="hint">{selected.blocker}</p>
      {selected.step === "review" && mayApprove && (
        <section>
          <label>
            Owner verification evidence (ผลทดสอบภายนอก ไม่ใช่ผลที่ model รันเอง)
            <textarea
              rows={4}
              maxLength={2000}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <button
            disabled={combinedBusy || !evidence.trim()}
            onClick={() =>
              void perform(
                () =>
                  bridge.queueAction(selected.id, "review_evidence", evidence),
                true,
              )
            }
          >
            Save review evidence
          </button>
        </section>
      )}
      <div className="modal-actions start">
        {mayApprove && (
          <button
            disabled={combinedBusy}
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
        {!approvalOnly && ["failed", "canceled"].includes(selected.status) && (
          <button
            disabled={combinedBusy}
            onClick={() =>
              void perform(() => bridge.queueAction(selected.id, "retry"), true)
            }
          >
            Request fresh retry
          </button>
        )}
        {!approvalOnly &&
          !["completed", "canceled"].includes(selected.status) && (
            <button
              disabled={combinedBusy}
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
        {onExecution && selected.lastExecutionId && (
          <button
            disabled={combinedBusy}
            onClick={() => {
              onClose();
              onExecution(selected.lastExecutionId!);
            }}
          >
            View execution logs
          </button>
        )}
      </div>
      {selected.agentId === "forge" &&
        selected.adapter === "claude" &&
        (!approvalOnly || mayApprove || canReview || writingBusy) && (
          <WritingPanel
            attempts={selected.attempts}
            taskId={selected.id}
            status={selected.status}
            refresh={onRefresh}
            onBusy={setWritingBusy}
            disabled={busy}
            approvalOnly={approvalOnly}
          />
        )}
      {mayReview && selected.step === "review" && (
        <>
          <h3>ผลตรวจจาก SCOUT</h3>
          {reviewError ? (
            <p className="error" role="alert">
              {reviewError}
            </p>
          ) : reviewResult ? (
            <pre className="task-prompt">{reviewResult.text}</pre>
          ) : (
            <p className="hint" role="status">
              {reviewRun && reviewResult === undefined
                ? "กำลังอ่านผลตรวจ…"
                : "ไม่มีผลตรวจที่บันทึกไว้"}
            </p>
          )}
          <label>
            Human review note
            <textarea
              rows={3}
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="modal-actions start">
            <button
              disabled={combinedBusy || !note.trim()}
              onClick={() =>
                void perform(
                  () => bridge.queueAction(selected.id, "accept_review", note),
                  true,
                )
              }
            >
              Accept review
            </button>
            <button
              disabled={combinedBusy || !note.trim()}
              onClick={() =>
                void perform(
                  () => bridge.queueAction(selected.id, "rework", note),
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
    </Modal>
  );
}
