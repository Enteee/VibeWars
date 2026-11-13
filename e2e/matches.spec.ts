import { expect, test } from "@playwright/test";

import { RECORDS_CHANNEL, recordMessage } from "../apps/web/src/net/transport/broadcast-records.js";
import { matchRecordEvent } from "../apps/web/src/net/transport/match-records.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import {
  MATCH_RECORD_VERSION,
  recordTemplate,
  type MatchRecord,
} from "../packages/game-session/src/match-record.js";
import { openRail } from "./helpers/menu.js";

const played = (index: number): string => {
  const build = STARTER_BUILDS[index];
  if (build === undefined) {
    throw new Error("no such starter build");
  }
  return recordTemplate(build);
};

test("Clone saves a finished match's team as a Team Build and opens it (#2585)", async ({
  page,
}) => {
  const now = Date.now();
  const record: MatchRecord = {
    v: MATCH_RECORD_VERSION,
    mode: "team-arena",
    map: "arena-crossroads",
    endedAt: Math.floor(now / 1000) - 60,
    durationSeconds: 245,
    winningTeam: 0,
    endReason: "annihilation",
    teams: [
      {
        players: [
          { name: "Ann", guildTag: null, bot: false, pubkey: "a".repeat(64), template: played(0) },
          { name: "Bob", guildTag: null, bot: false, pubkey: "a".repeat(64), template: played(1) },
        ],
      },
      {
        players: [
          { name: "Bot A", guildTag: null, bot: true, pubkey: null, template: played(2) },
          { name: "Bot B", guildTag: null, bot: true, pubkey: null, template: played(3) },
        ],
      },
    ],
  };
  const event = matchRecordEvent(record, now);
  if (event === undefined) {
    throw new Error("record too big");
  }

  await page.goto("./");
  await openRail(page, "Matches");
  // Posted as a finished match's host does in this build: the Matches page hears it.
  await page.evaluate(
    ([channel, message]) => {
      const post = new BroadcastChannel(channel);
      post.postMessage(message);
      post.close();
    },
    [RECORDS_CHANNEL, recordMessage(event)] as const,
  );
  await page.locator(".match-row-head").click();
  const teams = page.locator(".match-detail .play-card");
  await expect(page.getByRole("tab")).toHaveText(["Team 1 · Won", "Team 2 · Lost"]);
  await expect(teams).toHaveCount(1);
  await expect(teams.first().locator(".play-card-member")).toHaveCount(2);
  await teams.first().getByRole("button", { name: "Clone", exact: true }).click();

  await expect(page.locator(".team-editor")).toBeVisible();
  await expect(page.getByLabel("team name")).toHaveValue("Ann's team");
  await expect(page.locator(".team-row-name")).toHaveText(["Ann", "Bob"]);

  // Saved already: leaving goes straight back to Matches.
  await page.keyboard.press("Escape");
  await expect(page.locator(".screen-matches")).toBeVisible();
  await openRail(page, "Team Builder");
  await expect(
    page.locator(".screen-teams .play-card-name", { hasText: /^Ann's team$/ }),
  ).toBeVisible();
});

test("Clone saves a finished 1v1's side as a character and opens it (#2885)", async ({ page }) => {
  const now = Date.now();
  const record: MatchRecord = {
    v: MATCH_RECORD_VERSION,
    mode: "team-arena",
    map: "arena-crossroads",
    endedAt: Math.floor(now / 1000) - 60,
    durationSeconds: 245,
    winningTeam: 0,
    endReason: "annihilation",
    teams: [
      {
        players: [
          { name: "Ann", guildTag: null, bot: false, pubkey: "a".repeat(64), template: played(0) },
        ],
      },
      {
        players: [{ name: "Bot A", guildTag: null, bot: true, pubkey: null, template: played(2) }],
      },
    ],
  };
  const event = matchRecordEvent(record, now);
  if (event === undefined) {
    throw new Error("record too big");
  }

  await page.goto("./");
  await openRail(page, "Matches");
  await page.evaluate(
    ([channel, message]) => {
      const post = new BroadcastChannel(channel);
      post.postMessage(message);
      post.close();
    },
    [RECORDS_CHANNEL, recordMessage(event)] as const,
  );
  await page.locator(".match-row-head").click();
  await page
    .locator(".match-detail .play-card")
    .getByRole("button", { name: "Clone", exact: true })
    .click();

  await expect(page.getByLabel("character name")).toHaveValue("Ann");
  await expect(page.getByText("Cloned Ann")).toBeVisible();
});

test("shows only the 50 most recent matches of the past 7 days (#3133), with no note saying so (#3186)", async ({
  page,
}) => {
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const record = (endedAt: number, durationSeconds: number): MatchRecord => ({
    v: MATCH_RECORD_VERSION,
    mode: "team-arena",
    map: "arena-crossroads",
    endedAt,
    durationSeconds,
    winningTeam: 0,
    endReason: "annihilation",
    teams: [
      {
        players: [
          { name: "Ann", guildTag: null, bot: false, pubkey: "a".repeat(64), template: played(0) },
        ],
      },
      {
        players: [{ name: "Bot A", guildTag: null, bot: true, pubkey: null, template: played(2) }],
      },
    ],
  });
  // 55 recent ones, a minute apart, each its own duration; and one 8 days old, lasting 99:59.
  const records = [
    ...Array.from({ length: 55 }, (_, index) => record(nowSeconds - 60 * (index + 1), 60 + index)),
    record(nowSeconds - 8 * 24 * 3600, 5999),
  ];
  const messages = records.map((one) => {
    const event = matchRecordEvent(one, now);
    if (event === undefined) {
      throw new Error("record too big");
    }
    return recordMessage(event);
  });

  await page.goto("./");
  await openRail(page, "Matches");
  await expect(page.locator(".matches-note")).toBeVisible();
  await page.evaluate(
    ([channel, all]) => {
      const post = new BroadcastChannel(channel);
      for (const message of all) {
        post.postMessage(message);
      }
      post.close();
    },
    [RECORDS_CHANNEL, messages] as const,
  );
  await expect(page.locator(".match-row")).toHaveCount(50);
  await expect(page.locator(".match-duration", { hasText: "99:59" })).toHaveCount(0);
  // The newest is on top; the five oldest recent ones went.
  await expect(page.locator(".match-duration").first()).toHaveText("1:00");
  await expect(page.locator(".match-duration").last()).toHaveText("1:49");
  await expect(page.locator(".matches-recent")).toHaveCount(0);
});
