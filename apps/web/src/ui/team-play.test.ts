import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../i18n/index.js";
import { ARENA_MAPS, modeMapIds } from "../net/maps.js";
import {
  TEAM_SCHEMA_VERSION,
  type StoredTeam,
  type TeamCharacter,
  type TeamBuildSize,
} from "../storage/schema.js";
import type { FigureLook } from "./character-card.js";
import type * as Figure from "./character-figure.js";
import { mapLabel, type LobbyMap } from "./lobby-screen.js";
import {
  noTeamBuilds,
  renderHostScreen,
  renderTeamBuilder,
  type HostEntry,
  type TeamPlayCallbacks,
} from "./team-play.js";

// The figure draws on a canvas, which Node has none of: a bare one,
// naming what it holds as the real one does.
vi.mock("./character-figure.js", async (original) => ({
  ...(await original<typeof Figure>()),
  createCharacterFigure: (look: FigureLook) => {
    const canvas = document.createElement("canvas");
    canvas.className = "character-figure";
    if (look.appearance.weaponId !== undefined) {
      canvas.setAttribute("data-weapon-id", look.appearance.weaponId);
    }
    return canvas;
  },
}));

function team(id: string, size: TeamBuildSize = 4): StoredTeam {
  return {
    schemaVersion: TEAM_SCHEMA_VERSION,
    id,
    name: `Team ${id}`,
    size,
    members: [],
    rulesetId: "minimal-gw-inspired-pvp-v1",
    updatedAt: 1,
  };
}

