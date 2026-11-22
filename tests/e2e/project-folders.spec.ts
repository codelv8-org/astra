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
    const picks = ["C:\\Work\\web", "C:\\Work\\api", "C:\\Work\\web\\docs"];
    const inspected = (path: string) => ({
      path: `\\\\?\\${path}`,
      repoRoot: path.endsWith("docs") ? null : `\\\\?\\${path}`,
      isGit: !path.endsWith("docs"),
      warning: null,
    });
    const fixture = globalThis as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> };
      fixtureCalls: { cmd: string; args: Record<string, unknown> }[];
    };
    fixture.isTauri = true;
    fixture.fixtureCalls = [];
    fixture.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        fixture.fixtureCalls.push({ cmd, args });
        if (cmd === "snapshot") return structuredClone(snapshot);
        if (cmd === "remote_status")
          return { connection: "not_configured", deviceId: null, server: null, shared: [] };
        if (cmd === "diagnostics") return [];
        if (cmd === "pick_folder") return picks.shift() ?? null;
        if (cmd === "inspect_folder") {
          if (String(args.path).endsWith("docs"))
            throw new Error("folder ซ้อนกับ folder ที่มีอยู่: C:\\Work\\web");
          return inspected(String(args.path));
        }
        if (cmd === "create_project") {
          const folders = (args.folders as string[]).map((path, index) => ({
            id: `f${index}`,
            ...inspected(path),
            isPrimary: index === args.primary,
            position: index,
            exists: true,
          }));
          const primary = folders[args.primary as number];
          const project = {
            id: "ef574f51-d65f-4ce8-b3d8-c1bd53e51af4",
            name: args.name,
            goal: args.goal,
            path: primary.path,
            isGit: primary.isGit,
            createdAt: new Date().toISOString(),
            folders,
          };
          snapshot.projects.push(project);
          return structuredClone(project);
        }
        return null;
      },
    };
  }, agents);
});

test("เพิ่มโปรเจกต์หลาย source folder และเลือก primary", async ({ page }) => {
  await page.goto("/?view=console&page=projects");
  await page.getByRole("button", { name: "Add project" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ชื่อโปรเจกต์").fill("Multi repo");
  const create = dialog.getByRole("button", { name: "สร้างโปรเจกต์" });
  await expect(create).toBeDisabled();
  const add = dialog.getByRole("button", { name: "+ เพิ่ม folder" });
  await add.click();
  await add.click();
  const rows = dialog.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Primary");
  await expect(rows.nth(1)).toContainText("git");
  await add.click();
  await expect(dialog.getByRole("alert")).toContainText("folder ซ้อนกับ folder ที่มีอยู่");
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByRole("button", { name: "ตั้งเป็น primary" }).click();
  await expect(rows.nth(1)).toContainText("Primary");
  await expect(rows.nth(0).getByRole("button", { name: "ลบ" })).toBeEnabled();
  await create.click();
  await expect(page.getByRole("heading", { name: "Multi repo", exact: true })).toBeVisible();
  const call = await page.evaluate(() =>
    (globalThis as unknown as { fixtureCalls: { cmd: string; args: Record<string, unknown> }[] })
      .fixtureCalls.find((c) => c.cmd === "create_project"),
  );
  expect(call?.args.primary).toBe(1);
  expect(call?.args.folders).toEqual(["\\\\?\\C:\\Work\\web", "\\\\?\\C:\\Work\\api"]);
  await expect(page.getByText("2 folders")).toBeVisible();
});
