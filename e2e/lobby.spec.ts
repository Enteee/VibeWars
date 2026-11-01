import { expect, test, type Page } from "@playwright/test";

import { INVITE_URL, joinByCode, joinFriend, openRail, pickCharacter } from "./helpers/menu.js";
import {
  copyInvite,
  hostLobby as hostFromMenu,
  openPeers,
  openToFriends,
  playHouseTeams,
  playOwnTeams,
  saveSoloTeam,
} from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";
import { expectTopbarFits } from "./helpers/topbar.js";
import { key } from "./keys.js";

/**
 * Browser tests for the lobby flow (brief §31): create lobby, join
 * lobby, start match.
 *
 * The host and the guest are two pages, each with its own lobby and
 * match code, talking over BroadcastChannel (#403). They share one
 * `BrowserContext`, because a BroadcastChannel reaches nothing outside
 * it; what is shared is only storage, not a connection, so each page
 * still joins the other's room exactly as a browser across the room does.
 */

async function openMenu(page: Page, playerName: string): Promise<void> {
  await page.goto("./");
  await expect(page).toHaveTitle("VibeWars");
  await expect(page.getByRole("heading", { name: "VibeWars" })).toBeVisible();
  await namePlayer(page, playerName);
}

/** Quit the match with the HUD's leave button, which asks first (#160). */
async function leaveMatch(page: Page): Promise<void> {
  const leave = page.locator(".hud-leave");
  await leave.getByRole("button", { name: "leave match" }).click();
  await leave.getByRole("button", { name: "yes" }).click();
}

/** Host a lobby and return the invite link the host sends its friends (#2100). */
async function hostLobby(page: Page, playerName: string): Promise<string> {
  await openMenu(page, playerName);
  return hostFromMenu(page);
}

/** Open `invite` as `playerName` and wait for the lobby screen. */
async function joinLobby(page: Page, playerName: string, invite: string): Promise<void> {
  await openMenu(page, playerName);
  await joinFriend(page, invite);
  await expect(page.locator(".lobby-panel")).toBeVisible();
}

/**
 * Host on team 1, guest on team 2 unless `guestTeam` says, both ready, and
 * the host starts; each side proposes a Team Build as big as its players
 * (#1525), so no bot plays beside them (#2029). A side nobody is on plays
 * the house team, as many as the other.
 */
async function startTwoPlayerMatch(host: Page, guest: Page, guestTeam = 2): Promise<string> {
  await openMenu(host, "Host");
  const team = await saveSoloTeam(host, guestTeam === 1 ? 2 : 1);
  const invite = await hostFromMenu(host);
  await joinLobby(guest, "Guest", invite);
  await host.getByRole("button", { name: "join team 1" }).click();
  await guest.getByRole("button", { name: `join team ${String(guestTeam)}` }).click();
  await host.getByRole("button", { name: "Ready", exact: true }).click();
  await guest.getByRole("button", { name: "Ready", exact: true }).click();
  await host.getByRole("button", { name: "start match" }).click();
  await playOwnTeams([
    { page: host, team },
    { page: guest, team, seat: guestTeam === 1 ? 1 : 0 },
  ]);
  return invite;
}

const NO_ANSWER = "Couldn't reach that lobby. Check the invite link, and ask the host to open it.";
const CLOSED = "That lobby is closed. Ask the host to open it.";

test("a host creates a lobby and is given a joinable invite link (#2100)", async ({ page }) => {
  const invite = await hostLobby(page, "Host");

  // The host is in the lobby, and the invite link is the thing they send.
  await expect(page.locator(".lobby-panel")).toBeVisible();
  expect(invite).toMatch(INVITE_URL);
});

test("a second player joins with the invite link and both see each other", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const invite = await hostLobby(host, "Host");
    await joinLobby(guest, "Guest", invite);

    // The real assertion: each page sees the *other* player. That is
    // what proves state is synchronising between two peers, not just
    // that each rendered its own optimistic view.
    await expect(host.locator(".lobby-panel")).toContainText("Guest");
    await expect(guest.locator(".lobby-panel")).toContainText("Host");
  } finally {
    await context.close();
  }
});

