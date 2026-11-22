import { useMemo } from "react";
import { patchDiff } from "./patchDiff";

export function PatchFileDiff({
  path,
  before,
  after,
  open,
}: {
  path: string;
  before: string | null;
  after: string;
  open: boolean;
}) {
  const lines = useMemo(() => patchDiff(before ?? "", after), [before, after]);
  const label =
    before === null
      ? "ไฟล์ใหม่"
      : before === after
        ? "ไม่มีการเปลี่ยนแปลง"
        : "";
  return (
    <details className="patch-file" open={open}>
      <summary>
        {path} {label && <span className="hint">· {label}</span>}
      </summary>
      {lines === null ? (
        <p className="hint">ไฟล์มีหลายบรรทัด แสดงเนื้อหาก่อนและหลังทั้งหมด</p>
      ) : (
        label !== "ไม่มีการเปลี่ยนแปลง" &&
        lines.length > 0 && (
          <div className="patch-lines well">
            <table aria-label={`Diff ของ ${path}`}>
              <thead>
                <tr>
                  <th scope="col">ก่อน</th>
                  <th scope="col">หลัง</th>
                  <th scope="col">บรรทัด</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={
                      line.before
                        ? `before-${line.before}`
                        : `after-${line.after}`
                    }
                    data-change={line.kind}
                  >
                    <td>{line.before}</td>
                    <td>{line.after}</td>
                    <td>
                      <code>
                        <span className="patch-sign">
                          {line.kind === "remove"
                            ? "−"
                            : line.kind === "add"
                              ? "+"
                              : " "}
                        </span>
                        {line.text}
                      </code>
                      {line.kind !== "context" && (
                        <small className="patch-ending">
                          {line.ending === "EOF"
                            ? "ไม่มีอักขระขึ้นบรรทัดใหม่"
                            : line.ending}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <details className="patch-contents" open={lines === null}>
        <summary>เนื้อหาเต็ม Before / After</summary>
        <p>Before</p>
        <pre className="task-prompt" tabIndex={0} aria-label="Before">
          {before === null ? "(ไฟล์ใหม่)" : before}
        </pre>
        <p>After</p>
        <pre className="task-prompt" tabIndex={0} aria-label="After">
          {after}
        </pre>
      </details>
    </details>
  );
}
