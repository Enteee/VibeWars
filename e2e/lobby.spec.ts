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
  await page.getByRole("button", { name: "join", exact: true }).click();
  await expect(page.locator(".screen-lobby")).toBeVisible();
}

/** Host on team 1, guest on team 2, both ready, and the host starts. */
async function startTwoPlayerMatch(host: Page, guest: Page): Promise<string> {
  const code = await hostLobby(host, "Host");
  await joinLobby(guest, "Guest", code);
  await host.getByRole("button", { name: "join team 1" }).click();
  await guest.getByRole("button", { name: "join team 2" }).click();
  await host.getByRole("button", { name: "ready", exact: true }).click();
  await guest.getByRole("button", { name: "ready", exact: true }).click();
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

test("a wrong code finds no lobby after the 10 s wait, and says so once", async ({ browser }) => {
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
    await guest.getByRole("button", { name: "join", exact: true }).click();
    await expect(guest.locator("#status")).toHaveText("connecting…");

    const problem = guest.locator(".screen-connection-problem");
    await expect(problem).toHaveText(NO_ANSWER, { timeout: 15_000 });
    await expect(problem).toHaveCount(1);
    // Back on the menu, but the error must not be reset to "ready".
    await expect(guest.locator("#status")).toHaveText("could not join");
    await expect(host.locator(".screen-lobby")).not.toContainText("Guest");
  } finally {
    await context.close();
  }
});

test("leaving a lobby puts the status bar back to ready", async ({ page }) => {
  // The status used to keep saying "lobby CODE" on the menu (#206).
  const code = await hostLobby(page, "Host");
  await expect(page.locator("#status")).toHaveText(`lobby ${code}`);

  await page.getByRole("button", { name: "leave" }).click();
  await expect(page.getByRole("heading", { name: "VibeWars" })).toBeVisible();
  await expect(page.locator("#status")).toHaveText("ready");
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

    await host.getByRole("button", { name: "ready", exact: true }).click();
    await guest.getByRole("button", { name: "ready", exact: true }).click();

    const start = host.getByRole("button", { name: "start match" });
    await expect(start).toBeEnabled();
    await start.click();

    // The arena canvas only exists once Phaser has booted into a match.
    await expect(host.locator("#viewport canvas")).toBeVisible();
    await expect(guest.locator("#viewport canvas")).toBeVisible();
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
    await expect(host.locator("#viewport canvas")).toBeVisible();

    const scoreboard = host.locator(".hud-scoreboard");
    await expect(scoreboard).toContainText("0 — 0");

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
    await expect(host.locator(".hud-bar-health .hud-bar-label")).toContainText("500 / 500");
    await expect(guest.locator(".hud-bar-health .hud-bar-label")).toContainText("500 / 500");
  } finally {
    await context.close();
  }
});

test("a player who quits early is told the match still runs, until it ends", async ({
  browser,
}) => {
  // Back from a running match, the lobby used to look open and say "in
  // match" in the status bar, while the host refused every click (#200).
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];

  try {
    const code = await startTwoPlayerMatch(host, guest);
    await expect(host.locator("#viewport canvas")).toBeVisible();
    await expect(guest.locator("#viewport canvas")).toBeVisible();

    // The canvas shows before the join resolves, and the leave button only
    // exists once the match view is up; "in match" is set right after that.
    await expect(host.locator("#status")).toHaveText("in match");
    await expect(guest.locator("#status")).toHaveText("in match");

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
    const ready = host.getByRole("button", { name: "ready", exact: true });
    await expect(ready).toBeEnabled();
    await expect(host.locator(".lobby-map select")).toBeEnabled();
    await ready.click();
    await expect(host.getByRole("button", { name: "not ready" })).toBeVisible();
  } finally {
    await context.close();
  }
});
