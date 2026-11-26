import { expect, type Page } from "@playwright/test";

import { clickTopbarIcon } from "./overlay.js";

/**
 * Play as `name` (#1513): typed into the Player section of Options, which
 * opens on it, as a player would, then Options closed again. The menu's
 * screens and their lobbies read it from there.
 */
export async function namePlayer(page: Page, name: string): Promise<void> {
  await clickTopbarIcon(page, ".topbar-options");
  await page
    .locator(".player-section")
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(name);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".options-screen")).toHaveCount(0);
}

/**
 * Give `page` a player key of its own (#3680): pages of one context
 * share localStorage, and so one key, which a ranked match cannot seat
 * twice. The key and its receipt chain live in the tab's sessionStorage.
 */
export async function ownPlayerKey(page: Page): Promise<void> {
  // Source text, as the e2e tsconfig has no DOM lib (see builds.spec.ts).
  await page.addInitScript(`
    const own = (key) => key.endsWith(".playerKey") || key.endsWith(".rankedPrev");
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      return this === localStorage && own(key) ? get.call(sessionStorage, key) : get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      return this === localStorage && own(key)
        ? set.call(sessionStorage, key, value)
        : set.call(this, key, value);
    };
  `);
}
