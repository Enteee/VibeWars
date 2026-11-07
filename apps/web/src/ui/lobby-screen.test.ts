import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLAY_BOTS_AFTER_MS,
  MATCH_RUNNING_NOTICE,
  READY_JOIN_A_TEAM,
  READY_MATCH_STARTED,
  hostMaps,
  inviteUrl,
  lobbyControls,
  lobbyPanel,
  mapLabel,
  matchmakingButtons,
  modeLine,
  teamColumn,
  waitingFor,
  type LobbyRelay,
} from "./lobby-screen.js";
import { MAX_RELAYED_PER_HOLDER } from "../net/transport/relay-offer.js";
import { SHARED_RELAY_EXPLANATION } from "./relay-section.js";

function snapshot(phase: LobbySnapshot["phase"]): LobbySnapshot {
  return {
    selfSessionId: "host",
    code: "ACDEFG",
    phase,
    mode: "hosted-game",
    mapId: "arena",
    teamSize: 4,
    open: true,
    hostId: "host-peer",
    players: [
      {
        sessionId: "host",
        name: "Host",
        guildTag: null,
        team: 0,
        ready: true,
        isHost: true,
        bot: false,
        away: false,
        playerPubkey: "ab".repeat(32),
      },
      {
        sessionId: "guest",
        name: "Guest",
        guildTag: null,
        team: 1,
        ready: true,
        isHost: false,
        bot: false,
        away: false,
        playerPubkey: "ab".repeat(32),
      },
    ],
    isHost: true,
    countdownSeconds: null,
    teamLobby: null,
    queueNonce: null,
    ascentRound: null,
    ascentLock: null,
    proposalBuilds: new Map(),
  };
}

describe("lobbyControls", () => {
  it("says the match is running and locks everything but leave", () => {
    expect(lobbyControls(snapshot("in-match"))).toEqual({
      running: MATCH_RUNNING_NOTICE,
      mapDisabled: true,
      teamsDisabled: true,
      readyProblem: READY_MATCH_STARTED,
      startDisabled: true,
      canWatch: false,
    });
  });

  it("locks the controls while a match is starting, without saying one runs", () => {
    expect(lobbyControls(snapshot("starting"))).toEqual({
      running: undefined,
      mapDisabled: true,
      teamsDisabled: true,
      readyProblem: READY_MATCH_STARTED,
      startDisabled: true,
      canWatch: false,
    });
  });

  it("shows no line and opens the controls once the lobby is waiting", () => {
    expect(lobbyControls(snapshot("waiting"))).toEqual({
      running: undefined,
      mapDisabled: false,
      teamsDisabled: false,
      readyProblem: undefined,
      startDisabled: false,
      canWatch: false,
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
          guildTag: null,
          team: null,
          ready: false,
          isHost: true,
          bot: false,
          away: false,
          playerPubkey: "ab".repeat(32),
        },
        {
          sessionId: "guest",
          name: "Guest",
          guildTag: null,
          team: 1,
          ready: false,
          isHost: false,
          bot: false,
          away: false,
          playerPubkey: "ab".repeat(32),
        },
      ],
    });
    expect(controls.readyProblem).toBe(READY_JOIN_A_TEAM);
    expect(controls.startDisabled).toBe(true);
  });

  it("asks one not in the lobby yet to join a team first (#2124)", () => {
    const shown = { ...snapshot("waiting"), selfSessionId: "stranger" };
    expect(lobbyControls(shown).readyProblem).toBe(READY_JOIN_A_TEAM);
  });

  it("offers Watch to a member on no team, only while the match runs (#480)", () => {
    const teamless = (phase: LobbySnapshot["phase"]): LobbySnapshot => {
      const shown = snapshot(phase);
      return {
        ...shown,
        selfSessionId: "watcher",
        isHost: false,
        players: [
          ...shown.players,
          {
            sessionId: "watcher",
            name: "Watcher",
            guildTag: null,
            team: null,
            ready: false,
            isHost: false,
            bot: false,
            away: false,
            playerPubkey: "ab".repeat(32),
          },
        ],
      };
    };
    expect(lobbyControls(teamless("in-match")).canWatch).toBe(true);
    expect(lobbyControls(teamless("waiting")).canWatch).toBe(false);
    expect(lobbyControls(teamless("starting")).canWatch).toBe(false);
    // Seated, the match is played, not watched.
    expect(lobbyControls(snapshot("in-match")).canWatch).toBe(false);
  });
});

