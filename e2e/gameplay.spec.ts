import { expect, test, type Page, type Locator } from "@playwright/test";

/**
 * Browser tests for playing (brief §31): start a match, basic movement,
 * skill activation.
 *
 * Movement and rendering are asserted by *looking at the canvas*. The
 * arena is WebGL, so there is no DOM to inspect, and adding a test-only
 * hook to the client would mean the test passes against a code path real
 * players never run. Comparing rendered frames is slower but it asserts
 * the thing that actually matters: the player moved, on screen, as a
 * result of a key press that went to the server and came back.
 */

/**
 * Screenshot just the arena.
 *
 * An element screenshot is a clip of the page, so anything overlapping the
 * canvas — the HUD, and in particular the ticking match clock — lands in
 * the image. Masking those out keeps "did the arena change?" an honest
 * question about the arena.
 */
async function arenaShot(page: Page, canvas: Locator): Promise<Buffer> {
  return canvas.screenshot({
    mask: [
      page.locator(".hud"),
      page.locator(".hud-scoreboard"),
      page.locator(".hud-result"),
      page.locator(".hud-mute"),
    ],
  });
}

async function startQuickMatch(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("button", { name: "quick match" }).click();

  const canvas = page.locator("#viewport canvas");
  await expect(canvas).toBeVisible();
  // The HUD only populates once the first authoritative snapshot of this
  // player has arrived, so this doubles as "we are really in a match".
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  return canvas;
}

/**
 * A match in a lobby of one. Tests that compare frames need it: a Quick
 * Match room is shared, so it can hold other tests' players, including
 * ghosts that stay for the reconnection window after their page closed
 * and then vanish, mid-comparison (#128). A lobby's match is private to
 * the lobby (#41), so nothing moves in it that the test did not move.
 */
async function startSoloMatch(page: Page): Promise<Locator> {
  return startLobbyMatch(page, []);
}

/**
 * A lobby match: `host` on team 1, every guest on team 2. The host's
 * arena canvas, once everyone is in.
 */
async function startLobbyMatch(host: Page, guests: readonly Page[]): Promise<Locator> {
  await host.goto("/");
  await host.getByRole("button", { name: "host a lobby" }).click();
  await expect(host.locator(".lobby-code")).toHaveText(/^[A-Z0-9]{4,8}$/);
  const code = (await host.locator(".lobby-code").textContent())?.trim() ?? "";
  for (const guest of guests) {
    await guest.goto("/");
    await guest.locator("input.code-input").fill(code);
    await guest.getByRole("button", { name: "join", exact: true }).click();
    await guest.getByRole("button", { name: "join team 2" }).click();
    await guest.getByRole("button", { name: "ready", exact: true }).click();
  }
  await host.getByRole("button", { name: "join team 1" }).click();
  await host.getByRole("button", { name: "ready", exact: true }).click();
  await host.getByRole("button", { name: "start match" }).click();

  for (const page of [host, ...guests]) {
    await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  }
  return host.locator("#viewport canvas");
}

/** Energy as the HUD reports it, e.g. "50 / 50 en" -> 50. */
async function readEnergy(page: Page): Promise<number> {
  const text = (await page.locator(".hud-bar-energy .hud-bar-label").textContent()) ?? "";
  const match = /^(\d+)\s*\//.exec(text.trim());
  expect(match, `could not read energy from ${JSON.stringify(text)}`).not.toBeNull();
  return Number(match?.[1] ?? NaN);
}

test("a quick match renders the arena and a populated HUD", async ({ page }) => {
  await startQuickMatch(page);

  await expect(page.locator(".hud-skills .hud-skill")).toHaveCount(8);
  await expect(page.locator(".hud-target")).toContainText("no target");
  expect(await readEnergy(page)).toBeGreaterThan(0);
});

test("M mutes and unmutes the combat sounds", async ({ page }) => {
  await startQuickMatch(page);
  const mute = page.getByRole("button", { name: "Mute sounds" });
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("m");
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("m");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
});

test("holding a movement key moves the player on screen", async ({ page }) => {
  const canvas = await startSoloMatch(page);

  // A still frame first. If the arena animated on its own, this control
  // would make the test below meaningless — so it is asserted, not
  // assumed.
  const idleBefore = await arenaShot(page, canvas);
  await page.waitForTimeout(700);
  const idleAfter = await arenaShot(page, canvas);
  expect(idleAfter.equals(idleBefore), "the idle arena should not animate").toBe(true);

  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  await page.waitForTimeout(300);

  const moved = await arenaShot(page, canvas);
  expect(moved.equals(idleAfter), "holding W should have moved the player").toBe(false);
});

test("releasing the movement key stops the player", async ({ page }) => {
  const canvas = await startSoloMatch(page);

  await page.keyboard.down("d");
  await page.waitForTimeout(400);
  await page.keyboard.up("d");
  // Give the stop intent time to reach the server and come back.
  await page.waitForTimeout(500);

  const stopped = await arenaShot(page, canvas);
  await page.waitForTimeout(700);
  const stillStopped = await arenaShot(page, canvas);

  expect(stillStopped.equals(stopped), "the player should stay put after key release").toBe(true);
});

