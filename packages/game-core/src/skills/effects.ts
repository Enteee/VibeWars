import { isPhysicalDamage, type DamageType } from "../equipment/types.js";
import {
  DIVINE_FAVOR_ATTRIBUTE,
  divineFavorBonusHeal,
  SPAWNING_POWER_ATTRIBUTE,
  spawningPowerMultiplier,
} from "../primary-attributes.js";
import { emptyAdrenaline, emptyPool, fillPools } from "./adrenaline.js";
import { isAttacking } from "./attacking.js";
import { beginRecharge, resolvedBar, skillIdOfKey, type SlotSkill } from "./cast-state.js";
import { getSkill } from "./catalog.js";
import { CHAIN_MARK_SECONDS } from "./chain.js";
import { hitLocationOf, mitigate, skillDamage, withSkillArmorPenetration } from "./damage.js";
import { guardedDamage, guardedLoss } from "./loss-guard.js";
import { addOvercast, effectiveMaxEnergy } from "./overcast.js";
import { resolveMagnitude, resolveMagnitudeTimes } from "./scaling.js";
import {
  aggregateModifiers,
  damageTypeTaken,
  getStatusDefinition,
  scaledStatusDuration,
  type OwnSkillBoost,
  type StatusCategory,
  type StatusId,
} from "./status.js";
import {
  nearestFirst,
  ownCreaturesWithin,
  spiritsWithin,
  type TargetCandidate,
} from "./targeting.js";
import {
  effectiveMaxHealth,
  healingMultiplierOf,
  maxHealthLossOf,
  raisedMaxHealth,
  rankOf,
} from "./tick.js";
import { wieldsFor } from "../equipment/weapons.js";
import { distanceWithinRange } from "../geometry.js";
import { isFreshCorpse } from "../match/corpses.js";
import { distance } from "../vec2.js";
import type { Creature } from "../match/simulation.js";
import type { ProfessionId } from "../professions.js";
import type { SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, type CombatRules } from "../ruleset.js";
import {
  isEasilyInterrupted,
  isInvulnerable,
  isSpell,
  type Combatant,
  type DisableOwnSkillsEffect,
  type DisableSkillEffect,
  type EnergyGainEffect,
  type Skill,
  type SkillContext,
  type EffectCondition,
  type HealEffect,
  type InterruptEffect,
  type Magnitude,
  type RemoveStatusEffect,
  type ResurrectEffect,
  type SkillEffect,
  type StateCondition,
  type Surroundings,
  type SummonEffect,
  type CreateGroundEffect,
  type UnconditionalEffect,
} from "./types.js";

/**
 * Effect application (brief §6's composable effect list).
 *
 * Every effect is a pure-ish function of `(effect, context) -> events`:
 * it mutates the combatants it targets and returns a record of what
 * happened. Returning events rather than silently mutating is what lets
 * the server log a combat feed, the client show floating numbers, and
 * tests assert on outcomes without re-deriving them.
 *
 * Adding a new mechanic is adding one `case` here plus one effect type —
 * never a new bespoke skill class (brief §41).
 */

export type CombatEvent =
  | {
      readonly kind: "damage";
      readonly targetId: string;
      readonly amount: number;
      /** A weapon blow that crit (#533); `false` for everything else. */
      readonly critical: boolean;
    }
  | { readonly kind: "heal"; readonly targetId: string; readonly amount: number }
  | { readonly kind: "energy-gain"; readonly targetId: string; readonly amount: number }
  /** Energy the target actually lost (#793): never more than it had, never 0. */
  | { readonly kind: "energy-loss"; readonly targetId: string; readonly amount: number }
  /** Health the caster gave up for their own skill. */
  | { readonly kind: "sacrifice"; readonly targetId: string; readonly amount: number }
  /**
   * Health a skill made its target lose (#1678): not damage and not a
   * sacrifice, so nothing that answers either sees it.
   */
  | { readonly kind: "health-loss"; readonly targetId: string; readonly amount: number }
  /**
   * Health stolen from the target (#935): never more than it had, never 0.
   * Not damage: nothing that reacts to damage sees it. What the caster
   * gained is the `heal` after it.
   */
  | { readonly kind: "life-stolen"; readonly targetId: string; readonly amount: number }
  | { readonly kind: "death"; readonly targetId: string }
  /**
   * A spirit destroyed by a skill (#1309): gone at once, as an expired one
   * goes, with no corpse, no killer and no morale. Not a death.
   */
  | { readonly kind: "spirit-destroyed"; readonly targetId: string }
  /** Back from the dead (#812), with these shares of maximum health and energy, 0..1. */
  | {
      readonly kind: "resurrected";
      readonly targetId: string;
      readonly healthFraction: number;
      readonly energyFraction: number;
    }
  | {
      readonly kind: "status-applied";
      readonly targetId: string;
      readonly statusId: StatusId;
      /** `null` for a status with no end, maintained (#837) or not (#1789): it lasts until ended. */
      readonly durationSeconds: number | null;
    }
  /**
   * Health a status took as it landed (#800): deep wound's share of
   * maximum health; or a protective spirit's payment for what its status
   * did (#1265). Not damage: nothing that reacts to damage sees it.
   */
  | {
      readonly kind: "health-lost";
      readonly targetId: string;
      readonly amount: number;
      readonly statusId: StatusId;
    }
  | { readonly kind: "status-removed"; readonly targetId: string; readonly statusId: StatusId }
  | { readonly kind: "status-expired"; readonly targetId: string; readonly statusId: StatusId }
  /**
   * A maintained enchantment on `targetId` its caster `casterId` could no
   * longer pay the upkeep of (#837): it ended.
   */
  | {
      readonly kind: "upkeep-lost";
      readonly targetId: string;
      readonly statusId: StatusId;
      readonly casterId: string;
    }
  /** A spreading status caught from `fromId`, adjacent to the target (#765). */
  | {
      readonly kind: "status-spread";
      readonly targetId: string;
      readonly fromId: string;
      readonly statusId: StatusId;
    }
  | {
      readonly kind: "interrupted";
      readonly targetId: string;
      /** The skill whose cast was cut short. */
      readonly skillId: string;
    }
  /**
   * A plain swing of `targetId`'s cancelled as it began (#1593):
   * Clumsiness's. It never landed, and its swing timer starts over.
   */
  | { readonly kind: "attack-interrupted"; readonly targetId: string }
  /**
   * A skill on `targetId`'s bar that a disable (#914) made wait longer:
   * it is usable again in `seconds`.
   */
  | {
      readonly kind: "skill-disabled";
      readonly targetId: string;
      readonly skillId: string;
      readonly seconds: number;
    }
  /** A skill `targetId` just used takes `seconds` longer to recharge (#949): Diversion's. */
  | {
      readonly kind: "recharge-lengthened";
      readonly targetId: string;
      readonly skillId: string;
      readonly seconds: number;
    }
  /**
   * A cast its caster gave up by moving (#279) or Cancel Action, Esc
   * (#300): paid for, never resolved, and not recharging. The caster's
   * own choice, so not an interrupt.
   */
  | {
      readonly kind: "cancelled";
      readonly targetId: string;
      /** The skill whose cast was abandoned. */
      readonly skillId: string;
    }
  /**
   * A spell `targetId` finished that a status on it failed (#1475):
   * Guilt's. Paid for and recharging, as an interrupted one; nothing of
   * it landed.
   */
  | {
      readonly kind: "spell-failed";
      readonly targetId: string;
      /** The spell that failed. */
      readonly skillId: string;
    }
  /** An interrupt that found nothing to interrupt — a wasted cast. */
  | {
      readonly kind: "interrupt-missed";
      readonly targetId: string;
      /**
       * The skill the target was activating that the interrupt's filter
       * refused (#796), or `null` when it was activating nothing.
       */
      readonly refusedSkillId: string | null;
    }
  /**
   * An attack that swung and missed: paid for, no effect. Blind's miss,
   * or an off-hand attack out of sequence (#831), or whose chain
   * `requires` does not hold (#1041), which also recharges at once.
   */
  | {
      readonly kind: "attack-missed";
      readonly targetId: string;
      readonly reason?: "out-of-sequence";
    }
  /**
   * An attack its target blocked (#534): no damage, no adrenaline, no
   * riders; an attack skill's own if-blocked effects follow it.
   */
  | { readonly kind: "attack-blocked"; readonly targetId: string }
  /**
   * A damage packet, a life steal, a hex or a condition an invulnerable
   * target (#1208) took none of (#1233): one per negated packet, per body.
   */
  | { readonly kind: "invulnerable"; readonly targetId: string }
  /** A projectile that landed where its target would have been, had it kept moving. */
  | { readonly kind: "attack-dodged"; readonly targetId: string }
  /** A ranged swing released with a wall in the way: nothing flies (GW1's "Obstructed"). */
  | { readonly kind: "attack-obstructed"; readonly targetId: string }
  /** An attack with no way round the walls to its target: it ends (#211). */
  | { readonly kind: "attack-unreachable"; readonly targetId: string }
  /** Knocked down (#468): unable to act for `durationSeconds`. */
  | {
      readonly kind: "knocked-down";
      readonly targetId: string;
      readonly durationSeconds: number;
    }
  /**
   * Shadow Stepped (#988): `targetId`, the caster, moves to `toId`. The
   * simulation places the body when it reads this.
   */
  | { readonly kind: "shadow-stepped"; readonly targetId: string; readonly toId: string }
  /**
   * Shadow Stepped away (#1326): `targetId`, the caster, moves directly
   * away from what it has selected. The simulation reads the selection and
   * places the body.
   */
  | { readonly kind: "shadow-stepped-away"; readonly targetId: string }
  /**
   * Teleported (#474): `targetId` is put beside `toId`, as Rebirth brings
   * its ally to the caster. The simulation places the body.
   */
  | { readonly kind: "teleported"; readonly targetId: string; readonly toId: string }
  /**
   * `casterId` used `skillId` (#1735): paid for and gone off, at
   * `targetId`, which is `casterId` itself when nobody else was chosen.
   * A press refused, queued or interrupted is no use.
   */
  | {
      readonly kind: "skill-used";
      readonly casterId: string;
      readonly skillId: string;
      readonly targetId: string;
    }
  /**
   * `targetId` gained `strikes` of adrenaline (#1735): from `skillId`'s
   * `adrenaline-gain`, or from a blow when `undefined`. Only when one of
   * its adrenaline skills filled.
   */
  | {
      readonly kind: "adrenaline-gained";
      readonly targetId: string;
      readonly strikes: number;
      readonly skillId: string | undefined;
    }
  /**
   * `casterId`'s use of `skillId` did nothing (#1735): an effect it has
   * only under a condition, the first that did not hold, was skipped on
   * `targetId` (`casterId` when it had none), and nothing else of it
   * happened. `requirement` is that condition in the tooltip's words,
   * "only if target has Burning": text, as a condition can nest.
   */
  | {
      readonly kind: "effect-skipped";
      readonly casterId: string;
      readonly targetId: string;
      readonly skillId: string;
      readonly requirement: string;
    };