describe("inviteUrl (#2100)", () => {
  const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

  it("is the page's own origin and path, with the key as its fragment", () => {
    expect(inviteUrl(KEY, { origin: "https://enteee.github.io", pathname: "/VibeWars/" })).toBe(
      `https://enteee.github.io/VibeWars/#lobby=${KEY}`,
    );
  });

  it("works for a fork or a dev server", () => {
    expect(inviteUrl(KEY, { origin: "http://localhost:5173", pathname: "/" })).toBe(
      `http://localhost:5173/#lobby=${KEY}`,
    );
  });

  it("drops the page's query and old fragment", () => {
    const where = new URL("https://example.org/fork/index.html?stress=1#turn=abc");
    expect(inviteUrl(KEY, where)).toBe(`https://example.org/fork/index.html#lobby=${KEY}`);
  });
});

describe("mapLabel (#444)", () => {
  it("names an arena, then how big it plays", () => {
    expect(
      mapLabel({
        id: "arena-long-hall",
        name: "Long Hall",
        size: "small",
        mode: "annihilation",
        teamSizes: [4],
      }),
    ).toBe("Long Hall (small)");
  });
});

describe("hostMaps (#1453)", () => {
  const maps = [
    {
      id: "arena-crossroads",
      name: "Crossroads",
      size: "small",
      mode: "annihilation",
      teamSizes: [4],
    },
    {
      id: "guild-hall-isle",
      name: "Guild Hall Isle",
      size: "large",
      mode: "guild-battle",
      teamSizes: [4],
    },
    {
      id: "broken-tower",
      name: "Broken Tower",
      size: "large",
      mode: "relic-run",
      teamSizes: [4],
    },
    { id: "ember-pits", name: "Ember Pits", size: "small", mode: "kill-count", teamSizes: [4] },
  ] as const;

  it("offers every map without a filter", () => {
    expect(hostMaps(maps, undefined)).toEqual(maps);
  });

  it("offers only the maps playing one of the filter's modes, in their order", () => {
    expect(hostMaps(maps, ["kill-count", "annihilation"]).map((map) => map.id)).toEqual([
      "arena-crossroads",
      "ember-pits",
    ]);
    expect(hostMaps(maps, ["guild-battle"]).map((map) => map.id)).toEqual(["guild-hall-isle"]);
  });
});

describe("modeLine (#476)", () => {
  it("says what the map's mode is, in a line", () => {
    const map = {
      id: "ember-pits",
      name: "Ember Pits",
      size: "small",
      teamSizes: [4],
    } as const;
    expect(modeLine({ ...map, mode: "kill-count" })).toBe("Kill Count: most kills in 3 minutes");
    expect(modeLine({ ...map, mode: "annihilation" })).toBe("Annihilation: defeat every foe");
    expect(modeLine({ ...map, mode: "relic-run" })).toBe(
      "Relic Run: carry your relic to the altar. Most points in 8 minutes wins.",
    );
    expect(modeLine({ ...map, mode: "king-of-the-hill" })).toBe(
      "King of the Hill: lead your Ghostly Hero onto the altar. Hold it to score; most points in 8 minutes wins.",
    );
  });
});

