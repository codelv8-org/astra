import { test, expect } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

test("writing IPC fixture requires content review and exact digest before apply", async ({
  page,
}) => {
  await page.addInitScript((roster) => {
    const task = {
      id: "writing-fixture",
      projectId: "p",
      agentId: "forge",
      adapter: "claude",
      title: "FORGE WRITING FIXTURE",
      prompt: "Synthetic fixture only",
      dependencies: [],
      priority: 50,
      timeoutSeconds: 30,
      retryLimit: 2,
      attempts: 1,
      status: "needs_review",
      workflowId: null,
      step: "implement",
      gate: false,
      approved: false,
      createdAt: "2026-11-17",
      lastExecutionId: "r",
      blocker: null,
    };
    const info = {
      policy: [{ path: "example.mjs", before: "old source" }],
      digest: "fixture-exact-digest",
      patch: {
        state: "staged",
        before: [{ path: "example.mjs", before: "old source" }],
        files: [{ path: "example.mjs", content: "new source" }],
      },
    };
    const target = globalThis as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: {
        invoke: (
          cmd: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      writingRequest: unknown;
    };
    target.isTauri = true;
    target.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        if (cmd === "snapshot")
          return structuredClone({
            agents: roster,
            projects: [
              {
                id: "p",
                name: "WRITING FIXTURE",
                path: "FIXTURE_ONLY",
                goal: "",
                isGit: false,
                createdAt: "2026-11-17",
              },
            ],
            executions: [],
            tasks: [task],
            workflows: [],
            schedulerPaused: true,
            dataPath: "FIXTURE_ONLY",
            remoteStatus: "not_configured",
          });
        if (cmd === "queue_events")
          return info.patch.state === "applied"
            ? [
                {
                  id: 1,
                  taskId: task.id,
                  kind: "patch_applied",
                  text: "FIXTURE ONLY: refreshed without reopening",
                  createdAt: "2026-11-18",
                  initiator: "owner",
                },
              ]
            : [];
        if (cmd === "writing_info") return structuredClone(info);
        if (cmd === "writing_action") {
          target.writingRequest = args;
          info.patch.state = "applied";
          task.status = "completed";
          return;
        }
        throw new Error(`Unsupported fixture command: ${cmd}`);
      },
    };
  }, agents);
  await page.goto("/?view=console&page=tasks");
  await page.getByRole("button", { name: /FORGE WRITING FIXTURE/ }).click();
  const dialog = page.getByRole("dialog");
  const diff = dialog.getByRole("table", { name: "Diff ของ example.mjs" });
  await expect(diff.getByText(/old source/)).toBeVisible();
  await expect(diff.getByText(/new source/)).toBeVisible();
  const apply = dialog.getByRole("button", {
    name: "Approve & apply exact patch",
  });
  await expect(apply).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Accept review", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("checkbox").check();
  await apply.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { writingRequest: unknown }).writingRequest,
      ),
    )
    .toEqual({
      taskId: "writing-fixture",
      action: "apply",
      digest: "fixture-exact-digest",
    });
  await expect(dialog.getByText(/Patch: applied/)).toBeVisible();
  await expect(
    dialog.getByText(/FIXTURE ONLY: refreshed without reopening/),
  ).toBeVisible();
});
