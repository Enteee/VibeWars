import { RANGE_MELEE } from "../../../distances.js";
import { getSkill } from "../../../skills/catalog.js";
import { raisedMaxHealth } from "../../../skills/tick.js";
import type { Skill } from "../../../skills/types.js";
import { distance, ZERO, type Vec2 } from "../../../vec2.js";
import type { BehaviourIntent } from "../../behaviour.js";
import type { BehaviourContext } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import { summonAura } from "../skill-intent.js";

export const NOTHING: BehaviourIntent = {
  moveDirection: ZERO,
  moveTo: undefined,
  targetId: undefined,
  useSkillId: undefined,
  attackTargetId: undefined,
  applyStatuses: [],
  endUpkeep: undefined,
};

/** Below this share of its health, an ally is worth a heal. */
export const HURT_FRACTION = 0.6;

export function nearestLiving(
  self: Participant,
  foes: readonly Participant[],
): Participant | undefined {
  return nearestTo(self.position, foes);
}

/** Of `bodies`, the one nearest `point`; a tie to the first. */
export function nearestTo(point: Vec2, bodies: readonly Participant[]): Participant | undefined {
  let best: Participant | undefined;
  for (const body of bodies) {
    if (best === undefined || distance(body.position, point) < distance(best.position, point)) {
      best = body;
    }
  }
  return best;
}

/** The skills on `participant`'s bar, its empty slots left out. */
export function skillsOf(participant: Participant): Skill[] {
  return participant.skillBar.flatMap((id) => {
    const skill = id === null ? undefined : getSkill(id);
    return skill === undefined ? [] : [skill];
  });
}

export function healthFraction(participant: Participant): number {
  const maxHealth = raisedMaxHealth(participant.combatant);
  return maxHealth > 0 ? participant.combatant.health / maxHealth : 0;
}

/**
 * Whether a spirit from `skill` still stands that a new one would only
 * replace (#2491): within its aura, any of `self`'s side's, as the
 * simulation ends them; with no aura, its own. Recovery outlives its
 * recharge, and two Ritualists would otherwise take turns replacing each
 * other's. `false` for a skill that summons no spirit.
 */
export function spiritUp(context: BehaviourContext, self: Participant, skill: Skill): boolean {
  if (!skill.effects.some((effect) => effect.kind === "summon")) {
    return false;
  }
  const radius = summonAura(skill)?.radius;
  return context.participants.some(
    ({ combatant, creature, position }) =>
      creature?.kind === "spirit" &&
      creature.skillId === skill.id &&
      !combatant.dead &&
      (radius === undefined
        ? creature.ownerId === self.id
        : combatant.team === self.combatant.team && distance(position, self.position) <= radius),
  );
}

/** A ranged bot or healer this far from its spot walks back to it (#2545). */
export const POSITION_SLACK = 40;

/** A ranged bot or healer with a melee foe this close stands and fights it (#2545). */
export const ELBOW_DISTANCE = 100;

/**
 * A foe at `self`'s elbow, one to stand and fight (#2545): one with a
 * melee weapon within `ELBOW_DISTANCE`, on `self`: targeting or
 * attacking it. A ranged foe hits as hard from afar, one on someone else
 * is no threat to it, and a spirit never walks.
 */
export function atElbow(self: Participant, foe: Participant): boolean {
  return (
    foe.creature?.kind !== "spirit" &&
    (foe.targetId === self.id || foe.combatant.attack?.targetId === self.id) &&
    foe.combatant.equipment.mainHand.weapon.range <= RANGE_MELEE &&
    distance(foe.position, self.position) <= ELBOW_DISTANCE
  );
}

/** How finely `reachable` tries the line back from a spot to the bot. */
const REACHABLE_STEPS = 8;

/**
 * Where `self` can go on its way to `spot` (#2545): `spot` itself if it
 * can walk straight there and stand, else the point nearest `spot` on
 * the line from `self` to it that it can; none at all: `undefined`.
 */
export function reachable(context: BehaviourContext, spot: Vec2): Vec2 | undefined {
  const from = context.self.position;
  for (let step = REACHABLE_STEPS; step > 0; step -= 1) {
    const share = step / REACHABLE_STEPS;
    const point = {
      x: from.x + (spot.x - from.x) * share,
      y: from.y + (spot.y - from.y) * share,
    };
    if (context.walkable(point)) {
      return point;
    }
  }
  return undefined;
}

/** Below this share of its health, a bot under fire falls back to its haven (#2549). */
export const FLEE_FRACTION = 0.3;

/** It stands this far beyond its healer, on the side away from the foes (#2549). */
export const FLEE_BEHIND = 60;

/** Out of a foe's reach, a hurt bot rests until this share of its health (#2549). */
export const REST_FRACTION = 0.7;

/** The share of the skill shots aimed at it a bot side-steps (#2590). */
export const DODGE_CHANCE = 0.5;

/**
 * A bot's coin for one shot (#2590), in [0, 1): a pure hash of the shot's
 * `projectileId` and the bot's `participantId`, FNV-1a then a 32-bit
 * finaliser. No RNG state, so a replay dodges the same shots.
 */
export function dodgeRoll(projectileId: number, participantId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < participantId.length; index += 1) {
    hash = Math.imul(hash ^ participantId.charCodeAt(index), 0x01000193);
  }
  hash = Math.imul(hash ^ projectileId, 0x01000193);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x1_0000_0000;
}
