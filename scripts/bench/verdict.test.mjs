import { describe, expect, it } from "vitest";

import { verdict } from "./verdict.mjs";

/** @param {number[]} p50s */
const maps = (...p50s) => p50s.map((p50, i) => ({ mapId: `m${String(i)}`, p50 }));

describe("verdict", () => {
  it("fails the bracket that straddles a drop, and judges the others against their own mean", () => {
    const result = verdict({
      windows: [81.4, 79.3, 62.1, 62.9],
      maps: maps(100, 100, 100),
      maxRatio: 3,
      maxSpread: 0.2,
    });
    expect(result[0]?.base).toBeCloseTo(80.35);
    expect(result[2]?.base).toBeCloseTo(62.5);
    expect(result[0]?.failures).toEqual([]);
    expect(result[1]?.failures[0]).toMatch(/unstable around m1 .*spread 24 % > 20 %/);
    expect(result[2]?.failures).toEqual([]);
  });

  it("passes a drift whose every step is under the threshold", () => {
    const result = verdict({
      windows: [80, 75, 70, 66],
      maps: maps(100, 100, 100),
      maxRatio: 3,
      maxSpread: 0.2,
    });
    expect(result.flatMap((r) => r.failures)).toEqual([]);
  });

  it("fails a map at 3.01× its bracket and passes it at 2.99×", () => {
    const run = (/** @type {number} */ p50) =>
      verdict({ windows: [100, 100], maps: maps(p50), maxRatio: 3, maxSpread: 0.2 });
    expect(run(301)[0]?.failures[0]).toMatch(/3\.01×/);
    expect(run(299)[0]?.failures).toEqual([]);
  });

  it("judges a single map against its one bracket", () => {
    const [only] = verdict({
      windows: [60, 80],
      maps: maps(140),
      maxRatio: undefined,
      maxSpread: 0.3,
    });
    expect(only?.base).toBe(70);
    expect(only?.ratio).toBe(2);
    expect(only?.failures).toEqual([]);
  });

  it("refuses windows that do not bracket the maps", () => {
    expect(() =>
      verdict({ windows: [1, 2], maps: maps(1, 2), maxRatio: 3, maxSpread: 0.2 }),
    ).toThrow();
  });
});
