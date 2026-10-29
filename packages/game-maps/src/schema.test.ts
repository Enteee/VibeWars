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
  objectives: [],
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

describe("resurrection shrines (#1186)", () => {
  const priestMap = {
    ...validMap,
    mode: "priest-annihilation",
    walls: [{ kind: "rect", x: 45, y: 0, width: 10, height: 40 }],
    spawnPoints: [
      { team: 0, position: { x: 20, y: 50 } },
      { team: 1, position: { x: 80, y: 50 } },
    ],
    objectives: [
      { kind: "resurrection-shrine", team: 0, position: { x: 20, y: 80 } },
      { kind: "resurrection-shrine", team: 1, position: { x: 80, y: 20 } },
    ],
  };
  const shrine = (team: number, x: number, y: number) => ({
    kind: "resurrection-shrine",
    team,
    position: { x, y },
  });

  it("accepts one shrine per spawning team, clear of the walls", () => {
    expect(validateMapData(priestMap).objectives).toHaveLength(2);
  });

  it("refuses objectives missing altogether", () => {
    const { objectives: _objectives, ...without } = validMap;
    expect(() => validateMapData(without)).toThrow(MapValidationError);
  });

  it("refuses a team with no shrine, or two", () => {
    expect(() => validateMapData({ ...priestMap, objectives: [shrine(0, 20, 80)] })).toThrow(
      /team 1 has 0/,
    );
    expect(() =>
      validateMapData({
        ...priestMap,
        objectives: [...priestMap.objectives, shrine(1, 80, 80)],
      }),
    ).toThrow(/team 1 has 2/);
  });

  it("refuses a shrine off the map, against a wall, or of a team with no spawns", () => {
    for (const bad of [shrine(1, 99, 20), shrine(1, 50, 20), shrine(2, 80, 80)]) {
      expect(() =>
        validateMapData({ ...priestMap, objectives: [shrine(0, 20, 80), shrine(1, 80, 20), bad] }),
      ).toThrow(MapValidationError);
    }
    expect(() =>
      validateMapData({ ...priestMap, objectives: [shrine(0, 20, 80), shrine(1, 50, 20)] }),
    ).toThrow(/a body clear of every wall/);
  });

  it("refuses a shrine on a map of any other mode", () => {
    expect(() => validateMapData({ ...validMap, objectives: [shrine(0, 50, 50)] })).toThrow(
      /annihilation map has no resurrection shrine/,
    );
  });
});

