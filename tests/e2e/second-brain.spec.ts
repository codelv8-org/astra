import { test, expect } from "@playwright/test";

test("ตั้งค่า vault ของ Second Brain แล้วเก็บไว้หลังรีโหลด", async ({ page }) => {
  await page.goto("/?view=console&page=brain");
  await expect(page.getByRole("heading", { name: "Second Brain", level: 1 })).toBeVisible();
  await expect(page.getByText("ยังไม่เชื่อมต่อ")).toBeVisible();
  await page.getByLabel("โฟลเดอร์ vault").fill(String.raw`X:\second-brain`);
  await page.getByRole("button", { name: "บันทึก" }).click();
  await page.reload();
  await expect(page.getByText("เชื่อมต่อแล้ว")).toBeVisible();
  await expect(page.locator("code.path")).toHaveText(String.raw`X:\second-brain`);
  await expect(page.getByRole("button", { name: "เปิดใน Obsidian" })).toBeVisible();
  await page.getByRole("button", { name: "ยกเลิกการเชื่อมต่อ" }).click();
  await expect(page.getByText("ยังไม่เชื่อมต่อ")).toBeVisible();
});
