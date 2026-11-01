import { MAX_LOBBY_PLAYERS } from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOUSE_TEAM_AFTER_MS,
  RANDOM_STARTER,
  MATCH_RUNNING_NOTICE,
  characterLine,
  displayLobbyCode,
  hostMaps,
  lobbyControls,
  lobbyPanel,
  mapLabel,
  matchmakingButtons,
  modeLine,
  teamColumn,
  waitingFor,
} from "./lobby-screen.js";

function snapshot(phase: LobbySnapshot["phase"]): LobbySnapshot {
  return {
    selfSessionId: "host",
    code: "ACDEFG",
    phase,
    mode: "hosted-game",
    mapId: "arena",
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
        character: null,
        bot: false,
        away: false,
      },
      {
        sessionId: "guest",
        name: "Guest",
        guildTag: null,
        team: 1,
        ready: true,
        isHost: false,
        character: null,
        bot: false,
        away: false,
      },
    ],
    isHost: true,
    countdownSeconds: null,
    teamLobby: null,
    queueNonce: null,
    proposalBuilds: new Map(),
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
      botsDisabled: true,
      canWatch: false,
    });
  });

  it("locks the controls while a match is starting, without saying one runs", () => {
    expect(lobbyControls(snapshot("starting"))).toEqual({
      running: undefined,
      mapDisabled: true,
      teamsDisabled: true,
      readyDisabled: true,
      startDisabled: true,
      botsDisabled: true,
      canWatch: false,
    });
  });

  it("shows no line and opens the controls once the lobby is waiting", () => {
    expect(lobbyControls(snapshot("waiting"))).toEqual({
      running: undefined,
      mapDisabled: false,
      teamsDisabled: false,
      readyDisabled: false,
      startDisabled: false,
      botsDisabled: false,
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
          character: null,
          bot: false,
          away: false,
        },
        {
          sessionId: "guest",
          name: "Guest",
          guildTag: null,
          team: 1,
          ready: false,
          isHost: false,
          character: null,
          bot: false,
          away: false,
        },
      ],
    });
    expect(controls.readyDisabled).toBe(true);
    expect(controls.startDisabled).toBe(true);
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
            character: null,
            bot: false,
            away: false,
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

describe("displayLobbyCode", () => {
  it("reads a twelve-symbol key as three fours, the way it is read aloud (#1681)", () => {
    expect(displayLobbyCode("ACDEFGHJKMNP")).toBe("ACDE-FGHJ-KMNP");
  });
});

describe("mapLabel (#444)", () => {
  it("names an arena, then how big it plays", () => {
    expect(
      mapLabel({ id: "arena-long-hall", name: "Long Hall", size: "large", mode: "annihilation" }),
    ).toBe("Long Hall (large)");
  });
});

describe("hostMaps (#1453)", () => {
  const maps = [
    { id: "arena-alpha", name: "Alpha", size: "small", mode: "annihilation" },
    { id: "guild-hall-isle", name: "Guild Hall Isle", size: "large", mode: "guild-battle" },
    { id: "relic-temples", name: "Relic Temples", size: "large", mode: "relic-run" },
    { id: "arena-open", name: "Open", size: "small", mode: "kill-count" },
  ] as const;

  it("offers every map without a filter", () => {
    expect(hostMaps(maps, undefined)).toEqual(maps);
  });

  it("offers only the maps playing one of the filter's modes, in their order", () => {
    expect(hostMaps(maps, ["kill-count", "annihilation"]).map((map) => map.id)).toEqual([
      "arena-alpha",
      "arena-open",
    ]);
    expect(hostMaps(maps, ["guild-battle"]).map((map) => map.id)).toEqual(["guild-hall-isle"]);
  });
});

describe("modeLine (#476)", () => {
  it("says what the map's mode is, in a line", () => {
    const map = { id: "arena-pillars", name: "Pillar Hall", size: "small" } as const;
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
    character: null,
    bot: false,
    away: false,
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
    expect(
      characterLine({ name: "Mhenlo", primary: "monk", secondary: "elementalist" }, false),
    ).toBe("Mhenlo · Monk / Elementalist");
    expect(characterLine({ name: "Cynn", primary: "elementalist", secondary: null }, false)).toBe(
      "Cynn · Elementalist",
    );
  });

  it("gives a bot its professions alone: its character is named after it (#1241)", () => {
    expect(characterLine({ name: "Bot 1", primary: "warrior", secondary: "monk" }, true)).toBe(
      "Warrior / Monk",
    );
  });

  it("calls a player without a usable build a random starter build (#853)", () => {
    expect(characterLine(null, false)).toBe(RANDOM_STARTER);
  });
});