describe("guild battle maps (#1222)", () => {
  const objective = (kind: string, team: number, x: number, y: number) => ({
    kind,
    team,
    position: { x, y },
  });
  const guildMap = {
    ...validMap,
    mode: "guild-battle",
    walls: [{ kind: "rect", x: 45, y: 0, width: 10, height: 40 }],
    spawnPoints: [
      { team: 0, position: { x: 20, y: 50 } },
      { team: 1, position: { x: 80, y: 50 } },
    ],
    objectives: [
      objective("resurrection-shrine", 0, 20, 80),
      objective("resurrection-shrine", 1, 80, 20),
      objective("guild-lord", 0, 20, 20),
      objective("guild-lord", 1, 80, 80),
      objective("flag-spawn", 0, 30, 60),
      objective("flag-spawn", 1, 70, 60),
      { kind: "flag-stand", position: { x: 50, y: 70 } },
    ],
  };

  it("accepts one shrine, Guild Lord and flag spawn per spawning team, and one stand", () => {
    expect(validateMapData(guildMap).objectives).toHaveLength(7);
  });

  it("refuses a guild battle map with no flag stand, or two (#1225)", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: guildMap.objectives.filter((candidate) => candidate.kind !== "flag-stand"),
      }),
    ).toThrow(/guild-battle map has 0 flag stands, not one/);
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: [...guildMap.objectives, { kind: "flag-stand", position: { x: 50, y: 80 } }],
      }),
    ).toThrow(/guild-battle map has 2 flag stands, not one/);
  });

  it("refuses a team with no flag spawn (#1225)", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: guildMap.objectives.filter(
          (candidate) =>
            !(candidate.kind === "flag-spawn" && "team" in candidate && candidate.team === 1),
        ),
      }),
    ).toThrow(/team 1 has 0 flag spawns/);
  });

  it("refuses flags on a map of any other mode (#1225)", () => {
    expect(() =>
      validateMapData({
        ...validMap,
        objectives: [{ kind: "flag-stand", position: { x: 50, y: 50 } }],
      }),
    ).toThrow(/annihilation map has no flag stand/);
    expect(() =>
      validateMapData({ ...validMap, objectives: [objective("flag-spawn", 0, 50, 50)] }),
    ).toThrow(/annihilation map has no flag spawn/);
  });

  it("refuses a flag stand against a wall (#1225)", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: [
          ...guildMap.objectives.filter((candidate) => candidate.kind !== "flag-stand"),
          { kind: "flag-stand", position: { x: 50, y: 20 } },
        ],
      }),
    ).toThrow(/a body clear of every wall/);
  });

  it("refuses a team with no Guild Lord, or two", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: guildMap.objectives.filter(
          (candidate) =>
            !(candidate.kind === "guild-lord" && "team" in candidate && candidate.team === 1),
        ),
      }),
    ).toThrow(/team 1 has 0 Guild Lords/);
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: [...guildMap.objectives, objective("guild-lord", 0, 30, 70)],
      }),
    ).toThrow(/team 0 has 2 Guild Lords/);
  });

  it("refuses a team with no shrine", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: guildMap.objectives.filter(
          (candidate) =>
            !(
              candidate.kind === "resurrection-shrine" &&
              "team" in candidate &&
              candidate.team === 0
            ),
        ),
      }),
    ).toThrow(/team 0 has 0 resurrection shrines/);
  });

  it("refuses a Guild Lord against a wall", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: [...guildMap.objectives.slice(0, 3), objective("guild-lord", 1, 50, 20)],
      }),
    ).toThrow(/a body clear of every wall/);
  });

  it("refuses a Guild Lord on a map of any other mode", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        mode: "priest-annihilation",
      }),
    ).toThrow(/priest-annihilation map has no Guild Lord/);
    expect(() =>
      validateMapData({ ...validMap, objectives: [objective("guild-lord", 0, 50, 50)] }),
    ).toThrow(/annihilation map has no Guild Lord/);
  });
});

describe("guild battle guards (#1223)", () => {
  const guard = (team: number, role: string, x: number, y: number) => ({
    kind: "guard",
    team,
    role,
    position: { x, y },
  });
  const guildMap = {
    ...validMap,
    mode: "guild-battle",
    walls: [],
    spawnPoints: [
      { team: 0, position: { x: 20, y: 50 } },
      { team: 1, position: { x: 80, y: 50 } },
    ],
    objectives: [
      { kind: "resurrection-shrine", team: 0, position: { x: 20, y: 80 } },
      { kind: "resurrection-shrine", team: 1, position: { x: 80, y: 20 } },
      { kind: "guild-lord", team: 0, position: { x: 20, y: 20 } },
      { kind: "guild-lord", team: 1, position: { x: 80, y: 80 } },
      { kind: "flag-spawn", team: 0, position: { x: 30, y: 60 } },
      { kind: "flag-spawn", team: 1, position: { x: 70, y: 60 } },
      { kind: "flag-stand", position: { x: 50, y: 70 } },
    ],
  };

  it("accepts any number of guards a team, or none", () => {
    expect(validateMapData(guildMap).objectives).toHaveLength(7);
    const guarded = {
      ...guildMap,
      objectives: [
        ...guildMap.objectives,
        guard(0, "bodyguard", 30, 30),
        guard(0, "knight", 40, 30),
        guard(0, "knight", 30, 40),
        guard(1, "archer", 70, 70),
      ],
    };
    expect(validateMapData(guarded).objectives).toHaveLength(11);
  });

  it("refuses a second bodyguard on one team", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: [
          ...guildMap.objectives,
          guard(1, "bodyguard", 70, 70),
          guard(1, "bodyguard", 60, 70),
        ],
      }),
    ).toThrow(/team 1 has 2 bodyguards, at most one/);
  });

  it("refuses a role it does not know", () => {
    expect(() =>
      validateMapData({
        ...guildMap,
        objectives: [...guildMap.objectives, guard(0, "catapult", 30, 30)],
      }),
    ).toThrow();
  });

  it("refuses a guard on a map of any other mode", () => {
    expect(() =>
      validateMapData({ ...validMap, objectives: [guard(0, "knight", 50, 50)] }),
    ).toThrow(/annihilation map has no guard/);
  });
});

