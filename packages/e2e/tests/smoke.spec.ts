import { expect, test } from "@playwright/test";

test("connect, see yourself, move, chat", async ({ page }) => {
  await page.goto("/");
  await page.fill("#handle", "E2EHero");
  await page.click("button[type=submit]");

  // @ appears on the glyph grid
  await expect(page.locator("#grid")).toContainText("@", { timeout: 10_000 });

  // Arrow key moves @ one tile right
  const before = await page.locator("#grid").textContent();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => page.locator("#grid").textContent()).not.toBe(before);

  // Chat round-trips through the log
  await page.keyboard.press("Enter");
  await page.fill("#chat-field", "hello from e2e");
  await page.keyboard.press("Enter");
  await expect(page.locator("#log")).toContainText("<E2EHero> hello from e2e");
});
