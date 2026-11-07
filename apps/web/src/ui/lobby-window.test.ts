import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOBBY_ICON } from "./icons.js";

import {
  PARTY_ALONE,
  PARTY_CLOSED,
  PARTY_RECONNECTING,
  isAlone,
  lobbyWindowBody,
  memberClass,
  partyOf,
  showsClosed,
} from "./lobby-window.js";

/** Just enough of an element for the window and the queue line: its tag, class, picture and parts. */
class FakeElement {
  className = "";
  textContent = "";
  src = "";
  alt = "";
  readonly tagName: string;
  readonly children: (FakeElement | string)[] = [];

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly setAttribute = (): void => undefined;

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: (FakeElement | string)[]): void {
    this.children.push(...children);
  }

  find(className: string): FakeElement | undefined {
    for (const child of this.children) {
      if (typeof child === "string") {
        continue;
      }
      const found = child.className === className ? child : child.find(className);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    bot: false,
    away: false,
    playerPubkey: "ab".repeat(32),
    ...overrides,
  };
}

function lobby(players: readonly LobbyPlayerSnapshot[]): LobbySnapshot {
  return {
    selfSessionId: "me",
    code: "ACDEFG",
    phase: "waiting",
    mode: "team-arena",
    mapId: "arena-crossroads",
    teamSize: 4,
    open: true,
    hostId: "host",
    players,
    isHost: false,
    countdownSeconds: null,
    teamLobby: null,
    queueNonce: null,
    ascentRound: null,
    ascentLock: null,
    proposalBuilds: new Map(),
  };
}

describe("the Lobby window's party (#1526, #2385)", () => {
  it("lists the people in lobby order, with the host marked, and no bots", () => {
    const party = partyOf(
      lobby([
        player("host", {
          isHost: true,
        }),
        player("Warrior Bot", { bot: true, team: 0 }),
        player("me"),
      ]),
      null,
    );
    expect(party).toEqual({
      code: "ACDEFG",
      mode: "team-arena",
      teamSize: 4,
      isHost: false,
      open: true,
      members: [
        { name: "host", isHost: true, self: false, away: false },
        { name: "me", isHost: false, self: true, away: false },
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

  it("puts the host's closed padlock before a guest's Lobby closed (#2382)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const guest = {
      ...partyOf(lobby([player("me")]), null),
      isHost: false,
      open: false,
    };
    const body = lobbyWindowBody(guest) as unknown as FakeElement;
    const [glyph, text] = body.find("party-closed")?.children ?? [];
    expect(typeof glyph === "string" ? glyph : [glyph?.tagName, glyph?.src, glyph?.alt]).toEqual([
      "img",
      LOBBY_ICON.closed,
      "",
    ]);
    expect(text).toBe(PARTY_CLOSED);
  });

  it("says it is just you (#2385, #2642)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    expect(PARTY_ALONE).toBe("Just you.");
    const alone = lobbyWindowBody(partyOf(lobby([player("me")]), null));
    expect((alone as unknown as FakeElement).find("lobby-window-alone")?.textContent).toBe(
      PARTY_ALONE,
    );
    const none = lobbyWindowBody(undefined) as unknown as FakeElement;
    expect(none.find("lobby-window-alone")?.textContent).toBe(PARTY_ALONE);
  });

  it("says how long a queued party has looked, and leaves the queue itself to the top bar's icon (#1766, #2743)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const queued = partyOf(lobby([player("me"), player("Ann")]), 65_000);
    expect(queued.queuedMs).toBe(65_000);
    const body = lobbyWindowBody(queued) as unknown as FakeElement;
    expect([body.find("party-status"), body.find("party-queued")]).toEqual([undefined, undefined]);
  });
});
