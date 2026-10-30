import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARENA_MAPS } from "../net/maps.js";
import { TEAM_SCHEMA_VERSION, type StoredTeam } from "../storage/schema.js";
import { hostMaps } from "./lobby-screen.js";
import {
  NO_TEAM_BUILDS,
  TEAM_PLAY_TILES,
  renderTeamPlay,
  type TeamPlayCallbacks,
  type TeamPlayTile,
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

/** The ids of the arenas `label`'s tile lets its host pick. */
function tileMapIds(label: TeamPlayTile["label"]): string[] {
  const tile = TEAM_PLAY_TILES.find((each) => each.label === label);
  const maps = ARENA_MAPS.map((map) => ({ id: map.id, name: map.name, size: "", mode: map.mode }));
  return tile === undefined ? [] : hostMaps(maps, tile.modes).map((map) => map.id);
}

describe("Team Play's mode tiles (#1453)", () => {
  it("are the study's four, in its order", () => {
    expect(TEAM_PLAY_TILES.map((tile) => tile.label)).toEqual([
      "Hosted Lobby",
      "Team Arena",
      "Heroes' Ascent",
      "GvG",
    ]);
  });

  it("host on every map from Hosted Lobby", () => {
    expect(tileMapIds("Hosted Lobby")).toEqual(ARENA_MAPS.map((map) => map.id));
  });

  it("host on each tile's own modes' maps", () => {
    const modesOf = (label: string): string[] => {
      const ids = tileMapIds(label);
      return [...new Set(ARENA_MAPS.filter((map) => ids.includes(map.id)).map((map) => map.mode))];
    };
    expect(modesOf("Team Arena").sort()).toEqual(
      ["annihilation", "kill-count", "priest-annihilation"].sort(),
    );
    expect(modesOf("Heroes' Ascent").sort()).toEqual(
      ["capture-points", "king-of-the-hill", "relic-run"].sort(),
    );
    expect(modesOf("GvG")).toEqual(["guild-battle"]);
  });
});

/** Just enough DOM to render Team Play; the unit tests run in Node. */
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

describe("Team Play's Team Builds (#1515)", () => {
  let edited: string[];
  let added: number;
  const callbacks: TeamPlayCallbacks = {
    onHostTile: () => undefined,
    onJoinLobby: () => undefined,
    onSwitchTab: () => undefined,
    onNewTeam: () => {
      added += 1;
    },
    onEditTeam: (id) => {
      edited.push(id);
    },
    onPasteTeam: () => undefined,
  };
  const render = (teams: readonly StoredTeam[]): FakeElement => {
    const root = new FakeElement();
    renderTeamPlay(root as unknown as HTMLElement, teams, [], undefined, callbacks);
    return root;
  };

  beforeEach(() => {
    edited = [];
    added = 0;
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
    const [cards] = root.all("team-play-cards");
    expect(cards?.children.map((card) => card.className)).toEqual([
      "team-play-card",
      "team-play-card",
      "team-play-card team-play-new",
    ]);
    expect(root.all("team-play-card-name").map((name) => name.textContent)).toEqual([
      "Team a",
      "Team b",
    ]);
    expect(root.everything().some((node) => node.textContent === "None")).toBe(false);
    expect(
      root
        .everything()
        .some(
          (node) =>
            node.attributes.has("aria-pressed") && node.className.startsWith("team-play-card"),
        ),
    ).toBe(false);
    expect(root.everything().some((node) => node.textContent === "Team Builds")).toBe(true);
  });

  it("opens a card in the editor, as its Edit does: a card is no pick", () => {
    const root = render([team("a"), team("b")]);
    root.all("team-play-card-open")[1]?.click();
    root.all("team-play-card-edit")[0]?.click();
    root.all("team-play-new")[0]?.click();
    expect(edited).toEqual(["b", "a"]);
    expect(added).toBe(1);
  });

  it("with no Team Builds, shows the hint and New team build", () => {
    const root = render([]);
    expect(root.all("team-play-new")).toHaveLength(1);
    expect(root.all("team-play-hint")[0]?.textContent).toBe(NO_TEAM_BUILDS);
  });
});
