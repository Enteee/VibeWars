import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOUSE_TEAM_AFTER_MS,
  MATCH_RUNNING_NOTICE,
  displayLobbyCode,
  hostMaps,
  lobbyControls,
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

/** Just enough DOM for a team column; the unit tests run in Node. */
class FakeElement {
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
