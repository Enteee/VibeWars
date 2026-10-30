import { expect, test } from "@playwright/test";

/**
 * A phone is told up front that VibeWars needs a keyboard and mouse
 * (#1392): over the menu, gone only by Continue anyway, and not again on
 * that device. A desktop never sees it, however narrow its window.
 */

test.describe("on a touch-only phone", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test("holds the menu back until Continue anyway, once, keeping the link's fragment", async ({
    page,
  }) => {
    await page.goto("./#team=kept");
    const notice = page.locator(".touch-notice");
    await expect(notice).toContainText("VibeWars needs a keyboard and mouse.");
    await expect(notice).toContainText("Open it on a computer:");
    await expect(page.locator(".mode-rail")).toHaveCount(0);

    // Neither Esc nor a tap beside it lets the player past.
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 700);
    await expect(notice).toBeVisible();

    await page.locator(".touch-notice-continue").click();
    await expect(notice).toHaveCount(0);
    await expect(page.locator(".mode-rail")).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe("#team=kept");

    await page.reload();
    await expect(page.locator(".mode-rail")).toBeVisible();
    await expect(page.locator(".touch-notice")).toHaveCount(0);
  });
});

test("never shows on a narrow desktop window", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("./");
  await expect(page.locator(".mode-rail")).toBeVisible();
  await expect(page.locator(".touch-notice")).toHaveCount(0);
});
