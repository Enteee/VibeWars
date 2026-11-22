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
