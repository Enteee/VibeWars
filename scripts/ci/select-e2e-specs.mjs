/**
 * Which e2e specs a pull request repeats ten times, and the guard that a
 * repeat which selected specs actually ran tests (#430).
 *
 * A spec counts if it exists at the head and the pull request added it,
 * modified it or renamed it, with or without edits. A deleted spec is left
 * out. A helper under e2e/ or playwright.config.ts does not widen the run.
 *
 * Usage:
 *   node scripts/ci/select-e2e-specs.mjs <base> [head]     prints the specs, space-separated
 *   node scripts/ci/select-e2e-specs.mjs --assert-ran <playwright-json>
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * With rename detection `--name-only` prints the new path of a rename.
 * @param {string} base
 * @param {string} [head]
 * @param {string} [cwd]
 * @returns {string[]}
 */
export const selectSpecs = (base, head = "HEAD", cwd = process.cwd()) =>
  execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--find-renames",
      "--diff-filter=AMR",
      `${base}...${head}`,
      "--",
      "e2e/*.spec.ts",
    ],
    { cwd, encoding: "utf8" },
  )
    .split("\n")
    .filter((path) => path !== "");

/**
 * Throws unless the Playwright JSON report ran at least one test. Skipped
 * tests do not count: a spec whose tests are all skipped repeated nothing.
 * @param {string} reportJson
 */
export const assertRan = (reportJson) => {
  /** @type {unknown} */
  const parsed = JSON.parse(reportJson);
  const { stats } = /** @type {{ stats?: Record<string, number> }} */ (parsed);
  const ran = (stats?.expected ?? 0) + (stats?.unexpected ?? 0) + (stats?.flaky ?? 0);
  if (ran === 0) throw new Error("the repeat selected specs but ran no tests");
  return ran;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [first, second] = process.argv.slice(2);
  if (first === "--assert-ran" && second) {
    try {
      console.log(`${String(assertRan(fs.readFileSync(second, "utf8")))} test run(s)`);
    } catch (error) {
      console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } else if (first) {
    console.log(selectSpecs(first, second).join(" "));
  } else {
    console.error("usage: select-e2e-specs.mjs <base> [head] | --assert-ran <json>");
    process.exit(2);
  }
}
