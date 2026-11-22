import { describe, expect, it } from "vitest";
import { chatExecutionRef } from "../../apps/desktop/src/executionResult";
import { patchDiff } from "../../apps/desktop/src/patchDiff";

describe("references from CEO chat history", () => {
  const legacy = {
    id: "execution:a31d5551-f458-4207-b94a-1f7cb8ce1637",
    from: "ceo",
    projectId: "project",
  };

  it("reads the original execution and project from a persisted message", () => {
    expect(chatExecutionRef(legacy)).toEqual({
      executionId: "a31d5551-f458-4207-b94a-1f7cb8ce1637",
      projectId: "project",
    });
  });

  it("requires a project and a runtime message reference", () => {
    expect(chatExecutionRef({ ...legacy, projectId: undefined })).toBeNull();
    expect(chatExecutionRef({ ...legacy, from: "owner" })).toBeNull();
    expect(chatExecutionRef({ ...legacy, id: "workflow:abc123" })).toBeNull();
  });
});

describe("staged patch diff", () => {
  it("keeps both line numbers and literal Thai text", () => {
    expect(patchDiff("เดิม\nเหมือนเดิม\n", "ใหม่\nเหมือนเดิม\n")).toEqual([
      { kind: "remove", before: 1, text: "เดิม", ending: "LF" },
      { kind: "add", after: 1, text: "ใหม่", ending: "LF" },
      {
        kind: "context",
        before: 2,
        after: 2,
        text: "เหมือนเดิม",
        ending: "LF",
      },
    ]);
  });

  it("distinguishes line endings including a missing final newline", () => {
    expect(
      patchDiff("a\r\n\r\nb\r", "a\n\nb")?.map(({ ending }) => ending),
    ).toEqual(["CRLF", "CRLF", "CR", "LF", "LF", "EOF"]);
  });

  it("represents a new file without inventing empty lines", () => {
    expect(patchDiff("", "")).toEqual([]);
    expect(patchDiff("", "\n")).toEqual([
      { kind: "add", after: 1, text: "", ending: "LF" },
    ]);
  });

  it("requests Before/After fallback for expensive or lengthy diffs", () => {
    expect(patchDiff("a\n".repeat(500), "b\n".repeat(500))).toBeNull();
    expect(patchDiff("", "b\n".repeat(1001))).toBeNull();
  });
});
