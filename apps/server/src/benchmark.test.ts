import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCENARIOS,
  formatResults,
  runBenchmarks,
  type Scenario,
} from "./tools/benchmark.js";

/**
 * The load benchmark (brief §26), run as a test so it cannot rot.
 *
 * A benchmark kept in a script nobody runs stops reflecting the code
 * within a sprint or two. Running it here means a change that doubles
 * tick cost fails CI on the day it lands, with the numbers attached.
 *
 * CI runs up to 8v8. 16v16 is opt-in via `VIBEWARS_BENCH_FULL=1` because
 * 32 real WebSocket clients in one process is slow and, on a loaded CI
 * box, measures the box rather than the server.
 */

const FULL = process.env.VIBEWARS_BENCH_FULL === "1";
const SCENARIOS: readonly Scenario[] = FULL
  ? DEFAULT_SCENARIOS
  : DEFAULT_SCENARIOS.filter((s) => s.label !== "16v16");

describe("load benchmark", () => {
  it("holds the tick budget at every scenario", { timeout: FULL ? 300_000 : 120_000 }, async () => {
    const results = await runBenchmarks(SCENARIOS);

    // Printed unconditionally: the point of a benchmark is the numbers,
    // and a passing test that shows nothing teaches nothing.
    console.info(`\n${formatResults(results)}\n`);

    expect(results).toHaveLength(SCENARIOS.length);

    for (const result of results) {
      // The real requirement: a tick must finish inside its own budget,
      // or the server is falling behind the clock it promised clients.
      expect(
        result.tick.p95Ms,
        `${result.label} p95 tick time exceeded the ${String(result.tick.budgetMs)}ms budget`,
      ).toBeLessThan(result.tick.budgetMs);

      // Enough ticks actually ran for the percentile to mean something.
      expect(result.tick.samples).toBeGreaterThan(20);

      // Every client is receiving state. Zero bytes would mean the
      // benchmark measured a server that was not talking to anyone.
      expect(result.bytesPerClientPerSecond).toBeGreaterThan(0);

      // Sync latency was genuinely sampled rather than silently dropped.
      expect(
        result.syncLatencyMs.samples,
        `${result.label} produced too few sync-latency samples to trust`,
      ).toBeGreaterThan(5);
    }
  });
});
