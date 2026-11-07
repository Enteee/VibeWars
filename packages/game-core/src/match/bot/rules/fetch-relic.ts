import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import { lyingPosition } from "../../carried.js";
import { relicId } from "../../relics.js";
import { escort, NOTHING, sentTo } from "./shared.js";
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
      relics.length === 0 ||
      foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
    ) {
      return undefined;
    }
    const team = self.combatant.team;
    for (const relic of relics) {
      if (
        relic.team !== team &&
        relic.place.kind === "ground" &&
        sentTo(context, relic.place.position, false)
      ) {
        return { ...NOTHING, attackTargetId: relicId(relic.team) };
      }
    }
    for (const relic of relics) {
      if (relic.team !== team) {
        continue;
      }
      const lying = lyingPosition(relicSpawns, relic);
      if (lying !== undefined && sentTo(context, lying, true)) {
        return { ...NOTHING, attackTargetId: relicId(team) };
      }
    }
    return escort(self, altar);
  },
};

export default fetchRelic;
