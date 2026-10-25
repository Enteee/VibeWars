import { expect, test, type Page, type Locator } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { key, skillKey } from "./keys.js";

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
 * No music: the now-playing toast (#372) shows over the arena for a few
 * seconds at a match start, so one frame would have it and the next not.
 * Music has its own spec.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ mode: "off", pinnedTrackId: null, musicVolume: 0.6, musicMuted: false }),
    );
  }, `${STORAGE_NAMESPACE}.music`);
});

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
      page.locator(".hud-music"),
      page.locator(".hud-leave"),
    ],
  });
}

/**
 * A match in a lobby of one, which is what a test with nobody to fight
 * needs: nothing moves in it that the test did not move (#128).
 */
async function startSoloMatch(page: Page): Promise<Locator> {
  return startLobbyMatch(page, []);
}

/**
 * A lobby match: `host` on team 1, every guest on team 2. The host's
 * arena canvas, once everyone is in.
 */
async function startLobbyMatch(host: Page, guests: readonly Page[]): Promise<Locator> {
  await host.goto("./");
  await host.getByRole("button", { name: "host a lobby" }).click();
  await expect(host.locator(".lobby-code")).toHaveText(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  const code = (await host.locator(".lobby-code").textContent())?.trim() ?? "";
  for (const guest of guests) {
    await guest.goto("./");
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

/** Leave by the button, which leaves for good: a closed page is held for its reconnection. */
async function leaveMatch(page: Page): Promise<void> {
  const leave = page.locator(".hud-leave");
  await leave.getByRole("button", { name: "leave match" }).click();
  await leave.getByRole("button", { name: "yes" }).click();
  await expect(page.locator(".hud-bar-health")).toHaveCount(0);
}

/** Energy as the HUD reports it, e.g. "50 / 50 en" -> 50. */
async function readEnergy(page: Page): Promise<number> {
  const text = (await page.locator(".hud-bar-energy .hud-bar-label").textContent()) ?? "";
  const match = /^(\d+)\s*\//.exec(text.trim());
  expect(match, `could not read energy from ${JSON.stringify(text)}`).not.toBeNull();
  return Number(match?.[1] ?? NaN);
}

test("a match renders the arena and a populated HUD", async ({ page }) => {
  await startSoloMatch(page);

  await expect(page.locator(".hud-skills .hud-skill")).toHaveCount(8);
  await expect(page.locator(".hud-target")).toContainText("no target");
  expect(await readEnergy(page)).toBeGreaterThan(0);
});

test("M mutes and unmutes the combat sounds", async ({ page }) => {
  await startSoloMatch(page);
  const mute = page.getByRole("button", { name: "Mute sounds" });
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(key("mute"));
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(key("mute"));
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

  await page.keyboard.down(key("move-up"));
  await page.waitForTimeout(700);
  await page.keyboard.up(key("move-up"));
  await page.waitForTimeout(300);

  const moved = await arenaShot(page, canvas);
  expect(moved.equals(idleAfter), "holding the up arrow should have moved the player").toBe(false);
});

test("the arrows move; A, once move-left, casts slot 5 and moves nobody (#302)", async ({
  page,
}) => {
  const canvas = await startSoloMatch(page);
  await expect(page.locator(".hud-skill-key").first()).toHaveText("Q");
  expect(key("skill-5")).toBe("KeyA");

  // Slot 5 of the house bar is a self-cast enchantment. Held, A casts it
  // once, and the player stays where they are while it is held.
  await page.keyboard.down("a");
  await expect(page.locator(".hud-statuses")).not.toContainText("no active effects");
  const held = await arenaShot(page, canvas);
  await page.waitForTimeout(500);
  expect((await arenaShot(page, canvas)).equals(held), "A should not move the player").toBe(true);
  await page.keyboard.up("a");

  await page.keyboard.down(key("move-right"));
  await page.waitForTimeout(500);
  await page.keyboard.up(key("move-right"));
  await page.waitForTimeout(300);
  expect((await arenaShot(page, canvas)).equals(held), "the right arrow should move").toBe(false);
});

test("closing the tab mid-match asks first, as Ctrl+W would (#302)", async ({ page }) => {
  await startSoloMatch(page);
  // A browser only asks a page the player has touched.
  await page.keyboard.press(key("move-right"));
  const asked = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await asked;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
});

test("releasing the movement key stops the player", async ({ page }) => {
  const canvas = await startSoloMatch(page);

  await page.keyboard.down(key("move-right"));
  await page.waitForTimeout(400);
  await page.keyboard.up(key("move-right"));
  // Give the stop intent time to reach the server and come back.
  await page.waitForTimeout(500);

  const stopped = await arenaShot(page, canvas);
  await page.waitForTimeout(700);
  const stillStopped = await arenaShot(page, canvas);

  expect(stillStopped.equals(stopped), "the player should stay put after key release").toBe(true);
});

test("activating a self-cast skill spends energy and applies its effect", async ({ page }) => {
  await startSoloMatch(page);

  // Slot 5 is a self-target enchantment, so it needs no target — which
  // makes it the one skill a solo player can honestly test.
  await expect(page.locator(".hud-statuses")).toContainText("no active effects");
  const before = await readEnergy(page);

  await page.keyboard.press(key("skill-5"));

  // The enchantment appearing is the server's word that the cast
  // resolved; energy alone could just be a client-side guess.
  await expect(page.locator(".hud-statuses")).not.toContainText("no active effects");
  expect(await readEnergy(page)).toBeLessThan(before);
});

test("a skill the player cannot afford is refused rather than cast", async ({ page }) => {
  await startSoloMatch(page);

  // Spam the bar. Every rejection must be safe: no crash, and energy must
  // never go negative, whatever the client asks for.
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press(skillKey(i % 8));
  }
  await page.waitForTimeout(500);

  expect(await readEnergy(page)).toBeGreaterThanOrEqual(0);
  await expect(page.locator("#viewport canvas")).toBeVisible();
});

test("a refused cast says why, briefly, above the skill bar", async ({ page }) => {
  await startSoloMatch(page);
  const message = page.locator(".hud-message");
  await expect(message).not.toHaveClass(/is-visible/);

  // Slot 5 is a self-cast enchantment with a 15 s recharge: once it has
  // landed, pressing it again is refused whoever else is in the room.
  // Before issue #51 this key press did nothing at all.
  await page.keyboard.press(key("skill-5"));
  await expect(page.locator(".hud-statuses")).not.toContainText("no active effects");
  await page.keyboard.press(key("skill-5"));

  await expect(message).toHaveText("That skill is recharging.");
  await expect(message).toHaveClass(/is-visible/);
  // Gone again on its own, so it never becomes clutter.
  await expect(message).not.toHaveClass(/is-visible/, { timeout: 4000 });
});

test("an enemy skill with nothing targeted targets the nearest enemy", async ({ page }) => {
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  const target = page.locator(".hud-target-text");
  await expect(target).toHaveText("no target");

  // Slot 1 is Fireball. Whether it is then in range or not, the target
  // stays picked.
  await page.keyboard.press(key("skill-1"));

  await expect(target).not.toHaveText("no target");
  await opponent.close();
});

/** A foe's health as the target frame says it, in percent, e.g. "85%" -> 85 (#484). */
async function readTargetHealth(page: Page): Promise<number> {
  const text = (await page.locator(".hud-target-health .hud-bar-label").textContent()) ?? "";
  const match = /^(\d+)%/.exec(text);
  expect(match, `could not read target health from ${JSON.stringify(text)}`).not.toBeNull();
  return Number(match?.[1] ?? NaN);
}

test("Space attacks the nearest enemy with the weapon, and moving stops it (#160)", async ({
  page,
}) => {
  // A lobby of two, for the reason the test above gives.
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  const attacking = page.locator(".hud-attacking");
  await expect(attacking).toBeHidden();

  // Nothing targeted: Space picks the nearest enemy, as an enemy skill does.
  await page.keyboard.press(key("attack"));
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
  await expect(attacking).toBeVisible();
  await expect(attacking).toHaveText("attacking");
  const before = await readTargetHealth(page);

  // The attacker walks into reach and swings; the target gets hurt.
  await expect.poll(() => readTargetHealth(page), { timeout: 20_000 }).toBeLessThan(before);

  await page.keyboard.press(key("move-up"));
  await expect(attacking).toBeHidden();
  await opponent.close();
});

/**
 * A page screenshot of the arena round `world`, `half` units each way.
 * One world unit is one canvas pixel (arena-viewport.ts), so a world point
 * is the canvas's own offset plus itself.
 */
async function spotShot(
  page: Page,
  canvas: Locator,
  world: { readonly x: number; readonly y: number },
  half = 20,
): Promise<Buffer> {
  const box = await canvas.boundingBox();
  expect(box, "the arena canvas has no box").not.toBeNull();
  return page.screenshot({
    clip: {
      x: (box?.x ?? 0) + world.x - half,
      y: (box?.y ?? 0) + world.y - half,
      width: 2 * half,
      height: 2 * half,
    },
  });
}

test("clicking the ground walks there, round a wall, and stops (#310)", async ({ page }) => {
  const canvas = await startSoloMatch(page);
  // Behind the top wall (x 440 to 464, y 0 to 260) from the first spawn, (80, 200).
  const goal = { x: 520, y: 150 };
  const empty = await spotShot(page, canvas, goal);

  await canvas.click({ position: goal });
  // The marker there fades in 0.4 s; the walk round the wall takes about 3 s.
  await page.waitForTimeout(600);
  await expect
    .poll(async () => (await spotShot(page, canvas, goal)).equals(empty), { timeout: 10_000 })
    .toBe(false);

  // Arrived, it stays.
  await page.waitForTimeout(600);
  const there = await spotShot(page, canvas, goal);
  await page.waitForTimeout(700);
  expect((await spotShot(page, canvas, goal)).equals(there), "the hero should stop there").toBe(
    true,
  );
});

test("clicking the ground keeps the target, and Space attacks it from there (#310)", async ({
  page,
}) => {
  // A lobby of two, for the reason the tests above give.
  const opponent = await page.context().newPage();
  const canvas = await startLobbyMatch(page, [opponent]);
  const target = page.locator(".hud-target-text");
  await page.keyboard.press("Tab");
  await expect(target).not.toHaveText("no target");
  const before = await readTargetHealth(page);

  // Open ground, short of the top wall and away from both spawns.
  await canvas.click({ position: { x: 260, y: 120 } });
  await page.waitForTimeout(300);
  await expect(target).not.toHaveText("no target");

  await page.keyboard.press(" ");
  await expect(page.locator(".hud-attacking")).toBeVisible();
  await expect.poll(() => readTargetHealth(page), { timeout: 20_000 }).toBeLessThan(before);
  await expect(target).not.toHaveText("no target");
  await opponent.close();
});

test("Esc cancels the attack; leaving the match is a button that asks first (#160)", async ({
  page,
}) => {
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  const attacking = page.locator(".hud-attacking");

  await page.keyboard.press(key("attack"));
  await expect(attacking).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(attacking).toBeHidden();
  // Esc no longer leaves: still in the match.
  await expect(page.locator(".hud-bar-health")).toBeVisible();

  const leave = page.locator(".hud-leave");
  await leave.getByRole("button", { name: "leave match" }).click();
  await expect(leave).toContainText("leave?");
  await leave.getByRole("button", { name: "no" }).click();
  await expect(leave.getByRole("button", { name: "leave match" })).toBeVisible();

  await leave.getByRole("button", { name: "leave match" }).click();
  await leave.getByRole("button", { name: "yes" }).click();
  await expect(page.locator(".hud-bar-health")).toHaveCount(0);
  await opponent.close();
});

test("F10, Tab, Enter on yes leaves the match without a mouse (#221)", async ({ page }) => {
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  await expect(page.locator("#status")).toHaveText("in match");
  const leave = page.locator(".hud-leave");

  await page.keyboard.press("F10");
  await expect(leave).toContainText("leave?");
  // Focus starts on "no", so a stray Enter would only close the question.
  await expect(leave.getByRole("button", { name: "no" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(leave.getByRole("button", { name: "yes" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".hud-bar-health")).toHaveCount(0);
  await opponent.close();
});

test("F10 then Esc says no, and the attack goes on (#221)", async ({ page }) => {
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  await expect(page.locator("#status")).toHaveText("in match");
  const attacking = page.locator(".hud-attacking");
  const leave = page.locator(".hud-leave");

  await page.keyboard.press(key("attack"));
  await expect(attacking).toBeVisible();
  await page.keyboard.press("F10");
  await expect(leave).toContainText("leave?");
  // Asking, keys answer the question: Tab stays between yes and no.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(leave.getByRole("button", { name: "no" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(leave.getByRole("button", { name: "leave match (F10)" })).toBeVisible();
  await expect(page.locator(".hud-bar-health")).toBeVisible();
  // Esc answered the question; it did not also cancel the attack.
  await expect(attacking).toBeVisible();
  await opponent.close();
});

test("Tab targets the nearest enemy, and the hint goes for good (#55)", async ({ page }) => {
  // A lobby of two, for the reason the test above gives.
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  const hint = page.locator(".hud-hint");
  await expect(hint).toHaveText("Click an enemy or press Tab to target · hold Shift for names");
  await expect(hint).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
  await expect(hint).toBeHidden();
  // The browser kept its focus where it was: Tab is the game's now.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

  // Cleared again, when the target leaves, the hint stays gone.
  await leaveMatch(opponent);
  await expect(page.locator(".hud-target-text")).toHaveText("no target");
  await expect(hint).toBeHidden();
  await opponent.close();
});

test("a recharging skill shows the clock-wipe and the seconds left, then clears (#152)", async ({
  page,
}) => {
  await startSoloMatch(page);

  // Slot 5 of the house bar is Armor of Earth: self-cast, so it needs no
  // target, and it recharges in 15 s.
  await page.keyboard.press(key("skill-5"));
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

test("a match whose host goes returns to the menu and says why (#195)", async ({ page }) => {
  // The guest's side: the host's page closes mid-match, which ends the
  // match and the lobby with it (#403).
  const host = await page.context().newPage();
  await startLobbyMatch(host, [page]);
  const canvas = page.locator("#viewport canvas");

  await host.close();

  const notice = page.getByText("The host closed the lobby.");
  await expect(notice).toBeVisible();
  await expect(page.getByRole("button", { name: "host a lobby" })).toBeVisible();
  await expect(canvas).toBeHidden();

  // A new match works, and the notice is gone with the menu.
  await startSoloMatch(page);
  await expect(notice).toHaveCount(0);
});

test("the target panel shows the target's professions before its name (#281)", async ({ page }) => {
  // A fresh tab has no character, so the opponent plays the house
  // loadout: a warrior with no secondary.
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  const icons = page.locator(".hud-target-professions img");
  await expect(icons).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
  await expect(icons).toHaveCount(1);
  await expect(icons.first()).toHaveAttribute("alt", "Warrior");
  await expect(icons.first()).toHaveAttribute("src", /icons\/profession\/warrior\.svg$/);

  // Gone with the target, when it leaves.
  await leaveMatch(opponent);
  await expect(icons).toHaveCount(0);
  await opponent.close();
});

test("the target frame shows the target's health and the skill it casts, filling, then clears (#484)", async ({
  page,
}) => {
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  const health = page.locator(".hud-target-health");
  const cast = page.locator(".hud-target-cast");
  await expect(health).toBeHidden();
  await expect(cast).toBeHidden();

  // A foe at full health: the percentage alone.
  await page.keyboard.press("Tab");
  await expect(health).toHaveText("100%");
  await expect(cast).toBeHidden();

  // Slot 8 is Troll Unguent: a 3 s self cast, so it needs no target.
  await opponent.keyboard.press(key("skill-8"));
  await expect(cast).toBeVisible();
  await expect(cast.locator(".hud-target-cast-name")).toHaveText("Troll Unguent");
  await expect(cast.locator(".skill-type-badge")).toHaveCount(1);
  const fill = cast.locator(".hud-target-cast-fill");
  const width = (): Promise<number> => fill.evaluate((node) => node.getBoundingClientRect().width);
  const early = await width();
  await expect.poll(width).toBeGreaterThan(early);

  // The frame it ends, the row clears.
  await expect(cast).toBeHidden({ timeout: 5_000 });
  await opponent.close();
});
