import { test, expect, type Page } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

type Calls = { cmd: string; args: Record<string, unknown> }[];

/** broken: true = share หาไม่เจอ, string = ข้อความ error ที่ Desktop Core ส่งมา */
async function fixture(page: Page, options: { broken?: boolean | string; existing?: boolean }) {
  await page.addInitScript(
    ({ roster, broken, existing }) => {
      const snapshot = {
        agents: roster,
        projects: [],
        executions: [],
        dataPath: "FIXTURE_ONLY/crewnest.db",
        remoteStatus: "not_configured",
      };
      const fixture = globalThis as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> };
        fixtureCalls: Calls;
      };
      fixture.isTauri = true;
      fixture.fixtureCalls = [];
      fixture.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          fixture.fixtureCalls.push({ cmd, args });
          if (cmd === "storage_info")
            return broken
              ? {
                  status: "error",
                  error:
                    typeof broken === "string"
                      ? broken
                      : "ไม่พบที่จัดเก็บ \\\\nas\\astra — เข้าถึงพื้นที่จัดเก็บไม่ได้",
                  info: null,
                  previous: "C:\\Users\\me\\AppData\\Local\\Astra",
                }
              : {
                  status: "ok",
                  error: null,
                  info: {
                    dataDir: "\\\\nas\\team\\astra",
                    mode: "network",
                    dbBytes: 5_242_880,
                    freeBytes: 1_073_741_824,
                    previous: "C:\\Users\\me\\AppData\\Local\\Astra",
                  },
                  previous: "C:\\Users\\me\\AppData\\Local\\Astra",
                };
          if (cmd === "snapshot") return structuredClone(snapshot);
          if (cmd === "remote_status")
            return { connection: "not_configured", deviceId: null, server: null, shared: [] };
          if (cmd === "diagnostics") return [];
          if (cmd === "pick_storage_folder") return "D:\\AstraData";
          if (cmd === "change_storage_folder") {
            if (existing && !args.useExisting) throw new Error("EXISTING_DB");
            return null;
          }
          return null;
        },
      };
    },
    { roster: agents, broken: options.broken ?? false, existing: options.existing ?? false },
  );
}

const calls = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { fixtureCalls: Calls }).fixtureCalls);

test("หน้าพื้นที่จัดเก็บแสดงตำแหน่งและป้าย Network", async ({ page }) => {
  await fixture(page, {});
  await page.goto("/?view=console&page=storage");
  await expect(page.getByRole("heading", { name: "พื้นที่จัดเก็บ", level: 1 })).toBeVisible();
  await expect(page.getByText("\\\\nas\\team\\astra")).toBeVisible();
  await expect(page.getByText("Network", { exact: true })).toBeVisible();
  await expect(page.getByText("5.0 MB")).toBeVisible();
  await expect(page.getByRole("button", { name: "ลบข้อมูลที่ตำแหน่งเดิม" })).toBeVisible();
});

test("ปลายทางมีข้อมูลเดิม ถามก่อนใช้ แล้วแจ้งให้รีสตาร์ท", async ({ page }) => {
  await fixture(page, { existing: true });
  await page.goto("/?view=console&page=storage");
  await page.getByRole("button", { name: "เปลี่ยนที่จัดเก็บ…" }).click();
  const ask = page.getByRole("dialog");
  await expect(ask).toContainText("พบข้อมูลเดิมที่ตำแหน่งนี้");
  await ask.getByRole("button", { name: "ใช้ข้อมูลนี้" }).click();
  await expect(page.getByText("รีสตาร์ทเพื่อใช้ตำแหน่งใหม่")).toBeVisible();
  const changes = (await calls(page)).filter((c) => c.cmd === "change_storage_folder");
  expect(changes.map((c) => c.args.useExisting)).toEqual([false, true]);
  await page.getByRole("button", { name: "รีสตาร์ทเลย" }).click();
  expect((await calls(page)).some((c) => c.cmd === "restart_app")).toBe(true);
});

test("storage ใช้ไม่ได้ เปิดหน้ากู้คืนแทนแอป", async ({ page }) => {
  await fixture(page, { broken: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "เข้าถึงพื้นที่จัดเก็บไม่ได้" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("\\\\nas\\astra");
  await expect(page.getByRole("button", { name: "ลองใหม่" })).toBeVisible();
  await expect(page.getByRole("button", { name: "เลือก folder อื่น" })).toBeVisible();
  await expect(page.getByRole("button", { name: "กลับไปใช้ตำแหน่งเดิม" })).toBeVisible();
  expect((await calls(page)).some((c) => c.cmd === "snapshot")).toBe(false);
});

test("ข้อมูลเปิดอยู่บนเครื่องอื่น หน้ากู้คืนบอกให้ปิดแอปที่เครื่องนั้น", async ({ page }) => {
  await fixture(page, { broken: "ข้อมูลกำลังถูกใช้โดย PC-01 pid 4242 (2026-11-22T15:49:46Z)" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ข้อมูลเปิดอยู่บนเครื่องอื่น" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("PC-01 pid 4242");
  await expect(page.getByText("ปิด Astra บนเครื่องนั้นก่อน")).toBeVisible();
  await expect(page.getByText("ตรวจว่าเชื่อมต่อ File Sharing")).toHaveCount(0);
});

test("คำอธิบายหน้าพื้นที่จัดเก็บบอกว่าแอปรีสตาร์ทเอง", async ({ page }) => {
  await fixture(page, {});
  await page.goto("/?view=console&page=storage");
  await expect(page.getByText("แล้วรีสตาร์ทแอปเองเพื่อใช้ตำแหน่งใหม่")).toBeVisible();
  await expect(page.getByText("สลับหลังรีสตาร์ท")).toHaveCount(0);
});
