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

export const CHARACTER_SCHEMA_VERSION = 5;
export const TEAM_SCHEMA_VERSION = 3;

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

/**
 * A character as a team build holds it (#1452): its own build, not a
 * Solo character's. A stored record's fields stay with the record; `id`
 * is unique within its team.
 */
export type TeamCharacter = Omit<StoredCharacter, "schemaVersion" | "updatedAt">;

export interface StoredTeamMember {
  /** The member's own character: editing a Solo character never touches it. */
  readonly character: TeamCharacter;
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
  if (!isTeamCharacter(value)) {
    return false;
  }
  const { schemaVersion, updatedAt } = value as Partial<StoredCharacter>;
  return schemaVersion === CHARACTER_SCHEMA_VERSION && typeof updatedAt === "number";
}

/** A character's own fields: a stored character and a team member share them. */
function isTeamCharacter(value: unknown): value is TeamCharacter {
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
    typeof record.equipment === "object" &&
    record.equipment !== null
  );
}

function isStoredTeamMember(value: unknown): value is StoredTeamMember {
  return (
    typeof value === "object" &&
    value !== null &&
    isTeamCharacter((value as Record<string, unknown>).character)
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
    (record.members as readonly unknown[]).every(isStoredTeamMember) &&
    typeof record.rulesetId === "string" &&
    typeof record.updatedAt === "number"
  );
}
