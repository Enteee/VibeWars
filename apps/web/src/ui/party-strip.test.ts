import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { isAlone, partyOf } from "./party-strip.js";

function player(
  sessionId: string,
  overrides: Partial<LobbyPlayerSnapshot> = {},
): LobbyPlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    guildTag: null,
    team: null,
    ready: false,
    isHost: false,
    character: null,
    bot: false,
    ...overrides,
  };
}

function lobby(players: readonly LobbyPlayerSnapshot[]): LobbySnapshot {
  return {
    selfSessionId: "me",
    code: "ACDEFG",
    phase: "waiting",
    mode: "team-arena",
    mapId: "arena-alpha",
    hostId: "host",
    players,
    isHost: false,
    countdownSeconds: null,
    teamLobby: null,
  };
}

describe("the party strip's party (#1526)", () => {
  it("lists the people in lobby order, with the host marked, and no bots", () => {
    const party = partyOf(
      lobby([
        player("host", {
          isHost: true,
          character: { name: "Mhenlo", primary: "monk", secondary: null },
        }),
        player("Warrior Bot", { bot: true, team: 0 }),
        player("me"),
      ]),
    );
    expect(party).toEqual({
      code: "ACDEFG",
      mode: "team-arena",
      isHost: false,
      members: [
        { name: "host", primary: "monk", isHost: true, self: false },
        { name: "me", primary: null, isHost: false, self: true },
      ],
    });
    expect(isAlone(party)).toBe(false);
  });

  it("is alone with only bots for company, and with no lobby at all", () => {
    expect(isAlone(partyOf(lobby([player("me"), player("Bot", { bot: true })])))).toBe(true);
    expect(isAlone(undefined)).toBe(true);
  });
});
