import { expect, test, type Locator, type Page } from "@playwright/test";

import { BUILD_FORMAT_VERSION } from "../apps/web/src/storage/build-transfer.js";
import { TEAM_FORMAT_VERSION } from "../apps/web/src/storage/team-transfer.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import { TICKET_TTL_MS } from "../packages/game-protocol/src/queue.js";
import { hudMenuRow } from "./helpers/hud-menu.js";
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

/** A team code of `members`, as Share writes one (see team-lobby.spec.ts). */
function teamCode(name: string, members: readonly (typeof STARTER_BUILDS)[number][]): string {
  return JSON.stringify({
    format: "vibewars.team",
    formatVersion: TEAM_FORMAT_VERSION,
    name,
    size: members.length,
    members: members.map((build) => ({
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

/**
 * Where a page opens so the bots of any match it hosts stand still
 * (#4146): idle humans would be wiped, and the match over, before a slow
 * runner checks it.
 */
const HOLD_BOTS = "./?bots=hold";

/**
 * `host` hosts Team Arena as `hostName`, and `guest` joins it as
 * `guestName`, both at `url`.
 */
async function formParty(
  [host, guest]: readonly [Page, Page],
  [hostName, guestName]: readonly [string, string],
  url = "./",
): Promise<void> {
  await host.goto(url);
  await namePlayer(host, hostName);
  await openRail(host, "Team Arena");
  await openToFriends(host);
  const invite = await copyInvite(host);
  await guest.goto(url);
  await namePlayer(guest, guestName);
  await joinFriend(guest, invite);
  // One side only: no second team, no bots to add, no Start.
  await expect(guest.locator(".lobby-panel")).toContainText(hostName);
  await expect(host.getByRole("button", { name: "start match" })).toHaveCount(0);
  await expect(guest.locator(".lobby-panel")).toContainText("The host starts matchmaking");
}

/** `leader` proposes the saved `team`, and both vote for it, which readies them (#2872). */
async function voteTeam(leader: Page, member: Page, team: string): Promise<void> {
  await leader.bringToFront();
  await proposeTeam(leader, team);
  const card = leader.locator(".team-lobby-proposals .play-card-open").first();
  // A click can land on the card just as the list redraws, and be lost
  // (#3935); a vote is never taken back, so pressing again is safe.
  await expect(async () => {
    await press(leader, card);
    await expect(card).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
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

/**
 * On every page it loads from now on, `page` keeps the text of every
 * toast it shows, for `toastsOf`, and whether a warmup match (#3899)
 * began on it, for `inRealMatch`: a warmup's line can go before its
 * match does.
 */
async function keepToasts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const kept: { toasts: string[]; warmedUp: boolean } = { toasts: [], warmedUp: false };
    (window as { kept?: typeof kept }).kept = kept;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          if (node.classList.contains("toast")) {
            kept.toasts.push(node.textContent);
          }
          if (node.matches(".hud-warmup") || node.querySelector(".hud-warmup") !== null) {
            kept.warmedUp = true;
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

/** The toasts `page` has shown since `keepToasts`. */
function toastsOf(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (window as { kept?: { toasts: string[] } }).kept?.toasts ?? []);
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
  // Cid's party forming can outlast Ann's 30 s before a warmup (#3899),
  // and the match then waits for that warmup to give way: up to 40 s for
  // the foe's bar and a 60 s toast poll, then four arenas booting at 25 s
  // each and the leave. On a loaded runner that is past 180 s (#3968).
  test.setTimeout(300_000);
  const { context, pages } = await openPeers(browser, 4);
  const [ann, bea, cid, dot] = pages as [Page, Page, Page, Page];
  // Ann's party queues first, so it may warm up (#3899): its pages keep watch.
  for (const page of [ann, bea]) {
    await keepToasts(page);
  }
  // Each page's console, said when the match fails to show (#2777).
  const consoles = keepConsoles({ Ann: ann, Bea: bea, Cid: cid, Dot: dot });

  try {
    // Save the Quad on Team Builder; Ann's party proposes it.
    await ann.goto("./");
    await openRail(ann, "Team Builder");
    await expect(ann.getByRole("button", { name: "New team build", exact: true })).toBeVisible();
    await paste(ann.locator(".screen"), teamCode("Quad", QUAD));
    await ann.getByRole("button", { name: "Save", exact: true }).click();
    await expect(ann.locator(".toast")).toHaveText("Saved");

    await formParty([ann, bea], ["Ann", "Bea"], HOLD_BOTS);
    await runTeamLobby([ann, bea], () => voteTeam(ann, bea, "Quad"));
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
    await formParty([cid, dot], ["Cid", "Dot"], HOLD_BOTS);
    await runTeamLobby([cid, dot], () => voteTeam(cid, dot, "Quad"));
    // Ann's party may have warmed up against bots while Cid's voted
    // (#3899): its warmup HUD plays the same builds, so wait it out.
    await inRealMatch([ann, bea], cid);

    // Met, the queued lobby counts down five seconds before the match
    // starts (QUEUED_COUNTDOWN_SECONDS), then four pages boot an arena
    // each: on a busy runner that is past expect's 15 s (#2777).
    // A page behind the others gets no animation frames, so it never
    // mounts its HUD (#3935): each is brought to the front for its wait.
    for (const page of [ann, bea, cid, dot]) {
      await page.bringToFront();
      await expect(page.locator(".hud-skills .hud-skill").first()).toBeAttached({
        timeout: 25_000,
      });
    }
    await expectPlays(ann, QUAD[0]);
    // Four a side: the party's two and two bots, still marked bots
    // while they hold.
    await ann.bringToFront();
    await expect(ann.locator(".party-row-bot:visible")).toHaveCount(2);
    await expect(ann.locator(".party-row-name")).toContainText(["Bea"]);
    await expectPlays(bea, QUAD[1]);
    await expectPlays(cid, QUAD[0]);
    await expectPlays(dot, QUAD[1]);

    // Out of the match, Bea is back in Ann's lobby, out of the queue.
    await bea.bringToFront();
    const beaLeave = await hudMenuRow(bea, "leave");
    await press(bea, beaLeave.getByRole("button", { name: "leave match" }));
    await press(bea, beaLeave.getByRole("button", { name: "yes" }));
    await expect((await lobbyWindow(bea)).locator(".topbar-leave")).toBeVisible();
    await shutLobbyWindow(bea);
    await expect(bea.locator(".lobby-panel")).toContainText("Ann");
    await expect(bea.locator("#topbar .topbar-queue")).toBeHidden();
  } catch (error) {
    await attachConsoles(consoles);
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
  // Ann's party queues first, so it may warm up (#3899): its pages keep watch.
  for (const page of [ann, bea]) {
    await keepToasts(page);
  }
  const consoles = keepConsoles({ Ann: ann, Bea: bea, Cid: cid, Dot: dot });

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

    // Twice the ticket's expiry in a warmup: its heartbeat runs on under a
    // match, or the other party never meets this one. No longer: the test
    // already spends most of its budget booting four pages (#4127).
    await ann.waitForTimeout(2 * TICKET_TTL_MS);

    // Another party queues: the warmup ends at once, and all four meet.
    await formParty([cid, dot], ["Cid", "Dot"]);
    await runTeamLobby([cid, dot]);
    // The party is told, in its match, that the warmup gave way to it:
    // a toast's 5 s, on a page that may boot it behind another in front,
    // so each page keeps every toast it shows (#3968).
    for (const page of [ann, bea]) {
      await expect
        .poll(() => toastsOf(page), { timeout: 60_000 })
        .toContain("Match found — warmup over");
    }
    await inRealMatch([ann, bea], cid);
    for (const page of [ann, bea, cid, dot]) {
      await page.bringToFront();
      await expect(page.locator(".hud-skills .hud-skill").first()).toBeAttached({
        timeout: 40_000,
      });
    }
  } catch (error) {
    await attachConsoles(consoles);
    throw error;
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
    // Two pages draw the warmup at once: 2v2 keeps it to two bots, and
    // the party's votes end the vote stage rather than its 30 s.
    await ann.goto("./");
    await openRail(ann, "Team Builder");
    await expect(ann.getByRole("button", { name: "New team build", exact: true })).toBeVisible();
    await paste(ann.locator(".screen"), teamCode("Duo", QUAD.slice(0, 2)));
    await ann.getByRole("button", { name: "Save", exact: true }).click();
    await expect(ann.locator(".toast")).toHaveText("Saved");
    await formParty([ann, bea], ["Ann", "Bea"]);
    await ann.bringToFront();
    await setTeamSize(ann, 2);
    await expectTeamSize(bea, 2, { locked: true });
    await runTeamLobby([ann, bea], () => voteTeam(ann, bea, "Duo"), 2);
    await press(ann, ann.locator("#topbar .topbar-queue"));
    await press(
      ann,
      ann.locator("#topbar .queue-window").getByRole("button", { name: "Start warmup now" }),
    );
    const line = ann.locator(".hud-warmup .topbar-queue");
    await expect(line).toContainText("Warmup — still in the queue", { timeout: 25_000 });

    // The top bar is hidden in a match (#454): the warmup's line opens the flyout.
    await press(ann, line);
    await press(
      ann,
      ann.locator(".hud-warmup .queue-window").getByRole("button", { name: "Leave Queue" }),
    );
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

/** Keep every console line of `pages`, stamped and named, for a failure to show. */
function keepConsoles(pages: Readonly<Record<string, Page>>): string[] {
  const consoles: string[] = [];
  for (const [who, page] of Object.entries(pages)) {
    page.on("console", (message) => {
      consoles.push(`${String(Date.now())} ${who} ${message.type()}: ${message.text()}`);
    });
  }
  return consoles;
}

/** Attach the kept console lines to the failed test's report, and print them. */
async function attachConsoles(consoles: readonly string[]): Promise<void> {
  await test.info().attach("consoles", { body: consoles.join("\n"), contentType: "text/plain" });
  console.log(consoles.join("\n"));
}

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

/**
 * Wait until `pages`' warmup against bots (#3899) has given way to the
 * match: a party that queued first plays one while the other votes.
 * `foe`'s party queued second, so it never warms up: its bar proves the
 * match is up. Without it, no warmup line yet would pass for one gone.
 */
async function inRealMatch(pages: readonly Page[], foe: Page): Promise<void> {
  // As the #3899 warmup test: the match can follow the warmup ending.
  await foe.bringToFront();
  await expect(foe.locator(".hud-skills .hud-skill").first()).toBeAttached({ timeout: 40_000 });
  for (const page of pages) {
    // Found, a warmup loses its line before its match is dropped (#3968):
    // a page that warmed up is in the match once that match says so.
    const warmedUp = await page.evaluate(
      () => (window as { kept?: { warmedUp: boolean } }).kept?.warmedUp === true,
    );
    if (warmedUp) {
      await expect
        .poll(() => toastsOf(page), { timeout: 60_000 })
        .toContain("Match found — warmup over");
    }
    await expect(page.locator(".hud-warmup")).toHaveCount(0, { timeout: 60_000 });
    // The next match starts over: its warmup, its toast.
    await page.evaluate(() => {
      const kept = (window as { kept?: { toasts: string[]; warmedUp: boolean } }).kept;
      if (kept !== undefined) {
        kept.toasts.length = 0;
        kept.warmedUp = false;
      }
    });
  }
}

/** The first skill on `page`'s bar, once its match is up. */
async function firstSkill(page: Page): Promise<string | null> {
  const skill = page.locator(".hud-skills .hud-skill").first();
  // Met, the countdown and four arenas booting outlast expect's 15 s
  // (#2777); a page behind the others never mounts its HUD (#3935).
  await page.bringToFront();
  await expect(skill).toBeAttached({ timeout: 25_000 });
  return skill.getAttribute("data-skill-id");
}

test("#3815: a Team Arena party that wins queues again with the same team, with no Team Lobby", async ({
  browser,
}) => {
  // Three Team Lobby clocks of 30 s, the result's 20 s and two ranked
  // starts, each maybe after a warmup that Ann's party, queued first,
  // plays alone (#3899, #3968).
  test.setTimeout(420_000);
  const { context, pages } = await openPeers(browser, 4);
  const [ann, bea, cid, dot] = pages as [Page, Page, Page, Page];
  // Ann's party queues first, so it may warm up (#3899): its pages keep watch.
  for (const page of [ann, bea]) {
    await keepToasts(page);
  }
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
    // Ann's party warms up while Cid's votes: its bar is the warmup's
    // until all four are in the match (#3968).
    await inRealMatch([ann, bea], cid);
    const builds = [await firstSkill(ann), await firstSkill(bea)];
    await firstSkill(dot);

    // Cid's side leaves: on an Annihilation map, a side with nobody left is beaten.
    for (const page of [cid, dot]) {
      await page.bringToFront();
      const leave = await hudMenuRow(page, "leave");
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
    // the build and seat it played before: in the match, not a warmup.
    await inRealMatch([ann, bea], cid);
    expect([await firstSkill(ann), await firstSkill(bea)]).toEqual(builds);
    await expect(ann.locator(".party-row-name")).toContainText(["Bea"]);
  } finally {
    await context.close();
  }
});
