import { readFileSync } from "node:fs";

import { expect, test, type Page, type Locator } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { projection } from "./camera.js";
import { key, skillKey } from "./keys.js";
import { joinFriend } from "./helpers/menu.js";
import {
  hostLobby,
  playHouseTeams,
  playOwnTeams,
  saveSoloTeam,
  startSoloMatch as startMatchFromMenu,
} from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";

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
      page.locator(".hud-top"),
      page.locator(".hud-result"),
      page.locator(".hud-controls"),
    ],
  });
}

/**
 * The arena once two shots in a row match, so a frame is not taken
 * mid-animation, such as inside a cast's impact glow (#1139). Bounded: a
 * scene that never settles fails here.
 */
async function settledArenaShot(page: Page, canvas: Locator): Promise<Buffer> {
  let last = await arenaShot(page, canvas);
  await expect
    .poll(
      async () => {
        const next = await arenaShot(page, canvas);
        const same = next.equals(last);
        last = next;
        return same;
      },
      { timeout: 3_000, message: "the arena should settle" },
    )
    .toBe(true);
  return last;
}

/**
 * A match against an idle player, which is what a test with nobody to
 * fight needs: nothing moves in it that the test did not move (#128). Not
 * a lobby of one: its empty side would play a bot (#2029).
 */
async function startSoloMatch(page: Page): Promise<Locator> {
  return startLobbyMatch(page, [await page.context().newPage()]);
}

/**
 * A lobby match: `host` on team 1, every guest on team 2. The host's
 * arena canvas, once everyone is in.
 */
async function startLobbyMatch(
  host: Page,
  guests: readonly Page[],
  build = "Elementalist/Mesmer",
): Promise<Locator> {
  // A known bar (#852), played through a Team Build of one (#1525). The
  // pages of a test share one storage, so the guests propose and play it
  // too: a side of one each, as a build of one needs.
  await bringStarter(host, build);
  const team = await saveSoloTeam(host);
  const invite = await hostLobby(host);
  for (const guest of guests) {
    await guest.goto("./");
    await joinFriend(guest, invite);
    await guest.getByRole("button", { name: "join team 2" }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
  }
  await host.getByRole("button", { name: "join team 1" }).click();
  await host.getByRole("button", { name: "Ready", exact: true }).click();
  await host.getByRole("button", { name: "start match" }).click();
  await playOwnTeams([host, ...guests].map((page) => ({ page, team })));
  // The last page opened is the tab in front, and a tab behind it can go
  // full screen no more than a person can see it (#2012).
  await host.bringToFront();
  return host.locator("#viewport canvas:not(.compass)");
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
  await page.setViewportSize({ width: 1280, height: 720 });
  await startSoloMatch(page);

  await expect(page.locator(".hud-skills .hud-skill")).toHaveCount(8);
  await expect(page.locator(".hud-target")).toContainText("no target");
  expect(await readEnergy(page)).toBeGreaterThan(0);
  // The bar is as wide as its slots, so a knockdown drain over it ends at
  // the last one, not out over the floor (#545).
  const bar = await page.locator(".hud-skills").boundingBox();
  const last = await page.locator(".hud-skills .hud-skill").last().boundingBox();
  expect(bar !== null && last !== null && bar.x + bar.width - (last.x + last.width)).toBeLessThan(
    2,
  );

  // Laid out as GW1 (#1042): the target frame top centre under the
  // scoreboard, your bars and skill bar bottom centre, health over energy.
  const box = async (
    selector: string,
  ): Promise<{ x: number; y: number; width: number; height: number }> => {
    const found = await page.locator(selector).boundingBox();
    if (found === null) {
      throw new Error(`${selector} has no box`);
    }
    return found;
  };
  const centre = (of: { x: number; width: number }): number => of.x + of.width / 2;
  const target = await box(".hud-target");
  const scoreboard = await box(".hud-scoreboard");
  expect(Math.abs(centre(target) - 640)).toBeLessThan(2);
  expect(target.y).toBeGreaterThan(scoreboard.y + scoreboard.height);
  expect(target.y).toBeLessThan(720 * 0.3);
  const skills = await box(".hud-skills");
  expect(Math.abs(centre(skills) - 640)).toBeLessThan(2);
  expect(720 - (skills.y + skills.height)).toBeLessThan(1.5 * 16);
  const health = await box(".hud-bar-health");
  const energy = await box(".hud-bar-energy");
  expect(health.y + health.height).toBeLessThanOrEqual(energy.y);
  expect(energy.y + energy.height).toBeLessThanOrEqual(skills.y);
  expect(Math.abs(health.width - skills.width)).toBeLessThan(2);
  expect(Math.abs(energy.width - skills.width)).toBeLessThan(2);
  // The compass (#1056): top right, under the match buttons.
  await expect(page.locator(".compass")).toBeVisible();
  const compass = await box(".compass");
  const controls = await box(".hud-controls");
  expect(compass.y).toBeGreaterThan(controls.y + controls.height);
  expect(1280 - (compass.x + compass.width)).toBeLessThan(30);
});

