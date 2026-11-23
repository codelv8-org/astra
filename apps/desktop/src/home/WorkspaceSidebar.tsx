import { useState } from "react";
import type { Agent, Snapshot } from "../../../../packages/shared/src";
import type { SceneAgent } from "./OfficeScene";
import { ProjectDetail } from "./ProjectDetail";
import { clip, progressOf } from "./ceo";
import { groupByRole, runtimeMonogram, runtimeNames } from "./workspace";

export function RuntimeBadge({ adapter }: { adapter: string }) {
  return (
    <span
      className="runtime-badge"
      data-runtime={adapter}
      title={runtimeNames[adapter] ?? adapter}
    >
      <span aria-hidden="true">{runtimeMonogram[adapter] ?? "··"}</span>
      <span className="sr-only">{runtimeNames[adapter] ?? adapter}</span>
    </span>
  );
}

export function WorkspaceSidebar({
  data,
  native,
  states,
  focused,
  selectedProject,
  onSelectProject,
  onSelectAgent,
  onAddProject,
  onAssignProject,
  onOpenRuntimes,
  onOpenQueue,
  onCollapse,
  onRefresh,
}: {
  data: Snapshot;
  native: boolean;
  states: SceneAgent[];
  focused: string | null;
  selectedProject: string | null;
  onSelectProject: (id: string | null) => void;
  onSelectAgent: (agent: Agent) => void;
  onAddProject: () => void;
  onAssignProject: (id: string) => void;
  onOpenRuntimes: () => void;
  onOpenQueue: () => void;
  onCollapse: () => void;
  onRefresh?: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const tasks = data.tasks ?? [];
  const workflows = data.workflows ?? [];
  const project = data.projects.find((item) => item.id === selectedProject);
  const runtimes = [...new Set(data.agents.map((agent) => agent.runtimeAdapter))];
  const groups = groupByRole(data.agents, query);

  return (
    <aside className="ws-sidebar" aria-label="ทีมและโปรเจกต์">
      <div className="ws-sidebar-head">
        <div>
          <h1>Astra</h1>
          <p className="core-status" data-tone={native ? "ok" : "wait"}>
            <span className="dot" />
            {native
              ? "Desktop Core connected"
              : "Browser preview · Desktop required"}
          </p>
        </div>
        <button
          type="button"
          className="icon quiet"
          aria-label="ซ่อนแถบทีม"
          onClick={onCollapse}
        >
          «
        </button>
      </div>

      {project ? (
        <div className="ws-sidebar-body" id="home-projects" tabIndex={-1}>
          <ProjectDetail
            project={project}
            data={data}
            onBack={() => onSelectProject(null)}
            onAssign={() => onAssignProject(project.id)}
            onOpenQueue={onOpenQueue}
            onChanged={onRefresh}
          />
        </div>
      ) : (
        <div className="ws-sidebar-body">
          <section className="connect-card" aria-labelledby="connect-title">
            <h2 id="connect-title">รวมทีม agent ของคุณ</h2>
            <p>ใช้ runtime ที่คุณรันอยู่แล้ว ทีมส่งงานต่อกันในห้องเดียว</p>
            <div className="runtime-row">
              {runtimes.map((adapter) => (
                <RuntimeBadge key={adapter} adapter={adapter} />
              ))}
            </div>
            <button type="button" onClick={onOpenRuntimes}>
              ตั้งค่า Runtime
            </button>
          </section>

          <label className="ws-search">
            <span className="sr-only">ค้นหา agent</span>
            <input
              type="search"
              value={query}
              placeholder="ค้นหา agent"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          {groups.length ? (
            groups.map(({ role, members }) => (
              <section key={role} className="agent-group">
                <h3>
                  {role} ({members.length})
                </h3>
                <ul>
                  {members.map((agent) => {
                    const state = states.find((item) => item.id === agent.id);
                    return (
                      <li key={agent.id}>
                        <button
                          type="button"
                          className="agent-row"
                          aria-pressed={focused === agent.id}
                          data-status={state?.status ?? "idle"}
                          onClick={() => onSelectAgent(agent)}
                        >
                          <img
                            className="agent-avatar"
                            data-agent={agent.characterKey}
                            src={`/crewbots/${agent.characterKey}/portrait.svg`}
                            alt=""
                            width="40"
                            height="40"
                          />
                          <span className="agent-text">
                            <b>{agent.name}</b>
                            <small>{state?.activity ?? agent.role}</small>
                          </span>
                          <RuntimeBadge adapter={agent.runtimeAdapter} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          ) : (
            <p className="hint">ไม่พบ agent ที่ตรงกับ “{query}”</p>
          )}

          <section
            className="ws-projects"
            id="home-projects"
            tabIndex={-1}
            aria-labelledby="projects-title"
          >
            <div className="ws-section-head">
              <h3 id="projects-title">โปรเจกต์ ({data.projects.length})</h3>
              <button
                type="button"
                className="quiet"
                disabled={!native}
                onClick={onAddProject}
              >
                ＋ เพิ่มโปรเจกต์
              </button>
            </div>
            {data.projects.length ? (
              <ul className="home-project-list">
                {data.projects.map((item) => {
                  const progress = progressOf(
                    tasks.filter((task) => task.projectId === item.id),
                  );
                  const count = workflows.filter(
                    (flow) => flow.projectId === item.id,
                  ).length;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelectProject(item.id)}
                        aria-label={`ดูรายละเอียด ${item.name}`}
                      >
                        <span className="row">
                          <b>{item.name}</b>
                          <span className="chip">
                            {item.isGit ? "Git" : "Folder"}
                          </span>
                        </span>
                        <small>
                          {item.goal
                            ? clip(item.goal, 70)
                            : "ยังไม่ได้กำหนด objective"}
                        </small>
                        <span className="meter" aria-hidden="true">
                          <span style={{ width: `${progress.percent}%` }} />
                        </span>
                        <small className="row">
                          <span>
                            {count} งาน · {progress.completed}/{progress.total}{" "}
                            ขั้น
                          </span>
                          <span>
                            {progress.running
                              ? `กำลังทำ ${progress.running}`
                              : progress.waiting
                                ? `รอ ${progress.waiting}`
                                : `${progress.percent}%`}
                          </span>
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="hint">
                {native
                  ? "ยังไม่มีโปรเจกต์ กดเพิ่มโปรเจกต์เพื่อเลือกโฟลเดอร์"
                  : "เปิด Astra Desktop เพื่อดูโปรเจกต์"}
              </p>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
