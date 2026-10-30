import { MAX_LOBBY_PLAYERS } from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RANDOM_STARTER,
  MATCH_RUNNING_NOTICE,
  characterLine,
  displayLobbyCode,
  lobbyControls,
  mapLabel,
  modeLine,
  teamColumn,
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
      {
        sessionId: "host",
        name: "Host",
        guildTag: null,
        team: 0,
        ready: true,
        isHost: true,
        character: null,
        bot: false,
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
      },
    ],
    isHost: true,
    countdownSeconds: null,
    teamLobby: null,
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
    expect(
      mapLabel({ id: "arena-long-hall", name: "Long Hall", size: "large", mode: "annihilation" }),
    ).toBe("Long Hall (large)");
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
    };
    expect(lobbyControls({ ...waiting, players: [host, bot] }).startDisabled).toBe(false);
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

describe("teamColumn: bots (#1194, #1454)", () => {
  let set: [number, number][];
  const callbacks = {
    onSelectMap: () => undefined,
    onChooseTeam: () => undefined,
    onToggleReady: () => undefined,
    onStart: () => undefined,
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
});
