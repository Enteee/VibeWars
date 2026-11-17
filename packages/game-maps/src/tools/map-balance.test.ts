import { describe, expect, it } from "vitest";

import { MatchSimulation, STARTER_BUILDS, vec2 } from "@vibewars/game-core";

import { loadAllMaps, loadMap } from "../loader.js";
import { mapMatchRules, mapSimulationFields } from "../match-fields.js";
import {
  balanceVerdict,
  highGround,
  playBuildBot,
  runMapBalance,
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

const percent = (share: number): string => (share * 100).toFixed(1);

function result(wins: readonly number[], draws = 0): MapBalanceResult {
  return { wins, draws, meanSeconds: 60, stuckShare: 0, apartShare: 0, stuckCells: [] };
}

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

  // Blackwater Ford (#3434): the centre is the storm-beacon on the mill, in the middle of the broken
  // bridge. Three ways there per team: the bridge road (its own approach's near stair), its own
  // culvert (gate open) and up the approach's far stair, and the far ford, up the far approach's
  // stair. A foe reaches a shrine by the near ford, over the bridge, or by the far ford. The walk
  // tool walks at base speed: the shallow fords' 75 % (#3463) is the bench's to weigh, not this.
  describe("Blackwater Ford", () => {
    interface Point {
      readonly x: number;
      readonly y: number;
    }
    const map = loadMap("blackwater-ford");
    const shut = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const beacon = { x: 2600, y: 1430 };
    const shrines = [
      { x: 800, y: 1000 },
      { x: 4424, y: 1784 },
    ];
    const foes = [shrines[1] ?? beacon, shrines[0] ?? beacon];
    // Each team's own near stair (bridge road) and far stair (off its culvert), west team first.
    const near = ["west-approach-south-stair", "east-approach-north-stair"];
    const far = ["west-approach-north-stair", "east-approach-south-stair"];
    const culvert = [
      ["west-culvert-south-steps", "west-culvert-north-steps"],
      ["east-culvert-north-steps", "east-culvert-south-steps"],
    ];
    const bridgeStairs = [...near, ...far];
    const culvertSteps = culvert.flat();
    const all = [...bridgeStairs, ...culvertSteps];
    const but = (...kept: readonly string[]): string[] => all.filter((id) => !kept.includes(id));
    const of = (ids: readonly string[], team: number): string => ids[team] ?? "";
    const within = ([walk0 = 0, walk1 = 0]: readonly number[], share: number): void => {
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(share);
    };
    /** `on` with each team's one spawn at `points[team]` on `layer`. */
    const from = (on: typeof map, points: readonly Point[], layer = 1): typeof map => ({
      ...on,
      spawnPoints: points.map((position, team) => ({ team, layer, position })),
    });
    /** Each team's walk to its own point of `to`, along its own route. */
    const toOwn = (
      on: typeof map,
      to: readonly Point[],
      layer: number,
      route: (team: number) => Route,
    ): number[] =>
      [0, 1].map(
        (team) =>
          walksByRoute(on, to[team] ?? beacon, layer, (each) =>
            each === team ? route(team) : { through: [] },
          )[team] ?? 0,
      );
    const sum = (...legs: readonly (readonly number[])[]): number[] =>
      [0, 1].map((team) => legs.reduce((total, leg) => total + (leg[team] ?? 0), 0));
    const toCentre: readonly (readonly [string, (team: number) => Route])[] = [
      ["the bridge road", (team) => ({ through: [of(near, team)], shut: but(of(near, team)) })],
      ["the far ford", (team) => ({ through: [of(far, 1 - team)], shut: but(of(far, 1 - team)) })],
    ];
    // The middle of each team's own culvert, west team first. The walk tool takes the shortest way,
    // and round the approach's end is shorter than under it, so a culvert is walked in two legs.
    const culverts = [
      { x: 1750, y: 1410 },
      { x: 3450, y: 1410 },
    ];
    const throughCulvert = (on: typeof map): number[] =>
      sum(
        toOwn(on, culverts, 0, (team) => ({
          through: [(culvert[team] ?? [])[0] ?? ""],
          shut: bridgeStairs,
        })),
        toOwn(from(on, culverts, 0), [beacon, beacon], 2, (team) => {
          const out = [(culvert[team] ?? [])[1] ?? "", of(far, team)];
          return { through: out, shut: but(...out) };
        }),
      );
    // The far ford, for a foe: the north ford's middle for the west team, the south ford's for the east.
    const fords = [
      { x: 2600, y: 845 },
      { x: 2600, y: 1985 },
    ];

    it.each(toCentre)(
      "walks each team from its spawn to the beacon by %s within 10 % of the other",
      (_route, route) => {
        within(walksByRoute(map, beacon, 2, route), 0.1);
      },
    );

    it("walks each team from its spawn to the beacon by its own culvert within 10 % of the other", () => {
      within(throughCulvert(map), 0.1);
    });

    it("walks each team to the beacon by the bridge road in under 25 s", () => {
      const speed = 180;
      for (const walk of walksByRoute(
        map,
        beacon,
        2,
        toCentre[0]?.[1] ?? (() => ({ through: [] })),
      )) {
        expect(walk / speed).toBeLessThan(25);
      }
    });

    it("leaves every spawn the bridge road and the far ford to the beacon with the gates shut", () => {
      for (const [, route] of toCentre) {
        within(walksByRoute(shut, beacon, 2, route), 0.1);
      }
    });

    it("walks each team to the foe's shrine by the near ford, the bridge and the far ford, gates shut, within 10 % of the other", () => {
      const ford = toOwn(shut, foes, 1, () => ({ through: [], shut: all }));
      within(ford, 0.1);
      // Over the bridge: up the team's own near stair to the beacon, down the foe's near stair.
      within(
        sum(
          toOwn(shut, [beacon, beacon], 2, (team) => ({
            through: [of(near, team)],
            shut: but(of(near, team)),
          })),
          toOwn(from(shut, [beacon, beacon], 2), foes, 1, (team) => ({
            through: [of(near, 1 - team)],
            shut: but(of(near, 1 - team)),
          })),
        ),
        0.1,
      );
      const farFord = sum(
        toOwn(shut, fords, 1, () => ({ through: [], shut: all })),
        toOwn(from(shut, fords), foes, 1, () => ({ through: [], shut: all })),
      );
      within(farFord, 0.1);
      // A way of its own, not the near ford with a step aside.
      [0, 1].forEach((team) => {
        expect(farFord[team] ?? 0).toBeGreaterThan((ford[team] ?? 0) + 150);
      });
    });

    it("walks each priest from its shrine to the beacon within 10 % of the other", () => {
      within(walksTo(from(map, shrines), beacon, 2), 0.1);
    });

    it("keeps the walks within 10 % with the gates open and the weir broken", () => {
      const broken = ["silted-weir"];
      within(walksByRoute(map, beacon, 2, { through: [], broken }), 0.1);
      within(
        toOwn(map, foes, 1, () => ({ through: [], broken })),
        0.1,
      );
    });

    it("gives the teams high ground within 25 % of each other", () => {
      within(highGround(map), 0.25);
    }, 60_000);
  });

  it("counts no high ground on a map without decks", () => {
    expect(highGround({ ...loadMap("arena-canyon"), decks: [] })).toEqual([0, 0]);
  });
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
        "matches",
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
    },
    // Every map at every size: hours, not minutes.
    24 * 3_600_000,
  );
});
