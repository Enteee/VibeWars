import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { circleIntersectsSegment, hasLineOfSight } from "@vibewars/game-core";

import { allWallSegments } from "./geometry.js";
import { MapValidationError, validateMapData } from "./schema.js";

const validMap = {
  id: "arena-test",
  name: "Arena Test",
  width: 100,
  height: 100,
  walls: [
    { kind: "rect", x: 10, y: 10, width: 5, height: 5 },
    {
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
    },
  ],
  spawnPoints: [{ team: 0, position: { x: 1, y: 1 } }],
};

describe("validateMapData", () => {
  it("accepts a well-formed map", () => {
    const parsed = validateMapData(validMap);
    expect(parsed.id).toBe("arena-test");
    expect(parsed.walls).toHaveLength(2);
  });

  it("rejects a non-kebab-case id", () => {
    expect(() => validateMapData({ ...validMap, id: "Arena Test" })).toThrow(MapValidationError);
  });

  it("rejects an empty name", () => {
    expect(() => validateMapData({ ...validMap, name: "" })).toThrow(MapValidationError);
  });

  it("rejects non-positive dimensions", () => {
    expect(() => validateMapData({ ...validMap, width: 0 })).toThrow(MapValidationError);
    expect(() => validateMapData({ ...validMap, height: -10 })).toThrow(MapValidationError);
  });

  it("rejects a rect wall with a non-positive size", () => {
    expect(() =>
      validateMapData({
        ...validMap,
        walls: [{ kind: "rect", x: 0, y: 0, width: 0, height: 5 }],
      }),
    ).toThrow(MapValidationError);
  });

  it("rejects a polygon wall with fewer than 3 points", () => {
    expect(() =>
      validateMapData({
        ...validMap,
        walls: [
          {
            kind: "polygon",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ],
      }),
    ).toThrow(MapValidationError);
  });

  it("rejects an unrecognized wall kind rather than silently dropping it", () => {
    expect(() =>
      validateMapData({
        ...validMap,
        walls: [{ kind: "circle", x: 0, y: 0, radius: 5 }],
      }),
    ).toThrow(MapValidationError);
  });

  it("requires at least one spawn point", () => {
    expect(() => validateMapData({ ...validMap, spawnPoints: [] })).toThrow(MapValidationError);
  });

  it("rejects a negative team index", () => {
    expect(() =>
      validateMapData({ ...validMap, spawnPoints: [{ team: -1, position: { x: 0, y: 0 } }] }),
    ).toThrow(MapValidationError);
  });

  it("rejects a completely malformed value rather than throwing an unhelpful native error", () => {
    expect(() => validateMapData(null)).toThrow(MapValidationError);
    expect(() => validateMapData("not a map")).toThrow(MapValidationError);
    expect(() => validateMapData(42)).toThrow(MapValidationError);
  });

  it("names the failing field(s) in the error message", () => {
    try {
      validateMapData({ ...validMap, width: -1 });
      expect.fail("expected validateMapData to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MapValidationError);
      expect((error as Error).message).toContain("width");
    }
  });
});

/**
 * The training arenas (#2 §4.4) are not in `maps/`, so `loadAllMaps` never
 * sees them; this is what validates them instead.
 */
describe("every training map", () => {
  const root = fileURLToPath(new URL("../training/", import.meta.url));
  const maps = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      dir: entry.name,
      map: validateMapData(JSON.parse(readFileSync(join(root, entry.name, "map.json"), "utf8"))),
    }));
  const pillars = maps.find(({ map }) => map.id === "training-pillars")?.map;
  const PLAYER_RADIUS = 14;
  // RANGE_SPELL in game-core's skill catalog.
  const RANGE_SPELL = 420;

  it("ships the open hall and the pillared one", () => {
    expect(maps.map(({ map }) => map.id).sort()).toEqual(["training-hall", "training-pillars"]);
  });

  it("is named for its directory, compact, and spawns one player against dummy slots", () => {
    for (const { dir, map } of maps) {
      expect(map.id).toBe(dir);
      expect(map.width, map.id).toBeLessThanOrEqual(600);
      expect(map.height, map.id).toBeLessThanOrEqual(450);
      expect(
        map.spawnPoints.filter((s) => s.team === 0),
        map.id,
      ).toHaveLength(1);
      expect(map.spawnPoints.filter((s) => s.team === 1).length, map.id).toBeGreaterThan(0);
    }
  });

  it("keeps every spawn inside the bounds and out of the walls", () => {
    for (const { map } of maps) {
      const segments = allWallSegments(map.walls);
      for (const { position } of map.spawnPoints) {
        const at = `${map.id} (${String(position.x)}, ${String(position.y)})`;
        expect(position.x, at).toBeGreaterThanOrEqual(PLAYER_RADIUS);
        expect(position.x, at).toBeLessThanOrEqual(map.width - PLAYER_RADIUS);
        expect(position.y, at).toBeGreaterThanOrEqual(PLAYER_RADIUS);
        expect(position.y, at).toBeLessThanOrEqual(map.height - PLAYER_RADIUS);
        for (const segment of segments) {
          expect(circleIntersectsSegment(position, PLAYER_RADIUS, segment), at).toBe(false);
        }
      }
    }
  });

  it("training-pillars hides a dummy slot behind a wall, and has one in sight but out of range", () => {
    expect(pillars).toBeDefined();
    if (pillars === undefined) {
      return;
    }
    const segments = allWallSegments(pillars.walls);
    const player = pillars.spawnPoints.find((s) => s.team === 0)?.position;
    expect(player).toBeDefined();
    if (player === undefined) {
      return;
    }
    const slots = pillars.spawnPoints.filter((s) => s.team === 1).map((s) => s.position);
    const seen = slots.filter((slot) => hasLineOfSight(player, slot, segments));
    expect(seen.length).toBeLessThan(slots.length);
    expect(seen.length).toBeGreaterThan(0);
    expect(
      seen.some((slot) => Math.hypot(slot.x - player.x, slot.y - player.y) > RANGE_SPELL),
    ).toBe(true);
  });
});
