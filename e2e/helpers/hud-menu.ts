import type { Locator, Page } from "@playwright/test";

/**
 * The match's corner control that shows once `page` is in a match: the
 * leave button. Specs wait on it rather than on a named button, so a
 * change to the corner changes this helper, not every spec (#3923).
 */
export function hudCorner(page: Page): Locator {
  return page.locator(".hud-leave");
}

/**
 * The match's button `selector` names: `.hud-leave`, `.hud-mute`,
 * `.hud-help`, `.hud-options`, `.hud-fullscreen` or `.hud-music`, made
 * ready to press.
 */
export function hudMenuRow(page: Page, selector: string): Promise<Locator> {
  return Promise.resolve(page.locator(selector));
}
