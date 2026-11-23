import type { Agent, Snapshot } from "../../../packages/shared/src";
import { Icon } from "../../../packages/ui/src/icons";
import { IsoArt } from "../../../packages/ui/src/IsoArt";
import { deskIcons, deskStats, flowStages } from "./desks";
import { RuntimeBadge } from "./home/WorkspaceSidebar";
import type { SceneAgent } from "./home/OfficeScene";
import { jobDesks, sceneStatusLabels } from "./home/workspace";
import "./jobdesks.css";

const tones: Record<string, string> = {
  working: "run",
  waiting: "wait",
  error: "bad",
  idle: "idle",
  offline: "idle",
};

/** หน้า "ทีม" แบบ Job desks: ใครทำขั้นไหน และส่งงานต่อให้ใคร */
export function JobDesks({
  data,
  states,
  onDetails,
}: {
  data: Snapshot;
  states: SceneAgent[];
  onDetails: (agent: Agent) => void;
}) {
  const byId = new Map(data.agents.map((agent) => [agent.id, agent]));
  return (
    <div className="job-desks span-12">
      <section className="desk-section" aria-label="ลำดับการส่งต่องาน">
        <h2>ลำดับการส่งต่องาน</h2>
        <ol className="flow-strip">
          {flowStages.map((stage, index) => {
            const members = stage.agents
              .map((id) => byId.get(id))
              .filter((agent): agent is Agent => Boolean(agent));
            return (
              <li key={stage.id} className="flow-step">
                <div className="flow-art">
                  <IsoArt variant={stage.art} />
                </div>
                <div className="flow-text">
                  <p className="flow-index">
                    ขั้น {index + 1} · {stage.title}
                  </p>
                  <p className="flow-who">
                    <span className="avatar-stack" aria-hidden="true">
                      {members.map((agent) => (
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
                      {stage.withYou && (
                        <span className="you-avatar">
                          <Icon name="person" size={18} className="" />
                        </span>
                      )}
                    </span>
                    <b>
                      {[
                        ...members.map((agent) => agent.name),
                        ...(stage.withYou ? ["คุณ"] : []),
                      ].join(" และ ")}
                    </b>
                  </p>
                  <p className="flow-desc">{stage.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="desk-section" aria-label="โต๊ะงาน">
        <h2>
          {data.agents.length} โต๊ะงาน · {data.agents.length} agents
        </h2>
        <div className="desk-grid">
          {data.agents.map((agent) => {
            const desk = jobDesks[agent.id];
            const state = states.find((item) => item.id === agent.id);
            const status = state?.status ?? "idle";
            const stats = deskStats(data, agent.id);
            const titleId = `desk-${agent.id}`;
            return (
              <article
                key={agent.id}
                className="desk-card"
                aria-labelledby={titleId}
                aria-describedby={`${titleId}-agent`}
              >
                <div className="desk-scene" data-agent={agent.characterKey}>
                  <img
                    src={`/crewbots/${agent.characterKey}/${status === "working" ? "working" : status === "error" ? "error" : "idle"}.svg`}
                    alt=""
                    width="96"
                    height="112"
                  />
                  {desk && <span className="desk-caption">นั่งที่{desk.spot}</span>}
                </div>
                <div className="desk-body">
                  <div className="desk-role">
                    <span className="role-icon">
                      <Icon name={deskIcons[agent.id] ?? "users"} size={20} className="" />
                    </span>
                    <div>
                      <h3 id={titleId}>{agent.role}</h3>
                      <p>{agent.description}</p>
                    </div>
                  </div>
                  <p className="agent-chip" id={`${titleId}-agent`}>
                    <img
                      className="agent-avatar"
                      data-agent={agent.characterKey}
                      src={`/crewbots/${agent.characterKey}/portrait.svg`}
                      alt=""
                      width="28"
                      height="28"
                    />
                    <b>{agent.name}</b>
                    <RuntimeBadge adapter={agent.runtimeAdapter} />
                    <span className="chip" data-tone={tones[status]}>
                      {sceneStatusLabels[status]}
                    </span>
                  </p>
                  {desk && (
                    <dl className="desk-flow">
                      <div>
                        <dt>รับงานจาก</dt>
                        <dd>{desk.takesFrom}</dd>
                      </div>
                      <div>
                        <dt>ส่งต่อให้</dt>
                        <dd>{desk.handsOffTo}</dd>
                      </div>
                    </dl>
                  )}
                  <div className="desk-foot">
                    <span>
                      เสร็จ {stats.done} งาน · ค้าง {stats.open} งาน
                    </span>
                    <button type="button" onClick={() => onDetails(agent)}>
                      รายละเอียด
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
