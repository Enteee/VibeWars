import type { BuildEquipment, ProfessionId } from "@vibewars/game-core";

/**
 * Browser-local persistence schema (brief §22–§24, ADR-0005, ADR-0016).
 *
 * The current shape is the only shape. Every stored record carries
 * `schemaVersion`, and its one job is to reject: a record at any other
 * version, or of any other shape, fails the guards below, and the
 * repository discards it and tells the player. Nothing here upgrades old
 * data, and nothing should (ADR-0016).
 */

export const CHARACTER_SCHEMA_VERSION = 4;
export const TEAM_SCHEMA_VERSION = 1;

export interface StoredAttribute {
  readonly attributeId: string;
  readonly rank: number;
}

export interface StoredCharacter {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  readonly attributes: readonly StoredAttribute[];
  /** Skill ids by bar slot; `null` marks an empty slot. */
  readonly skillBar: readonly (string | null)[];
  /** Weapon, off-hand and armor. */
  readonly equipment: BuildEquipment;
  readonly updatedAt: number;
}

export interface StoredTeamMember {
  /** The local character this slot references. Never a copied build. */
  readonly characterId: string;
}

export interface StoredTeam {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly members: readonly StoredTeamMember[];
  readonly rulesetId: string;
  readonly updatedAt: number;
}

export class PersistenceError extends Error {
  public override readonly name = "PersistenceError";
}

/* -------------------------------------------------------------------------- */
/* Structural guards                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Structural validation of a value loaded from storage. A record saved
 * at any other schema version fails it exactly as a malformed one does.
 */
export function isStoredCharacter(value: unknown): value is StoredCharacter {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === CHARACTER_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.primaryProfession === "string" &&
    (record.secondaryProfession === undefined || typeof record.secondaryProfession === "string") &&
    Array.isArray(record.attributes) &&
    Array.isArray(record.skillBar) &&
    typeof record.equipment === "object" &&
    record.equipment !== null &&
    typeof record.updatedAt === "number"
  );
}

export function isStoredTeam(value: unknown): value is StoredTeam {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === TEAM_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    Array.isArray(record.members) &&
    typeof record.rulesetId === "string" &&
    typeof record.updatedAt === "number"
  );
}
