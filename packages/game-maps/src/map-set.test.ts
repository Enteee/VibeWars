import {
  LONG_BOW_RANGE,
  RANGE_SPELL,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  buildNavGraph,
  createPathFinder,
  Vec,
  distancePointToSegment,
  firstHit,
  GATE_PLATE_REACH_UNITS,
  hasLineOfSight,
  loadoutOf,
  nearestStandable,
  STARTER_BUILDS,
  resolveLoadout,
  type Segment,
  type Vec2,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  allWallSegments,
  pointInShape,
  shapesOverlap,
  shapeVertices,
  wallToSegments,
} from "./geometry.js";
import { layeredFinder } from "./layered-finder.test-support.js";
import { matchLayers } from "./layers.js";
import { mapNavGraphs } from "./nav-graphs.js";
import { loadAllMaps, loadMap } from "./loader.js";
import layerTest from "../test-maps/layer-test/map.json" with { type: "json" };
import outlineTest from "../test-maps/outline-test/map.json" with { type: "json" };
import structuresData from "../test-maps/structures/map.json" with { type: "json" };
import heightsData from "../training/training-heights/map.json" with { type: "json" };
import {
  MAX_OUTLINE_POINTS,
  OUTSIDE_KINDS,
  mapDataSchema,
  type Gate,
  type GateOpener,
  type MapData,
} from "./schema.js";

/**
 * Every arena, old and new (#444): valid, fair by a half turn about its
 * centre, every spawn standing clear, and every spawn able to walk to
 * every other.
 */

const RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;
/** The arenas #444 added: the spawn-distance rule is theirs (the two small mode arenas are small by design). */
const NEW_ARENAS = new Set(["arena-crossroads", "arena-long-hall", "arena-canyon"]);
/**
 * The 2.5D rebuilds (#3064): asymmetric by design. Their fairness is the balance bench and the
 * walk and high-ground checks (map-balance.test.ts), not a half turn.
 */
const REBUILT = new Set([
  "arena-canyon",
  "arena-crossroads",
  "ember-pits",
  "frozen-crossing",
  "sandstone-steps",
  "ashen-courtyard",
  "canthan-terraces",
  "moss-vale",
  "sunken-bastion",
  "elonian-plateau",
  "shiverpeak-pass",
  "blackwater-ford",
  "barrow-field",
  "jungle-ruins",
  "brazen-causeway",
  "cinder-sanctum",
  "broken-tower",
  "scarred-earth",
  "wardens-gallery",
]);
// A start line (#2692) is an area, where every test here wants a point.
const MAPS = loadAllMaps().map((map) => ({
  ...map,
  objectives: map.objectives.filter((objective) => objective.kind !== "start-line"),
}));
const TOLERANCE = 1;

const turned = (map: MapData, point: Vec2): Vec2 => ({
  x: map.width - point.x,
  y: map.height - point.y,
});

/** Whether an objective stands in a three-team map's third base (#2700). */
const ofThirdBase = (objective: MapData["objectives"][number]): boolean =>
  ("team" in objective && objective.team === 2) || ("base" in objective && objective.base === 2);

const near = (a: Vec2, b: Vec2): boolean => Vec.distance(a, b) <= TOLERANCE;

/** `gate`'s plate opener (#3025): every gate on the arena maps has one. */
function plated(gate: Gate): Extract<GateOpener, { kind: "plate" }> {
  if (gate.opener.kind !== "plate") {
    throw new Error(`gate ${gate.id} opens by switch`);
  }
  return gate.opener;
}

const sameSegment = (a: Segment, b: Segment): boolean =>
  (near(a.a, b.a) && near(a.b, b.b)) || (near(a.a, b.b) && near(a.b, b.a));

