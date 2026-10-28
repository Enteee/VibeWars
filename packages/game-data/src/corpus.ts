import type { ProfessionId, SkillType } from "@vibewars/game-core";

import skilldata from "../raw/gw-skilldata/skilldata.json" with { type: "json" };
import skilldesc from "../raw/gw-skilldata/skilldesc-en.json" with { type: "json" };
import { parseGwSkillData, type GwSkillRecord } from "./sources/gw-skilldata-parse.js";

/**
 * The GW1 PvP skill corpus (#1220, #458), as the skill library lists the
 * skills VibeWars has not implemented yet: GW1's own numbers and text,
 * with its profession, attribute and type codes read as ours. Browser
 * safe: no `node:` import, so the web client loads it as its own chunk.
 */
export interface CorpusSkill {
  /** GW1's skill id: a catalog `Skill` with this `gwId` is the same skill. */
  readonly gwId: number;
  readonly name: string;
  /** GW1's text as is, scaled numbers as `3...15`. */
  readonly description: string;
  readonly profession: ProfessionId | "common";
  /** Ours, e.g. `"warrior.strength"`; `undefined` for a "No Attribute" skill. */
  readonly attributeId: string | undefined;
  /** As GW1 words it: "Hex Spell", "Axe Attack". */
  readonly typeText: string;
  /** `undefined`: a GW1 type this game does not have (Echo, Form, Item Spell...). */
  readonly skillType: SkillType | undefined;
  readonly elite: boolean;
  readonly energy: number;
  readonly adrenaline: number;
  /** Percent of maximum Health. */
  readonly sacrifice: number;
  /** Energy pips while maintained: `0` for none, else positive. */
  readonly upkeep: number;
  /** Seconds. */
  readonly activation: number;
  /** Seconds. */
  readonly recharge: number;
}

/** GW1's profession ids: 0 is Common, as GW1 files Resurrection Signet. */
const PROFESSIONS_BY_GW_ID: ReadonlyMap<number, ProfessionId | "common"> = new Map([
  [0, "common"],
  [1, "warrior"],
  [2, "ranger"],
  [3, "monk"],
  [4, "necromancer"],
  [5, "mesmer"],
  [6, "elementalist"],
  [7, "assassin"],
  [8, "ritualist"],
  [9, "paragon"],
  [10, "dervish"],
]);

/**
 * GW1's attribute ids, ours by theirs: exactly the 42 `PROFESSIONS` has. A
 * PvE title track (26-28, 905 on) has none, and its skills are not listed.
 */
export const ATTRIBUTES_BY_GW_ID: ReadonlyMap<number, string> = new Map([
  [0, "mesmer.fast-casting"],
  [1, "mesmer.illusion-magic"],
  [2, "mesmer.domination-magic"],
  [3, "mesmer.inspiration-magic"],
  [4, "necromancer.blood-magic"],
  [5, "necromancer.death-magic"],
  [6, "necromancer.soul-reaping"],
  [7, "necromancer.curses"],
  [8, "elementalist.air-magic"],
  [9, "elementalist.earth-magic"],
  [10, "elementalist.fire-magic"],
  [11, "elementalist.water-magic"],
  [12, "elementalist.energy-storage"],
  [13, "monk.healing-prayers"],
  [14, "monk.smiting-prayers"],
  [15, "monk.protection-prayers"],
  [16, "monk.divine-favor"],
  [17, "warrior.strength"],
  [18, "warrior.axe-mastery"],
  [19, "warrior.hammer-mastery"],
  [20, "warrior.swordsmanship"],
  [21, "warrior.tactics"],
  [22, "ranger.beast-mastery"],
  [23, "ranger.expertise"],
  [24, "ranger.wilderness-survival"],
  [25, "ranger.marksmanship"],
  [29, "assassin.dagger-mastery"],
  [30, "assassin.deadly-arts"],
  [31, "assassin.shadow-arts"],
  [32, "ritualist.communing"],
  [33, "ritualist.restoration-magic"],
  [34, "ritualist.channeling-magic"],
  [35, "assassin.critical-strikes"],
  [36, "ritualist.spawning-power"],
  [37, "paragon.spear-mastery"],
  [38, "paragon.command"],
  [39, "paragon.motivation"],
  [40, "paragon.leadership"],
  [41, "dervish.scythe-mastery"],
  [42, "dervish.wind-prayers"],
  [43, "dervish.earth-prayers"],
  [44, "dervish.mysticism"],
]);

/** gw-skilldata's `attribute` for a "No Attribute" skill. */
const NO_ATTRIBUTE = -1;

/**
 * gw-skilldata's type ids, as GW1 words each and the `SkillType` it is.
 * 38-42 are touch skills, which GW1 words as the plain type. A type this
 * game lacks has no `SkillType`. 34-37 no PvP skill has.
 */
