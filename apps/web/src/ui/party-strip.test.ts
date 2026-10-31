import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { isAlone, lookingLabel, partyOf, showsClosed } from "./party-strip.js";

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
    open: true,
    hostId: "host",
    players,
    isHost: false,
    countdownSeconds: null,
    teamLobby: null,
    queueNonce: null,
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
      null,
    );
    expect(party).toEqual({
      code: "ACDEFG",
      mode: "team-arena",
      isHost: false,
      open: true,
      members: [
        { name: "host", primary: "monk", isHost: true, self: false },
        { name: "me", primary: null, isHost: false, self: true },
      ],
      queuedMs: null,
    });
    expect(isAlone(party)).toBe(false);
  });

  it("is alone with only bots for company, and with no lobby at all", () => {
    expect(isAlone(partyOf(lobby([player("me"), player("Bot", { bot: true })]), null))).toBe(true);
    expect(isAlone(undefined)).toBe(true);
  });

  it("tells a guest its host has the lobby closed, and nothing while open; the host never (#1682)", () => {
    const party = (isHost: boolean, open: boolean) =>
      showsClosed({ ...partyOf(lobby([player("me")]), null), isHost, open });
    expect(party(false, false)).toBe(true);
    expect(party(false, true)).toBe(false);
    expect(party(true, false)).toBe(false);
  });

  it("says how long a queued party has looked for a team (#1766)", () => {
    expect(partyOf(lobby([player("me")]), 65_000).queuedMs).toBe(65_000);
    expect(lookingLabel(65_000)).toBe("Looking for a team… 1:05");
  });
});
