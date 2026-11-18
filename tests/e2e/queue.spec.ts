import { test, expect } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

test("queue UI fixture: create draft, inspect approval request and pause scheduling", async ({
  page,
}) => {
  await page.addInitScript((roster) => {
    const tasks: Record<string, unknown>[] = [];
    let paused = true;
    const fixture = globalThis as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: {
        invoke: (
          cmd: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      queueCalls: string[];
    };
    fixture.isTauri = true;
    fixture.queueCalls = [];
    fixture.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        fixture.queueCalls.push(cmd);
        if (cmd === "snapshot")
          return structuredClone({
            agents: roster,
            projects: [
              {
                id: "1a484ea5-b267-455c-8c8f-21f18bf08656",
                name: "QUEUE FIXTURE",
                path: "FIXTURE_ONLY",
                goal: "",
                isGit: false,
                createdAt: new Date().toISOString(),
              },
            ],
            executions: [],
            tasks,
            workflows: [],
            schedulerPaused: paused,
            dataPath: "FIXTURE_ONLY",
            remoteStatus: "not_configured",
          });
        if (cmd === "create_task") {
          const task = {
            ...(args.input as object),
            id: "task-fixture",
            status: "draft",
            attempts: 0,
            step: "task",
            gate: false,
            approved: false,
            workflowId: null,
            createdAt: new Date().toISOString(),
            lastExecutionId: null,
            blocker: "Human approval required",
          };
          tasks.push(task);
          return task;
        }
        if (cmd === "queue_events")
          return [
            {
              id: 1,
              taskId: args.taskId,
              kind: "created",
              text: "FIXTURE ONLY: draft created",
              createdAt: new Date().toISOString(),
            },
          ];
        if (cmd === "queue_action") {
          tasks[0].status = "queued";
          return;
        }
        if (cmd === "scheduling") {
          paused = Boolean(args.paused);
          return;
        }
        throw Error(`Unexpected fixture command ${cmd}`);
      },
    };
  }, agents);
  await page.goto("/");
  await page.getByRole("button", { name: "＋ Add task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption("1a484ea5-b267-455c-8c8f-21f18bf08656");
  await dialog.getByLabel("Task title").fill("QUEUE FIXTURE TASK");
  await dialog.getByLabel("Task prompt").fill("Synthetic queue fixture task");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("button", { name: /QUEUE FIXTURE TASK/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (globalThis as unknown as { queueCalls: string[] }).queueCalls.includes(
        "queue_action",
      ),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: /QUEUE FIXTURE TASK/ }).click();
  await expect(
    page.getByText("FIXTURE ONLY: draft created", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review & approve queue task" })
    .click();
  await expect(
    page.getByRole("button", { name: /QUEUE FIXTURE TASK/ }),
  ).toContainText("queued");
  await page.getByRole("button", { name: "Resume scheduling" }).click();
  await expect(
    page.getByRole("button", { name: "Pause scheduling" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause scheduling" }).click();
  await expect(
    page.getByRole("button", { name: "Resume scheduling" }),
  ).toBeVisible();
});