test("hovering a slot shows its tooltip at the host's ranks, above the bar (#485)", async ({
  page,
}) => {
  await startSoloMatch(page);
  // Found by name: the bar shows the icon alone (#719).
  const slot = page.locator(".hud-skills").getByRole("button", { name: "Fireball", exact: true });
  await expect(slot.locator(".skill-icon")).toBeVisible();
  await expect(slot.locator(".hud-skill-name")).toHaveCount(0);
  await slot.hover();
  const tip = page.locator(".skill-tip:visible");
  // The tooltip leads with the icon, then the name and the cost.
  await expect(tip.locator(".tip-header .skill-icon")).toBeVisible();
  await expect(tip).toContainText("Fireball");
  await expect(tip).toContainText("cost");
  await expect(tip).toContainText("Fire Magic");
  // The Elementalist/Mesmer's Fire Magic 12, its minor rune and its
  // headgear, 14, as the host resolved it; a client describing the skill
  // without its ranks would say 7.
  await expect(tip).toContainText("Deals 105 fire damage");
  const tipBox = await tip.boundingBox();
  const slotBox = await slot.boundingBox();
  expect((tipBox?.y ?? Infinity) + (tipBox?.height ?? 0)).toBeLessThanOrEqual(slotBox?.y ?? 0);

  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);
});

test("#2012: in full screen, hovering a slot still shows its tooltip", async ({ page }) => {
  await startSoloMatch(page);
  await page.locator(".hud-fullscreen").click();
  // The whole document, so the tooltip hung off <body> is in the top layer.
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement))
    .toBe(true);
  await page.locator(".hud-skills").getByRole("button", { name: "Fireball", exact: true }).hover();
  const tip = page.locator(".skill-tip");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Fireball");
  // toBeVisible alone passed with the bug: only the fullscreen element's
  // subtree is drawn, and the tip was outside it.
  expect(await tip.evaluate((node) => document.fullscreenElement?.contains(node))).toBe(true);
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

  // Slot 5 is Armor of Earth, a self-cast enchantment. Held, A casts it
  // once, and the player stays where they are while it is held.
  await page.keyboard.down("a");
  await expect(
    page.getByRole("list", { name: "your effects" }).getByRole("listitem"),
  ).not.toHaveCount(0);
  // The cast's impact glow (#1139) is still playing here; wait it out.
  const held = await settledArenaShot(page, canvas);
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
  await expect(page.getByRole("list", { name: "your effects" }).getByRole("listitem")).toHaveCount(
    0,
  );
  const before = await readEnergy(page);

  await page.keyboard.press(key("skill-5"));

  // The enchantment appearing is the host's word that the cast
  // resolved; energy alone could just be a client-side guess. Named, so a
  // status decoded from the wrong index (#632) fails here.
  await expect(
    page.getByRole("list", { name: "your effects" }).getByRole("img", { name: "Armor Boost" }),
  ).toBeVisible();
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
  await expect(page.locator("#viewport canvas:not(.compass)")).toBeVisible();
});

