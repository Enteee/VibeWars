import { expect, type Locator, type Page } from "@playwright/test";

/** The match's buttons, each a row in ☰'s list. */
export type HudRow = "leave" | "mute" | "help" | "options" | "fullscreen" | "music";

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
 * The match's button `row`, ready to press: open ☰'s list, unless it is
 * open, and hand back the row in it (#3923).
 */
export async function hudMenuRow(page: Page, row: HudRow): Promise<Locator> {
  const toggle = hudCorner(page);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return page.locator(`.hud-menu .hud-${row}`);
}
