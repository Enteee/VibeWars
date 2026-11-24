import type { Locator, Page } from "@playwright/test";

/** The match's buttons, each a control in the HUD's corner. */
export type HudRow = "leave" | "mute" | "help" | "options" | "fullscreen" | "music";

/**
 * The match's corner control that shows once `page` is in a match: the
 * leave button. Specs wait on it rather than on a named button, so a
 * change to the corner changes this helper, not every spec (#3923).
 */
export function hudCorner(page: Page): Locator {
  return page.locator(".hud-leave");
}

/**
 * The match's button `row`, ready to press. #3923 folds the buttons into
 * one ☰ and makes this open it first.
 */
export function hudMenuRow(page: Page, row: HudRow): Promise<Locator> {
  return Promise.resolve(page.locator(`.hud-${row}`));
}
