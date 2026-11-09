import { expect, test } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { hostLobby } from "./helpers/peers.js";

/**
 * Hero rank (#2702): what only a browser can tell is that the fame on
 * this device reaches Options, and the player's own join in a lobby.
 */

test("700 fame is rank 5, in Options and beside the name in a lobby", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ total: 700, today: 0, day: 0 }));
  }, `${STORAGE_NAMESPACE}.fame`);
  await page.goto("./");

  await page.locator(".topbar-options").click();
  await expect(page.locator(".player-fame")).toHaveText("Fame 700 · Hero rank 5");

  await page.goto("./");
  await hostLobby(page);
  // A host starts as a spectator; a seat on a team is what gets a row.
  await page.getByRole("button", { name: "Join team 1" }).click();
  const badge = page.locator(".lobby-player .hero-rank").first();
  await expect(badge).toHaveText("★5");
  await expect(badge).toHaveAttribute("title", "Hero rank 5");
});