test("activating a self-cast skill spends energy and applies its effect", async ({ page }) => {
  await startQuickMatch(page);

  // Slot 5 is a self-target enchantment, so it needs no target — which
  // makes it the one skill a solo player can honestly test.
  await expect(page.locator(".hud-statuses")).toContainText("no active effects");
  const before = await readEnergy(page);

  await page.keyboard.press("5");

  // The enchantment appearing is the server's word that the cast
  // resolved; energy alone could just be a client-side guess.
  await expect(page.locator(".hud-statuses")).not.toContainText("no active effects");
  expect(await readEnergy(page)).toBeLessThan(before);
});

test("a skill the player cannot afford is refused rather than cast", async ({ page }) => {
  await startQuickMatch(page);

  // Spam the bar. Every rejection must be safe: no crash, and energy must
  // never go negative, whatever the client asks for.
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press(String((i % 8) + 1));
  }
  await page.waitForTimeout(500);

  expect(await readEnergy(page)).toBeGreaterThanOrEqual(0);
  await expect(page.locator("#viewport canvas")).toBeVisible();
});

test("a refused cast says why, briefly, above the skill bar", async ({ page }) => {
  await startQuickMatch(page);
  const message = page.locator(".hud-message");
  await expect(message).not.toHaveClass(/is-visible/);

  // Slot 5 is a self-cast enchantment with a 15 s recharge: once it has
  // landed, pressing it again is refused whoever else is in the room.
  // Before issue #51 this key press did nothing at all.
  await page.keyboard.press("5");
  await expect(page.locator(".hud-statuses")).not.toContainText("no active effects");
  await page.keyboard.press("5");

  await expect(message).toHaveText("That skill is recharging.");
  await expect(message).toHaveClass(/is-visible/);
  // Gone again on its own, so it never becomes clutter.
  await expect(message).not.toHaveClass(/is-visible/, { timeout: 4000 });
});

test("an enemy skill with nothing targeted targets the nearest enemy", async ({
  browser,
  page,
}) => {
  // A lobby, not Quick Match: a Quick Match room holds at most eight, so
  // two players joining one after the other can land in different rooms
  // when earlier tests' ghosts fill one (#41).
  const opponent = await browser.newPage();
  await startLobbyMatch(page, [opponent]);
  const target = page.locator(".hud-target");
  await expect(target).toHaveText("no target");

  // Slot 1 is Fireball. Whether it is then in range or not, the target
  // stays picked.
  await page.keyboard.press("1");

  await expect(target).toHaveText(/^target: /);
  await opponent.close();
});

test("Tab targets the nearest enemy, and the hint goes for good (#55)", async ({
  browser,
  page,
}) => {
  // A lobby of two, for the reason the test above gives.
  const opponent = await browser.newPage();
  await startLobbyMatch(page, [opponent]);
  const hint = page.locator(".hud-hint");
  await expect(hint).toHaveText("Click an enemy or press Tab to target");
  await expect(hint).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.locator(".hud-target")).toHaveText(/^target: /);
  await expect(hint).toBeHidden();
  // The browser kept its focus where it was: Tab is the game's now.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

  // Cleared again, the hint stays gone.
  await page.locator("#viewport canvas").click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".hud-target")).toHaveText("no target");
  await expect(hint).toBeHidden();
  await opponent.close();
});

test("a recharging skill shows the clock-wipe and the seconds left, then clears (#152)", async ({
  page,
}) => {
  await startQuickMatch(page);

  // Slot 5 of the house bar is Armor of Earth: self-cast, so it needs no
  // target, and it recharges in 15 s.
  await page.keyboard.press("5");
  const slot = page.locator(".hud-skill").nth(4);
  const overlay = slot.locator(".recharge-overlay");
  await expect(overlay).toHaveCount(1);
  expect(Number(await overlay.locator(".recharge-seconds").textContent())).toBeGreaterThan(0);
  const recharge = await overlay.evaluate((node) => node.style.getPropertyValue("--recharge"));
  expect(Number(recharge)).toBeGreaterThan(0);
  // No other slot started recharging.
  await expect(page.locator(".hud-skill .recharge-overlay")).toHaveCount(1);

  await expect(overlay).toHaveCount(0, { timeout: 20_000 });
});

/** The page's WebSockets, oldest first, recorded by `recordSockets`. */
interface SocketLog {
  vibewarsSockets: WebSocket[];
}

/**
 * Record every WebSocket the page opens, so a test can cut one. Test-side
 * only: Playwright's routeWebSocket rejects the protocols argument the
 * Colyseus SDK passes, so the constructor is wrapped instead.
 */
async function recordSockets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = window as unknown as SocketLog;
    log.vibewarsSockets = [];
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        log.vibewarsSockets.push(this);
      }
    };
  });
}

test("a match lost for good returns to the menu and says why (#195)", async ({ page }) => {
  await recordSockets(page);
  const canvas = await startQuickMatch(page);

  // The match's socket is the newest. A plain close (1000) is neither a
  // code the SDK retries nor a consented leave: exactly what the SDK
  // reports once it has given up retrying.
  await page.evaluate(() => {
    (window as unknown as SocketLog).vibewarsSockets.at(-1)?.close(1000, "e2e: lost for good");
  });

  const notice = page.getByText("Lost the connection to the match.");
  await expect(notice).toBeVisible();
  await expect(page.getByRole("button", { name: "quick match" })).toBeVisible();
  await expect(canvas).toBeHidden();

  // A new match works, and the notice is gone with the menu.
  await startQuickMatch(page);
  await expect(notice).toHaveCount(0);
});
