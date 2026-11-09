import {
  LONG_BOW_RANGE,
  RANGE_SPELL,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  buildNavGraph,
  createPathFinder,
  Vec,
  distancePointToSegment,
  hasLineOfSight,
  loadoutOf,
  nearestStandable,
  STARTER_BUILDS,
  resolveLoadout,
  type Segment,
  type Vec2,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { allWallSegments } from "./geometry.js";
import { layeredFinder } from "./layered-finder.test-support.js";
import { loadAllMaps } from "./loader.js";
import layerTest from "../test-maps/layer-test/map.json" with { type: "json" };
import { mapDataSchema, type MapData } from "./schema.js";

/**
 * Every arena, old and new (#444): valid, fair by a half turn about its
 * centre, every spawn standing clear, and every spawn able to walk to
 * every other.
 */

const RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;
/** The arenas #444 added: the spawn-distance rule is theirs (the two small mode arenas are small by design). */
const NEW_ARENAS = new Set(["arena-crossroads", "arena-long-hall", "arena-canyon"]);
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
    // Swords, so every hit is a walk into reach: ~26 s across a 4800-wide arena, so 30 s for
    // each 4800 of width; the large arenas (#2609) walk ~33 s.
    const sworded = STARTER_BUILDS.find((build) => build.name === "June Star Burst (W/E)");
    if (sworded === undefined) throw new Error("no June Star Burst (W/E)");
    const fighter = loadoutOf(sworded);
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
      const seconds = 30 * Math.max(1, map.width / 4800);
      for (let tick = 0; tick < seconds * ruleset.tickRateHz && !hit; tick += 1) {
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
  it("is the two mode arenas of #2550, three of #444 (#2547 took the rest), the guild hall (#1222), Broken Tower (#2551), The Courtyard (#2552), Scarred Earth (#2551), the medium arenas Sandstone Steps and Frozen Crossing (#2604), Ashen Courtyard and Moss Vale (#2605) and the large Canthan Terraces and Sunken Bastion (#2607), Shiverpeak Pass and Elonian Plateau (#2609)", () => {
    expect(MAPS.map((map) => map.id).sort()).toEqual(
      [
        "ember-pits",
        "jungle-ruins",
        "guild-hall-isle",
        "broken-tower",
        "cinder-sanctum",
        "the-courtyard",
        "hall-of-heroes",
        "barrow-field",
        "hollow-deep",
        "blackwater-ford",
        "mosslit-cairns",
        "brazen-causeway",
        "scarred-earth",
        "sandstone-steps",
        "frozen-crossing",
        "ashen-courtyard",
        "moss-vale",
        "canthan-terraces",
        "sunken-bastion",
        "shiverpeak-pass",
        "elonian-plateau",
        ...NEW_ARENAS,
      ].sort(),
    );
  });

  it("plays Kill Count on Ember Pits, Priest Annihilation on Jungle Ruins (#2550), Guild Battle on Guild Hall Isle, Relic Run on Broken Tower, King of the Hill on The Courtyard and Hall of Heroes (#2552), Capture Points on Scarred Earth and Annihilation everywhere else (#476, #1186, #1222, #1374, #1377, #1378, #2551, #2552)", () => {
    expect(MAPS.filter((map) => map.mode === "kill-count").map((map) => map.id)).toEqual([
      "ember-pits",
    ]);
    expect(MAPS.filter((map) => map.mode === "priest-annihilation").map((map) => map.id)).toEqual([
      "barrow-field",
      "blackwater-ford",
      "brazen-causeway",
      "jungle-ruins",
    ]);
    expect(MAPS.filter((map) => map.mode === "guild-battle").map((map) => map.id)).toEqual([
      "guild-hall-isle",
    ]);
    expect(MAPS.filter((map) => map.mode === "relic-run").map((map) => map.id)).toEqual([
      "broken-tower",
      "cinder-sanctum",
    ]);
    expect(MAPS.filter((map) => map.mode === "king-of-the-hill").map((map) => map.id)).toEqual([
      "hall-of-heroes",
      "the-courtyard",
    ]);
    expect(MAPS.filter((map) => map.mode === "capture-points").map((map) => map.id)).toEqual([
      "mosslit-cairns",
      "scarred-earth",
    ]);
    expect(MAPS.filter((map) => map.mode === "annihilation")).toHaveLength(MAPS.length - 11);
  });

  it("puts each team's shrine on Jungle Ruins 150-250 behind its spawns (#1186, #2550)", () => {
    const ruins = MAPS.find((map) => map.id === "jungle-ruins");
    const centre = (ruins?.width ?? 0) / 2;
    for (const shrine of ruins?.objectives ?? []) {
      const spawns =
        ruins?.spawnPoints.filter((spawn) => "team" in shrine && spawn.team === shrine.team) ?? [];
      const rearmost = Math.max(...spawns.map((spawn) => Math.abs(spawn.position.x - centre)));
      const behind = Math.abs(shrine.position.x - centre) - rearmost;
      expect(behind).toBeGreaterThanOrEqual(150);
      expect(behind).toBeLessThanOrEqual(250);
    }
    expect(ruins?.objectives).toHaveLength(2);
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

/** The walked length of `path`, from `from`. */
const walked = (from: Vec2, path: readonly Vec2[]): number =>
  path.reduce(
    (sum, point, index) =>
      sum + Vec.distance(index === 0 ? from : (path[index - 1] ?? from), point),
    0,
  );

/** How many of `map`'s walls come within spell range of `point`: the cover to fight round it (#2544). */
const wallsNear = (map: MapData, point: Vec2): number =>
  map.walls.filter((wall) =>
    allWallSegments([wall]).some((side) => distancePointToSegment(point, side) <= RANGE_SPELL),
  ).length;

describe("Broken Tower (#2551)", () => {
  const tower = MAPS.find((map) => map.id === "broken-tower");
  if (tower === undefined) throw new Error("no broken-tower");
  const walls = allWallSegments(tower.walls);
  const bounds = { width: tower.width, height: tower.height };
  const altar = tower.objectives.find((objective) => objective.kind === "altar");
  const relics = tower.objectives.filter((objective) => objective.kind === "relic-spawn");
  if (altar === undefined) throw new Error("no altar");

  it("puts the altar at the centre, and each relic 100-150 inside its own edge, behind its spawns", () => {
    expect(altar.position).toEqual({ x: tower.width / 2, y: tower.height / 2 });
    expect(relics.map((relic) => relic.team).sort()).toEqual([0, 1]);
    for (const relic of relics) {
      const edge = Math.min(relic.position.x, tower.width - relic.position.x);
      expect(edge).toBeGreaterThanOrEqual(100);
      expect(edge).toBeLessThanOrEqual(150);
      for (const spawn of tower.spawnPoints.filter((each) => each.team === relic.team)) {
        expect(Math.abs(spawn.position.x - altar.position.x)).toBeLessThan(
          Math.abs(relic.position.x - altar.position.x),
        );
      }
    }
  });

  it("walls the altar in a tower: no straight line out of it to the north, south, east or west but through a doorway", () => {
    const { x, y } = altar.position;
    for (const [dx, dy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      expect(hasLineOfSight(altar.position, { x: x + 400 * dx, y: y + 400 * dy }, walls)).toBe(
        false,
      );
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      expect(hasLineOfSight(altar.position, { x: x + 400 * dx, y: y + 400 * dy }, walls)).toBe(
        true,
      );
    }
  });

  it("runs each relic to the altar the same length, at least 1300", () => {
    const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
    const lengths = relics.map((relic) => {
      const path = finder.find(relic.position, altar.position);
      if (path === undefined) throw new Error(`no run for team ${String(relic.team)}`);
      return walked(relic.position, path);
    });
    expect(lengths[0]).toBeCloseTo(lengths[1] ?? 0, 3);
    expect(lengths[0]).toBeGreaterThanOrEqual(1300);
  });

  it("has two routes from each base: walled off the one, the run goes round the other way", () => {
    for (const relic of relics) {
      const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
      const path = finder.find(relic.position, altar.position) ?? [];
      const north = path.some((point) => point.y < altar.position.y - 50);
      // A wall across the half of the map the run took, from the centre line to the edge.
      const cut = {
        kind: "rect" as const,
        x: relic.position.x < altar.position.x ? 760 : tower.width - 840,
        y: north ? 0 : altar.position.y,
        width: 80,
        height: altar.position.y,
      };
      const blocked = createPathFinder(
        buildNavGraph(allWallSegments([...tower.walls, cut]), bounds, RADIUS),
      );
      const detour = blocked.find(relic.position, altar.position);
      expect(detour, JSON.stringify(relic)).toBeDefined();
      expect(detour?.some((point) => point.y < altar.position.y - 50)).toBe(!north);
    }
  });

  it("has three walls or more within spell range of the altar and of each relic", () => {
    for (const objective of tower.objectives) {
      expect(wallsNear(tower, objective.position), objective.kind).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("Scarred Earth (#2551)", () => {
  const earth = MAPS.find((map) => map.id === "scarred-earth");
  if (earth === undefined) throw new Error("no scarred-earth");
  const walls = allWallSegments(earth.walls);
  const bounds = { width: earth.width, height: earth.height };
  const points = earth.objectives
    .filter((objective) => objective.kind === "capture-point")
    .map((objective) => objective.position);
  const middle = earth.width / 2;

  it("has five shrines: one about 500 in from each base's edge, three on the middle column 600 apart", () => {
    expect(points).toHaveLength(5);
    const column = points.filter((point) => point.x === middle).map((point) => point.y);
    expect(column).toHaveLength(3);
    expect(column).toContain(earth.height / 2);
    const [north = 0, centre = 0, south = 0] = [...column].sort((a, b) => a - b);
    expect(centre - north).toBeGreaterThanOrEqual(600);
    expect(south - centre).toBeGreaterThanOrEqual(600);
    for (const base of points.filter((point) => point.x !== middle)) {
      expect(base.y).toBe(earth.height / 2);
      expect(Math.min(base.x, earth.width - base.x)).toBeGreaterThanOrEqual(450);
      expect(Math.min(base.x, earth.width - base.x)).toBeLessThanOrEqual(550);
    }
  });

  it("rings every shrine: walled to the north and south, open to the west and east", () => {
    for (const point of points) {
      const out = (dx: number, dy: number): boolean =>
        hasLineOfSight(point, { x: point.x + 300 * dx, y: point.y + 300 * dy }, walls);
      expect([out(0, -1), out(0, 1)], JSON.stringify(point)).toEqual([false, false]);
      expect([out(-1, 0), out(1, 0)], JSON.stringify(point)).toEqual([true, true]);
    }
  });

  it("has three walls or more within spell range of every shrine", () => {
    for (const point of points) {
      expect(wallsNear(earth, point), JSON.stringify(point)).toBeGreaterThanOrEqual(3);
    }
  });

  it("lets every spawn walk to every shrine", () => {
    const finder = createPathFinder(buildNavGraph(walls, bounds, RADIUS));
    for (const spawn of earth.spawnPoints) {
      for (const point of points) {
        expect(finder.find(spawn.position, point), JSON.stringify([spawn, point])).toBeDefined();
      }
    }
  });
});

/** A King of the Hill map's altar and ghosts, and its walls as segments. */
function hill(id: string) {
  const map = MAPS.find((each) => each.id === id);
  if (map === undefined) throw new Error(`no ${id}`);
  const altar = map.objectives.find((objective) => objective.kind === "altar");
  if (altar === undefined) throw new Error(`no altar on ${id}`);
  const ghosts = map.objectives.filter((objective) => objective.kind === "ghost-spawn");
  const walls = allWallSegments(map.walls);
  const finder = createPathFinder(
    buildNavGraph(walls, { width: map.width, height: map.height }, RADIUS),
  );
  return { map, altar: altar.position, ghosts, walls, finder };
}

/** Whether a straight line runs 400 out of `from`, along each of `directions`. */
const sightLines = (
  from: Vec2,
  directions: readonly (readonly [number, number])[],
  walls: readonly Segment[],
): boolean[] =>
  directions.map(([dx, dy]) =>
    hasLineOfSight(from, { x: from.x + 400 * dx, y: from.y + 400 * dy }, walls),
  );

const CARDINALS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const DIAGONALS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** The checks every King of the Hill map of #2552 passes. */
function holdsTheHill(id: string, seats: readonly number[]): void {
  const { map, altar, ghosts, finder } = hill(id);

  it("seats every team size it lists, and puts the altar at the centre", () => {
    expect(map.teamSizes).toEqual(seats);
    for (const team of [0, 1]) {
      expect(map.spawnPoints.filter((spawn) => spawn.team === team)).toHaveLength(8);
    }
    expect(altar).toEqual({ x: map.width / 2, y: map.height / 2 });
  });

  it("puts each team's ghost in its own base, behind its spawns", () => {
    expect(ghosts.map((ghost) => ghost.team).sort()).toEqual([0, 1]);
    for (const ghost of ghosts) {
      for (const spawn of map.spawnPoints.filter((each) => each.team === ghost.team)) {
        expect(Math.abs(spawn.position.x - altar.x)).toBeLessThan(
          Math.abs(ghost.position.x - altar.x),
        );
      }
    }
  });

  it("leads each ghost to the altar the same length", () => {
    const lengths = ghosts.map((ghost) => {
      const path = finder.find(ghost.position, altar);
      if (path === undefined) throw new Error(`no way for team ${String(ghost.team)}`);
      return walked(ghost.position, path);
    });
    expect(lengths[0]).toBeCloseTo(lengths[1] ?? 0, 3);
  });

  it("has two routes from each base: walled off the one, the ghost goes round the other way", () => {
    for (const ghost of ghosts) {
      const path = finder.find(ghost.position, altar) ?? [];
      const north = path.some((point) => point.y < altar.y - 50);
      // A wall across the half of the map the way took, from the centre line to the edge.
      const cut = {
        kind: "rect" as const,
        x: ghost.position.x < altar.x ? map.width / 4 - 40 : (map.width * 3) / 4 - 40,
        y: north ? 0 : altar.y,
        width: 80,
        height: altar.y,
      };
      const blocked = createPathFinder(
        buildNavGraph(
          allWallSegments([...map.walls, cut]),
          { width: map.width, height: map.height },
          RADIUS,
        ),
      );
      const detour = blocked.find(ghost.position, altar);
      expect(detour, JSON.stringify(ghost)).toBeDefined();
      expect(detour?.some((point) => point.y < altar.y - 50)).toBe(!north);
    }
  });

  it("has three walls or more within spell range of the altar and of each ghost", () => {
    for (const objective of map.objectives) {
      expect(wallsNear(map, objective.position), objective.kind).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the map within 12-24 walls", () => {
    expect(map.walls.length).toBeGreaterThanOrEqual(12);
    expect(map.walls.length).toBeLessThanOrEqual(24);
  });
}

describe("The Courtyard (#2552)", () => {
  holdsTheHill("the-courtyard", [4, 8]);
  const { altar, walls } = hill("the-courtyard");

  it("rings the altar with four pillar clusters, entered from the four diagonals", () => {
    expect(sightLines(altar, CARDINALS, walls)).toEqual([false, false, false, false]);
    expect(sightLines(altar, DIAGONALS, walls)).toEqual([true, true, true, true]);
  });
});

describe("Hall of Heroes (#2552)", () => {
  holdsTheHill("hall-of-heroes", [8]);
  const { altar, ghosts, walls, finder } = hill("hall-of-heroes");

  it("raises the altar on a dais walled west and east, open to the north and south", () => {
    expect(sightLines(altar, CARDINALS, walls)).toEqual([false, false, true, true]);
  });

  it("leads every base's way in round the dais, by the north or the south approach", () => {
    for (const ghost of ghosts) {
      const path = finder.find(ghost.position, altar) ?? [];
      expect(path.some((point) => Math.abs(point.y - altar.y) > 220)).toBe(true);
    }
  });
});

/** Half the narrowest gap a route may squeeze through (#2544): a 200-wide gap passes, a narrower one does not. */
const ROUTE_HALF_GAP = 100;

// The medium arenas (#2604, #2605) cross the centre in three lanes, the large (#2607, #2609) in four.
describe.each([
  ["sandstone-steps", 1, 3],
  ["frozen-crossing", 2, 3],
  ["ashen-courtyard", 4, 3],
  ["moss-vale", 8, 3],
  ["canthan-terraces", 1, 4],
  ["sunken-bastion", 2, 4],
  ["shiverpeak-pass", 4, 4],
  ["elonian-plateau", 8, 4],
] as const)("the new arena %s (#2604, #2605, #2607, #2609)", (id, size, lanes) => {
  const map = MAPS.find((each) => each.id === id);
  if (map === undefined) throw new Error(`no ${id}`);
  const bounds = { width: map.width, height: map.height };
  const centre = { x: map.width / 2, y: map.height / 2 };

  it("is an Annihilation arena for its one team size, a spawn for each, team 0 by the west edge", () => {
    expect(map.mode).toBe("annihilation");
    expect(map.objectives).toEqual([]);
    expect(map.teamSizes).toEqual([size]);
    for (const team of [0, 1]) {
      expect(map.spawnPoints.filter((spawn) => spawn.team === team).length).toBeGreaterThanOrEqual(
        size,
      );
    }
    for (const spawn of map.spawnPoints.filter((each) => each.team === 0)) {
      expect(spawn.position.x).toBeLessThanOrEqual(400);
    }
  });

  it(`has ${String(lanes)} routes between the bases, north to south, none through a gap under 200`, () => {
    const from = map.spawnPoints.find((spawn) => spawn.team === 0)?.position ?? centre;
    const to = turned(map, from);
    const band = map.height / lanes;
    const all = [...Array(lanes).keys()];
    for (const lane of all) {
      // Wall off the centre line but for one band: the way must cross it in this one.
      const cuts = all
        .filter((other) => other !== lane)
        .map((other) => ({
          kind: "rect" as const,
          x: centre.x - 5,
          y: other * band,
          width: 10,
          height: band,
        }));
      const finder = createPathFinder(
        buildNavGraph(allWallSegments([...map.walls, ...cuts]), bounds, ROUTE_HALF_GAP),
      );
      expect(finder.find(from, to), `lane ${String(lane)}`).toBeDefined();
    }
  });

  it("has three walls or more within spell range of the centre, cover for a fight there", () => {
    expect(wallsNear(map, centre)).toBeGreaterThanOrEqual(3);
  });

  it("keeps its nav graph to 600 nodes", () => {
    expect(layeredFinder(map, RADIUS).nodeCount).toBeLessThanOrEqual(600);
  });
});

describe("Cinder Sanctum (#2695)", () => {
  const sanctum = MAPS.find((each) => each.id === "cinder-sanctum");
  if (sanctum === undefined) throw new Error("no cinder-sanctum");

  it("carries the foe's relic to its own ghost, with no altar", () => {
    expect([sanctum.relicTarget, sanctum.relicCarry]).toEqual(["own-ghost", "foe"]);
    expect(sanctum.objectives.some((each) => each.kind === "altar")).toBe(false);
  });

  it("keeps its nav graph to 600 nodes", () => {
    const bounds = { width: sanctum.width, height: sanctum.height };
    const graph = buildNavGraph(allWallSegments(sanctum.walls), bounds, RADIUS);
    expect(graph.nodes.length).toBeLessThanOrEqual(600);
  });
});

describe("the ramps of every layered map (ADR-0051)", () => {
  const layered = [...loadAllMaps(), mapDataSchema.parse(layerTest)].filter(
    (map) => map.layers > 1,
  );

  it.each(layered.map((map) => [map.id, map] as const))(
    "%s links both layers at every ramp",
    (_, map) => {
      const withRamps = layeredFinder(map, RADIUS).nodeCount;
      const without = layeredFinder({ ...map, transitions: [] }, RADIUS).nodeCount;
      expect(withRamps - without).toBeGreaterThanOrEqual(2 * map.transitions.length);
    },
  );
});
