import { AREA_ADJACENT } from "../distances.js";
import type { ResolvedWeapon, WeaponHitMods } from "../equipment/resolve.js";
import { type DamageType } from "../equipment/types.js";
import { modWhileHolds } from "./mod-conditions.js";
import { isCasterWeapon, wieldsFor, type Weapon } from "../equipment/weapons.js";
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
import { chainAllows, markChain } from "./chain.js";
import { hitLocationOf, mitigate, weaponAttributeMultiplier, type DamagePacket } from "./damage.js";
import {
  applyDamage,
  applyEffects,
  gainEnergy,
  gainHealth,
  interruptOnHit,
  loseHealth,
  resolveSkillEffects,
  stateHolds,
  stealLife,
  withPerCount,
  type CombatEvent,
  type SkillOutcome,
  type SkillResolution,
} from "./effects.js";
import { resolveMagnitude } from "./scaling.js";
import {
  aggregateModifiers,
  attacksAgainstMiss,
  damageTypeDealt,
  damageTypeTaken,
  getStatusDefinition,
  physicalDamageDealtAsOf,
  isSuppressed,
  type AttackHitRider,
  type StatusId,
} from "./status.js";
import { nearestFirst, type TargetCandidate } from "./targeting.js";
import {
  attackDamageDeltaOf,
  attackDamageTypeOf,
  attackMissChanceOf,
  blockingStatusesOf,
  combinedBlockChance,
  effectiveMaxHealth,
  rankOf,
  weaponDamageMultiplierOf,
} from "./tick.js";
import type { FiredTrigger } from "./triggers.js";
import {
  blowRuleOf,
  type Combatant,
  type Skill,
  type SkillEffect,
  type StateCondition,
  type Strikes,
  type Surroundings,
} from "./types.js";

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
  /** Everyone, where they stand: whom a scythe could cleave into, and what riders read (#885). */
  readonly surroundings: Surroundings;
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
 * Who a swing at `target` hits: the target, then its cleave victims.
 * Weapon reach is checked before the swing lands, so the target itself
 * is never filtered.
 */
function victimsOf(swing: Swing, weapon: Weapon): readonly Combatant[] {
  return [
    swing.target.combatant,
    ...cleaveVictims(
      swing.attacker,
      swing.target,
      swing.surroundings,
      weapon,
      weapon.cleaveTargets,
    ),
  ];
}

/**
 * Whom else a blow of `weapon` at `target` strikes: up to `max` other
 * living foes adjacent to it, nearest first, the target excluded. `max`
 * is the weapon's `cleaveTargets`, or every one for Eremite's Attack
 * (#1021). None for any weapon but a scythe, whatever `max` says.
 */
export function cleaveVictims(
  attacker: Combatant,
  target: TargetCandidate,
  surroundings: Surroundings,
  weapon: Weapon,
  max: number,
): readonly Combatant[] {
  if (weapon.cleaveTargets === 0) {
    return [];
  }
  const adjacent = [...surroundings.values()].filter(
    ({ combatant, position }) =>
      !combatant.dead &&
      combatant.id !== target.combatant.id &&
      combatant.team !== attacker.team &&
      distance(position, target.position) <= AREA_ADJACENT,
  );
  return nearestFirst(adjacent, target.position).slice(0, max);
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
  /** Added to the chance to crit by the attacker's statuses: Critical Eye's 0.13 (#988). */
  readonly criticalChanceBonus: number;
  /**
   * The type the blow deals unless the skill names its own: a status's
   * `attackDamageType` (#1021), else the weapon's. Riders still read the
   * weapon's: an earth scythe blow is still a physical attack.
   */
  readonly damageType: DamageType;
  /** The least armor penetration the attacker's statuses give (#1519): Judge's Insight's 0.2. */
  readonly armorPenetration: number;
  /**
   * Added to each blow before armor by the attacker's statuses (#1654):
   * Nightmare Weapon's −42, Favorable Winds' +6 to arrows (#1873).
   */
  readonly damageDelta: number;
  /**
   * The type the attacker's statuses turn its physical blows into, after
   * `damageType` or the skill's own (#1873): Greater Conflagration's fire.
   * `undefined`: none.
   */
  readonly physicalDamageDealtAs: DamageType | undefined;
  /** The held set's mods that act on a hit (#2009): Sundering's chance rides the blow. */
  readonly hitMods: WeaponHitMods;
  /**
   * What the held set's inscription adds to the weapon's roll (#2010),
   * read from the attacker as the blow begins: Strength and Honor's 0.15
   * above half Health, To the Pain!'s always.
   */
  readonly modDamageIncrease: number;
  /** Too Much Information's, only on a victim hexed as the blow lands. */
  readonly vsHexedDamageIncrease: number;
}

export function weaponSnapshotOf(attacker: Combatant): WeaponSnapshot {
  const { mainHand } = attacker.equipment;
  const rank = rankIn(attacker, mainHand.attributeId);
  const modifiers = aggregateModifiers(attacker.statuses.active);
  return {
    mainHand,
    rank,
    criticalStrikes: rankIn(attacker, CRITICAL_STRIKES_ATTRIBUTE),
    requirementMet: mainHand.attributeId === undefined || rank >= mainHand.weapon.requirement.rank,
    damageMultiplier: weaponDamageMultiplierOf(attacker),
    criticalChanceBonus: modifiers.criticalChanceBonus,
    damageType: attackDamageTypeOf(attacker) ?? mainHand.damageType,
    armorPenetration: modifiers.attackArmorPenetration,
    damageDelta: attackDamageDeltaOf(attacker),
    physicalDamageDealtAs: physicalDamageDealtAsOf(attacker.statuses.active),
    hitMods: attacker.equipment.hitMods,
    ...modDamageOf(attacker),
  };
}

