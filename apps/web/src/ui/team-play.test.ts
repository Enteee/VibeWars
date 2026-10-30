import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARENA_MAPS } from "../net/maps.js";
import { TEAM_SCHEMA_VERSION, type StoredTeam } from "../storage/schema.js";
import { hostMaps } from "./lobby-screen.js";
import {
  HOST_SCREENS,
  NO_TEAM_BUILDS,
  renderHostScreen,
  renderTeamBuilder,
  type HostEntry,
  type TeamPlayCallbacks,
} from "./team-play.js";

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

/** The ids of the arenas `entry`'s screen lets its host pick. */
function hostMapIds(entry: HostEntry): string[] {
  const maps = ARENA_MAPS.map((map) => ({ id: map.id, name: map.name, size: "", mode: map.mode }));
  return hostMaps(maps, HOST_SCREENS[entry].modes).map((map) => map.id);
}

describe("the hosting screens' maps (#1453, #1525)", () => {
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
  maxLength = -1;
  hidden = false;
  type = "";
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly classList = { add: () => undefined, toggle: () => undefined };

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
  let hosted: (readonly string[] | undefined)[];
  const callbacks: TeamPlayCallbacks = {
    onHost: (modes) => {
      hosted.push(modes);
    },
    onSwitch: () => undefined,
    onNewTeam: () => {
      added += 1;
    },
    onEditTeam: (id) => {
      edited.push(id);
    },
    onPasteTeam: () => undefined,
  };
  const render = (teams: readonly StoredTeam[], entry: HostEntry = "team-arena"): FakeElement => {
    const root = new FakeElement();
    renderHostScreen(root as unknown as HTMLElement, entry, teams, [], undefined, callbacks);
    return root;
  };

  beforeEach(() => {
    edited = [];
    added = 0;
    hosted = [];
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

  it("with no Team Builds, shows the hint and New team build", () => {
    const root = render([]);
    expect(root.all("play-card-new")).toHaveLength(1);
    expect(root.all("team-play-hint")[0]?.textContent).toBe(NO_TEAM_BUILDS);
  });

  it("hosts with its own modes, under its heading", () => {
    for (const entry of ["team-arena", "heroes-ascent", "gvg"] as const) {
      const root = render([team("a")], entry);
      root
        .everything()
        .find((node) => node.textContent === "Host a Team Lobby")
        ?.click();
      expect(root.all("rail-goal")[0]?.textContent).toBe(HOST_SCREENS[entry].goal);
    }
    expect(hosted).toEqual([
      HOST_SCREENS["team-arena"].modes,
      HOST_SCREENS["heroes-ascent"].modes,
      HOST_SCREENS.gvg.modes,
    ]);
  });

  it("hosts on every map from Hosted Game, which has no cards", () => {
    const root = render([team("a")], "hosted-game");
    root
      .everything()
      .find((node) => node.textContent === "Host a game")
      ?.click();
    expect(hosted).toEqual([undefined]);
    expect(root.all("play-card")).toHaveLength(0);
  });

  it("shows the cards alone on Team Builder", () => {
    const root = new FakeElement();
    renderTeamBuilder(root as unknown as HTMLElement, [team("a")], [], undefined, callbacks);
    expect(root.all("play-card-name").map((name) => name.textContent)).toEqual(["Team a"]);
    expect(root.everything().some((node) => node.textContent.startsWith("Host a"))).toBe(false);
  });
});
