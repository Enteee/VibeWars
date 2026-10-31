import { expect, test, type Locator, type Page } from "@playwright/test";

import { BUILD_FORMAT_VERSION } from "../apps/web/src/storage/build-transfer.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import { joinFriend, openRail } from "./helpers/menu.js";
import { hostLobby, openPeers } from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";

/**
 * The Team Lobby screen (#1460): a lobby hosted from Hosted Game (#1525)
 * votes on Team Builds, then takes the chosen one's characters as seats.
 * The two pages share one context (#403), so their storage too: the Team
 * Build saved and picked on one is the other's as well.
 */

/** Warrior/Monk, Ranger/Mesmer and Monk/Elementalist: the Trio's seats, in order. */
const TRIO = STARTER_BUILDS.slice(0, 3);

/** Paste `text` onto `target`, as Ctrl+V would. */
async function paste(target: Locator, text: string): Promise<void> {
  await target.evaluate((element, pasted) => {
    const data = new DataTransfer();
    data.setData("text/plain", pasted);
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

/**
 * A team code of three starter builds, as Share writes one. Its version
 * is spelled out: `team-transfer.ts` pulls in the UI, which e2e cannot
 * type, and a stale one fails the paste out loud.
 */
function trioCode(): string {
  return JSON.stringify({
    format: "vibewars.team",
    formatVersion: 1,
    name: "Trio",
    members: TRIO.map((build) => ({
      format: "vibewars.character",
      formatVersion: BUILD_FORMAT_VERSION,
      ...build,
      secondaryProfession: build.secondaryProfession ?? null,
    })),
  });
}

/** On the menu, play as `name`: the name is read when the lobby is entered. */
async function nameOnMenu(page: Page, name: string): Promise<void> {
  await page.goto("./");
  await namePlayer(page, name);
}

test("#1460: two players and a bot propose, vote, take seats and play the claimed characters", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    // Save the Trio on Team Builder; it is proposed in the Team Lobby (#1515).
    await nameOnMenu(host, "Host");
    await openRail(host, "Team Builder");
    await expect(host.getByRole("button", { name: "New team build", exact: true })).toBeVisible();
    await paste(host.locator(".screen"), trioCode());
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await expect(host.locator(".toast")).toHaveText("Saved");
    await host.getByRole("button", { name: "back" }).click();

    const code = await hostLobby(host);

    await nameOnMenu(guest, "Guest");
    await joinFriend(guest, code);
    await expect(guest.locator(".lobby-panel")).toBeVisible();

    // One side of two players and a bot.
    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 1" }).click();
    await host.getByRole("button", { name: "One bot more on team 1" }).click();
    await expect(host.locator(".lobby-panel")).toContainText("Guest");
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await host.getByRole("button", { name: "start match" }).click();

    // Vote: entering proposes nothing; both propose the Trio there, and
    // the guest votes for the host's.
    for (const page of [host, guest]) {
      await expect(page.locator(".screen-team-lobby")).toBeVisible();
      await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
    }
    await expect(host.locator(".team-lobby-card.is-empty")).toBeVisible();
    await expect(host.locator(".team-lobby-propose select option:checked")).toHaveText("None");
    for (const page of [host, guest]) {
      await page.locator(".team-lobby-propose select").selectOption({ label: "Trio" });
    }
    for (const page of [host, guest]) {
      await expect(page.locator(".team-lobby-card")).toHaveCount(2);
    }
    const hostsCard = guest.getByRole("button", { name: "Host's team build" });
    await hostsCard.click();
    await expect(hostsCard).toHaveAttribute("aria-pressed", "true");
    await expect(
      host.getByRole("button", { name: "Host's team build" }).locator(".team-lobby-token"),
    ).toHaveText(["G"]);

    // Everyone ready ends the vote early.
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    for (const page of [host, guest]) {
      await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character");
      await expect(page.locator(".screen-team-lobby")).toContainText("Most votes");
      await expect(page.locator(".team-lobby-seat")).toHaveCount(3);
    }

    // Seats: the host the Warrior, the guest the Ranger; the bot gets the Monk.
    await host.locator(".team-lobby-seat").nth(0).click();
    await expect(guest.locator(".team-lobby-seat").nth(0)).toBeDisabled();
    await guest.locator(".team-lobby-seat").nth(1).click();
    await expect(host.locator(".team-lobby-seat").nth(1)).toContainText("Guest");
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();

    await expect(host.locator(".hud-skills .hud-skill").first()).toHaveAttribute(
      "data-skill-id",
      TRIO[0]?.skillBar[0] ?? "",
    );
    await expect(guest.locator(".hud-skills .hud-skill").first()).toHaveAttribute(
      "data-skill-id",
      TRIO[1]?.skillBar[0] ?? "",
    );
  } finally {
    await context.close();
  }
});
