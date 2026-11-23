import { test, expect } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

test("connectors show runtimes in use and the latest CLI check", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((roster) => {
    const target = globalThis as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> };
    };
    target.isTauri = true;
    target.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === "snapshot")
          return structuredClone({
            agents: roster,
            projects: [],
            executions: [],
            tasks: [],
            workflows: [],
            schedulerPaused: true,
            dataPath: "FIXTURE_ONLY",
            remoteStatus: "not_configured",
          });
        if (cmd === "diagnostics")
          return [
            { adapter: "codex", installed: true, version: "0.159.2", authentication: "authenticated", executable: "C:/FIXTURE/codex.exe", supported: true, message: "FIXTURE ONLY" },
            { adapter: "claude", installed: true, version: "2.1.199", authentication: "unauthenticated", executable: "C:/FIXTURE/claude.exe", supported: true, message: "Not logged in" },
            { adapter: "antigravity", installed: false, version: null, authentication: "unknown", executable: null, supported: false, message: "agy not found" },
            { adapter: "mock", installed: true, version: "1.0", authentication: "not_required", executable: null, supported: true, message: "" },
          ];
        throw new Error(`Unsupported fixture command: ${cmd}`);
      },
    };
  }, agents);

  await page.goto("/?view=console&page=runtimes");
  const used = page.getByRole("tab", { name: "ทีมใช้อยู่ · 3" });
  await expect(used).toHaveAttribute("aria-selected", "true");
  const codex = page.getByRole("article", { name: "OpenAI Codex" });
  await expect(codex).toContainText("ใช้โดย ASTRA, VECTOR, SCOUT");
  await expect(codex).toContainText("ยังไม่ได้ตรวจ");
  await expect(page.getByRole("article", { name: "Mock Adapter" })).toHaveCount(0);

  await page.getByRole("button", { name: "Check runtimes" }).click();
  await expect(codex).toContainText("พร้อมใช้");
  await expect(codex).toContainText("C:/FIXTURE/codex.exe");
  await expect(page.getByRole("article", { name: "Claude Code" })).toContainText(
    "ต้อง login ใน CLI",
  );
  await expect(page.getByRole("article", { name: "Antigravity" })).toContainText(
    "ไม่พบ CLI",
  );

  await used.press("ArrowRight");
  const all = page.getByRole("tab", { name: "ทั้งหมด · 4" });
  await expect(all).toBeFocused();
  await expect(page.getByRole("article", { name: "Mock Adapter" })).toContainText(
    "ยังไม่มี agent ใช้",
  );
  expect(errors).toEqual([]);
});
