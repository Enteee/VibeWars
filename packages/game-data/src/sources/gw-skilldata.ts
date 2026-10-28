import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseGwSkillData, type GwSkillRecord } from "./gw-skilldata-parse.js";

function readJson(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(resolve(dir, file), "utf8"));
}

/** The vendored copy, `raw/gw-skilldata/` of this package. */
export function gwSkillDataDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../raw/gw-skilldata");
}

/**
 * Every record in `dir` (`skilldata.json` joined with `skilldesc-en.json`),
 * by GW1 id, as `parseGwSkillData` reads them.
 */
export function readGwSkillData(dir: string): ReadonlyMap<number, GwSkillRecord> {
  return parseGwSkillData(readJson(dir, "skilldata.json"), readJson(dir, "skilldesc-en.json"));
}
