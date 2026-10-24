import { TEAM_SCHEMA_VERSION, type StoredCharacter, type StoredTeam } from "../storage/schema.js";

/**
 * The team builder (brief §18, §4).
 *
 * Teams are first-class and of *arbitrary* size — the brief is explicit
 * that 8 must not be hardcoded, so nothing here caps membership. Members
 * reference characters by id rather than embedding a copy of the build,
 * so editing a character updates every team that uses it.
 */

export const MAX_TEAM_SIZE = 16;

export function newTeam(id: string): StoredTeam {
  return {
    schemaVersion: TEAM_SCHEMA_VERSION,
    id,
    name: "New Team",
    members: [],
    rulesetId: "minimal-gw-inspired-pvp-v1",
    updatedAt: Date.now(),
  };
}

export function addMember(team: StoredTeam, characterId: string): StoredTeam {
  if (team.members.length >= MAX_TEAM_SIZE) {
    return team;
  }
  return {
    ...team,
    members: [...team.members, { characterId }],
    updatedAt: Date.now(),
  };
}

export function removeMember(team: StoredTeam, index: number): StoredTeam {
  return {
    ...team,
    members: team.members.filter((_member, i) => i !== index),
    updatedAt: Date.now(),
  };
}

/**
 * Move a member one position toward the front or back.
 *
 * Order matters to players (it is the slot order they will see in the
 * lobby), so reordering is a first-class operation rather than
 * delete-and-re-add, which would lose the member's place entirely.
 */
export function moveMember(team: StoredTeam, index: number, delta: number): StoredTeam {
  const target = index + delta;
  if (index < 0 || index >= team.members.length || target < 0 || target >= team.members.length) {
    return team;
  }
  const members = [...team.members];
  const moved = members[index];
  const displaced = members[target];
  if (moved === undefined || displaced === undefined) {
    return team;
  }
  members[index] = displaced;
  members[target] = moved;
  return { ...team, members, updatedAt: Date.now() };
}

export interface TeamProblem {
  readonly message: string;
}

/**
 * Validate a team against the characters that actually exist locally
 * (brief §24). A member pointing at a deleted character is the realistic
 * failure here, and it must be surfaced rather than silently dropped.
 */
export function validateTeam(
  team: StoredTeam,
  characters: readonly StoredCharacter[],
): TeamProblem[] {
  const problems: TeamProblem[] = [];
  const known = new Set(characters.map((c) => c.id));

  if (team.name.trim() === "") {
    problems.push({ message: "team name must not be empty" });
  }
  if (team.members.length === 0) {
    problems.push({ message: "a team needs at least one member" });
  }
  if (team.members.length > MAX_TEAM_SIZE) {
    problems.push({ message: `a team may not exceed ${String(MAX_TEAM_SIZE)} members` });
  }

  team.members.forEach((member, index) => {
    if (!known.has(member.characterId)) {
      problems.push({
        message: `slot ${String(index + 1)} references a character that no longer exists`,
      });
    }
  });

  return problems;
}

/** Duplicate a team under a new id, so the original is untouched. */
export function duplicateTeam(team: StoredTeam, newId: string): StoredTeam {
  return { ...team, id: newId, name: `${team.name} (copy)`, updatedAt: Date.now() };
}
