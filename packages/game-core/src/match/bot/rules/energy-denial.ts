import type { Skill } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import { roleOf } from "../role.js";
import { deniesEnergy } from "../skill-intent.js";

/** A foe healer with less Energy than this is not worth denying (#4281). */
export const DENIAL_MIN_ENERGY = 5;

/**
 * A foe healer with at least `DENIAL_MIN_ENERGY`: worth denying before a
 * richer foe (#4283), for both the denial and the drain target.
 */
export function worthDenying(foe: Participant): boolean {
  return roleOf(foe) === "healer" && foe.combatant.energy >= DENIAL_MIN_ENERGY;
}

/**
 * The foe to cast an energy-denial `skill` at instead of the team's
 * target (#4281, `deniesEnergy`): a foe healer within its range of `self`
 * now, with at least `DENIAL_MIN_ENERGY`, allowed by `mayCast`; the one
 * with the most Energy, ties by id. The bot never walks off for it.
 * `undefined` for a skill that denies none, or no such healer.
 */
export function denialTarget(
  self: Participant,
  foes: readonly Participant[],
  skill: Skill,
  mayCast: (foeId: string) => boolean,
): string | undefined {
  if (!deniesEnergy(skill)) {
    return undefined;
  }
  return foes
    .filter(
      (foe) =>
        worthDenying(foe) &&
        distance(foe.position, self.position) <= skill.range &&
        mayCast(foe.id),
    )
    .sort((a, b) => b.combatant.energy - a.combatant.energy || a.id.localeCompare(b.id))[0]?.id;
}