/**
 * Apply an already-mitigated amount, clamping at 0 and flagging death
 * exactly once.
 *
 * Mitigation happens in `damage.ts` and is deliberately *not* done here:
 * callers mitigate the packet and pass its `type`. Physical damage that
 * takes health is recorded on the target's statuses, for Mark of Pain
 * (#935). Degeneration has its own path in `tick.ts` and never comes
 * here, so it can never count as physical. Damage a foe `dealer` dealt is
 * recorded too, for Vengeful Weapon (#1022); with no dealer, as a
 * sacrifice, it is not. A bond on the target (#1108) takes its share of
 * a physical hit, after Reversal of Fortune. An invulnerable target
 * (#1208) takes none of it, and says so (#1233). A Guild Lord's guard
 * (#1223) cuts and caps what is left, to 0 once its second's cap is spent.
 * A status that negates fatal damage (#1789) drops what would kill; what
 * crosses a Health line is recorded for what answers it.
 */
export function applyDamage(
  target: Combatant,
  amount: number,
  type: DamageType,
  critical: boolean,
  events: CombatEvent[],
  dealer: Combatant | undefined,
): void {
  if (amount <= 0 || target.dead) {
    return;
  }
  if (isInvulnerable(target)) {
    events.push({ kind: "invulnerable", targetId: target.id });
    return;
  }
  if (reverse(target, amount, events)) {
    return;
  }
  // Symbiotic Bond (#1108): its share of a physical hit goes to its
  // source when the tick drains; the bearer takes the rest.
  const kept = isPhysicalDamage(type) ? target.statuses.redirect(amount) : amount;
  const applied = Math.min(guardedDamage(target, kept), target.health);
  if (negateFatal(target, applied, dealer, events)) {
    return;
  }
  const before = target.health;
  target.health -= applied;
  events.push({ kind: "damage", targetId: target.id, amount: applied, critical });
  if (isPhysicalDamage(type)) {
    target.statuses.recordPhysicalDamage();
  }
  recordFromFoe(target, dealer, type, applied);
  recordHealthDrop(target, dealer, before);
  // The guard above already returned for an already-dead target, so
  // reaching 0 here is always a *new* death — exactly one death event.
  if (target.health <= 0) {
    target.dead = true;
    events.push({ kind: "death", targetId: target.id });
  }
}

/**
 * `target` lost `amount` health to `dealer`, by damage of `type` or,
 * `undefined`, a life steal; recorded if that was a foe (#1022).
 */
function recordFromFoe(
  target: Combatant,
  dealer: Combatant | undefined,
  type: DamageType | undefined,
  amount: number,
): void {
  if (dealer !== undefined && dealer.team !== target.team) {
    target.statuses.recordDamageFromFoe(dealer.id, type, amount);
  }
}

/**
 * `target`'s Health just fell from `before` to where it is, by damage or
 * a steal `dealer` dealt, if anyone: recorded for what answers a line
 * crossed (#1789).
 */
function recordHealthDrop(target: Combatant, dealer: Combatant | undefined, before: number): void {
  target.statuses.recordHealthDrop(dealer?.id, before, target.health, effectiveMaxHealth(target));
}

/**
 * Judge's Intervention (#1789): if `loss` would kill `target` and it bears
 * a status that negates fatal damage, spend it. Returns whether it did,
 * and then the caller drops the whole packet: no damage, no death,
 * nothing that answers damage, nothing stolen.
 */
function negateFatal(
  target: Combatant,
  loss: number,
  dealer: Combatant | undefined,
  events: CombatEvent[],
): boolean {
  if (loss < target.health) {
    return false;
  }
  const negated = target.statuses.takeFatalNegation(dealer?.id);
  if (negated === undefined) {
    return false;
  }
  events.push({ kind: "status-expired", targetId: target.id, statusId: negated });
  return true;
}

/**
 * Reversal of Fortune (#987): if `target` bears a status that reverses
 * the next damage, spend it and heal `target` up to its cap instead.
 * Returns whether it did, and then the caller drops the whole packet: no
 * damage, no death, nothing that answers damage, nothing stolen.
 */
function reverse(target: Combatant, amount: number, events: CombatEvent[]): boolean {
  const reversal = target.statuses.takeReversal();
  if (reversal === undefined) {
    return false;
  }
  events.push({ kind: "status-expired", targetId: target.id, statusId: reversal.id });
  applyHeal(target, Math.min(amount, reversal.cap), events);
  return true;
}

/**
 * What `effect` heals, at the caster's ranks, before healing modifiers:
 * per status on the target with `perStatusOnTarget` (#920); with
 * `perAlly`, more for each living ally of the caster within the radius,
 * the caster included, and the whole capped at `max` (#923); with
 * `perRemoved`, per status of that category `earlier` took off the
 * target (#987); with `perDestroyedSpirit`, per spirit `earlier` destroyed
 * (#1309).
 */
function healAmount(
  effect: HealEffect,
  caster: Combatant,
  target: Combatant | undefined,
  surroundings: Surroundings,
  earlier: readonly CombatEvent[],
  usedSkill: SlotSkill | undefined,
): number {
  const base =
    perUsedSkillEnergy(effect, caster, usedSkill) *
    perStatus(effect.perStatusOnTarget, target) *
    perRemoved(effect.perRemoved, target, earlier) *
    (effect.perDestroyedSpirit === true
      ? earlier.filter((event) => event.kind === "spirit-destroyed").length
      : 1);
  const { perAlly } = effect;
  if (perAlly === undefined) {
    return base;
  }
  const at = surroundings.get(caster.id)?.position;
  const allies =
    at === undefined
      ? 1
      : [...surroundings.values()].filter(
          ({ combatant, position }) =>
            !combatant.dead &&
            combatant.team === caster.team &&
            distance(position, at) <= perAlly.radius,
        ).length;
  return Math.min(perAlly.max, base + allies * resolveMagnitude(perAlly.amount, caster));
}

/**
 * A heal from a skill: weakened by the target's healing reduction (deep
 * wound), and clamped so it never exceeds the effective maximum health.
 * The dead stay dead.
 */
function applyHeal(target: Combatant, amount: number, events: CombatEvent[]): void {
  if (amount <= 0 || target.dead) {
    return;
  }
  const applied = Math.min(
    amount * healingMultiplierOf(target),
    effectiveMaxHealth(target) - target.health,
  );
  if (applied <= 0) {
    return;
  }
  target.health += applied;
  events.push({ kind: "heal", targetId: target.id, amount: applied });
}

/**
 * GW1's life stealing (#935): the target loses up to `amount`, never more
 * than it has, and the caster gains exactly that, up to its effective
 * maximum. Not damage, so no armor and nothing that reacts to damage; not
 * a heal either, so the caster's healing modifiers do not touch it. It
 * can kill, with one `death`, as `applyDamage` does. Nothing is stolen
 * from an invulnerable target (#1208), which says so (#1233). A Guild
 * Lord's per-second cap (#1223) holds it too, and a status that negates
 * fatal damage (#1789) drops a steal that would kill.
 */
function stealLife(
  caster: Combatant,
  target: Combatant,
  amount: number,
  events: CombatEvent[],
): void {
  // Union (#1265): a flat cut off every steal, paid for by its spirit
  // whenever it took something.
  const reduction = aggregateModifiers(target.statuses.active).lifeStealReduction;
  if (reduction > 0 && amount > 0) {
    target.statuses.chargeSources((definition) => definition.lifeStealReduction > 0);
  }
  const stolen = Math.min(amount - reduction, target.health);
  if (stolen <= 0) {
    return;
  }
  if (isInvulnerable(target)) {
    events.push({ kind: "invulnerable", targetId: target.id });
    return;
  }
  if (reverse(target, stolen, events)) {
    return;
  }
  const taken = guardedLoss(target, stolen);
  if (taken <= 0 || negateFatal(target, taken, caster, events)) {
    return;
  }
  const before = target.health;
  target.health -= taken;
  events.push({ kind: "life-stolen", targetId: target.id, amount: taken });
  recordFromFoe(target, caster, undefined, taken);
  recordHealthDrop(target, caster, before);
  gainHealth(caster, taken, events);
  if (target.health <= 0) {
    target.dead = true;
    events.push({ kind: "death", targetId: target.id });
  }
}

/**
 * A health gain that is not a heal: life stealing's caster half, and Way
 * of Perfection's per critical hit (#1326). Up to `amount`, capped at the
 * effective maximum. No healing modifier touches it, but it is logged as a
 * `heal`. The dead gain none.
 */
export function gainHealth(caster: Combatant, amount: number, events: CombatEvent[]): void {
  if (caster.dead) {
    return;
  }
  const gained = Math.min(amount, effectiveMaxHealth(caster) - caster.health);
  if (gained > 0) {
    caster.health += gained;
    events.push({ kind: "heal", targetId: caster.id, amount: gained });
  }
}

/**
 * Give energy, clamped so it can never exceed the maximum overcast
 * leaves (#461), nor `upTo` (#1359): a target already above it gains
 * none and keeps what it has. The dead
 * gain none, and a gain that fills nothing is no event.
 */