describe("waitingFor (#580)", () => {
  const player = (name: string, team: 0 | 1 | null, ready: boolean) => ({
    sessionId: name,
    name,
    guildTag: null,
    team,
    ready,
    isHost: false,
    bot: false,
    away: false,
    playerPubkey: "ab".repeat(32),
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

/** Just enough DOM for a team column; the unit tests run in Node. */
class FakeElement {
  tagName = "";
  className = "";
  textContent = "";
  value = "";
  disabled = false;
  hidden = false;
  title = "";
  type = "";
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: () => void): void => {
    this.listeners.set(type, listener);
  };

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    // A select's value is its first option's until one is chosen.
    if (this.value === "" && child.value !== "") {
      this.value = child.value;
    }
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.className.split(" ").includes(name) ? [child] : []),
      ...child.all(name),
    ]);
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

describe("teamColumn: names only (#2029)", () => {
  const callbacks = {
    onSelectMap: () => undefined,
    onChooseTeam: () => undefined,
    onToggleReady: () => undefined,
    onStart: () => undefined,
    onWatch: () => undefined,
    onLeave: () => undefined,
  };
  /** A bot playing a slot nobody claimed, under its character's name. */
  const bot: LobbyPlayerSnapshot = {
    sessionId: "bot-1",
    name: "Mhenlo",
    guildTag: null,
    team: 1,
    ready: true,
    isHost: false,
    bot: true,
    away: false,
    playerPubkey: null,
  };
  const lobby: LobbySnapshot = {
    ...snapshot("waiting"),
    players: [...snapshot("waiting").players, bot],
  };
  const column = (team: 0 | 1): FakeElement =>
    teamColumn(team, lobby, lobbyControls(lobby), callbacks) as unknown as FakeElement;

  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists each player by name and ready pill, with no character and no bot count", () => {
    const team = column(1);
    expect(team.all("player-label-name").map((name) => name.textContent)).toEqual([
      "Guest",
      "Mhenlo",
    ]);
    expect(team.all("lobby-character")).toEqual([]);
    expect(team.all("character-dot")).toEqual([]);
    expect(team.all("lobby-bots")).toEqual([]);
  });

  it("marks no bot: it shows as its slot's character, ready", () => {
    const team = column(1);
    expect(team.all("bot-tag")).toEqual([]);
    expect(team.all("lobby-ready").map((pill) => pill.textContent)).toEqual(["Ready", "Ready"]);
  });

  it("offers Leave on one's own team and Join on the other (#2199)", () => {
    const chosen: (0 | 1 | null)[] = [];
    const choosing = { ...callbacks, onChooseTeam: (team: 0 | 1 | null) => chosen.push(team) };
    const [own] = (
      teamColumn(0, lobby, lobbyControls(lobby), choosing) as unknown as FakeElement
    ).all("lobby-join");
    const [other] = (
      teamColumn(1, lobby, lobbyControls(lobby), choosing) as unknown as FakeElement
    ).all("lobby-join");
    expect([own?.textContent, own?.attributes.get("aria-label"), own?.disabled]).toEqual([
      "Leave",
      "Leave team 1",
      false,
    ]);
    expect([other?.textContent, other?.attributes.get("aria-label")]).toEqual([
      "Join",
      "Join team 2",
    ]);
    own?.click();
    other?.click();
    expect(chosen).toEqual([null, 1]);
  });

  it("disables Leave as it disables Join, outside the waiting phase (#2199)", () => {
    const starting = { ...lobby, phase: "starting" as const };
    const buttons = ([0, 1] as const).flatMap((team) =>
      (
        teamColumn(team, starting, lobbyControls(starting), callbacks) as unknown as FakeElement
      ).all("lobby-join"),
    );
    expect(buttons.map((shown) => [shown.textContent, shown.disabled])).toEqual([
      ["Leave", true],
      ["Join", true],
    ]);
  });
});

describe("matchmakingButtons (#1766)", () => {
  const pressed: string[] = [];
  const matchmaking = (queuedMs: number | null) => ({
    queuedMs,
    onFindMatch: () => pressed.push("find"),
    onLeaveQueue: () => pressed.push("leave"),
    onPlayBots: () => pressed.push("bots"),
  });
  const labels = (queuedMs: number | null, phase: LobbySnapshot["phase"] = "waiting") =>
    (
      matchmakingButtons(
        matchmaking(queuedMs),
        lobbyControls(snapshot(phase)),
      ) as unknown as FakeElement[]
    ).map((shown) => [shown.textContent, shown.disabled]);

  beforeEach(() => {
    pressed.length = 0;
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers Find a match until queued, and only while the lobby waits", () => {
    expect(labels(null)).toEqual([["Find a match", false]]);
    expect(labels(null, "team-lobby")).toEqual([["Find a match", true]]);
  });

  it("offers Leave the queue once queued, and Play against bots only after a minute alone (Q191)", () => {
    expect(labels(0)).toEqual([["Leave the queue", false]]);
    expect(labels(PLAY_BOTS_AFTER_MS - 1)).toEqual([["Leave the queue", false]]);
    expect(labels(PLAY_BOTS_AFTER_MS)).toEqual([
      ["Play against bots", false],
      ["Leave the queue", false],
    ]);
    const [bots, leave] = matchmakingButtons(
      matchmaking(PLAY_BOTS_AFTER_MS),
      lobbyControls(snapshot("waiting")),
    ) as unknown as FakeElement[];
    bots?.click();
    leave?.click();
    expect(pressed).toEqual(["bots", "leave"]);
  });
  it("never offers Heroes' Ascent bots: it waits for a side (#1996)", () => {
    const shown = matchmakingButtons(
      { ...matchmaking(10 * PLAY_BOTS_AFTER_MS), onPlayBots: undefined },
      lobbyControls(snapshot("waiting")),
    ) as unknown as FakeElement[];
    expect(shown.map((button) => button.textContent)).toEqual(["Leave the queue"]);
  });
});

