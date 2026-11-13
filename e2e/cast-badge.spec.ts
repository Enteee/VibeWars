import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { CAST_BADGE_SIZE, castBadgeLayout } from "../apps/web/src/render/cast-badge.js";
import { projection } from "./camera.js";
import { startSoloMatch } from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";

/** A starter build (#852) whose Troll Unguent, a skill, is a 3 s cast on yourself. */
const UNGUENT_BUILD = "Ranger/Mesmer";
const TROLL_UNGUENT = starterKey(UNGUENT_BUILD, "ranger.troll-unguent");
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

/** Your cast badge's square, left of your cast bar (#1125). */
async function badgeSpot(page: Page): Promise<Buffer> {
  const self = arena.spawnPoints.find((spawn) => spawn.team === 0)?.position;
  if (self === undefined) {
    throw new Error("ember-pits has no team 0 spawn");
  }
  const view = await projection(
    page.locator("#viewport"),
    page.locator("#viewport canvas:not(.compass)"),
  );
  const centre = castBadgeLayout(self.x, self.y, RADIUS);
  const half = CAST_BADGE_SIZE / 2;
  const from = view.onPage({ x: centre.x - half, y: centre.y - half });
  const to = view.onPage({ x: centre.x + half, y: centre.y + half });
  return page.screenshot({
    clip: { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y },
  });
}

test("a cast bar wears the casting skill's type badge, and loses it with the bar (#1125)", async ({
  page,
}) => {
  // Ember Pits breathes, and never settles unless motion is reduced.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bringStarter(page, UNGUENT_BUILD);
  await page.goto("./");
  await startSoloMatch(page);
  const before = await badgeSpot(page);

  // The first match of a cold run can take the key before its skill bar
  // does; press again only while nothing casts, as a press mid-cast queues.
  const casting = page.locator(".hud-skill.is-casting");
  await expect(async () => {
    if ((await casting.count()) === 0) {
      await page.keyboard.press(TROLL_UNGUENT);
    }
    await expect(casting).toHaveCount(1, { timeout: 2_000 });
  }).toPass();
  await expect.poll(async () => (await badgeSpot(page)).equals(before)).toBe(false);

  await expect
    .poll(async () => (await badgeSpot(page)).equals(before), { timeout: 10_000 })
    .toBe(true);
});
