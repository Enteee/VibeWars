import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateNormalizedSkill, type NormalizedSkill } from "./schema.js";

/**
 * normalized/*.json -> generated/skills.json. The runtime (Sprint 10's
 * skill engine) will eventually only ever read the generated bundle, never
 * `normalized/` directly — one parse-and-validate step, one build
 * artifact, not every consumer re-parsing individual files.
 */

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export interface GenerateResult {
  readonly skills: readonly NormalizedSkill[];
  readonly rejected: readonly { readonly file: string; readonly reason: string }[];
}

export function generateSkillBundle(
  normalizedDir: string = resolve(packageRoot(), "normalized"),
): GenerateResult {
  if (!existsSync(normalizedDir)) {
    return { skills: [], rejected: [] };
  }

  const files = readdirSync(normalizedDir).filter((f) => f.endsWith(".json"));
  const skills: NormalizedSkill[] = [];
  const rejected: { file: string; reason: string }[] = [];

  for (const file of files) {
    const raw: unknown = JSON.parse(readFileSync(resolve(normalizedDir, file), "utf8"));
    try {
      skills.push(validateNormalizedSkill(raw));
    } catch (error) {
      // Invalid normalized data must fail the build, not be silently
      // skipped (brief §8: "invalid skill data must fail CI").
      rejected.push({ file, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { skills, rejected };
}

export function writeSkillBundle(
  normalizedDir?: string,
  outPath: string = resolve(packageRoot(), "generated/skills.json"),
): GenerateResult {
  const result = generateSkillBundle(normalizedDir);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result.skills, null, 2) + "\n", "utf8");
  return result;
}
