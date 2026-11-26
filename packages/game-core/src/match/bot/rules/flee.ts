import { RANGE_SPELL } from "../../../distances.js";
import { add, distance, normalize, scale, sub, ZERO, type Vec2 } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import {
  FLEE_BEHIND,
  FLEE_FRACTION,
  NOTHING,
  POSITION_SLACK,
  healthFraction,
  reachable,
} from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/**
 * Badly hurt with a foe in reach (#2549): it walks to its haven, behind
 * its healer or else to its spawn, rather than die where it stands. Not
 * when it is winning: every foe in reach is worse off than it is. At the
 * haven already, it fights from there.
 */
const flee: BotRule = {
  order: 35,
  name: "flee",
  decide: (rule) => {
    const { context, self, foes } = rule;
    if (rule.role === undefined) {
      return undefined;
    }
    const health = healthFraction(self);
    if (health >= FLEE_FRACTION) {
      return undefined;
    }
    const losing = foes.some(
      (foe) =>
        distance(foe.position, self.position) <= RANGE_SPELL && healthFraction(foe) >= health,
    );
    if (!losing) {
      return undefined;
    }
    const point = haven(rule);
    if (distance(point, self.position) <= POSITION_SLACK) {
      return undefined;
    }
    const moveTo = reachable(context, point);
    return moveTo === undefined ? undefined : { ...NOTHING, targetId: rule.targetId, moveTo };
  },
};

/**
 * `FLEE_BEHIND` beyond the nearest living healer ally other than itself,
 * on the ray from the foes' centroid through it; none: its spawn. Only
 * a healer whose spot is no nearer the foes than it stands, give or take
 * `POSITION_SLACK`: it never runs through them, and once there, its
 * healer in front of it, it stays.
 */
function haven({ self, allies, foeCentroid, roleOf }: RuleContext): Vec2 {
  if (foeCentroid === undefined) {
    return self.spawn;
  }
  const exposure = distance(self.position, foeCentroid);
  let healer: Participant | undefined;
  let nearest = Infinity;
  for (const ally of allies) {
    if (ally.id === self.id || roleOf(ally) !== "healer") {
      continue;
    }
    if (distance(ally.position, foeCentroid) + FLEE_BEHIND + POSITION_SLACK <= exposure) {
      continue;
    }
    const away = distance(ally.position, self.position);
    if (away < nearest || (away === nearest && healer !== undefined && ally.id < healer.id)) {
      healer = ally;
      nearest = away;
    }
  }
  if (healer === undefined) {
    return self.spawn;
  }
  const back = normalize(sub(healer.position, foeCentroid));
  return back === ZERO ? healer.position : add(healer.position, scale(back, FLEE_BEHIND));
}

export default flee;
