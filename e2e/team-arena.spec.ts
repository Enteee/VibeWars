import { expect, test, type Locator, type Page } from "@playwright/test";

import { BUILD_FORMAT_VERSION } from "../apps/web/src/storage/build-transfer.js";
import { TEAM_FORMAT_VERSION } from "../apps/web/src/storage/team-transfer.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import { STARTER_TEAMS } from "../packages/game-core/src/starter-teams.js";
import { joinFriend, lobbyWindow, openRail, shutLobbyWindow } from "./helpers/menu.js";
import {
  copyInvite,
  expectTeamSize,
  openPeers,
  openToFriends,
  proposeTeam,
  setTeamSize,
} from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";

/**
 * Team Arena matchmaking (#1766, ADR-0042): a party is one side, runs its
 * own Team Lobby, queues, and meets another queued party. Four pages of
 * one context share the BroadcastChannel board and rooms (#403), and
 * their storage: the Team Build saved on one is every page's.
 */

/** The second to fifth starter builds (#2554), each with a skill in its first slot. */
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
    size: 4,
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
): Promise<void> {
  await host.goto("./");
  await namePlayer(host, hostName);
  await openRail(host, "Team Arena");
  await openToFriends(host);
  const invite = await copyInvite(host);
  await guest.goto("./");
  await namePlayer(guest, guestName);
  await joinFriend(guest, invite);
  // One side only: no second team, no bots to add, no Start.
  await expect(guest.locator(".lobby-panel")).toContainText(hostName);
  await expect(host.getByRole("button", { name: "start match" })).toHaveCount(0);
  await expect(guest.locator(".lobby-panel")).toContainText("The host starts matchmaking");
}

/**
 * The party's Team Lobby, both ready to end each stage; the host takes
 * seat 0, the guest seat 1, of the side's `seats`.
 */
async function runTeamLobby(
  [host, guest]: readonly [Page, Page],
  vote?: (guest: Page) => Promise<void>,
  seats = 4,
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
    // Team Arena's side is four, unless its leader picked another size.
    await expect(page.locator(".team-lobby-seat")).toHaveCount(seats);
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
/** The first skill on `page`'s bar, once the HUD shows one. */
async function firstSkill(page: Page): Promise<string | null> {
  const skill = page.locator(".hud-skills .hud-skill").first();
  await expect(skill).toHaveAttribute("data-skill-id", /./);
  return skill.getAttribute("data-skill-id");
}

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
  // Each page's console, said when the match fails to show (#2777).
  const consoles: string[] = [];
  for (const [who, page] of [
    ["Ann", ann],
    ["Bea", bea],
    ["Cid", cid],
    ["Dot", dot],
  ] as const) {
    page.on("console", (message) => {
      consoles.push(`${String(Date.now())} ${who} ${message.type()}: ${message.text()}`);
    });
  }

  try {
    // Save the Quad on Team Builder; Ann's party proposes it.
    await ann.goto("./");
    await openRail(ann, "Team Builder");
    await expect(ann.getByRole("button", { name: "New team build", exact: true })).toBeVisible();
    await paste(ann.locator(".screen"), quadCode());
    await ann.getByRole("button", { name: "Save", exact: true }).click();
    await expect(ann.locator(".toast")).toHaveText("Saved");

    await formParty([ann, bea], ["Ann", "Bea"]);
    await runTeamLobby([ann, bea], async () => {
      await ann.bringToFront();
      await proposeTeam(ann, "Quad");
      const card = bea.getByRole("button", { name: "Ann's team build" });
      await press(bea, card);
      await expect(card).toHaveAttribute("aria-pressed", "true");
    });
    // The queue is the top bar's icon's (#2743).
    for (const page of [ann, bea]) {
      await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
    }
    await bea.locator("#topbar .topbar-queue").click();
    const flyout = bea.locator("#topbar .queue-window");
    await expect(flyout).toContainText("Team Arena 4v4");
    await expect(flyout).toContainText("Only the host can leave the queue.");
    await bea.keyboard.press("Escape");
    await expect(ann.getByRole("button", { name: "Leave the queue" })).toBeVisible();

    // The other party plays a random 4v4 preset team: nobody proposes (#2148).
    await formParty([cid, dot], ["Cid", "Dot"]);
    await runTeamLobby([cid, dot]);

    // Met, the queued lobby counts down five seconds before the match
    // starts (QUEUED_COUNTDOWN_SECONDS), then four pages boot an arena
    // each: on a busy runner that is past expect's 15 s (#2777).
    for (const page of [ann, bea, cid, dot]) {
      await expect(page.locator(".hud-skills .hud-skill").first()).toBeAttached({
        timeout: 25_000,
      });
    }
    await expectPlays(ann, QUAD[0]);
    await expectPlays(bea, QUAD[1]);
    expect(
      STARTER_TEAMS.filter((preset) => preset.members.length === 4).map((preset) =>
        preset.members.slice(0, 2).map(({ build }) => build.skillBar[0]),
      ),
    ).toContainEqual([await firstSkill(cid), await firstSkill(dot)]);
    // Four a side: the party's two and two bots.
    await expect(ann.locator(".party-row-bot:visible")).toHaveCount(2);
    await expect(ann.locator(".party-row-name")).toContainText(["Bea"]);

    // Out of the match, Bea is back in Ann's lobby, out of the queue.
    await press(bea, bea.locator(".hud-leave").getByRole("button", { name: "leave match" }));
    await press(bea, bea.locator(".hud-leave").getByRole("button", { name: "yes" }));
    await expect((await lobbyWindow(bea)).locator(".topbar-leave")).toBeVisible();
    await shutLobbyWindow(bea);
    await expect(bea.locator(".lobby-panel")).toContainText("Ann");
    await expect(bea.locator("#topbar .topbar-queue")).toBeHidden();
  } catch (error) {
    await test.info().attach("consoles", { body: consoles.join("\n"), contentType: "text/plain" });
    console.log(consoles.join("\n"));
    throw error;
  } finally {
    await context.close();
  }
});

test("#2107: a Team Arena leader picks 2v2, and the party queues for Team Arena 2v2", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { context, pages } = await openPeers(browser, 2);
  const [ann, bea] = pages as [Page, Page];

  try {
    await formParty([ann, bea], ["Ann", "Bea"]);
    // The leader's size is the party's; a member's is locked to it.
    await ann.bringToFront();
    await setTeamSize(ann, 2);
    await expectTeamSize(bea, 2, { locked: true });
    await runTeamLobby([ann, bea], undefined, 2);
    await ann.locator("#topbar .topbar-queue").click();
    await expect(ann.locator("#topbar .queue-window")).toContainText("Team Arena 2v2");
    await expect(
      ann.locator("#topbar .queue-window").getByRole("button", { name: "Leave Queue" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
