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

  // Ashen Courtyard (#3287): the centre is in the sunken well court, so the walks end on its floor.
  // The spawns and timber walls mirror each other about the well, so the walks are within 5 %.
  // The west keeps the bigger tower by design: its high ground may exceed the east's by 40 %.
  describe("Ashen Courtyard", () => {
    const map = loadMap("ashen-courtyard");

    it("walks each team from its spawn into the well court within 5 % of the other", () => {
      const [walk0 = 0, walk1 = 0] = walksTo(map, { x: 1450, y: 1250 }, 0);
      expect(walk0).toBeGreaterThan(0);
      expect(Math.abs(walk0 - walk1) / Math.max(walk0, walk1)).toBeLessThanOrEqual(0.05);
    });

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