test("a host with a guest who joins another lobby is asked once, and its guest follows it there (#1553)", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 3);
  const [alpha, bravo, charlie] = pages as [Page, Page, Page];

  try {
    const alphaInvite = await hostLobby(alpha, "Alpha");
    await joinLobby(bravo, "Bravo", alphaInvite);
    const charlieInvite = await hostLobby(charlie, "Charlie");
    // Storage is shared: Alpha's name is read at the press.
    await namePlayer(alpha, "Alpha");

    await joinByCode(alpha, charlieInvite);
    const confirm = alpha.locator(".topbar-join-confirm");
    await expect(confirm.locator(".topbar-join-confirm-text")).toHaveText(
      "Your party of 2 joins with you.",
    );
    // Asked, not gone yet: still its own lobby, the invite out of the
    // address bar all the same (#2100).
    await expect(alpha.locator("#topbar .lobby-code-label")).toHaveText("Your lobby");
    expect(new URL(alpha.url()).hash).toBe("");
    await confirm.getByRole("button", { name: "Join", exact: true }).click();

    for (const page of [alpha, bravo]) {
      await expect(page.locator("#topbar .lobby-code-label")).toHaveText("Lobby");
      await expect(page.locator("#topbar .topbar-leave")).toBeVisible();
    }
    await expect(charlie.locator(".lobby-panel")).toContainText("Alpha");
    await expect(charlie.locator(".lobby-panel")).toContainText("Bravo");
    // Followed quietly: no "the host closed the lobby" on the way.
    await expect(bravo.locator(".screen-connection-problem")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a closed lobby takes nobody with its invite link; opened it does, and closed again it keeps its guest (#1682)", async ({
  browser,
}) => {
  // The first join waits out the 20 s no-answer: a closed, empty lobby's
  // host is in no room at all.
  test.setTimeout(90_000);
  const { context, pages } = await openPeers(browser, 3);
  const [host, guest, late] = pages as [Page, Page, Page];

  try {
    await openMenu(host, "Host");
    await openRail(host, "Hosted Game");
    // A closed lobby's invite link copies all the same (#2100).
    const invite = await copyInvite(host);
    const toggle = host.locator("#topbar .topbar-lobby-open");
    await expect(toggle).toHaveAccessibleName("Lobby closed");
    await expect(toggle).toHaveAttribute(
      "title",
      "Friends with your invite link can't join until you open the lobby.",
    );

    await openMenu(guest, "Guest");
    await joinByCode(guest, invite);
    await expect(guest.locator(".screen-connection-problem")).toHaveText(NO_ANSWER, {
      timeout: 30_000,
    });

    await openToFriends(host);
    await expect(toggle).toHaveAccessibleName("Lobby open");
    await expect(toggle).toHaveAttribute("title", "Anyone with your invite link can join.");
    await joinFriend(guest, invite);
    await expect(host.locator(".lobby-panel")).toContainText("Guest");
    // Only the host has the toggle; a guest's strip says when it is closed.
    await expect(guest.locator("#topbar .topbar-lobby-open")).toBeHidden();
    await expect(guest.locator(".party-closed")).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(guest.locator(".party-closed")).toHaveText("Lobby closed");

    await openMenu(late, "Late");
    await joinByCode(late, invite);
    await expect(late.locator(".screen-connection-problem")).toHaveText(CLOSED);
    await expect(host.locator(".lobby-panel")).not.toContainText("Late");
    await expect(guest.locator("#topbar .topbar-leave")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a wrong invite link says Connecting…, finds no lobby after the 20 s wait, and says so once (#707)", async ({
  browser,
}) => {
  // A key is its own room: a wrong one must never land the guest in the
  // host's lobby, even with a lobby open next door.
  test.setTimeout(60_000);
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const invite = await hostLobby(host, "Host");
    // A well-formed key, one symbol off the host's (#2100): its last
    // symbol carries padding bits, so the first is the one changed.
    const at = invite.indexOf("#lobby=") + "#lobby=".length;
    const wrong = `${invite.slice(0, at)}${invite[at] === "A" ? "B" : "A"}${invite.slice(at + 1)}`;
    expect(wrong).toMatch(INVITE_URL);

    await openMenu(guest, "Guest");
    // Its own lobby stays open until a join is in (#1526).
    const own = guest.locator("#topbar .lobby-code-label");
    await expect(own).toHaveText("Your lobby");
    const ownInvite = await copyInvite(guest);
    await joinByCode(guest, wrong);
    await expect(guest.locator("#status")).toHaveText("connecting…");
    // Not at once: only a join that is taking a while says so.
    const connecting = guest.locator(".topbar-connecting");
    await expect(connecting).toBeHidden();
    await expect(connecting).toHaveText("Connecting…");
    await expect(connecting).toBeVisible({ timeout: 5_000 });

    const problem = guest.locator(".screen-connection-problem");
    await expect(problem).toHaveText(NO_ANSWER, { timeout: 25_000 });
    await expect(connecting).toBeHidden();
    await expect(problem).toHaveCount(1);
    // On the screen the join was tried from (#579, #1525).
    await expect(guest.locator(".rail-body .screen-connection-problem")).toBeVisible();
    // Back on the menu, but the error must not be reset to "ready".
    await expect(guest.locator("#status")).toHaveText("could not join");
    await expect(host.locator(".lobby-panel")).not.toContainText("Guest");
    await expect(own).toHaveText("Your lobby");
    expect(await copyInvite(guest)).toBe(ownInvite);
  } finally {
    await context.close();
  }
});

test("a broken invite link is taken out of the address bar and says so, joining nothing (#2100)", async ({
  page,
}) => {
  await openMenu(page, "Guest");
  await page.goto("./#lobby=nope");
  await expect(page.locator(".toast")).toHaveText("That invite link is broken.");
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.locator("#topbar .topbar-leave")).toBeHidden();
});

