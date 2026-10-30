import { afterEach, describe, expect, it, vi } from "vitest";

import { ARENA_MAPS } from "../net/maps.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { TEAM_SCHEMA_VERSION, type StoredTeam } from "../storage/schema.js";
import { hostMaps } from "./lobby-screen.js";
import {
  TEAM_PLAY_TILES,
  loadActiveTeamBuildId,
  saveActiveTeamBuildId,
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

/** A localStorage on a map, as the browser keeps one. */
function storage(): Map<string, string> {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  return stored;
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

describe("the Team Build pick (#1453)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is None until one is picked", () => {
    storage();
    expect(loadActiveTeamBuildId([team("a"), team("b")])).toBeUndefined();
  });

  it("remembers the build picked, and None again", () => {
    const stored = storage();
    saveActiveTeamBuildId("b");
    expect(stored.get(`${STORAGE_NAMESPACE}.activeTeamBuildId`)).toBe("b");
    expect(loadActiveTeamBuildId([team("a"), team("b")])).toBe("b");
    saveActiveTeamBuildId(undefined);
    expect(loadActiveTeamBuildId([team("a"), team("b")])).toBeUndefined();
  });

  it("falls back to None when the build picked is deleted", () => {
    storage();
    saveActiveTeamBuildId("b");
    expect(loadActiveTeamBuildId([team("a")])).toBeUndefined();
  });

  it("with no Team Builds, is None", () => {
    storage();
    saveActiveTeamBuildId("b");
    expect(loadActiveTeamBuildId([])).toBeUndefined();
  });
});
