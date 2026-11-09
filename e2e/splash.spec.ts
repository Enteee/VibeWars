import { expect, test } from "@playwright/test";

test.describe("the splash screen (#2884)", () => {
  test("a key brings the name, a further key the menu, and the fight is gone", async ({ page }) => {
    await page.goto("./?splash");
    const splash = page.locator(".splash");
    await expect(splash.locator(".splash-hint")).toBeVisible();
    await expect(splash.locator(".splash-wordmark")).toBeHidden();

    await page.keyboard.press("Space");
    await expect(splash.locator(".splash-hint")).toBeHidden();
    // Input before the prompt does not skip it.
    await page.keyboard.press("Space");
    await expect(splash.locator(".splash-prompt")).toBeVisible({ timeout: 10_000 });
    await expect(splash.locator(".splash-wordmark")).toBeVisible();

    await page.keyboard.press("Space");
    await expect(splash).toHaveCount(0);
    // The menu draws its character figures on canvases of their own.
    await expect(page.locator("canvas:not(.character-figure)")).toHaveCount(0);
  });

  test("the tab's second visit, without ?splash, goes straight to the menu", async ({ page }) => {
    await page.goto("./?splash");
    await expect(page.locator(".splash")).toBeVisible();
    await page.goto("./");
    await expect(page.locator(".splash")).toHaveCount(0);
  });
});
