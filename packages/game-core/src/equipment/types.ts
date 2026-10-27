/**
 * Shared vocabulary for equipment (ADR-0012).
 *
 * Weapons, off-hands, runes and insignias all need to talk about damage
 * types and attribute requirements, and none of them should own those
 * definitions. They live here so the four catalogs stay siblings rather
 * than importing each other.
 */

/**
 * How a hit is classified: GW1's damage types (#759).
 *
 * Every type has a consumer, through the armor that answers to it.
 * Slashing, piercing and blunt are physical: a Warrior's inherent +20,
 * the Stalwart insignia and the Absorption rune key off them. Fire, cold,
 * lightning and earth are elemental: a Ranger's inherent +30 keys off
 * them. Chaos, dark, holy, shadow and typeless are neither, which is what
 * they do here: no typed armor applies to them, base armor still does.
 */
export type DamageType =
  | "slashing"
  | "piercing"
  | "blunt"
  | "fire"
  | "cold"
  | "lightning"
  | "earth"
  | "chaos"
  | "dark"
  | "holy"
  | "shadow"
  | "typeless";

export function isPhysicalDamage(type: DamageType): boolean {
  return type === "slashing" || type === "piercing" || type === "blunt";
}

export function isElementalDamage(type: DamageType): boolean {
  return type === "fire" || type === "cold" || type === "lightning" || type === "earth";
}

/**
 * The attribute a piece of equipment is linked to.
 *
 * A union rather than a nullable `attributeId`, because the two cases are
 * genuinely different and `exactOptionalPropertyTypes` makes
 * "sometimes present" fields painful to thread through. A sword is always
 * Swordsmanship; a wand is whichever casting attribute its owner
 * nominated, because a fire wand and an air wand are the same *class*.
 */
export type EquipmentRequirement =
  | { readonly kind: "fixed"; readonly attributeId: string; readonly rank: number }
  | {
      readonly kind: "chosen";
      readonly from: readonly string[] | "any-accessible";
      readonly rank: number;
    };

/**
 * The requirement rank every max-damage weapon carries.
 *
 * One number rather than a per-weapon field: this project does not model
 * the low-requirement weapon variants, so a per-weapon rank would be the
 * same value repeated fifteen times and an invitation to typo one of them.
 */
export const EQUIPMENT_REQUIREMENT_RANK = 9;

/** The five armor pieces. One insignia and one rune may sit on each. */
export type ArmorSlot = "head" | "chest" | "hands" | "legs" | "feet";

export const ARMOR_SLOTS: readonly ArmorSlot[] = Object.freeze([
  "head",
  "chest",
  "hands",
  "legs",
  "feet",
]);

export function isArmorSlot(value: unknown): value is ArmorSlot {
  return typeof value === "string" && (ARMOR_SLOTS as readonly string[]).includes(value);
}