export function gainEnergy(
  target: Combatant,
  amount: number,
  events: CombatEvent[],
  upTo = Number.POSITIVE_INFINITY,
): void {
  if (amount <= 0 || target.dead) {
    return;
  }
  const applied = Math.min(
    amount,
    effectiveMaxEnergy(target) - target.energy,
    upTo - target.energy,
  );
  if (applied <= 0) {
    return;
  }
  target.energy += applied;
  events.push({ kind: "energy-gain", targetId: target.id, amount: applied });
}

/**
 * Take up to `amount` energy from `target`, never below 0 (#793). Only
 * whole points go: the fraction regeneration has filled stays, as the
 * bar shows it. Current energy alone; maximum energy is untouched. A
 * loss that takes nothing is no event. Returns what it took.
 */
function loseEnergy(target: Combatant, amount: number, events: CombatEvent[]): number {
  const lost = Math.min(amount, Math.floor(target.energy));
  if (lost <= 0) {
    return 0;
  }
  target.energy -= lost;
  events.push({ kind: "energy-loss", targetId: target.id, amount: lost });
  return lost;
}

/**
 * Bring a dead `target` back (#812), as a respawn leaves it but where it
 * lies: `health` points, at least 1 and at most its maximum, and this
 * share of its maximum energy, no effects, no adrenaline. Its recharges
 * carry on, and so does its overcast: energy stops at the ceiling that
 * leaves (#461).
 */
function resurrect(
  target: Combatant,
  health: number,
  energyFraction: number,
  events: CombatEvent[],
): void {
  target.statuses.clear();
  target.dead = false;
  const points = Math.min(health, target.maxHealth);
  target.health = Math.max(1, Math.floor(points));
  target.energy = Math.max(
    0,
    Math.min(Math.floor(target.maxEnergy * energyFraction), effectiveMaxEnergy(target)),
  );
  emptyAdrenaline(target);
  events.push({
    kind: "resurrected",
    targetId: target.id,
    healthFraction: points / target.maxHealth,
    energyFraction,
  });
}

/**
 * How many times a resurrection's shares count (#474): once, or with
 * `perPartyMemberWithin`, once for the caster and each living team-mate
 * within that radius of it, creatures aside (ADR-0035): Signet of
 * Return's "for each party member within earshot".
 */
function partyShares(
  effect: ResurrectEffect,
  caster: Combatant,
  surroundings: Surroundings,
): number {
  const radius = effect.perPartyMemberWithin;
  const at = surroundings.get(caster.id)?.position;
  if (radius === undefined || at === undefined) {
    return 1;
  }
  return [...surroundings.values()].filter(
    ({ combatant, position, creature }) =>
      creature === undefined &&
      !combatant.dead &&
      combatant.team === caster.team &&
      distance(position, at) <= radius,
  ).length;
}

/**
 * The energy `targetId` lost to earlier effects of this skill (#793), read
 * from `earlier`, the events its resolution has emitted so far.
 */
function energyLostBy(targetId: string, earlier: readonly CombatEvent[]): number {
  let lost = 0;
  for (const event of earlier) {
    if (event.kind === "energy-loss" && event.targetId === targetId) {
      lost += event.amount;
    }
  }
  return lost;
}

/**
 * `amount`, or with `perEnergyLost`, `amount` for each point `lostBy` lost
 * earlier in this resolution: 0 with no one or no loss (#793).
 */
function perEnergyLost(
  effect: { readonly perEnergyLost?: true },
  amount: number,
  lostBy: Combatant | undefined,
  earlier: readonly CombatEvent[],
): number {
  if (effect.perEnergyLost === undefined) {
    return amount;
  }
  return lostBy === undefined ? 0 : amount * energyLostBy(lostBy.id, earlier);
}

/**
 * `amount` at the caster's ranks, or with `perUsedSkillEnergy`, per point
 * of the base energy cost of the skill the trigger answers, rounded half
 * up (#1614): Fire Attunement's 30% of a 15-energy spell is 5. No energy
 * cost, or no skill: 0.
 */
function perUsedSkillEnergy(
  effect: { readonly amount: Magnitude; readonly perUsedSkillEnergy?: true },
  caster: Combatant,
  used: SlotSkill | undefined,
): number {
  if (effect.perUsedSkillEnergy === undefined) {
    return resolveMagnitude(effect.amount, caster);
  }
  const cost = used === undefined ? undefined : getSkill(used.skillId)?.cost;
  return cost?.kind === "energy" ? resolveMagnitudeTimes(effect.amount, caster, cost.amount) : 0;
}

/**
 * Signet of Creation's gain (#1316): `amount` for each of the caster's
 * spirits and minions in reach, at most the cap. Without
 * `perOwnCreatureWithin`, `amount` as it is.
 */
function perOwnCreature(
  effect: EnergyGainEffect,
  amount: number,
  caster: Combatant,
  surroundings: Surroundings,
): number {
  const per = effect.perOwnCreatureWithin;
  if (per === undefined) {
    return amount;
  }
  const at = surroundings.get(caster.id)?.position;
  const creatures =
    at === undefined ? 0 : ownCreaturesWithin(surroundings.values(), caster, at, per.radius);
  return Math.min(amount * creatures, resolveMagnitude(per.max, caster));
}

/**
 * How many times a heal with `perStatusOnTarget` lands (#920): once with
 * no categories, else once per status of those categories on `target`,
 * as it stands now; 0 with no target.
 */
function perStatus(categories: readonly StatusCategory[], target: Combatant | undefined): number {
  if (categories.length === 0) {
    return 1;
  }
  if (target === undefined) {
    return 0;
  }
  return categories.reduce(
    (count, category) => count + target.statuses.countByCategory(category),
    0,
  );
}

/**
 * How many statuses of `category` an earlier `remove-status` took off
 * `target` (#987); with no category, 1.
 */
function perRemoved(
  category: StatusCategory | undefined,
  target: Combatant | undefined,
  earlier: readonly CombatEvent[],
): number {
  if (category === undefined) {
    return 1;
  }
  if (target === undefined) {
    return 0;
  }
  return earlier.filter(
    (event) =>
      event.kind === "status-removed" &&
      event.targetId === target.id &&
      getStatusDefinition(event.statusId).category === category,
  ).length;
}

/**
 * Whether a knockdown could land on `target`: alive and standing. One on
 * someone already down does nothing, however long it would have lasted
 * (GW1).
 */
function canBeKnockedDown(target: Combatant): boolean {
  return !target.dead && target.knockdownRemaining <= 0;
}

/** Whether a status on `target` stops a knockdown (#468). */
function preventsKnockdown(target: Combatant): boolean {
  return target.statuses.active.some((status) => getStatusDefinition(status.id).preventsKnockdown);
}

/**
 * Put `target` on the ground and end what it was doing, as death does:
 * a cast fails, paid for and recharging, a queued skill and the
 * auto-attack are dropped. Not an interrupt, so it says nothing of the
 * cast. Whatever the simulation keeps besides, a walk or a skill walking
 * in, it drops on the `knocked-down` event.
 */
function knockDown(target: Combatant, durationSeconds: number): void {
  target.knockdownRemaining = durationSeconds;
  const cancelled = target.cast.cancelCast();
  const skill = cancelled === undefined ? undefined : getSkill(cancelled.skillId);
  if (cancelled !== undefined && skill !== undefined) {
    beginRecharge(target.cast, skill, skill.rechargeSeconds, cancelled.key);
  }
  target.cast.clearQueue();
  target.attack = undefined;
}

/**
 * Interrupt the cast `target` has in progress: the one path every cast's
 * interrupt takes, an interrupt effect's and daze's (#546). As in GW1,
 * the interrupted skill recharges as if it had been used: its cost is
 * spent and its recharge starts (ADR-0029). `byId` did it, and a status
 * on the target that answers an interrupt hears of it (#1473). Returns
 * whether there was a cast to interrupt. An uninterruptible bearer's
 * (#1464) never is, nor is a cast that consumed Song of Concentration
 * (#1505).
 */
function interruptCast(
  target: Combatant,
  byId: string | undefined,
  events: CombatEvent[],
): boolean {
  if (!castInterruptible(target)) {
    return false;
  }
  const cancelled = target.cast.cancelCast();
  if (cancelled === undefined) {
    return false;
  }
  const skill = getSkill(cancelled.skillId);
  if (skill !== undefined) {
    beginRecharge(target.cast, skill, skill.rechargeSeconds, cancelled.key);
  }
  // A skill queued behind the cast goes with it, as in GW1 (#1722).
  target.cast.clearQueue();
  events.push({ kind: "interrupted", targetId: target.id, skillId: cancelled.skillId });
  target.statuses.recordInterrupt(byId);
  return true;
}

/**
 * Whether `target`'s cast in progress, if any, may be interrupted: not
 * by an uninterruptible bearer (#1464), nor one that consumed Song of
 * Concentration (#1505).
 */
function castInterruptible(target: Combatant): boolean {
  return (
    !aggregateModifiers(target.statuses.active).uninterruptible &&
    target.cast.activeCast?.rule.uninterruptible !== true
  );
}

/**
 * Whether `target` has a plain swing under way that may be interrupted
 * (#1709): an attacker walking to its foe or between swings has none, nor
 * has one knocked down, and an uninterruptible bearer (#1464) never is.
 */
function swingInterruptible(target: Combatant): boolean {
  const { attack } = target;
  return (
    attack !== undefined &&
    !target.moving &&
    attack.swingElapsed > 0 &&
    target.knockdownRemaining <= 0 &&
    !aggregateModifiers(target.statuses.active).uninterruptible
  );
}

/**
 * Interrupt the plain swing `target` has under way (#1709): GW1
 * interrupts "all attacks", not only skills. Its blow never lands and its
 * swing starts over; the auto-attack goes on, at the same foe, as after
 * Clumsiness (#1593). `byId` did it, heard as a cast's interrupt is
 * (#1473). Returns whether there was a swing to interrupt.
 */
function interruptSwing(
  target: Combatant,
  byId: string | undefined,
  events: CombatEvent[],
): boolean {
  const { attack } = target;
  if (attack === undefined || !swingInterruptible(target)) {
    return false;
  }
  attack.swingElapsed = 0;
  events.push({ kind: "attack-interrupted", targetId: target.id });
  target.statuses.recordInterrupt(byId);
  return true;
}

