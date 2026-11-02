import { NOTHING, nearestLiving } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Nothing to fight in reach: walk to the nearest foe, whatever the
 * weapon. Maps spawn teams beyond spell range.
 */
const closeIn: BotRule = {
  order: 120,
  name: "close-in",
  decide: ({ self, foes }) => {
    const nearest = nearestLiving(self, foes);
    return nearest === undefined ? undefined : { ...NOTHING, moveTo: nearest.position };
  },
};

export default closeIn;
