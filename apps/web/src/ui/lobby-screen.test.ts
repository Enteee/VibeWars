import { MAX_LOBBY_PLAYERS } from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BOT_PROFESSIONS,
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
        team: 0,
        ready: true,
        isHost: true,
        character: null,
        bot: false,
      },
      {
        sessionId: "guest",
        name: "Guest",
        team: 1,
        ready: true,
        isHost: false,
        character: null,
        bot: false,
      },
    ],
    isHost: true,
    countdownSeconds: null,
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
          team: null,
          ready: false,
          isHost: true,
          character: null,
          bot: false,
        },
        {
          sessionId: "guest",
          name: "Guest",
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
    expect(characterLine({ name: "Mhenlo", primary: "monk", secondary: "elementalist" })).toBe(
      "Mhenlo · Monk / Elementalist",
    );
    expect(characterLine({ name: "Cynn", primary: "elementalist", secondary: null })).toBe(
      "Cynn · Elementalist",
    );
  });

  it("calls a player without a usable build a random starter build (#853)", () => {
    expect(characterLine(null)).toBe(RANDOM_STARTER);
  });
});

describe("lobbyControls: Add bot (#1194)", () => {
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

describe("teamColumn: bots (#1194)", () => {
  let added: [number, string][];
  let removed: string[];
  const callbacks = {
    onSelectMap: () => undefined,
    onChooseTeam: () => undefined,
    onToggleReady: () => undefined,
    onStart: () => undefined,
    onLeave: () => undefined,
    onAddBot: (team: 0 | 1, profession: string) => {
      added.push([team, profession]);
    },
    onRemoveBot: (botId: string) => {
      removed.push(botId);
    },
  };
  const bot: LobbyPlayerSnapshot = {
    sessionId: "bot-1",
    name: "Monk Bot",
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

  beforeEach(() => {
    added = [];
    removed = [];
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers the host Add bot on each team, the starter professions Warrior first", () => {
    for (const team of [0, 1] as const) {
      const [control] = column(team, lobby(true)).all("lobby-add-bot");
      const select = control?.children[0];
      expect(select?.children.map((option) => option.textContent)).toEqual([
        "Warrior",
        "Ranger",
        "Monk",
        "Necromancer",
        "Elementalist",
      ]);
    }
    expect(BOT_PROFESSIONS[0]).toBe("warrior");
  });

  it("adds a bot of the chosen profession to that team", () => {
    const [control] = column(0, lobby(true)).all("lobby-add-bot");
    const [select, add] = control?.children ?? [];
    if (select === undefined || add === undefined) {
      throw new Error("no Add bot control");
    }
    select.value = "monk";
    add.click();
    expect(added).toEqual([[0, "monk"]]);
  });

  it("tags a bot's row BOT in place of its ready pill, with the host's × to remove it", () => {
    const team = column(1, lobby(true));
    expect(team.all("bot-tag").map((tag) => tag.textContent)).toEqual(["BOT"]);
    // The guest's row keeps its pill; the bot's is the tag.
    expect(team.all("lobby-ready").map((pill) => pill.textContent)).toEqual(["Ready", "BOT"]);
    const remove = team.all("lobby-remove-bot");
    expect(remove).toHaveLength(1);
    remove[0]?.click();
    expect(removed).toEqual(["bot-1"]);
  });

  it("never offers × on the host's own row", () => {
    expect(column(0, lobby(true)).all("lobby-remove-bot")).toEqual([]);
  });

  it("shows a non-host the bot's tag, but neither Add bot nor ×", () => {
    const team = column(1, lobby(false));
    expect(team.all("bot-tag")).toHaveLength(1);
    expect(team.all("lobby-add-bot")).toEqual([]);
    expect(team.all("lobby-remove-bot")).toEqual([]);
  });

  it("disables Add bot when the lobby is not waiting", () => {
    const [control] = column(0, { ...lobby(true), phase: "in-match" }).all("lobby-add-bot");
    expect(control?.children.every((child) => child.disabled)).toBe(true);
  });
});
