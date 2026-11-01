import { describe, expect, it } from "vitest";

import type { FormedGroup, LobbySnapshot, QueueState } from "@vibewars/game-session";

import {
  FELL_THROUGH,
  HOST_LEFT,
  MATCH_FOUND,
  TEAM_SPLIT,
  UNREACHABLE,
  endedLines,
  modeLabel,
  nextStreak,
  queueLines,
  queueTitle,
  searchingLabel,
  stayButton,
  streakLine,
  requeuedSince,
  teamEndAction,
  teamEndLine,
  versusTeams,
  waitedLabel,
} from "./queue-screen.js";

const GROUP: FormedGroup = {
  groupId: "g",
  room: "ra-g",
  hostTicketId: "a",
  teams: [["a"], ["b"]],
  parties: [],
  mapId: "arena-alpha",
  mode: "random-arena-1v1",
};

function snapshot(selfTeam: 0 | 1, countdownSeconds: number | null): LobbySnapshot {
  return {
    selfSessionId: "me",
    code: "g",
    phase: countdownSeconds === null ? "waiting" : "starting",
    mode: "random-arena",
    mapId: "arena-open",
    open: true,
    hostId: "host",
    players: [
      {
        sessionId: "me",
        name: "Me",
        guildTag: null,
        team: selfTeam,
        ready: false,
        isHost: false,
        bot: false,
        away: false,
      },
      {
        sessionId: "mate",
        name: "Mate",
        guildTag: null,
        team: selfTeam,
        ready: false,
        isHost: false,
        bot: false,
        away: false,
      },
      {
        sessionId: "foe",
        name: "Foe",
        guildTag: null,
        team: selfTeam === 0 ? 1 : 0,
        ready: false,
        isHost: true,
        bot: false,
        away: false,
      },
    ],
    isHost: false,
    countdownSeconds,
    teamLobby: null,
    queueNonce: null,
    proposalBuilds: new Map(),
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
  const searching: QueueState = {
    kind: "searching",
    searching: 3,
    teams: 3,
    needed: 8,
    waitedMs: 65_000,
  };

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

  it("party-gone: the team split up (#882)", () => {
    expect(queueLines({ kind: "party-gone" }, false)).toEqual({
      status: TEAM_SPLIT,
      action: "leave",
    });
  });
});

describe("stayButton (#882)", () => {
  it("offers Stay together with its countdown, waits once pressed, and is off when the host left", () => {
    expect(stayButton({ kind: "offer", secondsLeft: 12 })).toEqual({
      label: "Stay together (12)",
      enabled: true,
    });
    expect(stayButton({ kind: "waiting", secondsLeft: 9 })).toEqual({
      label: "Waiting for your team (9)",
      enabled: false,
    });
    expect(stayButton({ kind: "host-left" })).toEqual({ label: HOST_LEFT, enabled: false });
  });
});

describe("nextStreak (#881)", () => {
  it("adds a win, clears on a defeat or a forfeit, and keeps it when the host left", () => {
    expect(nextStreak(2, "win")).toBe(3);
    expect(nextStreak(2, "loss")).toBe(0);
    expect(nextStreak(2, "forfeit")).toBe(0);
    expect(nextStreak(2, "host-left")).toBe(2);
  });
});

describe("streakLine (#881)", () => {
  it("says nothing at 0, and counts the wins after", () => {
    expect(streakLine(0)).toBeUndefined();
    expect(streakLine(1)).toBe("1 win in a row this visit (not a rating)");
    expect(streakLine(3)).toBe("3 wins in a row this visit (not a rating)");
  });
});

describe("endedLines (#881)", () => {
  it("shows the outcome, the streak and both buttons", () => {
    expect(endedLines("Victory", 1)).toEqual({
      status: "Victory",
      streak: "1 win in a row this visit (not a rating)",
      action: "ended",
    });
  });

  it("adds Stay together beside both buttons when a winning team may stay (#882)", () => {
    expect(endedLines("Victory", 1, { kind: "offer", secondsLeft: 15 })).toMatchObject({
      action: "ended",
      stay: { label: "Stay together (15)", enabled: true },
    });
  });

  it("shows no streak at 0", () => {
    expect(endedLines("Defeat (morale)", 0)).toEqual({
      status: "Defeat (morale)",
      action: "ended",
    });
  });
});

describe("teamEndAction and teamEndLine (#1997)", () => {
  it("queues a party's winners again and sends its losers to the menu", () => {
    expect(teamEndAction(true, true)).toBe("requeue");
    expect(teamEndAction(false, true)).toBe("menu");
  });

  it("takes a coded lobby's players back to it, won or lost", () => {
    expect(teamEndAction(true, false)).toBe("lobby");
    expect(teamEndAction(false, false)).toBe("lobby");
  });

  it("counts down to each, with its button", () => {
    expect(teamEndLine("requeue", 20)).toEqual({ text: "Next match in 20 s", button: "Leave" });
    expect(teamEndLine("menu", 3)).toEqual({ text: "Back to menu in 3 s", button: "Now" });
    expect(teamEndLine("lobby", 1)).toEqual({ text: "Back to lobby in 1 s", button: "Now" });
  });
});

describe("requeuedSince (#1997)", () => {
  it("catches a member up on a queue its host started while it was still in the match", () => {
    expect(requeuedSince({ phase: "queued", queueNonce: "next" }, "played")).toBe(true);
  });

  it("leaves a member out before its host to the host's own requeue", () => {
    // Its host is still in the played match's queue, or out of it and not queued again.
    expect(requeuedSince({ phase: "queued", queueNonce: "played" }, "played")).toBe(false);
    expect(requeuedSince({ phase: "waiting", queueNonce: null }, "played")).toBe(false);
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
