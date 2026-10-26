import { AREA_ADJACENT } from "../distances.js";
import type { ResolvedWeapon } from "../equipment/resolve.js";
import type { Weapon } from "../equipment/weapons.js";
import {
  CRITICAL_STRIKES_ATTRIBUTE,
  CRITICAL_STRIKES_CHANCE_PER_RANK,
  criticalStrikesEnergy,
  STRENGTH_ATTRIBUTE,
  strengthArmorPenetration,
} from "../primary-attributes.js";
import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import { distance } from "../vec2.js";
import { mitigate, weaponAttributeMultiplier, type DamagePacket } from "./damage.js";
import {
  applyDamage,
  applySkillEffects,
  type CombatEvent,
  type SkillResolution,
} from "./effects.js";
import { resolveMagnitude } from "./scaling.js";
import { aggregateModifiers } from "./status.js";
import { nearestFirst, type TargetCandidate } from "./targeting.js";
import { attackMissChanceOf, blockChanceOf } from "./tick.js";
import type { Combatant } from "./types.js";

/**
 * Weapon auto-attack: what one swing does once it lands (ADR-0026).
 *
 * When a swing lands, and who it is aimed at, is the simulation's
 * business: approach, the swing timer, skills interrupting it. This module
 * only answers "a swing landed on this target; what happened", and a
 * projectile lands through the same blow as a sword (`landBlow`).
 */

/** A combatant's auto-attack: who at, and how far into the current swing. */
export interface AttackState {
  readonly targetId: string;
  /** Seconds into the swing in progress; it lands at the weapon's interval. */
  swingElapsed: number;
  /**
   * Seconds in a row the approach has found no path (#218). A body shoved
   * into a concave corner can fail one search and walk free the next, so
   * the attack ends only once this reaches `unreachableAfterSeconds`.
   */
  unreachableSeconds: number;
}

export interface Swing {
  readonly attacker: Combatant;
  readonly target: TargetCandidate;
  /** Everyone a scythe could cleave into, in any order. */
  readonly candidates: readonly TargetCandidate[];
  readonly rng: SimulationRng;
  readonly rules: CombatRules;
  /** Whether `victim` is moving with its back to the attacker: a melee blow then always crits. */
  readonly exposed: (victim: Combatant) => boolean;
}

/**
 * How long an attack of `baseSeconds` takes this combatant, after
 * attack-speed effects (ADR-0029): a swing's interval, or an attack
 * skill's whole duration. Cast-speed effects do not apply.
 */
