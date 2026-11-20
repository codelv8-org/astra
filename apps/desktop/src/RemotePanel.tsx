import { useEffect, useState, type FormEvent } from "react";
import { bridge } from "./bridge";
import type { Project } from "../../../packages/shared/src";
type Status = {
  connection: string;
  deviceId: string | null;
  server: string | null;
  shared: { projectId: string; logs: boolean }[];
};
export function RemotePanel({ projects }: { projects: Project[] }) {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const poll = () =>
      void bridge
        .remoteStatus()
        .then((v) => {
          if (active) setStatus(v);
        })
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function act(f: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await f();
      setStatus(await bridge.remoteStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function pair(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    void act(async () => {
      await bridge.remotePair(
        String(f.get("server")),
        String(f.get("code")),
        String(f.get("name")),
        f.get("ca") === "on",
      );
      form.reset();
    });
  }
  const connection = status?.connection || "not_configured";
  const tone =
    connection === "connected"
      ? "ok"
      : connection === "connecting"
        ? "run"
        : connection === "pairing_required"
          ? "bad"
          : "idle";
  return (
    <section className="tile remote" id="remote">
      <div className="tile-head">
        <div>
          <h2>Secure remote control</h2>
          <p className="clip">
            {status?.server ?? "ยังไม่จับคู่"}
            {status?.deviceId && ` · ${status.deviceId.slice(0, 8)}`}
          </p>
        </div>
        <span className="chip" data-tone={tone}>
          <span className="dot" />
          {connection}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status?.connection === "pairing_required" && (
        <p role="alert" className="error">
          เซิร์ฟเวอร์ไม่ยอมรับการจับคู่เดิม ให้กด Forget pairing locally แล้วใช้
          pairing code ใหม่เพื่อเชื่อมต่ออีกครั้ง
        </p>
      )}
      <p className="hint">
        แชร์เฉพาะ metadata ของโปรเจกต์ที่เลือก logs ต้องเปิดเพิ่ม คำสั่งจาก Web
        เป็น draft ที่ต้องอนุมัติในเครื่อง และอนุมัติ writing จากระยะไกลไม่ได้
      </p>
      {!status?.deviceId ? (
        <form onSubmit={pair} className="remote-form">
          <label>
            HTTPS API origin
            <input
              name="server"
              type="url"
              placeholder="https://astra.example.com"
              required
            />
          </label>
          <div className="form-grid">
            <label>
              Pairing code
              <input
                name="code"
                autoComplete="off"
                required
                minLength={40}
                maxLength={100}
              />
            </label>
            <label>
              Device name
              <input
                name="name"
                defaultValue="Astra Windows"
                required
                maxLength={100}
              />
            </label>
          </div>
          <label className="check">
            <input name="ca" type="checkbox" />
            ใช้ custom CA certificate (เฉพาะ API ที่ใช้ private CA)
          </label>
          <button className="primary" disabled={busy}>
            Pair device
          </button>
        </form>
      ) : (
        <div className="tile-actions start">
          <button
            className="primary"
            disabled={
              busy ||
              ["connected", "connecting", "pairing_required"].includes(
                status.connection,
              )
            }
            onClick={() => void act(() => bridge.remoteConnect())}
          >
            Connect remote
          </button>
          <button
            disabled={busy}
            onClick={() => void act(() => bridge.remoteDisconnect())}
          >
            Disconnect remote
          </button>
          <button
            className="quiet"
            disabled={busy}
            onClick={() => void act(() => bridge.remoteForget())}
          >
            Forget pairing locally
          </button>
        </div>
      )}
      {status?.deviceId && projects.length > 0 && (
        <ul className="rows share-list">
          {projects.map((p) => {
            const shared = status.shared.find((s) => s.projectId === p.id);
            return (
              <li key={p.id} className="row-item">
                <div className="row-main">
                  <h3>{p.name}</h3>
                  <p className="hint">
                    {shared
                      ? shared.logs
                        ? "แชร์ metadata และ logs"
                        : "แชร์ metadata"
                      : "ไม่แชร์"}
                  </p>
                </div>
                <div className="tile-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() => bridge.remoteShare(p.id, !shared, false))
                    }
                  >
                    {shared ? "Stop sharing" : "Share project metadata"}
                  </button>
                  {shared && (
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          bridge.remoteShare(p.id, true, !shared.logs),
                        )
                      }
                    >
                      {shared.logs
                        ? "Disable shared logs"
                        : "Enable sanitized logs/artifacts"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
