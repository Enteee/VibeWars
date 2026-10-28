import {
  describeSkill,
  getAttribute,
  skillProfessionName,
  type ProfessionId,
  type Skill,
  type SkillDescription,
  type SkillType,
} from "@vibewars/game-core";
import type { CorpusSkill } from "@vibewars/game-data/corpus";

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
  /** The GW1 skills of this attribute not in the game yet (#1220), after `skills`. */
  readonly corpus: readonly CorpusSkill[];
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
 * The GW1 skills not in the game yet (#1220): every corpus entry no
 * catalog skill carries the `gwId` of, in corpus order.
 */
export function missingFromCatalog(
  corpus: readonly CorpusSkill[],
  catalog: readonly Skill[],
): readonly CorpusSkill[] {
  const have = new Set(catalog.flatMap((skill) => (skill.gwId === undefined ? [] : [skill.gwId])));
  return corpus.filter((skill) => !have.has(skill.gwId));
}

/** What a search looks through for a corpus entry: its name, type and GW1's text. */
const corpusSearchText = new WeakMap<CorpusSkill, string>();

function corpusText(skill: CorpusSkill): string {
  let text = corpusSearchText.get(skill);
  if (text === undefined) {
    text = [skill.name, skill.typeText, skill.description].join("\n").toLowerCase();
    corpusSearchText.set(skill, text);
  }
  return text;
}

/**
 * The library's filters (#567, #459) on corpus entries (#1220), as on
 * playable skills: `query` in the name or text, any of `types`, elite
 * only. An entry of a GW1 type this game lacks (Echo) is under no chip,
 * so it shows only with none on.
 */
export function filterCorpus(
  corpus: readonly CorpusSkill[],
  query: string,
  types: ReadonlySet<SkillType>,
  eliteOnly: boolean,
): readonly CorpusSkill[] {
  const needle = query.trim().toLowerCase();
  return corpus.filter(
    (skill) =>
      (!eliteOnly || skill.elite) &&
      (types.size === 0 || (skill.skillType !== undefined && types.has(skill.skillType))) &&
      (needle === "" || corpusText(skill).includes(needle)),
  );
}

/**
 * Corpus entries split as the library splits skills (#568): those of
 * your professions, and Common, and those `lockedSkills` would lock.
 */
export function corpusByAccess(
  corpus: readonly CorpusSkill[],
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): { readonly open: readonly CorpusSkill[]; readonly locked: readonly CorpusSkill[] } {
  const isOpen = (skill: CorpusSkill): boolean =>
    skill.profession === "common" || skill.profession === primary || skill.profession === secondary;
  return { open: corpus.filter(isOpen), locked: corpus.filter((skill) => !isOpen(skill)) };
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
 * a stable library and the list does not reshuffle as you type. The GW1
 * skills not in the game yet (#1220) join their attribute's group after
 * its skills; an attribute only they have comes after every other group.
 */
export function groupSkillsByAttribute(
  skills: readonly Skill[],
  corpus: readonly CorpusSkill[] = [],
): readonly SkillGroup[] {
  const groups = new Map<
    string,
    {
      readonly attributeId: string | undefined;
      readonly attributeName: string;
      readonly skills: Skill[];
      readonly corpus: CorpusSkill[];
    }
  >();
  const groupOf = (
    attributeId: string | undefined,
    profession: Skill["profession"],
    attributeName: () => string | undefined,
  ) => {
    const key = attributeId ?? `${profession}:none`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        attributeId,
        attributeName: attributeName() ?? `No Attribute (${skillProfessionName(profession)})`,
        skills: [],
        corpus: [],
      };
      groups.set(key, group);
    }
    return group;
  };
  for (const skill of skills) {
    // `describeSkill` already resolves the readable attribute name, so
    // reusing it keeps one spelling of "Fire Magic" in the codebase.
    groupOf(
      skill.attributeId,
      skill.profession,
      () => describeSkill(skill).attributeName,
    ).skills.push(skill);
  }
  for (const skill of corpus) {
    groupOf(skill.attributeId, skill.profession, () =>
      skill.attributeId === undefined ? undefined : getAttribute(skill.attributeId)?.name,
    ).corpus.push(skill);
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

/**
 * A corpus entry's cost as a card reads it (#1220): "10 energy",
 * "5 adrenaline", "17% Health", what it upkeeps, or "Free".
 */
export function corpusCostText(skill: CorpusSkill): string {
  const parts = [
    skill.adrenaline > 0 ? `${String(skill.adrenaline)} adrenaline` : undefined,
    skill.energy > 0 ? `${String(skill.energy)} energy` : undefined,
    skill.sacrifice > 0 ? `${String(skill.sacrifice)}% Health` : undefined,
    skill.upkeep > 0 ? `-${String(skill.upkeep)} energy pip` : undefined,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? "Free" : parts.join(", ");
}

/** A corpus entry's activation as a card reads it (#1220): "Instant", "0.25s", "2s". */
export function corpusCastText(skill: CorpusSkill): string {
  return skill.activation === 0 ? "Instant" : `${String(skill.activation)}s`;
}

/** A corpus entry's recharge as a card reads it (#1220): "None", "20s". */
export function corpusRechargeText(skill: CorpusSkill): string {
  return skill.recharge === 0 ? "None" : `${String(skill.recharge)}s`;
}