describe("lobbyControls: the bot count's + (#1194, #1454)", () => {
  it("is disabled once every seat is taken, bots counting", () => {
    const waiting = snapshot("waiting");
    const full = Array.from({ length: MAX_LOBBY_PLAYERS }, (_, n) => ({
      ...waiting.players[1],
      sessionId: `p${String(n)}`,
    })) as LobbyPlayerSnapshot[];
    expect(lobbyControls({ ...waiting, players: full }).botsDisabled).toBe(true);
    expect(lobbyControls(waiting).botsDisabled).toBe(false);
  });

  it("starts a lobby of only the host's bots, since a bot is always ready (Q133)", () => {
    const waiting = snapshot("waiting");
    const host = { ...waiting.players[0], team: null } as LobbyPlayerSnapshot;
    const bot: LobbyPlayerSnapshot = {
      sessionId: "bot-1",
      name: "Monk Bot",
      guildTag: null,
      team: 1,
      ready: true,
      isHost: false,
      character: { name: "Monk Bot", primary: "monk", secondary: "warrior" },
      bot: true,
      away: false,
    };
    expect(lobbyControls({ ...waiting, players: [host, bot] }).startDisabled).toBe(false);
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

describe("teamColumn: bots (#1194, #1454)", () => {
  let set: [number, number][];
  const callbacks = {
    onSelectMap: () => undefined,
    onChooseTeam: () => undefined,
    onToggleReady: () => undefined,
    onStart: () => undefined,
    onWatch: () => undefined,
    onLeave: () => undefined,
    onSetBots: (team: 0 | 1, count: number) => {
      set.push([team, count]);
    },
  };
  const bot: LobbyPlayerSnapshot = {
    sessionId: "bot-1",
    name: "Monk Bot",
    guildTag: null,
    team: 1,
    ready: true,
    isHost: false,
    character: null,
    bot: true,
    away: false,
  };
  const lobby = (isHost: boolean): LobbySnapshot => {
    const waiting = snapshot("waiting");
    return {
      ...waiting,
      selfSessionId: isHost ? "host" : "guest",
      isHost,
      players: [...waiting.players, bot],
    };
  };
  const column = (team: 0 | 1, shown: LobbySnapshot): FakeElement =>
    teamColumn(team, shown, lobbyControls(shown), callbacks) as unknown as FakeElement;
  /** The host's − and + for `team`. */
  const stepper = (team: 0 | 1, shown: LobbySnapshot) => {
    const shownColumn = column(team, shown);
    const [fewer] = shownColumn.all("lobby-bots-fewer");
    const [more] = shownColumn.all("lobby-bots-more");
    const [count] = shownColumn.all("lobby-bot-count");
    if (fewer === undefined || more === undefined || count === undefined) {
      throw new Error("no bot count stepper");
    }
    return { fewer, more, count };
  };

  beforeEach(() => {
    set = [];
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the host each side's bot count with − and +, which ask for one fewer or more", () => {
    const team2 = stepper(1, lobby(true));
    expect(team2.count.textContent).toBe("1");
    team2.more.click();
    team2.fewer.click();
    const team1 = stepper(0, lobby(true));
    expect(team1.count.textContent).toBe("0");
    team1.more.click();
    expect(set).toEqual([
      [1, 2],
      [1, 0],
      [0, 1],
    ]);
  });

  it("disables − at no bots, + in a full lobby, and both outside waiting", () => {
    expect(stepper(0, lobby(true)).fewer.disabled).toBe(true);
    expect(stepper(1, lobby(true)).fewer.disabled).toBe(false);
    expect(stepper(1, lobby(true)).more.disabled).toBe(false);
    const full = Array.from({ length: MAX_LOBBY_PLAYERS }, (_, n) => ({
      ...bot,
      sessionId: `bot-${String(n)}`,
    }));
    const crowded = stepper(1, { ...lobby(true), players: full });
    expect([crowded.fewer.disabled, crowded.more.disabled]).toEqual([false, true]);
    const playing = stepper(1, { ...lobby(true), phase: "in-match" });
    expect([playing.fewer.disabled, playing.more.disabled]).toEqual([true, true]);
  });

  it("shows a non-host the count alone, and the bot's row without a ×", () => {
    const team = column(1, lobby(false));
    expect(team.all("lobby-bots").map((count) => count.textContent)).toEqual(["Bots: 1"]);
    expect(team.all("lobby-bots-more")).toEqual([]);
    expect(team.all("lobby-bots-fewer")).toEqual([]);
    expect(team.all("bot-tag")).toHaveLength(1);
  });

  it("tags a bot's row BOT in place of its ready pill", () => {
    const team = column(1, lobby(true));
    expect(team.all("bot-tag").map((tag) => tag.textContent)).toEqual(["BOT"]);
    // The guest's row keeps its pill; the bot's is the tag.
    expect(team.all("lobby-ready").map((pill) => pill.textContent)).toEqual(["Ready", "BOT"]);
  });

  it("has no bot count on a team mode's one side: its empty seats are bots (#1766)", () => {
    const shown = lobby(true);
    const side = teamColumn(
      0,
      shown,
      lobbyControls(shown),
      callbacks,
      false,
    ) as unknown as FakeElement;
    expect(side.all("lobby-bots")).toEqual([]);
  });
});

describe("matchmakingButtons (#1766)", () => {
  const pressed: string[] = [];
  const matchmaking = (queuedMs: number | null) => ({
    queuedMs,
    onFindMatch: () => pressed.push("find"),
    onLeaveQueue: () => pressed.push("leave"),
    onPlayHouseTeam: () => pressed.push("house"),
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

  it("offers Leave the queue once queued, and the house team only after a minute alone (Q191)", () => {
    expect(labels(0)).toEqual([["Leave the queue", false]]);
    expect(labels(HOUSE_TEAM_AFTER_MS - 1)).toEqual([["Leave the queue", false]]);
    expect(labels(HOUSE_TEAM_AFTER_MS)).toEqual([
      ["Play the house team", false],
      ["Leave the queue", false],
    ]);
    const [house, leave] = matchmakingButtons(
      matchmaking(HOUSE_TEAM_AFTER_MS),
      lobbyControls(snapshot("waiting")),
    ) as unknown as FakeElement[];
    house?.click();
    leave?.click();
    expect(pressed).toEqual(["house", "leave"]);
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
    { id: "arena-alpha", name: "Alpha", size: "small", mode: "annihilation" },
    { id: "arena-open", name: "Open", size: "small", mode: "kill-count" },
  ] as const;
  /** The map part of the host's bar in `mode`, on Alpha. */
  const mapPart = (mode: LobbySnapshot["mode"]): FakeElement => {
    const shown = { ...snapshot("waiting"), mode, mapId: "arena-alpha" };
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

  it("says Team Arena draws it, with no picker", () => {
    const part = mapPart("team-arena");
    expect(selects(part)).toEqual([]);
    expect(part.textContent).toBe("Map: random (Team Arena)");
  });

  it("names Heroes' Ascent's, with no picker", () => {
    const part = mapPart("heroes-ascent");
    expect(selects(part)).toEqual([]);
    expect(part.textContent).toBe("Map: Alpha (small)");
  });

  /** The mode line under the bar in `mode`, on Alpha. */
  const modeLines = (mode: LobbySnapshot["mode"]): string[] => {
    const shown = { ...snapshot("waiting"), mode, mapId: "arena-alpha" };
    const { body } = lobbyPanel(shown, callbacks, undefined, maps);
    return (body as unknown as FakeElement).all("lobby-mode").map((line) => line.textContent);
  };

  it("names what Team Arena's draw can play, not its placeholder map's mode", () => {
    expect(modeLines("team-arena")).toEqual(["Annihilation or Kill Count: drawn at the start"]);
  });

  it("names the mode of a map that is set", () => {
    expect(modeLines("hosted-game")).toEqual(["Annihilation: defeat every foe"]);
  });
});
