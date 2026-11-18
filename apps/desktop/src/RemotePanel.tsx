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
  return (
    <section className="panel" id="remote">
      <h2>Secure remote control</h2>
      <p>
        สถานะ: {status?.connection || "not_configured"} ·{" "}
        {status?.server ?? "ยังไม่จับคู่"}{" "}
        {status?.deviceId && `· ${status.deviceId.slice(0, 8)}`}
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {status?.connection === "pairing_required" && (
        <p role="alert" className="error-text">
          เซิร์ฟเวอร์ไม่ยอมรับการจับคู่เดิม ให้กด Forget pairing locally แล้วใช้
          pairing code ใหม่เพื่อเชื่อมต่ออีกครั้ง
        </p>
      )}
      <p>
        แชร์เฉพาะ metadata ของโปรเจกต์ที่เลือก Logs/artifacts
        ต้องเปิดเพิ่มและอาจมีข้อมูลของงาน ตรวจข้อมูลก่อนแชร์ คำสั่งจาก Web
        ส่งเป็น draft ต้องอนุมัติในเครื่องก่อนรัน และ remote อนุมัติ writing
        apply/high-risk actions ไม่ได้
      </p>
      {!status?.deviceId ? (
        <form onSubmit={pair}>
          <label>
            HTTPS API origin
            <input
              name="server"
              type="url"
              placeholder="https://crewnest.example.com"
              required
            />
          </label>
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
              defaultValue="CrewNest Windows"
              required
              maxLength={100}
            />
          </label>
          <label className="check">
            <input name="ca" type="checkbox" />
            เลือก custom CA certificate ผ่าน native picker (สำหรับ API ที่ใช้
            private CA เท่านั้น)
          </label>
          <button disabled={busy}>Pair device</button>
        </form>
      ) : (
        <div className="queue-actions">
          <button
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
            disabled={busy}
            onClick={() => void act(() => bridge.remoteForget())}
          >
            Forget pairing locally
          </button>
        </div>
      )}
      {status?.deviceId &&
        projects.map((p) => {
          const shared = status.shared.find((s) => s.projectId === p.id);
          return (
            <div key={p.id} className="queue-actions">
              <strong>{p.name}</strong>
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
                  disabled={busy}
                  onClick={() =>
                    void act(() => bridge.remoteShare(p.id, true, !shared.logs))
                  }
                >
                  {shared.logs
                    ? "Disable shared logs"
                    : "Enable sanitized logs/artifacts"}
                </button>
              )}
            </div>
          );
        })}
    </section>
  );
}
