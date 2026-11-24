import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The match's corner control that shows once `page` is in a match: the
 * ☰ that holds the match's buttons (#3923). Specs wait on it rather than
 * on a named button, so a change to the corner changes this helper, not
 * every spec.
 */
export function hudCorner(page: Page): Locator {
  return page.locator(".hud-menu-toggle");
}

/**
 * A match's buttons are rows in ☰'s list (#3923). Open the list, unless
 * it is open, and hand back the row `selector` names in it: `.hud-leave`,
 * `.hud-mute`, `.hud-help`, `.hud-options`, `.hud-fullscreen` or
 * `.hud-music`.
 */
export async function hudMenuRow(page: Page, selector: string): Promise<Locator> {
  const toggle = hudCorner(page);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return page.locator(`.hud-menu ${selector}`);
}
