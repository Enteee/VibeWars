import { MAX_TEAM_SIZE, newTeam, teamCharacter } from "../ui/team-builder.js";
import { buildPayload, readBuild, type ExportedBuild } from "./build-transfer.js";
import type { StoredTeam, TeamCharacter } from "./schema.js";

/**
 * Team import/export (#577, epic #554).
 *
 * A team code is one self-contained line: the team's name and every
 * member's build inline, each exactly as `exportBuild` writes it. Like a
 * build, a pasted team is untrusted input, so `importTeam` never throws
 * and never half-applies: it returns the whole team with the characters
 * it needs, or every problem it found. A team's members are its own
 * (#1452), so an import makes them all, and looks up nothing local.
 */

/** Marks a blob as a team, so a build paste is never taken for one. */
export const TEAM_FORMAT = "vibewars.team";
/**
 * What `exportTeam` writes and the only version `importTeam` reads. A
 * team code from any other version is refused, not adapted (ADR-0016).
 */
export const TEAM_FORMAT_VERSION = 2;

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
    }
  | { readonly ok: false; readonly problems: readonly string[] };

/** The team as one line, every member's build inline. */
export function exportTeam(team: StoredTeam): string {
  const payload: ExportedTeam = {
    format: TEAM_FORMAT,
    formatVersion: TEAM_FORMAT_VERSION,
    name: team.name,
    members: team.members.map((member) => buildPayload(member.character)),
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

/**
 * Parse a team code into a team whose members are new characters of its
 * own, each with an id from `newId`. Nothing is stored here.
 */
export function importTeam(text: string, newId: () => string, now: number): TeamImportResult {
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

  const characters: TeamCharacter[] = [];
  entries.forEach((entry, index) => {
    const result = readBuild(entry, newId(), now);
    if (result.ok) {
      characters.push(teamCharacter(result.character, result.character.id));
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

  const team: StoredTeam = {
    ...newTeam(newId()),
    name,
    members: characters.map((character) => ({ character })),
    updatedAt: now,
  };
  return { ok: true, team };
}

/** What a team paste did, for its toast: "Pasted Duo, 2 members. Save to keep it." */
export function importedTeamSummary(team: StoredTeam): string {
  const count = team.members.length;
  return `Pasted ${team.name}, ${String(count)} ${count === 1 ? "member" : "members"}. Save to keep it.`;
}
