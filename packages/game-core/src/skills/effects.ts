import { mitigate, spellDamage } from "./damage.js";
import { resolveMagnitude } from "./scaling.js";
import type { StatusId } from "./status.js";
import type { Combatant, SkillContext, SkillEffect } from "./types.js";

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
  /** An interrupt that found nothing to interrupt — a wasted cast. */
  | { readonly kind: "interrupt-missed"; readonly targetId: string };

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
