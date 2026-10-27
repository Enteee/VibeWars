import { DIVINE_FAVOR_ATTRIBUTE, divineFavorBonusHeal } from "../primary-attributes.js";
import { getSkill } from "./catalog.js";
import { mitigate, spellDamage } from "./damage.js";
import { resolveMagnitude } from "./scaling.js";
import { getStatusDefinition, scaledStatusDuration, type StatusId } from "./status.js";
import { effectiveMaxHealth, healingMultiplierOf, maxHealthLossOf, rankOf } from "./tick.js";
import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import {
  isSpell,
  type Combatant,
  type Skill,
  type SkillContext,
  type EffectCondition,
  type InterruptEffect,
  type SkillEffect,
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
  | { readonly kind: "sacrifice"; readonly targetId: string; readonly amount: number }
  | { readonly kind: "death"; readonly targetId: string }
  | {
      readonly kind: "status-applied";
      readonly targetId: string;
      readonly statusId: StatusId;
      readonly durationSeconds: number;
    }
  /**
   * Health a status took as it landed (#800): deep wound's share of
   * maximum health. Not damage: nothing that reacts to damage sees it.
   */
  | {
      readonly kind: "health-lost";
      readonly targetId: string;
      readonly amount: number;
      readonly statusId: StatusId;
    }
  | { readonly kind: "status-removed"; readonly targetId: string; readonly statusId: StatusId }
  | { readonly kind: "status-expired"; readonly targetId: string; readonly statusId: StatusId }
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
  /** An interrupt that found nothing to interrupt — a wasted cast. */
  | { readonly kind: "interrupt-missed"; readonly targetId: string }
  /** A blinded attack skill that swung and missed: paid for, no effect. */
  | { readonly kind: "attack-missed"; readonly targetId: string }
  /**
   * An attack its target blocked (#534): no damage, no adrenaline, no
   * riders; an attack skill's own if-blocked effects follow it.
   */
  | { readonly kind: "attack-blocked"; readonly targetId: string }
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
    };

/**
 * Apply an already-mitigated amount, clamping at 0 and flagging death
 * exactly once.
 *
 * Mitigation happens in `damage.ts` and is deliberately *not* done here:
 * degeneration reaches this function too, and armor must not apply to
 * it. Callers state what kind of damage they are dealing; this function
 * only does the bookkeeping.
 */
