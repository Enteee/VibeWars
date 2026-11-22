import { expect, test, type Page } from "@playwright/test";

import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../packages/game-core/src/ruleset.js";
import { joinFriend } from "./helpers/menu.js";
import { enterOwnTeams, hostLobby, openPeers, waitForMatchStart } from "./helpers/peers.js";
import { key } from "./keys.js";

/** Where `page`'s view, which follows its hero, stands: `data-camera`. */
async function camera(page: Page): Promise<{ x: number; y: number }> {
  const stage = page.locator("#viewport");
  await expect(stage).toHaveAttribute("data-camera", /^-?\d+,-?\d+$/);
  const [x = 0, y = 0] = ((await stage.getAttribute("data-camera")) ?? "").split(",").map(Number);
  return { x, y };
}

/** How far `page`'s view stands from `from`, in world units. */
async function movedFrom(page: Page, from: { x: number; y: number }): Promise<number> {
  const at = await camera(page);
  return Math.hypot(at.x - from.x, at.y - from.y);
}

/**
 * Up from team 1's first spawn on Ember Pits, the map every lobby here
 * plays, is open ground onto the middle lane.
 */
async function holdUp(page: Page, ms: number): Promise<void> {
  await page.keyboard.down(key("move-up"));
  await page.waitForTimeout(ms);
  await page.keyboard.up(key("move-up"));
}

test("#3818: both in, the match counts 10 s down with everyone held in the spawn, then starts", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  try {
    const code = await hostLobby(host);
    await guest.goto("./");
    await joinFriend(guest, code);
    await guest.getByRole("button", { name: "join team 2" }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await host.getByRole("button", { name: "join team 1" }).click();
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await host.getByRole("button", { name: "start match" }).click();
    await enterOwnTeams([{ page: host }, { page: guest }]);
    await host.bringToFront();

    // Held: the centre line says when it starts, the bar is greyed.
    const line = host.locator(".hud-pre-match");
    await expect(line).toHaveText(/^(Waiting for players: \d\/2|Match starts in \d+)/);
    await expect(line).toHaveText(/^Match starts in \d+$/);
    await expect(host.locator(".hud-skills")).toHaveClass(/\bis-held\b/);

    // A held key moves nobody: the view stays on the spawn.
    const spawn = await camera(host);
    await holdUp(host, 2_000);
    expect(await movedFrom(host, spawn)).toBeLessThan(20);
    await expect(line).toBeVisible();

    // Started: the line goes, the bar wakes, and the same key walks.
    await waitForMatchStart([host, guest]);
    await expect(host.locator(".hud-skills")).not.toHaveClass(/\bis-held\b/);
    const speed = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
    await holdUp(host, 1_000);
    await expect
      .poll(() => movedFrom(host, spawn), { message: "the host should walk off the spawn" })
      .toBeGreaterThan(speed / 2);
  } finally {
    await context.close();
  }
});
