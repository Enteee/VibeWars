import { RANGE_SPELL } from "../../../distances.js";
import { distance, type Vec2 } from "../../../vec2.js";
import type { BehaviourContext } from "../../behaviour.js";
import { lyingPosition } from "../../carried.js";
import { FLAG_REACH_UNITS } from "../../flags.js";
import { carriedRelic, relicId } from "../../relics.js";
import type { Participant } from "../../simulation.js";
import { roleOf } from "../role.js";
import { NOTHING, REST_FRACTION, healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run (#2581), no foe in spell range: the team's bot nearest to a
 * foe's relic on the ground returns it; else the one nearest to its own
 * relic, lying at its spawn or on the ground, fetches it, unless a human
 * teammate is about to take it up. Both by GW1's Interact. The others escort: they
 * walk to the altar and wait there.
 */
const fetchRelic: BotRule = {
  order: 116,
  name: "fetch-relic",
  decide: ({ context, self, foes }) => {
    const { relics, relicSpawns, altar } = context.objectives;
    if (
      altar === undefined ||
      foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
    ) {
      return undefined;
    }
    const team = self.combatant.team;
    for (const relic of relics) {
      if (
        relic.team !== team &&
        relic.place.kind === "ground" &&
        runner(context, relic.place.position, false)?.id === self.id
      ) {
        return { ...NOTHING, attackTargetId: relicId(relic.team) };
      }
    }
    for (const relic of relics) {
      if (relic.team !== team) {
        continue;
      }
      const lying = lyingPosition(relicSpawns, relic);
      if (lying !== undefined && runner(context, lying, true)?.id === self.id) {
        return { ...NOTHING, attackTargetId: relicId(team) };
      }
    }
    return distance(self.position, altar) <= RANGE_SPELL / 2
      ? NOTHING
      : { ...NOTHING, moveTo: altar };
  },
};

/**
 * The living teammate of `context.self` with empty hands nearest to
 * `point`, ties to simulation order: a bot, or, for its `own` relic, a
 * human within `FLAG_REACH_UNITS` of it, about to take it up; one idle at
 * its base stops nobody. A bot free to run comes first. Then, for its
 * `own` relic, one with a foe in spell range, which `run-relic` sends
 * from the fight. Last, one an earlier rule holds back, a healer behind
 * its ward or one resting below `REST_FRACTION`, out of any fight.
 * `undefined` when that is a human.
 */
export function runner(
  context: BehaviourContext,
  point: Vec2,
  own: boolean,
): Participant | undefined {
  const team = context.self.combatant.team;
  const { relics } = context.objectives;
  let best: Participant | undefined;
  let bestTier = Infinity;
  let bestDistance = Infinity;
  for (const mate of context.participants) {
    const bot = context.isBot(mate.id);
    if (
      mate.combatant.team !== team ||
      mate.combatant.dead ||
      mate.creature !== undefined ||
      (!bot && (!own || distance(mate.position, point) > FLAG_REACH_UNITS)) ||
      carriedRelic(relics, mate.id) !== undefined
    ) {
      continue;
    }
    const tier = bot ? runnerTier(context, mate, own) : 0;
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
  return best !== undefined && context.isBot(best.id) ? best : undefined;
}

/** How late bot `mate` comes as a runner, by `runner`'s order; `undefined` never. */
function runnerTier(
  context: BehaviourContext,
  mate: Participant,
  own: boolean,
): number | undefined {
  const held = heldBack(mate);
  if (!fighting(context, mate)) {
    return held ? 2 : 0;
  }
  return own && !held ? 1 : undefined;
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

export default fetchRelic;
