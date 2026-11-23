import { test, expect } from "@playwright/test";

test("preview never exposes functional local execution and shows five CrewBots", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=console&page=agents");
  await expect(
    page.getByRole("button", { name: "New execution" }),
  ).toBeDisabled();
  // การ์ดโต๊ะงานหนึ่งใบต่อ CrewBot: ชื่อการ์ดคือบทบาท คำอธิบายคือชื่อ agent
  for (const name of ["ASTRA", "FORGE", "MIRA", "VECTOR", "SCOUT"])
    await expect(
      page.getByRole("article", { description: new RegExp(`^${name}`) }),
    ).toBeVisible();
  await expect(
    page.getByText("Browser preview · Desktop required"),
  ).toBeVisible();
  const runtime = page.getByRole("link", { name: "Runtime", exact: true });
  await runtime.click();
  await expect(runtime).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "ลำดับการส่งต่องาน", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check runtimes" }),
  ).toBeDisabled();
  await page.reload();
  await expect(runtime).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "ลำดับการส่งต่องาน", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("agent modal supports keyboard close and returns focus", async ({
  page,
}) => {
  await page.goto("/?view=console&page=agents");
  const trigger = page.getByRole("button", { name: "รายละเอียด" }).first();
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const box = await page.getByRole("dialog").boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(
    3,
  );
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(
    3,
  );
  await expect(
    page.getByRole("heading", { name: "ASTRA · Agent details" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

for (const theme of ["dark", "light"])
  test(`responsive ${theme}, keyboard tabs and reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?view=console");
    if (theme === "light")
      await page.getByRole("button", { name: "สลับ light/dark theme" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const first = page.getByRole("tab", { name: "ทั้งหมด", exact: true });
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "กำลังรัน", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tab", { name: "กำลังรัน", exact: true }),
    ).toBeFocused();
    await expect
      .poll(() =>
        page
          .locator("img")
          .evaluateAll((images) =>
            images.some(
              (image) =>
                !(image as HTMLImageElement).complete ||
                (image as HTMLImageElement).naturalWidth === 0,
            ),
          ),
      )
      .toBe(false);
    await page.screenshot({
      path: `test-results/astra-${theme}-375.png`,
      fullPage: true,
    });
  });
