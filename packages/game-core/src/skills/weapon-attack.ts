import { AREA_ADJACENT } from "../distances.js";
import type { Weapon } from "../equipment/weapons.js";
import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import { distance } from "../vec2.js";
import { mitigate, weaponAttributeMultiplier, type DamagePacket } from "./damage.js";
import { applyDamage, type CombatEvent } from "./effects.js";
import { nearestFirst, type TargetCandidate } from "./targeting.js";
import { attackMissChanceOf } from "./tick.js";
import type { Combatant } from "./types.js";

/**
 * Weapon auto-attack: what one swing does once it lands (ADR-0026).
 *
 * When a swing lands, and who it is aimed at, is the simulation's
 * business: approach, the swing timer, skills interrupting it. This module
 * only answers "a swing landed on this target; what happened", so the
 * projectiles of #159 can land through the same function as a sword.
 */

/** A combatant's auto-attack: who at, and how far into the current swing. */
export interface AttackState {
  readonly targetId: string;
  /** Seconds into the swing in progress; it lands at the weapon's interval. */
  swingElapsed: number;
}

export interface Swing {
  readonly attacker: Combatant;
  readonly target: TargetCandidate;
  /** Everyone a scythe could cleave into, in any order. */
  readonly candidates: readonly TargetCandidate[];
  readonly rng: SimulationRng;
  readonly rules: CombatRules;
}

/** The attacker's rank in `attributeId`: 0 for fists, which have none. */
function rankIn(attacker: Combatant, attributeId: string | undefined): number {
  return attributeId === undefined ? 0 : (attacker.attributeRanks.get(attributeId) ?? 0);
}

/** The chance this attacker's swing strikes twice: daggers only. */
export function doubleStrikeChance(attacker: Combatant, weapon: Weapon): number {
  const rule = weapon.doubleStrike;
  if (rule === undefined) {
    return 0;
  }
  return Math.min(1, rule.baseChance + rule.perRank * rankIn(attacker, rule.attributeId));
}

/**
 * Who a swing at `target` hits: the target, then up to `cleaveTargets`
 * other living foes adjacent to it, nearest first. Weapon reach is
 * checked before the swing lands, so the target itself is never filtered.
 */
function victimsOf(swing: Swing, weapon: Weapon): readonly Combatant[] {
  if (weapon.cleaveTargets === 0) {
    return [swing.target.combatant];
  }
  const { attacker, target } = swing;
  const adjacent = swing.candidates.filter(
    ({ combatant, position }) =>
      !combatant.dead &&
      combatant.id !== target.combatant.id &&
      combatant.team !== attacker.team &&
      distance(position, target.position) <= AREA_ADJACENT,
  );
  return [
    target.combatant,
    ...nearestFirst(adjacent, target.position).slice(0, weapon.cleaveTargets),
  ];
}

/**
 * One blow on one victim: blind first, then the damage roll.
 *
 * The miss is rolled only when there is a chance to miss, as for attack
 * skills, so an unblinded fight's random stream does not move.
 */
function strike(swing: Swing, victim: Combatant, events: CombatEvent[]): void {
  const { attacker, rng, rules } = swing;
  if (victim.dead) {
    return;
  }
  const chance = attackMissChanceOf(attacker);
  if (chance > 0 && rng.nextFloat() < chance) {
    events.push({ kind: "attack-missed", targetId: victim.id });
    return;
  }
  const { weapon, attributeId, requirementMet } = attacker.equipment.mainHand;
  const base = rng.nextInt(weapon.damageMin, weapon.damageMax + 1);
  const packet: DamagePacket = {
    amount:
      base *
      weaponAttributeMultiplier(rankIn(attacker, attributeId), rules) *
      (requirementMet ? 1 : rules.unmetRequirementMultiplier),
    type: weapon.damageType,
    source: "weapon",
    armorPenetration: weapon.armorPenetration,
  };
  applyDamage(victim, mitigate(packet, victim, rules), events);
}

/**
 * Resolve one landed swing: every hit and miss of it, double strike and
 * cleave included, in the order they happened.
 *
 * A double strike is a second, identical swing at once, with its own
 * blind and damage rolls; it is rolled only for a weapon that can, for
 * the same reason as the miss.
 */
export function resolveSwing(swing: Swing): CombatEvent[] {
  const { weapon } = swing.attacker.equipment.mainHand;
  const victims = victimsOf(swing, weapon);
  const chance = doubleStrikeChance(swing.attacker, weapon);
  const strikes = chance > 0 && swing.rng.nextFloat() < chance ? 2 : 1;

  const events: CombatEvent[] = [];
  for (let blow = 0; blow < strikes; blow += 1) {
    for (const victim of victims) {
      strike(swing, victim, events);
    }
  }
  return events;
}
