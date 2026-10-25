import { mitigate, spellDamage } from "./damage.js";
import { resolveMagnitude } from "./scaling.js";
import type { StatusId } from "./status.js";
import { attackMissChanceOf } from "./tick.js";
import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import type { Combatant, Skill, SkillContext, SkillEffect } from "./types.js";

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
  | { readonly kind: "damage"; readonly targetId: string; readonly amount: number }
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
  | { readonly kind: "status-removed"; readonly targetId: string; readonly statusId: StatusId }
  | { readonly kind: "status-expired"; readonly targetId: string; readonly statusId: StatusId }
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
  /** A projectile that landed where its target would have been, had it kept moving. */
  | { readonly kind: "attack-dodged"; readonly targetId: string }
  /** A ranged swing released with a wall in the way: nothing flies (GW1's "Obstructed"). */
  | { readonly kind: "attack-obstructed"; readonly targetId: string }
  /** An attack with no way round the walls to its target: it ends (#211). */
  | { readonly kind: "attack-unreachable"; readonly targetId: string };

/**
 * Apply an already-mitigated amount, clamping at 0 and flagging death
 * exactly once.
 *
 * Mitigation happens in `damage.ts` and is deliberately *not* done here:
 * degeneration reaches this function too, and armor must not apply to
 * it. Callers state what kind of damage they are dealing; this function
 * only does the bookkeeping.
 */
export function applyDamage(target: Combatant, amount: number, events: CombatEvent[]): void {
  if (amount <= 0 || target.dead) {
    return;
  }
  const applied = Math.min(amount, target.health);
  target.health -= applied;
  events.push({ kind: "damage", targetId: target.id, amount: applied });
  // The guard above already returned for an already-dead target, so
  // reaching 0 here is always a *new* death — exactly one death event.
  if (target.health <= 0) {
    target.dead = true;
    events.push({ kind: "death", targetId: target.id });
  }
}

/** Heal, clamped so it can never exceed maximum health. The dead stay dead. */
function applyHeal(target: Combatant, amount: number, events: CombatEvent[]): void {
  if (amount <= 0 || target.dead) {
    return;
  }
  const applied = Math.min(amount, target.maxHealth - target.health);
  if (applied <= 0) {
    return;
  }
  target.health += applied;
  events.push({ kind: "heal", targetId: target.id, amount: applied });
}

export function applyEffect(effect: SkillEffect, context: SkillContext): CombatEvent[] {
  const events: CombatEvent[] = [];
  const { caster, target } = context;

  switch (effect.kind) {
    case "damage": {
      if (target === undefined) {
        return events;
      }
      // Spell damage respects armor. Before this, it did not — which is
      // why a warrior and a monk took identical Fireballs.
      const packet = spellDamage(resolveMagnitude(effect.amount, caster));
      applyDamage(target, mitigate(packet, target, context.rules), events);
      return events;
    }

    case "heal": {
      if (target === undefined) {
        return events;
      }
      applyHeal(target, resolveMagnitude(effect.amount, caster), events);
      return events;
    }

    case "energy-gain": {
      const amount = resolveMagnitude(effect.amount, caster);
      if (amount <= 0) {
        return events;
      }
      const applied = Math.min(amount, caster.maxEnergy - caster.energy);
      if (applied <= 0) {
        return events;
      }
      caster.energy += applied;
      events.push({ kind: "energy-gain", targetId: caster.id, amount: applied });
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
      target.statuses.apply(effect.statusId, effect.durationSeconds, caster.id);
      events.push({
        kind: "status-applied",
        targetId: target.id,
        statusId: effect.statusId,
        durationSeconds: effect.durationSeconds,
      });
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
      const cancelled = target.cast.cancelCast();
      if (cancelled === undefined) {
        // Nothing was being cast: the interrupt is simply wasted. Emitted
        // explicitly so a combat log can show the miss — landing an
        // interrupt is a timing skill, and silently swallowing failures
        // would hide exactly the feedback that teaches it.
        events.push({ kind: "interrupt-missed", targetId: target.id });
        return events;
      }
      events.push({ kind: "interrupted", targetId: target.id, skillId: cancelled.skillId });
      return events;
    }
  }
}

export function applyEffects(
  effects: readonly SkillEffect[],
  context: SkillContext,
): CombatEvent[] {
  return effects.flatMap((effect) => applyEffect(effect, context));
}

/**
 * Whether an effect acts on its caster rather than on a target. Exhaustive,
 * so a new effect kind is a compile error here until someone decides.
 */
function effectActsOnCaster(effect: SkillEffect): boolean {
  switch (effect.kind) {
    case "energy-gain":
    case "sacrifice-health":
      return true;
    case "damage":
    case "heal":
    case "apply-status":
    case "remove-status":
    case "interrupt":
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
 * A blinded caster's attack skill misses as a whole, Barrage's volley
 * included: one roll, at resolution, so the miss has already paid its
 * cost and recharge. The draw happens only when there is a chance to
 * miss, so no unblinded fight's random stream moves.
 */
export function applySkillEffects(resolution: SkillResolution): CombatEvent[] {
  const { skill, caster, targets, rng, rules } = resolution;
  const primary = targets[0];
  if (skill.type === "attack" && primary !== undefined) {
    const chance = attackMissChanceOf(caster);
    if (chance > 0 && rng.nextFloat() < chance) {
      return [{ kind: "attack-missed", targetId: primary.id }];
    }
  }
  return skill.effects.flatMap((effect) =>
    effectActsOnCaster(effect)
      ? applyEffect(effect, { caster, target: targets[0], rng, rules })
      : targets.flatMap((target) => applyEffect(effect, { caster, target, rng, rules })),
  );
}
