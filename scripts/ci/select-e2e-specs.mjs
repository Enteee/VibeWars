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
 *   node scripts/ci/select-e2e-specs.mjs --plan <spec>...    prints the job matrix as JSON
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
 * Test cost of a spec: its `test(` calls. Sharding by Playwright's own
 * `--shard` splits by test count and can leave a shard with no group at all
 * (#1566), so the planner packs whole specs itself. This overcounts a little
 * (a skipped or commented test), which only makes a job smaller.
 * @param {string} source
 */
export const countTests = (source) => Math.max(1, (source.match(/\btest\(/g) ?? []).length);

/**
 * Split `repeats` runs of every spec over jobs. A job runs its specs with one
 * `--repeat-each`, and holds about `budget` test runs. Every spec gets exactly
 * `repeats` runs in total across its jobs.
 * @param {Record<string, number>} weights spec -> tests in it
 * @param {number} repeats
 * @param {number} budget test runs per job
 * @param {number} maxJobs
 * @returns {{ specs: string[], repeat: number }[]}
 */
export const planJobs = (weights, repeats, budget, maxJobs) => {
  /** @type {{ spec: string, repeat: number, cost: number }[]} */
  const chunks = [];
  for (const [spec, weight] of Object.entries(weights)) {
    const per = Math.max(1, Math.min(repeats, Math.floor(budget / weight)));
    for (let left = repeats; left > 0; left -= per) {
      const repeat = Math.min(per, left);
      chunks.push({ spec, repeat, cost: weight * repeat });
    }
  }
  chunks.sort((a, b) => b.cost - a.cost || a.spec.localeCompare(b.spec));
  /** @type {{ specs: string[], repeat: number, cost: number }[]} */
  const jobs = [];
  for (const chunk of chunks) {
    const job = jobs.find(
      (j) =>
        j.repeat === chunk.repeat && j.cost + chunk.cost <= budget && !j.specs.includes(chunk.spec),
    );
    if (job === undefined) {
      jobs.push({ specs: [chunk.spec], repeat: chunk.repeat, cost: chunk.cost });
    } else {
      job.specs.push(chunk.spec);
      job.cost += chunk.cost;
    }
  }
  if (jobs.length > maxJobs) {
    throw new Error(
      `e2e-repeat: ${String(Object.keys(weights).length)} specs x ${String(repeats)} runs need ${String(jobs.length)} jobs, over the budget of ${String(maxJobs)}; split the PR.`,
    );
  }
  return jobs.map(({ specs, repeat }) => ({ specs, repeat }));
};

/** Test runs per job: PR 1542's repeat jobs ran 187 tests in 29 min (~9.7 s each, 177 timed), so 80 is ~13 min, leaving the 30 min cap its margin for setup, build and a slow runner. */
export const RUNS_PER_JOB = 80;
export const MAX_JOBS = 40;
export const REPEATS = 10;
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
  } else if (first === "--plan") {
    try {
      const weights = Object.fromEntries(
        process.argv.slice(3).map((spec) => [spec, countTests(fs.readFileSync(spec, "utf8"))]),
      );
      const jobs = planJobs(weights, REPEATS, RUNS_PER_JOB, MAX_JOBS);
      // No spec selected: one job that passes with every step skipped.
      const matrix = (jobs.length === 0 ? [{ specs: [], repeat: REPEATS }] : jobs).map(
        (job, i) => ({ job: i + 1, specs: job.specs.join(" "), repeat: job.repeat }),
      );
      console.log(JSON.stringify(matrix));
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
