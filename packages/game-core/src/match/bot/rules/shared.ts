import { RANGE_MELEE, RANGE_SPELL } from "../../../distances.js";
import { getSkill } from "../../../skills/catalog.js";
import { raisedMaxHealth } from "../../../skills/tick.js";
import type { Skill } from "../../../skills/types.js";
import { distance, ZERO, type Vec2 } from "../../../vec2.js";
import type { BehaviourIntent, Reaction } from "../../behaviour.js";
import type { BehaviourContext } from "../../behaviour.js";
import { FLAG_REACH_UNITS } from "../../flags.js";
import { carriedRelic } from "../../relics.js";
import type { Participant } from "../../simulation.js";
import { roleOf } from "../role.js";
import { botUses, summonAura } from "../skill-intent.js";

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

/** How much more hurt than it is a foe healer counts when the team picks a target (#2573). */
export const HEALER_PRIORITY = 0.25;

/** How far past spell range a bot follows its team's target (#2573). */
export const FOCUS_REACH = 150;

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

/**
 * Whether `self` is the one of its team to go to `point` for an
 * objective (#2581): the living teammate with empty hands nearest to it,
 * ties to simulation order, a bot or, when `humans`, a human within
 * `FLAG_REACH_UNITS` of it, about to take it up, and then no bot goes.
 * A bot free to go comes first. Then, when `fromFight`, one with a foe in
 * spell range, which `run-relic` sends from its fight; else that one is
 * passed over. Last, one an earlier rule holds back, a healer behind its
 * ward or one resting below `REST_FRACTION`, out of any fight.
 */
export function sentTo(
  context: BehaviourContext,
  point: Vec2,
  humans: boolean,
  fromFight: boolean,
): boolean {
  const team = context.self.combatant.team;
  let best: Participant | undefined;
  let bestTier = Infinity;
  let bestDistance = Infinity;
  for (const mate of context.participants) {
    const bot = context.isBot(mate.id);
    if (
      mate.combatant.team !== team ||
      mate.combatant.dead ||
      mate.creature !== undefined ||
      (!bot && (!humans || distance(mate.position, point) > FLAG_REACH_UNITS)) ||
      carriedRelic(context.objectives.relics, mate.id) !== undefined
    ) {
      continue;
    }
    const tier = bot ? sentTier(context, mate, fromFight) : 0;
    if (tier === undefined) {
      continue;
    }
    const away = distance(mate.position, point);
    if (tier < bestTier || (tier === bestTier && away < bestDistance)) {
      best = mate;
      bestTier = tier;
      bestDistance = away;
    }
  }
  return best?.id === context.self.id;
}

/** How late bot `mate` comes in `sentTo`'s order; `undefined` never. */
function sentTier(
  context: BehaviourContext,
  mate: Participant,
  fromFight: boolean,
): number | undefined {
  const held = heldBack(mate);
  if (!fighting(context, mate)) {
    return held ? 2 : 0;
  }
  return fromFight && !held ? 1 : undefined;
}

/** Whether `position` pulls bot `mate` back to its ward, or `rest` stands it still. */
export function heldBack(mate: Participant): boolean {
  return roleOf(mate) === "healer" || healthFraction(mate) < REST_FRACTION;
}

/** Whether a living foe of `mate` stands within its spell range. */
function fighting(context: BehaviourContext, mate: Participant): boolean {
  return context.participants.some(
    (foe) =>
      foe.combatant.team !== mate.combatant.team &&
      !foe.combatant.dead &&
      distance(foe.position, mate.position) <= RANGE_SPELL,
  );
}

/** An escort (#2581): to `altar`, then waiting within half spell range of it. */
export function escort(self: Participant, altar: Vec2): BehaviourIntent {
  return distance(self.position, altar) <= RANGE_SPELL / 2
    ? NOTHING
    : { ...NOTHING, moveTo: altar };
}

/** A ranged bot or healer this far from its spot walks back to it (#2545). */
export const POSITION_SLACK = 40;

/** A ranged bot or healer with a melee foe this close stands and fights it (#2545). */
export const ELBOW_DISTANCE = 100;

/** A healer looks after another ally only once that one is this much more hurt than its own (#2615). */
export const WARD_SWITCH = 0.15;

/** A healer walks to a fresh spot only once it is this far from the one it keeps (#2615). */
export const RESPOT_DISTANCE = 2 * POSITION_SLACK;

/** A bot this far from its team's centre, and ahead of it, waits for the rest (#2621). */
export const REGROUP_SPREAD = 300;

/** A bot waiting for its team walks on once this near the team's centre (#2621). */
export const REGROUP_JOINED = 150;

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
  return roll(participantId, projectileId, 0x811c9dc5);
}

/**
 * How long a bot holds its `thinks`-th decision (#2606), in
 * `reaction`'s `[minSeconds, maxSeconds)`: as `dodgeRoll`, a pure hash of
 * its `participantId` and `thinks`, on its own basis so it does not follow
 * the dodge coin. No RNG state, so a replay reacts as late.
 */
export function reactionSeconds(reaction: Reaction, participantId: string, thinks: number): number {
  const span = reaction.maxSeconds - reaction.minSeconds;
  return reaction.minSeconds + span * roll(participantId, thinks, 0x9e3779b9);
}

/** FNV-1a of `text` then `value` from `basis`, then a 32-bit finaliser: in [0, 1). */
function roll(text: string, value: number, basis: number): number {
  let hash = basis;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  hash = Math.imul(hash ^ value, 0x01000193);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x1_0000_0000;
}

/**
 * The turns, in degrees, a ranged bot or healer tries its spot at about
 * what it watches (#2598): the straight one first, then the left before
 * the right, so a tie keeps the smallest turn.
 */
export const THREAT_ANGLES = [0, 20, -20, 40, -40] as const;

/** At its spot, it looks for a safer one only with this many foes able to hit it (#2598). */
export const THREAT_MOVE_MIN = 2;

/**
 * How far `foe` can hit from (#2598): the longest range among its offence
 * skills and its weapon, never under `RANGE_MELEE`: a bow outreaches a
 * touch skill. Bars are locked in a match, so each foe's is read once
 * into `cache`.
 */
export function foeReach(cache: Map<string, number>, foe: Participant): number {
  const known = cache.get(foe.id);
  if (known !== undefined) {
    return known;
  }
  let longest = 0;
  for (const skill of skillsOf(foe)) {
    if (botUses(skill).includes("offence")) {
      longest = Math.max(longest, skill.range);
    }
  }
  const reach = Math.max(RANGE_MELEE, longest, foe.combatant.equipment.mainHand.weapon.range);
  cache.set(foe.id, reach);
  return reach;
}
