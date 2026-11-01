import { expect, test, type Locator, type Page } from "@playwright/test";

import { BUILD_FORMAT_VERSION } from "../apps/web/src/storage/build-transfer.js";
import { TEAM_FORMAT_VERSION } from "../apps/web/src/storage/team-transfer.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import { joinFriend, openRail } from "./helpers/menu.js";
import { openPeers, openToFriends } from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";

/**
 * Team Arena matchmaking (#1766, ADR-0042): a party is one side, runs its
 * own Team Lobby, queues, and meets another queued party. Four pages of
 * one context share the BroadcastChannel board and rooms (#403), and
 * their storage: the Team Build saved on one is every page's.
 */

/** Ranger/Mesmer, Monk/Elementalist, Necromancer/Elementalist, Elementalist/Mesmer. */
const QUAD = STARTER_BUILDS.slice(1, 5);

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

/** A team code of four starter builds, as Share writes one (see team-lobby.spec.ts). */
function quadCode(): string {
  return JSON.stringify({
    format: "vibewars.team",
    formatVersion: TEAM_FORMAT_VERSION,
    name: "Quad",
    members: QUAD.map((build) => ({
      format: "vibewars.character",
      formatVersion: BUILD_FORMAT_VERSION,
      ...build,
      secondaryProfession: build.secondaryProfession ?? null,
    })),
  });
}

/**
 * Click on `page` brought to the front: four pages share one window, and
 * a page behind the others gets no animation frames, so no click on it
 * is ever stable.
 */
async function press(page: Page, target: Locator): Promise<void> {
  await page.bringToFront();
  await target.click();
}

/** `host` hosts Team Arena as `hostName`, and `guest` joins it as `guestName`. */
async function formParty(
  [host, guest]: readonly [Page, Page],
  [hostName, guestName]: readonly [string, string],
): Promise<string> {
  await host.goto("./");
  await namePlayer(host, hostName);
  await openRail(host, "Team Arena");
  const code = host.locator("#topbar .topbar-lobby-code");
  await expect(code).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await openToFriends(host);
  const key = (await code.textContent())?.trim() ?? "";
  await guest.goto("./");
  await namePlayer(guest, guestName);
  await joinFriend(guest, key);
  // One side only: no second team, no bots to add, no Start.
  await expect(guest.locator(".lobby-panel")).toContainText(hostName);
  await expect(host.getByRole("button", { name: "start match" })).toHaveCount(0);
  await expect(guest.locator(".lobby-panel")).toContainText("The host starts matchmaking");
  return key;
}

/** The party's Team Lobby, both ready to end each stage; the host takes seat 0, the guest seat 1. */
async function runTeamLobby(
  [host, guest]: readonly [Page, Page],
  vote?: (guest: Page) => Promise<void>,
): Promise<void> {
  await press(host, host.getByRole("button", { name: "Find a match" }));
  for (const page of [host, guest]) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
  }
  await vote?.(guest);
  for (const page of [host, guest]) {
    await press(page, page.getByRole("button", { name: "Ready", exact: true }));
  }
  for (const page of [host, guest]) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character");
    // Team Arena's side is four.
    await expect(page.locator(".team-lobby-seat")).toHaveCount(4);
  }
  await press(host, host.locator(".team-lobby-seat").nth(0));
  await expect(guest.locator(".team-lobby-seat").nth(0)).toBeDisabled();
  await press(guest, guest.locator(".team-lobby-seat").nth(1));
  await expect(host.locator(".team-lobby-seat").nth(1)).toBeDisabled();
  for (const page of [host, guest]) {
    await press(page, page.getByRole("button", { name: "Ready", exact: true }));
  }
}

/** `page` plays `build`: its skill bar's first skill is the build's. */
async function expectPlays(
  page: Page,
  build: (typeof STARTER_BUILDS)[number] | undefined,
): Promise<void> {
  await expect(page.locator(".hud-skills .hud-skill").first()).toHaveAttribute(
    "data-skill-id",
    build?.skillBar[0] ?? "",
  );
}

test("#1766: two parties of two queue for Team Arena, meet, and play their own builds with two bots each", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { context, pages } = await openPeers(browser, 4);
  const [ann, bea, cid, dot] = pages as [Page, Page, Page, Page];

  try {
    // Save the Quad on Team Builder; Ann's party proposes it.
    await ann.goto("./");
    await openRail(ann, "Team Builder");
    await expect(ann.getByRole("button", { name: "New team build", exact: true })).toBeVisible();
    await paste(ann.locator(".screen"), quadCode());
    await ann.getByRole("button", { name: "Save", exact: true }).click();
    await expect(ann.locator(".toast")).toHaveText("Saved");

    const annKey = await formParty([ann, bea], ["Ann", "Bea"]);
    await runTeamLobby([ann, bea], async () => {
      await press(ann, ann.getByRole("button", { name: "Propose Quad", exact: true }));
      const card = bea.getByRole("button", { name: "Ann's team build" });
      await press(bea, card);
      await expect(card).toHaveAttribute("aria-pressed", "true");
    });
    for (const page of [ann, bea]) {
      await expect(page.locator(".party-queued")).toContainText("Looking for a team…");
    }
    await expect(ann.getByRole("button", { name: "Leave the queue" })).toBeVisible();

    // The other party plays the house team: nobody proposes.
    await formParty([cid, dot], ["Cid", "Dot"]);
    await runTeamLobby([cid, dot]);

    await expectPlays(ann, QUAD[0]);
    await expectPlays(bea, QUAD[1]);
    await expectPlays(cid, STARTER_BUILDS[0]);
    await expectPlays(dot, STARTER_BUILDS[1]);
    // Four a side: the party's two and two bots.
    await expect(ann.locator(".party-row-bot:visible")).toHaveCount(2);
    await expect(ann.locator(".party-row-name")).toContainText(["Bea"]);

    // Out of the match, Bea is back in Ann's lobby, out of the queue.
    await press(bea, bea.locator(".hud-leave").getByRole("button", { name: "leave match" }));
    await press(bea, bea.locator(".hud-leave").getByRole("button", { name: "yes" }));
    await expect(bea.locator("#topbar .topbar-lobby-code")).toHaveText(annKey);
    await expect(bea.locator(".lobby-panel")).toContainText("Ann");
    await expect(bea.locator(".party-queued")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
