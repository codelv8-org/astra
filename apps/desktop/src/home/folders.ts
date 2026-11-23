/** helpers ของรายการ source folder (ใช้ทั้งฟอร์มสร้างโปรเจกต์และ ProjectDetail) */
export const MAX_FOLDERS = 8;

export interface FolderRow {
  path: string;
  repoRoot: string | null;
  isGit: boolean;
  warning: string | null;
  exists: boolean;
  isPrimary: boolean;
}

const same = (a: string, b: string) =>
  a.replace(/\\+$/, "").toLowerCase() === b.replace(/\\+$/, "").toLowerCase();

export function canRemove(row: FolderRow, rows: FolderRow[]) {
  return !row.isPrimary && rows.length > 1;
}

export function addDraft(
  drafts: FolderRow[],
  next: FolderRow,
): { drafts: FolderRow[] } | { error: string } {
  if (drafts.length >= MAX_FOLDERS)
    return { error: `โปรเจกต์มี folder ได้สูงสุด ${MAX_FOLDERS} รายการ` };
  if (drafts.some((d) => same(d.path, next.path)))
    return { error: "เพิ่ม folder นี้ไว้แล้ว" };
  return { drafts: [...drafts, next] };
}

export function removeDraft(drafts: FolderRow[], index: number, primary: number) {
  return {
    drafts: drafts.filter((_, i) => i !== index),
    primary: index < primary ? primary - 1 : primary,
  };
}

export function folderBadge(row: FolderRow) {
  if (!row.exists) return "ไม่พบ folder";
  return row.isGit ? "git" : "ไม่ใช่ git";
}
