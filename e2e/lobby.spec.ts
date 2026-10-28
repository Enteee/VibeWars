import { expect, test, type Page } from "@playwright/test";

import { openPeers } from "./helpers/peers.js";
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
  await page.locator(".screen-menu input.field-input").first().fill(playerName);
}

/** Quit the match with the HUD's leave button, which asks first (#160). */
async function leaveMatch(page: Page): Promise<void> {
  const leave = page.locator(".hud-leave");
  await leave.getByRole("button", { name: "leave match" }).click();
  await leave.getByRole("button", { name: "yes" }).click();
}

/** Host a lobby and return the code the host is told to read out. */
async function hostLobby(page: Page, playerName: string): Promise<string> {
  await openMenu(page, playerName);
  await page.getByRole("button", { name: "host a lobby" }).click();

  const code = page.locator(".lobby-code");
  await expect(code).toBeVisible();
  const text = (await code.textContent())?.trim() ?? "";
  // Six letters, read aloud in two halves (#379).
  expect(text).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  return text;
}

/** Join `code` as `playerName` and wait for the lobby screen. */
async function joinLobby(page: Page, playerName: string, code: string): Promise<void> {
  await openMenu(page, playerName);
  await page.locator("input.code-input").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.locator(".screen-lobby")).toBeVisible();
}

/** Host on team 1, guest on team 2 unless `guestTeam` says, both ready, and the host starts. */
async function startTwoPlayerMatch(host: Page, guest: Page, guestTeam = 2): Promise<string> {
  const code = await hostLobby(host, "Host");
  await joinLobby(guest, "Guest", code);
  await host.getByRole("button", { name: "join team 1" }).click();
  await guest.getByRole("button", { name: `join team ${String(guestTeam)}` }).click();
  await host.getByRole("button", { name: "Ready", exact: true }).click();
  await guest.getByRole("button", { name: "Ready", exact: true }).click();
  await host.getByRole("button", { name: "start match" }).click();
  return code;
}

const NO_ANSWER =
  "No lobby answered that code. Check it; if it is right, your network may be blocking peer-to-peer connections.";

test("the menu says peers see your IP address before you host or join, and the lobby does not (#541)", async ({
  page,
}) => {
  await openMenu(page, "Host");
  const notice = page.getByText("can see your IP address");
  await expect(notice).toBeVisible();
  await expect(page.getByRole("button", { name: "host a lobby" })).toBeVisible();
  await page.getByRole("button", { name: "host a lobby" }).click();
  await expect(page.locator(".screen-lobby")).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("a host creates a lobby and is shown a joinable code", async ({ page }) => {
  const code = await hostLobby(page, "Host");

  // The host is in the lobby, and the code is the thing they read aloud.
  await expect(page.locator(".screen-lobby")).toBeVisible();
  expect(code).not.toBe("");
});

test("a second player joins with the code and both see each other", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const code = await hostLobby(host, "Host");
    await joinLobby(guest, "Guest", code);

    // The real assertion: each page sees the *other* player. That is
    // what proves state is synchronising between two peers, not just
    // that each rendered its own optimistic view.
    await expect(host.locator(".screen-lobby")).toContainText("Guest");
    await expect(guest.locator(".screen-lobby")).toContainText("Host");
  } finally {
    await context.close();
  }
});

test("a wrong code says Connecting…, finds no lobby after the 20 s wait, and says so once (#707)", async ({
  browser,
}) => {
  // A code is its own room: a wrong one must never land the guest in the
  // host's lobby, even with a lobby open next door.
  test.setTimeout(60_000);
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const code = await hostLobby(host, "Host");
    const wrong = code === "ACD-EFG" ? "GFE-DCA" : "ACD-EFG";

    await openMenu(guest, "Guest");
    await guest.locator("input.code-input").fill(wrong);
    await guest.getByRole("button", { name: "Join", exact: true }).click();
    await expect(guest.locator("#status")).toHaveText("connecting…");
    // Not at once: only a join that is taking a while says so.
    const connecting = guest.locator(".menu-connecting");
    await expect(connecting).toBeHidden();
    await expect(connecting).toHaveText("Connecting…");
    await expect(connecting).toBeVisible({ timeout: 5_000 });

    const problem = guest.locator(".screen-connection-problem");
    await expect(problem).toHaveText(NO_ANSWER, { timeout: 25_000 });
    await expect(connecting).toBeHidden();
    await expect(problem).toHaveCount(1);
    // In the Play column, right above the button to try again with (#579).
    await expect(
      guest.locator(".menu-play .screen-connection-problem + .menu-row").getByRole("button", {
        name: "Host a lobby",
      }),
    ).toBeVisible();
    // Back on the menu, but the error must not be reset to "ready".
    await expect(guest.locator("#status")).toHaveText("could not join");
    await expect(host.locator(".screen-lobby")).not.toContainText("Guest");
  } finally {
    await context.close();
  }
});

test("leaving a lobby puts the status bar back to idle: nothing (#454)", async ({ page }) => {
  // The status used to keep saying "lobby CODE" on the menu (#206).
  const code = await hostLobby(page, "Host");
  await expect(page.locator("#status")).toHaveText(`lobby ${code}`);

  await page.getByRole("button", { name: "leave" }).click();
  await expect(page.getByRole("heading", { name: "VibeWars" })).toBeVisible();
  await expect(page.locator("#status")).toBeHidden();
});

