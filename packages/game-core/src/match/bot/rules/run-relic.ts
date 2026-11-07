import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import { lyingPosition } from "../../carried.js";
import { relicId } from "../../relics.js";
import { heldBack, runner } from "./fetch-relic.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run (#2581), a foe in spell range: the team's runner for its own
 * relic, lying at its spawn or on the ground, goes for it anyway, so a
 * stand-off at the altar always has a bot leaving it. Not a healer or a
 * bot resting below `REST_FRACTION`: those stay to the fight. Before
 * `position`, which would hold a ranged runner at range.
 */
const runRelic: BotRule = {
  order: 96,
  name: "run-relic",
  decide: ({ context, self, foes }) => {
    const { relics, relicSpawns, altar } = context.objectives;
    if (
      altar === undefined ||
      heldBack(self) ||
      !foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
    ) {
      return undefined;
    }
    const team = self.combatant.team;
    const relic = relics.find((candidate) => candidate.team === team);
    const lying = relic === undefined ? undefined : lyingPosition(relicSpawns, relic);
    return lying !== undefined && runner(context, lying, true)?.id === self.id
      ? { ...NOTHING, attackTargetId: relicId(team) }
      : undefined;
  },
};

export default runRelic;
