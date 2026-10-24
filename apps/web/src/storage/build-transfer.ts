import {
  PROFESSIONS,
  parseBuildEquipment,
  type BuildEquipment,
  type ProfessionId,
} from "@vibewars/game-core";

import { validateBuild, SKILL_BAR_SLOTS } from "./build-validation.js";
import {
  CHARACTER_SCHEMA_VERSION,
  isStoredCharacter,
  type StoredAttribute,
  type StoredCharacter,
} from "./schema.js";

/**
 * Build import/export (brief §24).
 *
 * Builds are shared as text: a player pastes one into chat, a teammate
 * pastes it back in. That makes an imported build **untrusted input**,
 * no different from a network payload — it can be truncated by a chat
 * client, hand-edited, or crafted. So this module never throws on bad
 * input and never half-applies a build: it returns either a complete,
 * validated character or a list of reasons it was rejected.
 *
 * The exported format is deliberately plain JSON rather than a compact
 * base64 code. A player who hits a problem can read what they pasted,
 * and anyone can see exactly what a build contains before importing it —
 * worth more than a shorter string for a game played among friends on a
 * LAN.
 */

/** Marks a blob as ours, so a stray paste fails with a useful message. */
export const BUILD_FORMAT = "vibewars.character";
/** What `exportBuild` writes. Bumped to 2 when gear joined a build. */
export const BUILD_FORMAT_VERSION = 2;
/**
 * The oldest format `importBuild` still reads.
 *
 * A bounded backward window rather than strict equality, because a build
 * string lives in someone's chat history: the moment a version bump
 * refuses every previously shared build, the sharing feature has broken
 * for everyone who used it. Older-but-supported builds are brought
 * forward with the same defaults the storage migration applies, so there
 * is exactly one set of upgrade rules rather than one per entry point.
 */
export const MIN_SUPPORTED_BUILD_FORMAT_VERSION = 1;

export interface ExportedBuild {
  readonly format: typeof BUILD_FORMAT;
  readonly formatVersion: number;
  readonly name: string;
  readonly primaryProfession: string;
  readonly secondaryProfession: string | null;
  readonly attributes: readonly StoredAttribute[];
  readonly skillBar: readonly (string | null)[];
  /** Added in format version 2. Absent in a version 1 payload. */
  readonly equipment: BuildEquipment;
}

export type ImportResult =
  | { readonly ok: true; readonly character: StoredCharacter }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Serialise a character for sharing.
 *
 * Identity and timestamps are deliberately dropped. A build you receive
 * is a *new* character of your own, not a copy of someone else's record:
 * keeping their id would make importing a build silently overwrite one of
 * yours the moment it was saved.
 */
export function exportBuild(character: StoredCharacter): string {
  const payload: ExportedBuild = {
    format: BUILD_FORMAT,
    formatVersion: BUILD_FORMAT_VERSION,
    name: character.name,
    primaryProfession: character.primaryProfession,
    secondaryProfession: character.secondaryProfession ?? null,
    attributes: character.attributes.map((attribute) => ({
      attributeId: attribute.attributeId,
      rank: attribute.rank,
    })),
    skillBar: [...character.skillBar],
    equipment: character.equipment,
  };
  return JSON.stringify(payload, null, 2);
}

function isProfessionId(value: unknown): value is ProfessionId {
  return typeof value === "string" && Object.hasOwn(PROFESSIONS, value);
}

function readAttributes(value: unknown, problems: string[]): StoredAttribute[] {
  if (!Array.isArray(value)) {
    problems.push("attributes must be a list");
    return [];
  }
  const attributes: StoredAttribute[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      problems.push("every attribute must be an object");
      continue;
    }
    const record = entry as Record<string, unknown>;
    const { attributeId, rank } = record;
    if (typeof attributeId !== "string") {
      problems.push("every attribute needs an attributeId");
      continue;
    }
    // Integer-and-finite, not just "a number": NaN and Infinity survive a
    // JSON round trip through some encoders and would poison the point
    // arithmetic downstream.
    if (typeof rank !== "number" || !Number.isInteger(rank)) {
      problems.push(`rank for ${attributeId} must be a whole number`);
      continue;
    }
    attributes.push({ attributeId, rank });
  }
  return attributes;
}

