import { describe, expect, it } from "vitest";

import { runBotBench, runMirrorBench } from "./bot-bench.js";

/**
 * The bot bench (#2545). Always a one-fight smoke run; with `BENCH_BOTS`
 * set (`pnpm run bench:bots`), the full bench: 4v4 and 8v8, 90 s a fight,
 * on two sets of 20 seeds, and the deaths printed; then team 0's wins of
 * the mirror fights on all 40 (#2624). No count is asserted: deaths are a
 * comparison with `main`, run on both, and a fair mirror is near 20/40.
 */

// game-core has no Node or DOM types (ADR-0001); the test runner has all three.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
declare const console: { log(message: string): void };

const SEED_SETS = ["abcdefghijklmnopqrst", "ABCDEFGHIJKLMNOPQRST"];

describe("the bot bench (#2545)", () => {
  it("runs a fight, the same every time", () => {
    const options = { size: 2, seeds: "a", seconds: 5 };
    expect(runBotBench(options)).toBe(runBotBench(options));
    expect(runMirrorBench(options)).toEqual(runMirrorBench(options));
  });

  it.runIf(process.env.BENCH_BOTS !== undefined)(
    "counts deaths in 4v4 and 8v8",
    () => {
      for (const seeds of SEED_SETS) {
        const counts = [4, 8].map(
          (size) =>
            `${String(size)}v${String(size)} ${String(runBotBench({ size, seeds, seconds: 90 }))}`,
        );
        console.log(`seeds ${seeds}: deaths in 90 s: ${counts.join(", ")}`);
      }
      for (const size of [4, 8]) {
        const [team0, team1] = runMirrorBench({ size, seeds: SEED_SETS.join(""), seconds: 90 });
        console.log(
          `${String(size)}v${String(size)} mirror: team 0 wins: ${String(team0)}/40, team 1: ${String(team1)}/40`,
        );
      }
    },
    // A hundred and sixty fights of 90 s each.
    3_600_000,
  );
});
