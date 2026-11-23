import { test, expect } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

test("review page shows FORGE changes, recorded checks and digest approval", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((roster) => {
    const step = (id: string, stepName: string, agentId: string, status: string, extra = {}) => ({
      id,
      projectId: "p",
      agentId,
      adapter: agentId === "forge" ? "claude" : "codex",
      title: stepName,
      prompt: "",
      dependencies: [],
      priority: 50,
      timeoutSeconds: 30,
      retryLimit: 2,
      attempts: 1,
      status,
      workflowId: "wf-review",
      step: stepName,
      gate: stepName === "uat",
      approved: false,
      createdAt: "2026-11-21",
      lastExecutionId: null,
      blocker: null,
      ...extra,
    });
    const implement = step("t-impl", "implement", "forge", "needs_review", {
      lastExecutionId: "exec-forge-0001",
    });
    const tasks = [
      implement,
      step("t-review", "review", "scout", "blocked"),
      step("t-uat", "uat", "scout", "draft"),
    ];
    const info = {
      policy: [{ path: "app/page.tsx", before: "a\nb\n" }],
      digest: "review-fixture-digest",
      patch: {
        state: "staged",
        before: [
          { path: "app/page.tsx", before: "line one\nold line\nline three\n" },
          { path: "lib/new.ts", before: null },
        ],
        files: [
          { path: "app/page.tsx", content: "line one\nnew line\nextra line\nline three\n" },
          { path: "lib/new.ts", content: "export const x = 1;\n" },
        ],
      },
    };
    const target = globalThis as unknown as {
      isTauri: boolean;
      writingRequest: unknown;
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
      };
    };
    target.isTauri = true;
    target.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        if (cmd === "snapshot")
          return structuredClone({
            agents: roster,
            projects: [
              { id: "p", name: "REVIEW FIXTURE", path: "FIXTURE_ONLY", goal: "", isGit: true, createdAt: "2026-11-21" },
            ],
            executions: [
              {
                id: "exec-forge-0001",
                taskId: "t-impl",
                projectId: "p",
                agentId: "forge",
                adapter: "claude",
                prompt: "",
                status: "completed",
                createdAt: "2026-11-21T10:00:00Z",
                finishedAt: "2026-11-21T10:01:00Z",
                error: null,
                pid: 4242,
                sessionId: null,
              },
            ],
            tasks,
            workflows: [
              { id: "wf-review", projectId: "p", objective: "Build the changelog page", status: "active", createdAt: "2026-11-21", reworkCount: 0 },
            ],
            schedulerPaused: true,
            dataPath: "FIXTURE_ONLY",
            remoteStatus: "not_configured",
          });
        if (cmd === "execution_events") return [];
        if (cmd === "execution_result")
          return {
            executionId: "exec-forge-0001",
            projectId: "p",
            agentId: "forge",
            adapter: "claude",
            event: { id: 1, executionId: "exec-forge-0001", kind: "artifact", text: "FIXTURE ONLY: added the changelog filter", createdAt: "2026-11-21T10:01:00Z" },
          };
        if (cmd === "writing_info") return structuredClone(info);
        if (cmd === "writing_action") {
          target.writingRequest = args;
          info.patch.state = "applied";
          implement.status = "completed";
          return;
        }
        throw new Error(`Unsupported fixture command: ${cmd}`);
      },
    };
  }, agents);

  await page.goto("/?view=console&page=monitor");
  await expect(
    page.getByRole("heading", { name: /พัฒนา — Build the changelog page/ }),
  ).toBeVisible();
  await expect(page.locator(".run-meta")).toContainText("CLAUDE CODE");
  await expect(page.locator(".run-meta")).toContainText("ขั้น 1 จาก 3");

  const changes = page.getByRole("tab", { name: "การเปลี่ยนแปลง · 2 ไฟล์" });
  await expect(changes).toHaveAttribute("aria-selected", "true");
  const files = page.getByRole("navigation", { name: "ไฟล์ที่เปลี่ยน" });
  await expect(files).toContainText("+3");
  await expect(files).toContainText("−1");
  const diff = page.getByRole("table", { name: "Diff ของ app/page.tsx" });
  await expect(diff.locator('[data-change="remove"]')).toContainText("old line");
  await expect(diff.locator('[data-change="add"]').first()).toContainText("new line");

  await files.getByRole("button", { name: /lib\/new\.ts/ }).click();
  await page.getByRole("button", { name: "ไฟล์เต็ม" }).click();
  await expect(
    page.getByRole("table", { name: "เนื้อหาเต็มของ lib/new.ts" }),
  ).toContainText("export const x = 1;");

  const side = page.getByRole("complementary", { name: "สรุปและการตรวจ" });
  await expect(side).toContainText("FIXTURE ONLY: added the changelog filter");
  await expect(side.getByRole("listitem")).toHaveCount(4);
  await expect(side).toContainText("รอคุณตรวจ");
  // แผงอนุมัติไม่แสดง diff ซ้ำ
  await expect(side.getByRole("table")).toHaveCount(0);

  const apply = side.getByRole("button", { name: "Approve & apply exact patch" });
  await expect(apply).toBeDisabled();
  await side.getByRole("checkbox").check();
  await apply.click();
  await expect(side).toContainText("นำไปใช้แล้ว");
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { writingRequest: unknown }).writingRequest,
    ),
  ).toEqual({ taskId: "t-impl", action: "apply", digest: "review-fixture-digest" });

  await changes.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Log" })).toBeFocused();
  await expect(page.getByRole("region", { name: "Execution logs" })).toBeVisible();
  expect(errors).toEqual([]);
});