test("a refused cast says why, briefly, above the skill bar", async ({ page }) => {
  await startSoloMatch(page);
  const message = page.locator(".hud-message");
  await expect(message).not.toHaveClass(/is-visible/);

  // Slot 5 is a self-cast enchantment with a 15 s recharge: once it has
  // landed, pressing it again is refused whoever else is in the room.
  // Before issue #51 this key press did nothing at all.
  await page.keyboard.press(key("skill-5"));
  await expect(
    page.getByRole("list", { name: "your effects" }).getByRole("listitem"),
  ).not.toHaveCount(0);
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

  // Arrived, it stays. The view follows the walk (#721), so the spot
  // holds still only once the hero, and the camera with it, does.
  let there = await spotShot(page, canvas, goal);
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(700);
        const now = await spotShot(page, canvas, goal);
        const still = now.equals(there);
        there = now;
        return still;
      },
      { message: "the hero should stop there", intervals: [0], timeout: 15_000 },
    )
    .toBe(true);
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
  // The HUD, which comes with the match view and its keys (#454: no "in match").
  await expect(page.locator(".hud-leave")).toBeVisible();
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
  // The HUD, which comes with the match view and its keys (#454: no "in match").
  await expect(page.locator(".hud-leave")).toBeVisible();
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

test("Tab targets the nearest enemy (#55)", async ({ page }) => {
  // A lobby of two, for the reason the test above gives.
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  const target = page.locator(".hud-target-text");
  await expect(target).toHaveText("no target");

  await page.keyboard.press("Tab");
  await expect(target).not.toHaveText("no target");
  // The browser kept its focus where it was: Tab is the game's now.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

  // Cleared again when the target leaves.
  await leaveMatch(opponent);
  await expect(target).toHaveText("no target");
  await opponent.close();
});

test("a recharging skill shows the clock-wipe and the seconds left, then clears (#152)", async ({
  page,
}) => {
  await startSoloMatch(page);

  // Slot 5 is Armor of Earth: self-cast, so it needs no
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
  const canvas = page.locator("#viewport canvas:not(.compass)");

  // A navigation fires pagehide, as a closed tab does in a browser; Playwright's
  // page.close() does not run unload handlers, so it skips it (#1085).
  await host.goto("about:blank");

  const notice = page.getByText("The host closed the lobby.");
  await expect(notice).toBeVisible();
  await expect(page.locator(".mode-rail")).toBeVisible();
  await expect(canvas).toBeHidden();

  // A new match works, and the notice is gone with the menu. From the
  // menu on show: the starter is already picked, and bringing it again
  // would save a second one. Its Team Build of one is saved again, under
  // the same name, which proposes the same.
  await startMatchFromMenu(page);
  await expect(notice).toHaveCount(0);
  await host.close();
});

test("the target panel shows the target's professions before its name (#281)", async ({ page }) => {
  // The opponent plays the Elementalist/Mesmer starter build.
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  const icons = page.locator(".hud-target-professions img");
  await expect(icons).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
  // The professions, then the weapon it carries (#419).
  await expect(icons).toHaveCount(3);
  await expect(icons.first()).toHaveAttribute("alt", "Elementalist");
  await expect(icons.first()).toHaveAttribute("src", /icons\/profession\/elementalist\.svg$/);
  await expect(icons.nth(1)).toHaveAttribute("alt", "Mesmer");
  await expect(icons.nth(2)).toHaveAttribute("src", /icons\/weapon\/[a-z-]+\.svg$/);

  // Gone with the target, when it leaves.
  await leaveMatch(opponent);
  await expect(icons).toHaveCount(0);
  await opponent.close();
});