describe("lobbyPanel: the map (#1994)", () => {
  const callbacks = {
    onSelectMap: () => undefined,
    onChooseTeam: () => undefined,
    onToggleReady: () => undefined,
    onStart: () => undefined,
    onWatch: () => undefined,
    onSetBots: () => undefined,
  };
  const maps = [
    {
      id: "arena-crossroads",
      name: "Crossroads",
      size: "small",
      mode: "annihilation",
      teamSizes: [2, 4],
    },
    { id: "ember-pits", name: "Ember Pits", size: "small", mode: "kill-count", teamSizes: [4] },
  ] as const;
  /** The map part of the host's bar in `mode`, on Crossroads. */
  const mapPart = (mode: LobbySnapshot["mode"]): FakeElement => {
    const shown = { ...snapshot("waiting"), mode, mapId: "arena-crossroads" };
    const [part] = lobbyPanel(shown, callbacks, undefined, maps).status;
    return part as unknown as FakeElement;
  };
  const selects = (part: FakeElement): FakeElement[] =>
    part.children.filter((child) => child.tagName === "select");

  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: (tagName: string) => Object.assign(new FakeElement(), { tagName }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets only a Hosted Game's host pick it", () => {
    expect(selects(mapPart("hosted-game"))).toHaveLength(1);
  });

  it("lists only the maps made for a Hosted Game's team size (#2104)", () => {
    const [select] = selects(mapPart("hosted-game"));
    expect(select?.children.map((option) => option.value)).toEqual([
      "arena-crossroads",
      "ember-pits",
    ]);
    const twos = { ...snapshot("waiting"), mapId: "arena-crossroads", teamSize: 2 };
    const [part] = lobbyPanel(twos, callbacks, undefined, maps).status;
    // Crossroads alone: nothing to pick.
    expect(selects(part as unknown as FakeElement)).toEqual([]);
  });

  it("says Team Arena draws it, with no picker", () => {
    const part = mapPart("team-arena");
    expect(selects(part)).toEqual([]);
    expect(part.textContent).toBe("Map: random (Team Arena)");
  });

  it("names Heroes' Ascent's, with no picker", () => {
    const part = mapPart("heroes-ascent");
    expect(selects(part)).toEqual([]);
    expect(part.textContent).toBe("Map: Crossroads (small)");
  });

  it("says on a disabled Ready why, and nothing on an enabled one (#2124)", () => {
    const readyOf = (shown: LobbySnapshot): FakeElement => {
      const [ready] = lobbyPanel(shown, callbacks, undefined, maps).actions;
      return ready as unknown as FakeElement;
    };
    const started = readyOf(snapshot("starting"));
    expect(started.disabled).toBe(true);
    expect(started.title).toBe(READY_MATCH_STARTED);
    const open = readyOf(snapshot("waiting"));
    expect(open.disabled).toBe(false);
    expect(open.title).toBe("");
  });

  /** The mode line under the bar in `mode`, on Crossroads. */
  const modeLines = (mode: LobbySnapshot["mode"]): string[] => {
    const shown = { ...snapshot("waiting"), mode, mapId: "arena-crossroads" };
    const { body } = lobbyPanel(shown, callbacks, undefined, maps);
    return (body as unknown as FakeElement).all("lobby-mode").map((line) => line.textContent);
  };

  it("has no mode line for Team Arena before its draw, not its placeholder map's (#2642)", () => {
    expect(modeLines("team-arena")).toEqual([]);
  });

  it("names the mode of a map that is set", () => {
    expect(modeLines("hosted-game")).toEqual(["Annihilation: defeat every foe"]);
  });

  it("names a queued Heroes' Ascent's round map and its mode, not the lobby's (#1996)", () => {
    const ascent = [
      {
        id: "broken-tower",
        name: "Broken Tower",
        size: "medium",
        mode: "relic-run",
        teamSizes: [4, 8],
      },
      {
        id: "scarred-earth",
        name: "Scarred Earth",
        size: "medium",
        mode: "capture-points",
        teamSizes: [4, 8],
      },
    ] as const;
    const queued = {
      ...snapshot("waiting"),
      mode: "heroes-ascent",
      mapId: "broken-tower",
      ascentRound: 1,
    } as const;
    const { status, body } = lobbyPanel(queued, callbacks, undefined, ascent);
    expect((status[0] as unknown as FakeElement).textContent).toBe("Map: Scarred Earth (medium)");
    expect(
      (body as unknown as FakeElement).all("lobby-mode").map((line) => line.textContent),
    ).toEqual([
      "Capture Points: stand on shrines to take them. Each shrine you own scores every 30 s.",
    ]);
  });
});