/**
 * Daze's interrupt (#546, GW1): a spell `target` is casting is
 * interrupted. A signet, a shout, an attack skill or no cast at all is
 * left alone, and nothing is said: this is a side effect, not an
 * interrupt that can miss. Called as a status that `interruptsSpells` is
 * applied, by `byId`, its source.
 */
export function interruptIfCastingSpell(
  target: Combatant,
  byId: string,
  events: CombatEvent[],
): void {
  const cast = target.cast.activeCast;
  const skill = cast === undefined ? undefined : getSkill(cast.skillId);
  if (skill !== undefined && isSpell(skill.type)) {
    interruptCast(target, byId, events);
  }
}

/**
 * Clumsiness's cancel (#1593) of an attack skill `target` is beginning:
 * interrupted, as by an `interrupt`, and recharging. Whether it was.
 */
export function interruptAttackSkill(
  target: Combatant,
  byId: string,
  events: CombatEvent[],
): boolean {
  const cast = target.cast.activeCast;
  const skill = cast === undefined ? undefined : getSkill(cast.skillId);
  return skill?.type === "attack" && interruptCast(target, byId, events);
}

/**
 * What a landed attack interrupts (#1105): a spell its dazed victim is
 * casting (#546), or a cast its victim is easily interrupted in, such as
 * setting a trap. Anything else is left alone, and nothing is said.
 * Every landed attack calls it, by `byId`, its attacker; a miss or a
 * block never does.
 */
export function interruptOnHit(
  victim: Combatant,
  byId: string | undefined,
  events: CombatEvent[],
): void {
  const cast = victim.cast.activeCast;
  const skill = cast === undefined ? undefined : getSkill(cast.skillId);
  if (skill === undefined) {
    return;
  }
  const dazed = victim.statuses.active.some(({ id }) => getStatusDefinition(id).interruptsSpells);
  if (isEasilyInterrupted(skill) || (dazed && isSpell(skill.type))) {
    interruptCast(victim, byId, events);
  }
}

/**
 * Apply (or refresh) a status, and take what it takes as it lands: a
 * newly applied maximum health loss (deep wound) comes off current health
 * too, never below 1, so it alone never kills (#764: GW1 defers the loss
 * to the next health change; flooring it is the accepted approximation).
 * A refresh takes nothing. A newly raised maximum (#1359, Endure Pain)
 * raises current health by as much, never past the effective maximum.
 * Returns the health taken, for the caller to
 * report as damage; `undefined` when it is refused, a hex or a condition
 * on an invulnerable target (#1208), for the caller to report nothing.
 * An invulnerable target gains any other status, and loses no health to it.
 */
export function applyStatus(
  target: Combatant,
  statusId: StatusId,
  durationSeconds: number,
  sourceId: string,
): number | undefined {
  const { category } = getStatusDefinition(statusId);
  if (isInvulnerable(target) && (category === "hex" || category === "condition")) {
    return undefined;
  }
  const lossBefore = maxHealthLossOf(target);
  const raisedBefore = raisedMaxHealth(target);
  if (!target.statuses.apply(statusId, durationSeconds, sourceId)) {
    return 0;
  }
  const raised = raisedMaxHealth(target) - raisedBefore;
  if (raised > 0) {
    if (!target.dead) {
      target.health = Math.min(target.health + raised, effectiveMaxHealth(target));
    }
    return 0;
  }
  // A Guild Lord's cut spends its per-second cap (#1223), as damage does.
  const cut = Math.min(maxHealthLossOf(target) - lossBefore, target.health - 1);
  const taken = cut <= 0 || isInvulnerable(target) ? 0 : guardedLoss(target, cut);
  if (taken <= 0) {
    return 0;
  }
  target.health -= taken;
  return taken;
}

/**
 * `statusId` on `target` for `durationSeconds`, from `sourceId`, as every
 * skill puts one on: what it ends (#919), the health it takes as it lands
 * (#800) and Dazed's interrupt, each reported. A refused one (#1208)
 * does none of it, and the target says it is invulnerable (#1233). A hex
 * a status breaks (#1403) does none of it either: that status is reported
 * ended.
 */
function landStatus(
  target: Combatant,
  statusId: StatusId,
  durationSeconds: number,
  sourceId: string,
  events: CombatEvent[],
): void {
  // Immune (#1455): it does not land, and there is nothing to say.
  if (target.statuses.isImmuneTo(statusId)) {
    return;
  }
  const ending = endedByGaining(target, statusId);
  const breaker =
    getStatusDefinition(statusId).category === "hex" ? target.statuses.hexBreaker() : undefined;
  const loss = applyStatus(target, statusId, durationSeconds, sourceId);
  if (loss === undefined) {
    events.push({ kind: "invulnerable", targetId: target.id });
    return;
  }
  // Hex Breaker (#1403): the hex fails, and the stance is spent.
  if (breaker !== undefined && !target.statuses.has(breaker)) {
    reportEnded(target, [breaker], events);
    return;
  }
  events.push({
    kind: "status-applied",
    targetId: target.id,
    statusId,
    // No end of its own (#1789): as a maintained one, no duration.
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
  });
  reportEnded(target, ending, events);
  if (loss > 0) {
    events.push({ kind: "health-lost", targetId: target.id, amount: loss, statusId });
  }
  // Applying Dazed interrupts a spell, even on a target already dazed.
  if (getStatusDefinition(statusId).interruptsSpells) {
    interruptIfCastingSpell(target, sourceId, events);
  }
}

/**
 * Health the caster gives up (a sacrifice, #944's health loss too).
 * Self-inflicted and, in this genre, famously *can* kill you, so it has
 * the same death check as damage rather than a special "safe" path.
 * Nothing that reacts to damage sees it. An invulnerable caster (#1208)
 * gives up none: the skill works, free.
 */
/**
 * Whether `creature` is a summoned one (#1309): a minion or a spirit. Not
 * a pet, which GW1 does not count as summoned (#1528), nor a map NPC.
 */
function isSummoned(creature: Creature | undefined): boolean {
  return creature?.kind === "minion" || creature?.kind === "spirit";
}

/**
 * Destroy `candidate` when it is a living spirit on `caster`'s side
 * (#1309): dead at once, so nothing later in the step acts on it or
 * through it, and `spirit-destroyed` tells the simulation to take it off
 * the field as an expired spirit leaves. Not damage, so Shelter and Union
 * do not soften it, and not a death: no killer and no morale.
 */
function destroySpirit(candidate: TargetCandidate, caster: Combatant, events: CombatEvent[]): void {
  const { combatant, creature } = candidate;
  if (creature?.kind !== "spirit" || combatant.dead || combatant.team !== caster.team) {
    return;
  }
  combatant.health = 0;
  combatant.dead = true;
  events.push({ kind: "spirit-destroyed", targetId: combatant.id });
}

/**
 * `loser` loses `amount` health: the caster's `sacrifice`, or a target's
 * `health-loss` (#1648, #1678). Not damage, so nothing mitigates it; only
 * invulnerability and a Guild Lord's cap stop it, and it can kill.
 */
function loseHealth(
  loser: Combatant,
  amount: number,
  kind: "sacrifice" | "health-loss",
  events: CombatEvent[],
): void {
  if (amount <= 0 || loser.dead || isInvulnerable(loser)) {
    return;
  }
  // A Guild Lord loses no more than its Amulet lets through (#1223).
  const applied = guardedLoss(loser, Math.min(amount, loser.health));
  if (applied <= 0) {
    return;
  }
  loser.health -= applied;
  events.push({ kind, targetId: loser.id, amount: applied });
  if (loser.health <= 0) {
    loser.dead = true;
    events.push({ kind: "death", targetId: loser.id });
  }
}

/**
 * How many statuses of `profession` `earlier`, this resolution's events
 * so far, took off `targetId` (#944): Rend Enchantments' Monk ones.
 */
function removedOfProfession(
  targetId: string,
  profession: ProfessionId,
  earlier: readonly CombatEvent[],
): number {
  return earlier.filter(
    (event) =>
      event.kind === "status-removed" &&
      event.targetId === targetId &&
      getStatusDefinition(event.statusId).profession === profession,
  ).length;
}

/**
 * What `statusId` newly on `target` would end (#919): its statuses that
 * end when their bearer gains that category, as Natural Stride on a hex,
 * and those `statusId` makes it immune to (#1455).
 */
function endedByGaining(target: Combatant, statusId: StatusId): StatusId[] {
  const { category, immuneTo } = getStatusDefinition(statusId);
  return target.statuses.active
    .filter(
      ({ id }) =>
        getStatusDefinition(id).endsWhenBearerGains.some((c) => c === category) ||
        immuneTo.includes(id),
    )
    .map(({ id }) => id);
}

/** Those of `ending` that `target` no longer bears, reported as ended. */
function reportEnded(target: Combatant, ending: readonly StatusId[], events: CombatEvent[]): void {
  for (const statusId of ending) {
    if (!target.statuses.has(statusId)) {
      events.push({ kind: "status-expired", targetId: target.id, statusId });
    }
  }
}

/**
 * The skill `target` is activating that an interrupt filtered by `only`
 * may not interrupt (#521, #796), or `null`: with no `only` or `only:
 * "skill"` (#1709), any cast is fair game; with `only: "spell"`, anything
 * but a spell is refused (#1008), and with `"spell-or-chant"`, anything
 * but a spell or a chant.
 */
function refusedSkill(only: InterruptEffect["only"], target: Combatant): string | null {
  const cast = target.cast.activeCast;
  if (only === undefined || only === "skill" || cast === undefined) {
    return null;
  }
  const skill = getSkill(cast.skillId);
  const allowed =
    skill !== undefined &&
    (isSpell(skill.type) || (only === "spell-or-chant" && skill.type === "chant"));
  return allowed ? null : cast.skillId;
}

/**
 * What an interrupt filtered by `only` would cut short on `target` right
 * now, landing nothing (#1713): its cast, which comes first, or with none
 * its plain swing under way, which only an unfiltered one, "an action",
 * stops (#1709); `null` for a miss. The `interrupt` effect and a bot
 * aiming one both ask it, so they cannot drift apart.
 */
