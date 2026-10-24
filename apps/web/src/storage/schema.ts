import {
  defaultBuildEquipment,
  isProfessionId,
  type BuildEquipment,
  type ProfessionId,
} from "@vibewars/game-core";

import { isStoredCharacterV1, type StoredCharacterV1 } from "./schema-v1.js";

/**
 * Versioned browser-local persistence schema (brief §22–§24, ADR-0005,
 * ADR-0013).
 *
 * Every stored record carries `schemaVersion`, and this module owns the
 * migration registry ADR-0005 promised. Two rules the rest of the
 * storage layer depends on:
 *
 * 1. **Migrate first, validate second.** A v1 record does not satisfy
 *    the *current* structural guard — that is the entire point of it
 *    being v1. Running the guard before the migration would report
 *    every pre-equipment character as "malformed", which is silent data
 *    loss wearing a polite error message.
 * 2. **Versions are per entity.** Characters and teams move
 *    independently. A single shared constant would force a no-op
 *    re-version of every team record each time a character field
 *    changes — a tax paid forever to save three lines once.
 */

/** Bumped to 2 when equipment (weapon, off-hand, armor) joined a character. */
export const CHARACTER_SCHEMA_VERSION = 2;
/** Teams have not changed shape since v1. */
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
  /** Weapon, off-hand and armor. Added in schema v2. */
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
/* The migration registry                                                      */
/* -------------------------------------------------------------------------- */

/** One step forward. Keyed by the version it upgrades *from*. */
type MigrationStep = (record: unknown) => unknown;

/**
 * v1 → v2: give a character the gear their profession would obviously
 * have been holding.
 *
 * Not fists, and not an empty slot. A character saved before weapons
 * existed was built as a warrior or a monk, and the kindest — and only
 * honest — reading of their intent is the default kit for that
 * profession. No runes and no insignias: those are trades with a real
 * cost, and picking one for someone would be inventing a decision they
 * never made.
 */
function characterV1ToV2(record: unknown): unknown {
  if (!isStoredCharacterV1(record)) {
    throw new PersistenceError("a schema 1 character record is malformed and cannot be migrated");
  }
  const v1: StoredCharacterV1 = record;
  const profession: ProfessionId = isProfessionId(v1.primaryProfession)
    ? v1.primaryProfession
    : "warrior";
  const equipment: BuildEquipment = defaultBuildEquipment(profession);
  return { ...v1, schemaVersion: 2, equipment };
}

const CHARACTER_MIGRATIONS: ReadonlyMap<number, MigrationStep> = new Map([[1, characterV1ToV2]]);

const TEAM_MIGRATIONS: ReadonlyMap<number, MigrationStep> = new Map();

function readVersion(record: unknown, entity: string): number {
  if (typeof record !== "object" || record === null) {
    throw new PersistenceError(`a stored ${entity} is not an object`);
  }
  const version = (record as Record<string, unknown>).schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new PersistenceError(`a stored ${entity} has no usable schemaVersion`);
  }
  return version;
}

/**
 * Walk a record forward one version at a time.
 *
 * Stepwise rather than a single "old shape to new shape" function so
 * that a v1 record and a v4 record both arrive at the present by the
 * same route — the alternative is a combinatorial pile of direct
 * conversions, every one of which has to be maintained.
 */
function runMigrations(
  record: unknown,
  steps: ReadonlyMap<number, MigrationStep>,
  current: number,
  entity: string,
): unknown {
  let version = readVersion(record, entity);

  if (version > current) {
    throw new PersistenceError(
      `Record was saved by a newer version of the game (schema ${String(version)} > ` +
        `${String(current)}). Update the game rather than risk corrupting it.`,
    );
  }

  let migrated = record;
  while (version < current) {
    const step = steps.get(version);
    if (step === undefined) {
      throw new PersistenceError(
        `no migration path for a ${entity} at schema version ${String(version)}`,
      );
    }
    migrated = step(migrated);
    const next = readVersion(migrated, entity);
    if (next <= version) {
      // A step that fails to advance the version would spin here
      // forever. Cheap to assert, and the failure mode it prevents is a
      // hung tab rather than a visible error.
      throw new PersistenceError(
        `migration from ${entity} schema ${String(version)} did not advance the version`,
      );
    }
    version = next;
  }
  return migrated;
}

/** Bring a stored character up to date, or explain why it cannot be. */
export function migrateCharacter(record: unknown): StoredCharacter {
  const migrated = runMigrations(
    record,
    CHARACTER_MIGRATIONS,
    CHARACTER_SCHEMA_VERSION,
    "character",
  );
  if (!isStoredCharacter(migrated)) {
    throw new PersistenceError("a stored character did not survive migration intact");
  }
  return migrated;
}

/** Bring a stored team up to date, or explain why it cannot be. */
export function migrateTeam(record: unknown): StoredTeam {
  const migrated = runMigrations(record, TEAM_MIGRATIONS, TEAM_SCHEMA_VERSION, "team");
  if (!isStoredTeam(migrated)) {
    throw new PersistenceError("a stored team did not survive migration intact");
  }
  return migrated;
}

/* -------------------------------------------------------------------------- */
/* Structural guards — these describe the CURRENT shape, post-migration        */
/* -------------------------------------------------------------------------- */

/**
 * Structural validation of a value loaded from storage.
 *
 * Describes schema v2 and nothing else. Run it *after* `migrateCharacter`,
 * never before: asking "is this a valid current record" of a v1 record
 * has only one honest answer, and it is not the one the caller wants.
 */
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
    typeof record.schemaVersion === "number" &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    Array.isArray(record.members) &&
    typeof record.rulesetId === "string" &&
    typeof record.updatedAt === "number"
  );
}
