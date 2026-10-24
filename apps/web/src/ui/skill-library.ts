import { describeSkill, type Skill, type SkillDescription } from "@vibewars/game-core";

/**
 * The skill library: the browsable, filterable list a player drags from
 * when building a character (brief §17).
 *
 * The grouping and filtering live here as pure functions so they can be
 * tested without a DOM, the same split the renderer uses elsewhere. What
 * a player sees is then just these lists, drawn.
 */

export interface SkillGroup {
  readonly attributeId: string;
  readonly attributeName: string;
  readonly skills: readonly Skill[];
}

/**
 * Filter by name, case- and whitespace-insensitively.
 *
 * Matches a substring rather than a prefix: players look for "arrow" or
 * "heal" far more often than they type a skill's first letters.
 */
export function filterSkillsByName(skills: readonly Skill[], query: string): readonly Skill[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return skills;
  }
  return skills.filter((skill) => skill.name.toLowerCase().includes(needle));
}

/**
 * Group by the attribute that drives the skill.
 *
 * Grouping by attribute rather than by profession is the useful cut when
 * building: the attribute is what you spend points on, so seeing which
 * skills a point in Fire Magic would improve is the actual question.
 *
 * Groups come out in the order the skills do, so a stable catalog gives
 * a stable library and the list does not reshuffle as you type.
 */
export function groupSkillsByAttribute(skills: readonly Skill[]): readonly SkillGroup[] {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const existing = groups.get(skill.attributeId);
    if (existing === undefined) {
      groups.set(skill.attributeId, [skill]);
    } else {
      existing.push(skill);
    }
  }
  return [...groups].map(([attributeId, grouped]) => {
    // A group is never empty by construction, but the type cannot know
    // that and ADR-0008 rules out asserting it away.
    const first = grouped[0];
    return {
      attributeId,
      // `describeSkill` already resolves the readable attribute name, so
      // reusing it keeps one spelling of "Fire Magic" in the codebase.
      attributeName: first === undefined ? attributeId : describeSkill(first).attributeName,
      skills: grouped,
    };
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
