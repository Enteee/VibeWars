/**
 * Splits the e2e suite over CI shards by recorded duration (#1883).
 *
 * Playwright's own `--shard` splits by test count. The suite is
 * `fullyParallel` with one worker, and its tests range from one second to
 * a minute, so the shards ran from 210 s to 550 s. This lists the tests,
 * weighs each by the committed `e2e-durations.json`, packs them longest
 * first into the lightest shard, and runs only this shard's tests, each as
 * a `file:line` filter. The listing is current by construction; only the
 * weights can go stale, and a stale weight makes a shard slower, never a
 * test missing: every test lands in exactly one shard.
 *
 * Usage:
 *   node scripts/ci/shard-e2e.mjs <shard> <total> [playwright args...]   runs the shard
 *   node scripts/ci/shard-e2e.mjs --table < list-reporter-output         prints a durations table
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DURATIONS_URL = new URL("./e2e-durations.json", import.meta.url);

/**
 * @typedef {{ file: string, line: number, key: string }} Test
 * @typedef {{ title: string, file: string, line: number }} Spec
 * @typedef {{ title?: string, specs?: Spec[], suites?: Suite[] }} Suite
 */

/**
 * Flatten Playwright's `--list --reporter=json` into tests. Tests that share
 * a `file:line` (a loop of `test()` calls) cannot be told apart by a line
 * filter, so they form one unit.
 * @param {string} reportJson
 * @param {string} [testDir]
 * @returns {Test[]}
 */
export const listTests = (reportJson, testDir = "e2e") => {
  /** @type {unknown} */
  const parsed = JSON.parse(reportJson);
  const report = /** @type {{ suites?: Suite[] }} */ (parsed);
  /** @type {Test[]} */
  const tests = [];
  /**
   * @param {Suite} suite
   * @param {string[]} path
   */
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? []) {
      const file = `${testDir}/${spec.file}`;
      tests.push({
        file,
        line: spec.line,
        key: [file, ...path, spec.title].join(" › "),
      });
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title ?? ""]);
  };
  for (const fileSuite of report.suites ?? []) walk(fileSuite, []);
  return tests;
};

/**
 * Pack units longest first into the lightest shard. Returns the filters
 * (`file:line`) of one shard, 1-based.
 * @param {Test[]} tests
 * @param {Record<string, number>} durations seconds by test key
 * @param {number} shard
 * @param {number} total
 */
export const shardFilters = (tests, durations, shard, total) => {
  if (
    !Number.isInteger(total) ||
    total < 1 ||
    !Number.isInteger(shard) ||
    shard < 1 ||
    shard > total
  ) {
    throw new Error(`shard ${String(shard)}/${String(total)} is not a shard`);
  }
  const known = Object.values(durations).sort((a, b) => a - b);
  const median = known.length === 0 ? 1 : (known[Math.floor(known.length / 2)] ?? 1);
  /** @type {Map<string, { filter: string, weight: number }>} */
  const units = new Map();
  for (const test of tests) {
    const filter = `${test.file}:${String(test.line)}`;
    const unit = units.get(filter) ?? { filter, weight: 0 };
    unit.weight += durations[test.key] ?? median;
    units.set(filter, unit);
  }
  const sorted = [...units.values()].sort(
    (a, b) => b.weight - a.weight || a.filter.localeCompare(b.filter),
  );
  const shards = Array.from({ length: total }, () => ({
    load: 0,
    filters: /** @type {string[]} */ ([]),
  }));
  for (const unit of sorted) {
    const lightest = shards.reduce((a, b) => (b.load < a.load ? b : a));
    lightest.load += unit.weight;
    lightest.filters.push(unit.filter);
  }
  return /** @type {{ load: number, filters: string[] }} */ (shards[shard - 1]).filters;
};

/**
 * A durations table from Playwright's `list` reporter output: the lines
 * `✓  1 [chromium] › e2e/a.spec.ts:12:1 › title (3.2s)`.
 * @param {string} listOutput
 * @returns {Record<string, number>}
 */
export const tableFromListOutput = (listOutput) => {
  /** @type {Record<string, number>} */
  const table = {};
  for (const line of listOutput.split("\n")) {
    const m =
      /\[chromium\] › (e2e\/[^:]+\.spec\.ts):\d+:\d+ › (.*) \((\d+(?:\.\d+)?)(ms|s|m)\)$/.exec(
        line,
      );
    if (m === null) continue;
    const seconds = Number(m[3]) * { ms: 0.001, s: 1, m: 60 }[/** @type {"ms"|"s"|"m"} */ (m[4])];
    const key = `${String(m[1])} › ${String(m[2])}`;
    table[key] = Math.round(((table[key] ?? 0) + seconds) * 10) / 10;
  }
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [first, second, ...rest] = process.argv.slice(2);
  if (first === "--table") {
    process.stdout.write(
      `${JSON.stringify(tableFromListOutput(fs.readFileSync(0, "utf8")), null, 2)}\n`,
    );
  } else {
    const listing = spawnSync("pnpm", ["exec", "playwright", "test", "--list", "--reporter=json"], {
      encoding: "utf8",
      maxBuffer: 1 << 26,
    });
    if (listing.status !== 0) throw new Error(`playwright --list failed: ${listing.stderr}`);
    /** @type {unknown} */
    const table = JSON.parse(fs.readFileSync(DURATIONS_URL, "utf8"));
    const durations = /** @type {Record<string, number>} */ (table);
    const filters = shardFilters(
      listTests(listing.stdout),
      durations,
      Number(first),
      Number(second),
    );
    console.log(`shard ${String(first)}/${String(second)}: ${String(filters.length)} test groups`);
    const run = spawnSync("pnpm", ["exec", "playwright", "test", ...filters, ...rest], {
      stdio: "inherit",
    });
    process.exit(run.status ?? 1);
  }
}