export const TYPES_BY_GW_ID: ReadonlyMap<
  number,
  { readonly text: string; readonly skillType: SkillType | undefined }
> = new Map([
  [1, { text: "Skill", skillType: "skill" }],
  [2, { text: "Bow Attack", skillType: "attack" }],
  [3, { text: "Melee Attack", skillType: "attack" }],
  [4, { text: "Axe Attack", skillType: "attack" }],
  [5, { text: "Lead Attack", skillType: "attack" }],
  [6, { text: "Off-Hand Attack", skillType: "attack" }],
  [7, { text: "Dual Attack", skillType: "attack" }],
  [8, { text: "Hammer Attack", skillType: "attack" }],
  [9, { text: "Scythe Attack", skillType: "attack" }],
  [10, { text: "Sword Attack", skillType: "attack" }],
  [11, { text: "Pet Attack", skillType: "pet-attack" }],
  [12, { text: "Spear Attack", skillType: "attack" }],
  [13, { text: "Chant", skillType: "chant" }],
  [14, { text: "Echo", skillType: undefined }],
  [15, { text: "Form", skillType: undefined }],
  [16, { text: "Glyph", skillType: "glyph" }],
  [17, { text: "Preparation", skillType: "preparation" }],
  [18, { text: "Binding Ritual", skillType: "binding-ritual" }],
  [19, { text: "Nature Ritual", skillType: "nature-ritual" }],
  [20, { text: "Shout", skillType: "shout" }],
  [21, { text: "Signet", skillType: "signet" }],
  [22, { text: "Spell", skillType: "spell" }],
  [23, { text: "Enchantment Spell", skillType: "enchantment" }],
  [24, { text: "Hex Spell", skillType: "hex" }],
  [25, { text: "Item Spell", skillType: undefined }],
  [26, { text: "Ward Spell", skillType: "ward" }],
  [27, { text: "Weapon Spell", skillType: "weapon-spell" }],
  [28, { text: "Well Spell", skillType: "well" }],
  [29, { text: "Stance", skillType: "stance" }],
  [30, { text: "Trap", skillType: "trap" }],
  [31, { text: "Ranged Attack", skillType: "attack" }],
  [32, { text: "Ebon Vanguard Ritual", skillType: undefined }],
  [33, { text: "Flash Enchantment Spell", skillType: undefined }],
  [38, { text: "Skill", skillType: "skill" }],
  [39, { text: "Spell", skillType: "spell" }],
  [40, { text: "Enchantment Spell", skillType: "enchantment" }],
  [41, { text: "Hex Spell", skillType: "hex" }],
  [42, { text: "Signet", skillType: "signet" }],
]);

/** GW1's "No Skill", the empty slot's id: never a skill. */
const NO_SKILL = 0;

/**
 * `record` as the library lists it, or `undefined` for one it does not:
 * a PvP variant (its base stands for it), a PvE-only skill, one of no
 * profession or of a title track, and the empty slot. Numbers and text
 * come from the PvP variant where there is one: the game is PvP.
 */
function toCorpusSkill(
  record: GwSkillRecord,
  records: ReadonlyMap<number, GwSkillRecord>,
): CorpusSkill | undefined {
  if (record.gwId === NO_SKILL || record.pvp || record.pveOnly) {
    return undefined;
  }
  const profession = PROFESSIONS_BY_GW_ID.get(record.professionGwId);
  const attributeId =
    record.attributeGwId === NO_ATTRIBUTE
      ? undefined
      : ATTRIBUTES_BY_GW_ID.get(record.attributeGwId);
  if (
    profession === undefined ||
    (record.attributeGwId !== NO_ATTRIBUTE && attributeId === undefined)
  ) {
    return undefined;
  }
  const type = TYPES_BY_GW_ID.get(record.typeGwId);
  if (type === undefined) {
    throw new Error(
      `gw-skilldata: skill ${String(record.gwId)} has type ${String(record.typeGwId)}, which corpus.ts does not know`,
    );
  }
  const split = record.splitId === undefined ? undefined : records.get(record.splitId);
  const played = split?.pvp === true ? split : record;
  return {
    gwId: record.gwId,
    name: record.name,
    description: played.description,
    profession,
    attributeId,
    typeText: type.text,
    skillType: type.skillType,
    elite: record.elite,
    energy: played.energy,
    adrenaline: played.adrenaline,
    sacrifice: played.sacrifice,
    upkeep: Math.abs(played.upkeep),
    activation: played.activation,
    recharge: played.recharge,
  };
}

let memo: readonly CorpusSkill[] | undefined;

/** Every GW1 PvP skill (#1220), in GW1 id order; parsed once, on the first call. */
export function corpusSkills(): readonly CorpusSkill[] {
  if (memo === undefined) {
    const records = parseGwSkillData(skilldata, skilldesc);
    memo = [...records.values()].flatMap((record) => toCorpusSkill(record, records) ?? []);
  }
  return memo;
}