test("a guest opening the host's invite link in a new tab joins from boot, and the address bar keeps no key (#2100)", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 1);
  const [host] = pages as [Page];

  try {
    const invite = await hostLobby(host, "Host");
    const guest = await context.newPage();
    await openMenu(guest, "Guest");
    // A fresh load, as a link opened from a chat is: no page to hashchange.
    await guest.goto("about:blank");
    await guest.goto(invite);
    await expect(guest.locator("#topbar .topbar-leave")).toBeVisible();
    await expect(guest.locator("#topbar .lobby-code-label")).toHaveText("Lobby");
    expect(guest.url()).not.toContain("lobby=");
    await expect(host.locator(".lobby-panel")).toContainText("Guest");
    await expect(guest.locator(".lobby-panel")).toContainText("Host");
  } finally {
    await context.close();
  }
});

test("the status bar says nothing in a lobby, which the title bar names, on any screen (#454, #1526)", async ({
  page,
}) => {
  // The status used to keep saying "lobby CODE" on the menu (#206), and
  // then repeated the code beside the lobby's own (#1272). The key is
  // shown nowhere now (#2100).
  const invite = await hostLobby(page, "Host");
  const secret = invite.slice(invite.indexOf("#lobby=") + "#lobby=".length);
  await expect(page.locator("#topbar .lobby-code-label")).toHaveText("Your lobby");
  await expect(page.locator("#status")).toBeHidden();
  await expect(page.locator("body")).not.toContainText(secret);

  await openRail(page, "Team Builder");
  await expect(page.locator("#topbar .lobby-code-label")).toHaveText("Your lobby");
  await expect(page.locator("#status")).toBeHidden();
});

test("the lobby's bar puts its status on a second row from 721 to 1200 px, nothing overlapping (#1368)", async ({
  page,
}) => {
  await hostLobby(page, "Host");
  // More than one map, so the host's bar carries the select, its widest part.
  await expect(page.locator(".lobby-map select")).toBeVisible();
  for (const width of [700, 721, 800, 940, 1100, 1201]) {
    await expectTopbarFits(page, width, "#topbar > :not(.topbar-status), #topbar .lobby-map");
  }
  // Closed is the longer word of the host's toggle (#1682).
  await page.locator("#topbar .topbar-lobby-open").click();
  await expect(page.locator("#topbar .topbar-lobby-open")).toContainText("Closed");
  await expectTopbarFits(page, 1201, "#topbar > :not(.topbar-status), #topbar .lobby-map");
});

