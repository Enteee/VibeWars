import { sub, vec2, type Vec2 } from "../vec2.js";

/**
 * Steering round living bodies, for the weapon attack's approach (#277).
 *
 * The path finder knows only walls: bodies move every tick, and putting
 * them in its graph would break the graph being built once per map (#267).
 * So the approach walks toward the path's next waypoint, and this bends
 * that walk round the first body in the way. Without it, an attacker
 * walking head-on into a body is pushed straight back by collision, which
 * has no sideways component to slide along, and stands there forever.
 */

/**
 * How far ahead a body counts as in the way, in body radii. Four radii is
 * two bodies' widths: far enough to start the turn before contact, near
 * enough that a body across the room does not bend the walk.
 */
export const LOOKAHEAD_RADII = 4;

/**
 * How much room to leave round a body, in units, past touching. One unit
 * keeps the walk off the collision boundary, so it slides rather than
 * scrapes.
 */
export const STEER_MARGIN = 1;

/**
 * The direction to walk from `position` toward `waypoint`, bent round the
 * first of `bodies` in the way. All bodies have `radius`.
 *
 * A body is in the way when its centre lies ahead, no further than the
 * waypoint or `LOOKAHEAD_RADII` radii, and within two radii of the line
 * of travel, so the two bodies would touch. The nearest such body is
 * passed on the side away from it, along the tangent to a circle of
 * `2 * radius + STEER_MARGIN` round it; already that close, along the
 * perpendicular to it, so the walk slides round. A body dead ahead is
 * passed on the right of the direction of travel, so two attackers
 * meeting head-on both turn right and pass each other.
 *
 * With nothing in the way it returns `waypoint - position` itself, so the
 * walk is exactly what it was before steering existed.
 */
export function steerAround(
  position: Vec2,
  waypoint: Vec2,
  radius: number,
  bodies: readonly Vec2[],
): Vec2 {
  const toWaypoint = sub(waypoint, position);
  const span = Math.hypot(toWaypoint.x, toWaypoint.y);
  if (span < 1e-9) {
    return toWaypoint;
  }
  const dx = toWaypoint.x / span;
  const dy = toWaypoint.y / span;
  const reach = Math.min(span, LOOKAHEAD_RADII * radius);
  const lane = 2 * radius;

  let nearest: Vec2 | undefined;
  let nearestAhead = Number.POSITIVE_INFINITY;
  let offset = 0;
  for (const body of bodies) {
    const rx = body.x - position.x;
    const ry = body.y - position.y;
    const ahead = rx * dx + ry * dy;
    // Signed: positive is to the right of travel (y grows downward).
    const across = dx * ry - dy * rx;
    if (ahead > 0 && ahead <= reach && Math.abs(across) < lane && ahead < nearestAhead) {
      nearest = body;
      nearestAhead = ahead;
      offset = across;
    }
  }
  if (nearest === undefined) {
    return toWaypoint;
  }

  // Pass on the side away from the body; dead ahead, on the right.
  const passRight = offset <= 0;
  const rx = nearest.x - position.x;
  const ry = nearest.y - position.y;
  const gap = Math.hypot(rx, ry);
  const ux = rx / gap;
  const uy = ry / gap;
  // The perpendicular to the body on the passing side.
  const nx = passRight ? -uy : uy;
  const ny = passRight ? ux : -ux;
  const room = 2 * radius + STEER_MARGIN;
  if (gap <= room) {
    return vec2(nx, ny);
  }
  // The tangent to the circle of `room` round the body: `asin(room / gap)`
  // off the line to its centre.
  const sin = room / gap;
  const cos = Math.sqrt(1 - sin * sin);
  return vec2(ux * cos + nx * sin, uy * cos + ny * sin);
}
