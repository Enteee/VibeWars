import { EQUIPMENT_REQUIREMENT_RANK, type EquipmentRequirement } from "./types.js";

/**
 * Off-hand items (ADR-0012).
 *
 * Separate from `weapons.ts` rather than a `slot: "off-hand"` member of
 * the weapon catalog: a shield has no damage range, no attack interval
 * and no projectile, and modelling it as a weapon would mean six
 * nullable fields that are meaningless for two thirds of the catalog.
 * Under `exactOptionalPropertyTypes` that is worse than a second type.
 *
 * An off-hand may only be carried alongside a one-handed weapon, which
 * is the trade this whole system turns on: a shield's armor against a
 * two-handed weapon's damage.
 */

export type OffhandId = "shield" | "focus";

export type OffhandKind = "armor" | "energy";

export interface Offhand {
  readonly id: OffhandId;
  readonly name: string;
  readonly kind: OffhandKind;
  readonly requirement: EquipmentRequirement;
  /**
   * What it grants with the requirement unmet. You still benefit from
   * holding a shield you cannot really use — just much less.
   */
  readonly baseBonus: number;
  /** Added on top of `baseBonus` once the requirement is met. */
  readonly metRequirementBonus: number;
}

/**
 * The attributes a shield may be linked to.
 *
 * Only the martial-defensive and command attributes, which is what
 * makes a shield a warrior-and-paragon thing rather than universal
 * free armor for a caster who happens to have points spare.
 */
export const SHIELD_REQUIREMENT_ATTRIBUTES: readonly string[] = Object.freeze([
  "warrior.strength",
  "warrior.tactics",
  "paragon.leadership",
  "paragon.command",
  "paragon.motivation",
]);

export const OFFHANDS: Readonly<Record<OffhandId, Offhand>> = Object.freeze({
  shield: Object.freeze({
    id: "shield",
    name: "Shield",
    kind: "armor",
    requirement: Object.freeze({
      kind: "chosen",
      from: SHIELD_REQUIREMENT_ATTRIBUTES,
      rank: EQUIPMENT_REQUIREMENT_RANK,
    }),
    baseBonus: 8,
    metRequirementBonus: 8,
  } satisfies Offhand),

  focus: Object.freeze({
    id: "focus",
    name: "Focus",
    kind: "energy",
    // Any attribute the character can actually access: a focus is
    // whichever casting line you built around, the same way a wand is.
    requirement: Object.freeze({
      kind: "chosen",
      from: "any-accessible",
      rank: EQUIPMENT_REQUIREMENT_RANK,
    }),
    baseBonus: 6,
    metRequirementBonus: 6,
  } satisfies Offhand),
});

export function isOffhandId(value: unknown): value is OffhandId {
  return typeof value === "string" && Object.hasOwn(OFFHANDS, value);
}

export function getOffhand(id: string): Offhand | undefined {
  return isOffhandId(id) ? OFFHANDS[id] : undefined;
}

export const ALL_OFFHANDS: readonly Offhand[] = Object.freeze(Object.values(OFFHANDS));
