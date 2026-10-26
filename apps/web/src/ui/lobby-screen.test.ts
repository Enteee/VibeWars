import { describe, expect, it } from "vitest";

import type { LobbySnapshot } from "@vibewars/game-session";

import { MATCH_RUNNING_NOTICE, displayLobbyCode, lobbyControls, mapLabel } from "./lobby-screen.js";

function snapshot(phase: LobbySnapshot["phase"]): LobbySnapshot {
  return {
    selfSessionId: "host",
    code: "ACDEFG",
    phase,
    mapId: "arena",
    hostId: "host-peer",
    players: [
      { sessionId: "host", name: "Host", team: 0, ready: true, isHost: true },
      { sessionId: "guest", name: "Guest", team: 1, ready: true, isHost: false },
    ],
    isHost: true,
  };
}

describe("lobbyControls", () => {
  it("says the match is running and locks everything but leave", () => {
    expect(lobbyControls(snapshot("in-match"))).toEqual({
      running: MATCH_RUNNING_NOTICE,
      mapDisabled: true,
      teamsDisabled: true,
      readyDisabled: true,
      startDisabled: true,
    });
  });

  it("locks the controls while a match is starting, without saying one runs", () => {
    expect(lobbyControls(snapshot("starting"))).toEqual({
      running: undefined,
      mapDisabled: true,
      teamsDisabled: true,
      readyDisabled: true,
      startDisabled: true,
    });
  });

  it("shows no line and opens the controls once the lobby is waiting", () => {
    expect(lobbyControls(snapshot("waiting"))).toEqual({
      running: undefined,
      mapDisabled: false,
      teamsDisabled: false,
      readyDisabled: false,
      startDisabled: false,
    });
  });

  it("still refuses ready without a team, and start until everyone is ready", () => {
    const waiting = snapshot("waiting");
    const controls = lobbyControls({
      ...waiting,
      players: [
        { sessionId: "host", name: "Host", team: null, ready: false, isHost: true },
        { sessionId: "guest", name: "Guest", team: 1, ready: false, isHost: false },
      ],
    });
    expect(controls.readyDisabled).toBe(true);
    expect(controls.startDisabled).toBe(true);
  });
});

describe("displayLobbyCode", () => {
  it("reads a six-letter code as two halves, the way it is read aloud", () => {
    expect(displayLobbyCode("ACDEFG")).toBe("ACD-EFG");
  });
});

describe("mapLabel (#444)", () => {
  it("names an arena, then how big it plays", () => {
    expect(mapLabel({ id: "arena-long-hall", name: "Long Hall", size: "large" })).toBe(
      "Long Hall (large)",
    );
  });
});
