import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import {
  PARTY_RECONNECTING,
  isAlone,
  lookingLabel,
  memberClass,
  partyOf,
  showsClosed,
} from "./party-strip.js";

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
    away: false,
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
    proposalBuilds: new Map(),
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
        { name: "host", primary: "monk", isHost: true, self: false, away: false },
        { name: "me", primary: null, isHost: false, self: true, away: false },
      ],
      queuedMs: null,
    });
    expect(isAlone(party)).toBe(false);
  });

  it("greys a member whose connection dropped, and says it is reconnecting (#1764)", () => {
    const party = partyOf(lobby([player("me"), player("friend", { away: true, team: 1 })]), null);
    const [me, friend] = party.members;
    if (me === undefined || friend === undefined) {
      throw new Error("two members");
    }
    expect(friend.away).toBe(true);
    expect(memberClass(friend)).toBe("party-member is-away");
    expect(memberClass(me)).toBe("party-member is-self");
    expect(PARTY_RECONNECTING).toBe("Reconnecting…");
    // Still in the party: it may yet come back.
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
