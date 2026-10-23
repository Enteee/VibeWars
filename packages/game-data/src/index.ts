/**
 * `@vibewars/game-data` — the GW1 reference skill corpus pipeline
 * (ADR-0004). Runtime consumers should use `generateSkillBundle()`/the
 * `generated/skills.json` it produces, not read `normalized/` directly.
 */

export type { NormalizedSkill } from "./schema.js";
export { SkillValidationError, normalizedSkillSchema, validateNormalizedSkill } from "./schema.js";

export type { GwMemorialParseResult, ParseGwMemorialSkillInput } from "./sources/gw-memorial.js";
export { parseGwMemorialSkill } from "./sources/gw-memorial.js";

export type { ImportOptions, ImportProblem, ImportReport, SkillSpec } from "./importer.js";
export { importSkills } from "./importer.js";

export type { GenerateResult } from "./generate.js";
export { generateSkillBundle, writeSkillBundle } from "./generate.js";
export { runCli } from "./cli.js";
