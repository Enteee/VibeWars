import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

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
    // `scripts/` is plain JSDoc-typed .mjs rather than a workspace package,
    // so it needs its own entry: the claude-bot Telegram bridge keeps its
    // wire contract there (scripts/bots/protocol.mjs) precisely so it can be
    // tested without a live bot token.
    include: ["{apps,packages}/*/src/**/*.test.ts", "scripts/**/*.test.mjs"],
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
