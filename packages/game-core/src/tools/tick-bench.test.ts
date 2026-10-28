import { describe, expect, it } from "vitest";

import { DENSE_FIELD, runTickBench, tickStats, type BenchScenario } from "./tick-bench.js";

/**
 * The tick bench (#542). Always a 40-tick smoke run; with `BENCH_TICKS`
 * set (`pnpm run bench:ticks`), that many, and the numbers printed for
 * ticks after the first 50, which hold the JIT's warm-up. No timing
 * assertion: CI machines vary, and a timing gate would flake.
 */

// game-core has no Node or DOM types (ADR-0001); the test runner has all three.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
declare const performance: { now(): number };
declare const console: { log(message: string): void };

const now = (): number => performance.now();

const WARM_UP = 50;

describe("the tick bench (#542)", () => {
  it.each<[BenchScenario, number]>([
    ["fight", 16],
    ["follow", 32],
  ])("runs the dense field, 252 wall segments: %s, and all %i walkers move", (scenario, count) => {
    expect(DENSE_FIELD.walls).toHaveLength(252);
    const { tickMs, moved } = runTickBench({
      ticks: 40,
      seed: "bench",
      now,
      field: DENSE_FIELD,
      scenario,
    });
    expect(tickMs).toHaveLength(40);
    expect(moved.size).toBe(count);
    for (const [id, { from, to }] of moved) {
      expect(Math.hypot(to.x - from.x, to.y - from.y), id).toBeGreaterThan(0);
    }
  });

  // An arena's own bench is game-maps' (`map-bench.test.ts`, #444): game-core has no maps.
  const ticks = Number(process.env.BENCH_TICKS ?? "0");
  const dense = (process.env.BENCH_MAP ?? "dense") === "dense";
  // `BENCH_SCENARIO=follow`: 32 minions walking back to their owners (#1157).
  const scenario: BenchScenario = process.env.BENCH_SCENARIO === "follow" ? "follow" : "fight";
  it.runIf(ticks > WARM_UP && dense)(`times ${String(ticks)} ticks, ${scenario}`, () => {
    const { tickMs } = runTickBench({ ticks, seed: "bench", now, field: DENSE_FIELD, scenario });
    const { p50, p95, max } = tickStats(tickMs.slice(WARM_UP));
    console.log(
      `ticks ${String(WARM_UP)}–${String(ticks)}: p50 ${p50.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, max ${max.toFixed(3)} ms`,
    );
    expect(tickMs).toHaveLength(ticks);
  });
});
