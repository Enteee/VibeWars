import { AREA_ADJACENT } from "../distances.js";
import type { ResolvedWeapon } from "../equipment/resolve.js";
import { isPhysicalDamage } from "../equipment/types.js";
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
  applyEffect,
  applySkillEffects,
  gainEnergy,
  interruptIfCastingSpell,
  type CombatEvent,
  type SkillResolution,
} from "./effects.js";
import { resolveMagnitude } from "./scaling.js";
import { aggregateModifiers, getStatusDefinition, type StatusId } from "./status.js";
import { nearestFirst, type TargetCandidate } from "./targeting.js";
import { attackMissChanceOf, blockChanceOf, rankOf, weaponDamageMultiplierOf } from "./tick.js";
import type { Combatant, Skill, SkillEffect } from "./types.js";

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

/** The length of this combatant's swing with the weapon it holds, attack speed included. */
export function swingIntervalSeconds(combatant: Combatant): number {
  return attackDurationSeconds(
    combatant,
    combatant.equipment.mainHand.weapon.attackIntervalSeconds,
  );
}

/**
 * The swing under way, as the wire carries it (#560): seconds into it and
 * its whole length, the hit landing at the end; both 0 when not attacking.
 * Paused, `elapsed` holds; a reset starts it at 0 again.
 */
export function swingProgress(combatant: Combatant): {
  readonly elapsed: number;
  readonly total: number;
} {
  const { attack } = combatant;
  return attack === undefined
    ? { elapsed: 0, total: 0 }
    : { elapsed: attack.swingElapsed, total: swingIntervalSeconds(combatant) };
}

