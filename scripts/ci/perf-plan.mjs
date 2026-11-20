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

/** The Hosted lobby never offers it, so the bench cannot select it: ELITE_ZAISHEN_MAP (#3589). */
export const UNHOSTED_MAPS = ["elite-zaishen-battle"];

/**
 * Whether the bench can measure a map: it has a map.json.
 * @param {string} id
 */
export const benchable = (id) => {
  return existsSync(`packages/game-maps/maps/${id}/map.json`);
};

/**
 * @param {string[]} files changed paths, relative to the repository root
 * @param {(id: string) => boolean} canBench whether the map has a map.json; one the lobby never offers is skipped too
 * @returns {{ maps: string[] }}
 */
export const planPerf = (files, canBench) => {
  const touched = files
    .flatMap((file) => MAP_PATH.exec(file)?.[1] ?? [])
    .filter((id) => canBench(id) && !UNHOSTED_MAPS.includes(id));
  return { maps: [...new Set([...REFERENCE_MAPS, ...touched])] };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base = "HEAD", head = "HEAD"] = process.argv.slice(2);
  const files = execFileSync("git", ["diff", "--name-only", "--no-renames", `${base}...${head}`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line !== "");
  console.log(JSON.stringify(planPerf(files, benchable)));
}
