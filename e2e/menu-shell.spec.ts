import { expect, test, type Page } from "@playwright/test";

import { RECORDS_CHANNEL, recordMessage } from "../apps/web/src/net/transport/broadcast-records.js";
import { matchRecordEvent } from "../apps/web/src/net/transport/match-records.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import {
  MATCH_RECORD_VERSION,
  recordTemplate,
  type MatchRecord,
} from "../packages/game-session/src/match-record.js";
import { openRail } from "./helpers/menu.js";

// Posts `count` finished 1v1s on the records channel, as their hosts would,
// each ending a minute before the last so every one is its own row.
async function postMatches(page: Page, count: number): Promise<void> {
  const build = STARTER_BUILDS[0];
  if (build === undefined) {
    throw new Error("no starter build");
  }
  const now = Date.now();
  const messages = Array.from({ length: count }, (_, index) => {
    const record: MatchRecord = {
      v: MATCH_RECORD_VERSION,
      mode: "team-arena",
      map: "arena-crossroads",
      endedAt: Math.floor(now / 1000) - 60 * (index + 1),
      durationSeconds: 245,
      winningTeam: 0,
      endReason: "annihilation",
      teams: [
        {
          players: [
            {
              name: "Ann",
              guildTag: null,
              bot: false,
              pubkey: "a".repeat(64),
              template: recordTemplate(build),
            },
          ],
        },
        {
          players: [
            {
              name: "Bot A",
              guildTag: null,
              bot: true,
              pubkey: null,
              template: recordTemplate(build),
            },
          ],
        },
      ],
    };
    const event = matchRecordEvent(record, now);
    if (event === undefined) {
      throw new Error("record too big");
    }
    return recordMessage(event);
  });
  await page.evaluate(
    ([channel, posted]) => {
      const post = new BroadcastChannel(channel);
      for (const message of posted) {
        post.postMessage(message);
      }
      post.close();
    },
    [RECORDS_CHANNEL, messages] as const,
  );
}

test("the side menu stays put while the Matches page scrolls (#3132)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("./");
  await openRail(page, "Matches");
  await postMatches(page, 30);
  await expect(page.locator(".match-row-head")).toHaveCount(30);

  const rail = page.locator(".mode-rail");
  const body = page.locator(".rail-body");
  const before = await rail.boundingBox();
  expect(before).not.toBeNull();

  await body.hover();
  await page.mouse.wheel(0, 5000);
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect((await rail.boundingBox())?.y).toBe(before?.y);
});

test("a side menu taller than the window scrolls by itself (#3132)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.goto("./");
  await openRail(page, "Matches");

  const rail = page.locator(".mode-rail");
  const size = await rail.evaluate((element) => ({
    scroll: element.scrollHeight,
    client: element.clientHeight,
  }));
  expect(size.scroll).toBeGreaterThan(size.client);
  await rail.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => rail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
