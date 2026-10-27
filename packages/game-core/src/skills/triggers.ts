import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import { applyEffects, type CombatEvent } from "./effects.js";
import type { StatusTriggerEvent } from "./status.js";
import type { Combatant, Surroundings } from "./types.js";

/** What one status's trigger did, credited to whoever applied the status. */
export interface FiredTrigger {
  readonly sourceId: string;
  readonly skillId: string;
  readonly events: readonly CombatEvent[];
}

/**
 * The bearer did `event` (#469): every status on it that answers fires,
 * once each, in `StatusSet.active` order (ADR-0003). Its effects are its
 * source's, on the bearer. A source no longer in the match fires nothing;
 * a dead one still does, as a dead Mesmer's hex keeps working in GW1.
 *
 * Nothing here fires a trigger: damage from one is never an event that
 * answers another, so triggers cannot recurse.
 */
export function fireTriggers(
  bearer: Combatant,
  event: StatusTriggerEvent,
  sourceOf: (id: string) => Combatant | undefined,
  rng: SimulationRng,
  rules: CombatRules,
  surroundings: Surroundings,
): FiredTrigger[] {
  return bearer.statuses.triggersOn(event).flatMap(({ sourceId, trigger }) => {
    const source = sourceOf(sourceId);
    if (source === undefined) {
      return [];
    }
    const events = applyEffects(trigger.effects, {
      caster: source,
      target: bearer,
      rng,
      rules,
      surroundings,
    });
    return events.length === 0 ? [] : [{ sourceId, skillId: trigger.skillId, events }];
  });
}