test("at the arena's bottom edge, an RMB drag down looks past it, and springs back (#721)", async ({
  page,
}) => {
  const arena = JSON.parse(
    readFileSync(
      new URL("../packages/game-maps/maps/arena-alpha/map.json", import.meta.url),
      "utf8",
    ),
  ) as { readonly height: number };
  await page.goto("./");
  await hostLobby(page);
  await expect(page.locator(".lobby-map select")).toHaveValue("arena-alpha");
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  // Any character will do: the house team's one seat (#1525).
  await playHouseTeams([page]);
  const stage = page.locator("#viewport");
  const canvas = page.locator("#viewport canvas:not(.compass)");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }

  // Over the canvas, for the wheel.
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

  const cameraY = async (): Promise<number> =>
    Number(((await stage.getAttribute("data-camera")) ?? "").split(",")[1]);
  const { zoom } = await projection(stage, canvas);
  const atWall = await cameraY();

  // Not clamped to the map: the view centre goes below the arena, 200 px on.
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y - 200);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(centre.x, centre.y - 100, { steps: 5 });
  await page.mouse.move(centre.x, centre.y, { steps: 5 });
  const panned = atWall + 200 / zoom;
  await expect.poll(cameraY).toBeGreaterThan(panned - 3);
  expect(await cameraY()).toBeLessThan(panned + 3);
  expect(panned).toBeGreaterThan(arena.height);

  // Let go: the view is on you again. RETURN_RATE (7/s)
  // brings it within 3 px in about 0.65 s; a loaded runner needs more than
  // 1 s to see it, and a pan that never returns still fails at 2 s (#876).
  await page.mouse.up({ button: "right" });
  await expect.poll(cameraY, { timeout: 2_000 }).toBeLessThan(atWall + 3);
  expect(await cameraY()).toBeGreaterThan(atWall - 3);
});

test("the target frame shows the target's health and the skill it casts, filling, then clears (#484)", async ({
  page,
}) => {
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent], "Ranger/Mesmer");
  const health = page.locator(".hud-target-health");
  const cast = page.locator(".hud-target-cast");
  await expect(health).toBeHidden();
  await expect(cast).toBeHidden();

  // A foe at full health: the percentage alone.
  await page.keyboard.press("Tab");
  await expect(health).toHaveText("100%");
  await expect(cast).toBeHidden();

  // Troll Unguent: a 3 s self cast, so it needs no target.
  await opponent.keyboard.press(starterKey("Ranger/Mesmer", "ranger.troll-unguent"));
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

test("the HUD's energy bar shows its regeneration as arrows (#504)", async ({ page }) => {
  await startSoloMatch(page);
  // The Elementalist/Mesmer starter build: an Elementalist's 4 pips.
  await expect(page.locator(".hud-bar-energy .vital-pips")).toHaveText("››››");
  await expect(page.locator(".hud-bar-health .vital-pips")).toBeHidden();
});

