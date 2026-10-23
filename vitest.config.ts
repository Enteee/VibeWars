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
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["{apps,packages}/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
    },
  },
});
