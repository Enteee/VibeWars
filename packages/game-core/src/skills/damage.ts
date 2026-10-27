import { isElementalDamage, isPhysicalDamage, type DamageType } from "../equipment/types.js";
import type { ArmorCondition } from "../equipment/insignias.js";
import type { CombatRules } from "../ruleset.js";
import { aggregateModifiers } from "./status.js";
import { armorReductionOf } from "./tick.js";
import type { Combatant } from "./types.js";

/**
 * The damage pipeline (ADR-0012).
 *
 * Every point of damage in the game funnels through here, which is the
 * point: before this module, `applyDamage` subtracted a number from
 * health and `StatusDefinition.armorModifier` was data nothing read.
 * Weakness said "-20 armor" in its tooltip and did nothing; Armor of
 * Earth claimed "+24 armor" and did nothing. One pipeline means a stat
 * either works everywhere or nowhere, and it is obvious which.
 */

/**
 * Where a hit came from, which decides whether armor applies.
 *
 * Armor stops weapons and spells. It does not stop health slipping away
 * from a condition, or life being drained directly — those bypass it,
 * which is what makes degeneration a genuinely different threat to a
 * heavily-armored target rather than just a smaller version of the same
 * one.
 */
export type DamageSource = "weapon" | "spell" | "degeneration" | "life-steal";

export interface DamagePacket {
  /** Before mitigation. */
  readonly amount: number;
  readonly type: DamageType;
  readonly source: DamageSource;
  /** Fraction of the target's armor ignored, 0..1. */
  readonly armorPenetration: number;
}

export function respectsArmor(source: DamageSource): boolean {
  return source === "weapon" || source === "spell";
}

/** A spell's damage packet: armor-respecting, of the effect's type, no penetration. */
export function spellDamage(amount: number, type: DamageType): DamagePacket {
  return { amount, type, source: "spell", armorPenetration: 0 };
}

/** Degeneration and life steal: armor never helps. */
export function unmitigatedDamage(amount: number, source: DamageSource): DamagePacket {
  return { amount, type: "typeless", source, armorPenetration: 0 };
}

/**
 * The defender's armor against this packet. Every conditional bonus is
 * answerable from the packet and the defender alone.
 */
export function effectiveArmor(target: Combatant, packet: DamagePacket): number {
  let armor = target.equipment.baseArmor;

  for (const bonus of target.equipment.conditionalArmor) {
    if (conditionHolds(bonus.condition, target, packet)) {
      armor += bonus.amount;
    }
  }

  // Cracked Armor (#763) before status modifiers: −20, never below 60,
  // and never a raise for armor already under it. Armor of Earth then
  // adds its full +24 even to a cracked caster.
  const reduction = armorReductionOf(target);
  if (reduction !== undefined) {
    armor -= Math.min(reduction.amount, Math.max(0, armor - reduction.floor));
  }

  // Weakness (-20) and Armor of Earth (+24) reach a consumer here for
  // the first time.
  armor += aggregateModifiers(target.statuses.active).armorModifier;

  // Penetration is a fraction of what is left, applied last, so a shield
  // and an enchantment both dilute it rather than being bypassed flat.
  armor *= 1 - packet.armorPenetration;

  // Armor may be driven negative by stacked debuffs; the curve handles
  // that fine (it simply amplifies damage), but a floor keeps the
  // exponent from running away.
  return Math.max(-rulesFloor, armor);
}

function conditionHolds(
  condition: ArmorCondition,
  target: Combatant,
  packet: DamagePacket,
): boolean {
  switch (condition) {
    case "vs-physical":
      return isPhysicalDamage(packet.type);
    case "vs-elemental":
      return isElementalDamage(packet.type);
    case "while-enchanted":
      return target.statuses.countByCategory("enchantment") > 0;
  }
}

/** How far below zero effective armor may go before it stops mattering. */
const rulesFloor = 100;

/**
 * Apply the armor curve.
 *
 * `2^((reference - armor) / halving)`: damage doubles for every
 * `halving` points of armor below the reference and halves for every
 * `halving` above. At the reference it is exactly 1.0 — which is why
 * every skill in the catalog still deals precisely what it dealt before
 * armor existed, against the 60-armor casters they were tuned against.
 */
export function armorMultiplier(armor: number, rules: CombatRules): number {
  return Math.pow(2, (rules.armorReferenceLevel - armor) / rules.armorHalvingPoints);
}

/**
 * How much damage a packet actually does to this target.
 *
 * Rounded once, at the end. Rounding earlier would make a long fight
 * drift away from the arithmetic by a few points per hit.
 */
export function mitigate(packet: DamagePacket, target: Combatant, rules: CombatRules): number {
  if (packet.amount <= 0) {
    return 0;
  }
  if (!respectsArmor(packet.source)) {
    return packet.amount;
  }

  const armor = effectiveArmor(target, packet);
  let dealt = packet.amount * armorMultiplier(armor, rules);

  // Rune of Absorption, last and only against physical hits. After
  // mitigation on purpose: it is a flat shield against each blow, so it
  // is proportionally worth most against the many small hits an
  // auto-attack chain produces, which is the niche it exists to fill.
  if (isPhysicalDamage(packet.type)) {
    dealt -= target.equipment.flatPhysicalReduction;
  }

  return Math.max(0, Math.round(dealt));
}

/**
 * The attribute multiplier on weapon damage.
 *
 * Pivots on rank 12, not on the weapon's requirement of 9: at the pivot
 * the exponent is zero and the weapon deals exactly its stated damage,
 * which is what "a max-damage weapon" has to mean for the catalog
 * numbers to be readable. Above the pivot — reachable only with runes —
 * the slope flattens, so a superior rune is a bonus rather than a
 * second doubling.
 */
export function weaponAttributeMultiplier(rank: number, rules: CombatRules): number {
  const under = Math.min(rules.damageRankPivot, Math.max(0, rank));
  const over = Math.max(0, rank - rules.damageRankPivot);
  const exponent =
    (rules.damageRankSlopeUnder * under +
      rules.damageRankSlopeOver * over -
      rules.damageRankSlopeUnder * rules.damageRankPivot) /
    rules.armorHalvingPoints;
  return Math.pow(2, exponent);
}
