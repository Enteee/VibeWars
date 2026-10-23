import { defineConfig } from "vitest/config";

/**
 * Tests live next to the code they cover (`*.test.ts`).
 *
 * Everything that can run headlessly runs in the default Node environment.
 * Browser-dependent rendering code is exercised by Playwright instead (see
 * `docs/adr/0001-architecture.md`), not by a simulated DOM, so that the
 * simulation can never quietly grow a browser dependency.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["{apps,packages}/*/src/**/*.test.ts"],
    reporters: ["default"],
    // Networked combat tests drive a real server through multi-second
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
