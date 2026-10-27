import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import { applyEffects, type CombatEvent } from "./effects.js";
import {
  getStatusDefinition,
  type SpreadGainedConditionEffect,
  type StatusChange,
  type StatusTrigger,
  type StatusTriggerEvent,
} from "./status.js";
import type { Combatant, SkillEffect, Surroundings } from "./types.js";

/** What one status's trigger did, credited to whoever applied the status. */
export interface FiredTrigger {
  readonly sourceId: string;
  readonly skillId: string;
  readonly events: readonly CombatEvent[];
}

/**
 * Contagion's spread, which needs positions (#887): what it did, from
 * `bearer`, for the condition gained. Only the simulation knows where
 * everyone is.
 */
export type SpreadGainedCondition = (
  effect: SpreadGainedConditionEffect,
  bearer: Combatant,
  gained: Extract<StatusChange, { kind: "gained-condition" }>,
) => CombatEvent[];

export interface TriggerContext {
  readonly sourceOf: (id: string) => Combatant | undefined;
  readonly rng: SimulationRng;
  readonly rules: CombatRules;
  readonly surroundings: Surroundings;
  /**
   * The skill the bearer just used, on `bearer-uses-skill` (#949): what
   * Diversion lengthens. `undefined` on every other event.
   */
  readonly usedSkillId: string | undefined;
}

/**
 * The bearer did `event` (#469): every status on it that answers fires,
 * once each, in `StatusSet.active` order (ADR-0003). Its effects are its
 * source's, on the trigger's target. A source no longer in the match fires
 * nothing; a dead one still does, as a dead Mesmer's hex keeps working in
 * GW1.
 *
 * Nothing here fires a trigger: damage from one is never an event that
 * answers another, so triggers cannot recurse.
 */
export function fireTriggers(
  bearer: Combatant,
  event: Exclude<StatusTriggerEvent, "bearer-gains-condition" | "ends">,
  context: TriggerContext,
): FiredTrigger[] {
  return bearer.statuses
    .triggersOn(event)
    .flatMap(({ sourceId, trigger }) => fire(trigger, sourceId, bearer, undefined, context));
}

/**
 * What `change` to the bearer's statuses sets off (#887): a condition
 * gained fires every status on it that answers one, in `active` order; a
 * status ended fires its own `ends` triggers, though it is no longer on
 * the bearer. A hit the bearer landed, or physical damage it took, fires
 * every status on it that answers that (#935). The simulation discards
 * whatever the firing itself changes, so this never recurses either.
 */
export function fireChangeTriggers(
  bearer: Combatant,
  change: StatusChange,
  spread: SpreadGainedCondition,
  context: TriggerContext,
): FiredTrigger[] {
  switch (change.kind) {
    case "gained-condition":
      return bearer.statuses
        .triggersOn("bearer-gains-condition")
        .flatMap(({ sourceId, trigger }) =>
          fire(trigger, sourceId, bearer, (effect) => spread(effect, bearer, change), context),
        );
    case "ended":
      return getStatusDefinition(change.id)
        .triggers.filter((trigger) => trigger.on === "ends")
        .flatMap((trigger) => fire(trigger, change.sourceId, bearer, undefined, context));
    case "hit":
      return fireTriggers(bearer, "bearer-hits", context);
    case "took-physical-damage":
      return fireTriggers(bearer, "bearer-takes-physical-damage", context);
  }
}

/**
 * One trigger's effects, in order, the source as caster. Consecutive
 * skill effects resolve together, so one may read what an earlier one did;
 * a spread with nothing gained does nothing.
 */
function fire(
  trigger: StatusTrigger,
  sourceId: string,
  bearer: Combatant,
  spread: ((effect: SpreadGainedConditionEffect) => CombatEvent[]) | undefined,
  { sourceOf, rng, rules, surroundings, usedSkillId }: TriggerContext,
): FiredTrigger[] {
  const source = sourceOf(sourceId);
  if (source === undefined) {
    return [];
  }
  const target = trigger.target === "bearer" ? bearer : source;
  const events: CombatEvent[] = [];
  let pending: SkillEffect[] = [];
  const flush = (): void => {
    events.push(
      ...applyEffects(pending, { caster: source, target, rng, rules, surroundings, usedSkillId }),
    );
    pending = [];
  };
  for (const effect of trigger.effects) {
    if (effect.kind === "spread-gained-condition") {
      flush();
      events.push(...(spread?.(effect) ?? []));
    } else {
      pending.push(effect);
    }
  }
  flush();
  return events.length === 0 ? [] : [{ sourceId, skillId: trigger.skillId, events }];
}