export function attackDurationSeconds(combatant: Combatant, baseSeconds: number): number {
  return baseSeconds * aggregateModifiers(combatant.statuses.active).attackDurationMultiplier;
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
 * What a blow is struck with: the weapon, the attacker's rank in its
 * attribute and in Critical Strikes. A projectile carries the one it was
 * released with, so gear swapped in flight changes nothing.
 */
export interface WeaponSnapshot {
  readonly mainHand: ResolvedWeapon;
  readonly rank: number;
  readonly criticalStrikes: number;
}

export function weaponSnapshotOf(attacker: Combatant): WeaponSnapshot {
  const { mainHand } = attacker.equipment;
  return {
    mainHand,
    rank: rankIn(attacker, mainHand.attributeId),
    criticalStrikes: rankIn(attacker, CRITICAL_STRIKES_ATTRIBUTE),
  };
}

/**
 * The chance a blow of this snapshot crits (#533): the base chance plus a
 * share per rank in the weapon's mastery, the attribute its requirement
 * names, plus Critical Strikes' (#606). A caster weapon's nominated
 * attribute is no mastery, and fists have none, so both crit at the base
 * chance and Critical Strikes'.
 */
export function criticalChance(snapshot: WeaponSnapshot, rules: CombatRules): number {
  const mastery = snapshot.mainHand.weapon.requirement.kind === "fixed" ? snapshot.rank : 0;
  return Math.min(
    1,
    rules.criticalBaseChance +
      rules.criticalChancePerRank * mastery +
      CRITICAL_STRIKES_CHANCE_PER_RANK * snapshot.criticalStrikes,
  );
}

/**
 * Critical Strikes' energy for a critical blow (#606), up to the
 * attacker's maximum. A dead attacker, as one whose arrow lands after it
 * fell, gains none.
 */
export function gainCriticalEnergy(attacker: Combatant, rank: number, events: CombatEvent[]): void {
  const amount = criticalStrikesEnergy(rank);
  if (attacker.dead || amount <= 0) {
    return;
  }
  const applied = Math.min(amount, attacker.maxEnergy - attacker.energy);
  if (applied <= 0) {
    return;
  }
  attacker.energy += applied;
  events.push({ kind: "energy-gain", targetId: attacker.id, amount: applied });
}

/**
 * Whether a blinded attacker's blow misses.
 *
 * Rolled only when there is a chance to miss, as for attack skills, so
 * an unblinded fight's random stream does not move.
 */
export function blindMisses(attacker: Combatant, rng: SimulationRng): boolean {
  const chance = attackMissChanceOf(attacker);
  return chance > 0 && rng.nextFloat() < chance;
}

/** Whether a blow of this weapon is a projectile or a melee blow, as a block sees it. */
export function blowKind(weapon: Weapon): "melee" | "projectile" {
  return weapon.projectileSpeed === undefined ? "melee" : "projectile";
}

/**
 * Whether `victim` blocks a blow of this kind (#534), rolled after blind
 * and before the damage roll. Rolled only when there is a chance to
 * block, as blind is, so a fight without blocking keeps its random stream.
 */
export function blocks(
  victim: Combatant,
  kind: "melee" | "projectile",
  rng: SimulationRng,
): boolean {
  const chance = blockChanceOf(victim, kind);
  return chance > 0 && rng.nextFloat() < chance;
}

/**
 * What an attack skill makes of a blow (ADR-0029): the weapon's roll times
 * `weaponDamage`, plus `bonus`.
 */
export interface BlowRule {
  readonly weaponDamage: number;
  readonly bonus: number;
  /**
   * The Strength rank that gives the blow armor penetration (#528): the
   * caster's for an attack skill, 0 for a plain swing, which Strength
   * does not help.
   */
  readonly strengthRank: number;
}

/** A swing of the weapon and nothing else. */
export const PLAIN_BLOW: BlowRule = { weaponDamage: 1, bonus: 0, strengthRank: 0 };

/**
 * A blow that connects: the crit roll, then the damage roll as `blow`
 * says, mitigated once by the victim's armor. One that deals nothing
 * still connected, so an attack skill's riders go on.
 *
 * The crit roll is drawn for every blow; a crit, rolled or because the
 * victim is exposed, then skips the damage roll, so the stream does
 * depend on who stands where, deterministically. A crit takes the weapon's maximum times its
 * `criticalMultiplier` instead of rolling; an attack skill's bonus is
 * added after, unmultiplied. A melee blow at an `exposed` victim always
 * crits; a projectile never does that way, however it lands. Returns
 * whether the blow crit.
 */
export function landBlow(
  snapshot: WeaponSnapshot,
  victim: Combatant,
  blow: BlowRule,
  exposed: boolean,
  rng: SimulationRng,
  rules: CombatRules,
  events: CombatEvent[],
): boolean {
  const { weapon, requirementMet } = snapshot.mainHand;
  const rolledCritical = rng.nextFloat() < criticalChance(snapshot, rules);
  const critical = rolledCritical || (exposed && weapon.projectileSpeed === undefined);
  const base = critical
    ? weapon.damageMax * weapon.criticalMultiplier
    : rng.nextInt(weapon.damageMin, weapon.damageMax + 1);
  const packet: DamagePacket = {
    amount:
      base *
        blow.weaponDamage *
        weaponAttributeMultiplier(snapshot.rank, rules) *
        (requirementMet ? 1 : rules.unmetRequirementMultiplier) +
      blow.bonus,
    type: weapon.damageType,
    source: "weapon",
    armorPenetration: strengthArmorPenetration(blow.strengthRank, weapon.armorPenetration),
  };
  applyDamage(victim, mitigate(packet, victim, rules), critical, events);
  return critical;
}

/** One blow on one victim: blind first, then block, then the crit and damage rolls. */
function strike(swing: Swing, victim: Combatant, events: CombatEvent[]): void {
  const { attacker, rng, rules } = swing;
  if (victim.dead) {
    return;
  }
  if (blindMisses(attacker, rng)) {
    events.push({ kind: "attack-missed", targetId: victim.id });
    return;
  }
  if (blocks(victim, "melee", rng)) {
    events.push({ kind: "attack-blocked", targetId: victim.id });
    return;
  }
  const snapshot = weaponSnapshotOf(attacker);
  if (landBlow(snapshot, victim, PLAIN_BLOW, swing.exposed(victim), rng, rules, events)) {
    gainCriticalEnergy(attacker, snapshot.criticalStrikes, events);
  }
}

/**
 * Resolve one landed swing: every hit and miss of it, double strike and
 * cleave included, in the order they happened.
 *
 * A double strike is a second, identical swing at once, with its own
 * blind, block, crit and damage rolls; it is rolled only for a weapon that can, for
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

/**
 * Resolve an attack skill at its hit (ADR-0029): one blow of the weapon on
 * each victim, the primary first, with the skill's bonus added before
 * armor. A victim the blow misses (blind) gets none of the skill's
 * riders; the ones it hits get them all. A victim that blocks gets the
 * skill's `onBlocked` effects instead (#534). No double strike and no
 * cleave: an area, as Barrage's, is already the skill's own, and each of
 * its blows rolls its own block and its own crit.
 */
export function resolveAttackSkill(
  resolution: SkillResolution,
  exposed: (victim: Combatant) => boolean,
): CombatEvent[] {
  const { skill, caster, rng, rules } = resolution;
  const bonusDamage = skill.attack?.bonusDamage;
  const blow: BlowRule = {
    weaponDamage: skill.attack?.weaponDamage ?? PLAIN_BLOW.weaponDamage,
    bonus: bonusDamage === undefined ? 0 : resolveMagnitude(bonusDamage, caster),
    strengthRank: rankIn(caster, STRENGTH_ATTRIBUTE),
  };
  const snapshot = weaponSnapshotOf(caster);
  const kind = blowKind(snapshot.mainHand.weapon);
  const events: CombatEvent[] = [];
  const hit: Combatant[] = [];
  const blocked: Combatant[] = [];
  for (const victim of resolution.targets) {
    if (victim.dead) {
      continue;
    }
    if (blindMisses(caster, rng)) {
      events.push({ kind: "attack-missed", targetId: victim.id });
      continue;
    }
    if (blocks(victim, kind, rng)) {
      events.push({ kind: "attack-blocked", targetId: victim.id });
      blocked.push(victim);
      continue;
    }
    if (landBlow(snapshot, victim, blow, exposed(victim), rng, rules, events)) {
      gainCriticalEnergy(caster, snapshot.criticalStrikes, events);
    }
    hit.push(victim);
  }
  return [
    ...events,
    ...applySkillEffects({ ...resolution, targets: hit }),
    ...(blocked.length === 0 || skill.attack === undefined
      ? []
      : applySkillEffects({
          ...resolution,
          skill: { ...skill, effects: skill.attack.onBlocked },
          targets: blocked,
        })),
  ];
}
