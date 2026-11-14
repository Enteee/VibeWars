import { describe, expect, it } from "vitest";

import { loadAllMaps, loadMap } from "../loader.js";
import {
  balanceVerdict,
  highGround,
  runMapBalance,
  walksToCentre,
  type MapBalanceResult,
} from "./map-balance.js";

/**
 * The map balance bench (#3065). The verdict always; with `BENCH_BALANCE`
 * set (`pnpm run bench:balance`), a smoke run, then the bench on
 * `BENCH_MAP` (an id, or `all`, the default) at `BENCH_SIZE` (every size
 * the map seats if unset), `BENCH_SEEDS` seeds each (100 by default), and
 * a table printed to paste into the map's PR.
 */

const BENCH = process.env.BENCH_BALANCE !== undefined;

function result(wins: readonly number[], draws = 0): MapBalanceResult {
  return { wins, draws, meanSeconds: 60 };
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

  it("counts no high ground on a map without decks", () => {
    expect(highGround({ ...loadMap("arena-canyon"), decks: [] })).toEqual([0, 0]);
  });
});

describe.runIf(BENCH)("the map balance bench (#3065)", () => {
  it("plays every match of a smoke run", () => {
    const seeds = 4;
    const { wins, draws, meanSeconds } = runMapBalance({
      map: loadMap("arena-crossroads"),
      size: 1,
      seeds,
    });
    expect(wins).toHaveLength(2);
    expect(wins.reduce((sum, count) => sum + count, 0) + draws).toBe(seeds * 2);
    expect(meanSeconds).toBeGreaterThan(0);
  });

  it(
    "prints each map's table",
    () => {
      const id = process.env.BENCH_MAP ?? "all";
      const size = process.env.BENCH_SIZE;
      const seeds = Number(process.env.BENCH_SEEDS ?? 100);
      const maps = id === "all" ? loadAllMaps() : [loadMap(id)];
      const rows = maps.flatMap((map) =>
        (size === undefined ? map.teamSizes : [Number(size)]).map((perTeam) => {
          const balance = runMapBalance({ map, size: perTeam, seeds });
          const verdict = balanceVerdict(balance);
          return [
            map.id,
            `${String(perTeam)}v${String(perTeam)}`,
            String(seeds * 2),
            balance.wins.join(" / "),
            String(balance.draws),
            balance.meanSeconds.toFixed(0),
            verdict.pass ? "PASS" : `FAIL: ${verdict.reason}`,
          ];
        }),
      );
      const header = ["map", "size", "matches", "wins by team", "draws", "mean s", "verdict"];
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
