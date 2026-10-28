import {
  HOUSE_LOADOUT,
  LONG_BOW_RANGE,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  buildNavGraph,
  createPathFinder,
  Vec,
  distancePointToSegment,
  nearestStandable,
  resolveLoadout,
  type Segment,
  type Vec2,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { allWallSegments } from "./geometry.js";
import { loadAllMaps } from "./loader.js";
import type { MapData } from "./schema.js";

/**
 * Every arena, old and new (#444): valid, fair by a half turn about its
 * centre, every spawn standing clear, and every spawn able to walk to
 * every other.
 */

const RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;
/** The arenas #444 added: the spawn-distance rule is theirs (the small four are small by design). */
const NEW_ARENAS = new Set(["arena-ring", "arena-crossroads", "arena-long-hall", "arena-canyon"]);
const MAPS = loadAllMaps();
const TOLERANCE = 1;

const turned = (map: MapData, point: Vec2): Vec2 => ({
  x: map.width - point.x,
  y: map.height - point.y,
});

const near = (a: Vec2, b: Vec2): boolean => Vec.distance(a, b) <= TOLERANCE;

const sameSegment = (a: Segment, b: Segment): boolean =>
  (near(a.a, b.a) && near(a.b, b.b)) || (near(a.a, b.b) && near(a.b, b.a));

describe.each(MAPS.map((map) => [map.id, map] as const))("%s (#444)", (_, map) => {
  const walls = allWallSegments(map.walls);
  const bounds = { width: map.width, height: map.height };

  it("is the same map turned half round its centre: walls and spawns, the teams swapped", () => {
    for (const wall of walls) {
      const image = { a: turned(map, wall.a), b: turned(map, wall.b) };
      expect(
        walls.some((other) => sameSegment(other, image)),
        JSON.stringify(wall),
      ).toBe(true);
    }
    for (const spawn of map.spawnPoints) {
      const image = turned(map, spawn.position);
      expect(
        map.spawnPoints.some((other) => other.team !== spawn.team && near(other.position, image)),
        JSON.stringify(spawn),
      ).toBe(true);
    }
  });

  it("has at least three spawns a team, each clear of every wall by a body", () => {
    for (const team of [0, 1]) {
      expect(map.spawnPoints.filter((spawn) => spawn.team === team).length).toBeGreaterThanOrEqual(
        3,
      );
    }
    const graph = buildNavGraph(walls, bounds, RADIUS);
    for (const { position } of map.spawnPoints) {
      for (const wall of walls) {
        expect(
          distancePointToSegment(position, wall),
          JSON.stringify(position),
        ).toBeGreaterThanOrEqual(RADIUS);
      }
      // On the map, and not inside a wall's outline either.
      expect(nearestStandable(graph, position)).toEqual(position);
    }
  });

  it("lets every spawn walk to every other", () => {
    const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
    for (const from of map.spawnPoints) {
      for (const to of map.spawnPoints) {
        if (from !== to) {
          expect(
            finder.find(from.position, to.position),
            `${JSON.stringify(from.position)} to ${JSON.stringify(to.position)}`,
          ).toBeDefined();
        }
      }
    }
  });

  it("lets a fighter at each spawn reach the enemy across the arena and hit, without snagging", () => {
    // Swords, so every hit is a walk into reach: on the longest arena, ~18 s.
    const ruleset = MINIMAL_GW_INSPIRED_PVP_V1;
    const resolved = resolveLoadout(
      {
        primaryProfession: HOUSE_LOADOUT.primaryProfession,
        allocatedRanks: HOUSE_LOADOUT.attributeRanks,
        equipment: HOUSE_LOADOUT.equipment,
      },
      ruleset.combat,
    );
    const team0 = map.spawnPoints.filter((spawn) => spawn.team === 0);
    for (const [k, spawn] of team0.entries()) {
      const across = turned(map, spawn.position);
      const sim = new MatchSimulation({
        seed: `reach-${String(k)}`,
        ruleset,
        walls,
        bounds,
        participants: [
          { id: "a", team: 0, at: spawn.position },
          { id: "b", team: 1, at: across },
        ].map(({ id, team, at }) => ({
          id,
          team,
          skillBar: [],
          attributeRanks: resolved.attributeRanks,
          equipment: resolved.weaponSets[0].equipment,
          baseEnergyPips: HOUSE_LOADOUT.baseEnergyPips,
          maxHealth: 1e7,
          spawn: at,
          facing: 0,
        })),
      });
      sim.requestAttack("a", "b");
      let hit = false;
      for (let tick = 0; tick < 30 * ruleset.tickRateHz && !hit; tick += 1) {
        hit = sim
          .step(1 / ruleset.tickRateHz)
          .log.some((entry) =>
            entry.events.some((event) => event.kind === "damage" && event.targetId === "b"),
          );
      }
      expect(hit, `from ${JSON.stringify(spawn.position)}`).toBe(true);
    }
  });

  it.runIf(NEW_ARENAS.has(map.id))(
    "keeps every spawn at least two longbow ranges from the nearest enemy spawn",
    () => {
      for (const spawn of map.spawnPoints) {
        const nearest = Math.min(
          ...map.spawnPoints
            .filter((other) => other.team !== spawn.team)
            .map((other) => Vec.distance(spawn.position, other.position)),
        );
        expect(nearest, JSON.stringify(spawn)).toBeGreaterThanOrEqual(2 * LONG_BOW_RANGE);
      }
    },
  );
});

describe("the arena set (#444)", () => {
  it("is the four small arenas and the four of #444", () => {
    expect(MAPS.map((map) => map.id).sort()).toEqual(
      ["arena-alpha", "arena-open", "arena-pillars", "arena-split", ...NEW_ARENAS].sort(),
    );
  });
});
