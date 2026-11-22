import { describe, expect, it } from "vitest";
import {
  addDraft,
  canRemove,
  folderBadge,
  MAX_FOLDERS,
  removeDraft,
  type FolderRow,
} from "../../apps/desktop/src/home/folders";

const row = (path: string, extra: Partial<FolderRow> = {}): FolderRow => ({
  path,
  repoRoot: null,
  isGit: false,
  warning: null,
  exists: true,
  isPrimary: false,
  ...extra,
});

describe("source folder helpers", () => {
  it("primary และแถวสุดท้ายลบไม่ได้", () => {
    const rows = [row("A", { isPrimary: true }), row("B")];
    expect(canRemove(rows[0], rows)).toBe(false);
    expect(canRemove(rows[1], rows)).toBe(true);
    expect(canRemove(rows[1], [rows[1]])).toBe(false);
  });

  it("ลบแถวก่อน primary แล้ว index ของ primary เลื่อนตาม", () => {
    const drafts = [row("A"), row("B"), row("C")];
    expect(removeDraft(drafts, 2, 0)).toEqual({ drafts: [row("A"), row("B")], primary: 0 });
    expect(removeDraft(drafts, 0, 2)).toEqual({ drafts: [row("B"), row("C")], primary: 1 });
    expect(removeDraft(drafts, 1, 2).primary).toBe(1);
  });

  it("ไม่รับ folder ซ้ำ (ไม่สนตัวพิมพ์) และไม่เกิน 8", () => {
    const drafts = [row("C:\\Work\\App")];
    expect(addDraft(drafts, row("c:\\work\\app"))).toEqual({
      error: "เพิ่ม folder นี้ไว้แล้ว",
    });
    expect(addDraft(drafts, row("C:\\Work\\Api"))).toEqual({
      drafts: [row("C:\\Work\\App"), row("C:\\Work\\Api")],
    });
    const full = Array.from({ length: MAX_FOLDERS }, (_, i) => row(`F${i}`));
    expect(addDraft(full, row("X"))).toEqual({
      error: `โปรเจกต์มี folder ได้สูงสุด ${MAX_FOLDERS} รายการ`,
    });
  });

  it("ป้ายสถานะ folder", () => {
    expect(folderBadge(row("A", { exists: false, isGit: true }))).toBe("ไม่พบ folder");
    expect(folderBadge(row("A", { isGit: true }))).toBe("git");
    expect(folderBadge(row("A"))).toBe("ไม่ใช่ git");
  });
});
