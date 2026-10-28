import { rollHitLocation } from "../equipment/armor.js";
import {
  isElementalDamage,
  isPhysicalDamage,
  type ArmorSlot,
  type DamageType,
} from "../equipment/types.js";
import type { ArmorCondition } from "../equipment/insignias.js";
import { MYSTICISM_ATTRIBUTE, mysticismArmor } from "../primary-attributes.js";
import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import { aggregateModifiers } from "./status.js";
import { armorReductionOf, effectiveMaxHealth, rankOf } from "./tick.js";
import type { Combatant, CreatureLevel } from "./types.js";

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
 * Where a hit came from. Armor itself is decided per part of the packet
 * (`armored`, `armorIgnoring`), not by the source: an attack skill's
 * bonus rides a weapon blow but ignores armor (#760).
 */
export type DamageSource = "weapon" | "skill" | "degeneration" | "life-steal";

export interface DamagePacket {
  /** Before mitigation; goes through the armor curve. */
  readonly armored: number;
  /**
   * Before mitigation; added after the armor curve. Holy, shadow and
   * typeless skill damage, an attack skill's "+N damage", degeneration
   * and life steal (GW1, #491/Q85).
   */
  readonly armorIgnoring: number;
  readonly type: DamageType;
  readonly source: DamageSource;
  /** Fraction of the target's armor ignored, 0..1. */
  readonly armorPenetration: number;
}

/** Skill damage of these types ignores armor (GW1). */
function ignoresArmor(type: DamageType): boolean {
  return type === "holy" || type === "shadow" || type === "typeless";
}

/** A skill's damage packet, of the effect's type and armor penetration. */
export function skillDamage(
  amount: number,
  type: DamageType,
  armorPenetration: number,
): DamagePacket {
  return ignoresArmor(type)
    ? { armored: 0, armorIgnoring: amount, type, source: "skill", armorPenetration }
    : { armored: amount, armorIgnoring: 0, type, source: "skill", armorPenetration };
}

/** Degeneration and life steal: armor never helps. */
export function unmitigatedDamage(amount: number, source: DamageSource): DamagePacket {
  return { armored: 0, armorIgnoring: amount, type: "typeless", source, armorPenetration: 0 };
}

/**
 * The piece a packet strikes (#1135), or `null` for one armor never
 * meets: holy, shadow and typeless damage, degeneration, life steal.
 * Those draw nothing; every armored packet draws one float, whatever the
 * target wears, so the stream never depends on gear.
 */
export type HitLocation = ArmorSlot | null;

export function hitLocationOf(packet: DamagePacket, rng: SimulationRng): HitLocation {
  return packet.armored > 0 ? rollHitLocation(rng) : null;
}

/**
 * The defender's armor against this packet, struck at `location`. Every
 * conditional bonus is answerable from the packet and the defender alone;
 * an insignia's only on a hit to its own piece (#1135).
 */
export function effectiveArmor(
  target: Combatant,
  packet: DamagePacket,
  location: HitLocation,
): number {
  let armor = target.equipment.baseArmor;

  const pieceArmor = location === null ? [] : target.equipment.pieceArmor[location];
  for (const bonus of [...target.equipment.conditionalArmor, ...pieceArmor]) {
    if (conditionHolds(bonus.condition, target, packet)) {
      armor += bonus.amount;
    }
  }
  // Mysticism (#874): +1 a rank while enchanted, by anyone.
  if (target.statuses.countByCategory("enchantment") > 0) {
    armor += mysticismArmor(rankOf(target, MYSTICISM_ATTRIBUTE));
  }

  // Cracked Armor (#763) before status modifiers: −20, never below 60,
  // and never a raise for armor already under it. Armor of Earth then
  // adds its full +24 even to a cracked caster.
  const reduction = armorReductionOf(target);
  if (reduction !== undefined) {
    armor -= Math.min(reduction.amount, Math.max(0, armor - reduction.floor));
  }

  // Armor of Earth (+24) and Healing Signet (−40) reach a consumer here for
  // the first time; "Stand Your Ground!"'s +24 only while standing (#921).
  const modifiers = aggregateModifiers(target.statuses.active);
  armor += modifiers.armorModifier;
  if (!target.moving) {
    armor += modifiers.armorWhileStill;
  }

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
 * armor existed, against the 60-armor casters they were tuned against,
 * and why letting holy, shadow and typeless damage and attack-skill
 * bonuses ignore armor (#760) changed nothing against a caster.
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
export function mitigate(
  packet: DamagePacket,
  target: Combatant,
  rules: CombatRules,
  location: HitLocation,
): number {
  if (packet.armored + packet.armorIgnoring <= 0) {
    return 0;
  }

  // Winnowing's +4 (#1064): on the bearer of every physical hit, before
  // armor, so a fixed "deals only N" hit takes it too.
  const modifiers = aggregateModifiers(target.statuses.active);
  const armored =
    packet.armored + (isPhysicalDamage(packet.type) ? modifiers.physicalDamageTakenBonus : 0);
  const armor = effectiveArmor(target, packet, location);
  let dealt = armored * armorMultiplier(armor, rules) + packet.armorIgnoring;

  // Frenzy's double and Dark Escape's half (#919): every packet, armored
  // or not, after armor and before the flat shield below.
  dealt *= modifiers.damageTakenMultiplier;

  // Call of Protection (#1108): a flat cut off every packet, after
  // armor and the multiplier, before Rune of Absorption.
  dealt -= modifiers.damageReduction;

  // Rune of Absorption, last and only against physical hits. After
  // mitigation on purpose: it is a flat shield against each blow, so it
  // is proportionally worth most against the many small hits an
  // auto-attack chain produces, which is the niche it exists to fill.
  if (isPhysicalDamage(packet.type)) {
    dealt -= target.equipment.flatPhysicalReduction;
  }

  // Protective Spirit (#936), after everything else: no single hit takes
  // more than its share of the target's max health, deep wound's lower
  // max included, however much armor, Frenzy or a crit gave it.
  if (modifiers.maxDamageFractionPerHit !== undefined) {
    dealt = Math.min(
      dealt,
      Math.floor(modifiers.maxDamageFractionPerHit * effectiveMaxHealth(target)),
    );
  }

  return Math.max(0, Math.round(dealt));
}

/**
 * What a creature's summoner's `rank` does to its blows (#1131): its GW1
 * level, linear in the rank, against its level at 12, to the power 1.5.
 * No source gives a formula; this one fits GWW's damage tables for Bone
 * Minion and Bone Horror within about a point at every rank 0-12.
 */
export function creatureDamageMultiplier(rank: number, levels: CreatureLevel): number {
  const level = (at: number): number =>
    levels.atZero + ((levels.atTwelve - levels.atZero) * at) / 12;
  return Math.pow(level(Math.max(0, rank)) / level(12), 1.5);
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
