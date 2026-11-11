import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MATCH_MODES, circleIntersectsSegment, hasLineOfSight } from "@vibewars/game-core";

import { allWallSegments } from "./geometry.js";
import {
  DECK_LOOKS,
  MAX_FOG_BANKS,
  MAX_LIGHTS,
  MAX_PLUMES,
  MAX_WATER_BODIES,
  MAX_WATER_POINTS,
  MAX_HARMFUL_ZONE_POINTS,
  MAX_ZONES,
  MAX_ZONE_PATH_POINTS,
  MapValidationError,
  TRANSITION_LOOKS,
  mapDataSchema,
  validateMapData,
  type Wall,
} from "./schema.js";
import layerTest from "../test-maps/layer-test/map.json" with { type: "json" };
import heights from "../training/training-heights/map.json" with { type: "json" };
import structures from "../test-maps/structures/map.json" with { type: "json" };

const validMap = {
  id: "arena-test",
  name: "Arena Test",
  mode: "annihilation",
  teamSizes: [1],
  teams: 2,
  width: 100,
  height: 100,
  layers: 1,
  groundLayer: 0,
  pits: [],
  tunnels: [],
  decks: [],
  transitions: [],
  walls: [
    { kind: "rect", layer: 0, x: 10, y: 10, width: 5, height: 5 },
    {
      kind: "polygon",
      layer: 0,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
    },
  ],
  spawnPoints: [{ team: 0, layer: 0, position: { x: 50, y: 50 } }],
  gates: [],
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

  it("takes one start line on an annihilation map, on the map (#2692)", () => {
    const line = (x: number) => ({
      kind: "start-line",
      layer: 0,
      area: { kind: "rect", x, y: 0, width: 10, height: 10 },
    });
    const annihilation = { ...validMap, mode: "annihilation" };
    expect(validateMapData({ ...annihilation, objectives: [line(0)] }).objectives).toHaveLength(1);
    expect(() => validateMapData({ ...annihilation, objectives: [line(0), line(20)] })).toThrow(
      MapValidationError,
    );
    expect(() => validateMapData({ ...annihilation, objectives: [line(-5)] })).toThrow(
      /must lie on the map/,
    );
  });

  it("refuses a map without team sizes, or with none, a repeated one or one no mode plays (#2108)", () => {
    const { teamSizes: _teamSizes, ...sizeless } = validMap;
    expect(() => validateMapData(sizeless)).toThrow(MapValidationError);
    for (const teamSizes of [[], [2, 2], [3], [16], [0], [1.5]]) {
      expect(() => validateMapData({ ...validMap, teamSizes }), JSON.stringify(teamSizes)).toThrow(
        MapValidationError,
      );
    }
    expect(validateMapData({ ...validMap, teamSizes: [8, 1, 4, 2] }).teamSizes).toEqual([
      8, 1, 4, 2,
    ]);
  });

  it("refuses a map without two or three teams, a spawn of none of them, or three on a two-team mode (#2682)", () => {
    const { teams: _teams, ...teamless } = validMap;
    expect(() => validateMapData(teamless)).toThrow(MapValidationError);
    for (const teams of [0, 1, 4, 2.5]) {
      expect(() => validateMapData({ ...validMap, teams }), String(teams)).toThrow(
        MapValidationError,
      );
    }
    const third = { team: 2, layer: 0, position: { x: 50, y: 50 } };
    const threeTeams = { ...validMap, spawnPoints: [...validMap.spawnPoints, third] };
    expect(() => validateMapData(threeTeams)).toThrow(/spawn 1 is team 2, not one of 2/);
    expect(validateMapData({ ...threeTeams, teams: 3 }).teams).toBe(3);
    for (const mode of ["kill-count", "guild-battle"]) {
      expect(() => validateMapData({ ...threeTeams, teams: 3, mode }), mode).toThrow(
        `a ${mode} map has two teams, not 3`,
      );
    }
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
        walls: [{ kind: "rect", layer: 0, x: 0, y: 0, width: 0, height: 5 }],
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
            layer: 0,
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

  it("ships the open hall, the pillared one, the open field, the heights and the wilds", () => {
    expect(maps.map(({ map }) => map.id).sort()).toEqual([
      "training-field",
      "training-hall",
      "training-heights",
      "training-pillars",
      "training-wilds",
    ]);
  });

  it("is named for its directory, compact, and spawns one player against dummy slots", () => {
    for (const { dir, map } of maps) {
      expect(map.id).toBe(dir);
      // The field (#497) is big enough to run in, the heights (#2937) to climb in,
      // the wilds (#3024) to walk between its zones.
      const roomy = ["training-field", "training-heights", "training-wilds"].includes(map.id);
      expect(map.width, map.id).toBeLessThanOrEqual(roomy ? 1400 : 600);
      expect(map.height, map.id).toBeLessThanOrEqual(roomy ? 900 : 450);
      expect(
        map.spawnPoints.filter((s) => s.team === 0),
        map.id,
      ).toHaveLength(1);
      expect(map.spawnPoints.filter((s) => s.team === 1).length, map.id).toBeGreaterThan(0);
    }
  });

  it("training-heights has decks on layers 2 and 3 over its ground on 1, and a ramp joining each pair (#2937, #2973)", () => {
    const heights = maps.find(({ map }) => map.id === "training-heights")?.map;
    if (heights === undefined) throw new Error("no training-heights");
    expect(heights.groundLayer).toBe(1);
    expect(heights.decks.map(({ layer }) => layer).sort()).toEqual([2, 3]);
    expect(heights.transitions.map(({ from, to }) => [from, to])).toEqual(
      expect.arrayContaining([
        [0, 1],
        [1, 2],
        [2, 3],
      ]),
    );
  });

  it("training-heights' pit ramps are each at least 110 long, climbing, for their route cache (#2972, #2973)", () => {
    const heights = maps.find(({ map }) => map.id === "training-heights")?.map;
    if (heights === undefined) throw new Error("no training-heights");
    const pitRamps = heights.transitions.filter(({ to }) => to === heights.groundLayer);
    expect(pitRamps).toHaveLength(2);
    for (const { area, uphill } of pitRamps) {
      if (area.kind !== "rect") throw new Error("a pit ramp is a rect");
      expect(uphill === "e" || uphill === "w" ? area.width : area.height).toBeGreaterThanOrEqual(
        110,
      );
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
    const a = outline({ kind: "rect", layer: 0, x: 0, y: 0, width: 10, height: 10 });
    const plus = outline({ kind: "rect", layer: 0, x: 4, y: -5, width: 2, height: 20 });
    const within = outline({ kind: "rect", layer: 0, x: 2, y: 2, width: 2, height: 2 });
    const beside = outline({ kind: "rect", layer: 0, x: 10, y: 0, width: 5, height: 10 });
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
    walls: [{ kind: "rect", layer: 0, x: 45, y: 0, width: 10, height: 40 }],
    spawnPoints: [
      { team: 0, layer: 0, position: { x: 20, y: 50 } },
      { team: 1, layer: 0, position: { x: 80, y: 50 } },
    ],
    objectives: [
      { kind: "resurrection-shrine", layer: 0, team: 0, position: { x: 20, y: 80 } },
      { kind: "resurrection-shrine", layer: 0, team: 1, position: { x: 80, y: 20 } },
    ],
  };
  const shrine = (team: number, x: number, y: number) => ({
    kind: "resurrection-shrine",
    layer: 0,
    team,
    position: { x, y },
  });

  it("accepts one shrine per spawning team, clear of the walls", () => {
    expect(validateMapData(priestMap).objectives).toHaveLength(2);
  });

  it("refuses an objective with no layer, or one off the map's layers (#2900)", () => {
    const { layer: _layer, ...layerless } = shrine(0, 20, 80);
    const objectives = (first: object) => [first, shrine(1, 80, 20)];
    expect(() => validateMapData({ ...priestMap, objectives: objectives(layerless) })).toThrow(
      MapValidationError,
    );
    expect(() =>
      validateMapData({ ...priestMap, objectives: objectives({ ...layerless, layer: 1 }) }),
    ).toThrow(/layer 1 is not one of the map's/);
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
    layer: 0,
    team,
    position: { x, y },
  });
  const guildMap = {
    ...validMap,
    mode: "guild-battle",
    walls: [{ kind: "rect", layer: 0, x: 45, y: 0, width: 10, height: 40 }],
    spawnPoints: [
      { team: 0, layer: 0, position: { x: 20, y: 50 } },
      { team: 1, layer: 0, position: { x: 80, y: 50 } },
    ],
    objectives: [
      objective("resurrection-shrine", 0, 20, 80),
      objective("resurrection-shrine", 1, 80, 20),
      objective("guild-lord", 0, 20, 20),
      objective("guild-lord", 1, 80, 80),
      objective("flag-spawn", 0, 30, 60),
      objective("flag-spawn", 1, 70, 60),
      { kind: "flag-stand", layer: 0, position: { x: 50, y: 70 } },
    ],
  };

  it("accepts one shrine, Guild Lord and flag spawn per spawning team, and one stand", () => {
    expect(validateMapData(guildMap).objectives).toHaveLength(7);
  });

  it("takes a Storm Beacon on Priest Annihilation only with a flag spawn per team (#2694)", () => {
    const shrines = [
      objective("resurrection-shrine", 0, 20, 80),
      objective("resurrection-shrine", 1, 80, 20),
    ];
    const beacon = { kind: "storm-beacon", layer: 0, position: { x: 50, y: 70 } };
    const priest = { ...guildMap, mode: "priest-annihilation" };
    expect(
      validateMapData({
        ...priest,
        objectives: [
          ...shrines,
          beacon,
          objective("flag-spawn", 0, 30, 60),
          objective("flag-spawn", 1, 70, 60),
        ],
      }).objectives,
    ).toHaveLength(5);
    expect(() => validateMapData({ ...priest, objectives: [...shrines, beacon] })).toThrow(
      /team 0 has 0 flag spawns, not one/,
    );
    expect(() =>
      validateMapData({
        ...priest,
        objectives: [...shrines, objective("flag-spawn", 0, 30, 60)],
      }),
    ).toThrow(/priest-annihilation map has no flag spawn/);
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
        objectives: [
          ...guildMap.objectives,
          { kind: "flag-stand", layer: 0, position: { x: 50, y: 80 } },
        ],
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
        objectives: [{ kind: "flag-stand", layer: 0, position: { x: 50, y: 50 } }],
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
          { kind: "flag-stand", layer: 0, position: { x: 50, y: 20 } },
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
    layer: 0,
    team,
    role,
    position: { x, y },
  });
  const guildMap = {
    ...validMap,
    mode: "guild-battle",
    walls: [],
    spawnPoints: [
      { team: 0, layer: 0, position: { x: 20, y: 50 } },
      { team: 1, layer: 0, position: { x: 80, y: 50 } },
    ],
    objectives: [
      { kind: "resurrection-shrine", layer: 0, team: 0, position: { x: 20, y: 80 } },
      { kind: "resurrection-shrine", layer: 0, team: 1, position: { x: 80, y: 20 } },
      { kind: "guild-lord", layer: 0, team: 0, position: { x: 20, y: 20 } },
      { kind: "guild-lord", layer: 0, team: 1, position: { x: 80, y: 80 } },
      { kind: "flag-spawn", layer: 0, team: 0, position: { x: 30, y: 60 } },
      { kind: "flag-spawn", layer: 0, team: 1, position: { x: 70, y: 60 } },
      { kind: "flag-stand", layer: 0, position: { x: 50, y: 70 } },
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
    relicTarget: "altar",
    relicCarry: "own",
    walls: [],
    spawnPoints: [
      { team: 0, layer: 0, position: { x: 20, y: 50 } },
      { team: 1, layer: 0, position: { x: 80, y: 50 } },
    ],
    objectives: [
      { kind: "relic-spawn", layer: 0, team: 0, position: { x: 20, y: 30 } },
      { kind: "relic-spawn", layer: 0, team: 1, position: { x: 80, y: 70 } },
      { kind: "altar", layer: 0, position: { x: 50, y: 50 } },
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
        objectives: [
          ...relicMap.objectives,
          { kind: "altar", layer: 0, position: { x: 50, y: 70 } },
        ],
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
      validateMapData({
        ...validMap,
        objectives: [{ kind: "altar", layer: 0, position: { x: 50, y: 50 } }],
      }),
    ).toThrow(/annihilation map has no altar/);
  });
});

describe("capture points maps (#1378)", () => {
  const point = (x: number, y: number) => ({ kind: "capture-point", layer: 0, position: { x, y } });
  const base = (team: number, x: number) => ({
    kind: "resurrection-shrine",
    layer: 0,
    team,
    position: { x, y: 50 },
  });
  const bases = [base(0, 15), base(1, 85)];
  const captureMap = {
    ...validMap,
    mode: "capture-points",
    walls: [],
    spawnPoints: [
      { team: 0, layer: 0, position: { x: 20, y: 50 } },
      { team: 1, layer: 0, position: { x: 80, y: 50 } },
    ],
    objectives: [point(30, 30), point(50, 50), point(70, 70), ...bases],
  };

  it("accepts one to five capture points", () => {
    expect(validateMapData(captureMap).objectives).toHaveLength(5);
    expect(
      validateMapData({ ...captureMap, objectives: [point(50, 50), ...bases] }).objectives,
    ).toHaveLength(3);
  });

  it("refuses a team with no base shrine (#2845)", () => {
    expect(() =>
      validateMapData({ ...captureMap, objectives: [point(50, 50), base(0, 15)] }),
    ).toThrow(/team 1 has 0 resurrection shrines, not one/);
    expect(() => validateMapData({ ...captureMap, objectives: [point(50, 50)] })).toThrow(
      /team 0 has 0 resurrection shrines, not one/,
    );
  });

  it("refuses a capture points map with none, or eight", () => {
    expect(() => validateMapData({ ...captureMap, objectives: [] })).toThrow(
      /capture-points map has 0 capture points, not 1 to 7/,
    );
    const eight = [20, 30, 40, 50, 60, 70, 80, 90].map((x) => point(x, 30));
    expect(() => validateMapData({ ...captureMap, objectives: eight })).toThrow(
      /capture-points map has 8 capture points, not 1 to 7/,
    );
  });

  it("refuses capture points on a map of any other mode", () => {
    expect(() => validateMapData({ ...validMap, objectives: [point(50, 50)] })).toThrow(
      /annihilation map has no capture point/,
    );
  });
});

describe("king of the hill maps (#1377)", () => {
  const hillMap = {
    ...validMap,
    mode: "king-of-the-hill",
    ghostLevel: 24,
    walls: [],
    spawnPoints: [
      { team: 0, layer: 0, position: { x: 20, y: 50 } },
      { team: 1, layer: 0, position: { x: 80, y: 50 } },
    ],
    objectives: [
      { kind: "ghost-spawn", layer: 0, team: 0, position: { x: 20, y: 30 } },
      { kind: "ghost-spawn", layer: 0, team: 1, position: { x: 80, y: 70 } },
      { kind: "altar", layer: 0, position: { x: 50, y: 50 } },
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

  it("refuses a king of the hill map with no ghost level (#2689)", () => {
    const { ghostLevel: _, ...levelless } = hillMap;
    expect(() => validateMapData(levelless)).toThrow(
      /king-of-the-hill map has ghosts, so a ghostLevel/,
    );
  });
});

describe("ghost maps (#2689)", () => {
  const ghostMap = {
    ...validMap,
    ghostLevel: 20,
    objectives: [{ kind: "ghost-spawn", layer: 0, team: 0, position: { x: 50, y: 50 } }],
  };

  it("accepts one ghost spawn per spawning team on a map of any mode with a ghost level", () => {
    expect(validateMapData(ghostMap).ghostLevel).toBe(20);
  });

  it("refuses a ghost spawn on a map with no ghost level", () => {
    const { ghostLevel: _, ...levelless } = ghostMap;
    expect(() => validateMapData(levelless)).toThrow(/annihilation map has no ghost spawn/);
  });

  it("refuses a ghost level with no ghost spawn, or one Heroes' Ascent has not", () => {
    expect(() => validateMapData({ ...ghostMap, objectives: [] })).toThrow(
      /team 0 has 0 ghost spawns, not one/,
    );
    expect(() => validateMapData({ ...ghostMap, ghostLevel: 22 })).toThrow(/ghostLevel/);
  });

  describe("gates (#2691)", () => {
    const opener = { kind: "plate", plate: { x: 50, y: 50 }, team: null };
    const gate = {
      id: "north",
      wall: { kind: "rect", layer: 0, x: 80, y: 40, width: 8, height: 40 },
      opener,
      blocks: "all",
    };

    it("rejects a one-way gate whose plate is outside, or with no altar to be inside of", () => {
      const altar = { kind: "altar", layer: 0, position: { x: 50, y: 60 } };
      const oneWay = { ...gate, opener: { ...opener, oneWay: true } };
      const outside = { ...gate, opener: { ...opener, oneWay: true, plate: { x: 150, y: 60 } } };
      expect(() => validateMapData({ ...validMap, gates: [oneWay] })).toThrow(/altar/);
      expect(() => validateMapData({ ...validMap, objectives: [altar], gates: [outside] })).toThrow(
        /altar/,
      );
    });

    it("accepts a neutral gate with its plate clear of every wall", () => {
      expect(validateMapData({ ...validMap, gates: [gate] }).gates).toHaveLength(1);
    });

    it("refuses a plate off the map, and a team that does not spawn", () => {
      expect(() =>
        validateMapData({
          ...validMap,
          gates: [{ ...gate, opener: { ...opener, plate: { x: -5, y: 0 } } }],
        }),
      ).toThrow(/gate north/);
      expect(() =>
        validateMapData({ ...validMap, gates: [{ ...gate, opener: { ...opener, team: 7 } }] }),
      ).toThrow(/gate north/);
    });
  });

  describe("switches (#3025)", () => {
    const door = {
      id: "door",
      wall: { kind: "rect", layer: 0, x: 80, y: 40, width: 8, height: 40 },
      opener: { kind: "switch" },
      blocks: "all",
    };
    const plated = {
      id: "plated",
      wall: { kind: "rect", layer: 0, x: 120, y: 40, width: 8, height: 40 },
      opener: { kind: "plate", plate: { x: 50, y: 50 }, team: null },
      blocks: "all",
    };
    const lever = { id: "lever", layer: 0, position: { x: 50, y: 50 }, targets: ["door"] };

    it("accepts a switch that names a switch's gate", () => {
      const map = validateMapData({ ...validMap, gates: [door], switches: [lever] });
      expect(map.switches).toEqual([lever]);
    });

    it("refuses a target that is no gate, and one that is a plate's gate", () => {
      expect(() =>
        validateMapData({
          ...validMap,
          gates: [door],
          switches: [{ ...lever, targets: ["door", "nowhere"] }],
        }),
      ).toThrow(/switch lever names nowhere, which is no gate or teleport/);
      expect(() =>
        validateMapData({
          ...validMap,
          gates: [door, plated],
          switches: [{ ...lever, targets: ["door", "plated"] }],
        }),
      ).toThrow(/switch lever names plated, a plate's gate/);
    });

    it("refuses a switch's gate that no switch names", () => {
      expect(() => validateMapData({ ...validMap, gates: [door] })).toThrow(
        /gate door opens by switch, and no switch names it/,
      );
    });

    it("refuses a switch off its layer's ground, on a missing layer, or twice by id", () => {
      expect(() =>
        validateMapData({
          ...validMap,
          gates: [door],
          switches: [{ ...lever, position: { x: -20, y: 50 } }],
        }),
      ).toThrow(/switch lever needs a body clear/);
      expect(() =>
        validateMapData({ ...validMap, gates: [door], switches: [{ ...lever, layer: 3 }] }),
      ).toThrow(/switches.0.layer/);
      expect(() =>
        validateMapData({ ...validMap, gates: [door], switches: [lever, lever] }),
      ).toThrow(/switch id lever is used twice/);
    });

    it("refuses more than six", () => {
      const many = Array.from({ length: 7 }, (_, at) => ({ ...lever, id: `lever-${String(at)}` }));
      expect(() => validateMapData({ ...validMap, gates: [door], switches: many })).toThrow(
        /switches/,
      );
    });
  });

  describe("teleports (#3030)", () => {
    const teleport = {
      id: "portal",
      from: {
        layer: 0,
        area: {
          kind: "polygon",
          points: [
            { x: 60, y: 60 },
            { x: 80, y: 60 },
            { x: 80, y: 80 },
            { x: 60, y: 80 },
          ],
        },
      },
      to: { layer: 0, position: { x: 30, y: 70 } },
      enabled: true,
    };
    const lever = { id: "lever", layer: 0, position: { x: 50, y: 30 }, targets: ["portal"] };

    it("accepts a portal, and a switch that names it", () => {
      expect(validateMapData({ ...validMap, teleports: [teleport] }).teleports).toEqual([teleport]);
      const off = { ...teleport, enabled: false };
      expect(
        validateMapData({ ...validMap, teleports: [off], switches: [lever] }).teleports,
      ).toEqual([off]);
    });

    it("refuses an exit off its layer's ground, or in a portal's entry", () => {
      expect(() =>
        validateMapData({
          ...validMap,
          teleports: [{ ...teleport, to: { layer: 0, position: { x: -20, y: 70 } } }],
        }),
      ).toThrow(/teleport portal needs its exit clear/);
      expect(() =>
        validateMapData({
          ...validMap,
          teleports: [{ ...teleport, to: { layer: 0, position: { x: 70, y: 70 } } }],
        }),
      ).toThrow(/teleport portal has its exit in a teleport's entry/);
    });

    it("refuses an exit in deep water", () => {
      const pool = {
        id: "pool",
        layer: 0,
        depth: "deep",
        area: { kind: "rect", x: 20, y: 60, width: 20, height: 20 },
      };
      expect(() => validateMapData({ ...validMap, water: [pool], teleports: [teleport] })).toThrow(
        /teleport portal has its exit in deep water/,
      );
    });

    it("refuses a portal that starts off with no switch to turn it on", () => {
      expect(() =>
        validateMapData({ ...validMap, teleports: [{ ...teleport, enabled: false }] }),
      ).toThrow(/teleport portal starts off, and no switch names it/);
    });

    it("refuses an id a gate or another portal holds", () => {
      const door = {
        id: "portal",
        wall: { kind: "rect", layer: 0, x: 80, y: 20, width: 8, height: 20 },
        opener: { kind: "switch" },
        blocks: "all",
      };
      expect(() =>
        validateMapData({ ...validMap, gates: [door], teleports: [teleport], switches: [lever] }),
      ).toThrow(/teleport id portal is used twice/);
      expect(() => validateMapData({ ...validMap, teleports: [teleport, teleport] })).toThrow(
        /teleport id portal is used twice/,
      );
    });

    it("counts a switched portal against the gates' six", () => {
      const gates = Array.from({ length: 6 }, (_, at) => ({
        id: `gate-${String(at)}`,
        wall: { kind: "rect", layer: 0, x: 90, y: 5 + at * 15, width: 4, height: 8 },
        opener: { kind: "plate", plate: { x: 50, y: 50 }, team: null },
        blocks: "all",
      }));
      expect(validateMapData({ ...validMap, gates, teleports: [teleport] }).gates).toHaveLength(6);
      expect(() =>
        validateMapData({ ...validMap, gates, teleports: [teleport], switches: [lever] }),
      ).toThrow(/7 gates, breakables and switched teleports, more than 6/);
    });
  });

  describe("barriers and breakable walls (#3031)", () => {
    const barrier = {
      id: "shimmer",
      wall: { kind: "rect", layer: 0, x: 80, y: 40, width: 8, height: 40 },
      opener: { kind: "plate", plate: { x: 50, y: 50 }, team: null },
      blocks: "bodies-and-shots",
    };
    const crack = {
      id: "crack",
      wall: { kind: "rect", layer: 0, x: 120, y: 40, width: 8, height: 40 },
      health: 800,
    };

    it("accepts a barrier gate and a breakable wall", () => {
      const map = validateMapData({ ...validMap, gates: [barrier], breakables: [crack] });
      expect(map.gates[0]?.blocks).toBe("bodies-and-shots");
      expect(map.breakables).toEqual([crack]);
    });

    it("refuses a gate that says not what it blocks", () => {
      const { blocks: _, ...silent } = barrier;
      expect(() => validateMapData({ ...validMap, gates: [silent] })).toThrow(/blocks/);
    });

    it("refuses health outside 100 to 5000, and an id used twice", () => {
      expect(() =>
        validateMapData({ ...validMap, breakables: [{ ...crack, health: 99 }] }),
      ).toThrow(/health/);
      expect(() =>
        validateMapData({ ...validMap, breakables: [{ ...crack, health: 5001 }] }),
      ).toThrow(/health/);
      expect(() => validateMapData({ ...validMap, breakables: [crack, crack] })).toThrow(
        /breakable id crack is used twice/,
      );
    });

    it("refuses one over a switch or a plate", () => {
      const lever = { id: "lever", layer: 0, position: { x: 124, y: 60 }, targets: ["door"] };
      const door = { ...barrier, id: "door", opener: { kind: "switch" } };
      expect(() =>
        validateMapData({ ...validMap, gates: [door], switches: [lever], breakables: [crack] }),
      ).toThrow(/breakable crack covers switch lever/);
      const plated = { ...barrier, opener: { ...barrier.opener, plate: { x: 135, y: 60 } } };
      expect(() => validateMapData({ ...validMap, gates: [plated], breakables: [crack] })).toThrow(
        /breakable crack covers gate shimmer's plate/,
      );
    });

    it("counts each breakable against the gates' six", () => {
      const gates = Array.from({ length: 5 }, (_, at) => ({
        ...barrier,
        id: `gate-${String(at)}`,
        wall: { kind: "rect", layer: 0, x: 90, y: 5 + at * 15, width: 4, height: 8 },
      }));
      expect(validateMapData({ ...validMap, gates, breakables: [crack] }).gates).toHaveLength(5);
      expect(() =>
        validateMapData({
          ...validMap,
          gates,
          breakables: [crack, { ...crack, id: "crack-2" }],
        }),
      ).toThrow(/7 gates, breakables and switched teleports, more than 6/);
    });
  });
});

describe("layers, decks and transitions (#2826, ADR-0051)", () => {
  const ramp = (from: number, to: number, x = 350) => ({
    from,
    to,
    area: { kind: "rect", x, y: 300, width: 170, height: 200 },
    uphill: "e",
    look: "ramp",
  });
  const deck = (id: string, layer: number) => ({
    id,
    layer,
    footprint: { kind: "rect", x: 500, y: 300, width: 600, height: 200 },
    look: "platform",
  });
  const accepts = (overrides: object): void => {
    expect(() => validateMapData({ ...layerTest, ...overrides })).not.toThrow();
  };
  const refuses = (overrides: object, message: RegExp): void => {
    expect(() => validateMapData({ ...layerTest, ...overrides })).toThrow(message);
  };
  const spawnAt = (layer: number, x: number, y: number) => [
    ...layerTest.spawnPoints,
    { team: 0, layer, position: { x, y } },
  ];

  it("validates the test map, which is out of the rotation", () => {
    expect(validateMapData(layerTest).layers).toBe(2);
    expect(validateMapData(layerTest).decks).toHaveLength(1);
  });

  it("requires every new field", () => {
    const { layers: _layers, ...noLayers } = layerTest;
    expect(() => validateMapData(noLayers)).toThrow(/layers/);
    const [first, ...rest] = layerTest.spawnPoints;
    const { layer: _layer, ...unlayered } = first ?? { layer: 0 };
    refuses({ spawnPoints: [unlayered, ...rest] }, /spawnPoints\.0\.layer/);
    const { groundLayer: _ground, ...noGround } = layerTest;
    expect(() => validateMapData(noGround)).toThrow(/groundLayer/);
    const [ramp0, ...ramps] = layerTest.transitions;
    const { uphill: _uphill, ...noUphill } = ramp0 ?? { uphill: "e" };
    refuses({ transitions: [noUphill, ...ramps] }, /transitions\.0\.uphill/);
  });

  it("requires a deck's and a transition's look (#3067)", () => {
    const [bridge] = layerTest.decks;
    const { look: _deckLook, ...plainDeck } = bridge ?? { look: "platform" };
    refuses({ decks: [plainDeck] }, /decks\.0\.look/);
    const [ramp0, ...ramps] = layerTest.transitions;
    const { look: _rampLook, ...plainRamp } = ramp0 ?? { look: "ramp" };
    refuses({ transitions: [plainRamp, ...ramps] }, /transitions\.0\.look/);
    refuses({ transitions: [{ ...ramp0, look: "slide" }, ...ramps] }, /transitions\.0\.look/);
  });

  it("refuses a tower too big to rush, a ladder wide enough for two, a wall-walk over no wall (#3067)", () => {
    const [bridge] = layerTest.decks;
    refuses({ decks: [{ ...bridge, look: "tower" }] }, /decks\.0\.footprint: tower bridge is 600/);
    const [ramp0, ...ramps] = layerTest.transitions;
    refuses(
      { transitions: [{ ...ramp0, look: "ladder" }, ...ramps] },
      /transitions\.0\.area: ladder 0 is 200\.0 wide/,
    );
    refuses(
      { decks: [{ ...bridge, look: "wall-walk" }] },
      /decks\.0\.footprint: wall-walk bridge does not lie over walls on layer 0/,
    );
    // A wall-walk may stand out past its wall by 8, here over the ramps' heads.
    const wallUnder = { kind: "rect", layer: 0, x: 524, y: 300, width: 552, height: 200 };
    const walk = { kind: "rect", x: 516, y: 300, width: 568, height: 200 };
    accepts({
      walls: [...layerTest.walls, wallUnder],
      decks: [{ ...bridge, footprint: walk, look: "wall-walk" }],
    });
    refuses(
      {
        walls: [...layerTest.walls, wallUnder],
        decks: [{ ...bridge, footprint: { ...walk, x: 510, width: 580 }, look: "wall-walk" }],
      },
      /wall-walk bridge does not lie over walls/,
    );
  });

  it("validates the structures test map, every look on it once (#3067)", () => {
    const map = validateMapData(structures);
    expect(new Set(map.decks.map(({ look }) => look))).toEqual(new Set(DECK_LOOKS));
    expect(new Set(map.transitions.map(({ look }) => look))).toEqual(new Set(TRANSITION_LOOKS));
  });

  it("refuses a layer outside the map's, naming the field", () => {
    refuses({ spawnPoints: spawnAt(2, 600, 400) }, /spawnPoints\.4\.layer: layer 2/);
    refuses(
      { walls: [{ kind: "rect", layer: 2, x: 780, y: 120, width: 40, height: 40 }] },
      /walls\.0\.layer: layer 2/,
    );
    refuses(
      { objectives: [], mode: "annihilation", decks: [deck("a", 2)] },
      /decks\.0\.layer: layer 2/,
    );
    refuses(
      { transitions: [...layerTest.transitions, ramp(2, 3)] },
      /transitions\.2\.from: layer 2/,
    );
    refuses({ transitions: [...layerTest.transitions, ramp(1, 2)] }, /transitions\.2\.to: layer 2/);
  });

  it("refuses a transition that does not go one layer up", () => {
    refuses(
      { transitions: [...layerTest.transitions, ramp(1, 0)] },
      /transitions\.2\.to: .*not one above/,
    );
    refuses(
      { layers: 3, transitions: [...layerTest.transitions, ramp(0, 2)] },
      /transitions\.2\.to: .*not one above/,
    );
  });

  it("refuses a deck outside the map, naming decks", () => {
    refuses(
      {
        decks: [
          {
            id: "bridge",
            layer: 1,
            footprint: { kind: "rect", x: 500, y: 300, width: 1200, height: 200 },
            look: "platform",
          },
        ],
      },
      /decks\.0\.footprint: .*outside the map/,
    );
  });

  it("refuses a transition outside the map", () => {
    refuses(
      { transitions: [...layerTest.transitions, ramp(0, 1, 1500)] },
      /transitions\.2\.area: .*outside the map/,
    );
  });

  it("refuses a ramp too short uphill for a route over it, and keeps one long enough (#2995)", () => {
    const [, far] = layerTest.transitions;
    const uphillBy = (width: number) => ({
      transitions: [
        {
          from: 0,
          to: 1,
          area: { kind: "rect", x: 520 - width, y: 300, width, height: 200 },
          uphill: "e",
          look: "ramp",
        },
        ...(far === undefined ? [] : [far]),
      ],
    });
    refuses(uphillBy(100), /transitions\.0: transition 0 is 100\.0 long uphill/);
    accepts(uphillBy(140));
  });

  it("refuses a transition from a deck that touches none", () => {
    refuses(
      {
        layers: 3,
        decks: [...layerTest.decks, deck("upper", 2)],
        transitions: [
          ...layerTest.transitions,
          {
            from: 1,
            to: 2,
            area: { kind: "rect", x: 100, y: 100, width: 50, height: 50 },
            uphill: "n",
            look: "ramp",
          },
        ],
      },
      /transitions\.2\.from: transition 2 touches no deck on layer 1/,
    );
  });

  it("refuses a deck on the ground, a duplicate id, and a deck no transition reaches", () => {
    refuses({ decks: [...layerTest.decks, deck("ground", 0)] }, /decks\.1\.layer: deck ground/);
    refuses({ decks: [...layerTest.decks, deck("bridge", 1)] }, /decks\.1\.id: deck id bridge/);
    refuses({ transitions: [] }, /decks\.0: deck bridge has no transition/);
    refuses(
      {
        transitions: [
          {
            from: 0,
            to: 1,
            area: { kind: "rect", x: 10, y: 10, width: 50, height: 50 },
            uphill: "e",
            look: "ramp",
          },
        ],
      },
      /decks\.0: deck bridge has no transition/,
    );
  });

  it("refuses a layer above the ground with no deck", () => {
    refuses(
      { decks: [], spawnPoints: layerTest.spawnPoints.slice(0, 2) },
      /layers: layer 1 has no deck/,
    );
  });

  it("refuses a spawn off its layer's walkable area or on its walls", () => {
    refuses({ spawnPoints: spawnAt(1, 200, 100) }, /spawnPoints\.4: spawn 4 must be/);
    refuses({ spawnPoints: spawnAt(1, 800, 400) }, /spawnPoints\.4: spawn 4 must be/);
    refuses({ spawnPoints: spawnAt(1, 700, 301) }, /spawnPoints\.4: spawn 4 must be/);
  });

  it("walks a body across where a ramp meets the deck", () => {
    accepts({ spawnPoints: spawnAt(1, 510, 400) });
  });

  it("refuses an objective or a plate that does not stand clear on its own layer", () => {
    const capture = (layer: number, x: number, y: number) => ({
      mode: "capture-points",
      spawnPoints: layerTest.spawnPoints,
      objectives: [
        { kind: "capture-point", layer, position: { x, y } },
        { kind: "resurrection-shrine", layer: 0, team: 0, position: { x: 200, y: 200 } },
        { kind: "resurrection-shrine", layer: 0, team: 1, position: { x: 1400, y: 200 } },
      ],
    });
    accepts(capture(1, 600, 400));
    refuses(capture(1, 200, 100), /objectives\.0: objective 0 must be/);
    refuses(capture(1, 800, 400), /objectives\.0: objective 0 must be/);
    const plate = (layer: number, x: number, y: number) => ({
      gates: [
        {
          id: "g",
          opener: { kind: "plate", plate: { x, y }, team: null },
          blocks: "all",
          wall: { kind: "rect", layer, x: 950, y: 320, width: 20, height: 20 },
        },
      ],
    });
    accepts(plate(1, 600, 400));
    refuses(plate(1, 200, 100), /gates\.0: gate g/);
    refuses(plate(1, 800, 400), /gates\.0: gate g/);
  });

  it("reads only a position's own layer for clearance", () => {
    // Layer 1's wall stands at (800, 420): on the ground the spot is clear.
    accepts({ spawnPoints: spawnAt(0, 800, 420) });
    accepts({
      walls: [
        { kind: "rect", layer: 0, x: 780, y: 400, width: 40, height: 40 },
        { kind: "rect", layer: 1, x: 780, y: 400, width: 40, height: 40 },
      ],
      spawnPoints: layerTest.spawnPoints,
    });
    refuses({ spawnPoints: spawnAt(1, 782, 420) }, /spawnPoints\.4/);
  });
});

describe("lighting (#2986, ADR-0052)", () => {
  const ambient = { colour: 0x8090a0, intensity: 0.8 };
  const light = {
    id: "torch",
    position: { x: 10, y: 10 },
    layer: 0,
    radius: 30,
    colour: 0xffaa55,
    intensity: 1,
    flicker: 0.3,
  };
  const lighting = {
    ambient,
    indoorAmbient: ambient,
    indoor: [{ kind: "rect", x: 0, y: 0, width: 20, height: 20 }],
    sun: { directionDeg: 135, elevationDeg: 45, colour: 0xfff0d0, intensity: 0.5 },
    lights: [light],
  };
  const accepts = (value: unknown): boolean =>
    mapDataSchema.safeParse({ ...validMap, lighting: value }).success;
  const withLights = (lights: unknown[]): boolean => accepts({ ...lighting, lights });

  it("is optional", () => {
    expect(mapDataSchema.safeParse(validMap).success).toBe(true);
  });

  it("accepts a whole lighting, and one with no sun", () => {
    expect(accepts(lighting)).toBe(true);
    expect(accepts({ ...lighting, sun: undefined })).toBe(true);
  });

  it("refuses a light off the map, or on a layer it does not have", () => {
    expect(withLights([{ ...light, position: { x: 101, y: 10 } }])).toBe(false);
    expect(withLights([{ ...light, position: { x: 10, y: -1 } }])).toBe(false);
    expect(withLights([{ ...light, layer: 1 }])).toBe(false);
  });

  it("refuses a radius of zero, a flicker over 1 and a colour out of range", () => {
    expect(withLights([{ ...light, radius: 0 }])).toBe(false);
    expect(withLights([{ ...light, flicker: 1.1 }])).toBe(false);
    expect(withLights([{ ...light, colour: 0x1000000 }])).toBe(false);
  });

  it("refuses two lights with one id", () => {
    expect(withLights([light, light])).toBe(false);
  });

  it("holds at most MAX_LIGHTS", () => {
    const many = (count: number): unknown[] =>
      Array.from({ length: count }, (_, index) => ({ ...light, id: `torch-${String(index)}` }));
    expect(withLights(many(MAX_LIGHTS))).toBe(true);
    expect(withLights(many(MAX_LIGHTS + 1))).toBe(false);
  });
});

describe("atmosphere (#3032)", () => {
  const bank = { layer: 0, area: { kind: "rect", x: 10, y: 10, width: 40, height: 30 } };
  const plume = { id: "vent", layer: 0, position: { x: 50, y: 50 }, kind: "steam" };
  const atmosphere = { fog: [bank], plumes: [plume], weather: { kind: "rain", intensity: 0.5 } };
  const accepts = (value: unknown): boolean =>
    mapDataSchema.safeParse({ ...validMap, atmosphere: value }).success;

  it("is optional, and may be empty", () => {
    expect(mapDataSchema.safeParse(validMap).success).toBe(true);
    expect(accepts({ fog: [], plumes: [], weather: null })).toBe(true);
    expect(accepts(atmosphere)).toBe(true);
  });

  it("refuses a fog bank or a plume on a layer the map does not have", () => {
    expect(accepts({ ...atmosphere, fog: [{ ...bank, layer: 1 }] })).toBe(false);
    expect(accepts({ ...atmosphere, plumes: [{ ...plume, layer: 1 }] })).toBe(false);
  });

  it("refuses a fog bank or a plume off the map", () => {
    const area = { kind: "rect", x: 80, y: 10, width: 40, height: 30 };
    expect(accepts({ ...atmosphere, fog: [{ ...bank, area }] })).toBe(false);
    expect(accepts({ ...atmosphere, plumes: [{ ...plume, position: { x: 101, y: 5 } }] })).toBe(
      false,
    );
  });

  it("refuses two plumes with one id, and an unknown kind", () => {
    expect(accepts({ ...atmosphere, plumes: [plume, plume] })).toBe(false);
    expect(accepts({ ...atmosphere, plumes: [{ ...plume, kind: "ash" }] })).toBe(false);
  });

  it("refuses an intensity outside 0 to 1", () => {
    expect(accepts({ ...atmosphere, weather: { kind: "snow", intensity: 1.1 } })).toBe(false);
    expect(accepts({ ...atmosphere, weather: { kind: "snow", intensity: -0.1 } })).toBe(false);
  });

  it(`holds at most ${String(MAX_FOG_BANKS)} fog banks and ${String(MAX_PLUMES)} plumes`, () => {
    const plumes = (count: number): unknown[] =>
      Array.from({ length: count }, (_, index) => ({ ...plume, id: `vent-${String(index)}` }));
    expect(accepts({ ...atmosphere, fog: Array(MAX_FOG_BANKS).fill(bank) })).toBe(true);
    expect(accepts({ ...atmosphere, fog: Array(MAX_FOG_BANKS + 1).fill(bank) })).toBe(false);
    expect(accepts({ ...atmosphere, plumes: plumes(MAX_PLUMES) })).toBe(true);
    expect(accepts({ ...atmosphere, plumes: plumes(MAX_PLUMES + 1) })).toBe(false);
  });
});

describe("water (#2983)", () => {
  const pond = (overrides: object = {}) => ({
    id: "pond",
    layer: 0,
    depth: "deep",
    area: { kind: "rect", x: 200, y: 600, width: 200, height: 100 },
    ...overrides,
  });
  const accepts = (water: unknown[], overrides: object = {}): void => {
    expect(() => validateMapData({ ...layerTest, ...overrides, water })).not.toThrow();
  };
  const refuses = (water: unknown[], message: RegExp, overrides: object = {}): void => {
    expect(() => validateMapData({ ...layerTest, ...overrides, water })).toThrow(message);
  };
  /** A polygon of `count` points round a circle at (800, 650). */
  const round = (count: number) => ({
    kind: "polygon",
    points: Array.from({ length: count }, (_, at) => ({
      x: 800 + 60 * Math.cos((at / count) * 2 * Math.PI),
      y: 650 + 60 * Math.sin((at / count) * 2 * Math.PI),
    })),
  });

  it("is optional, and may be deep or shallow, a rectangle or a polygon", () => {
    expect(validateMapData(layerTest).water).toBeUndefined();
    accepts([pond(), pond({ id: "ford", depth: "shallow", area: round(MAX_WATER_POINTS) })]);
  });

  it("refuses more points than a curved shore needs, and more bodies than a map draws", () => {
    refuses([pond({ area: round(MAX_WATER_POINTS + 1) })], /water\.0\.area\.points/);
    const many = Array.from({ length: MAX_WATER_BODIES + 1 }, (_, at) =>
      pond({
        id: `pool-${String(at)}`,
        area: { kind: "rect", x: at * 40, y: 750, width: 30, height: 30 },
      }),
    );
    refuses(many, /water: /);
  });

  it("refuses a layer the map has not, and a used id", () => {
    refuses([pond({ layer: 2 })], /water\.0\.layer: layer 2/);
    refuses(
      [pond(), pond({ area: { kind: "rect", x: 900, y: 600, width: 50, height: 50 } })],
      /water\.1\.id: water id pond is used twice/,
    );
  });

  it("puts water above the ground on a deck of its layer", () => {
    accepts([pond({ layer: 1, area: { kind: "rect", x: 700, y: 320, width: 60, height: 60 } })]);
    refuses([pond({ layer: 1 })], /water pond on layer 1 is not on a deck/);
  });

  it("refuses two bodies of water overlapping on one layer, not on two", () => {
    const under = { kind: "rect", x: 700, y: 320, width: 60, height: 60 };
    refuses(
      [pond(), pond({ id: "other", depth: "shallow", area: { ...pond().area, x: 300 } })],
      /water other overlaps water pond/,
    );
    accepts([pond({ area: under }), pond({ id: "above", layer: 1, area: under })]);
  });

  it("keeps deep water off a spawn, an objective, a gate and a ramp", () => {
    const onSpawn = { kind: "rect", x: 150, y: 350, width: 100, height: 100 };
    refuses([pond({ area: onSpawn })], /deep water pond covers a spawn \(spawnPoints\.0\)/);
    refuses([pond()], /deep water pond covers an objective, start line \(objectives\.0\)/, {
      objectives: [
        {
          kind: "start-line",
          layer: 0,
          area: { kind: "rect", x: 350, y: 650, width: 100, height: 20 },
        },
      ],
    });
    const gate = {
      id: "sluice",
      wall: { kind: "rect", layer: 0, x: 250, y: 580, width: 8, height: 30 },
      opener: { kind: "plate", plate: { x: 300, y: 500 }, team: null },
      blocks: "all",
    };
    refuses([pond()], /deep water pond covers a gate \(gates\.0\)/, { gates: [gate] });
    const atRamp = { kind: "rect", x: 300, y: 450, width: 100, height: 100 };
    refuses([pond({ area: atRamp })], /deep water pond covers a transition \(transitions\.0\)/);
  });

  it("lets shallow water run into a ramp, and under a spawn", () => {
    const atRamp = { kind: "rect", x: 300, y: 450, width: 100, height: 100 };
    const onSpawn = { kind: "rect", x: 150, y: 350, width: 100, height: 40 };
    accepts([
      pond({ depth: "shallow", area: atRamp }),
      pond({ id: "puddle", depth: "shallow", area: onSpawn }),
    ]);
  });
});

describe("below the ground: pits and tunnels (#2973)", () => {
  const accepts = (overrides: object): void => {
    expect(() => validateMapData({ ...heights, ...overrides })).not.toThrow();
  };
  const refuses = (overrides: object, message: RegExp): void => {
    expect(() => validateMapData({ ...heights, ...overrides })).toThrow(message);
  };
  const [westPit, eastPit] = heights.pits;
  const tunnel = {
    id: "tunnel",
    footprint: { kind: "rect", x: 700, y: 550, width: 280, height: 70 },
  };

  it("validates Heights, whose layer 0 is its pits and tunnel under the ground on 1", () => {
    accepts({});
  });

  it("refuses a ground on 1 with no pit, and pits under a ground on 0", () => {
    refuses({ pits: [], tunnels: [] }, /groundLayer: the ground is layer 1/);
    refuses({ groundLayer: 0 }, /groundLayer: pits and tunnels are below the ground/);
  });

  it("refuses a tunnel that touches no pit", () => {
    refuses(
      { pits: [westPit], tunnels: [{ ...tunnel, footprint: { ...tunnel.footprint, x: 720 } }] },
      /tunnels\.0: tunnel tunnel touches no pit/,
    );
    accepts({ pits: [westPit, eastPit], tunnels: [tunnel] });
  });

  it("refuses a pit ramp whose high edge is off its pit's edge, or that climbs the wrong way", () => {
    const pitRamp = (x: number, uphill: string) => ({
      transitions: heights.transitions.map((transition) =>
        transition.to === 1 &&
        transition.from === 0 &&
        transition.area.kind === "rect" &&
        transition.area.x === 500
          ? { ...transition, area: { ...transition.area, x }, uphill }
          : transition,
      ),
    });
    refuses(pitRamp(510, "w"), /transitions\.3\.area: transition 3 goes up to the ground/);
    refuses(pitRamp(500, "e"), /transitions\.3\.area: transition 3 goes up to the ground/);
  });

  it("refuses a ramp too narrow for a body", () => {
    refuses(
      {
        transitions: heights.transitions.map((transition, index) =>
          index === 3 && transition.area.kind === "rect"
            ? { ...transition, area: { ...transition.area, height: 30 } }
            : transition,
        ),
      },
      /transitions\.3\.area: transition 3 is 30\.0 wide/,
    );
  });
});

describe("effect zones (ADR-0053, #3024)", () => {
  const strip = (overrides: object = {}) => ({
    id: "strip",
    kind: "scorched",
    layer: 0,
    area: { kind: "rect", x: 200, y: 600, width: 60, height: 100 },
    ...overrides,
  });
  const accepts = (zones: unknown[]): void => {
    expect(() => validateMapData({ ...layerTest, zones })).not.toThrow();
  };
  const refuses = (zones: unknown[], message: RegExp): void => {
    expect(() => validateMapData({ ...layerTest, zones })).toThrow(message);
  };

  it("is optional, and may be a rectangle or a polygon on any of the map's layers", () => {
    expect(validateMapData(layerTest).zones).toBeUndefined();
    accepts([
      strip(),
      strip({
        id: "wedge",
        layer: 1,
        area: {
          kind: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 80, y: 0 },
            { x: 0, y: 80 },
          ],
        },
      }),
    ]);
  });

  it("refuses a layer the map has not, and a used id", () => {
    refuses([strip({ layer: 2 })], /zones\.0\.layer: layer 2/);
    refuses([strip(), strip()], /zones\.1\.id: zone id strip is used twice/);
  });

  it("refuses a kind game-core has no rule for, and an area off the map", () => {
    refuses([strip({ kind: "lava" })], /zones\.0\.kind/);
    refuses(
      [strip({ area: { kind: "rect", x: -10, y: 0, width: 50, height: 50 } })],
      /zone strip is outside the map/,
    );
  });

  it("holds at most MAX_ZONES", () => {
    const many = Array.from({ length: MAX_ZONES + 1 }, (_, at) => strip({ id: `z-${String(at)}` }));
    refuses(many, /zones: /);
  });

  it("holds the harmful zones' corners at MAX_HARMFUL_ZONE_POINTS, a rectangle's four counted", () => {
    const rects = (count: number) =>
      Array.from({ length: count }, (_, at) =>
        strip({
          id: `z-${String(at)}`,
          area: {
            kind: "rect",
            x: 10 + (at % 8) * 70,
            y: 10 + Math.floor(at / 8) * 70,
            width: 20,
            height: 20,
          },
        }),
      );
    accepts(rects(MAX_HARMFUL_ZONE_POINTS / 4));
    refuses(
      rects(MAX_HARMFUL_ZONE_POINTS / 4 + 1),
      new RegExp(
        `zones: harmful zones and teleport entries have ${String(MAX_HARMFUL_ZONE_POINTS + 4)} corners`,
      ),
    );
    // A teleport's entry is ground routes go round too (#3030).
    const portal = {
      id: "portal",
      from: {
        layer: 0,
        area: {
          kind: "polygon",
          points: [
            { x: 1300, y: 600 },
            { x: 1340, y: 600 },
            { x: 1340, y: 640 },
            { x: 1300, y: 640 },
          ],
        },
      },
      to: { layer: 0, position: { x: 1450, y: 620 } },
      enabled: true,
    };
    expect(() =>
      validateMapData({
        ...layerTest,
        zones: rects(MAX_HARMFUL_ZONE_POINTS / 4),
        teleports: [portal],
      }),
    ).toThrow(/teleport entries have/);
  });

  describe("timed and moving hazards (#3029)", () => {
    const schedule = { periodSeconds: 4, activeSeconds: 1, offsetSeconds: 0 };
    const path = {
      points: [
        { x: 230, y: 650 },
        { x: 530, y: 650 },
      ],
      speed: 120,
    };

    it("takes a strike kind with a schedule or a path", () => {
      accepts([strip({ kind: "vent", schedule }), strip({ id: "rocks", kind: "rockfall", path })]);
    });

    it("refuses a strike kind with neither, or both", () => {
      refuses([strip({ kind: "gas-spout" })], /zone strip strikes: it needs a schedule or a path/);
      refuses(
        [strip({ kind: "rockfall", schedule, path })],
        /zone strip strikes: it needs a schedule or a path, not both/,
      );
    });

    it("refuses a schedule or a path on standing ground", () => {
      refuses([strip({ schedule })], /zone strip stands: it has no schedule or path/);
      refuses([strip({ path })], /zone strip stands: it has no schedule or path/);
    });

    it("refuses a period with no room for the telegraph, and an offset outside it", () => {
      refuses(
        [strip({ kind: "vent", schedule: { ...schedule, periodSeconds: 1.5 } })],
        /zones\.0\.schedule\.periodSeconds: zone strip's period is shorter/,
      );
      refuses(
        [strip({ kind: "vent", schedule: { ...schedule, offsetSeconds: 4 } })],
        /zones\.0\.schedule\.offsetSeconds: zone strip's offset is not within its period/,
      );
    });

    it("refuses a path of one point, and one that rolls off the map", () => {
      refuses(
        [strip({ kind: "rockfall", path: { ...path, points: [path.points[0]] } })],
        /zones\.0\.path\.points/,
      );
      refuses(
        [
          strip({
            kind: "rockfall",
            path: { ...path, points: [path.points[0], { x: 1590, y: 650 }] },
          }),
        ],
        /zones\.0\.path: zone strip moves outside the map/,
      );
    });

    it("holds a path at MAX_ZONE_PATH_POINTS", () => {
      const toAndFro = (count: number) =>
        Array.from({ length: count }, (_, at) => path.points[at % 2] ?? path.points[0]);
      const rolling = (count: number) =>
        strip({ kind: "rockfall", path: { ...path, points: toAndFro(count) } });
      accepts([rolling(MAX_ZONE_PATH_POINTS)]);
      refuses([rolling(MAX_ZONE_PATH_POINTS + 1)], /zones\.0\.path\.points/);
    });
  });
});