/** The inscription's increases, split into what the attacker answers now and what the victim does on landing. */
function modDamageOf(
  attacker: Combatant,
): Pick<WeaponSnapshot, "modDamageIncrease" | "vsHexedDamageIncrease"> {
  let modDamageIncrease = 0;
  let vsHexedDamageIncrease = 0;
  for (const mod of attacker.equipment.hitMods.attackDamage) {
    if (mod.while === "target-hexed") {
      vsHexedDamageIncrease += mod.increase;
    } else if (mod.while === undefined || modWhileHolds(mod.while, attacker, undefined)) {
      modDamageIncrease += mod.increase;
    }
  }
  return { modDamageIncrease, vsHexedDamageIncrease };
}

/**
 * The chance a blow of this snapshot crits (#533): the base chance plus a
 * share per rank in the weapon's mastery, the attribute its requirement
 * names, plus Critical Strikes' (#606). A caster weapon's nominated
 * attribute is no mastery, and fists have none, so both crit at the base
 * chance and Critical Strikes'. Statuses add theirs (#988), all of it at
 * most 1.
 */
export function criticalChance(snapshot: WeaponSnapshot, rules: CombatRules): number {
  const mastery = snapshot.mainHand.weapon.requirement.kind === "fixed" ? snapshot.rank : 0;
  return Math.min(
    1,
    rules.criticalBaseChance +
      rules.criticalChancePerRank * mastery +
      CRITICAL_STRIKES_CHANCE_PER_RANK * snapshot.criticalStrikes +
      snapshot.criticalChanceBonus,
  );
}

/**
 * What a critical blow gives its attacker: Critical Strikes' energy
 * (#606), and its statuses' (#988, Critical Eye's 1), up to the
 * attacker's maximum, its statuses' health (#1326, Way of Perfection's),
 * and its statuses that refresh on one back to full (#1315, Critical
 * Defenses). Statuses are read as the blow lands. A dead attacker, as one
 * whose arrow lands after it fell, gains none.
 */
export function landedCritical(attacker: Combatant, rank: number, events: CombatEvent[]): void {
  const modifiers = aggregateModifiers(attacker.statuses.active);
  gainEnergy(attacker, criticalStrikesEnergy(rank) + modifiers.energyPerCritical, events);
  gainHealth(attacker, modifiers.healthPerCritical, events);
  if (!attacker.dead) {
    attacker.statuses.refreshOnCritical();
  }
}

/**
 * Whether a blinded attacker's blow misses, or any blow at a `victim`
 * that attacks against miss (#1951): Shadow Form's, never rolled.
 *
 * Rolled only when there is a chance to miss, as for attack skills, so
 * an unblinded fight's random stream does not move.
 */
export function blindMisses(attacker: Combatant, victim: Combatant, rng: SimulationRng): boolean {
  if (attacksAgainstMiss(victim.statuses.active)) {
    return true;
  }
  const chance = attackMissChanceOf(attacker);
  return chance > 0 && rng.nextFloat() < chance;
}

/** Whether a blow of this weapon is a projectile or a melee blow, as a block sees it. */
export function blowKind(weapon: Weapon): "melee" | "projectile" {
  return weapon.projectileSpeed === undefined ? "melee" : "projectile";
}

/**
 * Whether a blow of an attack skill with this `unblockable` rolls no block
 * (#1354): always, never, or while its state holds for `attacker` against
 * `victim`, read as the block would be rolled. No attacker left in the
 * world reads no state: the blow can be blocked.
 */
export function unblockableNow(
  unblockable: boolean | StateCondition,
  attacker: Combatant | undefined,
  victim: Combatant,
  surroundings: Surroundings,
): boolean {
  if (typeof unblockable === "boolean") {
    return unblockable;
  }
  return attacker !== undefined && stateHolds(unblockable, attacker, victim, surroundings);
}

/**
 * How many blows `strikes` lands on `victim` (#1914): a number as it
 * is; Forked Arrow's two, but one while its state holds for `attacker`.
 * None: one.
 */
export function strikeCount(
  strikes: Strikes | undefined,
  attacker: Combatant,
  victim: Combatant,
  surroundings: Surroundings,
): number {
  if (strikes === undefined || typeof strikes === "number") {
    return strikes ?? 1;
  }
  return stateHolds(strikes.oneWhile, attacker, victim, surroundings) ? 1 : strikes.count;
}

/**
 * Whether `victim` blocks a blow of this kind from `attackerId` (#534),
 * rolled after blind and before the damage roll. Rolled only when there
 * is a chance to block, as blind is, so a fight without blocking keeps
 * its random stream. A hex of the attacker's that bars blocking it
 * (#1234, `unblockableBySource`) leaves no chance, and so does a hex that
 * bars blocking at all (#1332, `preventsBlocking`). `attackSkill`: an
 * attack skill's blow or shot, which Wary Stance's block needs (#1978).
 */
