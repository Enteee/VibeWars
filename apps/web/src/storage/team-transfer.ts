import { MAX_TEAM_SIZE, newTeam } from "../ui/team-builder.js";
import { buildPayload, readBuild, type ExportedBuild } from "./build-transfer.js";
import type { StoredCharacter, StoredTeam } from "./schema.js";

/**
 * Team import/export (#577, epic #554).
 *
 * A team code is one self-contained line: the team's name and every
 * member's build inline, each exactly as `exportBuild` writes it. Like a
 * build, a pasted team is untrusted input, so `importTeam` never throws
 * and never half-applies: it returns the whole team with the characters
 * it needs, or every problem it found.
 */

/** Marks a blob as a team, so a build paste is never taken for one. */
export const TEAM_FORMAT = "vibewars.team";
/**
 * What `exportTeam` writes and the only version `importTeam` reads. A
 * team code from any other version is refused, not adapted (ADR-0016).
 */
export const TEAM_FORMAT_VERSION = 1;

export interface ExportedTeam {
  readonly format: typeof TEAM_FORMAT;
  readonly formatVersion: number;
  readonly name: string;
  readonly members: readonly ExportedBuild[];
}

export type TeamImportResult =
  | {
      readonly ok: true;
      /** The team, not stored: the editor opens it unsaved. */
      readonly team: StoredTeam;
      /** Members that are new characters, to store before the team opens. */
      readonly created: readonly StoredCharacter[];
      /** Members identical to a character already stored, which they reuse. */
      readonly reused: readonly StoredCharacter[];
    }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * The team as one line, or `undefined` when a member's character is
 * missing: a team that cannot be saved cannot be shared either.
 */
export function exportTeam(
  team: StoredTeam,
  characters: readonly StoredCharacter[],
): string | undefined {
  const members: ExportedBuild[] = [];
  for (const member of team.members) {
    const character = characters.find((c) => c.id === member.characterId);
    if (character === undefined) {
      return undefined;
    }
    members.push(buildPayload(character));
  }
  const payload: ExportedTeam = {
    format: TEAM_FORMAT,
    formatVersion: TEAM_FORMAT_VERSION,
    name: team.name,
    members,
  };
  return JSON.stringify(payload);
}

/**
 * Whether pasted text is meant as a team. A team code holds build codes
 * too, so every paste handler asks this before `looksLikeBuild`.
 */
export function looksLikeTeam(text: string): boolean {
  return text.includes(`"${TEAM_FORMAT}"`);
}

/** `value` as JSON with every object's keys sorted, to compare two builds. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${(value as readonly unknown[]).map(canonical).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    // An undefined field is left out, as JSON.stringify leaves it out.
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Parse a team code into a team and the characters it references.
 *
 * A member identical to a stored character (name, professions,
 * attributes, bar and equipment) reuses it; every other member becomes a
 * new character with an id from `newId`. Nothing is stored here.
 */
export function importTeam(
  text: string,
  existing: readonly StoredCharacter[],
  newId: () => string,
  now: number,
): TeamImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      problems: ["That is not valid JSON. Paste the whole team, including the braces."],
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, problems: ["A team must be a JSON object."] };
  }
  const record = parsed as Record<string, unknown>;
  if (record.format !== TEAM_FORMAT) {
    return {
      ok: false,
      problems: [`This does not look like a VibeWars team (expected format "${TEAM_FORMAT}").`],
    };
  }
  const formatVersion = record.formatVersion;
  if (typeof formatVersion !== "number" || !Number.isInteger(formatVersion)) {
    return { ok: false, problems: ["This team has no usable format version."] };
  }
  if (formatVersion !== TEAM_FORMAT_VERSION) {
    return {
      ok: false,
      problems: [
        `This team uses format version ${String(formatVersion)}, but this game ` +
          `reads only version ${String(TEAM_FORMAT_VERSION)}. It was shared from a ` +
          `different version of the game; ask for a fresh copy.`,
      ],
    };
  }

  const problems: string[] = [];
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name === "") {
    problems.push("Give the team a name.");
  }
  if (!Array.isArray(record.members)) {
    return { ok: false, problems: [...problems, "members must be a list"] };
  }
  const entries = record.members as readonly unknown[];
  if (entries.length === 0) {
    problems.push("A team needs at least one member.");
  }
  if (entries.length > MAX_TEAM_SIZE) {
    // Before any member is read: a crafted code with thousands of members
    // must not run thousands of reads, nor list thousands of problems.
    return {
      ok: false,
      problems: [...problems, `A team may not exceed ${String(MAX_TEAM_SIZE)} members.`],
    };
  }

  const characters: StoredCharacter[] = [];
  entries.forEach((entry, index) => {
    const result = readBuild(entry, newId(), now);
    if (result.ok) {
      characters.push(result.character);
      return;
    }
    const memberName =
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).name === "string"
        ? String((entry as Record<string, unknown>).name)
        : "unnamed";
    for (const problem of result.problems) {
      problems.push(`Member ${String(index + 1)} (${memberName}): ${problem}`);
    }
  });
  if (problems.length > 0) {
    return { ok: false, problems };
  }

  // Each stored character is reused once at most: a team lists a
  // character in one slot only, so a second identical member is new.
  const unused = new Map(existing.map((c) => [c.id, canonical(buildPayload(c))]));
  const created: StoredCharacter[] = [];
  const reused: StoredCharacter[] = [];
  const memberIds = characters.map((character) => {
    const wanted = canonical(buildPayload(character));
    const match = existing.find((c) => unused.get(c.id) === wanted);
    if (match === undefined) {
      created.push(character);
      return character.id;
    }
    unused.delete(match.id);
    reused.push(match);
    return match.id;
  });

  const team: StoredTeam = {
    ...newTeam(newId()),
    name,
    members: memberIds.map((characterId) => ({ characterId })),
    updatedAt: now,
  };
  return { ok: true, team, created, reused };
}

/**
 * What a team paste did, for its toast: "Created 2 characters: Alice,
 * Bob. Reused 1. Save to keep the team." A zero part is left out.
 */
export function importedTeamSummary(imported: Extract<TeamImportResult, { ok: true }>): string {
  const parts: string[] = [];
  const { created, reused } = imported;
  if (created.length > 0) {
    parts.push(
      `Created ${String(created.length)} ${created.length === 1 ? "character" : "characters"}: ${created.map((c) => c.name).join(", ")}.`,
    );
  }
  if (reused.length > 0) {
    parts.push(`Reused ${String(reused.length)}.`);
  }
  parts.push("Save to keep the team.");
  return parts.join(" ");
}
