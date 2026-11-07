import { expect, test } from "@playwright/test";

import { matchRecordEvent } from "../apps/web/src/net/transport/match-records.js";
import { NOSTR_RELAYS } from "../apps/web/src/net/transport/relays.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import { recordTemplate, type MatchRecord } from "../packages/game-session/src/match-record.js";
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
    v: 1,
    mode: "team-arena",
    map: "arena-crossroads",
    endedAt: Math.floor(now / 1000) - 60,
    durationSeconds: 245,
    winningTeam: 0,
    endReason: "annihilation",
    teams: [
      {
        players: [
          { name: "Ann", guildTag: null, bot: false, template: played(0) },
          { name: "Bob", guildTag: null, bot: false, template: played(1) },
        ],
      },
      {
        players: [
          { name: "Bot A", guildTag: null, bot: true, template: played(2) },
          { name: "Bot B", guildTag: null, bot: true, template: played(3) },
        ],
      },
    ],
  };
  const event = matchRecordEvent(record, now);
  if (event === undefined) {
    throw new Error("record too big");
  }
  // Every relay answers the Matches page's REQ with the one record.
  const relays = new Set(NOSTR_RELAYS.map((url) => new URL(url).host));
  await page.routeWebSocket(
    (url) => relays.has(url.host),
    (ws) => {
      ws.onMessage((message) => {
        const parsed: unknown = JSON.parse(String(message));
        if (Array.isArray(parsed) && parsed[0] === "REQ" && typeof parsed[1] === "string") {
          ws.send(JSON.stringify(["EVENT", parsed[1], event]));
          ws.send(JSON.stringify(["EOSE", parsed[1]]));
        }
      });
    },
  );

  await page.goto("./");
  await openRail(page, "Matches");
  await page.locator(".match-row-head").click();
  const teams = page.locator(".match-detail .play-card");
  await expect(teams).toHaveCount(2);
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