export function interruptLands(
  only: InterruptEffect["only"],
  target: Combatant,
): "cast" | "swing" | null {
  if (target.dead) {
    return null;
  }
  if (target.cast.activeCast !== undefined) {
    return refusedSkill(only, target) === null && castInterruptible(target) ? "cast" : null;
  }
  return only === undefined && swingInterruptible(target) ? "swing" : null;
}

/**
 * Apply one effect to `context.target`. `earlier` is what this skill's
 * resolution has emitted before it, for a `perEnergyLost` amount (#793)
 * and an interrupt that finds its target already interrupted (#817); an
 * effect applied on its own has nothing before it. `lostBy` is whose loss
 * a `perEnergyLost` amount counts: the target, or a splash's centre (#920).
 */
export function applyEffect(
  effect: UnconditionalEffect,
  context: SkillContext,
  earlier: readonly CombatEvent[] = [],
  lostBy: Combatant | undefined = context.target,
): CombatEvent[] {
  const events: CombatEvent[] = [];
  const { caster, target } = context;

  switch (effect.kind) {
    case "damage": {
      if (target === undefined) {
        return events;
      }
      // Physical and elemental skill damage respects armor; holy, shadow and
      // typeless damage ignores it (#760). A conditional bonus joins the
      // same packet, read as it lands (#977).
      const bonus = effect.conditionalBonus;
      const amount = perEnergyLost(
        effect,
        resolveMagnitude(effect.amount, caster) +
          (bonus !== undefined && stateHolds(bonus.condition, caster, target, context.surroundings)
            ? resolveMagnitude(bonus.amount, caster)
            : 0),
        lostBy,
        earlier,
      );
      if (amount <= 0) {
        return events;
      }
      // Winter's (#1745): elemental damage reaches its bearer as cold.
      const packet = skillDamage(
        amount,
        damageTypeTaken(effect.type, target.statuses.active),
        withSkillArmorPenetration(effect.armorPenetration, caster, context.profession),
      );
      applyDamage(
        target,
        mitigate(packet, target, context.rules, hitLocationOf(packet, context.rng)),
        packet.type,
        false,
        events,
        caster,
      );
      return events;
    }

    case "heal": {
      const healed = effect.recipient === "caster" ? caster : target;
      if (healed === undefined) {
        return events;
      }
      // Healer's Covenant's "heal 20% less" (#1761).
      applyHeal(
        healed,
        ownHeal(
          perEnergyLost(
            effect,
            healAmount(effect, caster, target, context.surroundings, earlier, context.usedSkill),
            lostBy,
            earlier,
          ),
          context.own,
        ),
        events,
      );
      return events;
    }

    case "energy-gain": {
      if (effect.toTarget === true) {
        if (target !== undefined) {
          gainEnergy(target, resolveMagnitude(effect.amount, caster), events, effect.upTo);
        }
        return events;
      }
      gainEnergy(
        caster,
        perOwnCreature(
          effect,
          perEnergyLost(
            effect,
            perUsedSkillEnergy(effect, caster, context.usedSkill),
            lostBy,
            earlier,
          ),
          caster,
          context.surroundings,
        ),
        events,
        effect.upTo,
      );
      return events;
    }

    case "adrenaline-gain": {
      if (fillPools(caster, effect.strikes * ADRENALINE_PER_STRIKE)) {
        events.push({
          kind: "adrenaline-gained",
          targetId: caster.id,
          strikes: effect.strikes,
          skillId: context.skillId,
        });
      }
      return events;
    }

    case "energy-loss": {
      if (target === undefined || target.dead) {
        return events;
      }
      loseEnergy(target, resolveMagnitude(effect.amount, caster), events);
      return events;
    }

    case "energy-steal": {
      if (target === undefined || target.dead || caster.dead) {
        return events;
      }
      gainEnergy(
        caster,
        loseEnergy(target, resolveMagnitude(effect.amount, caster), events),
        events,
      );
      return events;
    }

    case "life-steal": {
      if (target === undefined || target.dead || caster.dead) {
        return events;
      }
      stealLife(caster, target, resolveMagnitude(effect.amount, caster), events);
      return events;
    }

    // The corpse was exploited before the skill resolved (#466): the
    // simulation skips every effect of a cast that found none.
    case "steal-from-corpse": {
      gainHealth(caster, resolveMagnitude(effect.amount, caster), events);
      return events;
    }

    case "sacrifice-health": {
      loseHealth(
        caster,
        Math.round((caster.maxHealth * effect.percentOfMax) / 100),
        "sacrifice",
        events,
      );
      return events;
    }

    case "lose-health": {
      if (target === undefined) {
        return events;
      }
      if (effect.recipient === "target") {
        loseHealth(target, resolveMagnitude(effect.amount, caster), "health-loss", events);
        return events;
      }
      const removed =
        effect.perRemovedOfProfession === undefined
          ? 1
          : removedOfProfession(target.id, effect.perRemovedOfProfession, earlier);
      loseHealth(caster, resolveMagnitude(effect.amount, caster) * removed, "sacrifice", events);
      return events;
    }

    case "give-health": {
      if (target === undefined || target.dead) {
        return events;
      }
      // Not damage: nothing caps, charges or answers it, and half of what
      // is left is always less than all of it, so it never kills. An
      // invulnerable caster (#1208) heals as much and loses none.
      const lost = Math.floor(effect.fractionOfCurrent * caster.health);
      if (lost > 0 && !isInvulnerable(caster)) {
        caster.health -= lost;
        events.push({ kind: "sacrifice", targetId: caster.id, amount: lost });
      }
      applyHeal(
        target,
        Math.round((lost * resolveMagnitude(effect.healPercent, caster)) / 100),
        events,
      );
      return events;
    }

    case "apply-status": {
      if (target === undefined || target.dead) {
        return events;
      }
      // A weapon spell lasts longer with its caster's Spawning Power (#1098),
      // whatever skill or trigger lands it.
      const base =
        getStatusDefinition(effect.statusId).category === "weapon-spell"
          ? effect.durationSeconds *
            spawningPowerMultiplier(rankOf(caster, SPAWNING_POWER_ATTRIBUTE))
          : effect.durationSeconds;
      // A status the caster bears lengthens what its skills of a kind put on (#1761).
      const durationSeconds = scaledStatusDuration(
        target,
        effect.statusId,
        base * (context.own?.durationMultiplier ?? 1),
      );
      landStatus(target, effect.statusId, durationSeconds, caster.id, events);
      return events;
    }

    case "transfer-conditions": {
      if (target === undefined || target.dead) {
        return events;
      }
      const [giver, taker] = effect.from === "caster" ? [caster, target] : [target, caster];
      const moved = giver.statuses.takeNewest("condition", effect.count);
      // The caster becomes every moved condition's source: a Bleeding Draw
      // Conditions takes from an ally counts as the Monk's own from then on.
      for (const { id, remainingSeconds } of moved) {
        events.push({ kind: "status-removed", targetId: giver.id, statusId: id });
        const durationSeconds = remainingSeconds * effect.durationMultiplier;
        landStatus(taker, id, scaledStatusDuration(taker, id, durationSeconds), caster.id, events);
      }
      if (effect.healPerCondition !== undefined && moved.length > 0) {
        applyHeal(caster, resolveMagnitude(effect.healPerCondition, caster) * moved.length, events);
      }
      return events;
    }

    case "spread-conditions": {
      const at = target === undefined ? undefined : context.surroundings.get(target.id)?.position;
      if (target === undefined || target.dead || at === undefined) {
        return events;
      }
      // Read before any copy lands, so what the first foe gets the rest do too.
      const conditions = target.statuses.active.filter(
        ({ id }) => getStatusDefinition(id).category === "condition",
      );
      const reached = [...context.surroundings.values()].filter(
        ({ combatant, position }) =>
          !combatant.dead &&
          combatant.id !== target.id &&
          combatant.team !== caster.team &&
          distance(position, at) <= effect.radius,
      );
      for (const combatant of nearestFirst(reached, at)) {
        for (const { id, remainingSeconds } of conditions) {
          landStatus(
            combatant,
            id,
            scaledStatusDuration(combatant, id, remainingSeconds),
            caster.id,
            events,
          );
        }
      }
      return events;
    }

    case "maintain-status": {
      // Well of the Profane (#1732): it does not land, as `landStatus`'s immune.
      if (target === undefined || target.dead || target.statuses.isImmuneTo(effect.statusId)) {
        return events;
      }
      // The caster's newest; the simulation drops what it cannot pay for.
      const ending = endedByGaining(target, effect.statusId);
      target.statuses.maintain(effect.statusId, caster.id, caster.nextMaintainSeq);
      caster.nextMaintainSeq += 1;
      events.push({
        kind: "status-applied",
        targetId: target.id,
        statusId: effect.statusId,
        durationSeconds: null,
      });
      reportEnded(target, ending, events);
      return events;
    }

    case "remove-status": {
      const bearer = effect.from === "caster" ? caster : target;
      if (bearer === undefined) {
        return events;
      }
      const removed = bearer.statuses.removeByCategory(
        effect.category,
        removeCount(effect, caster, bearer, context.surroundings, earlier),
        effect.profession,
        effect.statusId,
      );
      for (const statusId of removed) {
        events.push({ kind: "status-removed", targetId: bearer.id, statusId });
      }
      return events;
    }

    case "interrupt": {
      if (target === undefined || target.dead) {
        return events;
      }
      const lands = interruptLands(effect.only, target);
      const landed =
        lands === "cast"
          ? interruptCast(target, caster.id, events)
          : lands === "swing" && interruptSwing(target, caster.id, events);
      if (!landed) {
        // Already interrupted by this resolution, as by the daze its own
        // blow brought down (#817): the player's interrupt landed, so it
        // is no miss.
        if (wasInterrupted(target.id, earlier)) {
          return events;
        }
        // Already missed by this resolution, as by Signet of Disruption's
        // hexed-foe interrupt before its spell one (#1627): one miss is told.
        if (
          earlier.some((event) => event.kind === "interrupt-missed" && event.targetId === target.id)
        ) {
          return events;
        }
        // Nothing it may interrupt was being cast: the interrupt is wasted. Emitted
        // explicitly so a combat log can show the miss, and why — landing an
        // interrupt is a timing skill, and silently swallowing failures
        // would hide exactly the feedback that teaches it.
        events.push({
          kind: "interrupt-missed",
          targetId: target.id,
          refusedSkillId: refusedSkill(effect.only, target),
        });
      }
      return events;
    }

    case "knockdown": {
      if (target === undefined || !canBeKnockedDown(target)) {
        return events;
      }
      if (preventsKnockdown(target)) {
        // Stopped, and what stops only one is spent (#845).
        for (const statusId of target.statuses.endOnKnockdownPrevented()) {
          events.push({ kind: "status-removed", targetId: target.id, statusId });
        }
        return events;
      }
      // Earthbind (#1265): never shorter than its minimum, and its spirit
      // pays for every knockdown, one long enough already included.
      const minimum = aggregateModifiers(target.statuses.active).knockdownMinSeconds;
      const durationSeconds = Math.max(effect.durationSeconds, minimum ?? 0);
      if (minimum !== undefined) {
        target.statuses.chargeSources((definition) => definition.knockdownMinSeconds !== undefined);
      }
      knockDown(target, durationSeconds);
      events.push({ kind: "knocked-down", targetId: target.id, durationSeconds });
      return events;
    }

    case "shadow-step": {
      if (effect.to === "away-from-selection") {
        if (!caster.dead) {
          events.push({ kind: "shadow-stepped-away", targetId: caster.id });
        }
        return events;
      }
      // To a living target only: there is nowhere to step to otherwise.
      if (target === undefined || target.dead || caster.dead) {
        return events;
      }
      events.push({ kind: "shadow-stepped", targetId: caster.id, toId: target.id });
      return events;
    }

    case "resurrect": {
      // Only the dead: one whom another resurrection, or the respawn
      // timer, brought back first is left as they are.
      if (!target?.dead) {
        return events;
      }
      const shares = partyShares(effect, caster, context.surroundings);
      const share = (percent: number): number => Math.min(100, percent * shares) / 100;
      let health: number;
      if (effect.health.kind === "percent") {
        health = target.maxHealth * share(resolveMagnitude(effect.health.percent, caster));
      } else {
        // Not damage, and half of what is left is less than all of it: it
        // never kills, as Infuse Health's loss, and none of it while
        // invulnerable (#1208).
        const lost = Math.floor(effect.health.casterLosesFractionOfCurrent * caster.health);
        if (lost > 0 && !isInvulnerable(caster)) {
          caster.health -= lost;
          events.push({ kind: "sacrifice", targetId: caster.id, amount: lost });
        }
        health = caster.health;
      }
      resurrect(target, health, share(resolveMagnitude(effect.energyPercent, caster)), events);
      if (effect.at === "caster") {
        events.push({ kind: "teleported", targetId: target.id, toId: caster.id });
      }
      return events;
    }

    // Revive Animal (#1108): every dead allied companion near the caster.
    case "resurrect-companions": {
      const at = context.surroundings.get(caster.id)?.position;
      if (at === undefined) {
        return events;
      }
      const percent = resolveMagnitude(effect.healthPercent, caster);
      for (const { combatant, position, creature } of context.surroundings.values()) {
        if (
          creature?.companionSkillId !== undefined &&
          combatant.dead &&
          combatant.team === caster.team &&
          distance(position, at) <= effect.radius
        ) {
          resurrect(combatant, (combatant.maxHealth * percent) / 100, 0, events);
        }
      }
      return events;
    }

    case "drain-own-energy": {
      loseEnergy(caster, Math.floor(caster.energy), events);
      return events;
    }

    case "overcast":
      if (target !== undefined && !target.dead) {
        addOvercast(target, resolveMagnitude(effect.amount, caster));
      }
      return events;

    case "caster-gains-status": {
      if (caster.dead) {
        return events;
      }
      const durationSeconds = scaledStatusDuration(caster, effect.statusId, effect.durationSeconds);
      landStatus(caster, effect.statusId, durationSeconds, caster.id, events);
      return events;
    }

    case "splash": {
      const at = target === undefined ? undefined : context.surroundings.get(target.id)?.position;
      if (target === undefined || at === undefined) {
        return events;
      }
      const reached = [...context.surroundings.values()].filter(
        ({ combatant, position, creature }) =>
          !combatant.dead &&
          combatant.id !== target.id &&
          (effect.hits === "allies" || effect.hits === "party"
            ? combatant.team === caster.team && (effect.hits === "allies" || creature === undefined)
            : combatant.team !== caster.team && (effect.hits === "foes" || isSummoned(creature))) &&
          distance(position, at) <= effect.radius,
      );
      for (const combatant of nearestFirst(reached, at).slice(0, effect.maxTargets)) {
        for (const inner of effect.effects) {
          events.push(...applyEffect(inner, { ...context, target: combatant }, earlier, target));
        }
      }
      return events;
    }

    case "destroy-target-spirit": {
      const spirit = target === undefined ? undefined : context.surroundings.get(target.id);
      if (spirit !== undefined) {
        destroySpirit(spirit, caster, events);
      }
      return events;
    }

    case "destroy-allied-spirits": {
      const at = context.surroundings.get(caster.id)?.position;
      if (at === undefined) {
        return events;
      }
      const near = [...context.surroundings.values()].filter(
        ({ position }) => distance(position, at) <= effect.radius,
      );
      for (const spirit of near) {
        destroySpirit(spirit, caster, events);
      }
      return events;
    }

    case "disable-skill": {
      if (target === undefined) {
        return events;
      }
      const interrupted = interruptedSkill(target.id, earlier);
      if (
        (effect.which === "interrupted" || effect.which === "interrupted-and-attribute") &&
        interrupted === undefined
      ) {
        return events;
      }
      const seconds = resolveMagnitude(effect.seconds, caster);
      for (const key of disabledBy(effect, target, interrupted)) {
        // A disabled skill loses all its adrenaline (GW1, #1097), though
        // a longer recharge kept the disable from lengthening its wait.
        emptyPool(target, key);
        if (target.cast.disable(key, seconds)) {
          const skillId = skillIdOfKey(key);
          events.push({ kind: "skill-disabled", targetId: target.id, skillId, seconds });
        }
      }
      return events;
    }

    case "disable-own-skills": {
      const bar = resolvedBar(caster.skillBar, caster.cast).filter((slot) => slot !== null);
      const disabled = bar.filter((slot) => disabledOwn(effect, slot.skillId, context.skillId));
      for (const { key, skillId } of disabled) {
        emptyPool(caster, key);
        if (caster.cast.disable(key, effect.seconds)) {
          events.push({
            kind: "skill-disabled",
            targetId: caster.id,
            skillId,
            seconds: effect.seconds,
          });
        }
      }
      return events;
    }

    case "chain-mark":
      if (target !== undefined && !target.dead) {
        caster.chainMarks.set(target.id, {
          role: effect.role,
          remainingSeconds: CHAIN_MARK_SECONDS,
        });
      }
      return events;

    case "lengthen-recharge": {
      const used = context.usedSkill;
      // This skill's own is the resolution's to add (`resolveSkillEffects`).
      if (effect.of === "this-skill" || target === undefined || used === undefined) {
        return events;
      }
      const seconds = resolveMagnitude(effect.seconds, caster);
      target.cast.lengthenRecharge(used.key, seconds);
      events.push({
        kind: "recharge-lengthened",
        targetId: target.id,
        skillId: used.skillId,
        seconds,
      });
      return events;
    }

    case "recharge-faster":
    case "recharge-others":
    case "summon":
    case "create-ground-effect":
      // Nothing lands on anyone: the resolution reads it (`resolveSkillEffects`).
      return events;
  }
}

