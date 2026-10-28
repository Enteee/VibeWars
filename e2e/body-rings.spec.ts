import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { projection } from "./camera.js";
import { startSoloMatch } from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";

/** A starter build (#852) whose Armor of Earth puts Armor Boost, an enchantment, on yourself (#302). */
const ARMORED = "Elementalist/Mesmer";
const ARMOR_OF_EARTH = starterKey(ARMORED, "elementalist.armor-of-earth");
/** A player's body radius (#166). */
const RADIUS = 14;

const arena = JSON.parse(
  readFileSync(new URL("../packages/game-maps/maps/arena-alpha/map.json", import.meta.url), "utf8"),
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
  const self = arena.spawnPoints.find((spawn) => spawn.team === 0)?.position;
  if (self === undefined) {
    throw new Error("arena-alpha has no team 0 spawn");
  }
  const view = await projection(
    page.locator("#viewport"),
    page.locator("#viewport canvas:not(.compass)"),
  );
  const from = view.onPage({ x: self.x + RADIUS + 1, y: self.y - 2 });
  const to = view.onPage({ x: self.x + RADIUS + 5, y: self.y + 2 });
  return page.screenshot({
    clip: { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y },
  });
}

test("an enchanted body wears a ring, and loses it when the enchantment ends (#1117)", async ({
  page,
}) => {
  // Armor Boost lasts 30 s, and the ring has to go with it.
  test.setTimeout(90_000);
  await bringStarter(page, ARMORED);
  await page.goto("./");
  await startSoloMatch(page);
  const effects = page.getByRole("list", { name: "your effects" });
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Armor Boost") });
  const before = await rightEdge(page);

  await page.keyboard.press(ARMOR_OF_EARTH);
  await expect(icon).toBeVisible();
  await expect.poll(async () => (await rightEdge(page)).equals(before)).toBe(false);

  await expect(icon).toHaveCount(0, { timeout: 40_000 });
  await expect.poll(async () => (await rightEdge(page)).equals(before)).toBe(true);
});
