/**
 * Professions and their attributes (brief §5).
 *
 * A profession's attributes are data, not a switch statement: four entries
 * per profession, exactly one flagged `isPrimary`. The *access* rule — who
 * may invest points in which attribute — depends on whether a profession is
 * a character's primary or secondary, and lives in `character.ts`, not
 * here; this module only describes what each profession *has*.
 */

export type ProfessionId =
  | "warrior"
  | "ranger"
  | "monk"
  | "necromancer"
  | "mesmer"
  | "elementalist"
  | "assassin"
  | "ritualist"
  | "paragon"
  | "dervish";

export interface AttributeDefinition {
  /** Globally unique, e.g. `"warrior.strength"`. */
  readonly id: string;
  readonly name: string;
  readonly professionId: ProfessionId;
  /** Only the profession's own primary-profession characters may invest here. */
  readonly isPrimary: boolean;
}

export interface ProfessionDefinition {
  readonly id: ProfessionId;
  readonly name: string;
  /**
   * Short label for dense UI, e.g. "Mo" for Monk.
   *
   * Stated rather than derived from the name: first letters collide
   * (Monk/Mesmer, Ranger/Ritualist, Dervish/…), so deriving them would
   * silently label two different professions identically.
   */
  readonly abbreviation: string;
  /** Exactly 4 attributes; exactly one has `isPrimary: true`. Enforced by tests. */
  readonly attributes: readonly AttributeDefinition[];
}

/**
 * Build a profession from its primary attribute plus its secondaries.
 *
 * The secondary list is variable-length rather than a fixed triple: the
 * weapon-oriented professions genuinely carry more attributes than the
 * caster ones, and forcing every profession to exactly three secondaries
 * meant skills had nowhere to belong (Hammer Mastery and Earth Magic had
 * no home, which the catalog's own tests caught).
 */
function profession(
  id: ProfessionId,
  name: string,
  abbreviation: string,
  primaryAttributeName: string,
  secondaryAttributeNames: readonly string[],
): ProfessionDefinition {
  const toAttr = (attrName: string, isPrimary: boolean): AttributeDefinition => ({
    id: `${id}.${attrName.toLowerCase().replace(/\s+/g, "-")}`,
    name: attrName,
    professionId: id,
    isPrimary,
  });
  return {
    id,
    name,
    abbreviation,
    attributes: [
      toAttr(primaryAttributeName, true),
      ...secondaryAttributeNames.map((attrName) => toAttr(attrName, false)),
    ],
  };
}

/**
 * The ten professions, each with one primary and three secondary
 * attributes. Names follow the genre archetypes the brief itself uses as
 * its mechanical reference point (brief's own example team lists "Warrior
 * / Monk", "Mesmer / Elementalist", etc.) — this is original data (our own
 * attribute names, our own point-cost rules, see `attributes.ts`), not
 * copied proprietary content.
 */
export const PROFESSIONS: Readonly<Record<ProfessionId, ProfessionDefinition>> = {
  warrior: profession("warrior", "Warrior", "W", "Strength", [
    "Axe Mastery",
    "Hammer Mastery",
    "Swordsmanship",
    "Tactics",
  ]),
  ranger: profession("ranger", "Ranger", "R", "Expertise", [
    "Marksmanship",
    "Wilderness Survival",
    "Beast Mastery",
  ]),
  monk: profession("monk", "Monk", "Mo", "Divine Favor", [
    "Healing Prayers",
    "Protection Prayers",
    "Smiting Prayers",
  ]),
  necromancer: profession("necromancer", "Necromancer", "N", "Soul Reaping", [
    "Blood Magic",
    "Curses",
    "Death Magic",
  ]),
  mesmer: profession("mesmer", "Mesmer", "Me", "Fast Casting", [
    "Domination Magic",
    "Illusion Magic",
    "Inspiration Magic",
  ]),
  elementalist: profession("elementalist", "Elementalist", "E", "Energy Storage", [
    "Fire Magic",
    "Earth Magic",
    "Water Magic",
    "Air Magic",
  ]),
  assassin: profession("assassin", "Assassin", "A", "Critical Strikes", [
    "Dagger Mastery",
    "Deadly Arts",
    "Shadow Arts",
  ]),
  ritualist: profession("ritualist", "Ritualist", "Rt", "Spawning Power", [
    "Channeling Magic",
    "Restoration Magic",
    "Communing",
  ]),
  paragon: profession("paragon", "Paragon", "P", "Leadership", [
    "Spear Mastery",
    "Command",
    "Motivation",
  ]),
  dervish: profession("dervish", "Dervish", "D", "Mysticism", [
    "Scythe Mastery",
    "Wind Prayers",
    "Earth Prayers",
  ]),
};

/**
 * Who a skill belongs to (#474): a profession, or GW1's "Common", the
 * skills any character may equip (Resurrection Signet). Statuses,
 * attributes and characters stay `ProfessionId`: only a skill can be common.
 */
export type SkillProfession = ProfessionId | "common";

/** How a skill's owner reads: "Monk", or "Common". */
export function skillProfessionName(profession: SkillProfession): string {
  return profession === "common" ? "Common" : PROFESSIONS[profession].name;
}

export function getProfession(id: ProfessionId): ProfessionDefinition {
  return PROFESSIONS[id];
}

export function getAttribute(attributeId: string): AttributeDefinition | undefined {
  for (const prof of Object.values(PROFESSIONS)) {
    const found = prof.attributes.find((attr) => attr.id === attributeId);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function primaryAttributeOf(professionId: ProfessionId): AttributeDefinition {
  const prof = getProfession(professionId);
  const primary = prof.attributes.find((attr) => attr.isPrimary);
  if (primary === undefined) {
    // Unreachable: every profession() call above supplies exactly one
    // primary attribute. A missing one would be a data bug, not a normal
    // runtime condition — fail loudly rather than return undefined.
    throw new Error(`Profession ${professionId} has no primary attribute — this is a data bug`);
  }
  return primary;
}
