import { describe, expect, it } from "vitest";

import { runBotBench } from "./bot-bench.js";

/**
 * The bot bench (#2545). Always a one-fight smoke run; with `BENCH_BOTS`
 * set (`pnpm run bench:bots`), the full bench: 4v4 and 8v8, 90 s a fight,
 * on two sets of 20 seeds, and the deaths printed. No death count is
 * asserted: it is a comparison with `main`, run on both.
 */

// game-core has no Node or DOM types (ADR-0001); the test runner has all three.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
declare const console: { log(message: string): void };

const SEED_SETS = ["abcdefghijklmnopqrst", "ABCDEFGHIJKLMNOPQRST"];

describe("the bot bench (#2545)", () => {
  it("runs a fight, the same every time", () => {
    const options = { size: 2, seeds: "a", seconds: 5 };
    expect(runBotBench(options)).toBe(runBotBench(options));
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
    },
    // Eighty fights of 90 s each.
    1_800_000,
  );
});
