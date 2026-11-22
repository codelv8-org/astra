import { displayPath } from "./ceo";
import { canRemove, folderBadge, MAX_FOLDERS, type FolderRow } from "./folders";

/** รายการ source folder: ป้าย git, primary, ตั้งเป็น primary, ลบ, เพิ่ม */
export function FolderList({
  rows,
  busy,
  onAdd,
  onRemove,
  onMakePrimary,
}: {
  rows: FolderRow[];
  busy: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMakePrimary: (index: number) => void;
}) {
  return (
    <div className="folder-list">
      <ul aria-label="Source folders">
        {rows.map((row, index) => (
          <li key={row.path} className={row.isPrimary ? "primary-folder" : undefined}>
            <code title={displayPath(row.path)}>{displayPath(row.path)}</code>
            <span className={`chip ${row.exists ? "" : "bad"}`}>{folderBadge(row)}</span>
            <span className="folder-actions">
              {row.isPrimary ? (
                <span className="chip ok">★ Primary</span>
              ) : (
                <button
                  type="button"
                  className="link"
                  disabled={busy || !row.exists}
                  onClick={() => onMakePrimary(index)}
                >
                  ตั้งเป็น primary
                </button>
              )}
              <button
                type="button"
                className="link"
                disabled={busy || !canRemove(row, rows)}
                onClick={() => onRemove(index)}
              >
                ลบ
              </button>
            </span>
            {row.warning && <span className="folder-warning">{row.warning}</span>}
          </li>
        ))}
      </ul>
      {rows.length < MAX_FOLDERS && (
        <button type="button" disabled={busy} onClick={onAdd}>
          + เพิ่ม folder
        </button>
      )}
    </div>
  );
}
