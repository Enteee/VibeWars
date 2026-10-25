import { describe, expect, it } from "vitest";

import type { LobbySnapshot } from "../net/lobby-client.js";

import { MATCH_RUNNING_NOTICE, lobbyControls } from "./lobby-screen.js";

function snapshot(phase: string): LobbySnapshot {
  return {
    selfSessionId: "host",
    code: "ABCD",
    phase,
    mapId: "arena",
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
        { sessionId: "host", name: "Host", team: -1, ready: false, isHost: true },
        { sessionId: "guest", name: "Guest", team: 1, ready: false, isHost: false },
      ],
    });
    expect(controls.readyDisabled).toBe(true);
    expect(controls.startDisabled).toBe(true);
  });
});
