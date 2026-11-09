import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import { LOBBY_ICON } from "./icons.js";

import { isAlone, lobbyWindowBody, memberClass, partyOf, showsClosed } from "./lobby-window.js";

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

  type = "";
  title = "";
  readonly listeners = new Map<string, () => void>();

  readonly setAttribute = (): void => undefined;

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  /** Every descendant of `className`, in order. */
  findAll(className: string): FakeElement[] {
    return this.children.flatMap((child) =>
      typeof child === "string"
        ? []
        : [...(child.className === className ? [child] : []), ...child.findAll(className)],
    );
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: (FakeElement | string)[]): void {
    this.children.push(...children);
  }

  prepend(child: FakeElement): void {
    this.children.unshift(child);
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
      false,
    );
    expect(party).toEqual({
      code: "ACDEFG",
      mode: "team-arena",
      teamSize: 4,
      isHost: false,
      open: true,
      members: [
        {
          id: "host",
          name: "host",
          signet: expect.any(Number),
          isHost: true,
          self: false,
          away: false,
        },
        {
          id: "me",
          name: "me",
          signet: expect.any(Number),
          isHost: false,
          self: true,
          away: false,
        },
      ],
      queuedMs: null,
      removable: true,
    });
    expect(isAlone(party)).toBe(false);
  });

  it("greys a member whose connection dropped, and says it is reconnecting (#1764)", () => {
    const party = partyOf(
      lobby([player("me"), player("friend", { away: true, team: 1 })]),
      null,
      false,
    );
    const [me, friend] = party.members;
    if (me === undefined || friend === undefined) {
      throw new Error("two members");
    }
    expect(friend.away).toBe(true);
    expect(memberClass(friend)).toBe("party-member is-away");
    expect(memberClass(me)).toBe("party-member is-self");
    expect(t("lobbyWindow.reconnecting")).toBe("Reconnecting…");
    // Still in the party: it may yet come back.
    expect(isAlone(party)).toBe(false);
  });

  it("is alone with only bots for company, and with no lobby at all", () => {
    expect(isAlone(partyOf(lobby([player("me"), player("Bot", { bot: true })]), null, false))).toBe(
      true,
    );
    expect(isAlone(undefined)).toBe(true);
  });

  it("tells a guest its host has the lobby closed, and nothing while open; the host never (#1682)", () => {
    const party = (isHost: boolean, open: boolean) =>
      showsClosed({ ...partyOf(lobby([player("me")]), null, false), isHost, open });
    expect(party(false, false)).toBe(true);
    expect(party(false, true)).toBe(false);
    expect(party(true, false)).toBe(false);
  });

  it("puts the host's closed padlock before a guest's Lobby closed (#2382)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const guest = {
      ...partyOf(lobby([player("me")]), null, false),
      isHost: false,
      open: false,
    };
    const body = lobbyWindowBody(guest, () => undefined) as unknown as FakeElement;
    const [glyph, text] = body.find("party-closed")?.children ?? [];
    expect(typeof glyph === "string" ? glyph : [glyph?.tagName, glyph?.src, glyph?.alt]).toEqual([
      "img",
      LOBBY_ICON.closed,
      "",
    ]);
    expect(text).toBe(t("lobbyWindow.closed"));
  });

  it("signs each member's name, and leaves a keyless one bare (#2820)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const party = partyOf(
      lobby([player("host"), player("me", { playerPubkey: null })]),
      null,
      false,
    );
    const body = lobbyWindowBody(party, () => undefined) as unknown as FakeElement;
    const rows = body.find("party-members")?.children as FakeElement[];
    expect(rows.map((row) => (row.find("party-member-name")?.find("signet") ? 1 : 0))).toEqual([
      1, 0,
    ]);
  });

  it("says it is just you (#2385, #2642)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    expect(t("lobbyWindow.alone")).toBe("Just you.");
    const alone = lobbyWindowBody(partyOf(lobby([player("me")]), null, false), () => undefined);
    expect((alone as unknown as FakeElement).find("lobby-window-alone")?.textContent).toBe(
      t("lobbyWindow.alone"),
    );
    const none = lobbyWindowBody(undefined, () => undefined) as unknown as FakeElement;
    expect(none.find("lobby-window-alone")?.textContent).toBe(t("lobbyWindow.alone"));
  });

  it("says how long a queued party has looked, and leaves the queue itself to the top bar's icon (#1766, #2743)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const queued = partyOf(lobby([player("me"), player("Ann")]), 65_000, false);
    expect(queued.queuedMs).toBe(65_000);
    const body = lobbyWindowBody(queued, () => undefined) as unknown as FakeElement;
    expect([body.find("party-status"), body.find("party-queued")]).toEqual([undefined, undefined]);
  });

  it("gives the host an (x) by each other member, not its own row, and none in a match (#2746)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const players = [
      player("me", { isHost: true }),
      player("Ann"),
      player("Bot", { bot: true }),
      player("Bo"),
    ];
    const hosting = { ...lobby(players), isHost: true, hostId: "me" };
    const removed: string[] = [];
    const body = lobbyWindowBody(partyOf(hosting, null, false), (member) => {
      removed.push(member.id);
    }) as unknown as FakeElement;
    const buttons = body.findAll("party-member-remove");
    expect(buttons.map((button) => button.title)).toEqual([
      "Remove Ann from the lobby",
      "Remove Bo from the lobby",
    ]);
    buttons[1]?.listeners.get("click")?.();
    expect(removed).toEqual(["Bo"]);
  });

  it.each([
    ["starting", "starting", false],
    ["in its match", "in-match", false],
    ["matchmade", "waiting", true],
  ] as const)("gives a host no (x) in a lobby %s (#2746)", (_, phase, matchmade) => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const players = [player("me", { isHost: true }), player("Ann")];
    const party = partyOf(
      { ...lobby(players), isHost: true, hostId: "me", phase },
      null,
      matchmade,
    );
    const body = lobbyWindowBody(party, () => undefined) as unknown as FakeElement;
    expect(body.findAll("party-member-remove")).toEqual([]);
  });

  it("gives a guest no (x) (#2746)", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const guest = partyOf(lobby([player("host", { isHost: true }), player("me")]), null, false);
    const body = lobbyWindowBody(guest, () => undefined) as unknown as FakeElement;
    expect(body.findAll("party-member-remove")).toEqual([]);
  });
});