describe("relic run maps (#1374)", () => {
  const relicMap = {
    ...validMap,
    mode: "relic-run",
    walls: [],
    spawnPoints: [
      { team: 0, position: { x: 20, y: 50 } },
      { team: 1, position: { x: 80, y: 50 } },
    ],
    objectives: [
      { kind: "relic-spawn", team: 0, position: { x: 20, y: 30 } },
      { kind: "relic-spawn", team: 1, position: { x: 80, y: 70 } },
      { kind: "altar", position: { x: 50, y: 50 } },
    ],
  };

  it("accepts one relic spawn per spawning team and one altar", () => {
    expect(validateMapData(relicMap).objectives).toHaveLength(3);
  });

  it("refuses a relic run map with no altar, or two", () => {
    expect(() =>
      validateMapData({
        ...relicMap,
        objectives: relicMap.objectives.filter((candidate) => candidate.kind !== "altar"),
      }),
    ).toThrow(/relic-run map has 0 altars, not one/);
    expect(() =>
      validateMapData({
        ...relicMap,
        objectives: [...relicMap.objectives, { kind: "altar", position: { x: 50, y: 70 } }],
      }),
    ).toThrow(/relic-run map has 2 altars, not one/);
  });

  it("refuses a team with no relic spawn", () => {
    expect(() =>
      validateMapData({
        ...relicMap,
        objectives: relicMap.objectives.filter(
          (candidate) => !(candidate.kind === "relic-spawn" && candidate.team === 1),
        ),
      }),
    ).toThrow(/team 1 has 0 relic spawns, not one/);
  });

  it("refuses relics on a map of any other mode", () => {
    expect(() =>
      validateMapData({ ...validMap, objectives: [{ kind: "altar", position: { x: 50, y: 50 } }] }),
    ).toThrow(/annihilation map has no altar/);
  });
});

describe("king of the hill maps (#1377)", () => {
  const hillMap = {
    ...validMap,
    mode: "king-of-the-hill",
    walls: [],
    spawnPoints: [
      { team: 0, position: { x: 20, y: 50 } },
      { team: 1, position: { x: 80, y: 50 } },
    ],
    objectives: [
      { kind: "ghost-spawn", team: 0, position: { x: 20, y: 30 } },
      { kind: "ghost-spawn", team: 1, position: { x: 80, y: 70 } },
      { kind: "altar", position: { x: 50, y: 50 } },
    ],
  };

  it("accepts one ghost spawn per spawning team and one altar", () => {
    expect(validateMapData(hillMap).objectives).toHaveLength(3);
  });

  it("refuses a team with no ghost spawn", () => {
    expect(() =>
      validateMapData({
        ...hillMap,
        objectives: hillMap.objectives.filter(
          (candidate) => !(candidate.kind === "ghost-spawn" && candidate.team === 1),
        ),
      }),
    ).toThrow(/team 1 has 0 ghost spawns, not one/);
  });

  it("refuses a king of the hill map with no altar", () => {
    expect(() =>
      validateMapData({
        ...hillMap,
        objectives: hillMap.objectives.filter((candidate) => candidate.kind !== "altar"),
      }),
    ).toThrow(/king-of-the-hill map has 0 altars, not one/);
  });

  it("refuses a ghost spawn on a map of any other mode", () => {
    expect(() =>
      validateMapData({
        ...validMap,
        objectives: [{ kind: "ghost-spawn", team: 0, position: { x: 50, y: 50 } }],
      }),
    ).toThrow(/annihilation map has no ghost spawn/);
  });
});
