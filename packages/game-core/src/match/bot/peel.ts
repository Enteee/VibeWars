import { distance } from "../../vec2.js";
import type { Participant } from "../simulation.js";
import { roleOf } from "./role.js";
import { PEEL_REACH } from "./rules/shared.js";

/**
 * Of `foes`, the one diving `allies`' backline (#4141): it targets a
 * healer or ranged ally and stands within `PEEL_REACH` of it. A diver on
 * a healer comes before one on a ranged ally, then the one nearest its
 * ally, then simulation order. Only the living count.
 */
export function diverOn(
  allies: readonly Participant[],
  foes: readonly Participant[],
): Participant | undefined {
  let best: Participant | undefined;
  let bestRank = 0;
  let bestAway = 0;
  for (const foe of foes) {
    if (foe.combatant.dead) {
      continue;
    }
    const ally = allies.find((each) => each.id === foe.targetId);
    if (ally === undefined || ally.combatant.dead) {
      continue;
    }
    const role = roleOf(ally);
    if (role !== "healer" && role !== "ranged") {
      continue;
    }
    const away = distance(foe.position, ally.position);
    if (away > PEEL_REACH) {
      continue;
    }
    const rank = role === "healer" ? 0 : 1;
    if (best === undefined || rank < bestRank || (rank === bestRank && away < bestAway)) {
      best = foe;
      bestRank = rank;
      bestAway = away;
    }
  }
  return best;
}
