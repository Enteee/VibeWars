import { ZERO, add, clampLength, normalize, scale, type Vec2 } from "./vec2.js";

/**
 * Pure movement integration — no network, no clock, no I/O.
 *
 * The host's fixed-tick loop (ADR-0003) calls this once per tick with the
 * player's last-known authoritative position and their currently-requested
 * input direction; the client never supplies a position (brief §32).
 */

/**
 * Advance `position` by one fixed tick of movement.
 *
 * `inputDirection` is normalized before use, so a diagonal input (e.g.
 * `{1, 1}`) moves at the same speed as a cardinal one (`{1, 0}`) rather than
 * `sqrt(2)` times faster — a classic movement bug this function closes off
 * for every caller, not just this one.
 */
export function integrateMovement(
  position: Vec2,
  inputDirection: Vec2,
  speedUnitsPerSecond: number,
  dtSeconds: number,
): Vec2 {
  const direction = normalize(inputDirection);
  if (direction === ZERO) {
    return position;
  }
  return add(position, scale(direction, speedUnitsPerSecond * dtSeconds));
}

/**
 * Clamp a client-supplied direction vector to a unit disc before it is
 * trusted anywhere. A malicious or buggy client could otherwise send
 * `{dirX: 1e9, dirY: 1e9}` and move at an arbitrary multiple of the ruleset's
 * speed cap (brief §32) — clamping here, once, means every caller of
 * `integrateMovement` is safe by construction rather than by convention.
 */
export function clampInputDirection(direction: Vec2): Vec2 {
  return clampLength(direction, 1);
}
