import { carriedRelic } from "../../relics.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run (#2581): a bot carrying its relic walks it to the altar,
 * foes or not, and scores on arrival as a player does.
 */
const carryRelic: BotRule = {
  order: 99,
  name: "carry-relic",
  decide: ({ context, self }) => {
    const { relics, altar } = context.objectives;
    return altar === undefined || carriedRelic(relics, self.id) === undefined
      ? undefined
      : { ...NOTHING, moveTo: altar };
  },
};

export default carryRelic;