export function blocks(
  victim: Combatant,
  attackerId: string,
  kind: "melee" | "projectile",
  attackSkill: boolean,
  rng: SimulationRng,
): boolean {
  const exposed = victim.statuses.active.some(
    ({ id, sourceId }) => sourceId === attackerId && getStatusDefinition(id).unblockableBySource,
  );
  if (
    exposed ||
    victim.statuses.active.some(({ id }) => getStatusDefinition(id).preventsBlocking)
  ) {
    return false;
  }
  const blocking = blockingStatusesOf(victim, attackSkill);
  const chance = combinedBlockChance(
    blocking.map(({ block }) => block),
    kind,
  );
  if (chance <= 0) {
    return false;
  }
  const roll = rng.nextFloat();
  if (roll >= chance) {
    return false;
  }
  // One roll, as before; the status that blocked is the one whose share
  // of it the roll fell in, in roll order, so only Displacement's own
  // block charges its spirit (#1265), and only that status's triggers
  // answer it (#1329).
  let covered = 0;
  let unblocked = 1;
  for (const { statusId, block } of blocking) {
    if (block.against !== "all" && block.against !== kind) {
      continue;
    }
    covered += unblocked * block.chance;
    unblocked *= 1 - block.chance;
    if (roll < covered) {
      victim.statuses.chargeSources((definition) => definition.id === statusId);
      victim.statuses.recordBlock(statusId, attackerId, kind);
      break;
    }
  }
  return true;
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
 * `weaponDamage`, plus `bonus`, which ignores armor (#760).
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
  /** The skill's damage type (#923); `undefined`: the weapon's. */
  readonly damageType: DamageType | undefined;
  /** The skill's own base armor penetration (#923); it and Strength's do not add. */
  readonly armorPenetration: number;
  /**
   * More `bonus` while a state holds (#794), at the caster's ranks: read
   * by `settleBlow` as the blow lands on each victim. The skill's own,
   * then its chants' (#1505), as Anthem of Envy's.
   */
  readonly conditionalBonuses: readonly {
    readonly condition: StateCondition;
    readonly amount: number;
  }[];
  /**
   * When the blow is a critical hit whatever the roll (#1315): read, as
   * `conditionalBonuses` are, by `settleBlow`, which leaves `"always"` or
   * `undefined`.
   */
  readonly criticalWhen: StateCondition | "always" | undefined;
}

/** A swing of the weapon and nothing else. */
export const PLAIN_BLOW: BlowRule = {
  weaponDamage: 1,
  bonus: 0,
  strengthRank: 0,
  damageType: undefined,
  armorPenetration: 0,
  conditionalBonuses: [],
  criticalWhen: undefined,
};

/**
 * The blow `skill` makes of `caster`'s weapon, its bonus at the caster's
 * ranks, with its `bonusPer` counted now (#1957).
 */
export function skillBlow(skill: Skill, caster: Combatant, surroundings: Surroundings): BlowRule {
  const rule = blowRuleOf(skill);
  const bonusDamage = rule?.bonusDamage;
  const conditionalBonus = rule?.conditionalBonus;
  // A chant's bonus on the next attack skill (#1505), taken as the skill
  // is released, as its riders are.
  const chants = caster.statuses.active.flatMap(({ id }) => {
    const bonus = getStatusDefinition(id).nextAttackSkillBonus;
    return bonus === undefined ? [] : [bonus];
  });
  return {
    weaponDamage: rule?.weaponDamage ?? PLAIN_BLOW.weaponDamage,
    bonus: withPerCount(
      bonusDamage === undefined ? 0 : resolveMagnitude(bonusDamage, caster),
      rule?.bonusPer,
      caster,
      undefined,
      surroundings,
    ),
    strengthRank: rankIn(caster, STRENGTH_ATTRIBUTE),
    damageType: rule?.damageType,
    armorPenetration: rule?.armorPenetration ?? PLAIN_BLOW.armorPenetration,
    conditionalBonuses: [
      ...(conditionalBonus === undefined ? [] : [conditionalBonus]),
      ...chants,
    ].map(({ condition, amount }) => ({ condition, amount: resolveMagnitude(amount, caster) })),
    criticalWhen: rule?.criticalWhen,
  };
}

/**
 * `blow` as it lands on `victim` (#794): each of its `conditionalBonuses` added to
 * its bonus if its state holds now, for `attacker` and `victim`, and its
 * `criticalWhen` (#1315) `"always"` if it holds, else `undefined`. An
 * arrow whose archer has left the match has nobody to read the state of:
 * no more, and no forced critical.
 */
export function settleBlow(
  blow: BlowRule,
  attacker: Combatant | undefined,
  victim: Combatant,
  surroundings: Surroundings,
): BlowRule {
  const { conditionalBonuses, criticalWhen } = blow;
  const holds = (condition: StateCondition): boolean =>
    attacker !== undefined && stateHolds(condition, attacker, victim, surroundings);
  return {
    ...blow,
    bonus:
      blow.bonus +
      conditionalBonuses.reduce(
        (sum, { condition, amount }) => sum + (holds(condition) ? amount : 0),
        0,
      ),
    conditionalBonuses: [],
    criticalWhen:
      criticalWhen === "always" || (criticalWhen !== undefined && holds(criticalWhen))
        ? "always"
        : undefined,
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
 * added after, unmultiplied, and ignores armor (#760). A melee blow at an `exposed` victim always
 * crits; a projectile never does that way, however it lands. A settled
 * blow whose `criticalWhen` is `"always"` crits too (#1315). Returns
 * whether the blow crit.
 *
 * A dazed victim casting a spell, or one setting a trap, is
 * interrupted first, before the damage (#546, #1105): every landed
 * attack comes here, a swing, an attack skill or an arrow, and a miss or
 * a block never does.
 */
export function landBlow(
  snapshot: WeaponSnapshot,
  attacker: Combatant | undefined,
  victim: Combatant,
  blow: BlowRule,
  exposed: boolean,
  rng: SimulationRng,
  rules: CombatRules,
  events: CombatEvent[],
): boolean {
  interruptOnHit(victim, attacker?.id, events);
  const { weapon } = snapshot.mainHand;
  const rolledCritical = rng.nextFloat() < criticalChance(snapshot, rules);
  const critical =
    rolledCritical ||
    blow.criticalWhen === "always" ||
    (exposed && weapon.projectileSpeed === undefined);
  // A victim that suffers no extra damage from crits takes a normal roll,
  // and the blow is still a critical (#1329).
  const base =
    critical && !aggregateModifiers(victim.statuses.active).ignoresCriticalDamage
      ? weapon.damageMax * weapon.criticalMultiplier
      : rng.nextInt(weapon.damageMin, weapon.damageMax + 1);
  // Sundering (#2009): bonus penetration on its roll, on top of the
  // largest base. Drawn only for a weapon that has it, so no other
  // fight's stream moves.
  const { sunderChance, sunderPenetration } = snapshot.hitMods;
  const sundered = sunderChance > 0 && rng.nextFloat() < sunderChance ? sunderPenetration : 0;
  // The inscription's (#2010): the weapon's roll only, never a skill's bonus.
  const inscribed =
    1 +
    snapshot.modDamageIncrease +
    (victim.statuses.countByCategory("hex") > 0 ? snapshot.vsHexedDamageIncrease : 0);
  const packet: DamagePacket = {
    armored: Math.max(
      0,
      base *
        inscribed *
        snapshot.damageMultiplier *
        blow.weaponDamage *
        (snapshot.mainHand.creatureDamageScale ?? weaponAttributeMultiplier(snapshot.rank, rules)) *
        (snapshot.requirementMet ? 1 : rules.unmetRequirementMultiplier) +
        snapshot.damageDelta,
    ),
    armorIgnoring: blow.bonus,
    // The attacker's type first, turned by its Greater Conflagration
    // (#1873), then Winter's on the victim (#1745).
    type: damageTypeTaken(
      damageTypeDealt(blow.damageType ?? snapshot.damageType, snapshot.physicalDamageDealtAs),
      victim.statuses.active,
    ),
    source: "weapon",
    armorPenetration:
      Math.max(
        blow.armorPenetration,
        strengthArmorPenetration(blow.strengthRank, weapon.armorPenetration),
        snapshot.armorPenetration,
      ) + sundered,
  };
  // After the crit and damage rolls: the piece it lands on (#1135).
  const location = hitLocationOf(packet, rng);
  applyDamage(
    victim,
    mitigate(packet, victim, rules, location, rng),
    packet.type,
    critical,
    events,
    attacker,
  );
  return critical;
}

/**
 * What the attacker's statuses add to a blow of `mainHand` that hit
 * `victim` (#525): every active status's `onAttackHit`, as Apply
 * Poison's poison, each onto `fired` under its own skill, apart from the
 * blow (#939). Read when the blow lands, so a preparation that ran out
 * mid-swing or mid-flight adds nothing. Physical attacks only, as GW1
 * says: a wand's or a staff's bolt carries none, except a weapon
 * spell's, which rides every attack (#1654): Nightmare Weapon steals
 * through a wand. Then every status that
 * ends after so many hits with this weapon spends one (#939), whatever
 * the blow's damage type: Sand
 * Shards' fourth hit splashes, then ends it. Returns those endings,
 * after what the weapon itself does to whoever it hits (#1239). A rider
 * for attack skills only rides a blow `withAttackSkill` (#1551), and one
 * for a weapon class only a blow of that weapon (#1629). `dealt`: the
 * Health the blow took, what a Vampiric Horror's owner gains (#1836).
 * `spent`: the statuses this attack used up (#1916), whose riders it
 * still carries, as Poison Tip Signet's poison. A status that does
 * nothing now (#1916), as Brutal Weapon beside an enchantment, adds none.
 */
export function attackHitRiders(
  attacker: Combatant,
  victim: Combatant,
  mainHand: ResolvedWeapon,
  withAttackSkill: boolean,
  dealt: number,
  rng: SimulationRng,
  rules: CombatRules,
  surroundings: Surroundings,
  fired: FiredTrigger[],
  spent: readonly StatusId[],
): CombatEvent[] {
  const onHit = [
    ...weaponOnHit(attacker, victim, mainHand.weapon, dealt, rng, rules, surroundings),
    ...modsOnHit(attacker, victim),
  ];
  applyRiders(
    "onAttackHit",
    attacker,
    victim,
    mainHand,
    withAttackSkill,
    rng,
    rules,
    surroundings,
    fired,
    spent,
  );
  const events: CombatEvent[] = [...onHit];
  for (const statusId of attacker.statuses.countHit(mainHand.weapon.id)) {
    events.push({ kind: "status-expired", targetId: attacker.id, statusId });
  }
  events.push(...ownerPaysForMinionHit(attacker, surroundings));
  return events;
}

/**
 * What the held set's mods do on a landed hit (#2009): Vampiric steals,
 * past armor, from a victim the blow left alive; Zealous gains energy.
 * Each blow of a double strike is a hit of its own.
 */
function modsOnHit(attacker: Combatant, victim: Combatant): CombatEvent[] {
  const { lifeSteal, energyOnHit } = attacker.equipment.hitMods;
  const events: CombatEvent[] = [];
  if (lifeSteal > 0 && !victim.dead && !attacker.dead) {
    stealLife(attacker, victim, lifeSteal, events);
  }
  gainEnergy(attacker, energyOnHit, events);
  return events;
}

/**
 * What the attacker's statuses do to `victim` for blocking a blow of
 * `mainHand` (#1974): every active status's `onAttackBlocked`, as Glass
 * Arrows' Bleeding, each onto `fired` under its own skill. Filtered as
 * `attackHitRiders` filters, `spent` included.
 */
export function attackBlockedRiders(
  attacker: Combatant,
  victim: Combatant,
  mainHand: ResolvedWeapon,
  withAttackSkill: boolean,
  rng: SimulationRng,
  rules: CombatRules,
  surroundings: Surroundings,
  fired: FiredTrigger[],
  spent: readonly StatusId[],
): void {
  applyRiders(
    "onAttackBlocked",
    attacker,
    victim,
    mainHand,
    withAttackSkill,
    rng,
    rules,
    surroundings,
    fired,
    spent,
  );
}

/**
 * Each of the attacker's statuses' `which` rider onto `victim`, active
 * and `spent` alike: one for attack skills only rides a blow
 * `withAttackSkill`, one for a weapon class only a blow of that weapon,
 * and a wand's or staff's blow only a weapon spell's: a martial
 * weapon's elemental prefix (#2009) changes its damage, not its riders.
 */
function applyRiders(
  which: "onAttackHit" | "onAttackBlocked",
  attacker: Combatant,
  victim: Combatant,
  mainHand: ResolvedWeapon,
  withAttackSkill: boolean,
  rng: SimulationRng,
  rules: CombatRules,
  surroundings: Surroundings,
  fired: FiredTrigger[],
  spent: readonly StatusId[],
): void {
  const caster = isCasterWeapon(mainHand.weapon);
  const active = attacker.statuses.active;
  for (const status of [...active, ...spent.map((id) => ({ id }))]) {
    const definition = getStatusDefinition(status.id);
    const rider = definition[which];
    if (
      rider === undefined ||
      isSuppressed(active, status) ||
      (rider.attackSkillsOnly && !withAttackSkill) ||
      (caster && definition.category !== "weapon-spell") ||
      (rider.weapon !== undefined && !wieldsFor(mainHand.weapon.id, rider.weapon))
    ) {
      continue;
    }
    const events = applyEffects(rider.effects, {
      caster: attacker,
      target: victim,
      rng,
      rules,
      surroundings,
    });
    sourcePaysForRemoved(rider, attacker.statuses.get(status.id)?.sourceId, surroundings, events);
    if (events.length > 0) {
      fired.push({ sourceId: attacker.id, skillId: rider.skillId, events });
    }
  }
}

/**
 * Order of Apostasy's price (#1975): the rider's status's source loses
 * its share of its effective maximum Health, rounded up, for each status
 * of the profession the rider's `events` removed, as Order of Undeath's
 * owner does. Health loss, not damage: it can kill. A source dead or
 * gone loses nothing; a status this attack spent has no source left.
 */
function sourcePaysForRemoved(
  rider: AttackHitRider,
  sourceId: string | undefined,
  surroundings: Surroundings,
  events: CombatEvent[],
): void {
  const price = rider.sourceLosesPerRemoved;
  const source = sourceId === undefined ? undefined : surroundings.get(sourceId)?.combatant;
  if (price === undefined || source === undefined) {
    return;
  }
  const removed = events.filter(
    (event) =>
      event.kind === "status-removed" &&
      getStatusDefinition(event.statusId).profession === price.profession,
  ).length;
  const each = Math.ceil((price.percentOfMax / 100) * effectiveMaxHealth(source));
  for (let index = 0; index < removed; index += 1) {
    loseHealth(source, each, "health-loss", events);
  }
}

/**
 * What a critical hit the attacker landed does to `victim` through its
 * statuses (#1975): each `onCriticalHit`'s effects, with the attacker as
 * caster, onto `fired` under its own skill. One that removed an
 * enchantment costs its bearer `energyIfRemoved` Energy, or, short of
 * it, ends; the removal stands. A dead attacker's do nothing.
 */
export function criticalHitRiders(
  attacker: Combatant,
  victim: Combatant,
  rng: SimulationRng,
  rules: CombatRules,
  surroundings: Surroundings,
  fired: FiredTrigger[],
): void {
  if (attacker.dead) {
    return;
  }
  const active = attacker.statuses.active;
  for (const status of [...active]) {
    const rider = getStatusDefinition(status.id).onCriticalHit;
    if (rider === undefined || isSuppressed(active, status)) {
      continue;
    }
    const events = applyEffects(rider.effects, {
      caster: attacker,
      target: victim,
      rng,
      rules,
      surroundings,
    });
    const removed = events.some(
      (event) =>
        event.kind === "status-removed" &&
        getStatusDefinition(event.statusId).category === "enchantment",
    );
    if (removed && attacker.energy < rider.energyIfRemoved) {
      attacker.statuses.end(status.id);
      events.push({ kind: "status-expired", targetId: attacker.id, statusId: status.id });
    } else if (removed && rider.energyIfRemoved > 0) {
      attacker.energy -= rider.energyIfRemoved;
      events.push({ kind: "energy-loss", targetId: attacker.id, amount: rider.energyIfRemoved });
    }
    if (events.length > 0) {
      fired.push({ sourceId: attacker.id, skillId: rider.skillId, events });
    }
  }
}

/**
 * What `weapon` does to `victim` besides its damage (#1239): Shadowsong's
 * blindness, Dissonance's interrupt, Disenchantment's strip. Only a
 * spirit's does anything. An interrupt with nothing to interrupt is no
 * miss: GW1 says "anyone struck is interrupted", not that it tries.
 */
function weaponOnHit(
  attacker: Combatant,
  victim: Combatant,
  weapon: Weapon,
  dealt: number,
  rng: SimulationRng,
  rules: CombatRules,
  surroundings: Surroundings,
): CombatEvent[] {
  if (weapon.onHit.length === 0) {
    return [];
  }
  const events = applyEffects(weapon.onHit, {
    caster: attacker,
    target: victim,
    rng,
    rules,
    surroundings,
  }).filter((event) => event.kind !== "interrupt-missed");
  // Vampiric Horror's owner gains what its blow took (#1836): a gain, not a heal.
  const ownerId = surroundings.get(attacker.id)?.creature?.ownerId;
  const owner = ownerId === undefined ? undefined : surroundings.get(ownerId)?.combatant;
  if (owner !== undefined && weapon.onHit.some(({ kind }) => kind === "owner-gains-damage-dealt")) {
    gainHealth(owner, dealt, events);
  }
  return events;
}

/**
 * The attacker attacked (#758): it struck a blow or released a shot,
 * swing or attack skill alike, hit or miss. Every status of its own that
 * ends when its bearer attacks ends now, as Weapon of Warding, and, if
 * the attack was `melee`, every one that ends on a melee attack, as
 * Escape (#976). Returns whether a status of its own makes the attack
 * unblockable (#1604), as Guiding Hands, spending one of its attacks, and
 * the critical chance the statuses that ended still give this attack
 * (#1677): "Go for the Eyes!" ends on the attack it sharpens. Every
 * status counting its bearer's attacks spends one (#1916): `spent`, those
 * it used up, whose damage and riders this last attack still has, as
 * Signet of Strength's thirteenth.
 */
export function bearerAttacked(
  attacker: Combatant,
  events: CombatEvent[],
  kind: "melee" | "projectile",
): {
  readonly unblockable: boolean;
  readonly criticalChanceBonus: number;
  readonly damageDelta: number;
  readonly spent: readonly StatusId[];
} {
  const unblockable = attacker.statuses.spendUnblockableAttack();
  const spent = attacker.statuses.spendAttack();
  let criticalChanceBonus = 0;
  let damageDelta = 0;
  for (const statusId of [
    ...unblockable.ended,
    ...spent,
    ...attacker.statuses.endOnBearerAttack(kind),
  ]) {
    events.push({ kind: "status-expired", targetId: attacker.id, statusId });
    criticalChanceBonus += getStatusDefinition(statusId).criticalChanceBonus;
    damageDelta += getStatusDefinition(statusId).attackDamageDelta;
  }
  return { unblockable: unblockable.unblockable, criticalChanceBonus, damageDelta, spent };
}

/**
 * `snapshot`, read after the attack ended its statuses, with the critical
 * chance (#1677) and the damage (#1916) those statuses still give it.
 */
export function withEndedStatuses(
  snapshot: WeaponSnapshot,
  attacked: ReturnType<typeof bearerAttacked>,
): WeaponSnapshot {
  return attacked.criticalChanceBonus === 0 && attacked.damageDelta === 0
    ? snapshot
    : {
        ...snapshot,
        criticalChanceBonus: snapshot.criticalChanceBonus + attacked.criticalChanceBonus,
        damageDelta: snapshot.damageDelta + attacked.damageDelta,
      };
}

/**
 * One of the attacker's blows hit (#919): swing, attack skill or arrow
 * alike, never a miss or a block. Every status of its own that ends when
 * its bearer hits ends now, as Dark Escape, and, `withAttackSkill`, every
 * one that ends when an attack skill hits, as Defensive Anthem (#956). The
 * hit is recorded for what answers one, as Insidious Parasite (#935), with
 * the `weapon` it struck with (#1359), and, on a foe's `victim`, for what
 * answers being hit there (#1464), as Vengeful Was Khanhei, with the
 * health the blow took from it (#1754), as Holy Wrath reflects.
 */
export function bearerHit(
  attacker: Combatant,
  victim: Combatant,
  events: CombatEvent[],
  withAttackSkill: boolean,
  weapon: Weapon,
  took: number,
): void {
  attacker.statuses.recordHit(weapon);
  if (victim.team !== attacker.team) {
    victim.statuses.recordHitByAttack(attacker.id, took);
  }
  for (const statusId of attacker.statuses.endOnBearerHit(withAttackSkill)) {
    events.push({ kind: "status-expired", targetId: attacker.id, statusId });
  }
}

/**
 * One of the attacker's blows failed to hit (#1332): swing, attack skill
 * or arrow alike, it missed on a roll or was blocked. Recorded for what
 * answers one, as Price of Failure, and it ends what a miss ends
 * (`bearerMissed`).
 */
export function bearerFailedToHit(attacker: Combatant, events: CombatEvent[]): void {
  attacker.statuses.recordFailedHit();
  bearerMissed(attacker, events);
}

/**
 * One of the attacker's blows or arrows failed to hit (#1742): missed,
 * blocked, dodged or stopped by a wall. Every status of its own that ends
 * when its bearer fails to hit ends now, as Seeking Arrows.
 */
export function bearerMissed(attacker: Combatant, events: CombatEvent[]): void {
  for (const statusId of attacker.statuses.endOnBearerMiss()) {
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
  // One with only a bonus (#1505) is spent too: `skillBlow` took it.
  const holding = attacker.statuses.active.flatMap(({ id }) => {
    const { nextAttackSkill, nextAttackSkillBonus } = getStatusDefinition(id);
    return nextAttackSkill === undefined && nextAttackSkillBonus === undefined
      ? []
      : [{ id, effects: nextAttackSkill ?? [] }];
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
  surroundings: Surroundings,
): CombatEvent[] {
  return applyEffects(next.effects, { caster: attacker, target: victim, rng, rules, surroundings });
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

/**
 * An attack skill that removes its user's preparations (#1629) was
 * released: they end before its blows land or its shots fly, so none
 * rides them. Barrage's and Volley's "all your preparations are removed".
 */
export function removePreparations(attacker: Combatant, skill: Skill, events: CombatEvent[]): void {
  if (skill.attack?.removesPreparations !== true) {
    return;
  }
  for (const { id } of [...attacker.statuses.active]) {
    if (getStatusDefinition(id).category === "preparation" && attacker.statuses.remove(id)) {
      events.push({ kind: "status-removed", targetId: attacker.id, statusId: id });
    }
  }
}

/**
 * One blow on one victim: blind first, then block, unless `unblockable`,
 * then the crit and damage rolls.
 */
function strike(
  swing: Swing,
  victim: Combatant,
  attacked: ReturnType<typeof bearerAttacked>,
  events: CombatEvent[],
  fired: FiredTrigger[],
): void {
  const { attacker, rng, rules } = swing;
  const { unblockable } = attacked;
  if (victim.dead) {
    return;
  }
  if (blindMisses(attacker, victim, rng)) {
    events.push({ kind: "attack-missed", targetId: victim.id });
    bearerFailedToHit(attacker, events);
    return;
  }
  const snapshot = withEndedStatuses(weaponSnapshotOf(attacker), attacked);
  if (!unblockable && blocks(victim, attacker.id, "melee", false, rng)) {
    events.push({ kind: "attack-blocked", targetId: victim.id });
    bearerFailedToHit(attacker, events);
    attackReached(victim, events);
    attackBlockedRiders(
      attacker,
      victim,
      snapshot.mainHand,
      false,
      rng,
      rules,
      swing.surroundings,
      fired,
      attacked.spent,
    );
    return;
  }
  const before = victim.health;
  // Order of Undeath's "+13 damage" on its bearer's minions (#1915).
  const owner = minionOwner(attacker, swing.surroundings);
  const blow =
    owner === undefined
      ? PLAIN_BLOW
      : { ...PLAIN_BLOW, bonus: aggregateModifiers(owner.statuses.active).minionDamageBonus };
  if (landBlow(snapshot, attacker, victim, blow, swing.exposed(victim), rng, rules, events)) {
    landedCritical(attacker, snapshot.criticalStrikes, events);
    criticalHitRiders(attacker, victim, rng, rules, swing.surroundings, fired);
  }
  events.push(
    ...attackHitRiders(
      attacker,
      victim,
      snapshot.mainHand,
      false,
      Math.max(0, before - victim.health),
      rng,
      rules,
      swing.surroundings,
      fired,
      attacked.spent,
    ),
  );
  bearerHit(
    attacker,
    victim,
    events,
    false,
    snapshot.mainHand.weapon,
    Math.max(0, before - victim.health),
  );
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
 * `landed` counts the blows that damaged a victim, however many each
 * cleaved: each earns a strike of adrenaline (#463).
 * `fired` is what the attacker's statuses added to its hits, each under
 * its own skill (#939).
 */
export function resolveSwing(swing: Swing): {
  readonly events: CombatEvent[];
  readonly doubleStrike: boolean;
  readonly landed: number;
  readonly fired: FiredTrigger[];
} {
  const { weapon } = swing.attacker.equipment.mainHand;
  const victims = victimsOf(swing, weapon);
  const chance = doubleStrikeChance(swing.attacker, weapon);
  const strikes = chance > 0 && swing.rng.nextFloat() < chance ? 2 : 1;

  const events: CombatEvent[] = [];
  const fired: FiredTrigger[] = [];
  const attacked = bearerAttacked(swing.attacker, events, blowKind(weapon));
  let landed = 0;
  for (let blow = 0; blow < strikes; blow += 1) {
    const from = events.length;
    for (const victim of victims) {
      strike(swing, victim, attacked, events, fired);
    }
    if (
      events
        .slice(from)
        .some((event) => event.kind === "damage" && event.targetId !== swing.attacker.id)
    ) {
      landed += 1;
    }
  }
  return { events, doubleStrike: strikes === 2, landed, fired };
}

/**
 * Resolve an attack skill at its hit (ADR-0029): its `strikes` blows of
 * the weapon on each victim, the primary first, with the skill's bonus
 * added after armor (#760). A victim a blow misses (blind) gets none of
 * the skill's riders from it; one it hits gets them all. A rider on the
 * attacker, as Wounding Strike's lost enchantment (#845), needs a hit
 * too. A victim that blocks gets the skill's `onBlocked` effects instead
 * (#534), and then its `onFailedToHit` (#1486), as one a blow misses
 * does; one a blow crits gets its `onCritical` after its effects; an `unblockable` one rolls no block at all (Wild Throw, #523),
 * and a conditionally unblockable one none while its state holds (#1354).
 * A chain attack on a victim without the mark it follows, or for which
 * its `requires` does not hold (#1041), misses it outright, before
 * blind, read once before the first blow; a chain attack that hits
 * leaves its own mark (#831).
 *
 * A dual attack strikes twice (#885): each blow rolls its own blind,
 * block, crit and damage, and the skill's effects land after each blow
 * that hits, so a condition applied twice is refreshed. A later blow's
 * effects read only what that blow did (#1580): Exhausting Assault's
 * overcast follows the interrupt of the blow that cut the spell, once. A victim the
 * first blow killed takes no second. The weapon's own double strike is
 * never added to a skill.
 *
 * A scythe's attack skill cleaves, as its swing does (#977): its victims
 * are the primary and the foes `cleaveVictims` finds round it, read
 * once, at the hit, and each gets its own blind, block, crit and damage,
 * and the skill's effects if it is hit. With `cleavesAllWhen` holding,
 * the foes round it are every one adjacent to it (#1021). A skill with an area, as
 * Barrage's, has its area's victims instead, each rolling its own block
 * and its own crit.
 *
 * The attacker's weapon spell ends as it strikes, and its chants' riders
 * (#758) land on each victim a blow hits, after the skill's own blow; the
 * chants end once the first blows are done, whatever each did.
 *
 * A ranged weapon's attack skill does not come here: it flies, and its
 * blow and riders land with the arrow (#416).
 *
 * A pet attack (#1046) comes here at its pet's next blow, the pet the
 * caster, its own weapon the blow's.
 *
 * What the attacker's statuses add to its hits goes onto `fired`, each
 * under its own skill (#939).
 */
export function resolveAttackSkill(
  resolution: SkillResolution,
  exposed: (victim: Combatant) => boolean,
  fired: FiredTrigger[],
): CombatEvent[] {
  return resolveAttackSkillOutcome(resolution, exposed, fired).events;
}

/**
 * `resolveAttackSkill`, with the `recharge-faster` its effects landed
 * (#1551): a melee attack skill lands as it is used, so it can shorten
 * its own recharge, hit or miss, as Pious Assault's. It summons nothing
 * and leaves no ground.
 */
export function resolveAttackSkillOutcome(
  resolution: SkillResolution,
  exposed: (victim: Combatant) => boolean,
  fired: FiredTrigger[],
): SkillOutcome {
  let rechargeFraction = 0;
  let rechargeLongerSeconds = 0;
  const land = (landing: SkillResolution, earlier: readonly CombatEvent[]): CombatEvent[] => {
    const outcome = resolveSkillEffects(landing, earlier);
    rechargeFraction = Math.max(rechargeFraction, outcome.rechargeFraction);
    rechargeLongerSeconds += outcome.rechargeLongerSeconds;
    return outcome.events;
  };
  const { skill, caster, rng, rules, surroundings } = resolution;
  const blow = skillBlow(skill, caster, surroundings);
  const rule = blowRuleOf(skill);
  const snapshot = weaponSnapshotOf(caster);
  const kind = blowKind(snapshot.mainHand.weapon);
  const events: CombatEvent[] = [];
  // The snapshot, read first, still has what the attack ends.
  const attacked = bearerAttacked(caster, events, kind);
  const { unblockable } = attacked;
  removePreparations(caster, skill, events);
  const next = nextAttackSkillOf(caster);
  const primary = resolution.targets[0];
  const around =
    skill.area !== undefined || primary === undefined || primary.dead
      ? undefined
      : surroundings.get(primary.id);
  const cleavesAll = rule?.cleavesAllWhen;
  const all =
    around !== undefined &&
    primary !== undefined &&
    cleavesAll !== undefined &&
    stateHolds(cleavesAll, caster, primary, surroundings);
  const { weapon } = snapshot.mainHand;
  const targets =
    around === undefined
      ? resolution.targets
      : [
          ...resolution.targets,
          ...cleaveVictims(
            caster,
            around,
            surroundings,
            weapon,
            all ? Number.POSITIVE_INFINITY : weapon.cleaveTargets,
          ),
        ];
  const victims: Combatant[] = [];
  const outOfSequence: Combatant[] = [];
  for (const victim of targets) {
    if (victim.dead) {
      continue;
    }
    const requires = rule?.chain?.requires;
    if (
      !chainAllows(caster, skill, victim.id) ||
      (requires !== undefined && !stateHolds(requires, caster, victim, surroundings))
    ) {
      events.push({ kind: "attack-missed", targetId: victim.id, reason: "out-of-sequence" });
      outOfSequence.push(victim);
      continue;
    }
    victims.push(victim);
  }
  const strikes = strikeCount(rule?.strikes, caster, primary ?? caster, surroundings);
  for (let strike = 0; strike < strikes; strike += 1) {
    const since = strike === 0 ? 0 : events.length;
    const hit: Combatant[] = [];
    const critical: Combatant[] = [];
    const blocked: Combatant[] = [];
    // An out-of-sequence miss fails to hit with the first strike (#1757).
    const failed: Combatant[] = strike === 0 ? [...outOfSequence] : [];
    for (const victim of victims) {
      if (victim.dead) {
        continue;
      }
      if (blindMisses(caster, victim, rng)) {
        events.push({ kind: "attack-missed", targetId: victim.id });
        bearerFailedToHit(caster, events);
        failed.push(victim);
        continue;
      }
      if (
        !unblockable &&
        (rule === undefined || !unblockableNow(rule.unblockable, caster, victim, surroundings)) &&
        blocks(victim, caster.id, kind, true, rng)
      ) {
        events.push({ kind: "attack-blocked", targetId: victim.id });
        bearerFailedToHit(caster, events);
        attackReached(victim, events);
        attackBlockedRiders(
          caster,
          victim,
          snapshot.mainHand,
          true,
          rng,
          rules,
          surroundings,
          fired,
          attacked.spent,
        );
        blocked.push(victim);
        failed.push(victim);
        continue;
      }
      const before = victim.health;
      if (
        landBlow(
          snapshot,
          caster,
          victim,
          settleBlow(blow, caster, victim, surroundings),
          exposed(victim),
          rng,
          rules,
          events,
        )
      ) {
        landedCritical(caster, snapshot.criticalStrikes, events);
        criticalHitRiders(caster, victim, rng, rules, surroundings, fired);
        critical.push(victim);
      }
      events.push(
        ...attackHitRiders(
          caster,
          victim,
          snapshot.mainHand,
          true,
          Math.max(0, before - victim.health),
          rng,
          rules,
          surroundings,
          fired,
          attacked.spent,
        ),
        ...nextAttackSkillRiders(next, caster, victim, rng, rules, surroundings),
      );
      bearerHit(caster, victim, events, true, weapon, Math.max(0, before - victim.health));
      attackReached(victim, events);
      markChain(caster, skill, victim.id);
      hit.push(victim);
    }
    if (strike === 0) {
      useNextAttackSkill(caster, next, events);
    }
    const riders = (effects: readonly SkillEffect[], targets: Combatant[]): CombatEvent[] =>
      targets.length === 0 || effects.length === 0
        ? []
        : land({ ...resolution, skill: { ...skill, effects }, targets }, events.slice(since));
    events.push(
      ...(hit.length === 0 ? [] : land({ ...resolution, targets: hit }, events.slice(since))),
      ...riders(rule?.onCritical ?? [], critical),
      ...riders(rule?.onBlocked ?? [], blocked),
      ...riders(rule?.onFailedToHit ?? [], failed),
    );
  }
  return {
    events,
    rechargeFraction,
    rechargeLongerSeconds,
    summons: [],
    grounds: [],
    taken: [],
    skipped: undefined,
  };
}

/**
 * Whoever owns `attacker`, when it is a minion (#1915), and is still in
 * the match; `undefined` for anything else.
 */
function minionOwner(attacker: Combatant, surroundings: Surroundings): Combatant | undefined {
  const creature = surroundings.get(attacker.id)?.creature;
  return creature?.kind === "minion" && creature.ownerId !== undefined
    ? surroundings.get(creature.ownerId)?.combatant
    : undefined;
}

/**
 * A minion's hit landed (#1915): its owner loses the share of its
 * effective maximum Health its statuses say, rounded up, as Order of
 * Undeath's "you lose 2% of your maximum Health". Health loss, not damage
 * or sacrifice: no armor, and it can kill.
 */
function ownerPaysForMinionHit(attacker: Combatant, surroundings: Surroundings): CombatEvent[] {
  const owner = minionOwner(attacker, surroundings);
  if (owner === undefined) {
    return [];
  }
  const percent = owner.statuses.active.reduce(
    (sum, { id }) => sum + getStatusDefinition(id).minionHitHealthLossPercent,
    0,
  );
  if (percent <= 0) {
    return [];
  }
  const events: CombatEvent[] = [];
  loseHealth(owner, Math.ceil((percent / 100) * effectiveMaxHealth(owner)), "health-loss", events);
  return events;
}
