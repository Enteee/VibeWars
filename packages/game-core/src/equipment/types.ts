/**
 * Shared vocabulary for equipment (ADR-0012).
 *
 * Weapons, off-hands, runes and insignias all need to talk about damage
 * types and attribute requirements, and none of them should own those
 * definitions. They live here so the four catalogs stay siblings rather
 * than importing each other.
 */

/**
 * How a hit is classified.
 *
 * Deliberately only the physical split plus `untyped` — not the full
 * elemental spread. Slashing, piercing and blunt behave *identically* in
 * the simulation; they earn their place solely because the Stalwart
 * insignia ("armor vs physical") and the Absorption rune ("reduce
 * physical damage") need `isPhysicalDamage` to mean something. Adding
 * fire/cold/lightning/holy when nothing in the game reacts to them would
 * be exactly the decorative data `skills/coverage.ts` exists to prevent.
 */
export type DamageType = "slashing" | "piercing" | "blunt" | "untyped";

export function isPhysicalDamage(type: DamageType): boolean {
  return type !== "untyped";
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
