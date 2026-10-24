import type { ProfessionId } from "@vibewars/game-core";

/**
 * Schema version 1, frozen. **Never edit this file.**
 *
 * These are verbatim copies of what `schema.ts` looked like before
 * equipment existed. They are here so each migration step can be typed
 * `(v1) => v2` and checked by the compiler, instead of shuffling
 * `Record<string, unknown>` around and hoping.
 *
 * The temptation, when a later version renames a field, is to "fix" the
 * old interface to match. Doing that silently breaks every migration
 * that reads it: a v1 record on a real player's disk does not change
 * because we changed our minds. If a v1 field needs a different name,
 * that is what the v1 → v2 step is for.
 */

export interface StoredAttributeV1 {
  readonly attributeId: string;
  readonly rank: number;
}

export interface StoredCharacterV1 {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  readonly attributes: readonly StoredAttributeV1[];
  readonly skillBar: readonly (string | null)[];
  readonly updatedAt: number;
}

export interface StoredTeamMemberV1 {
  readonly characterId: string;
}

export interface StoredTeamV1 {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly members: readonly StoredTeamMemberV1[];
  readonly rulesetId: string;
  readonly updatedAt: number;
}

/** Structural check for a v1 character, used as a migration step's input guard. */
export function isStoredCharacterV1(value: unknown): value is StoredCharacterV1 {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.primaryProfession === "string" &&
    (record.secondaryProfession === undefined || typeof record.secondaryProfession === "string") &&
    Array.isArray(record.attributes) &&
    Array.isArray(record.skillBar) &&
    typeof record.updatedAt === "number"
  );
}
