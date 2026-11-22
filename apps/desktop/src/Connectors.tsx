import { useState, type KeyboardEvent } from "react";
import type { Diagnostic, Snapshot } from "../../../packages/shared/src";
import { IsoArt } from "../../../packages/ui/src/IsoArt";
import { authLabels, connectorCatalog, connectorStatus } from "./runtimeCatalog";
import { RuntimeBadge } from "./home/WorkspaceSidebar";
import "./connectors.css";

type Tab = "used" | "all";

/** หน้า Runtime แบบ Connectors: runtime ที่ทีมใช้และผลตรวจ CLI ล่าสุด */
export function Connectors({
  data,
  diagnostics,
  checking,
  native,
  onCheck,
}: {
  data: Snapshot;
  diagnostics: Diagnostic[];
  checking: boolean;
  native: boolean;
  onCheck: () => void;
}) {
  const used = connectorCatalog.filter((item) =>
    data.agents.some((agent) => agent.runtimeAdapter === item.adapter),
  );
  const [tab, setTab] = useState<Tab>("used");
  const tabs: [Tab, string][] = [
    ["used", `ทีมใช้อยู่ · ${used.length}`],
    ["all", `ทั้งหมด · ${connectorCatalog.length}`],
  ];
  const shown = tab === "used" ? used : connectorCatalog;
  const ready = connectorCatalog.filter(
    (item) =>
      connectorStatus(diagnostics.find((d) => d.adapter === item.adapter))
        .tone === "ok",
  ).length;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: Tab =
      event.key === "Home"
        ? "used"
        : event.key === "End"
          ? "all"
          : tab === "used"
            ? "all"
            : "used";
    setTab(next);
    document.getElementById(`connector-tab-${next}`)?.focus();
  }

  return (
    <div className="connectors span-12">
      <div className="connector-tabs" role="tablist" aria-label="กลุ่ม runtime">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`connector-tab-${id}`}
            aria-controls="connector-panel"
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="connector-hero" aria-label="สรุป runtime">
        <div className="connector-hero-text">
          <p className="hint">Runtime</p>
          <h2>เชื่อม agent ที่คุณรันอยู่แล้ว</h2>
          <p>
            {connectorCatalog.length} runtime ที่ Astra รองรับ · ทีมใช้อยู่{" "}
            {used.length}
            {diagnostics.length
              ? ` · พร้อมใช้ ${ready}`
              : " · ยังไม่ได้ตรวจ CLI ใน session นี้"}
          </p>
          <div className="connector-hero-actions">
            <button
              className="primary"
              disabled={!native || checking}
              onClick={onCheck}
            >
              {checking ? "กำลังตรวจ…" : "Check runtimes"}
            </button>
            <span className="hint">
              ตรวจการติดตั้งและ login โดยไม่อ่าน credentials
            </span>
          </div>
        </div>
        <div className="connector-hero-art" aria-hidden="true">
          <IsoArt variant="hub" />
        </div>
      </section>

      <section
        className="connector-section"
        id="connector-panel"
        role="tabpanel"
        aria-labelledby={`connector-tab-${tab}`}
      >
        <h2>Runtime ในเครื่อง</h2>
        <div className="connector-grid">
          {shown.map((item) => {
            const diagnostic = diagnostics.find(
              (d) => d.adapter === item.adapter,
            );
            const status = connectorStatus(diagnostic);
            const members = data.agents.filter(
              (agent) => agent.runtimeAdapter === item.adapter,
            );
            return (
              <article
                key={item.adapter}
                className="connector-card"
                aria-label={item.name}
              >
                <div className="connector-top">
                  <span className="connector-icon">
                    <RuntimeBadge adapter={item.adapter} />
                  </span>
                  <span className="chip" data-tone={status.tone}>
                    <span className="dot" />
                    {status.label}
                  </span>
                </div>
                <div>
                  <h3>{item.name}</h3>
                  <p className="connector-desc">{item.description}</p>
                </div>
                {members.length > 0 ? (
                  <p className="connector-users">
                    <span className="avatar-row" aria-hidden="true">
                      {members.map((agent) => (
                        <img
                          key={agent.id}
                          className="agent-avatar"
                          data-agent={agent.characterKey}
                          src={`/crewbots/${agent.characterKey}/portrait.svg`}
                          alt=""
                          width="24"
                          height="24"
                        />
                      ))}
                    </span>
                    ใช้โดย {members.map((agent) => agent.name).join(", ")}
                  </p>
                ) : (
                  <p className="connector-users hint">ยังไม่มี agent ใช้</p>
                )}
                {diagnostic && (
                  <dl className="connector-facts">
                    <div>
                      <dt>เวอร์ชัน</dt>
                      <dd>{diagnostic.version || "ไม่ทราบ"}</dd>
                    </div>
                    <div>
                      <dt>Login</dt>
                      <dd>{authLabels[diagnostic.authentication]}</dd>
                    </div>
                    {diagnostic.executable && (
                      <div>
                        <dt>ที่อยู่</dt>
                        <dd>
                          <code>{diagnostic.executable}</code>
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                {diagnostic?.message && (
                  <p className="hint connector-message">{diagnostic.message}</p>
                )}
                <ul className="connector-chips" aria-label="วิธีเชื่อม">
                  <li className="chip">{item.connect}</li>
                  <li className="chip">{item.auth}</li>
                </ul>
              </article>
            );
          })}
        </div>
        <p className="db-path">
          <span>Database</span>
          <code>{data.dataPath || "ยังไม่เชื่อมต่อ Desktop"}</code>
        </p>
      </section>
    </div>
  );
}
