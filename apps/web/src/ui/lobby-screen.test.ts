import { describe, expect, it } from "vitest";

import type { LobbySnapshot } from "@vibewars/game-session";

import {
  DEFAULT_LOADOUT,
  MATCH_RUNNING_NOTICE,
  characterLine,
  displayLobbyCode,
  lobbyControls,
  mapLabel,
  waitingFor,
} from "./lobby-screen.js";

function snapshot(phase: LobbySnapshot["phase"]): LobbySnapshot {
  return {
    selfSessionId: "host",
    code: "ACDEFG",
    phase,
    mapId: "arena",
    hostId: "host-peer",
    players: [
      { sessionId: "host", name: "Host", team: 0, ready: true, isHost: true, character: null },
      { sessionId: "guest", name: "Guest", team: 1, ready: true, isHost: false, character: null },
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
        {
          sessionId: "host",
          name: "Host",
          team: null,
          ready: false,
          isHost: true,
          character: null,
        },
        {
          sessionId: "guest",
          name: "Guest",
          team: 1,
          ready: false,
          isHost: false,
          character: null,
        },
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

describe("waitingFor (#580)", () => {
  const player = (name: string, team: 0 | 1 | null, ready: boolean) => ({
    sessionId: name,
    name,
    team,
    ready,
    isHost: false,
    character: null,
  });

  it("names everyone on a team who is not ready, in lobby order", () => {
    expect(
      waitingFor({
        ...snapshot("waiting"),
        players: [
          player("Host", 0, true),
          player("Mhenlo", 0, false),
          player("Watcher", null, false),
          player("Cynn", 1, false),
        ],
      }),
    ).toBe("Waiting for Mhenlo, Cynn to ready up");
  });

  it("asks for someone on a team when nobody is on one", () => {
    expect(waitingFor({ ...snapshot("waiting"), players: [player("Host", null, false)] })).toBe(
      "Waiting for someone to join a team",
    );
  });

  it("waits for nobody once everyone on a team is ready, or a match is on", () => {
    expect(waitingFor(snapshot("waiting"))).toBeUndefined();
    expect(
      waitingFor({ ...snapshot("in-match"), players: [player("Mhenlo", 0, false)] }),
    ).toBeUndefined();
  });

  it("agrees with Start: it names someone exactly when Start is disabled while waiting", () => {
    for (const players of [
      [player("A", 0, true)],
      [player("A", 0, false)],
      [player("A", null, false)],
      [player("A", 0, true), player("B", 1, false)],
    ]) {
      const lobby = { ...snapshot("waiting"), players };
      expect(waitingFor(lobby) !== undefined).toBe(lobbyControls(lobby).startDisabled);
    }
  });
});

describe("characterLine (#580)", () => {
  it("gives the character name, then its professions", () => {
    expect(characterLine({ name: "Mhenlo", primary: "monk", secondary: "elementalist" })).toBe(
      "Mhenlo · Monk / Elementalist",
    );
    expect(characterLine({ name: "Cynn", primary: "elementalist", secondary: null })).toBe(
      "Cynn · Elementalist",
    );
  });

  it("calls the house build the default loadout", () => {
    expect(characterLine(null)).toBe(DEFAULT_LOADOUT);
  });
});
