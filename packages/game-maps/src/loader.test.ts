import { describe, expect, it } from "vitest";

import { circleIntersectsSegment } from "@vibewars/game-core";

import arenaAlpha from "../maps/arena-alpha/map.json" with { type: "json" };
import arenaCanyon from "../maps/arena-canyon/map.json" with { type: "json" };
import arenaCrossroads from "../maps/arena-crossroads/map.json" with { type: "json" };
import arenaLongHall from "../maps/arena-long-hall/map.json" with { type: "json" };
import arenaOpen from "../maps/arena-open/map.json" with { type: "json" };
import arenaPillars from "../maps/arena-pillars/map.json" with { type: "json" };
import arenaRing from "../maps/arena-ring/map.json" with { type: "json" };
import arenaSplit from "../maps/arena-split/map.json" with { type: "json" };
import forgottenShrines from "../maps/forgotten-shrines/map.json" with { type: "json" };
import guildHallIsle from "../maps/guild-hall-isle/map.json" with { type: "json" };
import hallOfHeroes from "../maps/hall-of-heroes/map.json" with { type: "json" };
import hillCourtyard from "../maps/hill-courtyard/map.json" with { type: "json" };
import relicTemples from "../maps/relic-temples/map.json" with { type: "json" };
import { allWallSegments } from "./geometry.js";
import { MapNotFoundError, listMapIds, loadAllMaps, loadMap } from "./loader.js";
import { validateMapData } from "./schema.js";

describe("listMapIds", () => {
  it("includes the bundled arena-alpha map", () => {
    expect(listMapIds()).toContain("arena-alpha");
  });

  it("never lists a training map: they live in training/, outside maps/", () => {
    expect(listMapIds()).not.toContain("training-hall");
    expect(listMapIds()).not.toContain("training-pillars");
    expect(listMapIds()).not.toContain("training-field");
  });
});

describe("the maps the browser imports", () => {
  it("are the maps the server loads from disk", () => {
    // The browser imports map JSON directly (#8); the server reads it with
    // fs. One file, so this only fails if the two ever stop being the same
    // data, which is the drift to catch.
    const imported = [
      arenaAlpha,
      arenaCanyon,
      arenaCrossroads,
      arenaLongHall,
      arenaOpen,
      arenaPillars,
      arenaRing,
      arenaSplit,
      forgottenShrines,
      guildHallIsle,
      hallOfHeroes,
      hillCourtyard,
      relicTemples,
    ].map((raw) => validateMapData(raw));
    expect(imported.map((map) => map.id)).toEqual(listMapIds());
    for (const map of imported) {
      expect(loadMap(map.id)).toEqual(map);
    }
  });
});

describe("loadMap", () => {
  it("loads and validates arena-alpha", () => {
    const map = loadMap("arena-alpha");
    expect(map.id).toBe("arena-alpha");
    expect(map.width).toBeGreaterThan(0);
    expect(map.height).toBeGreaterThan(0);
    expect(map.spawnPoints.length).toBeGreaterThan(0);
  });

  it("produces walls that convert cleanly to collision segments", () => {
    const map = loadMap("arena-alpha");
    const segments = allWallSegments(map.walls);
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(Number.isFinite(seg.a.x)).toBe(true);
      expect(Number.isFinite(seg.a.y)).toBe(true);
      expect(Number.isFinite(seg.b.x)).toBe(true);
      expect(Number.isFinite(seg.b.y)).toBe(true);
    }
  });

  it("has spawn points for at least two teams", () => {
    const map = loadMap("arena-alpha");
    const teams = new Set(map.spawnPoints.map((spawn) => spawn.team));
    expect(teams.size).toBeGreaterThanOrEqual(2);
  });

  it("keeps every spawn point within the map bounds", () => {
    const map = loadMap("arena-alpha");
    for (const spawn of map.spawnPoints) {
      expect(spawn.position.x).toBeGreaterThanOrEqual(0);
      expect(spawn.position.x).toBeLessThanOrEqual(map.width);
      expect(spawn.position.y).toBeGreaterThanOrEqual(0);
      expect(spawn.position.y).toBeLessThanOrEqual(map.height);
    }
  });

  it("throws MapNotFoundError for an unknown map id", () => {
    expect(() => loadMap("no-such-map")).toThrow(MapNotFoundError);
  });
});

describe("loadAllMaps", () => {
  it("loads every bundled map without throwing — a CI-facing validation gate", () => {
    const maps = loadAllMaps();
    expect(maps.length).toBeGreaterThan(0);
    const ids = maps.map((map) => map.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
  });
});

/**
 * Invariants every bundled map must satisfy. These run against the real
 * `maps/` directory, so adding a broken arena fails CI rather than
 * shipping a map players get stuck in.
 */
describe("every bundled map", () => {
  const maps = loadAllMaps();

  it("ships more than one arena", () => {
    expect(maps.length).toBeGreaterThan(1);
  });

  it("has spawn points for exactly two teams", () => {
    for (const map of maps) {
      const teams = new Set(map.spawnPoints.map((spawn) => spawn.team));
      expect([...teams].sort(), map.id).toEqual([0, 1]);
    }
  });

  it("gives both teams the same number of spawn points", () => {
    for (const map of maps) {
      const team0 = map.spawnPoints.filter((s) => s.team === 0).length;
      const team1 = map.spawnPoints.filter((s) => s.team === 1).length;
      expect(team0, `${map.id} team 0 vs 1`).toBe(team1);
    }
  });

  it("keeps every spawn point inside the map bounds", () => {
    for (const map of maps) {
      for (const spawn of map.spawnPoints) {
        expect(spawn.position.x, map.id).toBeGreaterThanOrEqual(0);
        expect(spawn.position.x, map.id).toBeLessThanOrEqual(map.width);
        expect(spawn.position.y, map.id).toBeGreaterThanOrEqual(0);
        expect(spawn.position.y, map.id).toBeLessThanOrEqual(map.height);
      }
    }
  });

  it("never spawns a player inside a wall", () => {
    // A player who spawns inside geometry is immediately stuck, which is
    // the single worst map bug and completely invisible until someone
    // tries to play the map.
    const PLAYER_RADIUS = 14;
    for (const map of maps) {
      const segments = allWallSegments(map.walls);
      for (const spawn of map.spawnPoints) {
        for (const segment of segments) {
          expect(
            circleIntersectsSegment(spawn.position, PLAYER_RADIUS, segment),
            `${map.id} spawn at (${String(spawn.position.x)}, ${String(spawn.position.y)})`,
          ).toBe(false);
        }
      }
    }
  });

  it("separates the two teams' spawns so nobody starts in melee range", () => {
    for (const map of maps) {
      const team0 = map.spawnPoints.filter((s) => s.team === 0);
      const team1 = map.spawnPoints.filter((s) => s.team === 1);
      for (const a of team0) {
        for (const b of team1) {
          const distance = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
          expect(distance, map.id).toBeGreaterThan(200);
        }
      }
    }
  });

  it("gives every map a unique, non-empty display name", () => {
    const names = maps.map((map) => map.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