export function applyDamage(
  target: Combatant,
  amount: number,
  critical: boolean,
  events: CombatEvent[],
): void {
  if (amount <= 0 || target.dead) {
    return;
  }
  const applied = Math.min(amount, target.health);
  target.health -= applied;
  events.push({ kind: "damage", targetId: target.id, amount: applied, critical });
  // The guard above already returned for an already-dead target, so
  // reaching 0 here is always a *new* death — exactly one death event.
  if (target.health <= 0) {
    target.dead = true;
    events.push({ kind: "death", targetId: target.id });
  }
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
 * Give energy, clamped so it can never exceed maximum energy. The dead
 * gain none, and a gain that fills nothing is no event.
 */
export function gainEnergy(target: Combatant, amount: number, events: CombatEvent[]): void {
  if (amount <= 0 || target.dead) {
    return;
  }
  const applied = Math.min(amount, target.maxEnergy - target.energy);
  if (applied <= 0) {
    return;
  }
  target.energy += applied;
  events.push({ kind: "energy-gain", targetId: target.id, amount: applied });
}

/**
 * Whether a knockdown would land on `target`: alive, standing, and with
 * nothing active that prevents it. One on someone already down does
 * nothing, however long it would have lasted (GW1).
 */
function canBeKnockedDown(target: Combatant): boolean {
  return (
    !target.dead &&
    target.knockdownRemaining <= 0 &&
    !target.statuses.active.some((status) => getStatusDefinition(status.id).preventsKnockdown)
  );
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
  if (skill !== undefined) {
    target.cast.startRecharge(skill.id, skill.rechargeSeconds);
  }
  target.cast.clearQueue();
  target.attack = undefined;
}

/**
 * Interrupt the cast `target` has in progress: the one path every
 * interrupt takes, an interrupt effect's and daze's (#546). As in GW1,
 * the interrupted skill recharges as if it had been used: its cost is
 * spent and its recharge starts (ADR-0029). Returns whether there was a
 * cast to interrupt.
 */
function interruptCast(target: Combatant, events: CombatEvent[]): boolean {
  const cancelled = target.cast.cancelCast();
  if (cancelled === undefined) {
    return false;
  }
  const skill = getSkill(cancelled.skillId);
  if (skill !== undefined) {
    target.cast.startRecharge(skill.id, skill.rechargeSeconds);
  }
  events.push({ kind: "interrupted", targetId: target.id, skillId: cancelled.skillId });
  return true;
}

/**
 * Daze's interrupt (#546, GW1): a spell `target` is casting is
 * interrupted. A signet, a shout, an attack skill or no cast at all is
 * left alone, and nothing is said: this is a side effect, not an
 * interrupt that can miss. Called as a status that `interruptsSpells` is
 * applied, and as an attack lands on its bearer.
 */
export function interruptIfCastingSpell(target: Combatant, events: CombatEvent[]): void {
  const cast = target.cast.activeCast;
  const skill = cast === undefined ? undefined : getSkill(cast.skillId);
  if (skill !== undefined && isSpell(skill.type)) {
    interruptCast(target, events);
  }
}

/**
 * Apply (or refresh) a status, and take what it takes as it lands: a
 * newly applied maximum health loss (deep wound) comes off current health
 * too, never below 1, so it alone never kills (#764: GW1 defers the loss
 * to the next health change; flooring it is the accepted approximation).
 * A refresh takes nothing. Returns the health taken, for the caller to
 * report as damage.
 */
export function applyStatus(
  target: Combatant,
  statusId: StatusId,
  durationSeconds: number,
  sourceId: string,
): number {
  const lossBefore = maxHealthLossOf(target);
  if (!target.statuses.apply(statusId, durationSeconds, sourceId)) {
    return 0;
  }
  const taken = Math.min(maxHealthLossOf(target) - lossBefore, target.health - 1);
  if (taken <= 0) {
    return 0;
  }
  target.health -= taken;
  return taken;
}

/**
 * Whether `effect` may interrupt what `target` is casting (#521): any
 * cast, or with `only: "spell-or-chant"`, a spell or a chant alone.
 */
function interrupts(effect: InterruptEffect, target: Combatant): boolean {
  if (effect.only === undefined) {
    return true;
  }
  const cast = target.cast.activeCast;
  const skill = cast === undefined ? undefined : getSkill(cast.skillId);
  return skill !== undefined && (isSpell(skill.type) || skill.type === "chant");
}

export function applyEffect(effect: UnconditionalEffect, context: SkillContext): CombatEvent[] {
  const events: CombatEvent[] = [];
  const { caster, target } = context;

  switch (effect.kind) {
    case "damage": {
      if (target === undefined) {
        return events;
      }
      // Spell damage respects armor. Before this, it did not — which is
      // why a warrior and a monk took identical Fireballs.
      const packet = spellDamage(resolveMagnitude(effect.amount, caster), effect.type);
      applyDamage(target, mitigate(packet, target, context.rules), false, events);
      return events;
    }

    case "heal": {
      const healed = effect.recipient === "caster" ? caster : target;
      if (healed === undefined) {
        return events;
      }
      applyHeal(healed, resolveMagnitude(effect.amount, caster), events);
      return events;
    }

    case "energy-gain": {
      gainEnergy(caster, resolveMagnitude(effect.amount, caster), events);
      return events;
    }

    case "sacrifice-health": {
      // Sacrifice is self-inflicted and, in this genre, famously *can*
      // kill you — so it goes through the same damage path (and the same
      // death check) rather than a special "safe" one.
      const amount = Math.round((caster.maxHealth * effect.percentOfMax) / 100);
      if (amount <= 0) {
        return events;
      }
      const applied = Math.min(amount, caster.health);
      caster.health -= applied;
      events.push({ kind: "sacrifice", targetId: caster.id, amount: applied });
      if (caster.health <= 0 && !caster.dead) {
        caster.dead = true;
        events.push({ kind: "death", targetId: caster.id });
      }
      return events;
    }

    case "apply-status": {
      if (target === undefined || target.dead) {
        return events;
      }
      const durationSeconds = scaledStatusDuration(target, effect.statusId, effect.durationSeconds);
      const loss = applyStatus(target, effect.statusId, durationSeconds, caster.id);
      events.push({
        kind: "status-applied",
        targetId: target.id,
        statusId: effect.statusId,
        durationSeconds,
      });
      if (loss > 0) {
        events.push({
          kind: "health-lost",
          targetId: target.id,
          amount: loss,
          statusId: effect.statusId,
        });
      }
      // Applying Dazed interrupts a spell, even on a target already dazed.
      if (getStatusDefinition(effect.statusId).interruptsSpells) {
        interruptIfCastingSpell(target, events);
      }
      return events;
    }

    case "remove-status": {
      if (target === undefined) {
        return events;
      }
      for (const statusId of target.statuses.removeByCategory(effect.category, effect.count)) {
        events.push({ kind: "status-removed", targetId: target.id, statusId });
      }
      return events;
    }

    case "interrupt": {
      if (target === undefined || target.dead) {
        return events;
      }
      if (!interrupts(effect, target) || !interruptCast(target, events)) {
        // Nothing it may interrupt was being cast: the interrupt is wasted. Emitted
        // explicitly so a combat log can show the miss — landing an
        // interrupt is a timing skill, and silently swallowing failures
        // would hide exactly the feedback that teaches it.
        events.push({ kind: "interrupt-missed", targetId: target.id });
      }
      return events;
    }

    case "knockdown": {
      if (target === undefined || !canBeKnockedDown(target)) {
        return events;
      }
      knockDown(target, effect.durationSeconds);
      events.push({
        kind: "knocked-down",
        targetId: target.id,
        durationSeconds: effect.durationSeconds,
      });
      return events;
    }
  }
}

/**
 * Whether an earlier effect of the same skill did what `condition` asks
 * to `targetId` (#521), read from the events it emitted.
 */
function conditionHolds(
  condition: EffectCondition,
  targetId: string,
  earlier: readonly CombatEvent[],
): boolean {
  switch (condition.kind) {
    case "interrupted":
      return earlier.some((event) => event.kind === "interrupted" && event.targetId === targetId);
    case "removed":
      return earlier.some(
        (event) =>
          event.kind === "status-removed" &&
          event.targetId === targetId &&
          getStatusDefinition(event.statusId).category === condition.category,
      );
  }
}

/**
 * Apply one effect to `context.target`, an `if` included: its effects
 * land only if its condition holds for that target, given `earlier`, the
 * events this resolution has emitted so far.
 */
function applyInOrder(
  effect: SkillEffect,
  context: SkillContext,
  earlier: readonly CombatEvent[],
): CombatEvent[] {
  if (effect.kind !== "if") {
    return applyEffect(effect, context);
  }
  const { target } = context;
  return target !== undefined && conditionHolds(effect.condition, target.id, earlier)
    ? effect.effects.flatMap((inner) => applyEffect(inner, context))
    : [];
}

/** Apply `effects` in order to one target; an `if` reads what came before it. */
export function applyEffects(
  effects: readonly SkillEffect[],
  context: SkillContext,
): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (const effect of effects) {
    events.push(...applyInOrder(effect, context, events));
  }
  return events;
}

