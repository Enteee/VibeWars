import { expect, test, type Page } from "@playwright/test";
import { joinFriend } from "./helpers/menu.js";
import { hostLobby, openPeers, playOwnTeams, saveSoloTeam } from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";

/**
 * A hosted 4v4 Capture Points on Scarred Earth, bots filling the seats,
 * runs to its summary on both pages (#2735). It ends by annihilation or
 * at time, whichever comes first; until then the clock keeps moving.
 */

/** The match's time limit, with room to spare for a loaded runner. */
const MATCH_MS = 9 * 60_000;

const scoreboard = (page: Page) => page.locator(".hud-scoreboard").first();

test("a hosted 4v4 on Scarred Earth runs to the summary on both pages (#2735)", async ({
  browser,
}) => {
  test.setTimeout(MATCH_MS + 120_000);
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    await host.goto("./");
    await namePlayer(host, "Host");
    const team = await saveSoloTeam(host, 4);
    await host.goto("./");
    await expect(host.getByRole("heading", { name: "VibeWars" })).toBeVisible();
    const invite = await hostLobby(host, { size: 4, map: "scarred-earth" });
    await guest.goto("./");
    await namePlayer(guest, "Guest");
    await joinFriend(guest, invite);
    await expect(guest.locator(".lobby-panel")).toBeVisible();
    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await host.getByRole("button", { name: "start match" }).click();
    await playOwnTeams([
      { page: host, team },
      { page: guest, team, seat: 0 },
    ]);

    // The clock runs on both pages.
    for (const page of [host, guest]) {
      const shown = await scoreboard(page).textContent();
      await expect(scoreboard(page)).not.toHaveText(shown ?? "", { timeout: 10_000 });
    }

    // Each player goes for the nearest foe, so the fight comes to them.
    // The summary shows for TEAM_RESULT_SECONDS only, so it is watched for
    // continuously while the players fight on the side.
    const over = new AbortController();
    const fighting = (async () => {
      while (!over.signal.aborted) {
        for (const page of [host, guest]) {
          await page.bringToFront();
          await page.keyboard.press("Tab");
          await page.keyboard.press("Space");
        }
        await host.waitForTimeout(15_000);
      }
    })();
    try {
      await Promise.all(
        [host, guest].map((page) =>
          expect(page.locator(".hud-summary")).toBeVisible({ timeout: MATCH_MS }),
        ),
      );
    } finally {
      over.abort();
      await fighting;
    }
  } finally {
    await context.close();
  }
});
