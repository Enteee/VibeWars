import { lyingPosition } from "../../carried.js";
import { carriesRelic, relicId } from "../../relics.js";
import { heldBack, NOTHING, pressed, sentTo } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run (#2581), a foe in spell range: the team's runner for the
 * relic it carries, lying at its spawn or on the ground, goes for it anyway, so a
 * stand-off at the altar always has a bot leaving it. Not a healer or a
 * bot resting below `REST_FRACTION`: those stay to the fight. Before
 * `position`, which would hold a ranged runner at range.
 */
const runRelic: BotRule = {
  order: 96,
  name: "run-relic",
  decide: (rule) => {
    const { context, self } = rule;
    const { relics, relicSpawns, relicCarry } = context.objectives;
    if (relics.length === 0 || heldBack(self) || !pressed(rule)) {
      return undefined;
    }
    const team = self.combatant.team;
    const relic = relics.find((candidate) => carriesRelic(relicCarry, candidate.team, team));
    const lying = relic === undefined ? undefined : lyingPosition(relicSpawns, relic);
    return relic !== undefined && lying !== undefined && sentTo(context, lying, true, true)
      ? { ...NOTHING, attackTargetId: relicId(relic.team) }
      : undefined;
  },
};

export default runRelic;
