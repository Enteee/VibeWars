import { expect, test, type Page } from "@playwright/test";

import { clickTopbarIcon } from "./helpers/overlay.js";

/**
 * Options > Cosmetics (#4177): the figure wearing the shown look stays in
 * view while the slot rows scroll, beside them on a wide window and on top
 * of them on a phone.
 */

/** A short wide window and a phone: the rows outgrow both. */
const VIEWPORTS = [
  { width: 1280, height: 480 },
  { width: 390, height: 844 },
] as const;

async function openCosmetics(page: Page): Promise<void> {
  await clickTopbarIcon(page, ".topbar-options");
  await expect(page.locator(".options-screen")).toBeVisible();
  await page.locator('.options-entry[data-section="cosmetics"]').click();
  await expect(page.locator(".cosmetics-slots")).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test(`the preview stays in view with the rows scrolled to the end, at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    await openCosmetics(page);
    const window = page.locator(".options-window");
    await window.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    // It did scroll: the rows are taller than the window, and the last is in view.
    expect(await window.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator(".cosmetics-slot").last()).toBeInViewport();
    await expect(page.locator(".cosmetics-preview")).toBeInViewport();
    await expect(page.locator(".cosmetics-primary")).toBeVisible();
  });
}
