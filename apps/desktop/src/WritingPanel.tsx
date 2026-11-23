import { useEffect, useState } from "react";
import { bridge } from "./bridge";
import { PatchFileDiff } from "./PatchFileDiff";

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
  onBusy,
  disabled = false,
  approvalOnly = false,
  diff = true,
}: {
  taskId: string;
  status: string;
  attempts: number;
  refresh: () => Promise<void>;
  onBusy: (busy: boolean) => void;
  disabled?: boolean;
  approvalOnly?: boolean;
  /** false เมื่อหน้าที่เรียกแสดง diff เองแล้ว (เช่นหน้า Review) */
  diff?: boolean;
}) {
  const [loaded, setLoaded] = useState<{ key: string; info: WritingInfo }>();
  const [paths, setPaths] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewedDigest, setReviewedDigest] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const key = `${taskId}:${status}:${revision}`;
  const info = loaded?.key === key ? loaded.info : null;
  const digest = info?.digest;
  const reviewed = Boolean(digest && digest === reviewedDigest);
  useEffect(() => {
    let active = true;
    setReviewedDigest(null);
    void bridge
      .writingInfo(taskId)
      .then((value) => {
        if (active) setLoaded({ key, info: value });
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [taskId, key]);
  async function act(action: () => Promise<void>) {
    if (busy || disabled) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setReviewedDigest(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRevision((value) => value + 1);
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section aria-label="FORGE writing approval" className="writing well">
      <h3>FORGE · Staged writing</h3>
      <p className="hint">
        Claude สร้างไฟล์เป็นข้อเสนอ โดยไม่ใช้ tools; Rust เขียนหลัง human
        ตรวจเนื้อหาจริงและอนุมัติอีกครั้งเท่านั้น
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!info && !error && <p role="status">กำลังอ่านข้อมูลการเขียน…</p>}
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
            disabled={disabled || busy || !paths.trim()}
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
      {info?.patch && digest && (
        <>
          <p className="patch-digest">
            Patch: {info.patch.state} · SHA256 {digest}
          </p>
          {diff &&
            info.patch.files.map((file, index) => (
            <PatchFileDiff
              key={file.path}
              path={file.path}
              before={
                info.patch?.before.find((f) => f.path === file.path)?.before ??
                null
              }
              after={file.content}
              open={index === 0}
            />
            ))}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy || disabled}
              onChange={(e) =>
                setReviewedDigest(e.target.checked ? digest : null)
              }
            />
            ฉันตรวจเนื้อหาและ paths ทั้งหมดแล้ว
          </label>
          {info.patch.state === "staged" && (
            <button
              disabled={
                disabled || busy || !reviewed || status !== "needs_review"
              }
              onClick={() =>
                void act(() => bridge.writingAction(taskId, "apply", digest))
              }
            >
              Approve & apply exact patch
            </button>
          )}
          {!approvalOnly &&
            ["applying", "applied"].includes(info.patch.state) && (
              <button
                disabled={disabled || busy || !reviewed}
                onClick={() =>
                  void act(() =>
                    bridge.writingAction(taskId, "rollback", digest),
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
