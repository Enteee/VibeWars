import {
  SKILL_ROLES,
  getSkill,
  skillRoles,
  type ProfessionId,
  type SkillRole,
} from "@vibewars/game-core";

import { t, type MessageKey } from "../i18n/index.js";
import { SKILL_BAR_SLOTS, validateBuild } from "../storage/build-validation.js";
import {
  TEAM_SCHEMA_VERSION,
  type StoredTeam,
  type TeamCharacter,
  type TeamBuildSize,
} from "../storage/schema.js";

/**
 * The team builder (brief §18, §4).
 *
 * Teams are first-class. Each has a size, 2, 4 or 8, fixed when it is
 * made (#2109), and always exactly that many members (#2225): a member is
 * replaced, never added or taken off. Each member is a character of the
 * team's own (#1452): one copied from a Solo character is a copy, and
 * editing either leaves the other alone.
 */

/** A team of `members`, which must be `size` of them. */
export function teamOf(
  id: string,
  size: TeamBuildSize,
  members: readonly TeamCharacter[],
): StoredTeam {
  return {
    schemaVersion: TEAM_SCHEMA_VERSION,
    id,
    name: "New Team",
    size,
    members: members.map((character) => ({ character })),
    rulesetId: "minimal-gw-inspired-pvp-v1",
    updatedAt: Date.now(),
  };
}

/** A new team: `size` blank members (#2225), each what `blank` makes. */
export function newTeam(id: string, size: TeamBuildSize, blank: () => TeamCharacter): StoredTeam {
  return teamOf(
    id,
    size,
    Array.from({ length: size }, () => blank()),
  );
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
  /** As a clause, for after a "Not playable:". */
  readonly message: string;
  /** As a sentence on its own, for the editor's problems chip. */
  readonly sentence: string;
}

/**
 * Validate a team (brief §24): its name, its size, and each member's
 * build by the same rules a Solo character's is held to (#1452).
 */
export function validateTeam(team: StoredTeam): TeamProblem[] {
  const problems: TeamProblem[] = [];

  if (team.name.trim() === "") {
    problems.push({
      message: t("teamBuilder.nameEmpty"),
      sentence: t("teamBuilder.nameEmptySentence"),
    });
  }
  if (team.members.length !== team.size) {
    const params = { size: team.size, members: team.members.length };
    problems.push({
      message: t("teamBuilder.sizeWrong", params),
      sentence: t("teamBuilder.sizeWrongSentence", params),
    });
  }

  team.members.forEach(({ character }, index) => {
    if (validateBuild(character).length > 0) {
      const params = { slot: index + 1, name: character.name };
      problems.push({
        message: t("teamBuilder.memberIllegal", params),
        sentence: t("teamBuilder.memberIllegalSentence", params),
      });
    }
  });

  return problems;
}

/** "1 member", "4 members": a builds drawer row's (#2116), a full team's (#2109). */
export function memberCount(n: number): string {
  return t("teamBuilder.memberCount", { count: n });
}

/** Duplicate a team under a new id, so the original is untouched, at its size. */
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

/** Each counter's label and tooltip, as keys: read as the counters are made. */
const COUNTER_TEXT: Readonly<Record<TeamCounterId, { label: MessageKey; title: MessageKey }>> = {
  interrupt: {
    label: "teamBuilder.counterInterrupts",
    title: "teamBuilder.counterInterruptsTitle",
  },
  healing: { label: "teamBuilder.counterHealing", title: "teamBuilder.counterHealingTitle" },
  removal: { label: "teamBuilder.counterRemoval", title: "teamBuilder.counterRemovalTitle" },
  knockdown: {
    label: "teamBuilder.counterKnockdowns",
    title: "teamBuilder.counterKnockdownsTitle",
  },
  hex: { label: "teamBuilder.counterHexes", title: "teamBuilder.counterHexesTitle" },
  condition: {
    label: "teamBuilder.counterConditions",
    title: "teamBuilder.counterConditionsTitle",
  },
  defence: { label: "teamBuilder.counterDefence", title: "teamBuilder.counterDefenceTitle" },
  energy: { label: "teamBuilder.counterEnergy", title: "teamBuilder.counterEnergyTitle" },
  adrenaline: {
    label: "teamBuilder.counterAdrenaline",
    title: "teamBuilder.counterAdrenalineTitle",
  },
  empty: { label: "teamBuilder.counterEmpty", title: "teamBuilder.counterEmptyTitle" },
};

/** Counter `id`'s label and tooltip in the player's language. */
function counterText(id: TeamCounterId): { label: string; title: string } {
  return { label: t(COUNTER_TEXT[id].label), title: t(COUNTER_TEXT[id].title) };
}

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
      ...counterText(role),
      cells: cells.get(role) ?? [],
      wanted: true,
    })),
    {
      id: "energy",
      ...counterText("energy"),
      cells: cells.get("energy") ?? [],
      wanted: false,
    },
    {
      id: "adrenaline",
      ...counterText("adrenaline"),
      cells: cells.get("adrenaline") ?? [],
      wanted: false,
    },
    {
      id: "empty",
      ...counterText("empty"),
      cells: cells.get("empty") ?? [],
      wanted: false,
    },
  ];
}

/** How many of a team's characters share one pair of professions (#1785). */
export interface ProfessionMixEntry {
  readonly count: number;
  readonly primary: ProfessionId;
  readonly secondary: ProfessionId | undefined;
}

/** The team's professions, one entry per pair, most common first. */
export function professionMix(members: StoredTeam["members"]): ProfessionMixEntry[] {
  const entries = new Map<string, ProfessionMixEntry>();
  for (const { character } of members) {
    const { primaryProfession: primary, secondaryProfession: secondary } = character;
    const key = `${primary}/${secondary ?? ""}`;
    const count = (entries.get(key)?.count ?? 0) + 1;
    entries.set(key, { count, primary, secondary });
  }
  return [...entries.values()].sort((a, b) => b.count - a.count);
}
