import type { Vec2 } from "../vec2.js";

/**
 * Facing as an angle in radians, `atan2` convention, in (−π, π], 0 = +x
 * (#187). Where a participant looks: walking turns it, and so does
 * casting at or swinging at somebody (see `MatchSimulation`).
 */

/** The angle from `from` to `to`; 0 when they are the same point, which has no direction. */
export function facingToward(from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}

function mean(points: readonly Vec2[]): Vec2 | undefined {
  if (points.length === 0) {
    return undefined;
  }
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * Where a player spawning at `spawn` starts out facing: toward the middle
 * of the other team's spawns, or of every spawn on a map that has none
 * for the other team.
 */
export function spawnFacing(
  spawn: Vec2,
  otherTeamSpawns: readonly Vec2[],
  allSpawns: readonly Vec2[],
): number {
  const toward = mean(otherTeamSpawns) ?? mean(allSpawns) ?? spawn;
  return facingToward(spawn, toward);
}
