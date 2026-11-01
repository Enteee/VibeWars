import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARENA_MAPS, modeMapIds } from "../net/maps.js";
import { TEAM_SCHEMA_VERSION, type StoredTeam, type TeamCharacter } from "../storage/schema.js";
import type { FigureLook } from "./character-card.js";
import type * as Figure from "./character-figure.js";
import {
  HOST_GOALS,
  NO_TEAM_BUILDS,
  OPENING_LOBBY,
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

function team(id: string): StoredTeam {
  return {
    schemaVersion: TEAM_SCHEMA_VERSION,
    id,
    name: `Team ${id}`,
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
      ["capture-points", "king-of-the-hill", "relic-run"].sort(),
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
  readonly children: FakeElement[] = [];
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
    return child;
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

  click(): void {
    this.listeners.get("click")?.();
  }
}

describe("the team screens' Team Builds (#1515, #1525)", () => {
  let edited: string[];
  let added: number;
  let cloned: string[];
  let rerolled: string[];
  let starterId: string | null;
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
  };
  const render = (teams: readonly StoredTeam[], entry: HostEntry = "team-arena"): FakeElement => {
    const root = new FakeElement();
    renderHostScreen(
      root as unknown as HTMLElement,
      entry,
      teams,
      [],
      undefined,
      callbacks,
      undefined,
    );
    return root;
  };

  beforeEach(() => {
    edited = [];
    added = 0;
    cloned = [];
    rerolled = [];
    starterId = null;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key.endsWith(".starterTeamId") ? starterId : null),
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

  it("with no Team Builds, shows the hint and New team build", () => {
    const root = render([]);
    expect(root.all("play-card-new")).toHaveLength(1);
    expect(root.all("team-play-hint")[0]?.textContent).toBe(NO_TEAM_BUILDS);
  });

  it("says what each is for, and has no Host button: the lobby is always there (#1526)", () => {
    for (const entry of ["team-arena", "heroes-ascent", "gvg", "hosted-game"] as const) {
      const root = render([team("a")], entry);
      expect(root.all("rail-goal")[0]?.textContent).toBe(HOST_GOALS[entry]);
      expect(root.everything().some((node) => node.textContent.startsWith("Host a"))).toBe(false);
    }
  });

  it("shows the lobby's place while it opens, and no cards on Hosted Game", () => {
    const root = render([team("a")], "hosted-game");
    expect(root.everything().some((node) => node.textContent === OPENING_LOBBY)).toBe(true);
    expect(root.all("play-card")).toHaveLength(0);
  });

  it("shows the cards alone on Team Builder", () => {
    const root = new FakeElement();
    renderTeamBuilder(root as unknown as HTMLElement, [team("a")], [], undefined, callbacks);
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual(["Team a"]);
    expect(root.everything().some((node) => node.textContent.startsWith("Host a"))).toBe(false);
  });

  it("shows the random starter team last, with Clone and Reroll and no Edit (#2036)", () => {
    starterId = "s";
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
});