describe("lobbyPanel: shared relays (#2531)", () => {
  const callbacks = {
    onSelectMap: () => undefined,
    onChooseTeam: () => undefined,
    onToggleReady: () => undefined,
    onStart: () => undefined,
    onWatch: () => undefined,
  };
  /** The panel's lines of `className` for a guest whose relay status is `relay`. */
  const lines = (className: string, relay?: LobbyRelay, shown = snapshot("waiting")): string[] => {
    const { body } = lobbyPanel(shown, callbacks, undefined, [], undefined, relay);
    return (body as unknown as FakeElement).all(className).map((line) => line.textContent);
  };

  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: (tagName: string) => Object.assign(new FakeElement(), { tagName }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the member whose relay a relayed member goes through", () => {
    expect(lines("relay-shared-by", { relayedVia: "guest", sharingWith: 0 })).toEqual([
      "Relay shared by Guest",
    ]);
  });

  it("follows an in-place switch to another holder", () => {
    expect(lines("relay-shared-by", { relayedVia: "host", sharingWith: 0 })).toEqual([
      "Relay shared by Host",
    ]);
  });

  it("says nothing connected directly, through its own relay, or via a holder who left", () => {
    expect(lines("relay-shared-by", { relayedVia: undefined, sharingWith: 0 })).toEqual([]);
    expect(lines("relay-shared-by")).toEqual([]);
    expect(lines("relay-shared-by", { relayedVia: "gone", sharingWith: 0 })).toEqual([]);
  });

  it("shows a name as text, whatever it holds", () => {
    const base = snapshot("waiting");
    const shown = {
      ...base,
      players: base.players.map((p) =>
        p.sessionId === "guest" ? { ...p, name: "<b>Ann</b>" } : p,
      ),
    };
    expect(lines("relay-shared-by", { relayedVia: "guest", sharingWith: 0 }, shown)).toEqual([
      "Relay shared by <b>Ann</b>",
    ]);
  });

  it("tells a holder how many players it shares with, and when it is at the limit", () => {
    const sharing = (count: number): string[] =>
      lines("relay-sharing", { relayedVia: undefined, sharingWith: count });
    expect(sharing(0)).toEqual([]);
    expect(sharing(1)).toEqual(["Sharing your relay with 1 player"]);
    expect(sharing(3)).toEqual(["Sharing your relay with 3 players"]);
    expect(sharing(MAX_RELAYED_PER_HOLDER)).toEqual([
      "Sharing your relay with 8 players (limit reached)",
    ]);
  });

  it("puts the holder's line under the roster", () => {
    const { body } = lobbyPanel(snapshot("waiting"), callbacks, undefined, [], undefined, {
      relayedVia: undefined,
      sharingWith: 2,
    });
    const classes = (body as unknown as FakeElement).children.map((child) => child.className);
    expect(classes.indexOf("screen-info relay-sharing")).toBe(classes.indexOf("lobby-teams") + 1);
  });
});

describe("Options: what sharing a relay means (#2531)", () => {
  it("says any lobby you are in, a 1 hour login each, the per-lobby cap and the hardening", () => {
    expect(SHARED_RELAY_EXPLANATION).toContain("any lobby you are in, not only ones you host");
    expect(SHARED_RELAY_EXPLANATION).toContain("their own login, good for 1 hour");
    expect(SHARED_RELAY_EXPLANATION).toContain("at most 8 players a lobby");
    expect(SHARED_RELAY_EXPLANATION).toContain("denied-peer-ip");
  });
});
