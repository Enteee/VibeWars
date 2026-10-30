import { SKILL_ROLES, getSkill, skillRoles, type SkillRole } from "@vibewars/game-core";

import { SKILL_BAR_SLOTS, validateBuild } from "../storage/build-validation.js";
import { TEAM_SCHEMA_VERSION, type StoredTeam, type TeamCharacter } from "../storage/schema.js";
import { professionBadge } from "./character-preview.js";

/**
 * The team builder (brief §18, §4).
 *
 * Teams are first-class and of *arbitrary* size — the brief is explicit
 * that 8 must not be hardcoded, so nothing here caps membership. Each
 * member is a character of the team's own (#1452): one copied from a Solo
 * character is a copy, and editing either leaves the other alone.
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

/**
 * `character` as a team member under `id`: its build only, copied, so a
 * later edit to either is not seen by the other.
 */
export function teamCharacter(character: TeamCharacter, id: string): TeamCharacter {
  return {
    id,
    name: character.name,
    primaryProfession: character.primaryProfession,
    secondaryProfession: character.secondaryProfession,
    attributes: character.attributes.map((a) => ({ attributeId: a.attributeId, rank: a.rank })),
    skillBar: [...character.skillBar],
    equipment: character.equipment,
  };
}

export function addMember(team: StoredTeam, character: TeamCharacter): StoredTeam {
  if (team.members.length >= MAX_TEAM_SIZE) {
    return team;
  }
  return {
    ...team,
    members: [...team.members, { character }],
    updatedAt: Date.now(),
  };
}

/** The team with the member whose id is `character.id` replaced by `character`. */
export function replaceMember(team: StoredTeam, character: TeamCharacter): StoredTeam {
  return {
    ...team,
    members: team.members.map((member) =>
      member.character.id === character.id ? { character } : member,
    ),
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
 * Validate a team (brief §24): its name, its size, and each member's
 * build by the same rules a Solo character's is held to (#1452).
 */
export function validateTeam(team: StoredTeam): TeamProblem[] {
  const problems: TeamProblem[] = [];

  if (team.name.trim() === "") {
    problems.push({ message: "team name must not be empty" });
  }
  if (team.members.length === 0) {
    problems.push({ message: "a team needs at least one member" });
  }
  if (team.members.length > MAX_TEAM_SIZE) {
    problems.push({ message: `a team may not exceed ${String(MAX_TEAM_SIZE)} members` });
  }

  team.members.forEach(({ character }, index) => {
    if (validateBuild(character).length > 0) {
      problems.push({
        message: `slot ${String(index + 1)}, ${character.name}, is not a legal build: open it to see why`,
      });
    }
  });

  return problems;
}

/** Duplicate a team under a new id, so the original is untouched. */
export function duplicateTeam(team: StoredTeam, newId: string): StoredTeam {
  return { ...team, id: newId, name: `${team.name} (copy)`, updatedAt: Date.now() };
}

/** One bar slot of one member: what a counter or a find-a-skill marks. */
export interface TeamCell {
  /** The member's `character.id`. */
  readonly characterId: string;
  readonly slot: number;
}

export type TeamCounterId = SkillRole | "energy" | "adrenaline" | "empty";

/** One counter above the team grid (#575), and the cells it counts. */
export interface TeamCounter {
  readonly id: TeamCounterId;
  readonly label: string;
  /** What it counts, for its tooltip. */
  readonly title: string;
  readonly cells: readonly TeamCell[];
  /** Whether a team with none of it lacks something: the counter turns amber. */
  readonly wanted: boolean;
}

const ROLE_COUNTERS: Readonly<Record<SkillRole, { label: string; title: string }>> = {
  interrupt: { label: "interrupts", title: "skills that interrupt a foe's skill" },
  healing: { label: "healing", title: "skills that heal" },
  removal: { label: "removal", title: "skills that remove a condition or a hex" },
  knockdown: { label: "knockdowns", title: "skills that knock a foe down" },
  hex: { label: "hexes", title: "skills that hex a foe" },
  condition: { label: "conditions", title: "skills that give a foe a condition" },
  defence: { label: "defence", title: "skills that raise armor or block" },
};

/**
 * What the team's bars hold, counted per copy (#575): the seven skill
 * roles, energy and adrenaline skills, and the empty slots.
 */
export function teamCounters(members: StoredTeam["members"]): TeamCounter[] {
  const cells = new Map<TeamCounterId, TeamCell[]>();
  const count = (id: TeamCounterId, cell: TeamCell): void => {
    const list = cells.get(id) ?? [];
    list.push(cell);
    cells.set(id, list);
  };
  for (const { character } of members) {
    for (let slot = 0; slot < SKILL_BAR_SLOTS; slot += 1) {
      const cell = { characterId: character.id, slot };
      const skillId = character.skillBar[slot] ?? null;
      if (skillId === null) {
        count("empty", cell);
        continue;
      }
      const skill = getSkill(skillId);
      if (skill === undefined) {
        continue;
      }
      if (skill.cost !== undefined) {
        count(skill.cost.kind, cell);
      }
      for (const role of skillRoles(skill)) {
        count(role, cell);
      }
    }
  }
  return [
    ...SKILL_ROLES.map((role) => ({
      id: role,
      ...ROLE_COUNTERS[role],
      cells: cells.get(role) ?? [],
      wanted: true,
    })),
    {
      id: "energy",
      label: "energy",
      title: "skills that cost energy",
      cells: cells.get("energy") ?? [],
      wanted: false,
    },
    {
      id: "adrenaline",
      label: "adrenaline",
      title: "skills that cost adrenaline",
      cells: cells.get("adrenaline") ?? [],
      wanted: false,
    },
    {
      id: "empty",
      label: "empty",
      title: "empty bar slots",
      cells: cells.get("empty") ?? [],
      wanted: false,
    },
  ];
}

/** The team's professions as badges, most common first: "2 W/Mo · R". */
export function professionMix(members: StoredTeam["members"]): string {
  const counts = new Map<string, number>();
  for (const { character } of members) {
    const badge = professionBadge(character.primaryProfession, character.secondaryProfession);
    counts.set(badge, (counts.get(badge) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([badge, n]) => (n === 1 ? badge : `${String(n)} ${badge}`))
    .join(" · ");
}
