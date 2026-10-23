import type { ProfessionId } from "@vibewars/game-core";

/**
 * Versioned browser-local persistence schema (brief §22–§24, ADR-0005).
 *
 * Every stored record carries `schemaVersion`. A record from a newer
 * version than this build understands is rejected loudly rather than
 * silently coerced — losing someone's saved builds is far worse than
 * showing them an error.
 */

export const CURRENT_SCHEMA_VERSION = 1;

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

/**
 * Migrate a record to the current schema version.
 *
 * There is exactly one version so far, so this only guards the
 * boundaries. The registry exists now rather than later because adding
 * it *after* a user has data is the scenario brief §22 explicitly warns
 * about ("never make stored browser data silently incompatible").
 */
export function migrate<T extends { readonly schemaVersion: number }>(record: T): T {
  if (record.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return record;
  }
  if (record.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new PersistenceError(
      `Record was saved by a newer version of the game (schema ${String(record.schemaVersion)} > ` +
        `${String(CURRENT_SCHEMA_VERSION)}). Update the game rather than risk corrupting it.`,
    );
  }
  // No older versions exist yet; a v0 record cannot be produced by any
  // released build, so reaching here means the data is corrupt.
  throw new PersistenceError(
    `Unknown schema version ${String(record.schemaVersion)}; cannot migrate this record.`,
  );
}

/** Structural validation of a value loaded from storage. */
export function isStoredCharacter(value: unknown): value is StoredCharacter {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.schemaVersion === "number" &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.primaryProfession === "string" &&
    (record.secondaryProfession === undefined || typeof record.secondaryProfession === "string") &&
    Array.isArray(record.attributes) &&
    Array.isArray(record.skillBar) &&
    typeof record.updatedAt === "number"
  );
}

export function isStoredTeam(value: unknown): value is StoredTeam {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.schemaVersion === "number" &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    Array.isArray(record.members) &&
    typeof record.rulesetId === "string" &&
    typeof record.updatedAt === "number"
  );
}
