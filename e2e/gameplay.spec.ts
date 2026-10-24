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
    mask: [page.locator(".hud"), page.locator(".hud-scoreboard"), page.locator(".hud-result")],
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

test("holding a movement key moves the player on screen", async ({ page }) => {
  const canvas = await startQuickMatch(page);

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
  const canvas = await startQuickMatch(page);

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
  // Teams alternate by join order, so whoever joins just before us is an
  // enemy: there is at least one, whatever earlier tests left behind.
  const opponent = await browser.newPage();
  await startQuickMatch(opponent);
  await startQuickMatch(page);
  const target = page.locator(".hud-target");
  await expect(target).toHaveText("no target");

  // Slot 1 is Fireball. Whether it is then in range or not, the target
  // stays picked.
  await page.keyboard.press("1");

  await expect(target).toHaveText(/^target: /);
  await opponent.close();
});
