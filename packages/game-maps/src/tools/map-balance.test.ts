import { describe, expect, it } from "vitest";

import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  STARTER_BUILDS,
  createLayeredPathFinder,
  switchTargetId,
  vec2,
  type Vec2,
} from "@vibewars/game-core";

import { matchLayers } from "../layers.js";
import { loadAllMaps, loadMap } from "../loader.js";
import { mapNavGraphs } from "../nav-graphs.js";
import { mapMatchRules, mapSimulationFields } from "../match-fields.js";
import type { MapData } from "../schema.js";
import {
  balanceVerdict,
  benchSeeds,
  failingRows,
  highGround,
  narrowestWalks,
  playBuildBot,
  runMapBalance,
  seedStride,
  walkSecondsByRoute,
  walksByRoute,
  walksTo,
  walksToCentre,
  type MapBalanceResult,
  type Route,
} from "./map-balance.js";

/**
 * The map balance bench (#3065). The verdict always; with `BENCH_BALANCE`
 * set (`pnpm run bench:balance`), a smoke run, then the bench on
 * `BENCH_MAP` (an id, or `all`, the default) at `BENCH_SIZE` (every size
 * the map seats if unset), `BENCH_SEEDS` seeds each (100 by default), and
 * a table printed to paste into the map's PR.
 */

const BENCH = process.env.BENCH_BALANCE !== undefined;

/** Seeds of Scarred Earth 8v8 played from each side (#3596): 4 × SIDE_SEEDS matches. */
const SIDE_SEEDS = 10;

const percent = (share: number): string => (share * 100).toFixed(1);

function result(wins: readonly number[], draws = 0): MapBalanceResult {
  return { wins, draws, meanSeconds: 60, stuckShare: 0, apartShare: 0, stuckCells: [] };
}

describe("the failing rows (#3711)", () => {
  it("names each failing row and its reason, in order", () => {
    expect(
      failingRows([
        { map: "a", size: 2, verdict: { pass: true } },
        {
          map: "b",
          size: 4,
          verdict: { pass: false, reason: "team 0 favoured (61 % of decided)" },
        },
        { map: "c", size: 8, verdict: { pass: false, reason: "no contact" } },
      ]),
    ).toEqual(["b 4v4: team 0 favoured (61 % of decided)", "c 8v8: no contact"]);
  });

  it("is empty when every row passes", () => {
    expect(failingRows([{ map: "a", size: 2, verdict: { pass: true } }])).toEqual([]);
  });
});

describe("the balance verdict (#3065)", () => {
  it("passes an even split", () => {
    expect(balanceVerdict(result([50, 50]))).toEqual({ pass: true });
  });

  it("fails 61/39, naming team 0", () => {
    expect(balanceVerdict(result([61, 39]))).toEqual({
      pass: false,
      reason: "team 0 favoured (61 % of decided)",
    });
  });

  it("holds three teams to 23-43 %", () => {
    expect(balanceVerdict(result([43, 33, 24])).pass).toBe(true);
    expect(balanceVerdict(result([44, 34, 22]))).toMatchObject({ pass: false });
    expect(balanceVerdict(result([30, 50, 20]))).toEqual({
      pass: false,
      reason: "team 1 favoured (50 % of decided)",
    });
  });

  it("fails on more than a quarter draws", () => {
    expect(balanceVerdict(result([38, 37], 25)).pass).toBe(true);
    expect(balanceVerdict(result([37, 37], 26))).toEqual({ pass: false, reason: "26 % draws" });
  });

  it("fails all draws as no contact", () => {
    expect(balanceVerdict(result([0, 0], 100))).toEqual({ pass: false, reason: "no contact" });
  });
});

