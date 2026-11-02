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
  type TeamCharacter,
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
 * LAN. It is one line, so a chat client does not reflow it (#572).
 *
 * JSON stays the default. GW1 skill template codes (`gw1-template.ts`)
 * exist beside it for interop with the GW1 build corpus, PvX and the
 * forums (#494). A code's skills this game lacks become empty slots by
 * design, so a GW1 build still arrives: the one exception to "never
 * half-applies".
 */

/** Marks a blob as ours, so a stray paste fails with a useful message. */
export const BUILD_FORMAT = "vibewars.character";
/**
 * What `exportBuild` writes and the only version `importBuild` reads.
 * A build string from any other version is refused, not adapted
 * (ADR-0016).
 */
export const BUILD_FORMAT_VERSION = 5;

export interface ExportedBuild {
  readonly format: typeof BUILD_FORMAT;
  readonly formatVersion: number;
  readonly name: string;
  readonly primaryProfession: string;
  readonly secondaryProfession: string | null;
  readonly attributes: readonly StoredAttribute[];
  readonly skillBar: readonly (string | null)[];
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
  return JSON.stringify(buildPayload(character));
}

/** What `exportBuild` writes, as an object: a team code holds one per member (#577). */
export function buildPayload(character: TeamCharacter): ExportedBuild {
  return {
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
}

/**
 * Whether pasted text is meant as a build, so a paste on the editor
 * imports it (#572). A clipped or broken build still counts, so its
 * import fails out loud; any other text is ignored.
 */
export function looksLikeBuild(text: string): boolean {
  return text.includes(`"${BUILD_FORMAT}"`);
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

  return readBuild(parsed, id, now);
}

/**
 * Validate and adopt one parsed build: what `importBuild` does after
 * parsing the text, and what a team code's every member goes through
 * (#577), so both read builds the one way.
 */
export function readBuild(parsed: unknown, id: string, now: number): ImportResult {
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, problems: ["A build must be a JSON object."] };
  }

  const record = parsed as Record<string, unknown>;
  if (record.format !== BUILD_FORMAT) {
    return {
      ok: false,
      problems: [`This does not look like a VibeWars build (expected format "${BUILD_FORMAT}").`],
    };
  }
  const formatVersion = record.formatVersion;
  if (typeof formatVersion !== "number" || !Number.isInteger(formatVersion)) {
    return { ok: false, problems: ["This build has no usable format version."] };
  }
  if (formatVersion !== BUILD_FORMAT_VERSION) {
    return {
      ok: false,
      problems: [
        `This build uses format version ${String(formatVersion)}, but this game ` +
          `reads only version ${String(BUILD_FORMAT_VERSION)}. It was shared from a ` +
          `different version of the game; ask for a fresh copy.`,
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

  const equipment = parseBuildEquipment(record.equipment);
  if (equipment === undefined) {
    return { ok: false, problems: ["This build's equipment is missing or malformed."] };
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