/** A Warrior named `name`, a sword and a shield in hand. */
function warrior(name: string): TeamCharacter {
  return {
    id: name,
    name,
    primaryProfession: "warrior",
    secondaryProfession: undefined,
    attributes: [],
    skillBar: ["warrior.backbreaker", null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("warrior"),
  };
}

/** The ids of the arenas `entry`'s lobby lets its host pick (#1526), in `ARENA_MAPS`' order. */
function hostMapIds(entry: HostEntry): string[] {
  const ids = modeMapIds()[entry];
  return ARENA_MAPS.map((map) => map.id).filter((id) => ids.includes(id));
}

describe("the lobby screens' maps (#1453, #1525, #1526)", () => {
  it("host on every map from Hosted Game", () => {
    expect(hostMapIds("hosted-game")).toEqual(ARENA_MAPS.map((map) => map.id));
  });

  it("host on each team mode's own maps", () => {
    const modesOf = (entry: HostEntry): string[] => {
      const ids = hostMapIds(entry);
      return [...new Set(ARENA_MAPS.filter((map) => ids.includes(map.id)).map((map) => map.mode))];
    };
    expect(modesOf("team-arena").sort()).toEqual(
      ["annihilation", "kill-count", "priest-annihilation"].sort(),
    );
    expect(modesOf("heroes-ascent").sort()).toEqual(
      [
        "annihilation",
        "capture-points",
        "king-of-the-hill",
        "priest-annihilation",
        "relic-run",
      ].sort(),
    );
    expect(modesOf("gvg")).toEqual(["guild-battle"]);
  });
});

/** Just enough DOM to render the team screens; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  value = "";
  placeholder = "";
  title = "";
  src = "";
  alt = "";
  width = 0;
  height = 0;
  maxLength = -1;
  hidden = false;
  type = "";
  disabled = false;
  readonly children: FakeElement[] = [];
  parent: FakeElement | undefined;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly classList = { add: () => undefined, toggle: () => undefined };
  readonly style = { width: "", height: "", setProperty: () => undefined };

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: () => void): void => {
    this.listeners.set(type, listener);
  };

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    child.parent = this;
    return child;
  }

  replaceWith(next: FakeElement): void {
    const siblings = this.parent?.children ?? [];
    siblings.splice(siblings.indexOf(this), 1, next);
    next.parent = this.parent;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.className.split(" ").includes(name) ? [child] : []),
      ...child.all(name),
    ]);
  }

  /** Every element under this one, in document order. */
  everything(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.everything()]);
  }

  focus(): void {
    // Nothing to show it on.
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

describe("the team screens' Team Builds (#1515, #1525, #2031)", () => {
  let edited: string[];
  let added: number;
  let cloned: string[];
  let rerolled: string[];
  let leftQueue: number;
  /** The starter team ids by size (#2147). */
  let starterIds: Map<string, string>;
  const callbacks: TeamPlayCallbacks = {
    onSwitch: () => undefined,
    onNewTeam: () => {
      added += 1;
    },
    onEditTeam: (id) => {
      edited.push(id);
    },
    onPasteTeam: () => undefined,
    onCloneStarterTeam: (id) => {
      cloned.push(id);
    },
    onRerollTeam: (id) => {
      rerolled.push(id);
    },
    onLeaveQueue: () => {
      leftQueue += 1;
    },
  };
  const render = (teams: readonly StoredTeam[]): FakeElement => {
    const root = new FakeElement();
    renderTeamBuilder(root as unknown as HTMLElement, teams, [], undefined, callbacks);
    return root;
  };
  const host = (entry: HostEntry, queuedMaps?: readonly LobbyMap[]): FakeElement => {
    const root = new FakeElement();
    renderHostScreen(
      root as unknown as HTMLElement,
      entry,
      [],
      undefined,
      callbacks,
      undefined,
      queuedMaps,
    );
    return root;
  };

  beforeEach(() => {
    edited = [];
    added = 0;
    cloned = [];
    rerolled = [];
    leftQueue = 0;
    starterIds = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        starterIds.get(/\.starterTeamId\.(\d+)$/.exec(key)?.[1] ?? "") ?? null,
    });
    vi.stubGlobal("window", { addEventListener: () => undefined });
    vi.stubGlobal("document", {
      addEventListener: () => undefined,
      createElement: () => new FakeElement(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists each Team Build, then New team build last, and no None", () => {
    const root = render([team("a"), team("b")]);
    const [cards] = root.all("play-cards");
    expect(cards?.children.map((card) => card.className)).toEqual([
      "play-card",
      "play-card",
      "play-card play-card-new",
    ]);
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual([
      "Team a",
      "Team b",
    ]);
    expect(root.everything().some((node) => node.textContent === "None")).toBe(false);
    expect(
      root
        .everything()
        .some(
          (node) => node.attributes.has("aria-pressed") && node.className.startsWith("play-card"),
        ),
    ).toBe(false);
    expect(root.everything().some((node) => node.textContent === "Team Builds")).toBe(true);
  });

  it("opens a card in the editor, as its Edit does: a card is no pick", () => {
    const root = render([team("a"), team("b")]);
    root.all("play-card-open")[1]?.click();
    root.all("play-card-edit")[0]?.click();
    root.all("play-card-new")[0]?.click();
    expect(edited).toEqual(["b", "a"]);
    expect(added).toBe(1);
  });

  it("shows each member as a row holding its weapons, with its skills, and no name (#1864)", () => {
    const root = render([
      {
        ...team("a"),
        members: [{ character: warrior("Ser Bash") }, { character: warrior("Ser Clang") }],
      },
    ]);
    const rows = root.all("play-card-member");
    expect(rows.map((row) => row.className)).toEqual([
      "character-card-row play-card-member",
      "character-card-row play-card-member",
    ]);
    expect(rows.map((row) => row.attributes.get("aria-label"))).toEqual([
      "Ser Bash, Warrior",
      "Ser Clang, Warrior",
    ]);
    for (const row of rows) {
      const figures = row.all("character-figure");
      expect(figures.map((figure) => figure.attributes.get("data-weapon-id"))).toEqual(["sword"]);
      expect(row.all("character-dot")).toEqual([]);
      expect(row.all("gear-icon")).toEqual([]);
      expect(row.all("mini-skill-bar")).toHaveLength(1);
    }
    expect(root.everything().some((node) => node.textContent.startsWith("Ser "))).toBe(false);
  });

  it("with no Team Builds of the size, shows the hint and New team build (#2109)", () => {
    const root = render([team("a", 2)]);
    expect(root.all("play-card-name")).toEqual([]);
    expect(root.all("play-card-new")).toHaveLength(1);
    expect(root.all("team-play-hint")[0]?.textContent).toBe("No 4v4 Team Builds yet.");
    expect(noTeamBuilds(2)).toBe("No 2v2 Team Builds yet.");
  });

  it("lists the Team Builds of the sidebar's size, each its slots filled, and follows a pick (#2109)", () => {
    const root = render([
      { ...team("a"), members: [{ character: warrior("Ser Bash") }] },
      team("b", 2),
      team("c", 8),
    ]);
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual(["Team a"]);
    expect(root.all("play-card-size").map((tag) => tag.textContent)).toEqual(["1/4"]);

    // The sidebar's ‹: one size smaller.
    root.all("mode-rail-step")[0]?.click();
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual(["Team b"]);
    expect(root.all("play-card-size").map((tag) => tag.textContent)).toEqual(["0/2"]);
    expect(root.all("play-card-new")).toHaveLength(1);
  });

  it("has no goal line under its heading (#2641), and no Host button: the lobby is always there (#1526)", () => {
    for (const entry of ["team-arena", "heroes-ascent", "gvg", "hosted-game"] as const) {
      const root = host(entry);
      expect(root.all("rail-goal")).toEqual([]);
      expect(root.everything().some((node) => node.textContent.startsWith("Host a"))).toBe(false);
    }
  });

  it("shows the lobby's place while it opens, and no Team Build cards: they are Team Builder's", () => {
    for (const entry of ["team-arena", "heroes-ascent", "gvg", "hosted-game"] as const) {
      const root = host(entry);
      expect(
        root.everything().some((node) => node.textContent === t("teamPlay.openingLobby")),
      ).toBe(true);
      expect(root.all("play-cards")).toHaveLength(0);
      expect(root.everything().some((node) => node.textContent === "Team Builds")).toBe(false);
    }
  });

  const maps: readonly LobbyMap[] = [
    { id: "a", size: "small", mode: "annihilation", teamSizes: [1, 2] },
    { id: "b", size: "large", mode: "kill-count", teamSizes: [8] },
  ];

  it("in the Random Arena queue, says so, its Find a match off with why, beside Leave Queue (#2781)", () => {
    for (const entry of ["team-arena", "heroes-ascent", "gvg"] as const) {
      const root = host(entry, maps);
      expect(root.everything().some((node) => node.textContent === t("queue.busy"))).toBe(true);
      const [find] = root.all("lobby-find");
      expect(find?.textContent).toBe(t("lobby.findMatch"));
      expect(find?.disabled).toBe(true);
      expect(find?.title).toBe(t("queue.busy"));
    }
    const hosted = host("hosted-game", maps);
    // The maps to look at, not to pick: a list.
    expect(
      hosted.all("lobby-map").flatMap((list) => list.children.map((item) => item.textContent)),
    ).toEqual(maps.map(mapLabel));
    expect(hosted.all("lobby-find")).toEqual([]);
    const [leave] = hosted.all("lobby-leave-queue");
    expect(leave?.textContent).toBe(t("queue.leaveQueue"));
    leave?.click();
    expect(leftQueue).toBe(1);
  });

  it("names an unnamed team and says why a team is not playable (#2110)", () => {
    const playable = {
      ...team("p"),
      members: ["Ser Bash", "Ser Bonk", "Ser Clang", "Ser Dent"].map((name) => ({
        character: warrior(name),
      })),
    };
    const root = render([{ ...team("u"), name: " " }, playable]);
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual([
      t("teamPlay.unnamedTeam"),
      "Team p",
    ]);
    expect(root.all("play-card-unplayable").map((line) => line.textContent)).toEqual([
      "Not playable: team name must not be empty",
    ]);
  });

  it("shows the cards alone on Team Builder", () => {
    const root = new FakeElement();
    renderTeamBuilder(root as unknown as HTMLElement, [team("a")], [], undefined, callbacks);
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual(["Team a"]);
    expect(root.everything().some((node) => node.textContent.startsWith("Host a"))).toBe(false);
  });

  it("shows the random starter team last, with Clone and Reroll and no Edit (#2036)", () => {
    starterIds.set("4", "s");
    const root = new FakeElement();
    renderTeamBuilder(
      root as unknown as HTMLElement,
      [team("s"), team("a")],
      [],
      undefined,
      callbacks,
    );
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual([
      "Team a",
      "Team s",
    ]);
    const [, starter] = root.all("play-card");
    expect(starter?.all("roster-random-tag").map((tag) => tag.textContent)).toEqual(["Random"]);
    expect(starter?.all("play-card-edit")).toEqual([]);
    starter?.all("play-card-open")[0]?.click();
    expect(edited).toEqual([]);
    starter?.all("play-card-clone")[0]?.click();
    starter?.all("play-card-reroll")[0]?.click();
    expect(cloned).toEqual(["s"]);
    expect(rerolled).toEqual(["s"]);
    expect(root.all("play-card-clone")).toHaveLength(1);
  });

  it("shows the random starter team of the size picked, each size its own (#2147)", () => {
    starterIds.set("4", "s4");
    starterIds.set("2", "s2");
    const root = render([team("s4"), team("s2", 2), team("a", 2)]);
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual(["Team s4"]);
    expect(root.all("roster-random-tag")).toHaveLength(1);

    // The sidebar's ‹: one size smaller.
    root.all("mode-rail-step")[0]?.click();
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual([
      "Team a",
      "Team s2",
    ]);
    expect(root.all("roster-random-tag")).toHaveLength(1);
    root.all("play-card-reroll")[0]?.click();
    expect(rerolled).toEqual(["s2"]);
  });
});