describe.each(MAPS.map((map) => [map.id, map] as const))("%s (#444)", (_, map) => {
  const walls = allWallSegments(map.walls);
  const bounds = { width: map.width, height: map.height };

  // The Elite Zaishen Battle (#2692) is a party's run at six NPCs, not a fair fight.
  it.skipIf(map.id === "elite-zaishen-battle" || REBUILT.has(map.id))(
    "is the same map turned half round its centre: walls, spawns and shrines, the teams swapped",
    () => {
      for (const wall of walls) {
        const image = { a: turned(map, wall.a), b: turned(map, wall.b) };
        expect(
          walls.some((other) => sameSegment(other, image)),
          JSON.stringify(wall),
        ).toBe(true);
      }
      // A third base (#2700) has no image: the turn swaps the first two teams.
      for (const spawn of map.spawnPoints.filter((each) => each.team !== 2)) {
        const image = turned(map, spawn.position);
        expect(
          map.spawnPoints.some((other) => other.team !== spawn.team && near(other.position, image)),
          JSON.stringify(spawn),
        ).toBe(true);
      }
      for (const objective of map.objectives.filter((each) => !ofThirdBase(each))) {
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
    },
  );

  it("has at least three spawns a team, each clear of every wall by a body", () => {
    for (const team of [0, 1]) {
      expect(map.spawnPoints.filter((spawn) => spawn.team === team).length).toBeGreaterThanOrEqual(
        3,
      );
    }
    // Each on its own layer (#3344): clear of that layer's walls, on that layer's floor.
    const layerWalls = matchLayers(map).walls;
    const graphs = mapNavGraphs(map, RADIUS);
    for (const { position, layer } of map.spawnPoints) {
      for (const wall of layerWalls[layer] ?? []) {
        expect(
          distancePointToSegment(position, wall),
          JSON.stringify(position),
        ).toBeGreaterThanOrEqual(RADIUS);
      }
      const graph = graphs[layer];
      if (graph === undefined) throw new Error(`no layer ${String(layer)}`);
      // On the map, and not inside a wall's outline either.
      expect(nearestStandable(graph, position)).toEqual(position);
    }
  });

  it("lets every spawn walk to every other", () => {
    const finder = layeredFinder(map, RADIUS);
    for (const from of map.spawnPoints) {
      for (const to of map.spawnPoints) {
        if (from !== to) {
          expect(
            finder.find(from.position, from.layer, to.position, to.layer),
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
      // The enemy spawn across from it: on a turned map, its image.
      const image = turned(map, spawn.position);
      const across = map.spawnPoints
        .filter((other) => other.team === 1)
        .reduce((best, other) =>
          Vec.distance(other.position, image) < Vec.distance(best.position, image) ? other : best,
        );
      const sim = new MatchSimulation({
        seed: `reach-${String(k)}`,
        ruleset,
        walls,
        layers: matchLayers(map),
        bounds,
        participants: [
          { id: "a", team: 0, at: spawn },
          { id: "b", team: 1, at: across },
        ].map(({ id, team, at }) => ({
          id,
          team,
          skillBar: [],
          attributeRanks: resolved.attributeRanks,
          equipment: resolved.weaponSets[0].equipment,
          baseEnergyPips: resolved.weaponSets[0].baseEnergyPips,
          maxHealth: 1e7,
          spawn: at.position,
          layer: at.layer,
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
        "threefold-keep",
        "hall-of-heroes-king",
        "hall-of-heroes-relic",
        "hall-of-heroes-capture",
        "barrow-field",
        "elite-zaishen-battle",
        "hollow-deep",
        "blackwater-ford",
        "mosslit-cairns",
        "wardens-gallery",
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
      "hall-of-heroes-relic",
    ]);
    expect(MAPS.filter((map) => map.mode === "king-of-the-hill").map((map) => map.id)).toEqual([
      "hall-of-heroes-king",
      "threefold-keep",
    ]);
    expect(MAPS.filter((map) => map.mode === "capture-points").map((map) => map.id)).toEqual([
      "hall-of-heroes-capture",
      "mosslit-cairns",
      "scarred-earth",
      "wardens-gallery",
    ]);
    expect(MAPS.filter((map) => map.mode === "annihilation")).toHaveLength(MAPS.length - 15);
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
      buildNavGraph(walls, { width: isle.width, height: isle.height }, RADIUS, []),
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
      buildNavGraph(walls, { width: isle.width, height: isle.height }, RADIUS, []),
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

describe("Scarred Earth (#3440)", () => {
  const earth = loadMap("scarred-earth");
  const middle = earth.width / 2;
  const points = earth.objectives.flatMap((objective) =>
    objective.kind === "capture-point" ? [objective] : [],
  );
  const mirrored = (point: Vec2): Vec2 => ({ x: earth.width - point.x, y: point.y });
  const craters = earth.pits.filter((pit) => pit.id.endsWith("-crater"));
  /** The map as loaded: every trench gate shut, every palisade standing. */
  const shut: MapData = {
    ...earth,
    walls: [
      ...earth.walls,
      ...earth.gates.map(({ wall }) => wall),
      ...(earth.breakables ?? []).map(({ wall }) => wall),
    ],
  };

  it("seats eight a team on the ground for 4v4 and 8v8, the east camp the west's mirror", () => {
    expect(earth.teamSizes).toEqual([4, 8]);
    for (const team of [0, 1]) {
      const own = earth.spawnPoints.filter((spawn) => spawn.team === team);
      expect(own).toHaveLength(8);
      for (const spawn of own) expect(spawn.layer).toBe(earth.groundLayer);
    }
    for (const spawn of earth.spawnPoints.filter((each) => each.team === 0)) {
      expect(
        earth.spawnPoints.some(
          (other) => other.team === 1 && near(other.position, mirrored(spawn.position)),
        ),
        JSON.stringify(spawn),
      ).toBe(true);
    }
  });

  it("has five points: the centre on the great deck on the axis, two mirrored pairs on the hulks", () => {
    expect(points).toHaveLength(5);
    const centre = points.filter((point) => point.position.x === middle);
    expect(centre).toEqual([{ kind: "capture-point", layer: 3, position: { x: middle, y: 1400 } }]);
    for (const point of points.filter((each) => each.position.x !== middle)) {
      expect(point.layer).toBe(2);
      expect(
        points.some((other) => other !== point && near(other.position, mirrored(point.position))),
        JSON.stringify(point),
      ).toBe(true);
    }
  });

  it("is the same map mirrored east to west: walls, decks, ramps, pits, tunnels and gates", () => {
    const image = (shape: Parameters<typeof wallToSegments>[0]) =>
      wallToSegments(shape).map(({ a, b }) => ({ a: mirrored(a), b: mirrored(b) }));
    const all = [
      ...earth.walls,
      ...earth.decks.map(({ footprint }) => footprint),
      ...earth.transitions.map(({ area }) => area),
      ...earth.pits.map(({ footprint }) => footprint),
      ...earth.tunnels.map(({ footprint }) => footprint),
      ...earth.gates.map(({ wall }) => wall),
      ...(earth.breakables ?? []).map(({ wall }) => wall),
    ];
    const sides = all.flatMap((shape) => wallToSegments(shape));
    for (const shape of all) {
      for (const side of image(shape)) {
        expect(
          sides.some((other) => sameSegment(other, side)),
          JSON.stringify(shape),
        ).toBe(true);
      }
    }
  });

  it("mirrors every lever, the twin opening the same trench's gates", () => {
    const levers = earth.switches ?? [];
    expect(levers).toHaveLength(4);
    for (const lever of levers) {
      const image = mirrored(lever.position);
      const twin = levers.find(
        ({ position }) => Math.abs(position.x - image.x) < 1 && Math.abs(position.y - image.y) < 1,
      );
      expect(twin?.layer, lever.id).toBe(lever.layer);
      expect(twin?.targets, lever.id).toEqual(lever.targets);
    }
  });

  it("puts a crater beside every point's hulk, ten craters in all, each with a slope out", () => {
    expect(craters).toHaveLength(10);
    for (const crater of craters) {
      expect(
        earth.transitions.filter(
          ({ to, area }) => to === earth.groundLayer && shapesOverlap(area, crater.footprint),
        ),
        crater.id,
      ).not.toHaveLength(0);
    }
    for (const point of points) {
      const hulk = earth.decks.find(
        (deck) => deck.layer === 2 && pointInShape(point.position, deck.footprint),
      );
      if (hulk === undefined) throw new Error(`no hulk under ${JSON.stringify(point)}`);
      const gap = Math.min(
        ...craters.flatMap((crater) =>
          shapeVertices(crater.footprint).flatMap((corner) =>
            wallToSegments(hulk.footprint).map((side) => distancePointToSegment(corner, side)),
          ),
        ),
      );
      expect(gap, hulk.id).toBeLessThanOrEqual(200);
    }
  });

  it("keeps every spawn 200 or more from every zone and crater", () => {
    const keepOff = [
      ...(earth.zones ?? []).map(({ area }) => area),
      ...craters.map(({ footprint }) => footprint),
    ];
    for (const { position } of earth.spawnPoints) {
      for (const area of keepOff) {
        expect(pointInShape(position, area)).toBe(false);
        for (const side of wallToSegments(area)) {
          expect(
            distancePointToSegment(position, side),
            JSON.stringify(position),
          ).toBeGreaterThanOrEqual(200);
        }
      }
    }
  });

  it("lets every spawn walk to every point with the trench gates shut and the palisades standing", () => {
    const finder = layeredFinder(shut, RADIUS);
    for (const spawn of earth.spawnPoints) {
      for (const point of points) {
        expect(
          finder.find(spawn.position, spawn.layer, point.position, point.layer),
          JSON.stringify([spawn, point]),
        ).toBeDefined();
      }
    }
  });

  it("gives each hulk point two stairs up, and the great deck one from each side", () => {
    for (const point of points.filter(({ layer }) => layer === 2)) {
      const hulk = earth.decks.find(
        (deck) => deck.layer === 2 && pointInShape(point.position, deck.footprint),
      );
      if (hulk === undefined) throw new Error("no hulk");
      expect(
        earth.transitions.filter(({ to, area }) => to === 2 && shapesOverlap(area, hulk.footprint)),
        hulk.id,
      ).toHaveLength(2);
    }
    expect(earth.transitions.filter(({ to }) => to === 3)).toHaveLength(2);
  });
});

/** A King of the Hill map's altar and ghosts, and its walls as segments. */
function hill(id: string) {
  const map = MAPS.find((each) => each.id === id);
  if (map === undefined) throw new Error(`no ${id}`);
  const altar = map.objectives.find((objective) => objective.kind === "altar");
  if (altar === undefined) throw new Error(`no altar on ${id}`);
  const ghosts = map.objectives.filter((objective) => objective.kind === "ghost-spawn");
  const walls = allWallSegments([...map.walls, ...map.gates.map((gate) => gate.wall)]);
  const finder = createPathFinder(
    buildNavGraph(walls, { width: map.width, height: map.height }, RADIUS, []),
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
  const { map, altar, ghosts: allGhosts, finder } = hill(id);
  // A third base (#2700) has its own test: these are the two facing bases.
  const ghosts = allGhosts.filter((ghost) => ghost.team !== 2);

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
          allWallSegments([...map.walls, ...map.gates.map((gate) => gate.wall), cut]),
          { width: map.width, height: map.height },
          RADIUS,
          [],
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

describe("Threefold Keep (#2699)", () => {
  holdsTheHill("threefold-keep", [4, 8]);
  const { map, altar, walls } = hill("threefold-keep");

  it("seats three teams, each with a ghost, and plays the Keep's rules", () => {
    expect(map).toMatchObject({ teams: 3, keep: true });
    expect(map.spawnPoints.filter((spawn) => spawn.team === 2)).toHaveLength(8);
  });

  it("opens every door only from inside: its plate is out of reach from the far side", () => {
    expect(map.gates).toHaveLength(4);
    for (const gate of map.gates) {
      const opener = plated(gate);
      expect(opener.oneWay, gate.id).toBe(true);
      expect(opener.team, gate.id).toBeNull();
      expect(firstHit(opener.plate, altar, wallToSegments(gate.wall)), gate.id).toBeUndefined();
      const nearest = Math.min(
        ...wallToSegments(gate.wall).map((side) => distancePointToSegment(opener.plate, side)),
      );
      expect(nearest, gate.id).toBeGreaterThan(GATE_PLATE_REACH_UNITS);
    }
  });

  it("leaves the keep's four corners open: with every door shut the altar is reachable", () => {
    expect(sightLines(altar, DIAGONALS, walls)).toEqual([true, true, true, true]);
  });
});

describe("the Hall's three maps (#2700)", () => {
  const halls = ["king", "relic", "capture"].map((mode) => loadMap(`hall-of-heroes-${mode}`));

  it("are one place: the same name, size, walls and spawns, for three teams", () => {
    for (const map of halls) {
      expect(map).toMatchObject({
        name: "Hall of Heroes",
        teams: 3,
        halls: true,
        width: halls[0]?.width,
        height: halls[0]?.height,
        walls: halls[0]?.walls,
        spawnPoints: halls[0]?.spawnPoints,
      });
    }
  });

  it("has 4 capture points of which one is the third base's", () => {
    const points = halls[2]?.objectives.filter((each) => each.kind === "capture-point") ?? [];
    expect(points).toHaveLength(4);
    expect(points.filter((each) => each.base === 2)).toHaveLength(1);
  });
});

describe("Hall of Heroes (#2552)", () => {
  holdsTheHill("hall-of-heroes-king", [8]);
  const { map, altar, ghosts, walls, finder } = hill("hall-of-heroes-king");

  it("raises the altar on a dais walled west and east, open to the north and south", () => {
    expect(sightLines(altar, CARDINALS, walls)).toEqual([false, false, true, true]);
  });

  it("leads every base's way in round the dais, by the north or the south approach", () => {
    for (const ghost of ghosts.filter((each) => each.team !== 2)) {
      const path = finder.find(ghost.position, altar) ?? [];
      expect(path.some((point) => Math.abs(point.y - altar.y) > 220)).toBe(true);
    }
  });

  it("puts the third base (#2700) north of the altar, behind its spawns, with a way to it", () => {
    const third = ghosts.find((ghost) => ghost.team === 2);
    if (third === undefined) throw new Error("no third ghost");
    expect(third.position.y).toBeLessThan(altar.y);
    expect(finder.find(third.position, altar)).toBeDefined();
    for (const spawn of map.spawnPoints.filter((each) => each.team === 2)) {
      expect(third.position.y).toBeLessThan(spawn.position.y);
    }
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
    const graph = buildNavGraph(allWallSegments(sanctum.walls), bounds, RADIUS, []);
    expect(graph.nodes.length).toBeLessThanOrEqual(600);
  });
});

describe("the ramps of every layered map (ADR-0051)", () => {
  const layered = [
    ...loadAllMaps(),
    mapDataSchema.parse(layerTest),
    mapDataSchema.parse(structuresData),
  ].filter((map) => map.layers > 1);

  it.each(layered.map((map) => [map.id, map] as const))(
    "%s links both layers at every ramp",
    (_, map) => {
      const withRamps = layeredFinder(map, RADIUS).nodeCount;
      const without = layeredFinder({ ...map, transitions: [] }, RADIUS).nodeCount;
      expect(withRamps - without).toBeGreaterThanOrEqual(2 * map.transitions.length);
    },
  );
});

describe("The Warden's Gallery (#3441)", () => {
  const gallery = loadMap("wardens-gallery");
  const middle = gallery.width / 2;
  const points = gallery.objectives.flatMap((objective) =>
    objective.kind === "capture-point" ? [objective] : [],
  );
  const mirrored = (point: Vec2): Vec2 => ({ x: gallery.width - point.x, y: point.y });
  /** The map as loaded: every undercroft gate shut, every statue standing. */
  const shut: MapData = {
    ...gallery,
    walls: [
      ...gallery.walls,
      ...gallery.gates.map(({ wall }) => wall),
      ...(gallery.breakables ?? []).map(({ wall }) => wall),
    ],
  };

  it("seats eight a team on the floor for 8v8, the east vestibule the west's mirror", () => {
    expect(gallery.teamSizes).toEqual([8]);
    for (const team of [0, 1]) {
      const own = gallery.spawnPoints.filter((spawn) => spawn.team === team);
      expect(own).toHaveLength(8);
      for (const spawn of own) expect(spawn.layer).toBe(gallery.groundLayer);
    }
    for (const spawn of gallery.spawnPoints.filter((each) => each.team === 0)) {
      expect(
        gallery.spawnPoints.some(
          (other) => other.team === 1 && near(other.position, mirrored(spawn.position)),
        ),
        JSON.stringify(spawn),
      ).toBe(true);
    }
  });

  it("has seven points: the centre on the great plinth's top, a mirrored trio a team", () => {
    expect(points).toHaveLength(7);
    expect(points.filter((point) => point.position.x === middle)).toEqual([
      { kind: "capture-point", layer: 3, position: { x: middle, y: 1250 } },
    ]);
    const west = points.filter((point) => point.position.x < middle);
    expect(west.map(({ layer }) => layer)).toEqual([1, 2, 1]);
    for (const point of points.filter((each) => each.position.x !== middle)) {
      expect(
        points.some(
          (other) => other.layer === point.layer && near(other.position, mirrored(point.position)),
        ),
        JSON.stringify(point),
      ).toBe(true);
    }
  });

  it("is the same map mirrored east to west: walls, decks, stairs, pits, undercrofts and gates", () => {
    const image = (shape: Parameters<typeof wallToSegments>[0]) =>
      wallToSegments(shape).map(({ a, b }) => ({ a: mirrored(a), b: mirrored(b) }));
    const all = [
      ...gallery.walls,
      ...gallery.decks.map(({ footprint }) => footprint),
      ...gallery.transitions.map(({ area }) => area),
      ...gallery.pits.map(({ footprint }) => footprint),
      ...gallery.tunnels.map(({ footprint }) => footprint),
      ...gallery.gates.map(({ wall }) => wall),
      ...(gallery.breakables ?? []).map(({ wall }) => wall),
      ...(gallery.water ?? []).map(({ area }) => area),
    ];
    const sides = all.flatMap((shape) => wallToSegments(shape));
    for (const shape of all) {
      for (const side of image(shape)) {
        expect(
          sides.some((other) => sameSegment(other, side)),
          JSON.stringify(shape),
        ).toBe(true);
      }
    }
  });

  it("puts four levers on the great plinth's base, each twin opening the same undercroft's gates", () => {
    const levers = gallery.switches ?? [];
    const base = gallery.decks.find(({ id }) => id === "great-plinth-base");
    if (base === undefined) throw new Error("no great-plinth-base");
    expect(levers).toHaveLength(4);
    for (const lever of levers) {
      expect(lever.layer, lever.id).toBe(base.layer);
      expect(pointInShape(lever.position, base.footprint), lever.id).toBe(true);
      const image = mirrored(lever.position);
      const twin = levers.find(
        ({ position }) => Math.abs(position.x - image.x) < 1 && Math.abs(position.y - image.y) < 1,
      );
      expect(twin?.targets, lever.id).toEqual(lever.targets);
    }
  });

  it("keeps every spawn 200 or more from every zone and pool", () => {
    const keepOff = [
      ...(gallery.zones ?? []).map(({ area }) => area),
      ...(gallery.water ?? []).map(({ area }) => area),
    ];
    for (const { position } of gallery.spawnPoints) {
      for (const area of keepOff) {
        expect(pointInShape(position, area)).toBe(false);
        for (const side of wallToSegments(area)) {
          expect(
            distancePointToSegment(position, side),
            JSON.stringify(position),
          ).toBeGreaterThanOrEqual(200);
        }
      }
    }
  });

  it("lets every spawn walk to every point with the undercroft gates shut and the statues standing", () => {
    const finder = layeredFinder(shut, RADIUS);
    for (const spawn of gallery.spawnPoints) {
      for (const point of points) {
        expect(
          finder.find(spawn.position, spawn.layer, point.position, point.layer),
          JSON.stringify([spawn, point]),
        ).toBeDefined();
      }
    }
  });

  it("climbs each plinth by a stair on every face, the great plinth's top by two, each balcony by one at each end", () => {
    const stairsOnto = (id: string): number => {
      const deck = gallery.decks.find((each) => each.id === id);
      if (deck === undefined) throw new Error(`no ${id}`);
      return gallery.transitions.filter(
        ({ to, area }) => to === deck.layer && shapesOverlap(area, deck.footprint),
      ).length;
    };
    for (const id of ["west-plinth", "east-plinth", "great-plinth-base"]) {
      expect(stairsOnto(id), id).toBe(4);
    }
    expect(stairsOnto("great-plinth-top")).toBe(2);
    for (const id of gallery.decks.map((deck) => deck.id).filter((id) => id.endsWith("-balcony"))) {
      expect(stairsOnto(id), id).toBe(2);
    }
  });
});

describe("the structures test map's looks by route (#3067, #3078)", () => {
  const structures = mapDataSchema.parse(structuresData);
  const finder = layeredFinder(structures, RADIUS);
  const spawn = { x: 100, y: 500 };

  it.each([
    ["the platform", { x: 300, y: 380 }, 2],
    ["the tower, up its ladder", { x: 435, y: 160 }, 3],
    ["the wall-walk", { x: 1000, y: 144 }, 2],
    ["the terrace", { x: 500, y: 780 }, 2],
    ["the log over the gorge", { x: 1000, y: 670 }, 2],
    ["the gorge's floor, under the log", { x: 1000, y: 560 }, 0],
    ["the stone bridge", { x: 1550, y: 480 }, 2],
    ["the plank bridge", { x: 1550, y: 785 }, 2],
    ["under the stone bridge", { x: 1550, y: 480 }, 1],
    ["the ledge", { x: 200, y: 1135 }, 2],
    ["the ruin, round its gap", { x: 980, y: 1280 }, 2],
    ["the ruin's gap, on the ground", { x: 910, y: 1280 }, 1],
    ["the arch's top", { x: 1330, y: 1215 }, 2],
    ["under the arch", { x: 1330, y: 1215 }, 1],
    ["the gatehouse roof", { x: 1800, y: 1100 }, 2],
    ["the passage under the gatehouse", { x: 1800, y: 1100 }, 1],
    ["the rooftop", { x: 300, y: 1500 }, 2],
    ["the end of the pier", { x: 1280, y: 1580 }, 2],
    ["the plinth", { x: 1710, y: 1640 }, 2],
  ] as const)("reaches %s from the ground", (_, to, layer) => {
    const route = finder.find(spawn, structures.groundLayer, to, layer);
    expect(route).toBeDefined();
    expect(route?.at(-1)).toMatchObject({ ...to, layer });
  });
});

describe("Training Heights' layers by route (#2973)", () => {
  const heights = mapDataSchema.parse(heightsData);
  const finder = layeredFinder(heights, RADIUS);
  const spawn = { x: 120, y: 450 };

  it.each([
    ["the west pit's floor", { x: 640, y: 590 }, 0],
    ["the tunnel", { x: 840, y: 585 }, 0],
    ["the east pit's floor", { x: 1060, y: 520 + 110 }, 0],
    ["the bridge", { x: 600, y: 450 }, 2],
    ["the platform", { x: 600, y: 210 }, 3],
  ] as const)("reaches %s from the ground", (_, to, layer) => {
    const route = finder.find(spawn, heights.groundLayer, to, layer);
    expect(route).toBeDefined();
    expect(route?.at(-1)).toMatchObject({ ...to, layer });
  });
});

describe("a ground outline's nav nodes (#3066)", () => {
  it("keeps the L-shaped test map's ground graph small", () => {
    const nodes = layeredFinder(mapDataSchema.parse(outlineTest), RADIUS).nodeCount;
    expect(nodes).toBeLessThanOrEqual(600);
  });

  it("keeps a full outline on the largest map, round its walls, within the budget", () => {
    const largest = MAPS.reduce((most, map) =>
      map.width * map.height > most.width * most.height ? map : most,
    );
    // A jagged ring of the most points, in and out, hugging the map's edge.
    const outline = Array.from({ length: MAX_OUTLINE_POINTS }, (_, k) => {
      const angle = (k / MAX_OUTLINE_POINTS) * 2 * Math.PI;
      const reach = k % 2 === 0 ? 0.5 : 0.47;
      return {
        x: largest.width / 2 + Math.cos(angle) * largest.width * reach,
        y: largest.height / 2 + Math.sin(angle) * largest.height * reach,
      };
    });
    const outlined: MapData = {
      ...largest,
      bounds: { kind: "outline", outline, outside: "rock" },
    };
    const nodes = layeredFinder(outlined, RADIUS).nodeCount;
    expect(nodes).toBeLessThanOrEqual(600);
  });
});

describe("matchLayers: the land outside an outline", () => {
  const outlined = mapDataSchema.parse(outlineTest);

  it.each(OUTSIDE_KINDS)("%s is seen across only if it is a drop or water", (outside) => {
    if (outlined.bounds.kind !== "outline") {
      throw new Error("outline-test has no outline");
    }
    const layers = matchLayers({ ...outlined, bounds: { ...outlined.bounds, outside } });
    expect(layers.outline?.blocksSight).toBe(outside !== "cliff" && outside !== "deep-water");
  });
});
