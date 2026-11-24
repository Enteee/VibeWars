import { expect, test, type Locator, type Page } from "@playwright/test";

import { BUILD_FORMAT_VERSION } from "../apps/web/src/storage/build-transfer.js";
import { TEAM_FORMAT_VERSION } from "../apps/web/src/storage/team-transfer.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import { joinFriend, lobbyWindow, openRail, shutLobbyWindow } from "./helpers/menu.js";
import {
  copyInvite,
  expectTeamSize,
  openPeers,
  openToFriends,
  proposeTeam,
  setTeamSize,
} from "./helpers/peers.js";
import { namePlayer, ownPlayerKey } from "./helpers/player.js";

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

/** `leader` proposes the saved Quad, and both vote for it, which readies them (#2872). */
async function voteQuad(leader: Page, member: Page): Promise<void> {
  await leader.bringToFront();
  await proposeTeam(leader, "Quad");
  const card = leader.locator(".team-lobby-proposals .play-card-open").first();
  await press(leader, card);
  await expect(card).toHaveAttribute("aria-pressed", "true");
  // The last vote ends the stage, so its card is gone at once.
  await press(member, member.locator(".team-lobby-proposals .play-card-open").first());
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
  // Both votes end the stage; without them its 30 s run out.
  for (const page of [host, guest]) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character", {
      timeout: 40_000,
    });
    // Team Arena's side is four, unless its leader picked another size.
    await expect(page.locator(".team-lobby-seat")).toHaveCount(seats);
  }
  await press(host, host.locator(".team-lobby-seat").nth(0));
  await expect(guest.locator(".team-lobby-seat").nth(0)).toBeDisabled();
  // The last seat taken ends the stage.
  await press(guest, guest.locator(".team-lobby-seat").nth(1));
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
    await runTeamLobby([ann, bea], () => voteQuad(ann, bea));
    // The queue is the top bar's icon's (#2743).
    for (const page of [ann, bea]) {
      await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
    }
    await bea.locator("#topbar .topbar-queue").click();
    const flyout = bea.locator("#topbar .queue-window");
    await expect(flyout).toContainText("Team Arena 4v4");
    await expect(flyout).toContainText("Only the host can leave the queue.");
    await bea.keyboard.press("Escape");
    await expect(ann.getByRole("button", { name: "Find a match", exact: true })).toHaveCount(0);

    // The other party votes for the Quad too, so no stage runs its clock (#2872).
    await formParty([cid, dot], ["Cid", "Dot"]);
    await runTeamLobby([cid, dot], () => voteQuad(cid, dot));

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
    await expectPlays(cid, QUAD[0]);
    await expectPlays(dot, QUAD[1]);
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

test("#3899: a queued party warms up against bots, and goes to its match once another team queues", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { context, pages } = await openPeers(browser, 4);
  const [ann, bea, cid, dot] = pages as [Page, Page, Page, Page];

  try {
    await formParty([ann, bea], ["Ann", "Bea"]);
    await runTeamLobby([ann, bea]);
    // Every member is told the warmup is coming; only the host may start it now.
    await expect(bea.locator(".lobby-warmup")).toContainText("Warmup match against bots in");
    await ann.locator("#topbar .topbar-queue").click();
    const flyout = ann.locator("#topbar .queue-window");
    await expect(flyout).toContainText("Warmup match against bots in");
    await flyout.getByRole("button", { name: "Start warmup now" }).click();

    // A warmup: the party's own match against bots, still in the queue.
    for (const page of [ann, bea]) {
      await expect(page.locator(".hud-warmup")).toContainText(
        "Warmup — still in the queue for Team Arena 4v4",
        { timeout: 25_000 },
      );
    }

    // A minute of warmups: the ticket's heartbeat runs on under a match,
    // well past its 15 s expiry, or the other party never meets this one.
    await ann.waitForTimeout(60_000);

    // Another party queues: the warmup ends at once, and all four meet.
    await formParty([cid, dot], ["Cid", "Dot"]);
    await runTeamLobby([cid, dot]);
    for (const page of [ann, bea]) {
      await expect(page.locator(".hud-warmup")).toHaveCount(0, { timeout: 60_000 });
    }
    for (const page of [ann, bea, cid, dot]) {
      await expect(page.locator(".hud-skills .hud-skill").first()).toBeAttached({
        timeout: 40_000,
      });
    }
  } finally {
    await context.close();
  }
});

