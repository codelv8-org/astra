import { test, expect } from "@playwright/test";

test("themes switch the scene world and remember the choice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=console&page=themes");
  const hero = page.getByRole("region", { name: "โลกที่ใช้อยู่" });
  await expect(hero.getByRole("heading", { name: "ออฟฟิศ" })).toBeVisible();
  const cards = page.getByRole("region", { name: "ธีมทั้งหมด" }).getByRole("listitem");
  await expect(cards).toHaveCount(5);
  await expect(page.getByRole("button", { name: "ใช้อยู่" })).toBeDisabled();
  // ภาพตัวอย่างวาดลง canvas (CSP ของแอป native ไม่อนุญาต data: URL ใน img)
  await expect(page.locator("canvas.world-image")).toHaveCount(6, { timeout: 15000 });
  expect(await page.locator("img.world-image").count()).toBe(0);

  await page.getByRole("button", { name: "ใช้สถานีอวกาศ" }).click();
  await expect(hero.getByRole("heading", { name: "สถานีอวกาศ" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("astra-world"))).toBe(
    "station",
  );
  await page.reload();
  await expect(hero.getByRole("heading", { name: "สถานีอวกาศ" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ธีมโลก" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(errors).toEqual([]);
});
