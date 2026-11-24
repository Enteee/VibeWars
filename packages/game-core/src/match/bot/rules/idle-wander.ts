import { SPAWN_BUBBLE_RADIUS } from "../../../distances.js";
import { distance, type Vec2 } from "../../../vec2.js";
import type { BehaviourContext, BehaviourCursor, BehaviourIntent } from "../../behaviour.js";
import { botRoll, NOTHING } from "./shared.js";

/** How far from its spawn a bot wanders before the start (#3910), as a share of the bubble. */
export const WANDER_REACH_FRACTION = 0.5;

/** The shortest and longest wait between two wanders (#3910). */
export const WANDER_MIN_SECONDS = 3;
export const WANDER_MAX_SECONDS = 6;

/** Within this of where it wandered to, a bot is there. */
const WANDER_ARRIVE_UNITS = 1;

/**
 * Walk about the spawn bubble (#3910), as a player waiting for the start
 * does: every `WANDER_MIN_SECONDS` to `WANDER_MAX_SECONDS`, to a point
 * within `WANDER_REACH_FRACTION` of the bubble round its spawn, never at
 * its edge. Each wait and point is a `botRoll` of the match's seed, its
 * id and the wander's count, so a replay wanders the same. A point it
 * cannot walk straight to is skipped until the next. Its caller counts
 * `cursor.wanderSeconds` down every tick.
 */
export function idleWander(context: BehaviourContext, cursor: BehaviourCursor): BehaviourIntent {
  const self = context.self;
  if (cursor.wanderSeconds <= 0) {
    const count = cursor.wanders;
    cursor.wanders += 1;
    const roll = (key: string): number => botRoll(context.seed, count, `${self.id}:${key}`);
    cursor.wanderSeconds =
      WANDER_MIN_SECONDS + (WANDER_MAX_SECONDS - WANDER_MIN_SECONDS) * roll("wait");
    const angle = 2 * Math.PI * roll("angle");
    // The square root spreads the points evenly over the disc.
    const reach = WANDER_REACH_FRACTION * SPAWN_BUBBLE_RADIUS * Math.sqrt(roll("reach"));
    const point: Vec2 = {
      x: self.spawn.x + reach * Math.cos(angle),
      y: self.spawn.y + reach * Math.sin(angle),
    };
    cursor.wanderTo = context.walkable(point) ? point : undefined;
  }
  const to = cursor.wanderTo;
  if (to === undefined || distance(to, self.position) <= WANDER_ARRIVE_UNITS) {
    cursor.wanderTo = undefined;
    return NOTHING;
  }
  return { ...NOTHING, moveTo: to };
}
