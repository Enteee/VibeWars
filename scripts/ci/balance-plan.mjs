/**
 * Which rows the map balance bench plays on a pull request (#3356).
 *
 * A touched map gives that map at every size it seats. Any other path in the
 * workflow's filter gives the reference set. Capped, so one PR cannot occupy
 * the hosted runners for hours; the dropped rows are listed, never an error.
 *
 * Usage:
 *   node scripts/ci/balance-plan.mjs <base> [head]   (base...head) prints {"rows":[...],"dropped":[...],"seeds":N}
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SEEDS = 70;
export const MAX_ROWS = 12;

/** Plays on a rule change, next to every touched map. */
export const REFERENCE = [
  { map: "arena-canyon", size: 2 },
  { map: "arena-crossroads", size: 2 },
];

export const MAP_PATH = /^packages\/game-maps\/maps\/([^/]+)\//;

/**
 * @param {string[]} files changed paths, relative to the repository root
 * @param {(id: string) => number[] | undefined} sizesOf team sizes a map seats; undefined when it has no folder
 * @returns {{ rows: { map: string, size: number }[], dropped: { map: string, size: number }[] }}
 */
export const planBalance = (files, sizesOf) => {
  const touched = [...new Set(files.flatMap((file) => MAP_PATH.exec(file)?.[1] ?? []))];
  const other = files.some((file) => !MAP_PATH.test(file));
  /** @type {{ map: string, size: number }[]} */
  const wanted = other ? [...REFERENCE] : [];
  for (const id of touched) {
    for (const size of sizesOf(id) ?? []) wanted.push({ map: id, size });
  }
  const seen = new Set();
  const rows = wanted.filter(({ map, size }) => {
    const key = `${map}/${String(size)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { rows: rows.slice(0, MAX_ROWS), dropped: rows.slice(MAX_ROWS) };
};

/**
 * @param {string} id
 * @returns {number[] | undefined}
 */
const sizesFromDisk = (id) => {
  const file = `packages/game-maps/maps/${id}/map.json`;
  if (!existsSync(file)) return undefined;
  /** @type {unknown} */
  const map = JSON.parse(readFileSync(file, "utf8"));
  return /** @type {{ teamSizes: number[] }} */ (map).teamSizes;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base = "HEAD", head = "HEAD"] = process.argv.slice(2);
  const files = execFileSync("git", ["diff", "--name-only", "--no-renames", `${base}...${head}`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line !== "");
  console.log(JSON.stringify({ ...planBalance(files, sizesFromDisk), seeds: SEEDS }));
}