test("the host closing its page takes the guest to the menu, and says why", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const code = await hostLobby(host, "Host");
    await joinLobby(guest, "Guest", code);
    await expect(host.locator(".screen-lobby")).toContainText("Guest");

    await host.close();

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
    const code = await hostLobby(host, "Host");
    await joinLobby(guest, "Guest", code);

    // Both pick a team, then ready up. Readiness is disabled without a
    // team, which is itself part of what this exercises.
    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();

    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();

    const start = host.getByRole("button", { name: "start match" });
    await expect(start).toBeEnabled();
    await start.click();

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
    const code = await startTwoPlayerMatch(host, guest, 1);
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
    await expect(host.locator("#status")).toHaveText(`lobby ${code}`);
    // Readiness is only cleared once the match is over, so it still reads "not ready".
    await expect(host.getByRole("button", { name: "not ready" })).toBeDisabled();
    await expect(host.getByRole("button", { name: "start match" })).toBeDisabled();
    await expect(host.getByRole("button", { name: "join team 2" })).toBeDisabled();
    // The host would drop a map change too, so the picker is locked as well.
    await expect(host.locator(".lobby-map select")).toBeDisabled();
    await expect(host.getByRole("button", { name: "leave" })).toBeEnabled();

    // The last player leaves, the match is over, and the lobby opens.
    await leaveMatch(guest);
    await expect(running).toHaveCount(0);
    await expect(guest.locator("#status")).toHaveText(`lobby ${code}`);
    const ready = host.getByRole("button", { name: "Ready", exact: true });
    await expect(ready).toBeEnabled();
    await expect(host.locator(".lobby-map select")).toBeEnabled();
    await ready.click();
    await expect(host.getByRole("button", { name: "not ready" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a player who quits a 1v1 forfeits it, and is back in an open lobby (#846)", async ({
  browser,
}) => {
  // Annihilation: the quitter's team has nobody left, so it is wiped and
  // the match ends at once, rather than running on with nobody to fight.
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const code = await startTwoPlayerMatch(host, guest);
    await expect(host.locator(".hud-leave")).toBeVisible();
    await expect(guest.locator(".hud-leave")).toBeVisible();

    await leaveMatch(host);
    await expect(host.locator(".screen-lobby")).toBeVisible();
    await expect(host.locator("#status")).toHaveText(`lobby ${code}`);
    await expect(host.locator(".lobby-running")).toHaveCount(0);
    await expect(host.getByRole("button", { name: "Ready", exact: true })).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("Copy puts the lobby code on the clipboard and says so (#580)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const code = await hostLobby(page, "Host");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
});

test("a refused clipboard leaves the code selected, to copy by hand (#580)", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
  });
  const code = await hostLobby(page, "Host");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("copy it by hand");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(code);
});

test("each row shows the character a player brings, a refused build as Default loadout, and Start says who it waits for (#580)", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    // The host plays a saved character with a skill; the guest one with an
    // empty bar, which the host refuses, so it plays a starter build and
    // lists as the default. Both pages share one storage, so the guest picks its
    // own after the host is in.
    await host.goto("./");
    await host.getByRole("button", { name: "new character" }).click();
    await host.locator("input.editor-name").fill("Cynn");
    await host.locator(".skill-box").first().locator(".skill-box-equip").click();
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await host.getByRole("button", { name: "new character" }).click();
    await host.locator("input.editor-name").fill("Blank");
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await host.locator(".roster").getByText("Cynn", { exact: true }).click();
    const code = await hostLobby(host, "Host");
    await guest.goto("./");
    await guest.locator(".roster").getByText("Blank", { exact: true }).click();
    await joinLobby(guest, "Guest", code);

    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();
    const hostRow = guest.locator(".lobby-team").nth(0).locator(".lobby-slot");
    const guestRow = host.locator(".lobby-team").nth(1).locator(".lobby-slot");
    await expect(hostRow.locator(".lobby-character")).toHaveText("Cynn · Warrior");
    await expect(guestRow.locator(".lobby-character")).toHaveText("Default loadout");
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

test("a match plays the character the lobby lists, not one selected after joining (#1070)", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    // Both pages share one storage, so the guest selecting Blank changes
    // the host's selection too. The host entered with Cynn and plays Cynn.
    await host.goto("./");
    await host.getByRole("button", { name: "new character" }).click();
    await host.locator("input.editor-name").fill("Cynn");
    await host.locator(".skill-box").first().locator(".skill-box-equip").click();
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await host.getByRole("button", { name: "new character" }).click();
    await host.locator("input.editor-name").fill("Blank");
    await host.getByRole("button", { name: "Save", exact: true }).click();
    await host.locator(".roster").getByText("Cynn", { exact: true }).click();
    const code = await hostLobby(host, "Host");
    await guest.goto("./");
    await guest.locator(".roster").getByText("Blank", { exact: true }).click();
    await joinLobby(guest, "Guest", code);

    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();
    const hostRow = host.locator(".lobby-team").nth(0).locator(".lobby-slot");
    await expect(hostRow.locator(".lobby-character")).toHaveText("Cynn · Warrior");
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await host.getByRole("button", { name: "start match" }).click();

    // Cynn's one skill, not the starter build Blank's refused build would get.
    await expect(host.locator("#viewport canvas:not(.compass)")).toBeVisible();
    await expect(host.locator(".hud-skills .hud-skill:not(.is-empty)")).toHaveCount(1);
  } finally {
    await context.close();
  }
});
