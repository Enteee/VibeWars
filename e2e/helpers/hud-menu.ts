import { expect, type Locator, type Page } from "@playwright/test";

/**
 * A match's buttons are rows in ☰'s list (#3923). Open the list, unless
 * it is open, and hand back the row `selector` names in it: `.hud-leave`,
 * `.hud-mute`, `.hud-help`, `.hud-options`, `.hud-fullscreen` or
 * `.hud-music`.
 */
export async function hudMenuRow(page: Page, selector: string): Promise<Locator> {
  const toggle = page.locator(".hud-menu-toggle");
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return page.locator(`.hud-menu ${selector}`);
}