test("the host closing its page takes the guest to the menu, and says why", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const invite = await hostLobby(host, "Host");
    await joinLobby(guest, "Guest", invite);
    await expect(host.locator(".lobby-panel")).toContainText("Guest");

    // A navigation fires pagehide, as a closed tab does; page.close() does
    // not run unload handlers (#1085).
    await host.goto("about:blank");

    await expect(guest.locator(".screen-connection-problem")).toHaveText(
      "The host closed the lobby.",
    );
    await expect(guest.getByRole("heading", { name: "VibeWars" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("the host starts a match and both players enter the arena", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const invite = await hostLobby(host, "Host");
    await joinLobby(guest, "Guest", invite);

    // Both pick a team, then ready up. Readiness is disabled without a
    // team, which is itself part of what this exercises.
    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();

    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();

    const start = host.getByRole("button", { name: "start match" });
    await expect(start).toBeEnabled();
    await start.click();
    await playHouseTeams([host, guest]);

    // The arena canvas only exists once Phaser has booted into a match.
    await expect(host.locator("#viewport canvas:not(.compass)")).toBeVisible();
    await expect(guest.locator("#viewport canvas:not(.compass)")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a lobby match shows the score, the clock and both fighters", async ({ browser }) => {
  // The scoreboard was blank for a long time: the host tracked score and
  // clock, the HUD could draw them, and the two were never connected.
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    await startTwoPlayerMatch(host, guest);
    await expect(host.locator("#viewport canvas:not(.compass)")).toBeVisible();

    const scoreboard = host.locator(".hud-scoreboard");
    // The living on each side (#881).
    await expect(scoreboard).toContainText("1 v 1");

    // The clock advances.
    await expect(scoreboard).toContainText(/\d+:\d\d/);
    const firstReading = (await scoreboard.textContent()) ?? "";
    await expect(scoreboard).not.toHaveText(firstReading, { timeout: 5000 });

    // Both fighters are still in the match after moving — a player who
    // walks must not vanish from anyone else's arena.
    await host.keyboard.down(key("move-right"));
    await guest.keyboard.down(key("move-left"));
    await host.waitForTimeout(800);
    await host.keyboard.up(key("move-right"));
    await guest.keyboard.up(key("move-left"));
    await host.waitForTimeout(400);

    await expect(host.locator(".hud-scoreboard")).toBeVisible();
    await expect(guest.locator(".hud-scoreboard")).toBeVisible();
    // At full health, whatever starter build each was handed (#852).
    await expect(host.locator(".hud-bar-health .hud-bar-label")).toContainText(/\b(\d+) \/ \1\b/);
    await expect(guest.locator(".hud-bar-health .hud-bar-label")).toContainText(/\b(\d+) \/ \1\b/);
  } finally {
    await context.close();
  }
});

test("a player who quits early is told the match still runs, until it ends", async ({
  browser,
}) => {
  // Back from a running match, the lobby used to look open and say "in
  // match" in the status bar, while the host refused every click (#200).
  // Teammates: a 1v1 quitter wipes their team, which ends the match (#846).
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    await startTwoPlayerMatch(host, guest, 1);
    await expect(host.locator("#viewport canvas:not(.compass)")).toBeVisible();
    await expect(guest.locator("#viewport canvas:not(.compass)")).toBeVisible();

    // The canvas shows before the join resolves, and the leave button only
    // exists once the match view is up. The top bar hides in a match (#454).
    await expect(host.locator(".hud-leave")).toBeVisible();
    await expect(host.locator("#topbar")).toBeHidden();
    await expect(guest.locator(".hud-leave")).toBeVisible();

    // The host quits; the guest is still fighting.
    await leaveMatch(host);
    const running = host.locator(".lobby-running");
    await expect(running).toHaveText(
      "A match is still running. The lobby opens again when it ends.",
    );
    await expect(host.locator(".lobby-panel")).toBeVisible();
    // Readiness is only cleared once the match is over, so it still reads "not ready".
    await expect(host.getByRole("button", { name: "not ready" })).toBeDisabled();
    await expect(host.getByRole("button", { name: "start match" })).toBeDisabled();
    await expect(host.getByRole("button", { name: "join team 2" })).toBeDisabled();
    // The host would drop a map change too, so the picker is locked as well.
    await expect(host.locator(".lobby-map select")).toBeDisabled();

    // The last player leaves, the match is over, and the lobby opens.
    await leaveMatch(guest);
    await expect(running).toHaveCount(0);
    await expect(guest.locator(".lobby-panel")).toBeVisible();
    const ready = host.getByRole("button", { name: "Ready", exact: true });
    await expect(ready).toBeEnabled();
    await expect(host.locator(".lobby-map select")).toBeEnabled();
    await ready.click();
    await expect(host.getByRole("button", { name: "not ready" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a player who quits a 1v1 forfeits it, and is back in an open lobby; its winner follows (#846, #1997)", async ({
  browser,
}) => {
  // Annihilation: the quitter's team has nobody left, so it is wiped and
  // the match ends at once, rather than running on with nobody to fight.
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    await startTwoPlayerMatch(host, guest);
    await expect(host.locator(".hud-leave")).toBeVisible();
    await expect(guest.locator(".hud-leave")).toBeVisible();

    await leaveMatch(host);
    await expect(host.locator(".lobby-panel")).toBeVisible();
    await expect(host.locator(".lobby-panel")).toBeVisible();
    await expect(host.locator(".lobby-running")).toHaveCount(0);
    await expect(host.getByRole("button", { name: "Ready", exact: true })).toBeEnabled();

    // The guest won: a coded lobby's match counts down back to it, or Now (#1997).
    const line = guest.locator(".hud-end-line");
    await expect(line).toContainText(/Back to lobby in \d+ s/);
    await line.getByRole("button", { name: "Now" }).click();
    await expect(guest.locator(".lobby-panel")).toBeVisible();
    await expect(line).toHaveCount(0);
  } finally {
    await context.close();
  }
});

/** This page's own address and `#lobby=`, as an invite link to its lobby starts (#2100). */
function invitePrefix(page: Page): string {
  const { origin, pathname } = new URL(page.url());
  return `${origin}${pathname}#lobby=`;
}

test("Copy invite link puts the lobby's invite link on the clipboard and says so (#580, #2100)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openMenu(page, "Host");
  await openRail(page, "Hosted Game");
  await page.getByRole("button", { name: "Copy invite link", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(INVITE_URL);
  expect(copied.startsWith(invitePrefix(page))).toBe(true);
});

test("a refused clipboard shows the invite link selected, to copy by hand (#580, #2100)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
  });
  await openMenu(page, "Host");
  await openRail(page, "Hosted Game");
  await page.getByRole("button", { name: "Copy invite link", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText(
    "Could not copy: the invite link is selected, copy it by hand",
  );
  const line = page.getByRole("textbox", { name: "lobby invite link", exact: true });
  await expect(line).toBeVisible();
  const shown = await line.inputValue();
  expect(shown).toMatch(INVITE_URL);
  expect(shown.startsWith(invitePrefix(page))).toBe(true);
  await expect(line).toBeFocused();
});

test("each row shows a player's name alone, and Start says who it waits for (#580, #2029)", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    // Each picked a character, but a lobby lists names alone: what a
    // player plays is the Team Build slot they claim (#2029). Both pages
    // share one storage, so the guest picks its own after the host is in.
    await host.goto("./");
    await openRail(host, "Character Builder");
    await host.getByRole("button", { name: "New character", exact: true }).click();
    await host.locator("input.editor-name").fill("Cynn");
    await host.locator(".skill-box").first().locator(".skill-box-equip").click();
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await host.getByRole("button", { name: "New character", exact: true }).click();
    await host.locator("input.editor-name").fill("Blank");
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await pickCharacter(host, "Cynn");
    const invite = await hostLobby(host, "Host");
    await guest.goto("./");
    await pickCharacter(guest, "Blank");
    await joinLobby(guest, "Guest", invite);

    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();
    const hostRow = guest.locator(".lobby-team").nth(0).locator(".lobby-slot");
    const guestRow = host.locator(".lobby-team").nth(1).locator(".lobby-slot");
    await expect(hostRow.locator(".player-label-name")).toHaveText("Host");
    await expect(guestRow.locator(".player-label-name")).toHaveText("Guest");
    await expect(host.locator(".lobby-panel")).not.toContainText("Cynn");
    await expect(guest.locator(".lobby-panel")).not.toContainText("Blank");
    await expect(guestRow.locator(".lobby-ready")).toHaveText("Not ready");

    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await expect(host.locator(".lobby-waiting")).toHaveText("Waiting for Guest to ready up");
    await expect(host.getByRole("button", { name: "start match" })).toBeDisabled();

    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await expect(guestRow.locator(".lobby-ready")).toHaveText("Ready");
    await expect(host.locator(".lobby-waiting")).toHaveCount(0);
    await expect(host.getByRole("button", { name: "start match" })).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("a match plays the seat the host took, not a character selected after joining (#1070, #1525)", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    // Both pages share one storage, so the guest selecting Blank changes
    // the host's selection too. The host proposes a Team Build of Cynn,
    // takes Cynn's seat and plays Cynn; the guest's side plays the house team.
    await host.goto("./");
    await openRail(host, "Character Builder");
    await host.getByRole("button", { name: "New character", exact: true }).click();
    await host.locator("input.editor-name").fill("Cynn");
    await host.locator(".skill-box").first().locator(".skill-box-equip").click();
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await host.getByRole("button", { name: "New character", exact: true }).click();
    await host.locator("input.editor-name").fill("Blank");
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await pickCharacter(host, "Cynn");
    const cynn = await saveSoloTeam(host);
    const invite = await hostLobby(host, "Host");
    await guest.goto("./");
    await pickCharacter(guest, "Blank");
    await joinLobby(guest, "Guest", invite);

    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await host.getByRole("button", { name: "start match" }).click();
    await expect(host.locator(".team-lobby-stage")).toHaveText("Choose a team build");
    await host.getByRole("button", { name: `Propose ${cynn}`, exact: true }).click();
    await playHouseTeams([host, guest]);

    // Cynn's one skill, not Blank's empty bar.
    await expect(host.locator("#viewport canvas:not(.compass)")).toBeVisible();
    await expect(host.locator(".hud-skills .hud-skill:not(.is-empty)")).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("a spectator presses Watch and follows the match 10 s late, with nothing to act with (#480)", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 3);
  const [host, guest, watcher] = pages as [Page, Page, Page];

  try {
    const invite = await startTwoPlayerMatch(host, guest);
    await expect(host.locator(".hud-leave")).toBeVisible();
    // Joined mid-match, on no team: Watch, not Ready.
    await joinLobby(watcher, "Watcher", invite);
    await expect(watcher.getByRole("button", { name: "Ready", exact: true })).toHaveCount(0);
    await watcher.getByRole("button", { name: "Watch", exact: true }).click();

    await expect(watcher.locator(".hud-watching")).toHaveText("Watching · 10 s delay");
    await expect(watcher.locator(".hud-skills")).toBeHidden();
    await expect(watcher.locator(".hud-bar-health")).toBeHidden();
    // While the delay fills, no empty score, target frame or compass.
    await expect(watcher.locator(".hud-target")).toBeHidden();
    await expect(watcher.locator(".hud-scoreboard")).toBeHidden();
    await expect(watcher.locator("canvas.compass")).toBeHidden();
    // The first delayed snapshot: the arena, following team 1's first seat.
    const target = watcher.locator(".hud-target-text");
    await expect(target).toHaveText("Host", { timeout: 20_000 });
    await expect(watcher.locator("#viewport canvas:not(.compass)")).toBeVisible();
    await expect(watcher.locator(".hud-scoreboard")).toContainText("1 v 1");

    await watcher.keyboard.press(key("target-next"));
    await expect(target).toHaveText("Guest");
    await watcher.keyboard.press(`Shift+${key("target-next")}`);
    await expect(target).toHaveText("Host");

    // Leaving is back to the lobby; the match goes on.
    await watcher.keyboard.press("Escape");
    await expect(watcher.locator(".lobby-panel")).toBeVisible();
    await expect(watcher.getByRole("button", { name: "Watch", exact: true })).toBeVisible();
    await expect(host.locator(".hud-leave")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a bot plays every slot nobody claims, tagged BOT in the match alone (#1194, #2029)", async ({
  page,
}) => {
  await hostLobby(page, "Host");
  await page.getByRole("button", { name: "join team 1" }).click();
  // No bot count: the host adds none, and the lobby lists people only.
  await expect(page.locator(".lobby-bots")).toHaveCount(0);
  await expect(page.locator(".lobby-team").nth(1).locator(".lobby-slot")).toHaveCount(0);
  await expect(page.locator(".bot-tag")).toHaveCount(0);

  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await playHouseTeams([page]);

  // Every foe in the arena is a bot, playing its house team's slot under
  // that character's name (#1458), cut short when long.
  await page.keyboard.press(key("target-closest"));
  await expect(page.locator(".hud-target-text")).toHaveText(/^[A-Z][a-z]+(\/[A-Z][a-z]+|…)$/);
  await expect(page.locator(".hud-target-bot")).toBeVisible();
  await expect(page.locator(".hud-target-bot")).toHaveText("BOT");
});