describe("walks and high ground (#3070)", () => {
  // The 2.5D rebuilds (#3064): asymmetric, so proven by numbers.
  describe.each([
    ["Canyon", "arena-canyon"],
    ["Crossroads", "arena-crossroads"],
    ["Ember Pits", "ember-pits"],
    ["Sandstone Steps", "sandstone-steps"],
    ["Frozen Crossing", "frozen-crossing"],
    ["Canthan Terraces", "canthan-terraces"],
  ])("%s", (_name, id) => {
    const map = loadMap(id);

    it("walks each team from its spawn to the centre within 10 % of the other", () => {
      const [walk0 = 0, walk1 = 0] = walksToCentre(map);
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(0.1);
    });

    it("gives the teams high ground within 25 % of each other", () => {
      const [ground0 = 0, ground1 = 0] = highGround(map);
      expect(ground0).toBeGreaterThan(0);
      expect(Math.abs(ground0 - ground1) / Math.max(ground0, ground1)).toBeLessThanOrEqual(0.25);
    }, 60_000);
  });

  // Ashen Courtyard (#3287, large since #3413): the centre is in the sunken well court, so the walks
  // end on its floor. The spawns and timber walls mirror each other about the well, so the walks are
  // within 5 %, by the best way and by each ramp. The west keeps the bigger tower by design: its
  // high ground may exceed the east's by 40 %.
  describe("Ashen Courtyard", () => {
    const map = loadMap("ashen-courtyard");
    const well = { x: 2320, y: 2000 };
    const ramps = ["pit-ramp-w", "pit-ramp-e"];

    it("walks each team from its spawn into the well court within 5 % of the other", () => {
      const [walk0 = 0, walk1 = 0] = walksTo(map, well, 0);
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(0.05);
    });

    const routes: [string, (team: number) => Route][] = [
      ["its own ramp", (team) => ({ through: [ramps[team] ?? ""], shut: [ramps[1 - team] ?? ""] })],
      ["the far ramp", (team) => ({ through: [ramps[1 - team] ?? ""], shut: [ramps[team] ?? ""] })],
    ];

    it.each(routes)(
      "walks each team from its spawn into the well court by %s within 5 % of the other",
      (_route, route) => {
        const [walk0 = 0, walk1 = 0] = walksByRoute(map, well, 0, route);
        expect(walk0).toBeGreaterThan(0);
        expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(0.05);
      },
    );

    it("stands a timber wall of the same length the same way in front of each team's spawns", () => {
      const placed = map.spawnPoints.map(({ team, position }) => ({ team, ...position }));
      const ahead = (team: number): number[] => {
        const own = placed.filter((spawn) => spawn.team === team);
        const centre = own.reduce((sum, { x }) => sum + x, 0) / own.length;
        return (map.breakables ?? [])
          .map(({ wall }) => wall)
          .filter((wall) => wall.kind === "rect" && Math.abs(wall.x - centre) < 600)
          .flatMap((wall) =>
            wall.kind === "rect" ? [Math.abs(wall.x + wall.width / 2 - centre), wall.height] : [],
          );
      };
      expect(ahead(0)).toHaveLength(2);
      expect(ahead(1)).toEqual(ahead(0));
    });

    it("gives the west no more than 40 % more high ground than the east", () => {
      const [west = 0, east = 0] = highGround(map);
      expect(east).toBeGreaterThan(0);
      expect(west / east).toBeLessThanOrEqual(1.4);
    }, 60_000);
  });

  // Moss Vale (#3288): the centre is the drawbridge over the mill race, a deck, so the walks end on
  // it. The study (#3276) holds the walks within 5 % and high ground within 10 %.
  describe("Moss Vale", () => {
    const map = loadMap("moss-vale");

    it("walks each team from its spawn onto the drawbridge within 5 % of the other", () => {
      const [walk0 = 0, walk1 = 0] = walksTo(map, { x: 2500, y: 1300 }, 2);
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(0.05);
    });

    it("gives the teams high ground within 10 % of each other", () => {
      const [ground0 = 0, ground1 = 0] = highGround(map);
      expect(ground0).toBeGreaterThan(0);
      expect(Math.abs(ground0 - ground1) / Math.max(ground0, ground1)).toBeLessThanOrEqual(0.1);
    }, 60_000);
  });

  // Sunken Bastion (#3400): the centre is the drawbridge over the moat, a deck on layer 2, so the
  // walks end on it. Three routes cross the moat: the drawbridge, the flooded cellar under it and the
  // north walk over it. A route is walked with the other two shut, the sluice wall standing; the
  // cellar and the north walk with the team's own bridge ramp shut too, so they climb the far one.
  describe("Sunken Bastion", () => {
    const loaded = loadMap("sunken-bastion");
    const map = {
      ...loaded,
      walls: [...loaded.walls, ...(loaded.breakables ?? []).map(({ wall }) => wall)],
    };
    const bridge = { x: 1350, y: 905 };
    const cellar = ["cellar-west-steps", "cellar-east-steps"];
    const northWalk = ["north-walk-stair-west", "north-walk-stair-east"];
    const ramps = ["bridge-ramp-west", "bridge-ramp-east"];
    const own = (team: number): string => ramps[team] ?? "";
    const far = (team: number): string => ramps[1 - team] ?? "";
    const routes: readonly (readonly [string, (team: number) => Route])[] = [
      ["the drawbridge", (team) => ({ through: [own(team)], shut: [...cellar, ...northWalk] })],
      [
        "the flooded cellar",
        (team) => ({ through: [...cellar, far(team)], shut: [...northWalk, own(team)] }),
      ],
      [
        "the north walk",
        (team) => ({ through: [...northWalk, far(team)], shut: [...cellar, own(team)] }),
      ],
    ];

    it.each(routes)(
      "walks each team from its spawn onto the drawbridge by %s within 10 % of the other",
      (_route, route) => {
        const [walk0 = 0, walk1 = 0] = walksByRoute(loaded, bridge, 2, route);
        expect(walk0).toBeGreaterThan(0);
        expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(0.1);
      },
    );

    it("gives the teams high ground within 25 % of each other", () => {
      const [ground0 = 0, ground1 = 0] = highGround(map);
      expect(ground0).toBeGreaterThan(0);
      expect(Math.abs(ground0 - ground1) / Math.max(ground0, ground1)).toBeLessThanOrEqual(0.25);
    }, 60_000);
  });

  // Shiverpeak Pass (#3401): the centre is the rope bridge over the chasm, so the walks end on it.
  // Three routes: the team's own stairs up to the bridgehead, the cave under the chasm, and the
  // south pass through the ice wall. A route is walked with the other two shut.
  describe("Shiverpeak Pass", () => {
    const loaded = loadMap("shiverpeak-pass");
    const map = {
      ...loaded,
      walls: [...loaded.walls, ...(loaded.breakables ?? []).map(({ wall }) => wall)],
    };
    const bridge = { x: 2635, y: 1260 };
    const cave = ["cave-mouth-west", "cave-mouth-east"];
    const stairs = [
      ["ledge-stair-west", "bridgehead-stair-west"],
      ["ledge-stair-east", "bridgehead-stair-east"],
    ];
    const own = (team: number): readonly string[] => stairs[team] ?? [];
    const head = (team: number): string => stairs[team]?.[1] ?? "";
    const routes: readonly (readonly [string, (team: number) => Route])[] = [
      ["the rope bridge", (team) => ({ through: [head(team)], shut: cave })],
      ["the cave", (team) => ({ through: [...cave, head(1 - team)], shut: own(team) })],
      [
        "the south pass, the ice wall broken",
        (team) => ({
          through: [head(1 - team)],
          shut: [...cave, ...own(team)],
          broken: ["ice-wall"],
        }),
      ],
    ];

    it.each(routes)(
      "walks each team from its spawn onto the rope bridge by %s within 5 % of the other",
      (_route, route) => {
        const [walk0 = 0, walk1 = 0] = walksByRoute(loaded, bridge, 2, route);
        expect(walk0).toBeGreaterThan(0);
        expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(0.05);
      },
    );

    it("still lets each team walk to the other with the rope bridge pulled", () => {
      const pulled = { ...map, decks: map.decks.filter(({ id }) => id !== "rope-bridge") };
      const spawn = (team: number) => {
        const found = map.spawnPoints.find((point) => point.team === team);
        if (found === undefined) throw new Error(`no spawn for team ${String(team)}`);
        return found.position;
      };
      expect(walksTo(pulled, spawn(1), 1)[0]).toBeGreaterThan(0);
      expect(walksTo(pulled, spawn(0), 1)[1]).toBeGreaterThan(0);
    });

    it("gives the teams high ground within 25 % of each other", () => {
      const [ground0 = 0, ground1 = 0] = highGround(map);
      expect(ground0).toBeGreaterThan(0);
      expect(Math.abs(ground0 - ground1) / Math.max(ground0, ground1)).toBeLessThanOrEqual(0.25);
    }, 60_000);
  });

  // Canthan Terraces (#3399): three routes to the court by the drain shaft, each walked with the
  // other two shut, the mud-brick wall standing: the team's own stair across the terrace, the paddy
  // steps up the middle, and the culvert from the team's own mouth up the shaft (sluice open).
  describe("Canthan Terraces", () => {
    const map = loadMap("canthan-terraces");
    const court = { x: 1200, y: 1050 };
    const stairs = ["stair-west", "stair-east"];
    const mouths = ["culvert-west-steps", "culvert-east-steps"];
    const routes: readonly (readonly [string, (team: number) => Route])[] = [
      [
        "its own stair",
        (team) => ({ through: [stairs[team] ?? ""], shut: ["paddy-steps", ...mouths] }),
      ],
      ["the paddy steps", () => ({ through: ["paddy-steps"], shut: [...stairs, ...mouths] })],
      [
        "the culvert",
        (team) => ({
          through: [mouths[team] ?? "", "drain-shaft-ramp"],
          shut: [...stairs, "paddy-steps"],
        }),
      ],
    ];

    it.each(routes)(
      "walks each team from its spawn into the court by %s within 10 % of the other",
      (_route, route) => {
        const [walk0 = 0, walk1 = 0] = walksByRoute(map, court, 1, route);
        expect(walk0).toBeGreaterThan(0);
        expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(0.1);
      },
    );
  });

  // Elonian Plateau (#3402): the centre is the centre fin's foot. Three routes reach it: the wash; the
  // passage under the fin, walked to its junction (the way up to the foot is the same for both); and
  // the high road, up the team's own lift, over the natural arch and down the far one. The high road
  // is walked in two halves, spawn to the arch's middle and the fin's foot to it, the arch's steps shut.
  describe("Elonian Plateau", () => {
    const map = loadMap("elonian-plateau");
    const foot = { x: 2705, y: 1990 };
    const junction = { x: 2705, y: 1632 };
    const arch = { x: 2270, y: 820 };
    const mouths = ["passage-mouth-west", "passage-mouth-east"];
    const lifts = ["west-lift", "north-east-lift"];
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    const highRoad = (on: typeof map, broken: readonly string[]): number[] => {
      const up = walksByRoute(on, arch, 2, (team) => ({
        through: [lifts[team] ?? ""],
        shut: ["arch-steps"],
        broken,
      }));
      const atFoot = {
        ...on,
        spawnPoints: [0, 1].map((team) => ({ team, layer: 1, position: foot })),
      };
      const down = walksByRoute(atFoot, arch, 2, (team) => ({
        through: [lifts[1 - team] ?? ""],
        shut: ["arch-steps", lifts[team] ?? ""],
        broken,
      }));
      return up.map((walk, team) => walk + (down[team] ?? 0));
    };

    const wash = (broken: readonly string[]): Route => ({
      through: [],
      shut: [...mouths, "passage-mouth-south", ...lifts, "south-east-lift"],
      broken,
    });
    const passage =
      (broken: readonly string[]) =>
      (team: number): Route => ({
        through: [mouths[team] ?? ""],
        broken,
      });

    it("walks each team from its spawn to the fin's foot by the wash within 5 % of the other", () => {
      within(walksByRoute(map, foot, 1, wash([])), 0.05);
    });

    it("walks each team through its own mouth to the passage's junction within 5 % of the other", () => {
      within(walksByRoute(map, junction, 0, passage([])), 0.05);
    });

    it("walks each team over the high road to the fin's foot within 5 % of the other", () => {
      within(highRoad(map, []), 0.05);
    });

    it("keeps the wash, the passage and the high road within 5 % with the sandstone wall broken", () => {
      const broken = ["sandstone-wall"];
      within(walksByRoute(map, foot, 1, wash(broken)), 0.05);
      within(walksByRoute(map, junction, 0, passage(broken)), 0.05);
      within(highRoad(map, broken), 0.05);
    });

    it("leaves each team the wash and the high road, and nobody the passage, with the gate shut", () => {
      const shut = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
      within(walksByRoute(shut, foot, 1, { through: [] }), 0.05);
      within(highRoad(shut, []), 0.05);
      // The south mouth's foot, under the fin: open, each team walks to it along the passage; shut, nobody.
      const mouth = { x: 2705, y: 1880 };
      const toMouth = (team: number): Route => ({
        through: [mouths[team] ?? ""],
        shut: ["passage-mouth-south"],
      });
      within(walksByRoute(map, mouth, 0, toMouth), 0.05);
      expect(() => walksByRoute(shut, mouth, 0, toMouth)).toThrow(/cannot reach/);
    });

    it("gives the teams high ground within 10 % of each other", () => {
      const [ground0 = 0, ground1 = 0] = highGround(map);
      expect(ground0).toBeGreaterThan(0);
      expect(Math.abs(ground0 - ground1) / Math.max(ground0, ground1)).toBeLessThanOrEqual(0.1);
    }, 60_000);
  });

  // Barrow Field (#3433): the centre is the standing stones on the moor. Three ways there: the moor
  // road, over the team's own barrow (its stair, across the top, off the drop-off facing the centre)
  // and the barrow way under it, through the gate. The walk tool paths no drop-off, so the barrow is
  // walked to the drop's top and on from its landing; the barrow way to the gate and on from there.
  // As loaded the gates are shut and the fallen stone stands.
  describe("Barrow Field", () => {
    const map = loadMap("barrow-field");
    const RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;
    const shut = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const stones = { x: 2700, y: 1300 };
    const shrines = [
      { x: 700, y: 980 },
      { x: 4720, y: 1620 },
    ];
    const gates = [
      { x: 1500, y: 760 },
      { x: 3900, y: 1840 },
    ];
    const stairs = ["west-barrow-stair", "east-barrow-stair"];
    const barrowStairs = [...stairs, "north-barrow-stair", "south-barrow-stair"];
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    /** `on` with each team's one spawn at `points[team]` on `layer`. */
    const from = (on: MapData, points: readonly Vec2[], layer = 1): MapData => ({
      ...on,
      spawnPoints: points.map((position, team) => ({ team, layer, position })),
    });
    /** Each team's walk to its own point of `to`, along its own route. */
    const toOwn = (
      on: MapData,
      to: readonly Vec2[],
      layer: number,
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, to[team] ?? stones, layer, (each) =>
            each === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );
    const sum = (...legs: readonly (readonly number[])[]): number[] =>
      [0, 1].map((team) => legs.reduce((total, leg) => total + (leg[team] ?? 0), 0));
    // The drop-off off each team's own barrow facing the stones, two bodies' clearance either side.
    const drops = matchLayers(map)
      .dropOffs.slice(0, 2)
      .map(({ edge, outward }) => {
        const middle = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
        const by = 2 * RADIUS;
        return {
          top: { x: middle.x - outward.x * by, y: middle.y - outward.y * by },
          landing: { x: middle.x + outward.x * by, y: middle.y + outward.y * by },
        };
      });
    const overTheBarrow = (on: MapData): number[] =>
      sum(
        toOwn(
          on,
          drops.map(({ top }) => top),
          2,
          (team) => ({ through: [stairs[team] ?? ""] }),
        ),
        drops.map(() => 4 * RADIUS),
        walksByRoute(
          from(
            on,
            drops.map(({ landing }) => landing),
          ),
          stones,
          1,
          { through: [], shut: barrowStairs },
        ),
      );
    const barrowWay = (to: readonly Vec2[], ownGate: (team: number) => Vec2): number[] => {
      const atGates = [0, 1].map(ownGate);
      return sum(
        toOwn(map, atGates, 0, () => ({ through: [] })),
        toOwn(from(map, atGates, 0), to, 1, () => ({ through: [] })),
      );
    };
    const moorRoad = (on: MapData, to: readonly Vec2[]): number[] =>
      toOwn(on, to, 1, () => ({ through: [], shut: barrowStairs }));
    const foes = [shrines[1] ?? stones, shrines[0] ?? stones];

    it("walks each team from its spawn to the stones by the moor road, gates shut, within 10 % of the other", () => {
      within(moorRoad(shut, [stones, stones]), 0.1);
    });

    it("walks each team over its own barrow to the stones, gates shut, within 10 % of the other", () => {
      within(overTheBarrow(shut), 0.1);
    });

    it("walks each team through its own barrow way to the stones within 10 % of the other", () => {
      within(
        barrowWay([stones, stones], (team) => gates[team] ?? stones),
        0.1,
      );
    });

    it("walks each team to the foe's shrine by the moor road, the south moor and the barrow way within 10 % of the other", () => {
      // The moor road and the south moor with the gates shut: two ways to each shrine as loaded.
      const road = moorRoad(shut, foes);
      within(road, 0.1);
      // The south moor: past the south barrow's east foot, south of the stones; its point-mirror past the north barrow's west foot.
      const south = [
        { x: 2600, y: 2000 },
        { x: 2800, y: 600 },
      ];
      const moor = sum(moorRoad(shut, south), moorRoad(from(shut, south), foes));
      within(moor, 0.1);
      // A way of its own, not the moor road with a step aside.
      [0, 1].forEach((team) => {
        expect(moor[team] ?? 0).toBeGreaterThan((road[team] ?? 0) + 150);
      });
      // The barrow way under the foe's barrow, through its gate.
      within(
        barrowWay(foes, (team) => gates[1 - team] ?? stones),
        0.1,
      );
    });

    it("walks each priest from its shrine to the stones within 10 % of the other", () => {
      within(moorRoad(from(map, shrines), [stones, stones]), 0.1);
    });

    it("keeps the walks within 10 % with the gates open and the fallen stone broken", () => {
      const broken = ["fallen-stone"];
      within(walksByRoute(map, stones, 1, { through: [], broken }), 0.1);
      within(
        toOwn(map, foes, 1, () => ({ through: [], broken })),
        0.1,
      );
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);

    it("paths off every drop-off straight down, not round by the stairs", () => {
      const layers = matchLayers(map);
      const finder = createLayeredPathFinder(
        mapNavGraphs(map, RADIUS),
        layers.transitions,
        [],
        layers.dropOffs,
      );
      expect(layers.dropOffs).toHaveLength(map.dropOffs.length);
      for (const { layer, edge, outward } of layers.dropOffs) {
        const middle = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
        const top = { x: middle.x - outward.x * 3 * RADIUS, y: middle.y - outward.y * 3 * RADIUS };
        const below = {
          x: middle.x + outward.x * 5 * RADIUS,
          y: middle.y + outward.y * 5 * RADIUS,
        };
        const path = finder.find(top, layer, below, layer - 1) ?? [];
        expect(path.some(({ dropOff }) => dropOff === true)).toBe(true);
        const length = path.reduce(
          (total, point, at) =>
            total +
            Math.hypot(point.x - (path[at - 1] ?? top).x, point.y - (path[at - 1] ?? top).y),
          0,
        );
        expect(length).toBeLessThan(2 * 8 * RADIUS);
      }
    });
  });

  // Blackwater Ford (#3434): the centre is the storm beacon on the mill deck, where the bridge
  // broke. Four ways there: the bridge road (the approach's near stair, along it to the mill), the
  // culvert under the approach (gate open) and up its far stair, the bank stair onto the mill's own
  // footing, and the ford (wading across, up the far approach). As loaded the gates are shut.
  describe("Blackwater Ford", () => {
    const map = loadMap("blackwater-ford");
    const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const mill = { x: 2600, y: 1512 };
    const shrines = [
      { x: 800, y: 1000 },
      { x: 4424, y: 1784 },
    ];
    const foes = [shrines[1] ?? mill, shrines[0] ?? mill];
    // The ford across from each team's own: the north ford for team 1, its point mirror the south.
    const farFords = [
      { x: 2624, y: 799 },
      { x: 2600, y: 1985 },
    ];
    const bridge = [
      "west-approach-south-stair",
      "west-approach-north-stair",
      "east-approach-south-stair",
      "east-approach-north-stair",
      "mill-west-stair",
      "mill-east-stair",
    ];
    /** A route through `through`, every other stair onto the bridge shut. */
    const only = (through: readonly string[]): Route => ({
      through,
      shut: bridge.filter((id) => !through.includes(id)),
    });
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    const from = (on: MapData, points: readonly Vec2[], layer = 1): MapData => ({
      ...on,
      spawnPoints: points.map((position, team) => ({ team, layer, position })),
    });
    const toOwn = (
      on: MapData,
      to: readonly Vec2[],
      layer: number,
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, to[team] ?? mill, layer, (each) =>
            each === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );
    const sum = (...legs: readonly (readonly number[])[]): number[] =>
      [0, 1].map((team) => legs.reduce((total, leg) => total + (leg[team] ?? 0), 0));
    const toMill = (on: MapData, route: (team: number) => Route): number[] =>
      toOwn(on, [mill, mill], 2, route);

    it("walks each team by the bridge road to the mill, gates shut, within 10 % of the other", () => {
      within(
        toMill(shut, (team) =>
          only([team === 0 ? "west-approach-south-stair" : "east-approach-north-stair"]),
        ),
        0.1,
      );
    });

    it("walks each team through its culvert and up the approach's far stair within 10 % of the other", () => {
      // The walk tool would go round the approach on open ground: to the gate, and on from it.
      const gates = [
        { x: 1750, y: 1507 },
        { x: 3450, y: 1327 },
      ];
      within(
        sum(
          toOwn(map, gates, 0, () => ({ through: [] })),
          toMill(from(map, gates, 0), (team) =>
            only(
              team === 0
                ? ["west-culvert-north-steps", "west-approach-north-stair"]
                : ["east-culvert-south-steps", "east-approach-south-stair"],
            ),
          ),
        ),
        0.1,
      );
    });

    it("walks each team up its bank stair onto the mill, gates shut, within 10 % of the other", () => {
      within(
        toMill(shut, (team) => only([team === 0 ? "mill-west-stair" : "mill-east-stair"])),
        0.1,
      );
    });

    it("walks each team across its ford and up the far approach, gates shut, within 10 % of the other", () => {
      within(
        toMill(shut, (team) =>
          only([team === 0 ? "east-approach-south-stair" : "west-approach-north-stair"]),
        ),
        0.1,
      );
    });

    it("walks each team to the foe's shrine by either ford and over the bridge within 10 % of the other", () => {
      const nearFord = toOwn(shut, foes, 1, () => only([]));
      within(nearFord, 0.1);
      const farFord = sum(
        toOwn(shut, farFords, 1, () => only([])),
        toOwn(from(shut, farFords), foes, 1, () => only([])),
      );
      within(farFord, 0.1);
      // A way of its own, not the near ford with a step aside.
      [0, 1].forEach((team) => {
        expect(farFord[team] ?? 0).toBeGreaterThan((nearFord[team] ?? 0) + 150);
      });
      within(
        toOwn(shut, foes, 1, (team) =>
          only(
            team === 0
              ? ["west-approach-south-stair", "east-approach-south-stair"]
              : ["east-approach-north-stair", "west-approach-north-stair"],
          ),
        ),
        0.1,
      );
    });

    it("walks each priest from its shrine to the mill within 10 % of the other", () => {
      within(
        toMill(from(map, shrines), () => ({ through: [] })),
        0.1,
      );
    });

    it("keeps the walks within 10 % with the gates open and the weir broken", () => {
      const broken = ["silted-weir"];
      within(walksByRoute(map, mill, 2, { through: [], broken }), 0.1);
      within(
        toOwn(map, foes, 1, () => ({ through: [], broken })),
        0.1,
      );
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });

  // The Brazen Causeway (#3435): the centre is the storm beacon in the middle of the causeway.
  // Three ways there: along the causeway from its end stair, through the team's own bronze gate
  // (open), or across the marsh to a stair onto the causeway's middle, the near one or the far
  // one (the far one by the culvert under the deck or round its end). As loaded the gates are shut.
  describe("The Brazen Causeway", () => {
    const map = loadMap("brazen-causeway");
    const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const centre = { x: 2800, y: 1400 };
    const shrines = [
      { x: 800, y: 1100 },
      { x: 4824, y: 1684 },
    ];
    const foes = [shrines[1] ?? centre, shrines[0] ?? centre];
    const onto = [
      "west-end-south-stair",
      "west-end-north-stair",
      "centre-north-stair",
      "centre-south-stair",
      "east-end-north-stair",
      "east-end-south-stair",
      "west-lever-stair",
      "east-lever-stair",
    ];
    /** A route through `through`, every other stair onto the causeway shut. */
    const only = (through: readonly string[]): Route => ({
      through,
      shut: onto.filter((id) => !through.includes(id)),
    });
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    const from = (on: MapData, points: readonly Vec2[], layer = 1): MapData => ({
      ...on,
      spawnPoints: points.map((position, team) => ({ team, layer, position })),
    });
    const toOwn = (
      on: MapData,
      to: readonly Vec2[],
      layer: number,
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, to[team] ?? centre, layer, (each) =>
            each === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );
    const sum = (...legs: readonly (readonly number[])[]): number[] =>
      [0, 1].map((team) => legs.reduce((total, leg) => total + (leg[team] ?? 0), 0));
    const toCentre = (on: MapData, route: (team: number) => Route): number[] =>
      toOwn(on, [centre, centre], 2, route);

    it("walks each team along the causeway through its open gate within 10 % of the other", () => {
      within(
        toCentre(map, (team) =>
          only([team === 0 ? "west-end-south-stair" : "east-end-north-stair"]),
        ),
        0.1,
      );
    });

    it("walks each team by its own lever stair to its gatehouse lever, gates shut, within 10 % of the other (#3549)", () => {
      const levers = [
        { x: 2150, y: 1230 },
        { x: 3480, y: 1570 },
      ];
      within(
        toOwn(shut, levers, 3, (team) =>
          only([team === 0 ? "west-lever-stair" : "east-lever-stair"]),
        ),
        0.1,
      );
    });

    it("walks each team across the marsh to the near middle stair, gates shut, within 10 % of the other", () => {
      within(
        toCentre(shut, (team) => only([team === 0 ? "centre-south-stair" : "centre-north-stair"])),
        0.1,
      );
    });

    it("walks each team through its culvert to the far middle stair, gates shut, within 10 % of the other", () => {
      // The walk tool would go round the causeway's end on open ground: to the culvert, and on from it.
      const culverts = [
        { x: 2400, y: 1400 },
        { x: 3200, y: 1400 },
      ];
      within(
        sum(
          toOwn(shut, culverts, 0, () => ({ through: [] })),
          toCentre(from(shut, culverts, 0), (team) =>
            only(team === 0 ? ["centre-north-stair"] : ["centre-south-stair"]),
          ),
        ),
        0.1,
      );
    });

    it("walks each team round the causeway's end to the far middle stair, gates shut, within 10 % of the other", () => {
      within(
        toCentre({ ...shut, tunnels: [], pits: [] }, (team) =>
          only([team === 0 ? "centre-north-stair" : "centre-south-stair"]),
        ),
        0.1,
      );
    });

    it("walks each team to the foe's shrine across the marsh, gates shut, and along the causeway, gates open, within 10 % of the other", () => {
      within(
        toOwn(shut, foes, 1, () => only([])),
        0.1,
      );
      // Along the causeway to its middle, then on along it and down its far end.
      within(
        sum(
          toCentre(map, (team) =>
            only([team === 0 ? "west-end-south-stair" : "east-end-north-stair"]),
          ),
          toOwn(from(map, [centre, centre], 2), foes, 1, (team) =>
            only([team === 0 ? "east-end-south-stair" : "west-end-north-stair"]),
          ),
        ),
        0.1,
      );
    });

    // #3521: reed flats across each marsh and mire banked against the causeway make the marsh
    // the slow way, so a lever is worth throwing. Walk time counts the water at 75 % pace.
    describe("walk time (#3521)", () => {
      const spawns = [
        { x: 500, y: 1765 },
        { x: 5124, y: 1019 },
      ];
      const foeSpawns = [spawns[1] ?? centre, spawns[0] ?? centre];
      /** Each team's own walk time to `to[team]` by `route(team)`. */
      const seconds = (
        on: MapData,
        to: readonly Vec2[],
        layer: number,
        route: (team: number) => Route,
      ): number[] =>
        [0, 1].map(
          (team) =>
            walkSecondsByRoute(on, to[team] ?? centre, layer, (each) =>
              each === team ? route(team) : { through: [] },
            )[team] ?? 0,
        );
      // Up the causeway's near end, down its far end on the side of `to`.
      const causeway = (down: readonly string[]) => (team: number) =>
        only([team === 0 ? "west-end-south-stair" : "east-end-north-stair", down[team] ?? ""]);
      const marsh = () => only([]);

      it.each([
        ["foe's spawn", foeSpawns, ["east-end-north-stair", "west-end-south-stair"]],
        ["foe's shrine", foes, ["east-end-south-stair", "west-end-north-stair"]],
      ] as const)(
        "makes the marsh to the %s at least 2.5 s slower than the causeway, gates open, each within 10 %",
        (_, to, down) => {
          const along = seconds(map, to, 1, causeway(down));
          const across = seconds(map, to, 1, marsh);
          within(along, 0.1);
          within(across, 0.1);
          for (const team of [0, 1]) {
            expect((across[team] ?? 0) - (along[team] ?? 0)).toBeGreaterThanOrEqual(2.5);
          }
        },
      );

      it("keeps the causeway the fastest way to the centre, and every marsh way there under 25 s", () => {
        const along = seconds(map, [centre, centre], 2, (team) =>
          only([team === 0 ? "west-end-south-stair" : "east-end-north-stair"]),
        );
        const near = seconds(shut, [centre, centre], 2, (team) =>
          only([team === 0 ? "centre-south-stair" : "centre-north-stair"]),
        );
        const far = seconds({ ...shut, tunnels: [], pits: [] }, [centre, centre], 2, (team) =>
          only([team === 0 ? "centre-north-stair" : "centre-south-stair"]),
        );
        for (const team of [0, 1]) {
          for (const marshWay of [near, far]) {
            expect(along[team] ?? 0).toBeLessThan(marshWay[team] ?? 0);
            expect(marshWay[team] ?? 0).toBeLessThan(25);
          }
        }
      });
    });

    it("walks each priest from its shrine to the centre within 10 % of the other", () => {
      within(
        toCentre(from(map, shrines), () => ({ through: [] })),
        0.1,
      );
    });

    it("keeps the walks within 10 % with the gates open and the palisades broken", () => {
      const broken = ["west-rotten-palisade", "east-rotten-palisade"];
      within(walksByRoute(map, centre, 2, { through: [], broken }), 0.1);
      within(
        toOwn(map, foes, 1, () => ({ through: [], broken })),
        0.1,
      );
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });

  // Jungle Ruins (#3436): the centre is the storm beacon on the pyramid's summit. The river splits
  // the map corner to corner; each team climbs its own face of the pyramid (the south approach for
  // team 1, the north for team 2), or crosses the river to climb the far face, by the near ford or
  // the log bridge. A foe reaches a shrine by either ford or through the hidden passage. As loaded,
  // the passage's doors are shut and both vine walls stand.
  describe("Jungle Ruins", () => {
    const map = loadMap("jungle-ruins");
    const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const centre = { x: 2700, y: 1400 };
    const shrines = [
      { x: 900, y: 1000 },
      { x: 4500, y: 1800 },
    ];
    const foes = [shrines[1] ?? centre, shrines[0] ?? centre];
    const faces = ["pyramid-south-stair", "pyramid-north-stair"];
    const bridges = [
      "north-west-bridge-west-stair",
      "north-west-bridge-east-stair",
      "south-east-bridge-west-stair",
      "south-east-bridge-east-stair",
    ];
    const passage = ["passage-west-steps", "passage-east-steps"];
    /** The map with these fords deep: a walk that may not wade there. */
    const deep = (on: MapData, fords: readonly string[]): MapData => ({
      ...on,
      water: (on.water ?? []).map((each) =>
        fords.includes(each.id) ? { ...each, depth: "deep" as const } : each,
      ),
    });
    /** The ford on the river's arm by `team`'s own face (north-west for team 1) and the far one. */
    const nearFord = (team: number): string => (team === 0 ? "north-ford" : "south-ford");
    const farFord = (team: number): string => (team === 0 ? "south-ford" : "north-ford");
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    /** Each team's own walk to `to[team]`, on a map and by a route of its own. */
    const each = (
      on: (team: number) => MapData,
      to: readonly Vec2[],
      layer: number,
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on(team), to[team] ?? centre, layer, (other) =>
            other === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );
    const toCentre = (on: (team: number) => MapData, route: (team: number) => Route): number[] =>
      each(on, [centre, centre], 3, route);
    const own = (team: number): string => faces[team] ?? "";
    const far = (team: number): string => faces[1 - team] ?? "";

    it("walks each team up its own face of the pyramid within 10 % of the other, in under 15 s", () => {
      const walks = toCentre(
        () => shut,
        (team) => ({ through: [own(team)], shut: [far(team)] }),
      );
      within(walks, 0.1);
      // A 2v2 fights round the summit: its walk there is under 15 s at base speed.
      for (const walk of walks)
        expect(walk / MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond).toBeLessThan(15);
    });

    it("walks each team across its near ford to the far face within 10 % of the other", () => {
      within(
        toCentre(
          () => shut,
          (team) => ({ through: [far(team)], shut: [own(team), ...bridges] }),
        ),
        0.1,
      );
    });

    it("walks each team over its log bridge to the far face within 10 % of the other", () => {
      within(
        toCentre(
          () => deep(shut, ["north-ford", "south-ford"]),
          (team) => ({
            through: [far(team), team === 0 ? (bridges[0] ?? "") : (bridges[3] ?? "")],
            shut: [own(team)],
          }),
        ),
        0.1,
      );
    });

    it("walks each team to the foe's shrine by either ford, doors shut, within 10 % of the other", () => {
      const round = { through: [], shut: [...faces, ...bridges] };
      within(
        each(
          (team) => deep(shut, [farFord(team)]),
          foes,
          1,
          () => round,
        ),
        0.1,
      );
      within(
        each(
          (team) => deep(shut, [nearFord(team)]),
          foes,
          1,
          () => round,
        ),
        0.1,
      );
    });

    it("walks each team to the foe's shrine through the hidden passage, doors open, within 10 % of the other", () => {
      within(
        each(
          () => deep(map, ["north-ford", "south-ford"]),
          foes,
          1,
          () => ({ through: passage, shut: [...faces, ...bridges] }),
        ),
        0.1,
      );
    });

    it("walks each priest from its shrine to the centre within 10 % of the other", () => {
      within(
        walksByRoute(
          { ...map, spawnPoints: shrines.map((position, team) => ({ team, layer: 1, position })) },
          centre,
          3,
          { through: [] },
        ),
        0.1,
      );
    });

    it("keeps the walks within 10 % with the doors open and the vine walls broken", () => {
      const broken = ["west-vine-wall", "east-vine-wall"];
      within(walksByRoute(map, centre, 3, { through: [], broken }), 0.1);
      within(
        each(
          () => map,
          foes,
          1,
          () => ({ through: [], broken }),
        ),
        0.1,
      );
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });

  describe("Broken Tower", () => {
    const map = loadMap("broken-tower");
    const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const altar = { x: 2712, y: 1392 };
    const relics = [
      { x: 1000, y: 1850 },
      { x: 4424, y: 934 },
    ];
    /** The map with each team's seats moved onto its relic spawn: the carrier's walk. */
    const carrier = (on: MapData): MapData => ({
      ...on,
      spawnPoints: relics.map((position, team) => ({ team, layer: 1, position })),
    });
    const hill = [
      "hill-south-west-stair",
      "hill-north-west-stair",
      "hill-north-east-stair",
      "hill-south-east-stair",
    ];
    const terraces = ["west-terrace-stair", "east-terrace-stair"];
    const mouths = ["cellar-west-steps", "cellar-east-steps"];
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    /** Each team's own walk to the altar on `on`, by a route of its own. */
    const toAltar = (on: MapData, route: (team: number) => Route): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, altar, 3, (other) => (other === team ? route(team) : { through: [] }))[
            team
          ] ?? 0,
      );
    /** Up one hill stair, every other way onto the hill shut. */
    const byStair = (stairs: readonly string[]) => (team: number) => ({
      through: [stairs[team] ?? ""],
      shut: [...hill.filter((each) => each !== stairs[team]), ...terraces, ...mouths],
    });
    // The study's south stair is team 1's south-west face and, turned, team 2's north-east one.
    const south = byStair(["hill-south-west-stair", "hill-north-east-stair"]);
    const north = byStair(["hill-north-west-stair", "hill-south-east-stair"]);
    const cellar = (team: number): Route => ({
      through: [mouths[team] ?? "", "cellar-stair"],
      shut: [...hill, ...terraces],
    });
    const terrace = (team: number): Route => ({
      through: [terraces[team] ?? ""],
      shut: [...hill, ...mouths],
    });
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;

    it.each([
      ["the cellar", cellar],
      ["the south stair", south],
      ["the north stair", north],
    ])("walks each team to the altar by %s within 10 % of the other, in under 25 s", (_, route) => {
      const walks = toAltar(map, route);
      within(walks, 0.1);
      for (const walk of walks) expect(walk / seconds).toBeLessThan(25);
    });

    it.each([
      ["the terrace", terrace],
      ["the south stair", south],
      ["the cellar", cellar],
    ])(
      "walks each carrier from its relic spawn to the altar by %s within 10 % of the other",
      (_, route) => {
        within(toAltar(carrier(map), route), 0.1);
      },
    );

    it("walks each team to its own relic spawn within 10 % of the other", () => {
      within(
        [0, 1].map((team) => walksTo(map, relics[team] ?? altar, 1)[team] ?? 0),
        0.1,
      );
    });

    it("keeps two stair routes to the altar with the cellar doors shut, and the cellar shut with them", () => {
      within(toAltar(shut, south), 0.1);
      within(toAltar(shut, north), 0.1);
      within(toAltar(carrier(shut), terrace), 0.1);
      expect(() => toAltar(shut, cellar)).toThrow(/cannot reach/);
    });

    it("keeps the walks within 10 % with the doors open and the rubble walls broken", () => {
      const broken = ["west-rubble-wall", "east-rubble-wall"];
      within(walksByRoute(map, altar, 3, { through: [], broken }), 0.1);
      within(walksByRoute(carrier(map), altar, 3, { through: [], broken }), 0.1);
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });
  // Mosslit Cairns (#3439): five capture points on cairn hills, the map mirrored west to east. Each
  // team's walk to a point is matched with the other team's walk to the mirrored point. A route is a
  // walk up one stair with the hill's other stairs shut; the root tunnel is shut until a lever opens
  // its gates, so it is walked with the gates open.
  describe("Mosslit Cairns", () => {
    const map = loadMap("mosslit-cairns");
    const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const points = map.objectives.flatMap((objective) =>
      objective.kind === "capture-point" ? [objective] : [],
    );
    const [northWest, northEast, centre, southWest, southEast] = points;
    const sides = [
      { side: "west", north: "north-west", south: "south-west" },
      { side: "east", north: "north-east", south: "south-east" },
    ];
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    type Point = NonNullable<typeof centre>;
    /** Each team's walk to its own point of `to`, along its own route. */
    const toOwn = (
      on: MapData,
      to: readonly (Point | undefined)[],
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map((team) => {
        const point = to[team];
        if (!point) throw new Error("missing capture point");
        return (
          walksByRoute(on, point.position, point.layer, (each) =>
            each === team ? route(team) : { through: [] },
          )[team] ?? 0
        );
      });
    /** Up the stairs `pick` names for a team, every other stair onto that hill shut. */
    const by =
      (hill: (team: number) => readonly string[], pick: (team: number) => string) =>
      (team: number): Route => ({
        through: [pick(team)],
        shut: hill(team).filter((each) => each !== pick(team)),
      });
    const great = (team: number): string[] => [
      `great-cairn-${sides[team]?.side ?? ""}-stair`,
      `great-cairn-${sides[1 - team]?.side ?? ""}-stair`,
      "great-cairn-north-stair",
      "great-cairn-south-stair",
    ];
    const cairn =
      (end: "north" | "south") =>
      (team: number): string[] =>
        ["outer", "inner", "lane"].map((face) => `${sides[team]?.[end] ?? ""}-cairn-${face}-stair`);
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;

    it.each([
      ["its own stair", (team: number) => `great-cairn-${sides[team]?.side ?? ""}-stair`],
      ["the north lane stair", () => "great-cairn-north-stair"],
      ["the south lane stair", () => "great-cairn-south-stair"],
    ])(
      "walks each team onto the great cairn by %s within 5 % of the other, in under 25 s",
      (_, stair) => {
        const walks = toOwn(shut, [centre, centre], by(great, stair));
        within(walks, 0.05);
        for (const walk of walks) expect(walk / seconds).toBeLessThan(25);
      },
    );

    it.each([
      ["outer", "north"],
      ["lane", "north"],
      ["inner", "north"],
      ["outer", "south"],
      ["lane", "south"],
    ] as const)(
      "walks each team onto its own %s %s point within 10 % of the other",
      (face, end) => {
        const own = end === "north" ? [northWest, northEast] : [southWest, southEast];
        const stair = (team: number): string => `${sides[team]?.[end] ?? ""}-cairn-${face}-stair`;
        const walks = toOwn(shut, own, by(cairn(end), stair));
        within(walks, 0.1);
        for (const walk of walks) expect(walk / seconds).toBeLessThan(25);
      },
    );

    it.each([
      ["north", [northEast, northWest]],
      ["south", [southEast, southWest]],
    ] as const)("walks each team onto the far %s point within 10 % of the other", (_, far) => {
      const walks = toOwn(shut, far, () => ({ through: [] }));
      within(walks, 0.1);
      for (const walk of walks) expect(walk / seconds).toBeLessThan(25);
    });

    it("walks each team into the root tunnel by its own steps within 10 % once a lever opens the gates", () => {
      const steps = ["root-tunnel-west-steps", "root-tunnel-east-steps"];
      const middle = { x: map.width / 2, y: 2150 };
      const own = (team: number): Route => ({
        through: [steps[team] ?? ""],
        shut: [steps[1 - team] ?? ""],
      });
      within(walksByRoute(map, middle, 0, own), 0.1);
      expect(() => walksByRoute(shut, middle, 0, own)).toThrow(/cannot reach/);
    });

    it("keeps the walks within 10 % with the gates open and the root walls broken", () => {
      const open = (): Route => ({ through: [], broken: ["west-root-wall", "east-root-wall"] });
      within(toOwn(map, [centre, centre], open), 0.05);
      for (const pair of [
        [northWest, northEast],
        [northEast, northWest],
        [southWest, southEast],
        [southEast, southWest],
      ])
        within(toOwn(map, pair, open), 0.1);
    }, 60_000);

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);

    it("stands the south points a layer above the north ones, so the outer cairns are not four equal plinths", () => {
      expect([northWest, northEast].map((point) => point?.layer)).toEqual([2, 2]);
      expect([southWest, southEast].map((point) => point?.layer)).toEqual([3, 3]);
    });
  });

  describe("Cinder Sanctum", () => {
    const loaded = loadMap("cinder-sanctum");
    // The walks here read no zone costs, but a bot wades lava at three times the cost
    // (HARMFUL_ZONE_COST) and takes a bridge: a route is a bridge, so the rivers are walls.
    const map: MapData = {
      ...loaded,
      walls: [
        ...loaded.walls,
        ...(loaded.zones ?? [])
          .filter((zone) => zone.kind === "molten")
          .map(({ area, layer }) => ({ ...area, layer })),
      ],
    };
    const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const sanctum = { x: 2812, y: 1400 };
    const relics = [
      { x: 900, y: 1400 },
      { x: 4724, y: 1400 },
    ];
    const ghosts = [
      { x: 700, y: 860 },
      { x: 4924, y: 1940 },
    ];
    /** The map with each team's seats moved onto the foe's relic spawn: the carrier's walk. */
    const carrier = (on: MapData): MapData => ({
      ...on,
      spawnPoints: relics.map((_, team) => ({
        team,
        layer: 1,
        position: relics[1 - team] ?? sanctum,
      })),
    });
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    /** Each team's walk to its own `to` on `layer`, by a route of its own. */
    const walks = (
      on: MapData,
      to: readonly Vec2[],
      layer: number,
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, to[team] ?? sanctum, layer, (other) =>
            other === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );
    // Every bank stair of both rivers, and the passage: a route opens only its own.
    const banks = {
      north: ["north-bridge-west-bank", "north-bridge-east-bank"],
      causeway: ["causeway-west-bank", "causeway-east-bank"],
      south: ["south-bridge-west-bank", "south-bridge-east-bank"],
    };
    const passage = ["passage-north-steps", "passage-south-steps"];
    const allBanks = Object.values(banks).flat();
    /**
     * Team 1's route over `bridge`, and team 2's turned: the study's north bridge is team 1's
     * north and, turned half round, team 2's south.
     */
    const over = (
      bridge: keyof typeof banks,
      extra: (team: number) => readonly string[] = () => [],
    ) => {
      const turned = { north: "south", causeway: "causeway", south: "north" } as const;
      return (team: number): Route => {
        const through = [...banks[team === 0 ? bridge : turned[bridge]], ...extra(team)];
        return { through, shut: [...allBanks.filter((id) => !through.includes(id)), ...passage] };
      };
    };
    const routes = [
      ["the causeway", over("causeway")],
      ["the north bridge", over("north")],
      ["the south bridge", over("south")],
    ] as const;
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;

    it.each(routes)(
      "walks each team to the sanctum by %s within 10 % of the other, in under 25 s",
      (_, route) => {
        // To the sanctum a team crosses its own river only.
        const own = (team: number): Route => {
          const { through, shut: closed = [] } = route(team);
          const mine = through.filter((id) => id.includes(team === 0 ? "west" : "east"));
          return { through: mine, shut: closed };
        };
        const walked = walks(map, [sanctum, sanctum], 3, own);
        within(walked, 0.1);
        for (const walk of walked) expect(walk / seconds).toBeLessThan(25);
      },
    );

    it.each(routes)(
      "walks each thief to the foe's relic by %s within 10 % of the other",
      (_, route) => {
        within(walks(map, [relics[1] ?? sanctum, relics[0] ?? sanctum], 1, route), 0.1);
      },
    );

    it.each(routes)(
      "walks each carrier from the foe's relic to its own ghost by %s within 10 % of the other",
      (_, route) => {
        within(walks(carrier(map), ghosts, 1, route), 0.1);
      },
    );

    it("walks each team to its own relic spawn within 10 % of the other", () => {
      within(
        [0, 1].map((team) => walksTo(map, relics[team] ?? sanctum, 1)[team] ?? 0),
        0.1,
      );
    });

    it("keeps all three bridges for every thief and carrier with the passage doors shut, and the passage shut with them", () => {
      for (const [, route] of routes) {
        within(walks(shut, [relics[1] ?? sanctum, relics[0] ?? sanctum], 1, route), 0.1);
        within(walks(carrier(shut), ghosts, 1, route), 0.1);
      }
      // From the north mouth's landing to the south one's: under the sanctum while the doors are open.
      const atMouth = (on: MapData): MapData => ({
        ...on,
        spawnPoints: [0, 1].map((team) => ({ team, layer: 1, position: { x: 2812, y: 680 } })),
      });
      const south = { x: 2812, y: 2120 };
      expect(walksByRoute(atMouth(map), south, 1, { through: passage })[0]).toBeGreaterThan(0);
      expect(() => walksByRoute(atMouth(shut), south, 1, { through: passage })).toThrow();
    });

    it("keeps the walks within 10 % with the doors open and the ash walls broken", () => {
      const broken = ["south-west-ash-wall", "north-east-ash-wall"];
      within(walksByRoute(map, sanctum, 3, { through: [], broken }), 0.1);
      within(
        walks(carrier(map), ghosts, 1, () => ({ through: [], broken })),
        0.1,
      );
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });

  // Scarred Earth (#3440): mirrored east to west, so every walk below is the same both ways. The
  // centre is on the great deck (layer 3), up the great hulk's own-side stair, then the deck's.
  describe("Scarred Earth", () => {
    const map = loadMap("scarred-earth");
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
    const centre = { x: 2700, y: 1400 };
    const own = ["west", "east"];
    /** A team's own side, and the far one. */
    const side = (team: number, far = false): string => own[far ? 1 - team : team] ?? "";
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    /** Up the great hulk's stair on `face` and the deck's on the same face, the other face shut. */
    const up = (face: (team: number) => string) => (team: number) => {
      const other = face(team) === "west" ? "east" : "west";
      return {
        through: [`great-hulk-${face(team)}-stair`, `great-deck-${face(team)}-stair`],
        shut: [`great-hulk-${other}-stair`, `great-deck-${other}-stair`],
      };
    };
    /**
     * A cut across each half of the field, on the ground and the crater floors under it, from the
     * north or south edge to the middle of the field: the walk to the great hulk goes round its
     * open end, along the other lane.
     */
    const cut = (north: boolean): MapData => ({
      ...map,
      walls: [
        ...map.walls,
        ...[1700, map.width - 1720].flatMap((x) =>
          [0, 1].map((layer) => ({
            kind: "rect" as const,
            x,
            y: north ? 1100 : 0,
            width: 20,
            height: north ? map.height - 1100 : 1700,
            layer,
          })),
        ),
      ],
    });
    /** A hulk point's walk by the stair on `face` of `hulk`, its other stair shut. */
    const byLane =
      (hulk: (team: number) => string, face: "north" | "south") =>
      (team: number): Route => ({
        through: [`${hulk(team)}-${face}-stair`],
        shut: [`${hulk(team)}-${face === "north" ? "south" : "north"}-stair`],
      });
    const points = [
      ["own north", (team: number) => `north-${side(team)}-hulk`, { x: 1750, y: 640 }],
      ["own south", (team: number) => `south-${side(team)}-hulk`, { x: 1750, y: 2160 }],
      ["far north", (team: number) => `north-${side(team, true)}-hulk`, { x: 1750, y: 640 }],
      ["far south", (team: number) => `south-${side(team, true)}-hulk`, { x: 1750, y: 2160 }],
    ] as const;
    /** Where team `team` finds a point given by its west image: its own, or the far team's. */
    const at = (team: number, point: { x: number; y: number }, far: boolean) => {
      const west = team === 0 ? !far : far;
      return west ? point : { x: map.width - point.x, y: point.y };
    };
    /** Each team's walk to its own image of `point` by `route`. */
    const toPoint = (
      on: MapData,
      point: { x: number; y: number },
      far: boolean,
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, at(team, point, far), 2, (other) =>
            other === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );

    it.each([
      ["the west approach", map],
      ["the north lane", cut(false)],
      ["the south lane", cut(true)],
    ])("walks each team to the centre by %s within 10 % of the other, in under 25 s", (_, on) => {
      const walks = walksByRoute(
        on,
        centre,
        3,
        up((team) => side(team)),
      );
      within(walks, 0.1);
      for (const walk of walks) expect(walk / seconds).toBeLessThan(25);
    });

    it("walks each team to the centre round by the far stair within 10 % of the other", () => {
      within(
        walksByRoute(
          map,
          centre,
          3,
          up((team) => side(team, true)),
        ),
        0.1,
      );
    });

    it.each(
      points.flatMap(([name, hulk, point]) =>
        (["north", "south"] as const).map((face) => {
          const outer = name.endsWith("north") === (face === "north");
          return [name, outer ? "outer" : "inner", hulk, point, face] as const;
        }),
      ),
    )(
      "walks each team to the %s point by the %s lane within 10 % of the other",
      (name, _, hulk, point, face) => {
        within(toPoint(map, point, name.startsWith("far"), byLane(hulk, face)), 0.1);
      },
    );

    it("walks each team to the centre and every point within 10 % of the other", () => {
      within(walksTo(map, centre, 3), 0.1);
      for (const [name, , point] of points) {
        const far = name.startsWith("far");
        within(
          [0, 1].map((team) => walksTo(map, at(team, point, far), 2)[team] ?? 0),
          0.1,
        );
      }
    });

    it("keeps every walk within 10 % as loaded, the trench gates shut and the palisades standing", () => {
      const shut: MapData = {
        ...map,
        walls: [...map.walls, ...map.gates.map(({ wall }) => wall)],
      };
      within(
        walksByRoute(
          shut,
          centre,
          3,
          up((team) => side(team)),
        ),
        0.1,
      );
      for (const [name, hulk, point] of points) {
        for (const face of ["north", "south"] as const) {
          within(toPoint(shut, point, name.startsWith("far"), byLane(hulk, face)), 0.1);
        }
      }
    });

    it("keeps the walks within 10 % with the gates open and the palisades broken", () => {
      const broken = ["west-palisade", "east-palisade"];
      within(walksByRoute(map, centre, 3, { through: [], broken }), 0.1);
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });

  describe("The Warden's Gallery", () => {
    const map = loadMap("wardens-gallery");
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
    const centre = { x: 2600, y: 1250 };
    const own = ["west", "east"];
    const faces = ["north", "south", "west", "east"] as const;
    /** A team's own side, and the far one. */
    const side = (team: number, far = false): string => own[far ? 1 - team : team] ?? "";
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    /** Onto `deck` by its stair on `face`, its other stairs shut. */
    const by = (deck: string, face: string): Route => ({
      through: [`${deck}-${face}-stair`],
      shut: faces.filter((other) => other !== face).map((other) => `${deck}-${other}-stair`),
    });
    /**
     * The routes of the study to the great plinth: the nave climbs its base on the team's own
     * face, the north and south halls on the north and south faces.
     */
    const routes = [
      ["the nave", (team: number) => by("great-plinth-base", side(team))],
      ["the north hall", () => by("great-plinth-base", "north")],
      ["the south hall", () => by("great-plinth-base", "south")],
    ] as const;
    /** A point by name, its west image, its layer, and whether it is the far team's. */
    type Point = readonly [string, { x: number; y: number }, number, boolean];
    const points: readonly Point[] = [
      ["own north", { x: 1700, y: 500 }, 1, false],
      ["own plinth", { x: 1700, y: 1250 }, 2, false],
      ["own south", { x: 1700, y: 2000 }, 1, false],
      ["far north", { x: 1700, y: 500 }, 1, true],
      ["far plinth", { x: 1700, y: 1250 }, 2, true],
      ["far south", { x: 1700, y: 2000 }, 1, true],
    ];
    /** Where team `team` finds a point given by its west image: its own, or the far team's. */
    const at = (team: number, point: { x: number; y: number }, far: boolean) => {
      const west = team === 0 ? !far : far;
      return west ? point : { x: map.width - point.x, y: point.y };
    };
    /** Each team's walk to its image of `point`, by `route` or the best way. */
    const toPoint = (
      on: MapData,
      [, point, layer, far]: Point,
      route?: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          (route === undefined
            ? walksTo(on, at(team, point, far), layer)
            : walksByRoute(on, at(team, point, far), layer, (other) =>
                other === team ? route(team) : { through: [] },
              ))[team] ?? 0,
      );
    /** The plinth face a team climbs: its own west is the far team's east. */
    const mirroredFace = (team: number, face: string): string =>
      team === 1 && (face === "west" || face === "east")
        ? face === "west"
          ? "east"
          : "west"
        : face;
    /** As loaded: every undercroft gate shut, every statue standing. */
    const shut: MapData = {
      ...map,
      walls: [
        ...map.walls,
        ...map.gates.map(({ wall }) => wall),
        ...(map.breakables ?? []).map(({ wall }) => wall),
      ],
    };

    it.each(routes)(
      "walks each team to the centre by %s within 10 % of the other, in under 25 s",
      (_, route) => {
        for (const on of [map, shut]) {
          const walks = walksByRoute(on, centre, 3, route);
          within(walks, 0.1);
          for (const walk of walks) expect(walk / seconds).toBeLessThan(25);
        }
      },
    );

    it.each(points)(
      "walks each team to the %s point within 10 % of the other, as loaded and opened",
      (...point) => {
        within(toPoint(map, point), 0.1);
        within(toPoint(shut, point), 0.1);
      },
    );

    it.each(points.filter(([, , layer]) => layer === 2))(
      "walks each team onto the %s point by each of its four stairs within 10 % of the other",
      (...point) => {
        const far = point[3];
        for (const face of faces) {
          within(
            toPoint(map, point, (team) =>
              by(`${side(team, far)}-plinth`, mirroredFace(team, face)),
            ),
            0.1,
          );
        }
      },
    );

    it("keeps the centre walk within 10 % with the gates open and the statues broken", () => {
      const broken = ["west-statue", "east-statue"];
      within(walksByRoute(map, centre, 3, { through: [], broken }), 0.1);
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });

  // Guild Hall Isle (#3445): team 1's half is team 0's turned 180° about the flag dais, so every
  // walk below is the same both ways. Out of a base three ways: under the rampart by the
  // gatehouse, over it by its stairs, or round its end, dry along a pier or wading the inlet.
  describe("Guild Hall Isle", () => {
    const map = loadMap("guild-hall-isle");
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
    const stand = { x: 3000, y: 1300 };
    /** Team `team`'s own `id`, named as team 0's: team 1's is its turn, west for east, north for south. */
    const own = (team: number, id: string): string =>
      team === 0
        ? id
        : id
            .replace(/west/g, "@")
            .replace(/east/g, "west")
            .replace(/@/g, "east")
            .replace(/north/g, "@")
            .replace(/south/g, "north")
            .replace(/@/g, "south");
    const gatehouse = ["west-gatehouse-west-steps", "west-gatehouse-east-steps"];
    const rampart = ["west-rampart-west-stair", "west-rampart-east-stair"];
    const northPier = ["north-west-pier-west-stair", "north-west-pier-east-stair"];
    const southPier = ["south-west-pier-west-stair", "south-west-pier-east-stair"];
    const ways = [gatehouse, rampart, northPier, southPier];
    /** The inlet a pier crosses, team 0's: wading it is the wet way round that end. */
    const inlets = new Map<readonly string[], string>([
      [northPier, "north-west-pier-inlet"],
      [southPier, "south-west-pier-inlet"],
    ]);
    /**
     * Through `way`, every other way out of the team's base shut. Round an end, the walk may
     * take the pier or wade the inlet under it, so it need pass none of the pier's stairs.
     */
    const by =
      (way: readonly string[]) =>
      (team: number): Route => ({
        through: way === northPier || way === southPier ? [] : way.map((id) => own(team, id)),
        shut: ways
          .filter((each) => each !== way)
          .flatMap((each) => each.map((id) => own(team, id))),
      });
    /**
     * Each team's walk to the stand by `way` on `on`. Round an end, the other end's inlet is
     * made deep, so the walk goes round this end, by its pier or its wade.
     */
    const walksBy = (on: MapData, way: readonly string[]): number[] =>
      [0, 1].map((team) => {
        const other = [...inlets].filter(([end]) => end !== way).map(([, id]) => own(team, id));
        const walled: MapData = {
          ...on,
          water: (on.water ?? []).map((each) =>
            inlets.has(way) && other.includes(each.id) ? { ...each, depth: "deep" as const } : each,
          ),
        };
        return walksByRoute(walled, stand, 2, by(way))[team] ?? 0;
      });
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    const lords = map.objectives.flatMap((objective) =>
      objective.kind === "guild-lord" ? [objective] : [],
    );
    const flags = map.objectives.flatMap((objective) =>
      objective.kind === "flag-spawn" ? [objective] : [],
    );

    it.each([
      ["the gatehouse", gatehouse],
      ["the rampart", rampart],
      ["the north end", northPier],
      ["the south end", southPier],
    ])(
      "walks each team to the flag stand by %s within 10 % of the other, in under 30 s",
      (_, way) => {
        const walks = walksBy(map, way);
        within(walks, 0.1);
        for (const walk of walks) expect(walk / seconds).toBeLessThan(30);
      },
    );

    it("walks each team to the enemy Guild Lord within 10 % of the other", () => {
      within(
        [0, 1].map((team) => {
          const lord = lords.find((each) => each.team !== team);
          if (lord === undefined) throw new Error("no enemy lord");
          return walksTo(map, lord.position, lord.layer)[team] ?? 0;
        }),
        0.1,
      );
    });

    it("walks each team to its own flag within 10 % of the other", () => {
      within(
        [0, 1].map((team) => {
          const flag = flags.find((each) => each.team === team);
          if (flag === undefined) throw new Error("no flag");
          return walksTo(map, flag.position, flag.layer)[team] ?? 0;
        }),
        0.1,
      );
    });

    it("keeps the rampart and the ends open with the gatehouse doors shut", () => {
      const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
      within(walksBy(shut, rampart), 0.1);
      within(walksBy(shut, northPier), 0.1);
      within(walksBy(shut, southPier), 0.1);
      // The shut doors turn the walk away from the gatehouse: it wades round an end instead.
      expect(() => walksByRoute(shut, stand, 2, by(gatehouse))).toThrow(
        /did not pass west-gatehouse-west-steps, west-gatehouse-east-steps/,
      );
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });

  // The Elite Zaishen Battle (#3446): team 1's half is team 0's turned 180° about the start line.
  // To the start line three ways: across the sunken floor, over the team's own stand (up its west
  // stair, down its middle one), or through the undercroft under it, its portcullis open.
  describe("The Elite Zaishen Battle", () => {
    const map = loadMap("elite-zaishen-battle");
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
    const line = { x: 2700, y: 1200 };
    /** Team `team`'s own `id`, named as team 0's: team 1's is its turn, west for east, north for south. */
    const own = (team: number, id: string): string =>
      team === 0
        ? id
        : id
            .replace(/west/g, "@")
            .replace(/east/g, "west")
            .replace(/@/g, "east")
            .replace(/north/g, "@")
            .replace(/south/g, "north")
            .replace(/@/g, "south");
    /** Team 0's point, or its turn for team 1. */
    const at = (team: number, point: Vec2): Vec2 =>
      team === 0 ? point : { x: map.width - point.x, y: map.height - point.y };
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    /** Through the team's own `ids`, every other transition shut. */
    const only =
      (ids: readonly string[]) =>
      (team: number): Route => {
        const through = ids.map((id) => own(team, id));
        return {
          through,
          shut: map.transitions.map(({ id }) => id).filter((id) => !through.includes(id)),
        };
      };
    /** `on` with each team's one spawn at its own `point` on `layer`. */
    const from = (on: MapData, point: Vec2, layer: number): MapData => ({
      ...on,
      spawnPoints: [0, 1].map((team) => ({ team, layer, position: at(team, point) })),
    });
    /** Each team's walk to its own `point`, by `route`. */
    const toOwn = (on: MapData, point: Vec2, layer: number, route: (team: number) => Route) =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, at(team, point), layer, (each) =>
            each === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );
    /** As loaded: both portcullises shut, both statue screens standing. */
    const shut: MapData = {
      ...map,
      walls: [
        ...map.walls,
        ...map.gates.map(({ wall }) => wall),
        ...(map.breakables ?? []).map(({ wall }) => wall),
      ],
    };
    const onStand = { x: 1500, y: 620 };
    const inUndercroft = { x: 1900, y: 640 };
    const sum = (a: readonly number[], b: readonly number[]): number[] =>
      [0, 1].map((team) => (a[team] ?? 0) + (b[team] ?? 0));
    const routes = [
      ["the floor", () => walksByRoute(shut, line, 1, only([]))],
      [
        "the stand",
        () =>
          sum(
            toOwn(shut, onStand, 2, only(["north-tier-1-west-stair"])),
            walksByRoute(from(shut, onStand, 2), line, 1, only(["north-tier-1-middle-stair"])),
          ),
      ],
      [
        "the undercroft",
        () =>
          sum(
            toOwn(map, inUndercroft, 0, only(["north-undercroft-west-steps"])),
            walksByRoute(
              from(map, inUndercroft, 0),
              line,
              1,
              only(["north-undercroft-east-steps"]),
            ),
          ),
      ],
    ] as const;

    it.each(routes)(
      "walks each team to the start line by %s within 10 % of the other, in under 25 s",
      (_, walks) => {
        const both = walks();
        within(both, 0.1);
        for (const walk of both) expect(walk / seconds).toBeLessThan(25);
      },
    );

    it("walks each team to the foe's spawn across the floor, as loaded, within 10 % of the other", () => {
      const spawn = { x: 5050, y: 1200 };
      within(
        toOwn(shut, spawn, 1, () => ({ through: [] })),
        0.1,
      );
    });

    it("keeps the walk to the start line within 10 % with the portcullises open and the screens broken", () => {
      const broken = (map.breakables ?? []).map(({ id }) => id);
      within(walksByRoute(map, line, 1, { through: [], broken }), 0.1);
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);

    // A body on a ramp collides only with its own layer's walls, so a portcullis on the stair would
    // let a keyboard walk through it shut; pathing cannot catch that (#3446).
    describe("by keyboard up each undercroft's west steps", () => {
      const build = STARTER_BUILDS[0];
      if (build === undefined) {
        throw new Error("no built-in builds");
      }
      /** Each team's walker at the foot of its own steps, and a puller on each lever. */
      const sim = (pull: boolean): MatchSimulation => {
        const body = (id: string, team: number, position: Vec2, layer: number) => ({
          ...playBuildBot(build, id, team, { position, layer }, 0),
          behaviour: undefined,
        });
        const levers = map.switches ?? [];
        const match = new MatchSimulation({
          seed: "portcullis",
          matchRules: mapMatchRules(map, map.mode),
          teamCount: map.teams,
          ...mapSimulationFields(map, map.teams),
          participants: [
            ...[0, 1].map((team) =>
              body(`walker-${String(team)}`, team, at(team, vec2(1600, 680)), 0),
            ),
            ...levers.map(({ id, position, layer }, team) => body(id, team, position, layer)),
          ],
        });
        if (pull) {
          for (const { id } of levers) match.requestAttack(id, switchTargetId(id));
          for (let t = 0; t < 2; t += 0.05) match.step(0.05);
          expect(match.gates.every(({ open }) => open)).toBe(true);
        }
        match.setInputDirection("walker-0", vec2(0, 1));
        match.setInputDirection("walker-1", vec2(0, -1));
        for (let t = 0; t < 4; t += 0.05) match.step(0.05);
        return match;
      };
      /** How far past its portcullis's near edge each walker got: north y 810, south y 1590. */
      const past = (match: MatchSimulation): number[] => [
        (match.get("walker-0")?.position.y ?? 0) - 810,
        1590 - (match.get("walker-1")?.position.y ?? map.height),
      ];

      it("stops each team at its shut portcullis", () => {
        for (const beyond of past(sim(false))) expect(beyond).toBeLessThan(0);
      });

      it("lets each team through once the levers open them", () => {
        const open = sim(true);
        for (const beyond of past(open)) expect(beyond).toBeGreaterThan(100);
        expect([open.get("walker-0")?.layer, open.get("walker-1")?.layer]).toEqual([1, 1]);
      });
    });
  });

  // The Hollow Deep (#3444): a cavern turned half round its centre, team 0 in the west lobe and
  // team 1 in the east. A lobe reaches the centre chamber only over its mid ledge or a shelf, or
  // under the ledge through the undercroft once a lever on a shelf opens its gate; the crown on the
  // dais is the centre. A shelf route drops off the shelf's inner edge, so it is walked in two legs.
  // Each team's shelves are named from the map: the one with its lever first, then the other.
  describe("The Hollow Deep", () => {
    const map = loadMap("hollow-deep");
    const RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
    const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const crown = { x: 3100, y: 1200 };
    const ghosts = map.objectives.flatMap((objective) =>
      objective.kind === "ghost-spawn" ? [objective.position] : [],
    );
    const foes = [ghosts[1] ?? crown, ghosts[0] ?? crown];
    const sides = ["west", "east"];
    const shelves = [
      ["north-west", "south-west"],
      ["south-east", "north-east"],
    ];
    const shelfStair = (team: number, which: number): string =>
      `${shelves[team]?.[which] ?? ""}-shelf-stair`;
    const ledge = (team: number): string[] =>
      ["outer", "inner"].map((end) => `${sides[team] ?? ""}-mid-ledge-${end}-stair`);
    const undercroft = (team: number): string[] =>
      ["outer", "inner"].map((end) => `${sides[team] ?? ""}-undercroft-${end}-steps`);
    // Every way between a lobe and the chamber; the dais and crown stairs stay open.
    const ways = map.transitions
      .map(({ id }) => id)
      .filter((id) => !id.startsWith("dais-") && !id.startsWith("crown-"));
    const only = (...through: string[]): Route => ({
      through,
      shut: ways.filter((id) => !through.includes(id)),
    });
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    const under = (walks: readonly number[], cap: number): void => {
      for (const walk of walks) expect(walk / seconds).toBeLessThan(cap);
    };
    /** `on` with each team's one spawn at `points[team]` on `layer`. */
    const from = (on: MapData, points: readonly Vec2[], layer = 1): MapData => ({
      ...on,
      spawnPoints: points.map((position, team) => ({ team, layer, position })),
    });
    /** Each team's walk to its own point of `to`, along its own route. */
    const toOwn = (
      on: MapData,
      to: readonly Vec2[],
      layer: number,
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, to[team] ?? crown, layer, (each) =>
            each === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );
    const sum = (...legs: readonly (readonly number[])[]): number[] =>
      [0, 1].map((team) => legs.reduce((total, leg) => total + (leg[team] ?? 0), 0));
    // The shelves' inner-edge drop-offs, in map order: team 0's two shelves, then team 1's.
    const drops = matchLayers(map).dropOffs.map(({ edge, outward }) => {
      const middle = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
      const by = 2 * RADIUS;
      return {
        top: { x: middle.x - outward.x * by, y: middle.y - outward.y * by },
        landing: { x: middle.x + outward.x * by, y: middle.y + outward.y * by },
      };
    });
    const drop = (team: number, which: number): (typeof drops)[number] => {
      const each = drops[2 * team + which];
      if (each === undefined) throw new Error("missing drop-off");
      return each;
    };
    /** Up a shelf's outer stair, along it, off its inner edge, and on to the crown. */
    const overShelf = (which: number): number[] =>
      sum(
        toOwn(
          shut,
          [0, 1].map((team) => drop(team, which).top),
          2,
          (team) => only(shelfStair(team, which)),
        ),
        [4 * RADIUS, 4 * RADIUS],
        walksByRoute(
          from(
            shut,
            [0, 1].map((team) => drop(team, which).landing),
          ),
          crown,
          3,
          only(),
        ),
      );

    it("draws four drop-offs, one off each shelf's inner edge", () => {
      expect(drops).toHaveLength(4);
    });

    it("walks each team through its own undercroft to the crown within 10 % of the other, in under 25 s, once the lever opens the gate", () => {
      const walks = toOwn(map, [crown, crown], 3, (team) => only(...undercroft(team)));
      within(walks, 0.1);
      under(walks, 25);
      expect(() => toOwn(shut, [crown, crown], 3, (team) => only(...undercroft(team)))).toThrow(
        /cannot reach/,
      );
    });

    it("walks each team over its own mid ledge to the crown, gates shut, within 10 % of the other, in under 25 s", () => {
      const walks = toOwn(shut, [crown, crown], 3, (team) => only(...ledge(team)));
      within(walks, 0.1);
      under(walks, 25);
    });

    it.each([
      ["the shelf with its lever", 0],
      ["its other shelf", 1],
    ])(
      "walks each team over %s and off its inner edge to the crown, gates shut, within 10 % of the other, in under 25 s",
      (_, which) => {
        const walks = overShelf(which);
        within(walks, 0.1);
        under(walks, 25);
      },
    );

    it("keeps each team's four routes to the crown within 15 % of each other", () => {
      const routes = [
        toOwn(map, [crown, crown], 3, (team) => only(...undercroft(team))),
        toOwn(shut, [crown, crown], 3, (team) => only(...ledge(team))),
        overShelf(0),
        overShelf(1),
      ];
      for (const team of [0, 1]) {
        const walks = routes.map((walk) => walk[team] ?? 0);
        expect((Math.max(...walks) - Math.min(...walks)) / Math.max(...walks)).toBeLessThanOrEqual(
          0.15,
        );
      }
    });

    it.each([
      [
        "the near rope bridge",
        (team: number) => only(shelfStair(team, 1), shelfStair(1 - team, 0)),
      ],
      ["the far rope bridge", (team: number) => only(shelfStair(team, 0), shelfStair(1 - team, 1))],
      [
        "the middle, over both mid ledges",
        (team: number) => only(...ledge(team), ...ledge(1 - team)),
      ],
    ])(
      "walks each team to the foe's ghost-spawn by %s, gates shut, within 10 % of the other",
      (_, route) => {
        const walks = toOwn(shut, foes, 1, route);
        within(walks, 0.1);
        under(walks, 40);
      },
    );

    it("walks each team from its ghost-spawn to the crown, and from its spawn to its ghost-spawn, within 10 % of the other", () => {
      const fromGhost = toOwn(from(map, ghosts), [crown, crown], 3, () => ({ through: [] }));
      within(fromGhost, 0.1);
      under(fromGhost, 25);
      within(
        walksTo(map, ghosts[0] ?? crown, 1)
          .slice(0, 1)
          .concat(walksTo(map, ghosts[1] ?? crown, 1).slice(1)),
        0.1,
      );
    });

    it("gives the teams high ground within 25 % of each other, the crown the highest deck", () => {
      within(highGround(map), 0.25);
      const top = Math.max(...map.decks.map(({ layer }) => layer));
      expect(map.decks.filter(({ layer }) => layer === top).map(({ id }) => id)).toEqual(["crown"]);
    }, 60_000);
  });

  // Threefold Keep (#3443): one piece turned by 120° for three teams, its stairs fitted anew to each
  // team's axis, so proven by numbers for all three. Every route ends on the altar, up on the tower.
  describe("Threefold Keep", () => {
    const map = loadMap("threefold-keep");
    const shut: MapData = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const altar = { x: 2500, y: 2200 };
    const teams = ["north", "south-east", "south-west"];
    const wallWalks = teams.flatMap((team) => [
      `${team}-wall-walk-left-stair`,
      `${team}-wall-walk-right-stair`,
    ]);
    const gateSteps = teams.map((team) => `${team}-gate-outer-steps`);
    const within = (walks: readonly number[], share: number): void => {
      expect(Math.min(...walks)).toBeGreaterThan(0);
      expect((Math.max(...walks) - Math.min(...walks)) / Math.max(...walks)).toBeLessThanOrEqual(
        share,
      );
    };
    /** Up one of its wall-walk's stairs, every other way onto the wall-walk shut. */
    const wallWalk = (side: string) => (team: number) => {
      const stair = `${teams[team] ?? ""}-wall-walk-${side}-stair`;
      return { through: [stair], shut: wallWalks.filter((each) => each !== stair) };
    };
    const gate = (team: number): Route => ({
      through: [gateSteps[team] ?? ""],
      shut: [...wallWalks, "undercroft-stair"],
    });
    const undercroft = (): Route => ({
      through: ["undercroft-stair"],
      shut: [...wallWalks, ...gateSteps],
    });
    const seconds = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;

    it.each([
      ["its gate", map, gate],
      ["its wall-walk's left stair", shut, wallWalk("left")],
      ["its wall-walk's right stair", shut, wallWalk("right")],
      ["the undercroft", map, undercroft],
    ] as const)(
      "walks each team to the altar by %s within 10 % of the others, in under 25 s",
      (_, on, route) => {
        const walks = walksByRoute(on, altar, 3, route);
        within(walks, 0.1);
        for (const walk of walks) expect(walk / seconds).toBeLessThan(25);
      },
    );

    it("keeps both wall-walk routes with every gate shut, the gates and the undercroft shut with them", () => {
      expect(() => walksByRoute(shut, altar, 3, gate)).toThrow(/cannot reach/);
      expect(() => walksByRoute(shut, altar, 3, undercroft)).toThrow(/cannot reach/);
    });

    it("keeps the walks within 10 % as loaded, and with the gates open and the palisades broken", () => {
      within(walksTo(shut, altar, 3), 0.1);
      const broken = (map.breakables ?? []).map(({ id }) => id);
      within(walksByRoute(map, altar, 3, { through: [], broken }), 0.1);
    });

    it("brings each team to the tower's rim on its side within 25 % of the others", () => {
      const rim = (team: number) => {
        const angle = ((-90 + 120 * team) * Math.PI) / 180;
        return { x: altar.x + 420 * Math.cos(angle), y: altar.y + 420 * Math.sin(angle) };
      };
      within(
        [0, 1, 2].map((team) => walksTo(shut, rim(team), 2)[team] ?? 0),
        0.25,
      );
    }, 60_000);

    // #3688: the undercroft's bay cut into the hill's east side left team 1 a 66 px strip
    // beside the tower on its way to the east stair, where team 2's way to the west was open.
    it.each(["east", "south", "west"])(
      "brings each team up its ward stair and over the hill to the tower's %s stair, two bodies abreast all the way",
      (tower) => {
        const towers = ["east", "south", "west"];
        const wards = teams.map((team) => `${team}-ward-stair`);
        const route = (team: number): Route => ({
          through: [wards[team] ?? "", `tower-${tower}-stair`],
          shut: [
            ...wallWalks,
            "undercroft-stair",
            ...wards.filter((_, other) => other !== team),
            ...towers.filter((other) => other !== tower).map((other) => `tower-${other}-stair`),
          ],
        });
        for (const { width } of narrowestWalks(map, altar, 3, route))
          expect(width).toBeGreaterThanOrEqual(160);
      },
      60_000,
    );
  });

  it("counts no high ground on a map without decks", () => {
    expect(highGround({ ...loadMap("arena-canyon"), decks: [] })).toEqual([0, 0]);
  });
});

describe("the width of each team's way in (#3688)", () => {
  /** Where a map without a shared objective is fought over: the point its walk tests walk to. */
  const FOUGHT_OVER: Readonly<Record<string, { readonly at: Vec2; readonly layer: number }>> = {
    "ashen-courtyard": { at: { x: 2320, y: 2000 }, layer: 0 },
    "canthan-terraces": { at: { x: 1200, y: 1050 }, layer: 1 },
    "cinder-sanctum": { at: { x: 2812, y: 1400 }, layer: 3 },
    "elonian-plateau": { at: { x: 2270, y: 820 }, layer: 2 },
    "hollow-deep": { at: { x: 3100, y: 1200 }, layer: 3 },
    "moss-vale": { at: { x: 2500, y: 1300 }, layer: 2 },
    "shiverpeak-pass": { at: { x: 2635, y: 1260 }, layer: 2 },
    "sunken-bastion": { at: { x: 1350, y: 905 }, layer: 2 },
  };
  /**
   * The maps whose teams' narrowest ways in were uneven when #3688 measured
   * them, each with the card that fixes it. One that is fixed leaves this list.
   */
  const UNEVEN: Readonly<Record<string, number>> = {
    "hall-of-heroes-capture": 3442,
    "hall-of-heroes-king": 3442,
    "hall-of-heroes-relic": 3442,
  };

  /** Where `map` is fought over: its own point, else its shared objective nearest the centre, else its centre. */
  const foughtOver = (map: MapData): { readonly at: Vec2; readonly layer: number } => {
    const own = FOUGHT_OVER[map.id];
    if (own !== undefined) return own;
    const centre = vec2(map.width / 2, map.height / 2);
    const away = (point: Vec2): number => Math.hypot(point.x - centre.x, point.y - centre.y);
    const [shared] = map.objectives
      .flatMap((objective) =>
        "team" in objective || !("position" in objective)
          ? []
          : [{ at: objective.position, layer: objective.layer }],
      )
      .sort((a, b) => away(a.at) - away(b.at));
    return shared ?? { at: centre, layer: map.groundLayer };
  };

  it.each(loadAllMaps().map((map) => [map.id, map] as const))(
    "%s: the teams' narrowest ways to where the map is fought over are within 25 % of each other",
    (id, map) => {
      const { at, layer } = foughtOver(map);
      const widths = narrowestWalks(map, at, layer).map(({ width }) => width);
      const spread = (Math.max(...widths) - Math.min(...widths)) / Math.max(...widths);
      // A way two bodies wide is no choke, however much wider another team's is.
      const even = spread <= 0.25 || Math.min(...widths) >= 160;
      expect(even).toBe(UNEVEN[id] === undefined);
    },
    60_000,
  );
});

describe("walks by route (#3415)", () => {
  const map = loadMap("canthan-terraces");
  const court = { x: 1200, y: 1050 };

  it("walks each team along a route through its transitions", () => {
    const walks = walksByRoute(map, court, 1, {
      through: ["paddy-steps"],
      shut: ["stair-west", "stair-east", "culvert-west-steps", "culvert-east-steps"],
    });
    expect(walks).toHaveLength(2);
    for (const walk of walks) expect(walk).toBeGreaterThan(0);
  });

  it("throws when a route is sealed", () => {
    expect(() =>
      walksByRoute(map, court, 1, {
        through: ["drain-shaft-ramp"],
        shut: [
          "stair-west",
          "stair-east",
          "paddy-steps",
          "culvert-west-steps",
          "culvert-east-steps",
        ],
      }),
    ).toThrow(
      /canthan-terraces: team 0 cannot reach \(1200,1050\) by the route through drain-shaft-ramp/,
    );
  });

  it("throws when a walk goes round a transition it should pass", () => {
    expect(() => walksByRoute(map, court, 1, { through: ["culvert-west-steps"] })).toThrow(
      /canthan-terraces: team 0 did not pass culvert-west-steps/,
    );
  });

  it("throws on an id the map lacks", () => {
    expect(() => walksByRoute(map, court, 1, { through: ["paddy-stepz"] })).toThrow(
      /canthan-terraces: no paddy-stepz on the map/,
    );
    expect(() =>
      walksByRoute(map, court, 1, { through: ["paddy-steps"], broken: ["mud-brick"] }),
    ).toThrow(/no mud-brick on the map/);
  });
});

describe("a seated bot (#3344)", () => {
  it("stands on its spawn's layer", () => {
    const map = loadMap("arena-canyon");
    const build = STARTER_BUILDS[0];
    if (build === undefined) {
      throw new Error("no built-in builds");
    }
    const onRim = { position: vec2(1400, 400), layer: 2 };
    const sim = new MatchSimulation({
      seed: "seated",
      matchRules: mapMatchRules(map, map.mode),
      teamCount: map.teams,
      ...mapSimulationFields(map, map.teams),
      participants: [playBuildBot(build, "rim", 0, onRim, 0)],
    });
    expect(map.groundLayer).not.toBe(onRim.layer);
    expect(sim.get("rim")?.layer).toBe(onRim.layer);
  });
});

describe("the balance bench's seeds (#3694)", () => {
  it("spreads a short run over 0..99, plays 0..99 at 100, and repeats none past it", () => {
    expect(benchSeeds(20)).toEqual(Array.from({ length: 20 }, (_, i) => i * 5));
    expect(seedStride(20)).toBe(5);
    expect(benchSeeds(100)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(seedStride(100)).toBe(1);
    const seven = benchSeeds(7);
    expect(seven).toHaveLength(7);
    expect(seven).toEqual([...new Set(seven)].sort((a, b) => a - b));
    expect(seven.every((seed) => seed >= 0 && seed <= 99)).toBe(true);
    expect(benchSeeds(120)).toEqual(Array.from({ length: 120 }, (_, i) => i));
  });
});

describe.runIf(BENCH)("the map balance bench (#3065)", () => {
  it("plays every match of a smoke run", () => {
    const seeds = 4;
    const { wins, draws, meanSeconds, stuckShare } = runMapBalance({
      map: loadMap("arena-crossroads"),
      size: 1,
      seeds,
    });
    expect(wins).toHaveLength(2);
    expect(wins.reduce((sum, count) => sum + count, 0) + draws).toBe(seeds * 2);
    expect(meanSeconds).toBeGreaterThan(0);
    expect(stuckShare).toBeGreaterThanOrEqual(0);
    expect(stuckShare).toBeLessThanOrEqual(1);
  });

  it(
    "prints each map's table",
    () => {
      const id = process.env.BENCH_MAP ?? "all";
      const size = process.env.BENCH_SIZE;
      const seeds = Number(process.env.BENCH_SEEDS ?? 100);
      const maps = id === "all" ? loadAllMaps() : [loadMap(id)];
      const runs = maps.flatMap((map) =>
        (size === undefined ? map.teamSizes : [Number(size)]).map((perTeam) => ({
          map,
          perTeam,
          balance: runMapBalance({ map, size: perTeam, seeds }),
        })),
      );
      const rows = runs.map(({ map, perTeam, balance }) => {
        const verdict = balanceVerdict(balance);
        return [
          map.id,
          `${String(perTeam)}v${String(perTeam)}`,
          String(seeds * 2),
          balance.wins.join(" / "),
          String(balance.draws),
          balance.meanSeconds.toFixed(0),
          percent(balance.stuckShare),
          percent(balance.apartShare),
          verdict.pass ? "PASS" : `FAIL: ${verdict.reason}`,
        ];
      });
      const header = [
        "map",
        "size",
        `matches (${String(seeds)} seeds, stride ${String(seedStride(seeds))})`,
        "wins by team",
        "draws",
        "mean s",
        "stuck %",
        "apart %",
        "verdict",
      ];
      if (process.env.BENCH_STUCK !== undefined) {
        for (const { map, perTeam, balance } of runs) {
          const worst = balance.stuckCells
            .map((c) => `${String(c.x)},${String(c.y)}@${String(c.layer)} ${c.seconds.toFixed(0)}`)
            .join("; ");
          console.log(
            `${map.id} ${String(perTeam)}v${String(perTeam)} stuck cells: ${worst === "" ? "-" : worst}`,
          );
        }
      }
      console.log(
        [header, header.map(() => "---"), ...rows]
          .map((row) => `| ${row.join(" | ")} |`)
          .join("\n"),
      );
      // The CI gate on pull requests (#3711); the table above is printed either way.
      if (process.env.BENCH_GATE !== undefined) {
        const failing = failingRows(
          runs.map(({ map, perTeam, balance }) => ({
            map: map.id,
            size: perTeam,
            verdict: balanceVerdict(balance),
          })),
        );
        expect(failing).toEqual([]);
      }
    },
    // Every map at every size: hours, not minutes.
    24 * 3_600_000,
  );

  it(
    "wins Scarred Earth 8v8 as often from the east as from the west (#3596)",
    () => {
      const map = loadMap("scarred-earth");
      const seeds = SIDE_SEEDS;
      const asSeated = runMapBalance({ map, size: 8, seeds });
      const swapped = runMapBalance({ map, size: 8, seeds, swapSides: true });
      // Team 0 is seated west, then east: the same teams, so only the side differs.
      const west = (asSeated.wins[0] ?? 0) + (swapped.wins[1] ?? 0);
      const east = (asSeated.wins[1] ?? 0) + (swapped.wins[0] ?? 0);
      const bySide = {
        ...asSeated,
        wins: [west, east],
        draws: asSeated.draws + swapped.draws,
      };
      console.log(`scarred-earth 8v8 by side, west / east: ${String(west)} / ${String(east)}`);
      expect(balanceVerdict(bySide)).toEqual({ pass: true });
    },
    3 * 3_600_000,
  );
});