function readSkillBar(value: unknown, problems: string[]): (string | null)[] {
  if (!Array.isArray(value)) {
    problems.push("skillBar must be a list");
    return [];
  }
  if (value.length !== SKILL_BAR_SLOTS) {
    problems.push(`skillBar must have exactly ${String(SKILL_BAR_SLOTS)} slots`);
    return [];
  }
  const bar: (string | null)[] = [];
  // `Array.isArray` narrows `unknown` to `any[]`, so each entry has to be
  // re-typed as `unknown` before it can be checked (ADR-0008: no `any`).
  for (const entry of value as readonly unknown[]) {
    if (entry === null || typeof entry === "string") {
      bar.push(entry);
      continue;
    }
    problems.push("every skill slot must be a skill id or null");
    return [];
  }
  return bar;
}

/**
 * Parse, validate and adopt a shared build.
 *
 * `id` is supplied by the caller rather than generated here so the
 * function stays pure and testable — and so the caller controls whether
 * an import creates a new character or replaces one it already owns.
 */
export function importBuild(text: string, id: string, now: number): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      problems: ["That is not valid JSON. Paste the whole build, including the braces."],
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, problems: ["A build must be a JSON object."] };
  }

  const record = parsed as Record<string, unknown>;
  if (record.format !== BUILD_FORMAT) {
    return {
      ok: false,
      problems: [`This does not look like a vibewars build (expected format "${BUILD_FORMAT}").`],
    };
  }
  const formatVersion = record.formatVersion;
  if (typeof formatVersion !== "number" || !Number.isInteger(formatVersion)) {
    return { ok: false, problems: ["This build has no usable format version."] };
  }
  // A newer format may carry fields this build would drop on save, so a
  // forward version is refused rather than best-effort imported. This
  // direction stays strict: importing-then-saving a v3 build on a v2
  // client would be silent data loss dressed up as success.
  if (formatVersion > BUILD_FORMAT_VERSION) {
    return {
      ok: false,
      problems: [
        `This build uses format version ${String(formatVersion)}, but this game ` +
          `understands version ${String(BUILD_FORMAT_VERSION)}. Update the game.`,
      ],
    };
  }
  if (formatVersion < MIN_SUPPORTED_BUILD_FORMAT_VERSION) {
    return {
      ok: false,
      problems: [
        `This build uses format version ${String(formatVersion)}, which this game no ` +
          `longer reads (the oldest supported is ${String(MIN_SUPPORTED_BUILD_FORMAT_VERSION)}).`,
      ],
    };
  }

  const problems: string[] = [];

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name === "") {
    problems.push("A build needs a name.");
  }

  if (!isProfessionId(record.primaryProfession)) {
    problems.push(`Unknown primary profession ${JSON.stringify(record.primaryProfession)}.`);
  }
  const secondaryRaw = record.secondaryProfession ?? null;
  if (secondaryRaw !== null && !isProfessionId(secondaryRaw)) {
    problems.push(`Unknown secondary profession ${JSON.stringify(secondaryRaw)}.`);
  }

  const attributes = readAttributes(record.attributes, problems);
  const skillBar = readSkillBar(record.skillBar, problems);

  if (problems.length > 0) {
    return { ok: false, problems };
  }
  if (!isProfessionId(record.primaryProfession)) {
    // Unreachable: the check above pushed a problem and returned. Present
    // so the type narrows without a non-null assertion (ADR-0008).
    return { ok: false, problems: ["Unknown primary profession."] };
  }

  // A version 1 payload has no `equipment` key at all; `parseBuildEquipment`
  // treats that as "old, not broken" and hands back the profession's
  // default loadout — the same answer the storage migration gives.
  const equipment = parseBuildEquipment(record.equipment, record.primaryProfession);
  if (equipment === undefined) {
    return { ok: false, problems: ["This build's equipment is malformed."] };
  }

  const character: StoredCharacter = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name,
    primaryProfession: record.primaryProfession,
    secondaryProfession: isProfessionId(secondaryRaw) ? secondaryRaw : undefined,
    attributes,
    skillBar,
    equipment,
    updatedAt: now,
  };

  // The same validator the editor and the save path use. An imported
  // build that breaks the attribute budget or equips a skill its
  // professions cannot access is rejected here rather than becoming an
  // illegal character that only fails later, at join time.
  const invalid = validateBuild(character);
  if (invalid.length > 0) {
    return { ok: false, problems: invalid.map((problem) => problem.message) };
  }

  // Belt and braces: the structural guard the storage layer will apply
  // when this is read back. Failing here would mean export and storage
  // disagree about the record shape.
  if (!isStoredCharacter(character)) {
    return { ok: false, problems: ["Imported build does not match the storage schema."] };
  }

  return { ok: true, character };
}