test("an RMB drag pans; a left click then walks to the panned point; letting go comes back (#442)", async ({
  page,
}) => {
  // Narrow and tall, so the arena is wider than the view and the pan has
  // room: every arena today fits a 16:9 window's view across.
  await page.setViewportSize({ width: 600, height: 900 });
  const canvas = await startSoloMatch(page);
  const stage = page.locator("#viewport");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cameraX = async (): Promise<number> =>
    Number(((await stage.getAttribute("data-camera")) ?? "").split(",")[0]);

  // Over the canvas, for the wheel; then Close.
  await page.mouse.move(centre.x, centre.y);
  for (const _ of [1, 2]) {
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -100);
  }
  await expect(stage).toHaveAttribute("data-zoom-step", "Close");
  // Right, to the middle of arena-alpha (960 wide), clear of its edges.
  await page.keyboard.down(key("move-right"));
  await expect.poll(cameraX, { timeout: 15_000 }).toBeGreaterThan(400);
  await page.keyboard.up(key("move-right"));
  let last = NaN;
  await expect
    .poll(
      async () => {
        const now = await cameraX();
        const settled = now === last;
        last = now;
        return settled;
      },
      { intervals: [300] },
    )
    .toBe(true);
  const { zoom } = await projection(stage, canvas);
  const before = await cameraX();

  // Hold RMB and drag 100 px right: the view looks right by 100 px.
  await page.mouse.down({ button: "right" });
  await page.mouse.move(centre.x + 50, centre.y, { steps: 5 });
  await page.mouse.move(centre.x + 100, centre.y, { steps: 5 });
  const panned = before + 100 / zoom;
  await expect.poll(cameraX).toBeGreaterThan(panned - 3);
  expect(await cameraX()).toBeLessThan(panned + 3);

  // RMB still held, a left click walks to the point under the pointer,
  // 100 px right of the panned centre; the view keeps its offset from you.
  const goal = panned + 100 / zoom;
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await expect.poll(cameraX, { timeout: 10_000 }).toBeGreaterThan(goal + 100 / zoom - 3);

  // Let go, the pointer back at the centre: the view is on you, at the goal, within 1 s.
  await page.mouse.up({ button: "right" });
  await page.mouse.move(centre.x, centre.y);
  await expect.poll(cameraX, { timeout: 1_000 }).toBeLessThan(goal + 5);
  expect(await cameraX()).toBeGreaterThan(goal - 5);
});

test("a wheel click on a foe calls it for your team, and the other team never sees it (#443)", async ({
  page,
}) => {
  const arena = JSON.parse(
    readFileSync(
      new URL("../packages/game-maps/maps/arena-alpha/map.json", import.meta.url),
      "utf8",
    ),
  ) as {
    readonly spawnPoints: readonly {
      readonly team: number;
      readonly position: { readonly x: number; readonly y: number };
    }[];
  };
  const foeSpawn = arena.spawnPoints.find((spawn) => spawn.team === 1)?.position;
  if (foeSpawn === undefined) {
    throw new Error("arena-alpha has no team 1 spawn");
  }
  const opponent = await page.context().newPage();
  const canvas = await startLobbyMatch(page, [opponent]);
  const stage = page.locator("#viewport");
  await expect(stage).toHaveAttribute("data-called", "");

  // The opponent stands on team 1's first spawn.
  const foe = (await projection(stage, canvas)).onPage(foeSpawn);
  await page.mouse.click(foe.x, foe.y, { button: "middle" });
  await expect(stage).toHaveAttribute("data-called", /^\S+$/);
  // The called side hears nothing of it.
  await page.waitForTimeout(500);
  await expect(opponent.locator("#viewport")).toHaveAttribute("data-called", "");
  await opponent.close();
});

test("⚙ opens Options over the match: Esc closes it, and the attack and the match go on (#454)", async ({
  page,
}) => {
  // A lobby of two, so there is an attack to keep going.
  const opponent = await page.context().newPage();
  await startLobbyMatch(page, [opponent]);
  // The top bar gives the match its height; the HUD has its buttons.
  await expect(page.locator("#topbar")).toBeHidden();
  const attacking = page.locator(".hud-attacking");
  await page.keyboard.press(key("attack"));
  await expect(attacking).toBeVisible();

  const clock = page.locator(".hud-scoreboard");
  const before = (await clock.textContent()) ?? "";
  await page.locator(".hud-options").click();
  const options = page.getByRole("dialog", { name: "Options" });
  await expect(options).toBeVisible();
  // Not paused: the clock runs under it.
  await expect(clock).not.toHaveText(before);
  // Its keys are its own: F10 asks nothing beneath it.
  await page.keyboard.press("F10");
  await expect(page.locator(".hud-leave").getByRole("button", { name: "yes" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
  // Esc closed Options; it did not also cancel the attack. Wait for the
  // clock to move, so snapshots after the Esc have arrived from the host.
  const afterEsc = (await clock.textContent()) ?? "";
  await expect(clock).not.toHaveText(afterEsc);
  await expect(attacking).toBeVisible();
  await expect(page.locator(".hud-options")).toBeFocused();
  await opponent.close();
});
