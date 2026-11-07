import { RANGE_SPELL } from "../../../distances.js";
import { distance, type Vec2 } from "../../../vec2.js";
import { onCapturePoint, type CapturePoint } from "../../capture-points.js";
import type { Participant } from "../../simulation.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Capture Points (#2580): no foe in spell range, a bot stands on a shrine
 * its team does not hold yet and fills it, else walks to its goal shrine.
 * Every shrine its team's, it leaves the rest to `close-in`.
 */
const shrines: BotRule = {
  order: 115,
  name: "shrines",
  decide: ({ context, self, foes, allies }) => {
    const points = context.objectives.capturePoints;
    const team = self.combatant.team;
    if (
      points.length === 0 ||
      foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
    ) {
      return undefined;
    }
    if (
      points.some(
        (point) =>
          onCapturePoint(point.position, self.position) &&
          (point.owner !== team || point.progress < 1),
      )
    ) {
      return NOTHING;
    }
    const goal = goalShrine(points, team, self, allies);
    return goal === undefined ? undefined : { ...NOTHING, moveTo: goal.position };
  },
};

/**
 * The shrine `self` goes for: the nearest its team does not own that no
 * teammate already stands on, or has as its own nearest and is nearer to.
 * All so taken, the nearest one: it joins in. Ties go to the lower index,
 * and between teammates to the first in simulation order.
 */
function goalShrine(
  points: readonly CapturePoint[],
  team: number,
  self: Participant,
  allies: readonly Participant[],
): CapturePoint | undefined {
  const open = points.filter((point) => point.owner !== team);
  const mine = [...open].sort(
    (a, b) => distance(a.position, self.position) - distance(b.position, self.position),
  );
  const selfAt = allies.findIndex((ally) => ally.id === self.id);
  const taken = (point: CapturePoint): boolean => {
    const own = distance(self.position, point.position);
    return allies.some((ally, at) => {
      if (ally.id === self.id) {
        return false;
      }
      if (onCapturePoint(point.position, ally.position)) {
        return true;
      }
      const theirs = distance(ally.position, point.position);
      return (
        nearest(open, ally.position) === point && (theirs < own || (theirs === own && at < selfAt))
      );
    });
  };
  return mine.find((point) => !taken(point)) ?? mine[0];
}

/** The one of `points` nearest to `from`, ties to the lower index. */
function nearest(points: readonly CapturePoint[], from: Vec2): CapturePoint | undefined {
  let best: CapturePoint | undefined;
  for (const point of points) {
    if (best === undefined || distance(point.position, from) < distance(best.position, from)) {
      best = point;
    }
  }
  return best;
}

export default shrines;
