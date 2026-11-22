import { useEffect, useState, type KeyboardEvent } from "react";
import type { ExecutionEvent, Snapshot } from "../../../packages/shared/src";
import { bridge } from "./bridge";
import { ExecutionResultView, runtimeLabels } from "./ExecutionResultView";
import { ReviewDiff } from "./ReviewDiff";
import { WritingPanel, type WritingInfo } from "./WritingPanel";
import { clip, statusLabels } from "./home/ceo";
import { reviewChecks, reviewModel, type CheckState } from "./review";
import "./review.css";

export type ReviewTab = "changes" | "logs" | "result";

const runTone: Record<string, string> = {
  running: "run",
  completed: "ok",
  failed: "bad",
  canceled: "idle",
  queued: "run",
};
const checkIcon: Record<CheckState, string> = {
  passed: "✓",
  failed: "✕",
  running: "…",
  pending: "",
};
const checkWord: Record<CheckState, string> = {
  passed: "ผ่าน",
  failed: "ไม่ผ่าน",
  running: "กำลังทำ",
  pending: "ยังไม่เริ่ม",
};

export function ReviewPage({
  data,
  selectedRun,
  onSelectRun,
  events,
  tab,
  onTab,
  onCancel,
  onRefresh,
  onOpenQueue,
}: {
  data: Snapshot;
  selectedRun: string;
  onSelectRun: (id: string) => void;
  events: ExecutionEvent[];
  tab: ReviewTab;
  onTab: (tab: ReviewTab) => void;
  onCancel: (id: string) => void;
  onRefresh: () => Promise<void>;
  onOpenQueue: () => void;
}) {
  const model = selectedRun ? reviewModel(data, selectedRun) : null;
  const run = model?.run;
  const task = model?.task;

  // patch ของ FORGE (อ่านใหม่เมื่อสถานะงานเปลี่ยน)
  const writingKey =
    model?.writes && task ? `${task.id}:${task.status}:${run?.status}` : "";
  const [writing, setWriting] = useState<{ key: string; info: WritingInfo }>();
  useEffect(() => {
    if (!writingKey || !task) return;
    let active = true;
    void bridge.writingInfo(task.id).then(
      (info) => active && setWriting({ key: writingKey, info }),
      () => active && setWriting({ key: writingKey, info: emptyWriting }),
    );
    return () => {
      active = false;
    };
  }, [writingKey]);
  const info = writing?.key === writingKey ? writing.info : null;
  const patch = info?.patch ?? null;

  // สรุปผลจาก artifact/result ที่ Core บันทึก
  const resultKey = run ? `${run.id}:${run.status}` : "";
  const [summary, setSummary] = useState<{ key: string; text: string | null }>();
  useEffect(() => {
    if (!run) return;
    let active = true;
    void bridge.executionResult(run.id, run.projectId).then(
      (result) =>
        active && setSummary({ key: resultKey, text: result.event?.text ?? null }),
      () => active && setSummary({ key: resultKey, text: null }),
    );
    return () => {
      active = false;
    };
  }, [resultKey]);
  const summaryText = summary?.key === resultKey ? summary.text : undefined;

  const tabs: { id: ReviewTab; label: string }[] = [
    ...(patch
      ? [
          {
            id: "changes" as const,
            label: `การเปลี่ยนแปลง · ${patch.files.length} ไฟล์`,
          },
        ]
      : []),
    { id: "logs", label: "Log" },
    { id: "result", label: "ผลลัพธ์" },
  ];
  const active = tabs.some((item) => item.id === tab) ? tab : "logs";
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex((item) => item.id === active);
    const next =
      event.key === "ArrowRight"
        ? tabs[(index + 1) % tabs.length]
        : event.key === "ArrowLeft"
          ? tabs[(index - 1 + tabs.length) % tabs.length]
          : event.key === "Home"
            ? tabs[0]
            : event.key === "End"
              ? tabs[tabs.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    onTab(next.id);
    document.getElementById(`monitor-tab-${next.id}`)?.focus();
  }

  const avatar = model?.agent
    ? `/crewbots/${model.agent.characterKey}/portrait.svg`
    : undefined;
  const checks = model ? reviewChecks(model, patch?.state ?? null) : [];

  return (
    <section className="review span-12" aria-label="ตรวจงานของ agent">
      <header className="review-head">
        {avatar && (
          <img
            className="agent-avatar"
            data-agent={model?.agent?.characterKey}
            src={avatar}
            alt=""
            width="48"
            height="48"
          />
        )}
        <div className="review-title">
          <div className="review-title-row">
            <h2>
              {model
                ? `${model.label}${model.workflow ? ` — ${clip(model.workflow.objective, 90)}` : ""}`
                : "Execution monitor"}
            </h2>
            {run && (
              <span className="chip" data-tone={runTone[run.status] ?? "idle"}>
                {statusLabels[run.status] ?? run.status}
              </span>
            )}
          </div>
          {model && run ? (
            <p className="run-meta">
              <span>{model.project?.name ?? "โปรเจกต์ที่ถูกลบ"}</span>
              {model.total > 0 && (
                <span>
                  ขั้น {model.step} จาก {model.total}
                </span>
              )}
              <span>{model.agent?.name ?? run.agentId}</span>
              <span className="chip">
                {run.adapter === "mock"
                  ? "MOCK — no AI model"
                  : (runtimeLabels[run.adapter] ?? run.adapter)}
              </span>
              <span>PID {run.pid ?? "—"}</span>
              <code>{run.id.slice(0, 8)}</code>
            </p>
          ) : (
            <p className="hint">เลือก execution เพื่อตรวจสิ่งที่ agent ทำ</p>
          )}
          {run?.error && <p className="error-text">{run.error}</p>}
        </div>
        <div className="review-actions">
          <label className="inline-select">
            Execution
            <select
              value={selectedRun}
              onChange={(event) => onSelectRun(event.target.value)}
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
            <button className="danger" onClick={() => onCancel(run.id)}>
              Cancel execution
            </button>
          )}
        </div>
      </header>

      <div className="review-tabs" role="tablist" aria-label="รายละเอียดการรัน">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`monitor-tab-${item.id}`}
            aria-controls={`monitor-panel-${item.id}`}
            aria-selected={active === item.id}
            tabIndex={active === item.id ? 0 : -1}
            onClick={() => onTab(item.id)}
            onKeyDown={onTabKey}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="review-body" data-side={model ? "open" : "closed"}>
        <div className="review-main">
          {patch && (
            <div
              id="monitor-panel-changes"
              role="tabpanel"
              aria-labelledby="monitor-tab-changes"
              hidden={active !== "changes"}
            >
              {active === "changes" && (
                <ReviewDiff
                  key={task?.id}
                  avatar={avatar}
                  files={patch.files.map((file) => ({
                    path: file.path,
                    after: file.content,
                    before:
                      patch.before.find((item) => item.path === file.path)
                        ?.before ?? null,
                  }))}
                />
              )}
            </div>
          )}
          <div
            id="monitor-panel-result"
            role="tabpanel"
            aria-labelledby="monitor-tab-result"
            hidden={active !== "result"}
          >
            {active === "result" &&
              (run ? (
                <ExecutionResultView
                  key={run.id}
                  executionId={run.id}
                  projectId={run.projectId}
                  agents={data.agents}
                  status={run.status}
                />
              ) : (
                <p className="hint">เลือก execution เพื่อดูผลลัพธ์</p>
              ))}
          </div>
          <div
            id="monitor-panel-logs"
            role="tabpanel"
            aria-labelledby="monitor-tab-logs"
            hidden={active !== "logs"}
          >
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
                    <b data-kind={item.kind}>{item.kind}</b>
                    <pre>{item.text}</pre>
                  </div>
                ))
              ) : (
                <p className="hint">ยังไม่มี events สำหรับ execution ที่เลือก</p>
              )}
            </div>
          </div>
        </div>

        {model && run && (
          <aside className="review-side" aria-label="สรุปและการตรวจ">
            <section>
              <h3>สิ่งที่ {model.agent?.name ?? run.agentId} ทำ</h3>
              {summaryText === undefined ? (
                <p className="hint" role="status">
                  กำลังอ่านผลการรัน…
                </p>
              ) : summaryText ? (
                <p className="review-summary">{clip(summaryText, 420)}</p>
              ) : (
                <p className="hint">ยังไม่มีผลที่ Desktop Core บันทึกไว้</p>
              )}
            </section>
            <section>
              <h3>การตรวจ</h3>
              <ul className="check-list">
                {checks.map((check) => (
                  <li key={check.id} data-state={check.state}>
                    <span className="check-icon" aria-hidden="true">
                      {checkIcon[check.state]}
                    </span>
                    <span className="check-label">
                      {check.label}
                      <span className="sr-only"> · {checkWord[check.state]}</span>
                    </span>
                    <span className="check-detail">{check.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="hint">
                Core ยังไม่บันทึกผล type check, lint และ unit test แยกรายการ
              </p>
            </section>
            {model.writes && task && patch && (
              <WritingPanel
                taskId={task.id}
                status={task.status}
                attempts={task.attempts}
                refresh={onRefresh}
                onBusy={() => undefined}
                approvalOnly
                diff={false}
              />
            )}
            <button type="button" onClick={onOpenQueue}>
              เปิดคิวงาน
            </button>
          </aside>
        )}
      </div>
    </section>
  );
}

const emptyWriting: WritingInfo = { policy: null, digest: null, patch: null };
