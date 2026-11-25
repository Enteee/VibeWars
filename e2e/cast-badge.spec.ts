import { expect, test, type Locator, type Page } from "@playwright/test";

import { CAST_BADGE_SIZE, castBadgeLayout } from "../apps/web/src/render/cast-badge.js";
import { stackOverheadRise } from "../apps/web/src/render/sprite-stack.js";
import { projection } from "./camera.js";
import { startSoloMatch } from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";

/** A starter build (#852) whose Troll Unguent, a skill, is a 3 s cast on yourself. */
const UNGUENT_BUILD = "Ranger/Mesmer";
const TROLL_UNGUENT = starterKey(UNGUENT_BUILD, "ranger.troll-unguent");
/** A player's body radius (#166). */
const RADIUS = 14;

/**
 * Your cast badge's square, left of your cast bar (#1125), as a page clip.
 * You are where the camera centres: the follow camera holds on you once it
 * reads the same twice, and Ember Pits' spawn is clear of the arena's edge,
 * which would clamp it. Read once: a clip per sample is too slow to catch a
 * 3 s cast on a slow runner (#3501).
 */
async function badgeClip(page: Page): Promise<{
  readonly self: string;
  readonly clip: { x: number; y: number; width: number; height: number };
}> {
  const stage = page.locator("#viewport");
  let self = "";
  await expect
    .poll(
      async () => {
        const was = self;
        self = (await stage.getAttribute("data-camera")) ?? "";
        return self !== "" && self === was;
      },
      // One read can stall ~8 s while the match starts.
      { message: "the camera holds still", timeout: 20_000 },
    )
    .toBe(true);
  const view = await projection(stage, page.locator("#viewport canvas:not(.compass)"));
  const [x = 0, y = 0] = self.split(",").map(Number);
  // Over your stacked figure, not a flat disc (ADR-0057).
  const centre = castBadgeLayout(x, y - stackOverheadRise(RADIUS), RADIUS);
  const half = CAST_BADGE_SIZE / 2;
  const from = view.onPage({ x: centre.x - half, y: centre.y - half });
  const to = view.onPage({ x: centre.x + half, y: centre.y + half });
  return { self, clip: { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y } };
}

/** Whether the skill casts, recharges or is ready, for a red run to say. */
async function skillState(button: Locator): Promise<string> {
  if ((await button.count()) === 0) {
    return "not on the bar";
  }
  if ((await button.getAttribute("class"))?.split(" ").includes("is-casting") === true) {
    return "casting";
  }
  return (await button.locator(".recharge-overlay").count()) > 0 ? "recharging" : "ready";
}

test("a cast bar wears the casting skill's type badge, and loses it with the bar (#1125)", async ({
  page,
}) => {
  // Ember Pits breathes, and never settles unless motion is reduced.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bringStarter(page, UNGUENT_BUILD);
  await page.goto("./");
  await startSoloMatch(page);
  const { self, clip } = await badgeClip(page);
  const badgeSpot = () => page.screenshot({ clip });
  const before = await badgeSpot();

  // Look for the badge straight after the press, not once the HUD shows
  // the cast: at a slow frame rate the 3 s cast can be over by then (#3270).
  // The first match of a cold run can take the key before its skill bar
  // does; press again only after 2 s with the skill neither casting nor
  // recharging, as a press mid-cast queues.
  const unguent = page.getByRole("button", { name: /^Troll Unguent/ });
  const taken = page.locator(".hud-skill.is-casting, .hud-skill .recharge-overlay");
  await page.keyboard.press(TROLL_UNGUENT);
  let pressed = Date.now();
  let presses = 1;
  await expect(async () => {
    if (Date.now() - pressed > 2_000 && (await taken.count()) === 0) {
      await page.keyboard.press(TROLL_UNGUENT);
      pressed = Date.now();
      presses += 1;
    }
    const shown = !(await badgeSpot()).equals(before);
    const state = shown ? "" : await skillState(unguent);
    expect(
      shown,
      `no badge at you (${self}) after ${String(presses)} press(es); the skill: ${state}`,
    ).toBe(true);
  }).toPass({ intervals: [0], timeout: 20_000 });

  await expect.poll(async () => (await badgeSpot()).equals(before), { timeout: 10_000 }).toBe(true);
});
