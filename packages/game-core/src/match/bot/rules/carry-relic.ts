import { carriedRelic } from "../../relics.js";
import { NOTHING, relicGoal } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run (#2581): a bot carrying a relic walks it to the altar, or
 * its Ghostly Hero (#2695), foes or not, and scores on arrival as a player does.
 */
const carryRelic: BotRule = {
  order: 34,
  name: "carry-relic",
  decide: ({ context, self }) => {
    const goal = relicGoal(context, self);
    return goal === undefined || carriedRelic(context.objectives.relics, self.id) === undefined
      ? undefined
      : { ...NOTHING, moveTo: goal.position, moveToLayer: goal.layer };
  },
};

export default carryRelic;
