import {
  LONG_BOW_RANGE,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  buildNavGraph,
  createPathFinder,
  Vec,
  distancePointToSegment,
  loadoutOf,
  nearestStandable,
  pickStarterBuild,
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

  it("is the same map turned half round its centre: walls, spawns and shrines, the teams swapped", () => {
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
    for (const shrine of map.objectives) {
      const image = turned(map, shrine.position);
      expect(
        map.objectives.some((other) => other.team !== shrine.team && near(other.position, image)),
        JSON.stringify(shrine),
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
    // The first starter build is the Warrior/Monk's (#852).
    const fighter = loadoutOf(pickStarterBuild(() => 0));
    expect(fighter.equipment.weaponSets[0].mainHand.weaponId).toBe("sword");
    const ruleset = MINIMAL_GW_INSPIRED_PVP_V1;
    const resolved = resolveLoadout(
      {
        primaryProfession: fighter.primaryProfession,
        secondaryProfession: fighter.secondaryProfession,
        allocatedRanks: fighter.attributeRanks,
        equipment: fighter.equipment,
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
          baseEnergyPips: fighter.baseEnergyPips,
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
  it("is the four small arenas, the four of #444 and the guild hall (#1222)", () => {
    expect(MAPS.map((map) => map.id).sort()).toEqual(
      [
        "arena-alpha",
        "arena-open",
        "arena-pillars",
        "arena-split",
        "guild-hall-isle",
        ...NEW_ARENAS,
      ].sort(),
    );
  });

  it("plays Kill Count on Pillar Hall, Priest Annihilation on Split Paths, Guild Battle on Guild Hall Isle and Annihilation everywhere else (#476, #1186, #1222)", () => {
    expect(MAPS.filter((map) => map.mode === "kill-count").map((map) => map.id)).toEqual([
      "arena-pillars",
    ]);
    expect(MAPS.filter((map) => map.mode === "priest-annihilation").map((map) => map.id)).toEqual([
      "arena-split",
    ]);
    expect(MAPS.filter((map) => map.mode === "guild-battle").map((map) => map.id)).toEqual([
      "guild-hall-isle",
    ]);
    expect(MAPS.filter((map) => map.mode === "annihilation")).toHaveLength(MAPS.length - 3);
  });

  it("puts each team's shrine on Split Paths behind its spawns (#1186)", () => {
    const split = MAPS.find((map) => map.id === "arena-split");
    for (const shrine of split?.objectives ?? []) {
      const spawns = split?.spawnPoints.filter((spawn) => spawn.team === shrine.team) ?? [];
      const farthest = Math.max(...spawns.map((spawn) => Math.abs(spawn.position.x - 500)));
      expect(Math.abs(shrine.position.x - 500)).toBeGreaterThan(farthest);
    }
    expect(split?.objectives).toHaveLength(2);
  });
});

describe("Guild Hall Isle (#1222)", () => {
  const isle = MAPS.find((map) => map.id === "guild-hall-isle");
  if (isle === undefined) throw new Error("no guild-hall-isle");
  const walls = allWallSegments(isle.walls);

  it("seats eight a team, for an 8v8", () => {
    for (const team of [0, 1]) {
      expect(isle.spawnPoints.filter((spawn) => spawn.team === team)).toHaveLength(8);
    }
  });

  it("lets every spawn walk to the enemy Guild Lord", () => {
    const finder = createPathFinder(
      buildNavGraph(walls, { width: isle.width, height: isle.height }, RADIUS),
    );
    for (const spawn of isle.spawnPoints) {
      const lord = isle.objectives.find(
        (objective) => objective.kind === "guild-lord" && objective.team !== spawn.team,
      );
      if (lord === undefined) throw new Error(`no enemy lord for team ${String(spawn.team)}`);
      expect(finder.find(spawn.position, lord.position), JSON.stringify(spawn)).toBeDefined();
    }
  });

  it("guards each base as GW1 does, point-symmetric (#1223)", () => {
    const centre = { x: isle.width / 2, y: isle.height / 2 };
    const guards = isle.objectives.flatMap((objective) =>
      objective.kind === "guard" ? [objective] : [],
    );
    for (const team of [0, 1]) {
      const roles = guards.filter((each) => each.team === team).map((each) => each.role);
      expect(roles.sort()).toEqual([
        "archer",
        "archer",
        "archer",
        "bodyguard",
        "footman",
        "footman",
        "knight",
        "knight",
      ]);
      const lord = isle.objectives.find(
        (objective) => objective.kind === "guild-lord" && objective.team === team,
      );
      if (lord === undefined) throw new Error(`no lord for team ${String(team)}`);
      for (const near of guards.filter(
        (each) => each.team === team && (each.role === "bodyguard" || each.role === "knight"),
      )) {
        expect(
          Math.hypot(near.position.x - lord.position.x, near.position.y - lord.position.y),
        ).toBeLessThanOrEqual(150);
      }
    }
    for (const each of guards.filter((guard) => guard.team === 0)) {
      const mirror = {
        x: 2 * centre.x - each.position.x,
        y: 2 * centre.y - each.position.y,
      };
      expect(
        guards.some(
          (other) =>
            other.team === 1 &&
            other.role === each.role &&
            other.position.x === mirror.x &&
            other.position.y === mirror.y,
        ),
        JSON.stringify(each),
      ).toBe(true);
    }
  });

  it("keeps a 200-unit circle at its centre clear, for the flag stand", () => {
    const centre = { x: isle.width / 2, y: isle.height / 2 };
    for (const wall of walls) {
      expect(distancePointToSegment(centre, wall)).toBeGreaterThan(200);
    }
  });
});
