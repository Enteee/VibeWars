/**
 * Which maps the perf bench measures on a pull request (#3368).
 *
 * A touched map gives that map, if it still exists. Any change at all gives
 * the reference maps, so a render or rule change is always measured against
 * the same two. Deleted maps are skipped.
 *
 * Usage:
 *   node scripts/ci/perf-plan.mjs <base> [head]   (base...head) prints {"maps":["arena-canyon",...]}
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MAP_PATH } from "./balance-plan.mjs";

/** Measured on every pull request, next to the touched maps. */
export const REFERENCE_MAPS = ["arena-canyon", "sandstone-steps"];

/**
 * @param {string[]} files changed paths, relative to the repository root
 * @param {(id: string) => boolean} exists whether a map still has a folder
 * @returns {{ maps: string[] }}
 */
export const planPerf = (files, exists) => {
  const touched = files.flatMap((file) => MAP_PATH.exec(file)?.[1] ?? []).filter(exists);
  return { maps: [...new Set([...REFERENCE_MAPS, ...touched])] };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base = "HEAD", head = "HEAD"] = process.argv.slice(2);
  const files = execFileSync("git", ["diff", "--name-only", "--no-renames", `${base}...${head}`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line !== "");
  console.log(
    JSON.stringify(planPerf(files, (id) => existsSync(`packages/game-maps/maps/${id}/map.json`))),
  );
}
