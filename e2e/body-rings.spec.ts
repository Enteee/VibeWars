import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { projection } from "./camera.js";
import { joinFriend } from "./helpers/menu.js";
import { hostLobby, playOwnTeams } from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";
import { key } from "./keys.js";

/** A starter build (#852) whose Armor of Earth puts Armor Boost, an enchantment, on yourself (#302). */
const ARMORED = "Elementalist/Mesmer";
const ARMOR_OF_EARTH = starterKey(ARMORED, "elementalist.armor-of-earth");
/** A player's body radius (#166). */
const RADIUS = 14;

const arena = JSON.parse(
  readFileSync(new URL("../packages/game-maps/maps/ember-pits/map.json", import.meta.url), "utf8"),
) as {
  readonly spawnPoints: readonly {
    readonly team: number;
    readonly position: { readonly x: number; readonly y: number };
  }[];
};

/**
 * A 4 unit strip just past your body's right edge, from r + 1 to r + 5:
 * where the enchantment ring runs, clear of the weapon you face away from
 * it with, and of the status row under you.
 */
async function rightEdge(page: Page): Promise<Buffer> {
  return aroundYou(page, RADIUS + 1, -2, RADIUS + 5, 2);
}

test("an enchanted body wears a ring, and loses it when the enchantment ends (#1117)", async ({
  page,
}) => {
  // Armor Boost lasts 30 s, and the ring has to go with it. A foe who
  // stands still, not a side of bots: one would walk over and hex you
  // before it ends, and the strip with it.
  test.setTimeout(90_000);
  const foe = await page.context().newPage();
  await bringStarter(page, ARMORED);
  const code = await hostLobby(page);
  await foe.goto("./");
  await joinFriend(foe, code);
  await foe.getByRole("button", { name: "join team 2" }).click();
  await foe.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await playOwnTeams([{ page }, { page: foe }]);
  const effects = page.getByRole("list", { name: "your effects" });
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Armor Boost") });
  const before = await rightEdge(page);

  await page.keyboard.press(ARMOR_OF_EARTH);
  await expect(icon).toBeVisible();
  await expect.poll(async () => (await rightEdge(page)).equals(before)).toBe(false);

  await expect(icon).toHaveCount(0, { timeout: 40_000 });
  await expect.poll(async () => (await rightEdge(page)).equals(before)).toBe(true);
});

/** A starter build (#852) with a stance, an enchantment on yourself, and a hex for the foe. */
const MARKED = "March Signet of Suffering (D/N)";
const PIOUS_HASTE = starterKey(MARKED, "dervish.pious-haste");
const MYSTIC_REGENERATION = starterKey(MARKED, "dervish.mystic-regeneration");
const LIFE_SIPHON = starterKey(MARKED, "necromancer.life-siphon");

/**
 * Your body, from `left` to `right` and `top` to `bottom` world units
 * off its centre at your spawn: you stand still there all match.
 */
async function aroundYou(
  page: Page,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Promise<Buffer> {
  const self = arena.spawnPoints.find((spawn) => spawn.team === 0)?.position;
  if (self === undefined) {
    throw new Error("ember-pits has no team 0 spawn");
  }
  const view = await projection(
    page.locator("#viewport"),
    page.locator("#viewport canvas:not(.compass)"),
  );
  const from = view.onPage({ x: self.x + left, y: self.y + top });
  const to = view.onPage({ x: self.x + right, y: self.y + bottom });
  return page.screenshot({
    clip: { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y },
  });
}

/** Waits until `name`'s button on `page`'s skill bar is off its 5 or 12 s recharge. */
async function ready(page: Page, name: RegExp): Promise<void> {
  const button = page.locator(".hud-skills").getByRole("button", { name });
  await expect(button.locator(".recharge-overlay")).toHaveCount(0);
}

/**
 * Puts Life Siphon, Pious Haste and Mystic Regeneration on you together,
 * and returns the shot of your body taken straight after the one read of
 * your effects that saw all three. Pious Haste takes a Dervish enchantment
 * off you, so it goes on just before Mystic Regeneration, both off
 * recharge, and the hex is refreshed first when it has run out.
 */
async function allThree(
  page: Page,
  foe: Page,
  wearing: (name: RegExp) => Locator,
): Promise<Buffer> {
  const effects = page.getByRole("list", { name: "your effects" });
  const names = ["Life Siphon", "Pious Haste", "Mystic Regeneration"];
  let seen: string[] = [];
  for (let pass = 0; pass < 3; pass += 1) {
    await ready(page, /^Pious Haste/);
    await ready(page, /^Mystic Regeneration/);
    if ((await wearing(/^Life Siphon$/).count()) === 0) {
      await foe.keyboard.press(key("target-next"));
      await expect(foe.locator(".hud-target-text")).not.toHaveText("no target");
      await ready(foe, /^Life Siphon/);
      await foe.keyboard.press(LIFE_SIPHON);
      await expect(wearing(/^Life Siphon$/)).toBeVisible({ timeout: 30_000 });
    }
    await page.keyboard.press(PIOUS_HASTE);
    await expect(wearing(/^Pious Haste/)).not.toHaveCount(0);
    await page.keyboard.press(MYSTIC_REGENERATION);
    await expect(wearing(/^Mystic Regeneration$/)).toBeVisible();
    seen = await effects
      .getByRole("img")
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute("alt") ?? ""));
    if (names.every((name) => seen.some((alt) => alt.startsWith(name)))) {
      return aroundYou(page, -40, -45, 40, 30);
    }
  }
  throw new Error(`never wore ${names.join(", ")} at once; last saw ${seen.join(", ")}`);
}

test("a hexed body wears the violet halo over its bar, with its stance band and enchantment ring at its feet (#3226)", async ({
  page,
}, testInfo) => {
  // Up to three passes of allThree, each waiting out a 12 s recharge and
  // up to 30 s for a fresh hex, on top of what the match took before.
  test.setTimeout(150_000);
  // One context, so the two pages find each other (helpers/peers.ts), and
  // one storage, so the foe plays this starter too.
  const foe = await page.context().newPage();
  await bringStarter(page, MARKED);
  const code = await hostLobby(page);
  await foe.goto("./");
  await joinFriend(foe, code);
  await foe.getByRole("button", { name: "join team 2" }).click();
  await foe.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await playOwnTeams([{ page }, { page: foe }]);

  // Over the health bar (r + 8 … r + 12), under the name: where the halo floats.
  const halo = () => aroundYou(page, -RADIUS, -RADIUS - 18, RADIUS, -RADIUS - 13);
  const before = await halo();
  const effects = page.getByRole("list", { name: "your effects" });
  const wearing = (name: RegExp) =>
    effects.getByRole("listitem").filter({ has: page.getByAltText(name) });

  // The foe walks into range and hexes you.
  await foe.keyboard.press(key("target-next"));
  await expect(foe.locator(".hud-target-text")).not.toHaveText("no target");
  await foe.keyboard.press(LIFE_SIPHON);
  await expect(wearing(/^Life Siphon$/)).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await halo()).equals(before)).toBe(false);

  // All three at once, in one read: on a slow runner a fixed sequence
  // lets the hex or the 1-5.8 s stance run out first (#4108).
  const shot = await allThree(page, foe, wearing);
  await testInfo.attach("enchanted, in a stance and hexed", {
    body: shot,
    contentType: "image/png",
  });
  await foe.close();
});
