import { test, expect } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

test("home: 3D stage, project detail and CEO order via fixture IPC", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((roster) => {
    const projectId = "1a484ea5-b267-455c-8c8f-21f18bf08656";
    const tasks: Record<string, unknown>[] = [];
    const workflows: Record<string, unknown>[] = [];
    const fixture = globalThis as unknown as {
      isTauri: boolean;
      calls: string[];
      __TAURI_INTERNALS__: {
        invoke: (
          cmd: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    };
    fixture.isTauri = true;
    fixture.calls = [];
    fixture.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        fixture.calls.push(cmd);
        if (cmd === "snapshot")
          return structuredClone({
            agents: roster,
            projects: [
              {
                id: projectId,
                name: "HOME FIXTURE",
                goal: "FIXTURE ONLY",
                path: "FIXTURE_ONLY",
                isGit: true,
                createdAt: new Date().toISOString(),
              },
            ],
            executions: [],
            tasks,
            workflows,
            schedulerPaused: true,
            dataPath: "FIXTURE_ONLY",
            remoteStatus: "not_configured",
          });
        if (cmd === "create_workflow") {
          const workflow = {
            id: "wf-fixture-0001",
            projectId: args.projectId,
            objective: args.objective,
            status: "active",
            createdAt: new Date().toISOString(),
            reworkCount: 0,
          };
          workflows.push(workflow);
          tasks.push({
            id: "task-plan",
            projectId,
            agentId: "astra",
            adapter: "mock",
            title: "plan",
            prompt: "",
            dependencies: [],
            priority: 1,
            timeoutSeconds: 60,
            retryLimit: 2,
            attempts: 0,
            status: "ready",
            workflowId: workflow.id,
            step: "plan",
            gate: false,
            approved: false,
            createdAt: new Date().toISOString(),
            lastExecutionId: null,
            blocker: "Human approval required",
          });
          return workflow;
        }
        if (cmd === "execution_events") return [];
        throw Error(`Unexpected fixture command ${cmd}`);
      },
    };
  }, agents);
  await page.goto("/");
  await expect(page.locator(".home-stage")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ASTRA · CEO" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ดูรายละเอียด HOME FIXTURE" }).click();
  await expect(
    page.getByRole("heading", { name: "HOME FIXTURE", exact: true }),
  ).toBeVisible();
  await page.getByLabel("ข้อความถึง CEO").fill("FIXTURE ORDER");
  await page.getByLabel("ข้อความถึง CEO").press("Enter");
  await expect(page.getByText("รับงานแล้วครับ — HOME FIXTURE")).toBeVisible();
  await expect(
    page.getByText("วางแผน (ASTRA)", { exact: false }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { calls: string[] }).calls,
    ),
  ).toContain("create_workflow");
  await page.getByRole("link", { name: "ภาพรวม" }).click();
  await expect(page).toHaveURL(/view=console/);
  await page.getByRole("link", { name: /คิวงาน/ }).click();
  await expect(
    page.getByRole("heading", { name: "Task queue & workflows" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("home preview without Desktop keeps chat disabled", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Browser preview · Desktop required"),
  ).toBeVisible();
  await expect(page.getByLabel("ข้อความถึง CEO")).toBeDisabled();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "แชท CEO" }).click();
  await expect(page).toHaveURL(/view=chat/);
  await expect(page.getByLabel("ข้อความถึง CEO")).toBeDisabled();
  await expect(page.locator(".home-stage")).toHaveCount(0);
});
