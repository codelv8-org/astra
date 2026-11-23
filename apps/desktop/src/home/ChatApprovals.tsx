import { useState } from "react";
import type { Snapshot } from "../../../../packages/shared/src";
import { Modal } from "../../../../packages/ui/src/Modal";
import { bridge } from "../bridge";
import { QueueTaskDialog } from "../QueueTaskDialog";
import {
  agentName,
  chatApprovalLabel,
  pendingChatApprovals,
  stepLabels,
} from "./ceo";

export function ChatApprovals({
  data,
  projectId,
  onRefresh,
}: {
  data: Snapshot;
  projectId: string;
  onRefresh: () => Promise<void>;
}) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState("");
  const tasks = data.tasks ?? [];
  const workflows = new Map(
    (data.workflows ?? []).map((flow) => [flow.id, flow]),
  );
  const activeWorkflows = new Set(
    [...workflows.values()]
      .filter((flow) => flow.status === "active")
      .map((flow) => flow.id),
  );
  const pending = pendingChatApprovals(tasks, projectId, activeWorkflows);
  const queued = tasks.filter(
    (task) => task.status === "queued" && task.approved,
  );
  const canResume =
    data.schedulerPaused === true &&
    queued.some((task) => task.projectId === projectId);
  const selected = tasks.find(
    (task) => task.projectId === projectId && task.id === taskId,
  );

  async function resume() {
    if (resuming || !canResume) return;
    setResuming(true);
    setError("");
    try {
      await bridge.scheduling(false);
      await onRefresh();
      setResumeOpen(false);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setResuming(false);
    }
  }

  if (!pending.length && !canResume && !selected && !resumeOpen) return null;
  return (
    <>
      {(pending.length > 0 || canResume) && (
        <section className="chat-approvals" aria-label="รายการรอการยืนยัน">
          <h3>รอการยืนยัน</h3>
          <ul>
            {pending.map(({ task, label }) => {
              const workflow = task.workflowId
                ? workflows.get(task.workflowId)
                : undefined;
              return (
                <li key={task.id}>
                  <div>
                    <strong>
                      {agentName(data.agents, task.agentId)} ·{" "}
                      {stepLabels[task.step] ?? task.title}
                    </strong>
                    {workflow && <span>{workflow.objective}</span>}
                  </div>
                  <button
                    aria-label={`${label} · ${task.title}`}
                    onClick={() => setTaskId(task.id)}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
            {canResume && (
              <li>
                <div>
                  <strong>Scheduling พักอยู่</strong>
                  <span>มีงานที่อนุมัติแล้วรอเริ่ม</span>
                </div>
                <button
                  onClick={() => {
                    setError("");
                    setResumeOpen(true);
                  }}
                >
                  เปิดการจัดคิว
                </button>
              </li>
            )}
          </ul>
        </section>
      )}
      {selected && (
        <QueueTaskDialog
          key={selected.id}
          task={selected}
          tasks={tasks}
          approvalOnly
          canApprove={
            chatApprovalLabel(selected, activeWorkflows) !== null &&
            selected.status === "ready"
          }
          canReview={
            chatApprovalLabel(selected, activeWorkflows) !== null &&
            selected.status === "needs_review"
          }
          onRefresh={onRefresh}
          onClose={() => setTaskId(null)}
        />
      )}
      {resumeOpen && (
        <Modal
          title="ยืนยันเปิดการจัดคิว"
          busy={resuming}
          onClose={() => setResumeOpen(false)}
        >
          <p>
            การจัดคิวมีผลทุกโปรเจกต์ งานที่อนุมัติแล้วในคิวอาจเริ่มรันหลังยืนยัน
            ({queued.length} งาน)
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button disabled={resuming} onClick={() => setResumeOpen(false)}>
              ยกเลิก
            </button>
            <button
              className="primary"
              disabled={resuming || !canResume}
              onClick={() => void resume()}
            >
              ยืนยัน Resume scheduling
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
