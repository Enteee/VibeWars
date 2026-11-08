import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import { lyingPosition } from "../../carried.js";
import { carriesRelic, relicId } from "../../relics.js";
import { escort, NOTHING, relicGoal, sentTo } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run (#2581), no foe in spell range: the team's bot nearest to a
 * relic on the ground that it sends home returns it; else the one nearest
 * to the relic it carries, lying at its spawn or on the ground, fetches
 * it, unless a human teammate is about to take it up. Both by GW1's
 * Interact. The others escort: they walk to the altar and wait there or,
 * carrying the foe's relic (#2695), go where it lies, and home with it.
 */
const fetchRelic: BotRule = {
  order: 116,
  name: "fetch-relic",
  decide: ({ context, self, foes }) => {
    const { relics, relicSpawns, relicCarry } = context.objectives;
    const goal = relicGoal(context, self);
    if (
      goal === undefined ||
      relics.length === 0 ||
      foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
    ) {
      return undefined;
    }
    const team = self.combatant.team;
    for (const relic of relics) {
      if (
        !carriesRelic(relicCarry, relic.team, team) &&
        relic.place.kind === "ground" &&
        sentTo(context, relic.place.position, false, false)
      ) {
        return { ...NOTHING, attackTargetId: relicId(relic.team) };
      }
    }
    for (const relic of relics) {
      if (!carriesRelic(relicCarry, relic.team, team)) {
        continue;
      }
      const lying = lyingPosition(relicSpawns, relic);
      if (lying !== undefined && sentTo(context, lying, true, true)) {
        return { ...NOTHING, attackTargetId: relicId(relic.team) };
      }
      if (relicCarry === "foe" && lying !== undefined) {
        return escort(self, lying);
      }
    }
    return escort(self, goal);
  },
};

export default fetchRelic;
