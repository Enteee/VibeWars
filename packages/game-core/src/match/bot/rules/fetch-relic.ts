import { RANGE_SPELL } from "../../../distances.js";
import { distance, type Vec2 } from "../../../vec2.js";
import type { BehaviourContext } from "../../behaviour.js";
import { lyingPosition } from "../../carried.js";
import { carriedRelic, relicId } from "../../relics.js";
import type { Participant } from "../../simulation.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run (#2581), no foe in spell range: the team's bot nearest to a
 * foe's relic on the ground returns it; else the one nearest to its own
 * relic, lying at its spawn or on the ground, fetches it, unless a human
 * teammate is nearer. Both by GW1's Interact. The others escort: they
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
 * `point`, ties to simulation order: a bot, or a human only when
 * `humans`. `undefined` when that is a human.
 */
function runner(context: BehaviourContext, point: Vec2, humans: boolean): Participant | undefined {
  const team = context.self.combatant.team;
  const { relics } = context.objectives;
  let best: Participant | undefined;
  let bestDistance = Infinity;
  for (const mate of context.participants) {
    const bot = context.isBot(mate.id);
    if (
      mate.combatant.team !== team ||
      mate.combatant.dead ||
      mate.creature !== undefined ||
      (!bot && !humans) ||
      carriedRelic(relics, mate.id) !== undefined
    ) {
      continue;
    }
    const away = distance(mate.position, point);
    if (away < bestDistance) {
      best = mate;
      bestDistance = away;
    }
  }
  return best !== undefined && context.isBot(best.id) ? best : undefined;
}

export default fetchRelic;
