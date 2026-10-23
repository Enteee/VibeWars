import { spawnSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (brief §31 "Browser tests").
 *
 * These drive a real browser against a real server: create a character,
 * host a lobby, join it from a second browser context, start a match,
 * move, and activate a skill. Everything below the UI already has
 * headless coverage — what only a browser can tell us is whether the
 * pieces are actually wired to each other.
 *
 * The browser is the one the machine already has rather than a
 * Playwright-managed download: this environment cannot fetch Playwright's
 * browser bundles (see ADR-0007 for the same constraint on devenv), and a
 * system Chromium exercises the same engine. `VIBEWARS_CHROMIUM` overrides
 * the path if yours lives somewhere else.
 */

const PORT = Number(process.env.VIBEWARS_E2E_PORT ?? 2577);
function resolveChromium(): string {
  const override = process.env.VIBEWARS_CHROMIUM;
  if (override !== undefined && override !== "") {
    return override;
  }
  // Resolve the system browser from PATH. Playwright would otherwise look
  // for its own managed download, which this environment cannot fetch.
  const found = spawnSync(
    "sh",
    ["-c", "command -v chromium || command -v chromium-browser || command -v google-chrome"],
    { encoding: "utf8" },
  );
  const path = found.stdout.trim();
  if (path === "") {
    throw new Error("No Chromium found. Install one, or set VIBEWARS_CHROMIUM to its path.");
  }
  return path;
}

const executablePath = resolveChromium();

export default defineConfig({
  testDir: "./e2e",
  // A failing browser test that passes on a retry is a flaky test, and a
  // flaky test that CI hides is worse than no test. Retries stay at zero
  // so flakiness has to be fixed rather than absorbed.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI === "true" ? [["list"]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: "retain-on-failure",
    // --no-sandbox because the sandbox this runs in cannot nest Chromium's
    // own. Acceptable here: the only page ever loaded is our own client.
    launchOptions: { executablePath, args: ["--no-sandbox"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The real production entry point serving the real built client, so
    // these tests cannot pass against a dev-only code path.
    command: `node apps/server/dist/main.js`,
    url: `http://127.0.0.1:${String(PORT)}/healthz`,
    env: { PORT: String(PORT), HOST: "127.0.0.1" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
