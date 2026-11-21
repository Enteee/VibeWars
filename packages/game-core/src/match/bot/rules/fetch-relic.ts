import { lyingPoint } from "../../carried.js";
import { carriesRelic, relicId } from "../../relics.js";
import { RANGE_SPELL } from "../../../distances.js";
import type { Vec2 } from "../../../vec2.js";
import type { BehaviourContext, BehaviourIntent } from "../../behaviour.js";
import { FLAG_REACH_UNITS } from "../../flags.js";
import type { Participant } from "../../simulation.js";
import { escort, NOTHING, pressed, relicGoal, sentTo, type Errand } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run (#2581), no foe in spell range but one it has left behind on
 * its way (#3749): the team's bot nearest to a relic on the ground that
 * it sends home returns it; else the one nearest to the relic it carries,
 * lying at its spawn or on the ground, fetches it, unless a human teammate
 * is about to take it up. Both by GW1's Interact. The others escort: they
 * walk to the altar and wait there or, carrying the foe's relic (#2695),
 * go where it lies, and home with it.
 */
const fetchRelic: BotRule = {
  order: 116,
  name: "fetch-relic",
  decide: (rule) => {
    const { context, self } = rule;
    const { relics } = context.objectives;
    const goal = relicGoal(context, self);
    if (goal === undefined || relics.length === 0) {
      return undefined;
    }
    const { intent, errand } = errandFor(context, self, goal);
    return pressed(rule, errand) ? undefined : intent;
  },
};

/** What `self` does for its relic, and where that takes it (#3749). */
function errandFor(
  context: BehaviourContext,
  self: Participant,
  goal: { readonly position: Vec2; readonly layer: number },
): { readonly intent: BehaviourIntent; readonly errand: Errand } {
  const { relics, relicSpawns, relicCarry } = context.objectives;
  const team = self.combatant.team;
  for (const relic of relics) {
    if (
      !carriesRelic(relicCarry, relic.team, team) &&
      relic.place.kind === "ground" &&
      sentTo(context, relic.place.position, relicId(relic.team), false, false)
    ) {
      return {
        intent: { ...NOTHING, attackTargetId: relicId(relic.team) },
        errand: { ...relic.place, reach: FLAG_REACH_UNITS },
      };
    }
  }
  for (const relic of relics) {
    if (!carriesRelic(relicCarry, relic.team, team)) {
      continue;
    }
    const lying = lyingPoint(relicSpawns, relic);
    if (lying !== undefined && sentTo(context, lying.position, relicId(relic.team), true, true)) {
      return {
        intent: { ...NOTHING, attackTargetId: relicId(relic.team) },
        errand: { position: lying.position, layer: lying.layer, reach: FLAG_REACH_UNITS },
      };
    }
    if (relicCarry === "foe" && lying !== undefined) {
      return {
        intent: escort(self, lying.position, lying.layer),
        errand: { position: lying.position, layer: lying.layer, reach: RANGE_SPELL / 2 },
      };
    }
  }
  return {
    intent: escort(self, goal.position, goal.layer),
    errand: { ...goal, reach: RANGE_SPELL / 2 },
  };
}

export default fetchRelic;
