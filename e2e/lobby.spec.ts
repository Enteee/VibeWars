import { expect, test, type Page } from "@playwright/test";

/**
 * Browser tests for the lobby flow (brief §31): create lobby, join
 * lobby, start match.
 *
 * Two independent browser contexts, so the host and the guest really are
 * two separate browsers with separate storage — the same thing that
 * happens at a LAN party. A single page driving both sides would share
 * localStorage and a Colyseus connection pool, and would not prove the
 * flow works between machines.
 */

async function openMenu(page: Page, playerName: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "vibewars" })).toBeVisible();
  await page.locator(".screen-menu input.field-input").first().fill(playerName);
}

/** Host a lobby and return the code the host is told to read out. */
async function hostLobby(page: Page, playerName: string): Promise<string> {
  await openMenu(page, playerName);
  await page.getByRole("button", { name: "host a lobby" }).click();

  const code = page.locator(".lobby-code");
  await expect(code).toBeVisible();
  const text = (await code.textContent())?.trim() ?? "";
  expect(text).toMatch(/^[A-Z0-9]{4,8}$/);
  return text;
}

test("a host creates a lobby and is shown a joinable code", async ({ page }) => {
  const code = await hostLobby(page, "Host");

  // The host is in the lobby, and the code is the thing they read aloud.
  await expect(page.locator(".screen-lobby")).toBeVisible();
  expect(code).not.toBe("");
});

test("a second player joins with the code and both see each other", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    const code = await hostLobby(host, "Host");

    await openMenu(guest, "Guest");
    await guest.locator("input.code-input").fill(code);
    await guest.getByRole("button", { name: "join", exact: true }).click();

    await expect(guest.locator(".screen-lobby")).toBeVisible();

    // The real assertion: each browser sees the *other* player. That is
    // what proves state is synchronising between two clients, not just
    // that each rendered its own optimistic view.
    await expect(host.locator(".screen-lobby")).toContainText("Guest");
    await expect(guest.locator(".screen-lobby")).toContainText("Host");
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test("a wrong code does not drop the player into someone else's lobby", async ({ browser }) => {
  // Matchmaking without `filterBy(["code"])` would hand out any open
  // lobby and quietly ignore the typed code — the bug this guards.
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    const code = await hostLobby(host, "Host");
    const wrong = code === "AAAA" ? "BBBB" : "AAAA";

    await openMenu(guest, "Guest");
    await guest.locator("input.code-input").fill(wrong);
    await guest.getByRole("button", { name: "join", exact: true }).click();

    // Either an error is shown or nothing happens — but the guest must
    // never land in the host's lobby, and the host must never see them.
    await guest.waitForTimeout(1500);
    await expect(host.locator(".screen-lobby")).not.toContainText("Guest");
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test("the host starts a match and both players enter the arena", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    const code = await hostLobby(host, "Host");

    await openMenu(guest, "Guest");
    await guest.locator("input.code-input").fill(code);
    await guest.getByRole("button", { name: "join", exact: true }).click();
    await expect(guest.locator(".screen-lobby")).toBeVisible();

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
    await hostContext.close();
    await guestContext.close();
  }
});

test("a lobby match shows the score, the clock and both fighters", async ({ browser }) => {
  // The scoreboard was blank for a long time: the server tracked score and
  // clock, the HUD could draw them, and the two were never connected.
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    const code = await hostLobby(host, "Host");

    await openMenu(guest, "Guest");
    await guest.locator("input.code-input").fill(code);
    await guest.getByRole("button", { name: "join", exact: true }).click();
    await expect(guest.locator(".screen-lobby")).toBeVisible();

    await host.getByRole("button", { name: "join team 1" }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();
    await host.getByRole("button", { name: "ready", exact: true }).click();
    await guest.getByRole("button", { name: "ready", exact: true }).click();
    await host.getByRole("button", { name: "start match" }).click();

    await expect(host.locator("#viewport canvas")).toBeVisible();

    const scoreboard = host.locator(".hud-scoreboard");
    await expect(scoreboard).toContainText("0 — 0");

    // The clock advances. Not "starts near zero": rooms are reused via
    // joinOrCreate, so a match may already have been running a while.
    await expect(scoreboard).toContainText(/\d+:\d\d/);
    const firstReading = (await scoreboard.textContent()) ?? "";
    await expect(scoreboard).not.toHaveText(firstReading, { timeout: 5000 });

    // Both fighters are still in the match after moving — a player who
    // walks must not vanish from anyone else's arena.
    await host.keyboard.down("d");
    await guest.keyboard.down("a");
    await host.waitForTimeout(800);
    await host.keyboard.up("d");
    await guest.keyboard.up("a");
    await host.waitForTimeout(400);

    await expect(host.locator(".hud-scoreboard")).toBeVisible();
    await expect(guest.locator(".hud-scoreboard")).toBeVisible();
    await expect(host.locator(".hud-bar-health .hud-bar-label")).toContainText("500 / 500");
    await expect(guest.locator(".hud-bar-health .hud-bar-label")).toContainText("500 / 500");
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
