import { useEffect, useState } from "react";
import { bridge } from "./bridge";

export interface WritingInfo {
  policy: { path: string; before: string | null }[] | null;
  digest: string | null;
  patch: {
    state: string;
    before: { path: string; before: string | null }[];
    files: { path: string; content: string }[];
  } | null;
}

export function WritingPanel({
  taskId,
  status,
  attempts,
  refresh,
}: {
  taskId: string;
  status: string;
  attempts: number;
  refresh: () => Promise<void>;
}) {
  const [info, setInfo] = useState<WritingInfo | null>(null);
  const [paths, setPaths] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    let active = true;
    void bridge
      .writingInfo(taskId)
      .then((value) => {
        if (active) {
          setInfo(value);
          setReviewed(false);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [taskId, status]);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setInfo(await bridge.writingInfo(taskId));
      setReviewed(false);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="FORGE writing approval">
      <h3>FORGE · Staged writing</h3>
      <p className="muted">
        Claude สร้างไฟล์เป็นข้อเสนอ โดยไม่ใช้ tools; Rust เขียนหลัง human
        ตรวจเนื้อหาจริงและอนุมัติอีกครั้งเท่านั้น
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {info?.policy && (
        <p>Approved paths: {info.policy.map((f) => f.path).join(", ")}</p>
      )}
      {attempts === 0 && ["draft", "ready", "blocked"].includes(status) && (
        <>
          <label>
            Source paths (หนึ่งไฟล์ต่อบรรทัด สูงสุด 8 ไฟล์)
            <textarea
              rows={3}
              value={paths}
              onChange={(e) => setPaths(e.target.value)}
              placeholder={"src/example.ts\nsrc/example.test.ts"}
            />
          </label>
          <button
            disabled={busy || !paths.trim()}
            onClick={() =>
              void act(() =>
                bridge.configureWriting(
                  taskId,
                  paths
                    .split(/\r?\n/)
                    .map((p) => p.trim())
                    .filter(Boolean),
                ),
              )
            }
          >
            Review writing scope
          </button>
        </>
      )}
      {info?.patch && (
        <>
          <p>
            Patch: {info.patch.state} · SHA256 {info.digest}
          </p>
          {info.patch.files.map((file) => (
            <details key={file.path} open>
              <summary>{file.path}</summary>
              <p>Before</p>
              <pre className="task-prompt">
                {info.patch!.before.find((f) => f.path === file.path)?.before ??
                  "(new file)"}
              </pre>
              <p>After</p>
              <pre className="task-prompt">{file.content}</pre>
            </details>
          ))}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            ฉันตรวจเนื้อหาและ paths ทั้งหมดแล้ว
          </label>
          {info.patch.state === "staged" && (
            <button
              disabled={busy || !reviewed || status !== "needs_review"}
              onClick={() =>
                void act(() =>
                  bridge.writingAction(taskId, "apply", info.digest!),
                )
              }
            >
              Approve & apply exact patch
            </button>
          )}
          {["applying", "applied"].includes(info.patch.state) && (
            <button
              disabled={busy || !reviewed}
              onClick={() =>
                void act(() =>
                  bridge.writingAction(taskId, "rollback", info.digest!),
                )
              }
            >
              Review rollback
            </button>
          )}
        </>
      )}
    </section>
  );
}
