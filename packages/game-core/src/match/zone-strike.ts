import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import { applyDamage, applyStatus, type CombatEvent } from "../skills/effects.js";
import { hitLocationOf, mitigate, skillDamage } from "../skills/damage.js";
import { NO_RANKS } from "../skills/status.js";
import type { Combatant, Surroundings } from "../skills/types.js";
import type { ZoneRule } from "./zones.js";

/**
 * A timed or moving hazard's blow (#3029): pure, as `beacon.ts` is. The
 * simulation decides who is struck and when; this lands it.
 */

export interface ZoneStrikeContext {
  readonly rng: SimulationRng;
  readonly rules: CombatRules;
  readonly surroundings: Surroundings;
}

/**
 * `rule`'s strike on `target`, from `sourceId`: its damage through armor,
 * then each of its statuses, unless the blow killed. Nobody is credited. An
 * invulnerable target takes no damage and gains no condition, and says so once.
 */
export function zoneStrike(
  target: Combatant,
  rule: Extract<ZoneRule, { readonly trigger: "strike" }>,
  sourceId: string,
  { rng, rules, surroundings }: ZoneStrikeContext,
): CombatEvent[] {
  const packet = skillDamage(rule.damage, rule.damageType, 0);
  const events: CombatEvent[] = [];
  const dealt = mitigate(packet, target, rules, hitLocationOf(packet, rng), rng, surroundings);
  applyDamage(target, dealt, packet.type, false, events, undefined);
  if (target.dead) {
    return events;
  }
  for (const statusId of rule.statuses) {
    if (target.statuses.isImmuneTo(statusId)) {
      continue;
    }
    // Refused on an invulnerable target, which the blow already said.
    if (applyStatus(target, statusId, rule.statusSeconds, sourceId, NO_RANKS) === undefined) {
      continue;
    }
    events.push({
      kind: "status-applied",
      targetId: target.id,
      statusId,
      durationSeconds: rule.statusSeconds,
    });
  }
  return events;
}
