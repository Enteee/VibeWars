import { readFileSync } from "node:fs";

import { expect, test, type Page, type Locator } from "@playwright/test";

import { projection } from "./camera.js";
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
  await page.addInitScript(() => {
    localStorage.setItem(
      "vibewars.music",
      JSON.stringify({ mode: "off", pinnedTrackId: null, musicVolume: 0.6, musicMuted: false }),
    );
  });
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

test("a quick match renders the arena and a populated HUD", async ({ page }) => {
  await startQuickMatch(page);

  await expect(page.locator(".hud-skills .hud-skill")).toHaveCount(8);
  await expect(page.locator(".hud-target")).toContainText("no target");
  expect(await readEnergy(page)).toBeGreaterThan(0);
});

test("hovering a slot shows its tooltip at the host's ranks, above the bar (#485)", async ({
  page,
}) => {
  await startQuickMatch(page);
  const slot = page.locator(".hud-skill", { hasText: "Fireball" });
  await slot.hover();
  const tip = page.locator(".skill-tip:visible");
  await expect(tip).toContainText("Fireball");
  await expect(tip).toContainText("Fire Magic");
  // The house loadout's Fire Magic 12, as the host resolved it; a client
  // describing the skill without its ranks would say 7.
  await expect(tip).toContainText("Deals 91 damage");
  const tipBox = await tip.boundingBox();
  const slotBox = await slot.boundingBox();
  expect((tipBox?.y ?? Infinity) + (tipBox?.height ?? 0)).toBeLessThanOrEqual(slotBox?.y ?? 0);

  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);
});

test("M mutes and unmutes the combat sounds", async ({ page }) => {
  await startQuickMatch(page);
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
  await startQuickMatch(page);

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
  await startQuickMatch(page);

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
  await startQuickMatch(page);
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

test("an enemy skill with nothing targeted targets the nearest enemy", async ({
  browser,
  page,
}) => {
  // A lobby, not Quick Match: a Quick Match room holds at most eight, so
  // two players joining one after the other can land in different rooms
  // when earlier tests' ghosts fill one (#41).
  const opponent = await browser.newPage();
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
  browser,
  page,
}) => {
  // A lobby of two, for the reason the test above gives.
  const opponent = await browser.newPage();
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

/** Where `world` is on the match's canvas, through its camera (#440). */
async function matchPoint(
  page: Page,
  canvas: Locator,
  world: { readonly x: number; readonly y: number },
): Promise<{ x: number; y: number }> {
  return (await projection(page.locator("#viewport"), canvas)).onCanvas(world);
}

/** A page screenshot of the arena round `world`, `half` canvas px each way. */
async function spotShot(
  page: Page,
  canvas: Locator,
  world: { readonly x: number; readonly y: number },
  half = 20,
): Promise<Buffer> {
  const at = (await projection(page.locator("#viewport"), canvas)).onPage(world);
  return page.screenshot({
    clip: { x: at.x - half, y: at.y - half, width: 2 * half, height: 2 * half },
  });
}

test("clicking the ground walks there, round a wall, and stops (#310)", async ({ page }) => {
  const canvas = await startSoloMatch(page);
  // Behind the top wall (x 440 to 464, y 0 to 260) from the first spawn, (80, 200).
  const goal = { x: 520, y: 150 };
  const empty = await spotShot(page, canvas, goal);

  await canvas.click({ position: await matchPoint(page, canvas, goal) });
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
  browser,
  page,
}) => {
  // A lobby of two, for the reason the tests above give.
  const opponent = await browser.newPage();
  const canvas = await startLobbyMatch(page, [opponent]);
  const target = page.locator(".hud-target-text");
  await page.keyboard.press("Tab");
  await expect(target).not.toHaveText("no target");
  const before = await readTargetHealth(page);

  // Open ground, short of the top wall and away from both spawns.
  await canvas.click({ position: await matchPoint(page, canvas, { x: 260, y: 120 }) });
  await page.waitForTimeout(300);
  await expect(target).not.toHaveText("no target");

  await page.keyboard.press(" ");
  await expect(page.locator(".hud-attacking")).toBeVisible();
  await expect.poll(() => readTargetHealth(page), { timeout: 20_000 }).toBeLessThan(before);
  await expect(target).not.toHaveText("no target");
  await opponent.close();
});

test("Esc cancels the attack; leaving the match is a button that asks first (#160)", async ({
  browser,
  page,
}) => {
  const opponent = await browser.newPage();
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

test("F10, Tab, Enter on yes leaves the match without a mouse (#221)", async ({
  browser,
  page,
}) => {
  const opponent = await browser.newPage();
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

test("F10 then Esc says no, and the attack goes on (#221)", async ({ browser, page }) => {
  const opponent = await browser.newPage();
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

test("Tab targets the nearest enemy, and the hint goes for good (#55)", async ({
  browser,
  page,
}) => {
  // A lobby of two, for the reason the test above gives.
  const opponent = await browser.newPage();
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
  await startQuickMatch(page);

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

test("the target panel shows the target's professions before its name (#281)", async ({
  browser,
  page,
}) => {
  // A fresh tab has no character, so the opponent plays the house
  // loadout: a warrior with no secondary.
  const opponent = await browser.newPage();
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

test("at Close, the arena's bottom edge stops above the skill bar, not under it (#440)", async ({
  page,
}) => {
  const arena = JSON.parse(
    readFileSync(
      new URL("../packages/game-maps/maps/arena-alpha/map.json", import.meta.url),
      "utf8",
    ),
  ) as { readonly height: number };
  await page.goto("/");
  await page.getByRole("button", { name: "host a lobby" }).click();
  await expect(page.locator(".lobby-map select")).toHaveValue("arena-alpha");
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  const stage = page.locator("#viewport");
  const canvas = page.locator("#viewport canvas");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }

  // The pointer at the centre leans the camera nowhere.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const _ of [1, 2]) {
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -100);
  }
  await expect(stage).toHaveAttribute("data-zoom-step", "Close");

  // Down until the camera stops: you are at the bottom wall.
  await page.keyboard.down(key("move-down"));
  let last = "";
  await expect
    .poll(
      async () => {
        const now = (await stage.getAttribute("data-camera")) ?? "";
        const stopped = now === last;
        last = now;
        return stopped;
      },
      { intervals: [500], timeout: 15_000 },
    )
    .toBe(true);
  await page.keyboard.up(key("move-down"));

  const edge = (await projection(stage, canvas)).onPage({ x: 0, y: arena.height }).y;
  const bars = await page.locator(".hud-bars").boundingBox();
  expect(Math.abs(edge - (bars?.y ?? 0))).toBeLessThan(2);
});

test("the target frame shows the target's health and the skill it casts, filling, then clears (#484)", async ({
  browser,
  page,
}) => {
  const opponent = await browser.newPage();
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
