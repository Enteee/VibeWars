import { t } from "../i18n/index.js";
import { teamOf, teamCharacter } from "../ui/team-builder.js";
import { buildPayload, readBuild, type ExportedBuild } from "./build-transfer.js";
import {
  isTeamBuildSize,
  type StoredTeam,
  type TeamBuildSize,
  type TeamCharacter,
} from "./schema.js";

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
export const TEAM_FORMAT_VERSION = 3;

export interface ExportedTeam {
  readonly format: typeof TEAM_FORMAT;
  readonly formatVersion: number;
  readonly name: string;
  /** The build's fixed size (#2109): a paste is a build of this size. */
  readonly size: TeamBuildSize;
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
    size: team.size,
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
    return { ok: false, problems: [t("storage.teamNotJson")] };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, problems: [t("storage.teamNotObject")] };
  }
  const record = parsed as Record<string, unknown>;
  if (record.format !== TEAM_FORMAT) {
    return {
      ok: false,
      problems: [t("storage.teamWrongFormat", { format: TEAM_FORMAT })],
    };
  }
  const formatVersion = record.formatVersion;
  if (typeof formatVersion !== "number" || !Number.isInteger(formatVersion)) {
    return { ok: false, problems: [t("storage.teamNoFormatVersion")] };
  }
  if (formatVersion !== TEAM_FORMAT_VERSION) {
    return {
      ok: false,
      problems: [
        t("storage.teamFormatVersion", { version: formatVersion, supported: TEAM_FORMAT_VERSION }),
      ],
    };
  }

  const problems: string[] = [];
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name === "") {
    problems.push(t("storage.teamNeedsName"));
  }
  const size = record.size;
  if (!isTeamBuildSize(size)) {
    return { ok: false, problems: [...problems, t("storage.teamSize")] };
  }
  if (!Array.isArray(record.members)) {
    return { ok: false, problems: [...problems, t("storage.notAList", { field: "members" })] };
  }
  const entries = record.members as readonly unknown[];
  if (entries.length !== size) {
    // Before any member is read: a crafted code with thousands of members
    // must not run thousands of reads, nor list thousands of problems.
    // A team is always its size (#2225).
    return {
      ok: false,
      problems: [...problems, t("storage.teamMemberCount", { size, found: entries.length })],
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
        : t("storage.unnamedMember");
    for (const problem of result.problems) {
      problems.push(t("storage.teamMember", { number: index + 1, name: memberName, problem }));
    }
  });
  if (problems.length > 0) {
    return { ok: false, problems };
  }

  const team: StoredTeam = { ...teamOf(newId(), size, characters), name, updatedAt: now };
  return { ok: true, team };
}

/** What a team paste did, for its toast: "Pasted Duo, 2 members. Save to keep it." */
export function importedTeamSummary(team: StoredTeam): string {
  const count = team.members.length;
  return t("storage.teamPasted", { name: team.name, count });
}