/** Whether `condition` is read from how things stand rather than from what came before (#794). */
export function isStateCondition(condition: EffectCondition): condition is StateCondition {
  switch (condition.kind) {
    case "interrupted":
    case "interrupted-spell":
    case "removed":
    case "resurrected":
      return false;
    case "target-health-below":
    case "target-health-above":
    case "caster-health-below":
    case "target-chain-mark":
    case "target-has":
    case "target-has-any":
    case "target-casting":
    case "target-using-skill":
    case "target-lacks-other-hex":
    case "caster-has":
    case "caster-lacks":
    case "target-alone":
    case "target-near-caster-ally":
    case "target-not-moving":
    case "target-knocked-down":
    case "target-moving":
    case "target-has-status":
    case "target-lacks-status":
    case "caster-more-energy":
    case "caster-overcast":
    case "caster-wields":
    case "caster-holds-shield":
    case "target-less-health":
    case "target-more-health":
    case "target-attacking":
    case "target-not-attacking":
    case "target-casting-or-attacking":
    case "any-of":
    case "not":
    case "target-is-summoned":
    case "caster-no-spirit-within":
    case "caster-spirit-within":
    case "caster-spirit-or-corpse-within":
      return true;
  }
}

/**
 * Whether `condition` holds for `target` and `caster` as they stand now
 * (#794). Health is a share of the maximum a deep wound left; exactly
 * the fraction is not below it. A target nowhere in `surroundings` is
 * not alone: there is nowhere to be alone. `firing` is the status whose
 * trigger is resolving (#1473), if one is.
 */
