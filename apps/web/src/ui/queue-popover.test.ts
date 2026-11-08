import { describe, expect, it } from "vitest";

import type { FormedGroup } from "@vibewars/game-session";

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
};

describe("queueStatus (#2743)", () => {
  it("is none without a queue", () => {
    expect(queueStatus(undefined, NOW)).toBeUndefined();
  });

  it("says Random Arena's size, the wait, who searches, and offers Leave Queue", () => {
    const random = (state: Extract<QueueStatusInput, { kind: "random" }>["state"]) =>
      queueStatus({ kind: "random", mode: "random-arena-4v4", since: NOW - 65_000, state }, NOW);
    expect(
      random({ kind: "searching", searching: 3, teams: 3, needed: 8, waitedMs: 65_000 }),
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
    const first = random({ kind: "searching", searching: 0, teams: 0, needed: 2, waitedMs: 0 });
    expect(first?.detail).toBeUndefined();
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
        },
        NOW,
      );
    expect(team(2, true)).toEqual({
      title: "Team Arena 2v2",
      waited: "0:09",
      detail: "2 teams searching",
      leave: "button",
    });
    expect(team(1, true)?.detail).toBe("1 team searching");
    expect(team(undefined, true)?.detail).toBeUndefined();
    expect(team(0, false)).toEqual({ title: "Team Arena 2v2", waited: "0:09", leave: "host-only" });
  });

  it("says Heroes' Ascent's round and Guild vs Guild, with no detail", () => {
    const base = { kind: "team", teamSize: 4, since: NOW, teams: 3, isHost: true } as const;
    expect(queueStatus({ ...base, mode: "heroes-ascent", ascentRound: 2 }, NOW)).toEqual({
      title: "Heroes' Ascent · round 3",
      waited: "0:00",
      leave: "button",
    });
    expect(queueStatus({ ...base, mode: "gvg", ascentRound: null }, NOW)).toEqual({
      title: "Guild vs Guild",
      waited: "0:00",
      leave: "button",
    });
  });
});
