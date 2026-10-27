import { describe, expect, it } from "vitest";

import type { FormedGroup, LobbySnapshot, QueueState } from "@vibewars/game-session";

import {
  FELL_THROUGH,
  MATCH_FOUND,
  UNREACHABLE,
  modeLabel,
  queueLines,
  queueTitle,
  searchingLabel,
  versusTeams,
  waitedLabel,
} from "./queue-screen.js";

const GROUP: FormedGroup = {
  groupId: "g",
  room: "ra-g",
  hostTicketId: "a",
  teams: [["a"], ["b"]],
  mapId: "arena-alpha",
};

function snapshot(selfTeam: 0 | 1, countdownSeconds: number | null): LobbySnapshot {
  return {
    selfSessionId: "me",
    code: "g",
    phase: countdownSeconds === null ? "waiting" : "starting",
    mapId: "arena-open",
    hostId: "host",
    players: [
      { sessionId: "me", name: "Me", team: selfTeam, ready: false, isHost: false, character: null },
      {
        sessionId: "mate",
        name: "Mate",
        team: selfTeam,
        ready: false,
        isHost: false,
        character: { name: "Mhenlo", primary: "monk", secondary: null },
      },
      {
        sessionId: "foe",
        name: "Foe",
        team: selfTeam === 0 ? 1 : 0,
        ready: false,
        isHost: true,
        character: null,
      },
    ],
    isHost: false,
    countdownSeconds,
  };
}

describe("the queue screen's words (#880)", () => {
  it("names the mode and the character in its title", () => {
    expect(modeLabel("random-arena-4v4")).toBe("4v4");
    expect(modeLabel("random-arena-1v1")).toBe("1v1");
    expect(queueTitle("random-arena-2v2", "Mhenlo")).toBe("Random Arena 2v2 · Mhenlo");
  });

  it("shows the wait as m:ss", () => {
    expect(waitedLabel(0)).toBe("0:00");
    expect(waitedLabel(9_999)).toBe("0:09");
    expect(waitedLabel(75_000)).toBe("1:15");
    expect(waitedLabel(-5)).toBe("0:00");
  });

  it("counts who is searching against who is needed", () => {
    expect(searchingLabel(3, 8)).toBe("3 searching · 8 needed");
  });
});

describe("queueLines (#880)", () => {
  const searching: QueueState = { kind: "searching", searching: 3, needed: 8, waitedMs: 65_000 };

  it("searching: the wait, the count and Leave queue", () => {
    expect(queueLines(searching, false)).toEqual({
      status: "Searching",
      waited: "1:05",
      count: "3 searching · 8 needed",
      action: "leave",
    });
  });

  it("forming and in-lobby: Match found, still leavable", () => {
    for (const state of [
      { kind: "forming", group: GROUP },
      { kind: "in-lobby", group: GROUP, key: { ticketId: "a", sign: () => "" } },
    ] as const) {
      expect(queueLines(state, false)).toEqual({ status: MATCH_FOUND, action: "leave" });
    }
  });

  it("fell-through: says so, and keeps saying it over searching while it is held", () => {
    expect(queueLines({ kind: "fell-through" }, false)).toEqual({
      status: FELL_THROUGH,
      action: "leave",
    });
    expect(queueLines(searching, true)).toEqual({ status: FELL_THROUGH, action: "leave" });
  });

  it("unreachable: #707's wording and Back to menu", () => {
    expect(queueLines({ kind: "unreachable" }, false)).toEqual({
      status: UNREACHABLE,
      action: "back",
    });
  });
});

describe("versusTeams (#880)", () => {
  it("puts your team first, whichever side you are on", () => {
    for (const side of [0, 1] as const) {
      const teams = versusTeams(snapshot(side, 3));
      expect(teams.ours.map((p) => p.name)).toEqual(["Me", "Mate"]);
      expect(teams.theirs.map((p) => p.name)).toEqual(["Foe"]);
    }
  });

  it("counts down once everyone is seated, and says it is waiting before", () => {
    expect(versusTeams(snapshot(0, 4)).countdown).toBe("Starting in 4");
    expect(versusTeams(snapshot(0, null)).countdown).toBe("Waiting for everyone to arrive");
  });
});