export function stateHolds(
  condition: StateCondition,
  caster: Combatant,
  target: Combatant,
  surroundings: Surroundings,
  firing?: StatusId,
): boolean {
  switch (condition.kind) {
    case "target-health-below":
      return target.health < effectiveMaxHealth(target) * condition.fraction;
    case "target-health-above":
      return target.health > effectiveMaxHealth(target) * condition.fraction;
    case "caster-health-below":
      return caster.health < effectiveMaxHealth(caster) * condition.fraction;
    case "target-chain-mark":
      return caster.chainMarks.get(target.id)?.role === condition.role;
    case "target-has":
      return (
        target.statuses.countByCategory(
          condition.category,
          condition.profession,
          condition.attribute,
        ) > 0
      );
    case "target-has-any":
      return condition.categories.some((category) => target.statuses.countByCategory(category) > 0);
    case "caster-has":
      return caster.statuses.countByCategory(condition.category, condition.profession) > 0;
    case "caster-lacks":
      return caster.statuses.countByCategory(condition.category, condition.profession) === 0;
    case "target-casting": {
      const cast = target.cast.activeCast;
      const skill = cast === undefined ? undefined : getSkill(cast.skillId);
      return skill !== undefined && isSpell(skill.type);
    }
    case "target-using-skill":
      return target.cast.activeCast !== undefined;
    case "target-lacks-other-hex":
      return !target.statuses.active.some(({ id }) => {
        const { category, profession } = getStatusDefinition(id);
        return id !== firing && category === "hex" && profession === condition.profession;
      });
    case "target-alone": {
      const at = surroundings.get(target.id)?.position;
      return (
        at !== undefined &&
        ![...surroundings.values()].some(
          ({ combatant, position }) =>
            !combatant.dead &&
            combatant.id !== target.id &&
            combatant.team === target.team &&
            distance(position, at) <= condition.radius,
        )
      );
    }
    case "target-near-caster-ally": {
      const at = surroundings.get(target.id)?.position;
      return (
        at !== undefined &&
        [...surroundings.values()].some(
          ({ combatant, position }) =>
            !combatant.dead &&
            combatant.id !== caster.id &&
            combatant.team === caster.team &&
            distance(position, at) <= condition.radius,
        )
      );
    }
    case "target-not-moving":
      return !target.moving;
    case "target-knocked-down":
      return target.knockdownRemaining > 0;
    case "target-moving":
      return target.moving;
    case "target-has-status":
      return target.statuses.has(condition.statusId);
    case "target-lacks-status":
      return !target.statuses.has(condition.statusId);
    case "caster-more-energy":
      return caster.energy > target.energy;
    case "caster-overcast":
      return caster.overcast > 0;
    case "caster-wields":
      return wieldsFor(caster.equipment.mainHand.weapon.id, condition.weapon);
    case "caster-holds-shield":
      return caster.equipment.offhandId === "shield";
    case "target-less-health":
      return target.health < caster.health;
    case "target-more-health":
      return target.health > caster.health;
    case "target-attacking":
      return isAttacking(target);
    case "target-not-attacking":
      return !isAttacking(target);
    case "any-of":
      return condition.conditions.some((each) =>
        stateHolds(each, caster, target, surroundings, firing),
      );
    case "not":
      return !stateHolds(condition.condition, caster, target, surroundings, firing);
    case "target-casting-or-attacking": {
      const cast = target.cast.activeCast;
      const skill = cast === undefined ? undefined : getSkill(cast.skillId);
      return (skill !== undefined && isSpell(skill.type)) || isAttacking(target);
    }
    case "target-is-summoned":
      return isSummoned(surroundings.get(target.id)?.creature);
    case "caster-no-spirit-within": {
      const at = surroundings.get(caster.id)?.position;
      return at === undefined || spiritsWithin(surroundings.values(), at, condition.radius) === 0;
    }
    case "caster-spirit-within": {
      const at = surroundings.get(caster.id)?.position;
      return at !== undefined && spiritsWithin(surroundings.values(), at, condition.radius) > 0;
    }
    case "caster-spirit-or-corpse-within": {
      const at = surroundings.get(caster.id)?.position;
      return (
        at !== undefined &&
        (spiritsWithin(surroundings.values(), at, condition.radius) > 0 ||
          [...surroundings.values()].some(
            (body) =>
              isFreshCorpse(body) && distanceWithinRange(at, body.position, condition.radius),
          ))
      );
    }
  }
}

/**
 * How many a `remove-status` takes off `bearer`: its `count`, or that
 * for each living spirit within `perSpiritNear` of it (#1064), or one for
 * each `perRemoved` status `earlier` took off it, to its `max` (#1205). A
 * bearer nowhere in `surroundings` has no spirit near.
 */
function removeCount(
  effect: RemoveStatusEffect,
  caster: Combatant,
  bearer: Combatant,
  surroundings: Surroundings,
  earlier: readonly CombatEvent[],
): number {
  // Contemplation of Purity's one each for the enchantments it took (#1205).
  if (effect.perRemoved !== undefined) {
    return Math.min(
      perRemoved(effect.perRemoved.category, bearer, earlier),
      resolveMagnitude(effect.perRemoved.max, caster),
    );
  }
  const count = effect.count === "all" ? Number.POSITIVE_INFINITY : effect.count;
  if (effect.perSpiritNear === undefined) {
    return count;
  }
  const at = surroundings.get(bearer.id)?.position;
  return at === undefined
    ? 0
    : count * spiritsWithin(surroundings.values(), at, effect.perSpiritNear);
}

/** No state held: a resolution with no target. */
const NONE_HELD: ReadonlySet<EffectCondition> = new Set();

/**
 * The state conditions of the `if`s among `effects` that hold for
 * `target`, read once before any of them lands (#794): a heal cannot
 * lift its own target out of its bonus.
 */
function statesBefore(
  effects: readonly SkillEffect[],
  caster: Combatant,
  target: Combatant | undefined,
  surroundings: Surroundings,
  firing: StatusId | undefined,
): ReadonlySet<EffectCondition> {
  if (target === undefined) {
    return NONE_HELD;
  }
  const held = new Set<EffectCondition>();
  for (const effect of effects) {
    if (
      effect.kind === "if" &&
      isStateCondition(effect.condition) &&
      stateHolds(effect.condition, caster, target, surroundings, firing)
    ) {
      held.add(effect.condition);
    }
  }
  return held;
}

/** Whether `earlier`, this resolution's events so far, interrupted `targetId`'s cast or swing. */
function wasInterrupted(targetId: string, earlier: readonly CombatEvent[]): boolean {
  return earlier.some(
    (event) =>
      (event.kind === "interrupted" || event.kind === "attack-interrupted") &&
      event.targetId === targetId,
  );
}

/** The skill `earlier`, this resolution's events so far, interrupted on `targetId`, if any. */
function interruptedSkill(targetId: string, earlier: readonly CombatEvent[]): string | undefined {
  for (const event of earlier) {
    if (event.kind === "interrupted" && event.targetId === targetId) {
      return event.skillId;
    }
  }
  return undefined;
}

/**
 * The keys a `disable-skill` reaches on `target` (#914): the one
 * interrupted, and for Power Block every skill on its bar of the same
 * attribute. One with no attribute is linked to nothing (GW1). With
 * `all`, the whole bar, empty slots aside (#474). The bar is the one
 * standing now (#469): a copy is disabled under its own key.
 */
function disabledBy(
  effect: DisableSkillEffect,
  target: Combatant,
  interrupted: string | undefined,
): readonly string[] {
  const bar = resolvedBar(target.skillBar, target.cast).filter((slot) => slot !== null);
  if (effect.which === "all") {
    return bar.map(({ key }) => key);
  }
  if (effect.which === "elite") {
    return bar.filter((slot) => getSkill(slot.skillId)?.elite === true).map(({ key }) => key);
  }
  if (interrupted === undefined) {
    return [];
  }
  const cancelled = target.cast.lastCancelled;
  const key = cancelled?.skillId === interrupted ? cancelled.key : interrupted;
  const attributeId = getSkill(interrupted)?.attributeId;
  if (effect.which === "interrupted" || attributeId === undefined) {
    return [key];
  }
  const linked = bar.filter(
    (slot) => slot.key !== key && getSkill(slot.skillId)?.attributeId === attributeId,
  );
  return [key, ...linked.map((slot) => slot.key)];
}

/**
 * Whether `effect` disables the caster's bar skill `skillId` (#1473):
 * for `attribute` (#1511), never `usedId`, the skill that disables them;
 * for `all` (#1570), every one.
 */
function disabledOwn(
  effect: DisableOwnSkillsEffect,
  skillId: string,
  usedId: string | undefined,
): boolean {
  if (effect.which === "all") {
    return true;
  }
  if (effect.which === "spells") {
    return isSpellId(skillId);
  }
  const skill = getSkill(skillId);
  if (effect.which === "attribute") {
    return skillId !== usedId && skill?.attributeId === effect.attributeId;
  }
  return (
    skill !== undefined &&
    skill.profession !== effect.profession &&
    !effect.exceptTypes.includes(skill.type)
  );
}

/** Whether the skill `skillId` names is a spell (`isSpell`; a chant is not one). */
function isSpellId(skillId: string): boolean {
  const skill = getSkill(skillId);
  return skill !== undefined && isSpell(skill.type);
}

/**
 * Whether `condition` holds for `targetId`: for an earlier effect's
 * (#521), read from the events this resolution has emitted so far; for a
 * state (#794), as `held` read it before the first effect.
 */
function conditionHolds(
  condition: EffectCondition,
  caster: Combatant,
  target: Combatant,
  earlier: readonly CombatEvent[],
  held: ReadonlySet<EffectCondition>,
): boolean {
  switch (condition.kind) {
    case "interrupted":
      return interruptedSkill(target.id, earlier) !== undefined;
    case "interrupted-spell":
      return earlier.some(
        (event) =>
          event.kind === "interrupted" && event.targetId === target.id && isSpellId(event.skillId),
      );
    case "removed": {
      const bearerId = condition.from === "caster" ? caster.id : target.id;
      return earlier.some(
        (event) =>
          event.kind === "status-removed" &&
          event.targetId === bearerId &&
          getStatusDefinition(event.statusId).category === condition.category,
      );
    }
    case "resurrected":
      return earlier.some((event) => event.kind === "resurrected" && event.targetId === target.id);
    case "target-health-below":
    case "target-health-above":
    case "caster-health-below":
    case "target-chain-mark":
    case "target-has":
    case "target-has-any":
    case "target-casting":
    case "target-using-skill":
    case "target-lacks-other-hex":
    case "caster-has":
    case "caster-lacks":
    case "target-alone":
    case "target-near-caster-ally":
    case "target-not-moving":
    case "target-knocked-down":
    case "target-moving":
    case "target-has-status":
    case "target-lacks-status":
    case "caster-more-energy":
    case "caster-overcast":
    case "caster-wields":
    case "caster-holds-shield":
    case "target-less-health":
    case "target-more-health":
    case "target-attacking":
    case "target-not-attacking":
    case "target-casting-or-attacking":
    case "any-of":
    case "not":
    case "target-is-summoned":
    case "caster-no-spirit-within":
    case "caster-spirit-within":
    case "caster-spirit-or-corpse-within":
      return held.has(condition);
  }
}

