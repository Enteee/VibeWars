import { describe, expect, it } from "vitest";

import { EXIT_TOO_NOISY, exitCode, settled, verdict } from "./verdict.mjs";

/**
 * Maps in a row, each bracketed by the windows either side of it.
 * @param {number[]} windows
 * @param {number[]} p50s
 */
const bracketed = (windows, p50s) =>
  p50s.map((p50, i) => ({
    mapId: `m${String(i)}`,
    p50,
    before: windows[i] ?? NaN,
    after: windows[i + 1] ?? NaN,
  }));
/** @param {number[]} p50s */
const maps = (...p50s) => bracketed([100, 100], p50s);

describe("verdict", () => {
  it("calls noisy the bracket that straddles a drop, and judges the others against their own mean", () => {
    const result = verdict({
      maps: bracketed([81.4, 79.3, 62.1, 62.9], [100, 100, 100]),
      maxRatio: 3,
      maxSpread: 0.2,
    });
    expect(result[0]?.base).toBeCloseTo(80.35);
    expect(result[2]?.base).toBeCloseTo(62.5);
    expect(result[0]?.noisy).toBeUndefined();
    expect(result[1]?.noisy).toMatch(/unstable around m1 .*spread 24 % > 20 %/);
    expect(result[2]?.noisy).toBeUndefined();
    expect(result.flatMap((r) => r.failures)).toEqual([]);
  });

  it("passes a drift whose every step is under the threshold", () => {
    const result = verdict({
      maps: bracketed([80, 75, 70, 66], [100, 100, 100]),
      maxRatio: 3,
      maxSpread: 0.2,
    });
    expect(
      result.flatMap((r) => [...r.failures, ...(r.noisy === undefined ? [] : [r.noisy])]),
    ).toEqual([]);
  });

  it("fails a map at 3.01× its bracket and passes it at 2.99×", () => {
    const run = (/** @type {number} */ p50) =>
      verdict({ maps: maps(p50), maxRatio: 3, maxSpread: 0.2 });
    expect(run(301)[0]?.failures[0]).toMatch(/3\.01×/);
    expect(run(299)[0]?.failures).toEqual([]);
  });

  it("judges a single map against its one bracket", () => {
    const [only] = verdict({
      maps: bracketed([60, 80], [140]),
      maxRatio: undefined,
      maxSpread: 0.3,
    });
    expect(only?.base).toBe(70);
    expect(only?.ratio).toBe(2);
    expect(only?.failures).toEqual([]);
  });

  it("reports a breach on a stable bracket without calling it noise", () => {
    const [only] = verdict({ maps: maps(400), maxRatio: 3, maxSpread: 0.2 });
    expect(only?.failures).toHaveLength(1);
    expect(only?.noisy).toBeUndefined();
  });
});

describe("exitCode", () => {
  it("exits 0 clean, 1 on a breach, 75 on noise alone", () => {
    expect(exitCode({ breach: false, noisy: false })).toBe(0);
    expect(exitCode({ breach: true, noisy: false })).toBe(1);
    expect(exitCode({ breach: false, noisy: true })).toBe(EXIT_TOO_NOISY);
    expect(EXIT_TOO_NOISY).toBe(75);
  });

  it("lets a breach win over noise", () => {
    expect(exitCode({ breach: true, noisy: true })).toBe(1);
  });
});

describe("ceilings", () => {
  const ceilings = [{ mapId: "m0", ratio: 4, issue: 3254 }];
  /** @param {number} p50 */
  const run = (p50) => verdict({ maps: maps(p50), maxRatio: 3, maxSpread: 0.2, ceilings })[0];

  it("gates a listed map at its ceiling", () => {
    expect(run(390)?.failures).toEqual([]);
    expect(run(401)?.failures[0]).toMatch(/4\.01× .*over 4× \(ceiling, #3254\)/);
  });

  it("fails a listed map at or under the default / 1.25 as stale (#3255)", () => {
    expect(run(240)?.failures[0]).toMatch(
      /m0 is under 2\.40× \(3× \/ 1\.25\): delete its BENCH_CEILINGS entry \(#3254\)/,
    );
  });

  it("keeps a listed map just under the default, within runner noise (#3255)", () => {
    expect(run(241)?.failures).toEqual([]);
    expect(run(290)?.failures).toEqual([]);
  });

  it("leaves other maps at the default", () => {
    const [other] = verdict({
      maps: [{ mapId: "m1", p50: 350, before: 100, after: 100 }],
      maxRatio: 3,
      maxSpread: 0.2,
      ceilings,
    });
    expect(other?.failures[0]).toMatch(/over 3×/);
  });
});

describe("settled", () => {
  const rule = { minMs: 20_000, tol: 0.05 };
  /** @param {number} n */
  const every = (n, step = 2500) => Array.from({ length: n }, (_, i) => (i + 1) * step);

  it("does not settle on the slow plateau before the minimum time", () => {
    expect(settled([81, 79, 62, 63], every(4), rule)).toBeUndefined();
  });

  it("settles on the first agreeing pair after the minimum time", () => {
    const windows = [81, 79, 62, 63, 60, 60, 60, 60, 60, 60];
    expect(settled(windows, every(10), rule)).toBe(8);
  });

  it("settles a flat run at the first window past the minimum", () => {
    expect(settled(Array(10).fill(60), every(10), rule)).toBe(8);
  });

  it("never settles on a steady fall", () => {
    expect(settled([72, 60, 50, 42, 35, 30, 25, 21, 18, 15], every(10), rule)).toBeUndefined();
  });
});
