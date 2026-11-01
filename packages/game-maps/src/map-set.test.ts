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
    for (const objective of map.objectives) {
      const image = turned(map, objective.position);
      // A shared objective, the flag stand (#1225), the altar (#1374) or a
      // capture point (#1378), has another of its kind at its image, or is it.
      const mirrored = map.objectives.some(
        (other) =>
          other.kind === objective.kind &&
          ("team" in other && "team" in objective ? other.team !== objective.team : true) &&
          near(other.position, image),
      );
      expect(mirrored, JSON.stringify(objective)).toBe(true);
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
          baseEnergyPips: resolved.weaponSets[0].baseEnergyPips,
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
  it("is the four small arenas, the four of #444, the guild hall (#1222), the relic temples (#1374), the hill courtyard (#1377) and the forgotten shrines (#1378)", () => {
    expect(MAPS.map((map) => map.id).sort()).toEqual(
      [
        "arena-alpha",
        "arena-open",
        "arena-pillars",
        "arena-split",
        "guild-hall-isle",
        "relic-temples",
        "hill-courtyard",
        "hall-of-heroes",
        "forgotten-shrines",
        ...NEW_ARENAS,
      ].sort(),
    );
  });

  it("plays Kill Count on Pillar Hall, Priest Annihilation on Split Paths, Guild Battle on Guild Hall Isle, Relic Run on Relic Temples, King of the Hill on Hill Courtyard and Hall of Heroes (#1995), Capture Points on Forgotten Shrines and Annihilation everywhere else (#476, #1186, #1222, #1374, #1377, #1378)", () => {
    expect(MAPS.filter((map) => map.mode === "kill-count").map((map) => map.id)).toEqual([
      "arena-pillars",
    ]);
    expect(MAPS.filter((map) => map.mode === "priest-annihilation").map((map) => map.id)).toEqual([
      "arena-split",
    ]);
    expect(MAPS.filter((map) => map.mode === "guild-battle").map((map) => map.id)).toEqual([
      "guild-hall-isle",
    ]);
    expect(MAPS.filter((map) => map.mode === "relic-run").map((map) => map.id)).toEqual([
      "relic-temples",
    ]);
    expect(MAPS.filter((map) => map.mode === "king-of-the-hill").map((map) => map.id)).toEqual([
      "hall-of-heroes",
      "hill-courtyard",
    ]);
    expect(MAPS.filter((map) => map.mode === "capture-points").map((map) => map.id)).toEqual([
      "forgotten-shrines",
    ]);
    expect(MAPS.filter((map) => map.mode === "annihilation")).toHaveLength(MAPS.length - 7);
  });

  it("puts each team's shrine on Split Paths behind its spawns (#1186)", () => {
    const split = MAPS.find((map) => map.id === "arena-split");
    for (const shrine of split?.objectives ?? []) {
      const spawns =
        split?.spawnPoints.filter((spawn) => "team" in shrine && spawn.team === shrine.team) ?? [];
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

  it("leaves every spawn a clear walk out of its base (#1294)", () => {
    const { creatureRadius, playerRadius } = MINIMAL_GW_INSPIRED_PVP_V1.collision;
    for (const spawn of isle.spawnPoints) {
      const out: Segment = {
        a: spawn.position,
        b: { x: isle.width / 2, y: spawn.position.y },
      };
      for (const guard of isle.objectives) {
        if (guard.kind !== "guard" || guard.team !== spawn.team) continue;
        expect(
          distancePointToSegment(guard.position, out),
          JSON.stringify({ spawn, guard }),
        ).toBeGreaterThanOrEqual(playerRadius + creatureRadius);
      }
    }
  });

  it("keeps a 200-unit circle at its centre clear, for the flag stand", () => {
    const centre = { x: isle.width / 2, y: isle.height / 2 };
    for (const wall of walls) {
      expect(distancePointToSegment(centre, wall)).toBeGreaterThan(200);
    }
  });

  it("puts the flag stand at the centre, and lets each flag walk to it (#1225)", () => {
    const stand = isle.objectives.find((objective) => objective.kind === "flag-stand");
    expect(stand?.position).toEqual({ x: isle.width / 2, y: isle.height / 2 });
    const finder = createPathFinder(
      buildNavGraph(walls, { width: isle.width, height: isle.height }, RADIUS),
    );
    const spawns = isle.objectives.filter((objective) => objective.kind === "flag-spawn");
    expect(spawns.map((spawn) => spawn.team).sort()).toEqual([0, 1]);
    for (const spawn of spawns) {
      const shrine = isle.objectives.find(
        (objective) => objective.kind === "resurrection-shrine" && objective.team === spawn.team,
      );
      if (shrine === undefined || stand === undefined) throw new Error("no shrine or stand");
      expect(Vec.distance(spawn.position, shrine.position)).toBeLessThan(200);
      expect(finder.find(spawn.position, stand.position), JSON.stringify(spawn)).toBeDefined();
    }
  });
});

describe("Relic Temples (#1374)", () => {
  const temples = MAPS.find((map) => map.id === "relic-temples");
  if (temples === undefined) throw new Error("no relic-temples");
  const walls = allWallSegments(temples.walls);
  const bounds = { width: temples.width, height: temples.height };
  const altar = temples.objectives.find((objective) => objective.kind === "altar");
  const spawns = temples.objectives.filter((objective) => objective.kind === "relic-spawn");
  if (altar === undefined) throw new Error("no altar");

  /** The walked length of `path`, from `from`. */
  const walked = (from: Vec2, path: readonly Vec2[]): number =>
    path.reduce(
      (sum, point, index) =>
        sum + Vec.distance(index === 0 ? from : (path[index - 1] ?? from), point),
      0,
    );

  it("puts the altar at the centre, and a relic in each base", () => {
    expect(altar.position).toEqual({ x: temples.width / 2, y: temples.height / 2 });
    expect(spawns.map((spawn) => spawn.team).sort()).toEqual([0, 1]);
  });

  it("runs each relic to the altar the same length", () => {
    const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
    const lengths = spawns.map((spawn) => {
      const path = finder.find(spawn.position, altar.position);
      if (path === undefined) throw new Error(`no run for team ${String(spawn.team)}`);
      return walked(spawn.position, path);
    });
    expect(lengths[0]).toBeCloseTo(lengths[1] ?? 0, 3);
  });

  it("has two routes from each base: walled off the one, the run goes round the other way", () => {
    for (const spawn of spawns) {
      const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
      const path = finder.find(spawn.position, altar.position) ?? [];
      const north = path.some((point) => point.y < altar.position.y - 50);
      // A wall across the lane the run took, from the divider to the edge.
      const cut = north
        ? {
            kind: "rect" as const,
            x: spawn.position.x < altar.position.x ? 680 : 1440,
            y: 0,
            width: 80,
            height: 700,
          }
        : {
            kind: "rect" as const,
            x: spawn.position.x < altar.position.x ? 680 : 1440,
            y: 700,
            width: 80,
            height: 700,
          };
      const blocked = createPathFinder(
        buildNavGraph(allWallSegments([...temples.walls, cut]), bounds, RADIUS),
      );
      const detour = blocked.find(spawn.position, altar.position);
      expect(detour, JSON.stringify(spawn)).toBeDefined();
      expect(detour?.some((point) => point.y < altar.position.y - 50)).toBe(!north);
    }
  });
});

describe("Forgotten Shrines (#1378)", () => {
  const shrines = MAPS.find((map) => map.id === "forgotten-shrines");
  if (shrines === undefined) throw new Error("no forgotten-shrines");
  const walls = allWallSegments(shrines.walls);
  const bounds = { width: shrines.width, height: shrines.height };
  const points = shrines.objectives.map((objective) => objective.position);
  const centre = { x: shrines.width / 2, y: shrines.height / 2 };

  it("has five shrines: one by each base, and three between them, one at the centre", () => {
    expect(points).toHaveLength(5);
    for (const team of [0, 1]) {
      const spawns = shrines.spawnPoints.filter((spawn) => spawn.team === team);
      const nearest = Math.min(
        ...points.map((point) =>
          Math.min(...spawns.map((spawn) => Vec.distance(spawn.position, point))),
        ),
      );
      expect(nearest).toBeLessThan(300);
    }
    expect(points).toContainEqual(centre);
  });

  it("leaves the centre shrine exposed: no wall within 200", () => {
    expect(walls.every((wall) => distancePointToSegment(centre, wall) >= 200)).toBe(true);
  });

  it("lets every spawn walk to every shrine", () => {
    const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
    for (const spawn of shrines.spawnPoints) {
      for (const point of points) {
        expect(finder.find(spawn.position, point), JSON.stringify([spawn, point])).toBeDefined();
      }
    }
  });
});

describe("Hill Courtyard (#1377)", () => {
  const courtyard = MAPS.find((map) => map.id === "hill-courtyard");
  if (courtyard === undefined) throw new Error("no hill-courtyard");
  const walls = allWallSegments(courtyard.walls);
  const bounds = { width: courtyard.width, height: courtyard.height };
  const altar = courtyard.objectives.find((objective) => objective.kind === "altar");
  const spawns = courtyard.objectives.filter((objective) => objective.kind === "ghost-spawn");
  if (altar === undefined) throw new Error("no altar");

  /** The walked length of `path`, from `from`. */
  const walked = (from: Vec2, path: readonly Vec2[]): number =>
    path.reduce(
      (sum, point, index) =>
        sum + Vec.distance(index === 0 ? from : (path[index - 1] ?? from), point),
      0,
    );

  it("puts the altar at the centre, and a ghost in each base", () => {
    expect(altar.position).toEqual({ x: courtyard.width / 2, y: courtyard.height / 2 });
    expect(spawns.map((spawn) => spawn.team).sort()).toEqual([0, 1]);
  });

  it("leads each ghost to the altar the same length", () => {
    const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
    const lengths = spawns.map((spawn) => {
      const path = finder.find(spawn.position, altar.position);
      if (path === undefined) throw new Error(`no way for team ${String(spawn.team)}`);
      return walked(spawn.position, path);
    });
    expect(lengths[0]).toBeCloseTo(lengths[1] ?? 0, 3);
  });

  it("raises the altar between two walls, with an approach from the north and one from the south", () => {
    const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
    for (const [from, side] of [
      [{ x: altar.position.x, y: 120 }, -1],
      [{ x: altar.position.x, y: courtyard.height - 120 }, 1],
    ] as const) {
      const path = finder.find(from, altar.position);
      expect(path, JSON.stringify(from)).toBeDefined();
      // Straight in: nothing between the approach and the altar.
      expect(path?.every((point) => Math.sign(point.y - altar.position.y) !== -side)).toBe(true);
    }
    // From either base the way in goes round the plinth's west or east wall.
    for (const spawn of spawns) {
      const path = finder.find(spawn.position, altar.position) ?? [];
      expect(path.some((point) => Math.abs(point.y - altar.position.y) > 140)).toBe(true);
    }
  });
});

describe("Hall of Heroes (#1995)", () => {
  const hall = MAPS.find((map) => map.id === "hall-of-heroes");
  if (hall === undefined) throw new Error("no hall-of-heroes");
  const walls = allWallSegments(hall.walls);
  const bounds = { width: hall.width, height: hall.height };
  const altar = hall.objectives.find((objective) => objective.kind === "altar");
  const ghosts = hall.objectives.filter((objective) => objective.kind === "ghost-spawn");
  if (altar === undefined) throw new Error("no altar");

  it("seats 8 a team, and keeps every spawn 300 units from the altar", () => {
    for (const team of [0, 1]) {
      expect(hall.spawnPoints.filter((spawn) => spawn.team === team)).toHaveLength(8);
    }
    for (const spawn of hall.spawnPoints) {
      expect(Vec.distance(spawn.position, altar.position)).toBeGreaterThan(300);
    }
  });

  it("leads each ghost to the altar the same length, over open ground", () => {
    const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
    const lengths = ghosts.map((ghost) => {
      const path = finder.find(ghost.position, altar.position);
      if (path === undefined) throw new Error(`no way for team ${String(ghost.team)}`);
      return path.reduce(
        (sum, point, index) =>
          sum +
          Vec.distance(index === 0 ? ghost.position : (path[index - 1] ?? ghost.position), point),
        0,
      );
    });
    expect(ghosts.map((ghost) => ghost.team).sort()).toEqual([0, 1]);
    expect(lengths[0]).toBeCloseTo(lengths[1] ?? 0, 3);
  });
});
