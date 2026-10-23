import { resolveMagnitude } from "./scaling.js";
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
  | { readonly kind: "death"; readonly targetId: string };

/** Apply raw damage, clamping at 0 and flagging death exactly once. */
function applyDamage(target: Combatant, amount: number, events: CombatEvent[]): void {
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
      applyDamage(target, resolveMagnitude(effect.amount, caster), events);
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
  }
}

export function applyEffects(
  effects: readonly SkillEffect[],
  context: SkillContext,
): CombatEvent[] {
  return effects.flatMap((effect) => applyEffect(effect, context));
}
