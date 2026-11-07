import type { Projectile } from "../../../skills/projectile.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import type { BehaviourContext } from "../../behaviour.js";
import { DODGE_CHANCE, dodgeRoll, NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * A side-step ending this near the shot's aim point is still hit: a
 * player's radius plus the projectile tolerance (14 + 10).
 */
const DODGE_CLEAR_UNITS = 24;

/** Two end points this close in distance from the aim point are a tie. */
const TIE_UNITS = 1e-6;

/**
 * A foe's skill shot in flight at it (#2590): an attack skill's arrow or
 * a flying spell, which GW1 aims at where it will be and checks nothing
 * else. On its coin, about half the time, a match bot steps across the
 * shot's path, the way that ends farther from where it lands, and holds
 * it until the shot lands. Plain weapon shots are ignored, or a ranger's
 * target would strafe instead of fighting. `paced` already keeps a bot
 * mid-cast from it.
 */
const dodge: BotRule = {
  order: 36,
  name: "dodge",
  decide: ({ context, self }) => {
    if (!context.isBot(self.id)) {
      return undefined;
    }
    let shot: Readonly<Projectile> | undefined;
    for (const projectile of context.projectiles) {
      if (
        projectile.targetId === self.id &&
        !projectile.obstructed &&
        projectile.skillHit !== undefined &&
        projectile.flightSeconds - projectile.elapsed > 0 &&
        (shot === undefined ||
          projectile.flightSeconds - projectile.elapsed < shot.flightSeconds - shot.elapsed) &&
        fromFoe(context, projectile.attackerId, self.combatant.team) &&
        dodgeRoll(projectile.id, self.id) < DODGE_CHANCE
      ) {
        shot = projectile;
      }
    }
    if (shot === undefined) {
      return undefined;
    }
    const pathX = shot.aimPoint.x - shot.from.x;
    const pathY = shot.aimPoint.y - shot.from.y;
    const pathLength = Math.hypot(pathX, pathY);
    if (pathLength === 0) {
      return undefined;
    }
    // Left of the path, (-y, x); right is its negation.
    const leftX = -pathY / pathLength;
    const leftY = pathX / pathLength;
    const reach = (context.stepUnits / context.dt) * (shot.flightSeconds - shot.elapsed);
    const offsetX = self.position.x - shot.aimPoint.x;
    const offsetY = self.position.y - shot.aimPoint.y;
    const leftMiss = Math.hypot(offsetX + leftX * reach, offsetY + leftY * reach);
    const rightMiss = Math.hypot(offsetX - leftX * reach, offsetY - leftY * reach);
    let side = leftMiss > rightMiss ? 1 : -1;
    if (Math.abs(leftMiss - rightMiss) <= TIE_UNITS) {
      side = tieBreak(context, self.position, leftX * reach, leftY * reach);
    }
    if ((side === 1 ? leftMiss : rightMiss) <= DODGE_CLEAR_UNITS) {
      return undefined;
    }
    return { ...NOTHING, moveDirection: vec2(side * leftX, side * leftY) };
  },
};

/** Whether `attackerId` is on a side other than `team`. */
function fromFoe(context: BehaviourContext, attackerId: string, team: number): boolean {
  const attacker = context.participants.find((participant) => participant.id === attackerId);
  return attacker !== undefined && attacker.combatant.team !== team;
}

/**
 * The side of a standing bot's dodge, 1 left or -1 right, each `step`
 * away: the one it sees into, not a wall; then the one farther from the
 * living foes' centroid; then left.
 */
function tieBreak(context: BehaviourContext, position: Vec2, stepX: number, stepY: number): number {
  const left = context.sees(vec2(position.x + stepX, position.y + stepY));
  const right = context.sees(vec2(position.x - stepX, position.y - stepY));
  if (left !== right) {
    return left ? 1 : -1;
  }
  const centroid = context.foeCentroid;
  if (centroid === undefined) {
    return 1;
  }
  // Left is farther from the centroid when the centroid lies to its right.
  const lean = (centroid.x - position.x) * stepX + (centroid.y - position.y) * stepY;
  return lean <= 0 ? 1 : -1;
}

export default dodge;
