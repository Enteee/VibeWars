/**
 * Whether a pull request needs the e2e run (#1609). An asset-only change
 * skips it; the `e2e` job still starts and reports, so the required check
 * never goes missing.
 *
 * Skipped only when every changed file is one of: an icon SVG served by URL,
 * an asset generator, a doc outside docs/player (that one is bundled into
 * the client), or a top-level markdown file. An empty list is not asset-only:
 * a diff that failed must run e2e.
 *
 * Usage:
 *   node scripts/ci/e2e-needed.mjs <base> [head]   prints "true" or "false"
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** @type {RegExp[]} */
const SKIPPABLE = [
  /^apps\/web\/public\/icons\//,
  /^scripts\/assets\//,
  /^docs\/(?!player\/)/,
  /^[^/]+\.md$/,
];

/**
 * @param {string[]} files
 * @returns {boolean}
 */
export const e2eNeeded = (files) =>
  files.length === 0 || !files.every((file) => SKIPPABLE.some((re) => re.test(file)));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head = "HEAD"] = process.argv.slice(2);
  /** @type {string[]} */
  let files = [];
  try {
    files = execFileSync("git", ["diff", "--name-only", base, head], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    // Fail closed: no diff means run everything.
  }
  if (!e2eNeeded(files)) {
    console.error(`asset-only PR: e2e skipped\n${files.join("\n")}`);
  }
  console.log(String(e2eNeeded(files)));
}
