import { useState } from "react";
import type { Snapshot } from "../../../../packages/shared/src";
import { bridge } from "../bridge";
import { FolderList } from "./FolderList";
import {
  agentName,
  clip,
  displayPath,
  progressOf,
  sortTasks,
  statusLabels,
  stepLabels,
} from "./ceo";

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

export function ProjectDetail({
  project,
  data,
  onBack,
  onAssign,
  onOpenQueue,
  onChanged,
}: {
  project: Snapshot["projects"][number];
  data: Snapshot;
  onBack: () => void;
  onAssign: () => void;
  onOpenQueue: () => void;
  onChanged?: () => Promise<void>;
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
      {project.folders?.length ? (
        <ProjectFolders project={project} onChanged={onChanged} />
      ) : (
        <code>{displayPath(project.path)}</code>
      )}
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
        <button onClick={onOpenQueue}>เปิด Task queue</button>
      </div>
    </div>
  );
}

function ProjectFolders({
  project,
  onChanged,
}: {
  project: Snapshot["projects"][number];
  onChanged?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const folders = project.folders ?? [];
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="project-folders" aria-label="Source folders">
      <h3>Source folders</h3>
      <FolderList
        rows={folders.map((folder) => ({ ...folder, warning: null }))}
        busy={busy}
        onAdd={() =>
          void act(async () => {
            const path = await bridge.pickFolder();
            if (path) await bridge.addProjectFolder(project.id, path);
          })
        }
        onRemove={(index) =>
          void act(() => bridge.removeProjectFolder(project.id, folders[index].id))
        }
        onMakePrimary={(index) =>
          void act(() => bridge.setPrimaryFolder(project.id, folders[index].id))
        }
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
