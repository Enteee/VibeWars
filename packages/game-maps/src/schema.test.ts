import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MATCH_MODES, circleIntersectsSegment, hasLineOfSight } from "@vibewars/game-core";

import { allWallSegments } from "./geometry.js";
import { MapValidationError, mapDataSchema, validateMapData, type Wall } from "./schema.js";

const validMap = {
  id: "arena-test",
  name: "Arena Test",
  mode: "annihilation",
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

  it("refuses a map without a mode, or with one no match plays (#476)", () => {
    const { mode: _mode, ...modeless } = validMap;
    expect(() => validateMapData(modeless)).toThrow(MapValidationError);
    expect(() => validateMapData({ ...validMap, mode: "crag" })).toThrow(MapValidationError);
  });

  it("knows exactly game-core's modes", () => {
    expect([...mapDataSchema.shape.mode.options].sort()).toEqual(Object.keys(MATCH_MODES).sort());
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

/**
 * Walls never overlap, in any map, bundled or training. The walk's
 * `nearestStandable` (#310) tells inside from outside by counting wall
 * sides crossed, which holds only while no point is inside two walls.
 */
describe("every map's walls", () => {
  interface Point {
    readonly x: number;
    readonly y: number;
  }
  const maps = ["../maps/", "../training/"].flatMap((dir) => {
    const root = fileURLToPath(new URL(dir, import.meta.url));
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        validateMapData(JSON.parse(readFileSync(join(root, entry.name, "map.json"), "utf8"))),
      );
  });

  function outline(wall: Wall): Point[] {
    return wall.kind === "rect"
      ? [
          { x: wall.x, y: wall.y },
          { x: wall.x + wall.width, y: wall.y },
          { x: wall.x + wall.width, y: wall.y + wall.height },
          { x: wall.x, y: wall.y + wall.height },
        ]
      : wall.points;
  }

  function edges(points: readonly Point[]): [Point, Point][] {
    return points.map((point, i) => [point, points[(i + 1) % points.length] ?? point]);
  }

  /** Which side of the line `a`→`b` `p` is on: 0 on it. */
  function side(a: Point, b: Point, p: Point): number {
    return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  }

  /** Two edges that cross, not merely touch or run along each other. */
  function cross([a, b]: [Point, Point], [c, d]: [Point, Point]): boolean {
    return side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
  }

  /** `p` inside the outline, and not on it. */
  function strictlyInside(p: Point, points: readonly Point[]): boolean {
    let inside = false;
    for (const [a, b] of edges(points)) {
      if (side(a, b, p) === 0 && Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x)) {
        if (Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)) {
          return false;
        }
      }
      if (a.y > p.y !== b.y > p.y && a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x) > p.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  it("finds an overlap where there is one", () => {
    const a = outline({ kind: "rect", x: 0, y: 0, width: 10, height: 10 });
    const plus = outline({ kind: "rect", x: 4, y: -5, width: 2, height: 20 });
    const within = outline({ kind: "rect", x: 2, y: 2, width: 2, height: 2 });
    const beside = outline({ kind: "rect", x: 10, y: 0, width: 5, height: 10 });
    expect(edges(a).some((e) => edges(plus).some((f) => cross(e, f)))).toBe(true);
    expect(within.some((p) => strictlyInside(p, a))).toBe(true);
    expect(edges(a).some((e) => edges(beside).some((f) => cross(e, f)))).toBe(false);
    expect(beside.some((p) => strictlyInside(p, a))).toBe(false);
  });

  it("never overlaps two walls", () => {
    expect(maps.length).toBeGreaterThan(4);
    for (const map of maps) {
      const outlines = map.walls.map(outline);
      outlines.forEach((a, i) => {
        outlines.slice(i + 1).forEach((b, k) => {
          const pair = `${map.id}: walls ${String(i)} and ${String(i + 1 + k)}`;
          expect(
            edges(a).some((e) => edges(b).some((f) => cross(e, f))),
            pair,
          ).toBe(false);
          expect(
            a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a)),
            pair,
          ).toBe(false);
        });
      });
    }
  });
});
