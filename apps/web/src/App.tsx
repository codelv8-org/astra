import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../../packages/ui/src/Modal";
import { ActivityTabs } from "../../../packages/ui/src/Tabs";
import { AstraMark, ThemeGlyph } from "../../../packages/ui/src/AstraMark";
import roster from "../../../packages/shared/default-agents.json";
import type { RemoteSnapshot } from "../../../packages/protocol/src/index";
type Device = {
  id: string;
  name: string;
  revoked: boolean;
  online: boolean;
  lastSeen: string | null;
  snapshot: Partial<RemoteSnapshot>;
};
type Command = {
  id: string;
  state: string;
  envelope: { action: string };
  result?: { detail: string };
};
type RemoteEvent = {
  id: string;
  executionId: string;
  kind: string;
  text: string;
};
let csrf = "";
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "content-type": "application/json", "x-csrf-token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
export function App() {
  const cache = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const s = await api<{ csrf: string }>("/session");
      csrf = s.csrf;
      return s;
    },
    refetchInterval: 60000,
  });
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => api<Device[]>("/devices"),
    enabled: !!session.data,
    refetchInterval: 1500,
  });
  const [deviceId, setDeviceId] = useState("");
  const device = devices.data?.find((d) => d.id === deviceId);
  const snap = device?.snapshot;
  const commands = useQuery({
    queryKey: ["commands", deviceId],
    queryFn: () => api<Command[]>(`/devices/${deviceId}/commands`),
    enabled: !!device,
    refetchInterval: 1500,
  });
  const [run, setRun] = useState("");
  const logs = useQuery({
    queryKey: ["logs", deviceId, run],
    queryFn: () =>
      api<RemoteEvent[]>(`/devices/${deviceId}/events?executionId=${run}`),
    enabled: !!device && !!run,
    refetchInterval: 1500,
  });
  const [modal, setModal] = useState<"task" | "pair" | "revoke" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? "dark",
  );
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await cache.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act(async () => {
      const s = await api<{ csrf: string }>("/login", {
        name: f.get("name"),
        password: f.get("password"),
      });
      csrf = s.csrf;
      await cache.invalidateQueries({ queryKey: ["session"] });
    });
  }
  async function command(
    action: string,
    projectId = "00000000-0000-0000-0000-000000000000",
    taskId = "00000000-0000-0000-0000-000000000000",
    payload?: unknown,
  ) {
    await api(`/devices/${deviceId}/commands`, {
      projectId,
      taskId,
      action,
      idempotencyKey: crypto.randomUUID(),
      ...(payload ? { payload } : {}),
    });
    setNotice("ส่งคำสั่งแล้ว ตรวจ acknowledgement และสถานะจริงด้านล่าง");
  }
  const header = (
    <header className="dock glass">
      <a className="brand" href="#main">
        <AstraMark />
        <span>Astra</span>
        <span className="chip">Remote</span>
      </a>
      <div className="dock-actions">
        <button
          className="icon quiet"
          aria-label="สลับ theme"
          title="สลับ theme"
          onClick={() => {
            const next =
              document.documentElement.dataset.theme === "dark"
                ? "light"
                : "dark";
            document.documentElement.dataset.theme = next;
            setTheme(next);
          }}
        >
          <ThemeGlyph theme={theme} />
        </button>
        {session.data && (
          <button
            onClick={() =>
              void act(async () => {
                await api("/logout", {});
                csrf = "";
                cache.clear();
                setDeviceId("");
                setRun("");
                setNotice("ออกจากระบบแล้ว");
              })
            }
          >
            ออกจากระบบ
          </button>
        )}
      </div>
    </header>
  );
  if (!session.data || session.error)
    return (
      <div className="shell">
        {header}
        <main id="main" className="login tile">
          <img
            src="/crewbots/astra/portrait.svg"
            alt="ASTRA"
            width="88"
            height="81"
          />
          <h1>ควบคุมทีมจากระยะไกล</h1>
          <p className="muted">
            Desktop ต้องเปิดอยู่และเชื่อมต่อ ทุกคำสั่งยังอยู่ภายใต้นโยบายของเครื่อง
          </p>
          <form onSubmit={(e) => void login(e)}>
            <label>
              ชื่อผู้ใช้
              <input
                name="name"
                autoComplete="username"
                required
                maxLength={100}
              />
            </label>
            <label>
              รหัสผ่าน
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <button className="primary" disabled={busy}>
              เข้าสู่ระบบ
            </button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
        </main>
      </div>
    );
  const executions = snap?.executions ?? [];
  return (
    <div className="shell">
      {header}
      <main id="main" className="bento">
        {error && (
          <p role="alert" className="error span-12">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice span-12">
            {notice}
          </p>
        )}
        {devices.error && (
          <p role="alert" className="error span-12">
            {devices.error.message}
          </p>
        )}
        <section aria-label="Windows devices" className="tile span-4">
          <div className="tile-head">
            <div>
              <h2>Devices</h2>
              <p>งานรันใน Windows Desktop ไม่มี remote terminal</p>
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const p = await api<{ code: string }>("/pairings", {});
                  setCode(p.code);
                  setModal("pair");
                })
              }
            >
              จับคู่อุปกรณ์
            </button>
          </div>
          <div className="device-list">
            {devices.data?.map((d) => (
              <button
                key={d.id}
                className={`device ${deviceId === d.id ? "selected" : ""}`}
                aria-pressed={deviceId === d.id}
                onClick={() => {
                  setDeviceId(d.id);
                  setRun("");
                  setNotice("");
                }}
              >
                <span
                  className="chip"
                  data-tone={d.revoked ? "bad" : d.online ? "ok" : "idle"}
                >
                  <span className="dot" />
                  {d.revoked ? "Revoked" : d.online ? "Online" : "Offline"}
                </span>
                <strong>{d.name}</strong>
                <small>
                  Last seen:{" "}
                  {d.lastSeen
                    ? new Date(d.lastSeen).toLocaleString("th-TH")
                    : "ยังไม่เชื่อมต่อ"}
                </small>
              </button>
            ))}
            {!devices.data?.length && (
              <p className="hint">
                ยังไม่มีอุปกรณ์ สร้าง pairing code แล้วกรอกใน Astra Desktop
              </p>
            )}
          </div>
        </section>
        {!device && (
          <section className="tile span-8 placeholder">
            <img
              src="/crewbots/astra/portrait.svg"
              alt=""
              width="64"
              height="59"
            />
            <div>
              <h2>เลือกอุปกรณ์เพื่อดูงาน</h2>
              <p className="hint">
                สถานะ งาน และ logs แสดงเฉพาะโปรเจกต์ที่เจ้าของแชร์จากเครื่อง
              </p>
            </div>
          </section>
        )}
        {device && (
          <>
            <section className="tile span-8 device-status">
              <div className="tile-head">
                <div>
                  <h2>{device.name}</h2>
                  <p>
                    {snap?.schedulerPaused
                      ? "Scheduling paused"
                      : "Scheduling active"}
                  </p>
                </div>
                <span
                  className="chip"
                  data-tone={device.online ? "ok" : "idle"}
                >
                  <span className="dot" />
                  {device.online ? "Online" : "Offline"}
                </span>
              </div>
              <ul className="crew-strip" aria-label="CrewBots">
                {roster.map((a) => (
                  <li key={a.id}>
                    <img
                      src={`/crewbots/${a.characterKey}/portrait.svg`}
                      alt=""
                      width="36"
                      height="33"
                    />
                    <span>
                      <b>{a.name}</b>
                      <small>{a.runtimeAdapter}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="tile-actions start">
                <button
                  disabled={!device.online || busy}
                  onClick={() => void act(() => command("status"))}
                >
                  Refresh status
                </button>
                <button
                  disabled={!device.online || busy}
                  onClick={() => void act(() => command("pause_scheduling"))}
                >
                  Pause scheduling
                </button>
                <button
                  className="danger"
                  disabled={device.revoked || busy}
                  onClick={() => setModal("revoke")}
                >
                  Revoke device
                </button>
              </div>
            </section>
            <section className="tile span-8">
              <div className="tile-head">
                <div>
                  <h2>Projects & tasks</h2>
                  <p>เฉพาะโปรเจกต์ที่เจ้าของแชร์จากเครื่อง</p>
                </div>
                <button
                  className="primary"
                  disabled={!device.online || !snap?.projects?.length || busy}
                  onClick={() => setModal("task")}
                >
                  <span className="plus" aria-hidden="true">
                    ＋
                  </span>
                  ส่งงานใหม่
                </button>
              </div>
              {snap?.workflows?.map((w) => (
                <p key={w.id} className="command">
                  <strong>Workflow · {w.status}</strong>
                  <small>
                    {w.objective} · rework {w.reworkCount}/2
                  </small>
                </p>
              ))}
              {!snap?.projects?.length && (
                <p className="hint">ยังไม่มีโปรเจกต์ที่แชร์</p>
              )}
              {snap?.projects?.map((p) => (
                <div key={p.id} className="project">
                  <h3>{p.name}</h3>
                  {snap.tasks
                    ?.filter((t) => t.projectId === p.id)
                    .map((t) => (
                      <article className="task" key={t.id}>
                        <div>
                          <strong>{t.title}</strong>
                          <p>
                            {t.agentId.toUpperCase()} ·{" "}
                            {t.adapter === "mock" ? "MOCK — no AI" : t.adapter}{" "}
                            · {t.status}
                          </p>
                          <small>
                            {t.gate
                              ? "Human gate"
                              : t.approved
                                ? "Local approval recorded"
                                : "Local approval required"}{" "}
                            · attempts {t.attempts} · dependencies{" "}
                            {t.dependencies.length}
                          </small>
                        </div>
                        <div className="actions">
                          <button
                            disabled={
                              !device.online ||
                              !t.approved ||
                              t.gate ||
                              t.status !== "queued" ||
                              busy
                            }
                            onClick={() =>
                              void act(() => command("start", p.id, t.id))
                            }
                          >
                            Start
                          </button>
                          <button
                            disabled={
                              !device.online ||
                              ["completed", "canceled"].includes(t.status) ||
                              busy
                            }
                            onClick={() =>
                              void act(() => command("cancel", p.id, t.id))
                            }
                          >
                            Cancel
                          </button>
                          {t.lastExecutionId && (
                            <button
                              className="quiet"
                              onClick={() => setRun(t.lastExecutionId!)}
                            >
                              Logs
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              ))}
            </section>
            <aside className="tile span-4 activity">
              <div className="tile-head">
                <h2>Execution activity</h2>
              </div>
              <ActivityTabs
                key={device.id + JSON.stringify(snap?.executions)}
                groups={[
                  {
                    label: "กำลังรัน",
                    items: executions
                      .filter((e) => e.status === "running")
                      .map((e) => ({
                        title: e.agentId.toUpperCase(),
                        subtitle: e.adapter,
                        detail: e.status,
                        color: "var(--run)",
                      })),
                  },
                  {
                    label: "เสร็จแล้ว",
                    items: executions
                      .filter((e) => e.status === "completed")
                      .map((e) => ({
                        title: e.agentId.toUpperCase(),
                        subtitle:
                          e.adapter === "mock" ? "MOCK — no AI" : e.adapter,
                        detail: e.status,
                        color: "var(--ok)",
                      })),
                  },
                  {
                    label: "อื่น ๆ",
                    items: executions
                      .filter(
                        (e) => !["running", "completed"].includes(e.status),
                      )
                      .map((e) => ({
                        title: e.agentId.toUpperCase(),
                        subtitle: e.adapter,
                        detail: e.status,
                        color: "var(--c-mira)",
                      })),
                  },
                ]}
              />
              <h3 className="sub">Command acknowledgements</h3>
              {commands.data?.length ? (
                commands.data.map((c) => (
                  <p key={c.id} className="command">
                    <strong>
                      {c.envelope.action} · {c.state}
                    </strong>
                    <small>{c.result?.detail ?? c.id.slice(0, 8)}</small>
                  </p>
                ))
              ) : (
                <p className="hint">ยังไม่มีคำสั่ง</p>
              )}
            </aside>
            <section className="tile span-12">
              <div className="tile-head">
                <h2>Sanitized execution logs</h2>
                <label className="inline-select">
                  Execution
                  <select value={run} onChange={(e) => setRun(e.target.value)}>
                    <option value="">เลือก execution</option>
                    {executions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.agentId} · {e.adapter} · {e.status} ·{" "}
                        {e.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div role="log" className="logs well">
                {logs.data?.map((e) => (
                  <div key={e.id}>
                    <small>{e.kind}</small>
                    <pre>{e.text}</pre>
                  </div>
                ))}
                {!logs.data?.length && (
                  <p className="hint">
                    ยังไม่มี logs ที่อนุญาตให้แชร์ ไม่แทนด้วยข้อมูล demo
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
      {modal && (
        <Modal
          title={
            modal === "task"
              ? "ส่งงานใหม่"
              : modal === "pair"
                ? "จับคู่ Windows Desktop"
                : "ยืนยัน revoke device"
          }
          busy={busy}
          onClose={() => {
            setModal(null);
            setCode("");
          }}
        >
          {modal === "pair" && (
            <>
              <p>
                Code ใช้ครั้งเดียว หมดอายุภายใน 5 นาที กรอกเฉพาะใน Desktop
                ที่คุณอนุญาต
              </p>
              <label>
                Pairing code
                <input readOnly value={code} />
              </label>
              <p>
                Desktop → Secure remote control → Pair device
                แล้วเลือกโปรเจกต์ที่อนุญาตให้แชร์
              </p>
            </>
          )}
          {modal === "revoke" && (
            <>
              <p>
                ถอนสิทธิ์ {device?.name} ตัด remote connection และ pending
                commands; local execution ที่เริ่มแล้วอาจยังทำงานต่อ
              </p>
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api(`/devices/${deviceId}/revoke`, {});
                    setModal(null);
                  })
                }
              >
                ยืนยัน revoke
              </button>
            </>
          )}
          {modal === "task" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  await command(
                    "submit",
                    String(f.get("project")),
                    crypto.randomUUID(),
                    {
                      agentId: f.get("agent"),
                      adapter: f.get("adapter"),
                      title: f.get("title"),
                      prompt: f.get("prompt"),
                    },
                  );
                  setModal(null);
                });
              }}
            >
              <label>
                Project
                <select name="project" required>
                  {snap?.projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Agent
                <select name="agent">
                  {roster.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Runtime
                <select name="adapter">
                  <option value="mock">MOCK — no AI model</option>
                  <option value="codex">OpenAI Codex</option>
                  <option value="claude">Claude Code</option>
                  <option value="antigravity">Antigravity</option>
                </select>
              </label>
              <label>
                Task title
                <input name="title" required maxLength={100} />
              </label>
              <label>
                Task prompt
                <textarea name="prompt" required maxLength={4000} rows={5} />
              </label>
              <p className="hint">
                ส่งเป็น draft เท่านั้น ต้องอนุมัติ exact prompt ในเครื่องก่อน
                Start ไม่ให้สิทธิ์ shell/write/approval ใหม่
              </p>
              <button className="primary" disabled={busy}>
                ส่ง draft
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
