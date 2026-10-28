import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { projection } from "./camera.js";
import { startSoloMatch } from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";

/** A starter build (#852) whose Sprint, a stance, lands on yourself: a glow (#1139). */
const SPRINTER = "Warrior/Monk";
const SPRINT = starterKey(SPRINTER, "warrior.sprint");
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
 * A strip just past your body's right edge, r + 1 to r + 5, as in
 * `body-rings.spec.ts`: where the glow's ring closes in (r + 4, frozen),
 * clear of the target ring at r + 8 and of the status row under you.
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

test("a skill that lands glows on the body it helped, then is gone (#1139)", async ({ page }) => {
  // The frozen form: held 0.3 s at full alpha, then removed.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bringStarter(page, SPRINTER);
  await page.goto("./");
  await startSoloMatch(page);
  const before = await rightEdge(page);

  await page.keyboard.press(SPRINT);
  // Polled at once: the glow lasts 0.3 s.
  await expect
    .poll(async () => (await rightEdge(page)).equals(before), { intervals: [0] })
    .toBe(false);
  await page.waitForTimeout(500);
  expect((await rightEdge(page)).equals(before)).toBe(true);
});
