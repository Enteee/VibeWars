import { describe, expect, it } from "vitest";

import { WARMUP_AFTER_MS, type FormedGroup } from "@vibewars/game-session";

import { ASCENT_PROGRESSION } from "../net/maps.js";
import type { Standing } from "./leaderboard-window.js";
import { queueStatus, type QueueStatusInput } from "./queue-popover.js";

const NOW = 1_000_000;

const GROUP: FormedGroup = {
  groupId: "g",
  room: "ra-g",
  hostTicketId: "a",
  teams: [["a"], ["b"]],
  parties: [],
  mapId: "arena-crossroads",
  mode: "random-arena-1v1",
  ranked: true,
  seed: 0,
  claims: { a: { rating: 800, asOf: 0 }, b: { rating: 800, asOf: 0 } },
};

describe("queueStatus (#2743)", () => {
  it("is none without a queue", () => {
    expect(queueStatus(undefined, NOW)).toBeUndefined();
  });

  it("says Random Arena's size, the wait, who searches, and offers Leave Queue", () => {
    const random = (state: Extract<QueueStatusInput, { kind: "random" }>["state"]) =>
      queueStatus(
        {
          kind: "random",
          mode: "random-arena-4v4",
          since: NOW - 65_000,
          state,
          standing: undefined,
        },
        NOW,
      );
    expect(
      random({
        kind: "searching",
        searching: 3,
        teams: 3,
        needed: 8,
        waitedMs: 65_000,
        hardNat: false,
      }),
    ).toEqual({
      title: "Random Arena 4v4",
      waited: "1:05",
      detail: "3 searching · 8 needed",
      leave: "button",
    });
    expect(random(undefined)).toEqual({
      title: "Random Arena 4v4",
      waited: "1:05",
      leave: "button",
    });
    expect(random({ kind: "forming", group: GROUP })?.detail).toBe("Match found");
    expect(random({ kind: "fell-through" })?.detail).toBe("Match fell through, searching again");
    const first = random({
      kind: "searching",
      searching: 0,
      teams: 0,
      needed: 2,
      waitedMs: 0,
      hardNat: false,
    });
    expect(first?.detail).toBeUndefined();
  });

  it("says once, under the count, that a hard NAT may block matches, iff the ticket is hard (#3758)", () => {
    const searching = (hardNat: boolean) =>
      queueStatus(
        {
          kind: "random",
          mode: "random-arena-1v1",
          since: NOW,
          state: { kind: "searching", searching: 1, teams: 1, needed: 2, waitedMs: 0, hardNat },
          standing: undefined,
        },
        NOW,
      );
    expect(searching(true)?.notice).toBe(
      "Your network may block direct matches. A relay (TURN) in Options, or port forwarding, helps.",
    );
    expect(searching(false)).not.toHaveProperty("notice");
  });

  it("names a Team Arena's size and how many teams search, the host's to leave", () => {
    const team = (teams: number | undefined, isHost: boolean) =>
      queueStatus(
        {
          kind: "team",
          mode: "team-arena",
          teamSize: 2,
          ascentRound: null,
          since: NOW - 9_999,
          teams,
          isHost,
          warmup: false,
          hallHolder: undefined,
          standing: undefined,
        },
        NOW,
      );
    expect(team(2, true)).toEqual({
      title: "Team Arena 2v2",
      waited: "0:09",
      detail: "2 teams searching",
      warmupSeconds: 21,
      warmupNow: "enabled",
      leave: "button",
    });
    expect(team(1, true)?.detail).toBe("1 team searching");
    expect(team(undefined, true)?.detail).toBeUndefined();
    expect(team(0, false)).toEqual({
      title: "Team Arena 2v2",
      waited: "0:09",
      warmupSeconds: 21,
      warmupNow: "disabled",
      leave: "host-only",
    });
  });

  it("shows the Vault instead of the search while a party waits for the Hall (#2701)", () => {
    const status = queueStatus(
      {
        kind: "team",
        mode: "heroes-ascent",
        teamSize: 8,
        ascentRound: ASCENT_PROGRESSION.length - 1,
        since: 0,
        teams: 1,
        isHost: false,
        warmup: false,
        hallHolder: { name: "Ana", signet: 5 },
        standing: undefined,
      },
      720_000 - 90_000,
    );
    expect(status).toEqual({
      title: "The Vault",
      waited: "The Hall opens in 1:30",
      detail: { key: "queue.hallHeldBy", params: { holder: { name: "Ana", signet: 5 } } },
      leave: "host-only",
    });
  });

  it("says Heroes' Ascent's round and Guild vs Guild, with no detail", () => {
    const base = {
      kind: "team",
      teamSize: 4,
      since: NOW,
      teams: 3,
      isHost: true,
      warmup: false,
      hallHolder: undefined,
      standing: undefined,
    } as const;
    expect(queueStatus({ ...base, mode: "heroes-ascent", ascentRound: 2 }, NOW)).toEqual({
      title: "Heroes' Ascent · round 3",
      waited: "0:00",
      leave: "button",
    });
    expect(queueStatus({ ...base, mode: "gvg", ascentRound: null }, NOW)).toEqual({
      title: "Guild vs Guild",
      waited: "0:00",
      warmupSeconds: 30,
      warmupNow: "enabled",
      leave: "button",
    });
  });

  describe("the warmup (#3899)", () => {
    const team = (
      waitedMs: number,
      overrides: Partial<Extract<QueueStatusInput, { kind: "team" }>> = {},
    ) =>
      queueStatus(
        {
          kind: "team",
          mode: "team-arena",
          teamSize: 2,
          ascentRound: null,
          since: NOW - waitedMs,
          teams: undefined,
          isHost: true,
          warmup: false,
          hallHolder: undefined,
          standing: undefined,
          ...overrides,
        },
        NOW,
      );

    it("counts down to WARMUP_AFTER_MS for every member, and is gone once it is due", () => {
      expect(team(0)?.warmupSeconds).toBe(30);
      expect(team(9_000)?.warmupSeconds).toBe(21);
      expect(team(WARMUP_AFTER_MS - 800, { isHost: false })?.warmupSeconds).toBe(1);
      expect(team(WARMUP_AFTER_MS)).not.toHaveProperty("warmupSeconds");
      expect(team(WARMUP_AFTER_MS)).not.toHaveProperty("warmupNow");
      expect(team(0, { warmup: true })).not.toHaveProperty("warmupSeconds");
    });

    it("offers Start warmup now to the host, shows it disabled to a guest, never during one (#4285)", () => {
      expect(team(0)?.warmupNow).toBe("enabled");
      expect(team(0, { isHost: false })?.warmupNow).toBe("disabled");
      expect(team(0, { warmup: true })).not.toHaveProperty("warmupNow");
    });

    it("is none in Heroes' Ascent, in the Vault, and in Random Arena", () => {
      expect(team(0, { mode: "heroes-ascent", ascentRound: 1 })).not.toHaveProperty(
        "warmupSeconds",
      );
      expect(team(0, { mode: "heroes-ascent", ascentRound: 1 })).not.toHaveProperty("warmupNow");
      expect(
        team(0, { mode: "heroes-ascent", ascentRound: ASCENT_PROGRESSION.length - 1 }),
      ).not.toHaveProperty("warmupNow");
      expect(
        queueStatus(
          {
            kind: "random",
            mode: "random-arena-4v4",
            since: 0,
            state: undefined,
            standing: undefined,
          },
          NOW,
        ),
      ).not.toHaveProperty("warmupNow");
    });
  });
});

describe("the rating line (#3575)", () => {
  const random = (standing: Standing | undefined) =>
    queueStatus(
      { kind: "random", mode: "random-arena-1v1", since: NOW, state: undefined, standing },
      NOW,
    )?.rating;

  it("says the rating, or provisional with its matches, or that it is unknown", () => {
    expect(random({ kind: "ranked", rank: 3, rating: 1623 })).toBe("Your rating: 1623");
    expect(random({ kind: "rated", rating: 1490 })).toBe("Your rating: 1490");
    expect(random({ kind: "provisional", matches: 3 })).toBe("Provisional (3/10 matches)");
    expect(random({ kind: "unknown" })).toBe("Rating unknown");
  });

  it("is none in a queue that is not ranked", () => {
    expect(random(undefined)).toBeUndefined();
  });
});
