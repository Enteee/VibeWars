import {
  PROFESSIONS,
  describeSkill,
  type Skill,
  type SkillDescription,
  type SkillType,
} from "@vibewars/game-core";

/**
 * The skill library: the browsable, filterable list a player drags from
 * when building a character (brief §17).
 *
 * The grouping and filtering live here as pure functions so they can be
 * tested without a DOM, the same split the renderer uses elsewhere. What
 * a player sees is then just these lists, drawn.
 */

export interface SkillGroup {
  /** `undefined` for a profession's "No Attribute" skills (#445). */
  readonly attributeId: string | undefined;
  readonly attributeName: string;
  readonly skills: readonly Skill[];
}

/** What a search looks through for `skill`: its name and its description's lines. */
function searchText(skill: Skill): string {
  const { typeText, effects } = describeSkill(skill);
  return [skill.name, typeText, ...effects.map((effect) => effect.text)].join("\n").toLowerCase();
}

/**
 * Filter by name and description text (#567), case- and
 * whitespace-insensitively: "knock" finds what knocks down.
 *
 * Matches a substring rather than a prefix: players look for "arrow" or
 * "heal" far more often than they type a skill's first letters.
 */
export function filterSkillsByText(skills: readonly Skill[], query: string): readonly Skill[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return skills;
  }
  return skills.filter((skill) => searchText(skill).includes(needle));
}

/**
 * The library's type chips (#567): skills of any of `types`, in order.
 * No chip on lists everything; several on list each of them.
 */
export function filterSkillsByType(
  skills: readonly Skill[],
  types: ReadonlySet<SkillType>,
): readonly Skill[] {
  return types.size === 0 ? skills : skills.filter((skill) => types.has(skill.type));
}

/** The types `skills` has, one chip each, in `order`. */
export function skillTypesOf(
  skills: readonly Skill[],
  order: readonly SkillType[],
): readonly SkillType[] {
  const present = new Set(skills.map((skill) => skill.type));
  return order.filter((type) => present.has(type));
}

/** The library's "Elite" toggle (#459): elite skills only, in order. */
export function filterEliteSkills(skills: readonly Skill[]): readonly Skill[] {
  return skills.filter((skill) => skill.elite);
}

/**
 * Group by the attribute that drives the skill.
 *
 * Grouping by attribute rather than by profession is the useful cut when
 * building: the attribute is what you spend points on, so seeing which
 * skills a point in Fire Magic would improve is the actual question.
 *
 * A profession's "No Attribute" skills are a group of their own.
 *
 * Groups come out in the order the skills do, so a stable catalog gives
 * a stable library and the list does not reshuffle as you type.
 */
export function groupSkillsByAttribute(skills: readonly Skill[]): readonly SkillGroup[] {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const key = skill.attributeId ?? `${skill.profession}:none`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [skill]);
    } else {
      existing.push(skill);
    }
  }
  return [...groups.values()].flatMap((grouped) => {
    // A group is never empty by construction, but the type cannot know
    // that and ADR-0008 rules out asserting it away.
    const first = grouped[0];
    if (first === undefined) {
      return [];
    }
    return [
      {
        attributeId: first.attributeId,
        // `describeSkill` already resolves the readable attribute name, so
        // reusing it keeps one spelling of "Fire Magic" in the codebase.
        attributeName:
          describeSkill(first).attributeName ??
          `No Attribute (${PROFESSIONS[first.profession].name})`,
        skills: grouped,
      },
    ];
  });
}

/** Everything a skill box needs to render, already resolved. */
export interface SkillBoxModel {
  readonly skill: Skill;
  readonly description: SkillDescription;
  /** True when the skill is already somewhere on the bar. */
  readonly equipped: boolean;
}

export function toBoxModel(
  skill: Skill,
  ranks: ReadonlyMap<string, number>,
  equippedIds: ReadonlySet<string>,
): SkillBoxModel {
  return {
    skill,
    description: describeSkill(skill, ranks),
    equipped: equippedIds.has(skill.id),
  };
}
