import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * CPUs this process may really use. Node and vitest count the host's CPUs,
 * but a container's cgroup quota (`cpu.max`) can be far lower: the company
 * runners have 2, on a many-core host, and vitest's default of one worker
 * per host CPU made them 5x slower than hosted CI (#2774).
 */
function usableCpus(): number {
  const host = availableParallelism();
  try {
    const [quota, period] = readFileSync("/sys/fs/cgroup/cpu.max", "utf8").trim().split(" ");
    if (quota !== "max") {
      return Math.max(1, Math.min(host, Math.ceil(Number(quota) / Number(period))));
    }
  } catch {
    // No cgroup v2 quota file: the host count stands.
  }
  return host;
}

/**
 * Tests live next to the code they cover (`*.test.ts`).
 *
 * Everything that can run headlessly runs in the default Node environment.
 * Browser-dependent rendering code is exercised by the Playwright suite
 * in `e2e/` instead, not by a simulated DOM, so that the simulation can
 * never quietly grow a browser dependency.
 */
export default defineConfig({
  // The music checker (#369) imports @strudel/core in Node, which needs a
  // stand-in for @kabelsalat/web. Vitest only applies an alias to modules it
  // transforms, so @strudel/* is inlined. Node-only: the browser build keeps
  // the real package.
  resolve: {
    alias: {
      "@kabelsalat/web": fileURLToPath(
        new URL("./apps/web/scripts/music/shims/kabelsalat-web.mjs", import.meta.url),
      ),
    },
  },
  test: {
    server: { deps: { inline: [/@strudel\//] } },
    environment: "node",
    maxWorkers: usableCpus(),
    // `scripts/` is plain JSDoc-typed .mjs rather than a workspace package,
    // so it needs its own entry: the claude-bot Telegram bridge keeps its
    // wire contract there (scripts/bots/protocol.mjs) precisely so it can be
    // tested without a live bot token.
    include: [
      "{apps,packages}/*/src/**/*.test.ts",
      // The client's build plugins (#1242).
      "apps/web/plugins/**/*.test.ts",
      "scripts/**/*.test.mjs",
      // The repository's own lint rules (#2648).
      "eslint/**/*.test.mjs",
    ],
    reporters: ["default"],
    // Networked combat tests drive a whole session through multi-second
    // cast and recharge timers, so the 5s default is too tight for them.
    // Pure unit tests are unaffected — they finish in milliseconds either
    // way, and a generous ceiling only changes how long a genuine hang
    // takes to surface.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["{apps,packages}/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
    },
  },
});