test("#3899: over a warmup, the queue's flyout leaves the queue, and the party is back in its lobby, fine", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { context, pages } = await openPeers(browser, 2);
  const [ann, bea] = pages as [Page, Page];

  try {
    await formParty([ann, bea], ["Ann", "Bea"]);
    await runTeamLobby([ann, bea]);
    await ann.locator("#topbar .topbar-queue").click();
    await ann
      .locator("#topbar .queue-window")
      .getByRole("button", { name: "Start warmup now" })
      .click();
    const line = ann.locator(".hud-warmup .topbar-queue");
    await expect(line).toContainText("Warmup — still in the queue", { timeout: 25_000 });

    // The top bar is hidden in a match (#454): the warmup's line opens the flyout.
    await line.click();
    await ann
      .locator(".hud-warmup .queue-window")
      .getByRole("button", { name: "Leave Queue" })
      .click();
    for (const page of [ann, bea]) {
      await expect(page.locator(".hud-warmup")).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator("#topbar .topbar-queue")).toBeHidden();
      // The warmup was closed, not lost: nobody is told the host left.
      await expect(page.locator("#topbar .topbar-status")).not.toHaveAttribute(
        "data-state",
        "error",
      );
    }
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

/**
 * Make `page`'s ticket keys from `seed`, as random-arena.spec.ts does:
 * the tickets' ids decide the group's map and its host. Seeds 1 and 2
 * meet on an Annihilation map that Ann's party hosts, so Cid's leaving
 * beats it; a change to formation fails the win, loudly.
 */
async function seedTicketKeys(page: Page, seed: number): Promise<void> {
  // Source text, as the e2e tsconfig has no DOM lib (see builds.spec.ts).
  await page.addInitScript(`
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (array) => {
      if (!(array instanceof Uint8Array) || array.length !== 48) return random(array);
      for (let i = 0; i < 48; i += 1) array[i] = (${String(seed)} * 97 + i * 13) & 0xff;
      return array;
    };
  `);
}

/** The first skill on `page`'s bar, once its match is up. */
async function firstSkill(page: Page): Promise<string | null> {
  const skill = page.locator(".hud-skills .hud-skill").first();
  // Met, the countdown and four arenas booting outlast expect's 15 s (#2777).
  await expect(skill).toBeAttached({ timeout: 25_000 });
  return skill.getAttribute("data-skill-id");
}

test("#3815: a Team Arena party that wins queues again with the same team, with no Team Lobby", async ({
  browser,
}) => {
  // Three Team Lobby clocks of 30 s, the result's 20 s and two ranked starts.
  test.setTimeout(300_000);
  const { context, pages } = await openPeers(browser, 4);
  const [ann, bea, cid, dot] = pages as [Page, Page, Page, Page];
  // Two humans a side is ranked: each needs a key of its own.
  for (const page of pages) {
    await ownPlayerKey(page);
  }
  await seedTicketKeys(ann, 1);
  await seedTicketKeys(cid, 2);

  try {
    for (const [party, names] of [
      [
        [ann, bea],
        ["Ann", "Bea"],
      ],
      [
        [cid, dot],
        ["Cid", "Dot"],
      ],
    ] as const) {
      await formParty(party, names);
      await party[0].bringToFront();
      await setTeamSize(party[0], 2);
      await runTeamLobby(party, undefined, 2);
    }
    const builds = [await firstSkill(ann), await firstSkill(bea)];

    // Cid's side leaves: on an Annihilation map, a side with nobody left is beaten.
    for (const page of [cid, dot]) {
      const leave = page.locator(".hud-leave");
      await press(page, leave.getByRole("button", { name: "leave match" }));
      await press(page, leave.getByRole("button", { name: "yes" }));
    }
    for (const page of [ann, bea]) {
      await expect(page.locator(".hud-end-line")).toContainText(
        /You won: next match with the same team in \d+ s/,
      );
    }

    // Cid's party picks its team again; Ann's queues on its own, past
    // the result's 20 s, with no Team Lobby, and meets it.
    await press(cid, cid.getByRole("button", { name: "Find a match" }));
    for (const page of [cid, dot]) {
      await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
    }
    for (const page of [ann, bea]) {
      await expect(page.locator("#topbar .topbar-queue")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".team-lobby-stage")).toHaveCount(0);
    }
    await expect(cid.locator(".team-lobby-stage")).toHaveText("Take a character", {
      timeout: 40_000,
    });
    await press(cid, cid.locator(".team-lobby-seat").nth(0));
    await press(dot, dot.locator(".team-lobby-seat").nth(1));

    // Met again (Cid only ever plays this one), each of Ann's party plays
    // the build and seat it played before.
    await firstSkill(cid);
    expect([await firstSkill(ann), await firstSkill(bea)]).toEqual(builds);
    await expect(ann.locator(".party-row-name")).toContainText(["Bea"]);
  } finally {
    await context.close();
  }
});