/**
 * What of `effect` lands on `context.target`: itself, or an `if`'s
 * effects when its condition holds for that target, given `earlier`, the
 * events this resolution has emitted so far, and `held`, the states that
 * held before it began.
 */
function landing(
  effect: SkillEffect,
  context: SkillContext,
  earlier: readonly CombatEvent[],
  held: ReadonlySet<EffectCondition>,
): readonly UnconditionalEffect[] {
  if (effect.kind !== "if") {
    return [effect];
  }
  const { caster, target } = context;
  return target !== undefined && conditionHolds(effect.condition, caster, target, earlier, held)
    ? effect.effects
    : [];
}

/**
 * Apply one effect to `context.target`, an `if` included (`landing`).
 * Each effect inside an `if` reads what the ones before it did, as
 * Drain Delusions' gain reads the energy its loss took (#1627).
 */
function applyInOrder(
  effect: SkillEffect,
  context: SkillContext,
  earlier: readonly CombatEvent[],
  held: ReadonlySet<EffectCondition>,
): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (const inner of landing(effect, context, earlier, held)) {
    events.push(...applyEffect(inner, context, [...earlier, ...events]));
  }
  return events;
}

/** Apply `effects` in order to one target; an `if` reads what came before it. */
export function applyEffects(
  effects: readonly SkillEffect[],
  context: SkillContext,
): CombatEvent[] {
  const held = statesBefore(
    effects,
    context.caster,
    context.target,
    context.surroundings,
    context.firingStatusId,
  );
  const events: CombatEvent[] = [];
  for (const effect of effects) {
    events.push(...applyInOrder(effect, context, events, held));
  }
  return events;
}

/**
 * Whether an effect acts on its caster rather than on a target. Exhaustive,
 * so a new effect kind is a compile error here until someone decides.
 *
 * An `if` is per target, since its condition is: an effect inside it that
 * acts on the caster (Power Drain's energy) fires once for every target
 * the condition holds for. Every such skill today has one target, as
 * does each that reads or takes from the caster per target: Rend
 * Enchantments' health loss and Plague Touch's conditions (#944).
 */
function effectActsOnCaster(effect: SkillEffect): boolean {
  switch (effect.kind) {
    case "energy-gain":
      return effect.perTarget !== true && effect.toTarget !== true;
    case "adrenaline-gain":
      return effect.perTarget !== true;
    case "sacrifice-health":
    case "recharge-faster":
    case "recharge-others":
    case "steal-from-corpse":
    case "summon":
    case "create-ground-effect":
    case "drain-own-energy":
    case "caster-gains-status":
    case "destroy-allied-spirits":
    case "resurrect-companions":
    case "disable-own-skills":
      return true;
    case "lengthen-recharge":
      return effect.of === "this-skill";
    // Once, on the primary target, the spirit cast on (#1309), however
    // many allies the skill's area also caught.
    case "destroy-target-spirit":
      return true;
    case "heal":
      return effect.recipient === "caster";
    case "remove-status":
      return effect.from === "caster";
    case "energy-loss":
    case "energy-steal":
    case "life-steal":
    case "damage":
    case "lose-health":
    case "transfer-conditions":
    case "spread-conditions":
    case "give-health":
    case "apply-status":
    case "maintain-status":
    case "interrupt":
    case "knockdown":
    case "shadow-step":
    case "resurrect":
    case "splash":
    case "disable-skill":
    case "chain-mark":
    case "overcast":
    case "if":
      return false;
  }
}

export interface SkillResolution {
  readonly skill: Skill;
  readonly caster: Combatant;
  /** From `resolveTargets`: the primary first. */
  readonly targets: readonly Combatant[];
  readonly rng: SimulationRng;
  readonly rules: CombatRules;
  readonly surroundings: Surroundings;
  /**
   * What the caster's statuses do to this use (#1761), as it was paid for;
   * absent where no use was paid for, as in a tooltip or a test.
   */
  readonly own?: OwnSkillBoost | undefined;
}

/**
 * Apply a landed skill to every target it hit.
 *
 * Effects run in their listed order; one that acts on the caster fires
 * exactly once however many targets were hit, and still fires when none
 * were. With one target this is `applyEffects` exactly. Calling
 * `applyEffects` once per target instead would pay `sacrifice-health`
 * and grant `energy-gain` once per foe caught in a splash.
 *
 * An attack skill's blow, and whether it missed, is `resolveAttackSkill`'s
 * business; this applies its riders to whoever it hit. `earlier` is what
 * the blow emitted, which the riders read as this resolution's (#817).
 */
export function applySkillEffects(
  resolution: SkillResolution,
  earlier: readonly CombatEvent[] = [],
): CombatEvent[] {
  return resolveSkillEffects(resolution, earlier).events;
}

/** What a landed skill did (`resolveSkillEffects`). */
export interface SkillOutcome {
  readonly events: CombatEvent[];
  /**
   * How much shorter this use's recharge is, 0..1 (#845): the
   * `recharge-faster` that landed, if one did; else 0.
   */
  readonly rechargeFraction: number;
  /**
   * How many seconds longer this use's recharge is (#1519): every
   * `lengthen-recharge` of `this-skill` that landed, summed; else 0.
   * Added after `rechargeFraction` and any faster recharge.
   */
  readonly rechargeLongerSeconds: number;
  /**
   * The `summon`s that landed (#1052), in order: the simulation makes the
   * creatures, which only it can add to the match.
   */
  readonly summons: readonly SummonEffect[];
  /**
   * The `create-ground-effect`s that landed (#1087), in order: the
   * simulation places them, which only it can add to the match.
   */
  readonly grounds: readonly CreateGroundEffect[];
  /**
   * The first `if` that did not hold (#1735), when nothing of the skill
   * happened, before or after it; else `undefined`. Its use is told so.
   */
  readonly skipped: SkippedEffect | undefined;
}

/** An `if` that did not hold on `targetId`, the caster's when it had none (#1735). */
export interface SkippedEffect {
  readonly condition: EffectCondition;
  readonly targetId: string;
}

/**
 * `applySkillEffects`, with what it did to the skill's own recharge
 * (#845), which only whoever starts that recharge can act on.
 */
export function resolveSkillEffects(
  resolution: SkillResolution,
  earlier: readonly CombatEvent[] = [],
): SkillOutcome {
  const { skill, caster, targets, rng, rules, surroundings, own } = resolution;
  const held = new Map(
    targets.map(
      (target) =>
        [target, statesBefore(skill.effects, caster, target, surroundings, undefined)] as const,
    ),
  );
  const events: CombatEvent[] = [];
  let rechargeFraction = 0;
  let rechargeLongerSeconds = 0;
  const summons: SummonEffect[] = [];
  const grounds: CreateGroundEffect[] = [];
  let skipped: SkippedEffect | undefined;
  for (const effect of skill.effects) {
    const on = effectActsOnCaster(effect) ? [targets[0]] : targets;
    for (const target of on) {
      const states = (target === undefined ? undefined : held.get(target)) ?? NONE_HELD;
      const context = {
        caster,
        target,
        rng,
        rules,
        surroundings,
        skillId: skill.id,
        profession: skill.profession,
        own,
      };
      const before = [...earlier, ...events];
      const landed = landing(effect, context, before, states);
      if (effect.kind === "if" && landed.length === 0) {
        skipped ??= { condition: effect.condition, targetId: target?.id ?? caster.id };
      }
      for (const inner of landed) {
        if (inner.kind === "recharge-faster") {
          rechargeFraction = Math.max(rechargeFraction, inner.fraction);
        }
        if (inner.kind === "recharge-others") {
          rechargeOthers(caster, skill.id, inner.which);
        }
        if (inner.kind === "lengthen-recharge" && inner.of === "this-skill") {
          const seconds = resolveMagnitude(inner.seconds, caster);
          rechargeLongerSeconds += seconds;
          events.push({
            kind: "recharge-lengthened",
            targetId: caster.id,
            skillId: skill.id,
            seconds,
          });
        }
        if (inner.kind === "summon") {
          summons.push(inner);
        }
        if (inner.kind === "create-ground-effect") {
          grounds.push(inner);
        }
        events.push(...applyEffect(inner, context, [...earlier, ...events]));
      }
    }
  }
  // Divine Favor (#529): once a cast, on the primary target only, after
  // the spell's own effects, through the same heal path.
  const primary = targets[0];
  if (primary !== undefined) {
    // Healer's Covenant's 20% less (#1761) is the bonus's too: it is the spell's heal.
    applyHeal(
      primary,
      ownHeal(
        divineFavorBonusHeal(
          rankOf(caster, DIVINE_FAVOR_ATTRIBUTE),
          skill,
          primary.team === caster.team,
        ),
        own,
      ),
      events,
    );
  }
  return {
    events,
    rechargeFraction,
    rechargeLongerSeconds,
    summons,
    grounds,
    skipped:
      skipped !== undefined && earlier.length === 0 && events.length === 0 ? skipped : undefined,
  };
}

/** `amount` healed by a use `own` touched (#1761), rounded; as it is when none did. */
function ownHeal(amount: number, own: OwnSkillBoost | undefined): number {
  return own === undefined || own.healMultiplier === 1
    ? amount
    : Math.round(amount * own.healMultiplier);
}

/**
 * Every skill of `caster`'s of type `which` but `skillId` recharges at
 * once (#885): Moebius Strike's. The recharge `skillId` starts as it
 * resolves is its own, so it is left alone.
 */
function rechargeOthers(caster: Combatant, skillId: string, which: "attack"): void {
  for (const id of [...caster.cast.rechargeRemaining.keys()]) {
    if (id !== skillId && getSkill(skillIdOfKey(id))?.type === which) {
      caster.cast.endRecharge(id);
    }
  }
}
