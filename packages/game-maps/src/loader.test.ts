import { describe, expect, it } from "vitest";

import { allWallSegments } from "./geometry.js";
import { MapNotFoundError, listMapIds, loadAllMaps, loadMap } from "./loader.js";

describe("listMapIds", () => {
  it("includes the bundled arena-alpha map", () => {
    expect(listMapIds()).toContain("arena-alpha");
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
