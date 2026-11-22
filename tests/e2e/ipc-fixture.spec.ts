import { test, expect } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((roster) => {
    const snapshot = {
      agents: roster,
      projects: [] as Record<string, unknown>[],
      executions: [] as Record<string, unknown>[],
      dataPath: "FIXTURE_ONLY/crewnest.db",
      remoteStatus: "not_configured",
    };
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    let revokedPairing = new URLSearchParams(location.search).has(
      "fixture-revoked",
    );
    const fixture = globalThis as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: {
        invoke: (
          cmd: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      fixtureCalls: typeof calls;
    };
    fixture.isTauri = true;
    fixture.fixtureCalls = calls;
    fixture.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        calls.push({ cmd, args });
        if (cmd === "snapshot") return structuredClone(snapshot);
        if (cmd === "remote_status")
          return {
            connection: revokedPairing ? "pairing_required" : "not_configured",
            deviceId: revokedPairing ? "revoked-fixture-device" : null,
            server: revokedPairing ? "https://fixture.invalid" : null,
            shared: [],
          };
        if (cmd === "remote_forget") {
          revokedPairing = false;
          return;
        }
        if (cmd === "diagnostics")
          return [
            {
              adapter: "mock",
              installed: true,
              version: "FIXTURE_ONLY",
              authentication: "not_required",
              supported: true,
              message: "MOCK — test fixture",
              executable: null,
            },
          ];
        if (cmd === "pick_folder") return "FIXTURE_ONLY/approved-workspace";
        if (cmd === "inspect_folder")
          return { path: args.path, repoRoot: args.path, isGit: true, warning: null };
        if (cmd === "create_project") {
          const project = {
            id: "ef574f51-d65f-4ce8-b3d8-c1bd53e51af4",
            name: args.name,
            goal: args.goal,
            path: "FIXTURE_ONLY/approved-workspace",
            isGit: true,
            createdAt: new Date().toISOString(),
            folders: [
              {
                id: "fixture-folder",
                path: "FIXTURE_ONLY/approved-workspace",
                repoRoot: "FIXTURE_ONLY/approved-workspace",
                isGit: true,
                isPrimary: true,
                position: 0,
                exists: true,
              },
            ],
          };
          snapshot.projects.push(project);
          return structuredClone(project);
        }
        if (cmd === "start_run") {
          const request = args.request as Record<string, unknown>;
          if (request.prompt === "fail fixture")
            throw new Error("Fixture runtime unavailable");
          const run = {
            id: "0c61b100-792d-49e5-83b4-dd5b522d948a",
            taskId: crypto.randomUUID(),
            ...request,
            status: "completed",
            createdAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            error: null,
            pid: null,
            sessionId: null,
          };
          snapshot.executions.push(run);
          return structuredClone(run);
        }
        if (cmd === "execution_events")
          return Number(args.after) > 0
            ? []
            : [
                {
                  id: 1,
                  executionId: args.executionId,
                  kind: "mock",
                  text: 'FIXTURE_ONLY <img src=x onerror="globalThis.injected=true">',
                  createdAt: new Date().toISOString(),
                },
              ];
        throw new Error(`Unexpected fixture command: ${cmd}`);
      },
    };
  }, agents);
});

test("Desktop แจ้งให้จับคู่ใหม่หลัง revoke และเปิดฟอร์มเมื่อลืมการจับคู่เดิม", async ({
  page,
}) => {
  await page.goto("/?view=console&page=remote&fixture-revoked");
  await expect(page.getByRole("alert")).toContainText("pairing code ใหม่");
  await expect(
    page.getByRole("button", { name: "Connect remote", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Forget pairing locally" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pair device" })).toBeEnabled();
});

test("frontend IPC fixture: project, explicit approval, mock result and safe log rendering", async ({
  page,
}) => {
  await page.goto("/?view=console&page=projects");
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByLabel("ชื่อโปรเจกต์").fill("Fixture project");
  await page.getByLabel("Project objective").fill("UI integration test only");
  await page.getByRole("button", { name: "+ เพิ่ม folder" }).click();
  await page.getByRole("button", { name: "สร้างโปรเจกต์" }).click();
  await expect(
    page.getByRole("heading", { name: "Fixture project", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New execution" }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption("ef574f51-d65f-4ce8-b3d8-c1bd53e51af4");
  await page.getByLabel("Task prompt").fill("UI fixture only");
  await page.getByRole("button", { name: "Review & start" }).click();
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as { fixtureCalls: { cmd: string }[] }
        ).fixtureCalls.filter((c) => c.cmd === "start_run").length,
    ),
  ).toBe(0);
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review & start" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("#monitor")).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Execution logs" }),
  ).toContainText("FIXTURE_ONLY <img");
  await expect(
    page.getByRole("region", { name: "Execution logs" }).locator("img"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { injected?: boolean }).injected,
    ),
  ).toBeUndefined();
  await expect(
    page.getByText("MOCK — no AI model", { exact: false }),
  ).toBeVisible();
});

test("frontend IPC fixture: failed start retains prompt and does not fabricate a run", async ({
  page,
}) => {
  await page.goto("/?view=console&page=projects");
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByLabel("ชื่อโปรเจกต์").fill("Fixture project");
  await page.getByRole("button", { name: "+ เพิ่ม folder" }).click();
  await page.getByRole("button", { name: "สร้างโปรเจกต์" }).click();
  await page.getByRole("button", { name: "New execution" }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption("ef574f51-d65f-4ce8-b3d8-c1bd53e51af4");
  await page.getByLabel("Task prompt").fill("fail fixture");
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review & start" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Fixture runtime unavailable",
  );
  await expect(page.getByLabel("Task prompt")).toHaveValue("fail fixture");
  await expect(page.getByRole("dialog")).toBeVisible();
});
