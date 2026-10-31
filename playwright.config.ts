import { spawnSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE, E2E_BUILD } from "./e2e/helpers/base.js";

/**
 * Browser tests (brief §31 "Browser tests").
 *
 * These drive a real browser against the real static build: create a
 * character, host a lobby, join it from a second page, start a match,
 * move, and activate a skill. Every page of a test shares one
 * `BrowserContext`, since a BroadcastChannel reaches nothing outside it:
 * open them with `openPeers` (`e2e/helpers/peers.ts`). Everything below
 * the UI already has headless coverage — what only a browser can tell us
 * is whether the pieces are actually wired to each other.
 *
 * The browser is the one the machine already has rather than a
 * Playwright-managed download: this environment cannot fetch Playwright's
 * browser bundles (see ADR-0007 for the same constraint on devenv), and a
 * system Chromium exercises the same engine. `VIBEWARS_CHROMIUM` overrides
 * the path if yours lives somewhere else.
 */

const PORT = Number(process.env.VIBEWARS_E2E_PORT ?? 2577);
/**
 * The static GitHub Pages build (#103), served by `vite preview` under the
 * sub-path `pages.yml` deploys `next` at, with one difference: its pages
 * play over BroadcastChannel rather than Trystero (#403), so they find
 * each other with no relay and no network. It builds into its own
 * directory, so a dev build in `apps/web/dist` stays untouched.
 *
 * `baseURL` ends in the sub-path, so every `goto` is relative: `./`.
 */
const BASE = E2E_BASE;
const BASE_URL = `http://127.0.0.1:${String(PORT)}${BASE}`;
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
  // Playwright shards by test only when tests may run in parallel, else by
  // file, and training.spec.ts alone is 11 minutes (#1797). One worker still
  // runs a shard's tests one after another.
  fullyParallel: true,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI === "true" ? [["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // --no-sandbox because the sandbox this runs in cannot nest Chromium's
    // own. Acceptable here: the only page ever loaded is our own client.
    launchOptions: { executablePath, args: ["--no-sandbox"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "pnpm --filter @vibewars/web exec vite build --outDir dist-static && " +
      `pnpm --filter @vibewars/web exec vite preview --outDir dist-static ` +
      `--host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    // Its own build id, served in its own `build.json`, so no spec but
    // the one that swaps it sees a newer build (#1268).
    env: { VIBEWARS_BASE: BASE, VITE_VIBEWARS_TRANSPORT: "broadcast", VIBEWARS_BUILD: E2E_BUILD },
    reuseExistingServer: false,
    // It builds the client first, which takes far longer than a start.
    timeout: 180_000,
  },
});
