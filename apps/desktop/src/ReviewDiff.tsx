import { useMemo, useState } from "react";
import { patchDiff } from "./patchDiff";
import { diffStats } from "./review";

export interface ReviewFile {
  path: string;
  before: string | null;
  after: string;
}

const lineSplit = (text: string) => text.replace(/\r\n|\r/g, "\n").split("\n");

/** รายการไฟล์ที่เปลี่ยน + diff ทีละไฟล์ แบบเดียวกับแท็บ Changes ของแบบ */
export function ReviewDiff({
  files,
  avatar,
}: {
  files: ReviewFile[];
  avatar?: string;
}) {
  const [selected, setSelected] = useState(files[0]?.path ?? "");
  const [mode, setMode] = useState<"diff" | "full">("diff");
  const stats = useMemo(
    () => files.map((file) => diffStats(file.before, file.after)),
    [files],
  );
  const totals = stats.reduce<{ adds: number; removes: number }>(
    (sum, item) => ({
      adds: sum.adds + (item?.adds ?? 0),
      removes: sum.removes + (item?.removes ?? 0),
    }),
    { adds: 0, removes: 0 },
  );
  const file = files.find((item) => item.path === selected) ?? files[0];
  const lines = useMemo(
    () => (file ? patchDiff(file.before ?? "", file.after) : null),
    [file],
  );
  if (!file) return <p className="hint">patch นี้ไม่มีไฟล์</p>;

  return (
    <div className="review-diff">
      <nav className="changed-files" aria-label="ไฟล์ที่เปลี่ยน">
        <p className="changed-head">
          <span>ไฟล์ที่เปลี่ยน</span>
          <span>
            <span className="add">+{totals.adds}</span>{" "}
            <span className="del">−{totals.removes}</span>
          </span>
        </p>
        <ul>
          {files.map((item, index) => {
            const stat = stats[index];
            return (
              <li key={item.path}>
                <button
                  type="button"
                  aria-pressed={item.path === file.path}
                  onClick={() => setSelected(item.path)}
                  title={item.path}
                >
                  <span className="file-path">{item.path}</span>
                  <span className="file-delta">
                    {item.before === null ? (
                      <span className="add">ใหม่</span>
                    ) : stat ? (
                      <>
                        {stat.adds > 0 && <span className="add">+{stat.adds}</span>}
                        {stat.removes > 0 && (
                          <span className="del">−{stat.removes}</span>
                        )}
                        {!stat.adds && !stat.removes && "ไม่เปลี่ยน"}
                      </>
                    ) : (
                      "ไฟล์ใหญ่"
                    )}
                  </span>
                  {avatar && (
                    <img
                      className="agent-avatar small"
                      src={avatar}
                      alt=""
                      width="24"
                      height="24"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="diff-pane">
        <div className="diff-head">
          <code>{file.path}</code>
          <div className="segmented" role="group" aria-label="รูปแบบการแสดงไฟล์">
            <button
              type="button"
              aria-pressed={mode === "diff"}
              onClick={() => setMode("diff")}
            >
              Diff
            </button>
            <button
              type="button"
              aria-pressed={mode === "full"}
              onClick={() => setMode("full")}
            >
              ไฟล์เต็ม
            </button>
          </div>
        </div>
        {mode === "diff" && lines ? (
          <div className="diff-scroll" tabIndex={0}>
            <table className="diff-table" aria-label={`Diff ของ ${file.path}`}>
              <thead className="sr-only">
                <tr>
                  <th scope="col">ก่อน</th>
                  <th scope="col">หลัง</th>
                  <th scope="col">การเปลี่ยน</th>
                  <th scope="col">บรรทัด</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.before ? `b${line.before}` : `a${line.after}`}
                    data-change={line.kind}
                  >
                    <td className="ln">{line.before}</td>
                    <td className="ln">{line.after}</td>
                    <td className="sign">
                      {line.kind === "remove" ? "−" : line.kind === "add" ? "+" : ""}
                    </td>
                    <td>
                      <code>{line.text}</code>
                      {line.kind !== "context" && line.ending !== "LF" && (
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
        ) : (
          <div className="diff-scroll" tabIndex={0}>
            {mode === "diff" && (
              <p className="hint diff-note">
                ไฟล์ใหญ่เกินกว่าจะคำนวณ diff แสดงเนื้อหาหลังแก้ทั้งหมด
              </p>
            )}
            <table className="diff-table" aria-label={`เนื้อหาเต็มของ ${file.path}`}>
              <tbody>
                {lineSplit(file.after).map((text, index) => (
                  <tr key={index}>
                    <td className="ln">{index + 1}</td>
                    <td>
                      <code>{text}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
