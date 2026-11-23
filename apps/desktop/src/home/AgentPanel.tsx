import { useState, type KeyboardEvent } from "react";
import type { Agent, Snapshot } from "../../../../packages/shared/src";
import type { SceneAgent } from "./OfficeScene";
import { RuntimeBadge } from "./WorkspaceSidebar";
import { agentName } from "./ceo";
import {
  agentFocus,
  agentRunStats,
  jobDesks,
  runtimeNames,
  sceneBehaviour,
  sceneStatusLabels,
} from "./workspace";

const tones: Record<string, string> = {
  working: "run",
  waiting: "wait",
  error: "bad",
  idle: "idle",
  offline: "idle",
};
const tabs = [
  ["activity", "กิจกรรม"],
  ["config", "การตั้งค่า"],
] as const;

export function AgentPanel({
  agent,
  state,
  data,
  onClose,
  onOpenQueue,
  onOpenResult,
  onChat,
}: {
  agent: Agent;
  state: SceneAgent | undefined;
  data: Snapshot;
  onClose: () => void;
  onOpenQueue: () => void;
  onOpenResult: (executionId: string, projectId: string) => void;
  onChat?: () => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("activity");
  const status = state?.status ?? "idle";
  const focus = agentFocus(data, agent.id);
  const desk = jobDesks[agent.id];
  const stats = agentRunStats(data, agent.id);
  const objective = focus?.task.workflowId
    ? (data.workflows ?? []).find((flow) => flow.id === focus.task.workflowId)
        ?.objective
    : undefined;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex(([id]) => id === tab);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length][0];
    setTab(next);
    document.getElementById(`agent-tab-${next}`)?.focus();
  }

  return (
    <section className="drawer-panel" aria-labelledby="agent-panel-title">
      <header className="drawer-head">
        <img
          className="agent-avatar"
          data-agent={agent.characterKey}
          src={`/crewbots/${agent.characterKey}/portrait.svg`}
          alt=""
          width="48"
          height="48"
        />
        <div className="drawer-title">
          <div className="row">
            <h2 id="agent-panel-title">{agent.name}</h2>
            <span className="chip" data-tone={tones[status]}>
              {sceneStatusLabels[status]}
            </span>
          </div>
          <p>
            <RuntimeBadge adapter={agent.runtimeAdapter} /> {agent.role} ·{" "}
            {runtimeNames[agent.runtimeAdapter] ?? agent.runtimeAdapter}
          </p>
        </div>
        {onChat && (
          <button type="button" className="quiet" onClick={onChat}>
            แชทกับ {agent.name}
          </button>
        )}
        <button
          type="button"
          className="icon quiet"
          aria-label="ปิดรายละเอียด agent"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="drawer-tabs" role="tablist" aria-label="ข้อมูล agent">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`agent-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="agent-tabpanel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="drawer-body"
        role="tabpanel"
        id="agent-tabpanel"
        aria-labelledby={`agent-tab-${tab}`}
      >
        {tab === "activity" ? (
          <>
            <h3>งานปัจจุบัน</h3>
            {focus ? (
              <div className="kv-card">
                <p className="kv-lead">
                  {focus.label}
                  {objective ? ` — ${objective}` : ""}
                </p>
                <dl>
                  <div>
                    <dt>แสดงในฉากเป็น</dt>
                    <dd>{sceneBehaviour[status]}</dd>
                  </div>
                  <div>
                    <dt>ส่งต่อมาจาก</dt>
                    <dd>{focus.handedBy}</dd>
                  </div>
                  <div>
                    <dt>ขั้น</dt>
                    <dd>
                      {focus.step} จาก {focus.total}
                    </dd>
                  </div>
                </dl>
                <div className="kv-actions">
                  {focus.task.lastExecutionId && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenResult(
                          focus.task.lastExecutionId!,
                          focus.task.projectId,
                        )
                      }
                    >
                      ดูผลการรันล่าสุด
                    </button>
                  )}
                  <button type="button" onClick={onOpenQueue}>
                    เปิดคิวงาน
                  </button>
                </div>
              </div>
            ) : (
              <p className="hint">
                ยังไม่มีงานที่มอบให้ {agent.name} คุยหรือสั่งงานได้ในแชทรวม
              </p>
            )}

            {desk && (
              <>
                <h3>Job desk</h3>
                <div className="kv-card">
                  <dl>
                    <div>
                      <dt>นั่งที่</dt>
                      <dd>{desk.spot}</dd>
                    </div>
                    <div>
                      <dt>รับงานจาก</dt>
                      <dd>{desk.takesFrom}</dd>
                    </div>
                    <div>
                      <dt>ส่งต่อให้</dt>
                      <dd>{desk.handsOffTo}</dd>
                    </div>
                  </dl>
                </div>
              </>
            )}

            <h3>การรันในเครื่องนี้</h3>
            <dl className="stat-tiles">
              <div>
                <dt>ทั้งหมด</dt>
                <dd>{stats.total}</dd>
              </div>
              <div>
                <dt>สำเร็จ</dt>
                <dd>{stats.completed}</dd>
              </div>
              <div>
                <dt>ล้มเหลว</dt>
                <dd>{stats.failed}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <p className="kv-lead">{agent.description}</p>
            <div className="kv-card">
              <dl>
                <div>
                  <dt>Runtime</dt>
                  <dd>{runtimeNames[agent.runtimeAdapter] ?? agent.runtimeAdapter}</dd>
                </div>
                <div>
                  <dt>หัวหน้า</dt>
                  <dd>
                    {agent.supervisorId
                      ? agentName(data.agents, agent.supervisorId)
                      : "คุณ"}
                  </dd>
                </div>
                <div>
                  <dt>งานพร้อมกันสูงสุด</dt>
                  <dd>{agent.concurrencyLimit}</dd>
                </div>
                <div>
                  <dt>Sandbox</dt>
                  <dd>{agent.executionSettings.sandbox}</dd>
                </div>
              </dl>
            </div>
            <h3>สิทธิ์ใน workspace</h3>
            <ul className="tag-list">
              {agent.workspacePermissions.map((item) => (
                <li key={item} className="chip">
                  {item}
                </li>
              ))}
            </ul>
            <h3>ความสามารถ</h3>
            <ul className="tag-list">
              {agent.capabilities.map((item) => (
                <li key={item} className="chip">
                  {item}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
