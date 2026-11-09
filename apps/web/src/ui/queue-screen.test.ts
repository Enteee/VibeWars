import { describe, expect, it, vi } from "vitest";

import type { LobbySnapshot } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { FakeElement } from "./fake-dom.test-support.js";
import {
  ascentStartMorale,
  endedLines,
  modeLabel,
  nextAscentMorale,
  nextAscentRound,
  nextStreak,
  queueTitle,
  stayButton,
  streakLine,
  requeuedSince,
  teamEndAction,
  teamEndLine,
  renderVersusSplash,
  versusTeams,
  waitedLabel,
} from "./queue-screen.js";

function snapshot(selfTeam: 0 | 1, countdownSeconds: number | null): LobbySnapshot {
  return {
    selfSessionId: "me",
    code: "g",
    phase: countdownSeconds === null ? "waiting" : "starting",
    mode: "random-arena",
    mapId: "ember-pits",
    teamSize: 1,
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
        playerPubkey: "ab".repeat(32),
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
        playerPubkey: "ab".repeat(32),
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
        playerPubkey: "ab".repeat(32),
      },
    ],
    isHost: false,
    countdownSeconds,
    teamLobby: null,
    queueNonce: null,
    ascentRound: null,
    ascentLock: null,
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
    expect(stayButton({ kind: "host-left" })).toEqual({
      label: t("queue.hostLeft"),
      enabled: false,
    });
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

describe("nextAscentRound (#1996)", () => {
  it("moves on with a win, to the Hall and no further", () => {
    expect(nextAscentRound(0, "win")).toBe(1);
    expect(nextAscentRound(6, "win")).toBe(7);
    expect(nextAscentRound(7, "win")).toBe(7);
  });

  it("starts again at the first after a defeat or a forfeit, and stands when the host left", () => {
    expect(nextAscentRound(2, "loss")).toBe(0);
    expect(nextAscentRound(3, "forfeit")).toBe(0);
    expect(nextAscentRound(2, "host-left")).toBe(2);
  });
});

describe("nextAscentMorale (#2686)", () => {
  it("carries the morale a won map ended at into the next", () => {
    expect(nextAscentMorale(0, -30, "win")).toBe(-30);
    expect(nextAscentMorale(-30, 10, "win")).toBe(10);
  });

  it("ends the run at 0 after a defeat or a forfeit, and keeps the start when the host left", () => {
    expect(nextAscentMorale(-15, -45, "loss")).toBe(0);
    expect(nextAscentMorale(-15, -45, "forfeit")).toBe(0);
    expect(nextAscentMorale(-15, -45, "host-left")).toBe(-15);
  });
});

describe("ascentStartMorale (#2686)", () => {
  it("sends 0 outside Heroes' Ascent and at a run's first map, and the carried morale past it", () => {
    expect(ascentStartMorale(null, -30)).toBe(0);
    expect(ascentStartMorale(0, -30)).toBe(0);
    expect(ascentStartMorale(2, -30)).toBe(-30);
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
    expect(teamEndLine("requeue", 20, null)).toEqual({
      text: "Next match in 20 s",
      button: "Leave",
    });
    expect(teamEndLine("menu", 3, null)).toEqual({ text: "Back to menu in 3 s", button: "Now" });
    expect(teamEndLine("lobby", 1, null)).toEqual({ text: "Back to lobby in 1 s", button: "Now" });
  });

  it("names where a won Heroes' Ascent goes on to, and the Hall held (#1996)", () => {
    expect(teamEndLine("requeue", 20, 0)).toEqual({
      text: "Ascending to Blackwater Ford in 20 s",
      button: "Leave",
    });
    expect(teamEndLine("requeue", 20, 6)).toEqual({
      text: "Ascending to Hall of Heroes in 20 s",
      button: "Leave",
    });
    expect(teamEndLine("requeue", 5, 7)).toEqual({
      text: "You hold the Hall of Heroes · defending in 5 s",
      button: "Leave",
    });
    // A lost Ascent goes back to the menu as any other team match.
    expect(teamEndLine("menu", 3, 2)).toEqual({ text: "Back to menu in 3 s", button: "Now" });
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

describe("the versus splash's names (#2820)", () => {
  it("signs a human, and leaves a bot bare", () => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    try {
      const shown = snapshot(0, 3);
      const players = shown.players.map((p) =>
        p.name === "Foe" ? { ...p, bot: true, playerPubkey: null } : p,
      );
      const splash = renderVersusSplash(
        { ...shown, players },
        (id) => id,
      ) as unknown as FakeElement;
      expect(splash.all("versus-player-name").map((name) => name.all("signet").length)).toEqual([
        1, 1, 0,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
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
