import { PROFESSIONS, decodeTemplate, defaultEquipmentFor } from "@vibewars/game-core";

import type { ImportResult } from "./build-transfer.js";
import { validateBuild } from "./build-validation.js";
import { CHARACTER_SCHEMA_VERSION, isStoredCharacter, type StoredCharacter } from "./schema.js";

/**
 * A GW1 skill template code (#494) imported as a character. The codec
 * is game-core's (`gw1-template.ts` there); this is what the build
 * editor adds to it: a name, the primary's own equipment, and the
 * checks any imported build gets.
 */

/**
 * What a decoded code adds to an import: the GW1 skill ids it named that
 * this game does not have, each now an empty slot (#494).
 */
export type TemplateImportResult =
  | (Extract<ImportResult, { ok: true }> & { readonly missingSkills: readonly number[] })
  | Extract<ImportResult, { ok: false }>;

/**
 * Read a GW1 template code as a new character. Like a JSON build it is
 * untrusted text, so this never throws: a malformed code is refused with
 * the reason, and a well-formed one is validated as any build is.
 *
 * The one exception to "never half-applies": a skill this game does not
 * have becomes an empty slot, and `missingSkills` says which.
 */
export function importTemplate(text: string, id: string, now: number): TemplateImportResult {
  const decoded = decodeTemplate(text);
  if (!decoded.ok) {
    return { ok: false, problems: [...decoded.problems] };
  }
  const { build } = decoded;
  const name = [build.primaryProfession, build.secondaryProfession]
    .flatMap((profession) => (profession === undefined ? [] : [PROFESSIONS[profession].name]))
    .join("/");
  const character: StoredCharacter = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name: `${name} build`,
    primaryProfession: build.primaryProfession,
    secondaryProfession: build.secondaryProfession,
    attributes: [...build.attributes],
    skillBar: [...build.skillBar],
    // The format has no equipment: the primary's own, as a new character gets.
    equipment: defaultEquipmentFor(build.primaryProfession),
    updatedAt: now,
  };
  const invalid = validateBuild(character);
  if (invalid.length > 0) {
    return { ok: false, problems: invalid.map((problem) => problem.message) };
  }
  if (!isStoredCharacter(character)) {
    return { ok: false, problems: ["Imported build does not match the storage schema."] };
  }
  return { ok: true, character, missingSkills: decoded.missingSkills };
}

/**
 * What an import's toast adds for the skills a code named that this game
 * does not have: their GW1 ids, since the library has no names for them
 * yet. Nothing when none are missing.
 */
export function missingSkillsNote(missing: readonly number[]): string {
  if (missing.length === 0) {
    return "";
  }
  const count = missing.length === 1 ? "1 skill is" : `${String(missing.length)} skills are`;
  return `. ${count} not in VibeWars yet: GW1 skill ${missing.join(", ")}.`;
}