/**
 * Whether an effect acts on its caster rather than on a target. Exhaustive,
 * so a new effect kind is a compile error here until someone decides.
 *
 * An `if` is per target, since its condition is: an effect inside it that
 * acts on the caster (Power Drain's energy) fires once for every target
 * the condition holds for. Every such skill today has one target.
 */
function effectActsOnCaster(effect: SkillEffect): boolean {
  switch (effect.kind) {
    case "energy-gain":
    case "sacrifice-health":
      return true;
    case "heal":
      return effect.recipient === "caster";
    case "damage":
    case "apply-status":
    case "remove-status":
    case "interrupt":
    case "knockdown":
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
 * business; this applies its riders to whoever it hit.
 */
export function applySkillEffects(resolution: SkillResolution): CombatEvent[] {
  const { skill, caster, targets, rng, rules } = resolution;
  const events: CombatEvent[] = [];
  for (const effect of skill.effects) {
    const on = effectActsOnCaster(effect) ? [targets[0]] : targets;
    for (const target of on) {
      events.push(...applyInOrder(effect, { caster, target, rng, rules }, events));
    }
  }
  // Divine Favor (#529): once a cast, on the primary target only, after
  // the spell's own effects, through the same heal path.
  const primary = targets[0];
  if (primary !== undefined) {
    applyHeal(
      primary,
      divineFavorBonusHeal(
        rankOf(caster, DIVINE_FAVOR_ATTRIBUTE),
        skill,
        primary.team === caster.team,
      ),
      events,
    );
  }
  return events;
}