/** The attacker's rank in `attributeId` right now: 0 for fists, which have none. */
function rankIn(attacker: Combatant, attributeId: string | undefined): number {
  return attributeId === undefined ? 0 : rankOf(attacker, attributeId);
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
 * attribute and in Critical Strikes, whether that rank meets the weapon's
 * requirement, and what the attacker's statuses do to its roll. Taken as
 * the blow lands, so weakness that ran out or set in mid-swing counts as
 * it stands then (#762). A projectile carries the one it was released
 * with, so gear swapped in flight changes nothing.
 */
export interface WeaponSnapshot {
  readonly mainHand: ResolvedWeapon;
  readonly rank: number;
  readonly criticalStrikes: number;
  /** `rank` meets the weapon's requirement; fists and caster weapons nobody nominated always do. */
  readonly requirementMet: boolean;
  /** The multiplier on the weapon's roll: weakness's 0.34 (#762). */
  readonly damageMultiplier: number;
}

export function weaponSnapshotOf(attacker: Combatant): WeaponSnapshot {
  const { mainHand } = attacker.equipment;
  const rank = rankIn(attacker, mainHand.attributeId);
  return {
    mainHand,
    rank,
    criticalStrikes: rankIn(attacker, CRITICAL_STRIKES_ATTRIBUTE),
    requirementMet: mainHand.attributeId === undefined || rank >= mainHand.weapon.requirement.rank,
    damageMultiplier: weaponDamageMultiplierOf(attacker),
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
  gainEnergy(attacker, criticalStrikesEnergy(rank), events);
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
 * An attack reached `victim`, hit or blocked (#524): it counts against
 * each of its statuses that ends after so many, once the blow is done,
 * so the last attack one lasts for still meets it. A blind miss, a dodge
 * or an obstructed shot never reaches it, and does not count.
 */
export function attackReached(victim: Combatant, events: CombatEvent[]): void {
  for (const statusId of victim.statuses.countIncomingAttack()) {
    events.push({ kind: "status-expired", targetId: victim.id, statusId });
  }
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

/** The blow `skill` makes of `caster`'s weapon, its bonus at the caster's ranks. */
export function skillBlow(skill: Skill, caster: Combatant): BlowRule {
  const bonusDamage = skill.attack?.bonusDamage;
  return {
    weaponDamage: skill.attack?.weaponDamage ?? PLAIN_BLOW.weaponDamage,
    bonus: bonusDamage === undefined ? 0 : resolveMagnitude(bonusDamage, caster),
    strengthRank: rankIn(caster, STRENGTH_ATTRIBUTE),
  };
}

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
 *
 * A dazed victim casting a spell is interrupted first, before the
 * damage (#546): every landed attack comes here, a swing, an attack
 * skill or an arrow, and a miss or a block never does.
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
  if (victim.statuses.active.some(({ id }) => getStatusDefinition(id).interruptsSpells)) {
    interruptIfCastingSpell(victim, events);
  }
  const { weapon } = snapshot.mainHand;
  const rolledCritical = rng.nextFloat() < criticalChance(snapshot, rules);
  const critical = rolledCritical || (exposed && weapon.projectileSpeed === undefined);
  const base = critical
    ? weapon.damageMax * weapon.criticalMultiplier
    : rng.nextInt(weapon.damageMin, weapon.damageMax + 1);
  const packet: DamagePacket = {
    amount:
      base *
        snapshot.damageMultiplier *
        blow.weaponDamage *
        weaponAttributeMultiplier(snapshot.rank, rules) *
        (snapshot.requirementMet ? 1 : rules.unmetRequirementMultiplier) +
      blow.bonus,
    type: weapon.damageType,
    source: "weapon",
    armorPenetration: strengthArmorPenetration(blow.strengthRank, weapon.armorPenetration),
  };
  applyDamage(victim, mitigate(packet, victim, rules), critical, events);
  return critical;
}

/**
 * What the attacker's statuses add to a blow of `weapon` that hit
 * `victim` (#525): every active status's `onAttackHit`, as Apply
 * Poison's poison. Read when the blow lands, so a preparation that ran
 * out mid-swing or mid-flight adds nothing. Physical attacks only, as GW1
 * says: a wand's or a staff's bolt carries none.
 */
export function attackHitRiders(
  attacker: Combatant,
  victim: Combatant,
  weapon: Weapon,
  rng: SimulationRng,
  rules: CombatRules,
): CombatEvent[] {
  if (!isPhysicalDamage(weapon.damageType)) {
    return [];
  }
  return attacker.statuses.active.flatMap(({ id }) =>
    getStatusDefinition(id).onAttackHit.flatMap((effect) =>
      applyEffect(effect, { caster: attacker, target: victim, rng, rules }),
    ),
  );
}

/**
 * The attacker attacked (#758): it struck a blow or released a shot,
 * swing or attack skill alike, hit or miss. Every status of its own that
 * ends when its bearer attacks ends now, as Weapon of Warding.
 */
export function bearerAttacked(attacker: Combatant, events: CombatEvent[]): void {
  for (const statusId of attacker.statuses.endOnBearerAttack()) {
    events.push({ kind: "status-expired", targetId: attacker.id, statusId });
  }
}

/**
 * What the attacker's next attack skill carries (#758): the statuses that
 * hold it, as Anthem of Flame, and their riders on whoever it hits. Taken
 * when the skill is used, so a ranged one carries them in flight.
 */
export interface NextAttackSkill {
  readonly statusIds: readonly StatusId[];
  readonly effects: readonly SkillEffect[];
}

export function nextAttackSkillOf(attacker: Combatant): NextAttackSkill {
  const holding = attacker.statuses.active.flatMap(({ id }) => {
    const effects = getStatusDefinition(id).nextAttackSkill;
    return effects === undefined ? [] : [{ id, effects }];
  });
  return {
    statusIds: holding.map(({ id }) => id),
    effects: holding.flatMap(({ effects }) => effects),
  };
}

/** The riders `next` lands on a victim an attack skill hit (#758). */
export function nextAttackSkillRiders(
  next: NextAttackSkill,
  attacker: Combatant,
  victim: Combatant,
  rng: SimulationRng,
  rules: CombatRules,
): CombatEvent[] {
  return next.effects.flatMap((effect) =>
    applyEffect(effect, { caster: attacker, target: victim, rng, rules }),
  );
}

/**
 * The attack skill that `next` rode was released (#782): its blow struck,
 * or its shots left the bow. The statuses that held it end, those still
 * up; their riders travel with the blow or the shots.
 */
export function useNextAttackSkill(
  attacker: Combatant,
  next: NextAttackSkill,
  events: CombatEvent[],
): void {
  for (const statusId of next.statusIds) {
    if (attacker.statuses.remove(statusId)) {
      events.push({ kind: "status-expired", targetId: attacker.id, statusId });
    }
  }
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
    attackReached(victim, events);
    return;
  }
  const snapshot = weaponSnapshotOf(attacker);
  if (landBlow(snapshot, victim, PLAIN_BLOW, swing.exposed(victim), rng, rules, events)) {
    gainCriticalEnergy(attacker, snapshot.criticalStrikes, events);
  }
  events.push(...attackHitRiders(attacker, victim, snapshot.mainHand.weapon, rng, rules));
  attackReached(victim, events);
}

/**
 * Resolve one landed swing: every hit and miss of it, double strike and
 * cleave included, in the order they happened.
 *
 * A double strike is a second, identical swing at once, with its own
 * blind, block, crit and damage rolls; it is rolled only for a weapon that can, for
 * the same reason as the miss. `doubleStrike` says it struck twice, missed
 * blows included, so the off hand can stab after the main one (#561).
 */
export function resolveSwing(swing: Swing): {
  readonly events: CombatEvent[];
  readonly doubleStrike: boolean;
} {
  const { weapon } = swing.attacker.equipment.mainHand;
  const victims = victimsOf(swing, weapon);
  const chance = doubleStrikeChance(swing.attacker, weapon);
  const strikes = chance > 0 && swing.rng.nextFloat() < chance ? 2 : 1;

  const events: CombatEvent[] = [];
  bearerAttacked(swing.attacker, events);
  for (let blow = 0; blow < strikes; blow += 1) {
    for (const victim of victims) {
      strike(swing, victim, events);
    }
  }
  return { events, doubleStrike: strikes === 2 };
}

/**
 * Resolve an attack skill at its hit (ADR-0029): one blow of the weapon on
 * each victim, the primary first, with the skill's bonus added before
 * armor. A victim the blow misses (blind) gets none of the skill's
 * riders; the ones it hits get them all. A victim that blocks gets the
 * skill's `onBlocked` effects instead (#534); an `unblockable` one rolls
 * no block at all (Wild Throw, #523). No double strike and no
 * cleave: an area, as Barrage's, is already the skill's own, and each of
 * its blows rolls its own block and its own crit.
 *
 * The attacker's weapon spell ends as it strikes, and its chants' riders
 * (#758) land on each victim it hits after the skill's own blow; the
 * chants end once every blow is done, whatever each did.
 *
 * A ranged weapon's attack skill does not come here: it flies, and its
 * blow and riders land with the arrow (#416).
 */
export function resolveAttackSkill(
  resolution: SkillResolution,
  exposed: (victim: Combatant) => boolean,
): CombatEvent[] {
  const { skill, caster, rng, rules } = resolution;
  const blow = skillBlow(skill, caster);
  const snapshot = weaponSnapshotOf(caster);
  const kind = blowKind(snapshot.mainHand.weapon);
  const events: CombatEvent[] = [];
  bearerAttacked(caster, events);
  const next = nextAttackSkillOf(caster);
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
    if (skill.attack?.unblockable !== true && blocks(victim, kind, rng)) {
      events.push({ kind: "attack-blocked", targetId: victim.id });
      attackReached(victim, events);
      blocked.push(victim);
      continue;
    }
    if (landBlow(snapshot, victim, blow, exposed(victim), rng, rules, events)) {
      gainCriticalEnergy(caster, snapshot.criticalStrikes, events);
    }
    events.push(...attackHitRiders(caster, victim, snapshot.mainHand.weapon, rng, rules));
    events.push(...nextAttackSkillRiders(next, caster, victim, rng, rules));
    attackReached(victim, events);
    hit.push(victim);
  }
  useNextAttackSkill(caster, next, events);
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
