import {
  describeSkill,
  type ProfessionId,
  type Skill,
  type SkillDescription,
  type SkillType,
} from "@vibewars/game-core";

import { attributeName, professionName, skillName } from "../i18n/game-names.js";
import { t } from "../i18n/index.js";

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

/**
 * What a search looks through for `skill`: its name as shown, its English
 * name (players paste names from English guides), and its description's lines.
 */
function searchText(skill: Skill): string {
  const { typeText, effects } = describeSkill(skill);
  // eslint-disable-next-line no-restricted-syntax -- the English name, on purpose
  const english = skill.name;
  return [skillName(skill.id), english, typeText, ...effects.map((effect) => effect.text)]
    .join("\n")
    .toLowerCase();
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

/**
 * The library's locked group (#568): the skills of professions you do not
 * have, in catalogue order, each a reason to try another profession. A
 * Common skill (#474) is never locked: everyone has it.
 */
export function lockedSkills(
  skills: readonly Skill[],
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): readonly Skill[] {
  return skills.filter(
    (skill) =>
      skill.profession !== "common" &&
      skill.profession !== primary &&
      skill.profession !== secondary,
  );
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
 * A profession's "No Attribute" skills are a group of their own, and so
 * are the Common ones (#474): "No Attribute (Common)".
 *
 * Groups come out in the order the skills do, so a stable catalog gives
 * a stable library and the list does not reshuffle as you type.
 */
export function groupSkillsByAttribute(skills: readonly Skill[]): readonly SkillGroup[] {
  const groups = new Map<
    string,
    {
      readonly attributeId: string | undefined;
      readonly attributeName: string;
      readonly skills: Skill[];
    }
  >();
  for (const skill of skills) {
    const key = skill.attributeId ?? `${skill.profession}:none`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        attributeId: skill.attributeId,
        attributeName:
          skill.attributeId === undefined
            ? t("skillLibrary.noAttribute", { profession: professionName(skill.profession) })
            : attributeName(skill.attributeId),
        skills: [],
      };
      groups.set(key, group);
    }
    group.skills.push(skill);
  }
  return [...groups.values()];
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
