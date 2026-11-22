import { test, expect } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

test("persisted Claude IPC fixture shows the actual runtime provider", async ({
  page,
}) => {
  await page.addInitScript((roster) => {
    const fixture = globalThis as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> };
    };
    fixture.isTauri = true;
    fixture.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === "snapshot")
          return {
            agents: roster,
            projects: [],
            tasks: [],
            workflows: [],
            schedulerPaused: true,
            dataPath: "FIXTURE_ONLY",
            remoteStatus: "not_configured",
            executions: [
              {
                id: "claude-fixture",
                projectId: "fixture",
                agentId: "forge",
                taskId: "fixture",
                adapter: "claude",
                prompt: "FIXTURE ONLY",
                status: "completed",
                createdAt: "2026-11-18",
                finishedAt: "2026-11-18",
                error: null,
                pid: null,
                sessionId: null,
              },
            ],
          };
        if (cmd === "execution_events") return [];
        throw new Error(`Unsupported fixture command: ${cmd}`);
      },
    };
  }, agents);
  await page.goto("/?view=console&page=monitor");
  await page
    .getByRole("combobox", { name: /^Execution/ })
    .selectOption("claude-fixture");
  await expect(page.locator(".run-meta")).toContainText("CLAUDE CODE");
  await expect(page.locator(".run-meta")).not.toContainText("CODEX");
});
