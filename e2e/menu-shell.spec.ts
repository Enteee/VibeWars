import { expect, test } from "@playwright/test";

import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import {
  MATCH_RECORD_VERSION,
  recordTemplate,
  type MatchRecord,
} from "../packages/game-session/src/match-record.js";
import { postMatchRecord } from "./helpers/match-records.js";
import { openRail } from "./helpers/menu.js";

const template = (): string => {
  const build = STARTER_BUILDS[0];
  if (build === undefined) {
    throw new Error("no starter build");
  }
  return recordTemplate(build);
};

/** A finished 1v1 that ended `minutesAgo` ago: each one a row of its own. */
function record(minutesAgo: number): MatchRecord {
  return {
    v: MATCH_RECORD_VERSION,
    mode: "team-arena",
    map: "arena-crossroads",
    endedAt: Math.floor(Date.now() / 1000) - 60 * minutesAgo,
    durationSeconds: 120,
    winningTeam: 0,
    endReason: "annihilation",
    teams: [
      {
        players: [
          { name: "Ann", guildTag: null, bot: false, pubkey: "a".repeat(64), template: template() },
        ],
      },
      {
        players: [{ name: "Bot A", guildTag: null, bot: true, pubkey: null, template: template() }],
      },
    ],
  };
}

test("the rail holds still while the Matches page scrolls (#3132)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("./");
  await openRail(page, "Matches");
  for (let minutes = 1; minutes <= 20; minutes += 1) {
    await postMatchRecord(page, record(minutes));
  }
  await expect(page.locator(".match-row-head")).toHaveCount(20);

  const rail = page.locator(".mode-rail");
  const body = page.locator(".rail-body");
  const before = await rail.boundingBox();
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await rail.boundingBox())?.y).toBe(before?.y);
});

test("a rail taller than the window scrolls by itself (#3132)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.goto("./");
  await openRail(page, "Matches");

  const rail = page.locator(".mode-rail");
  expect(await rail.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await rail.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await rail.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});
