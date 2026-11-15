import { NOTHING, nearestToWalk } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Nothing to fight in reach: walk to the foe nearest to walk to, onto its
 * layer (#3353), whatever the weapon. Maps spawn teams beyond spell range.
 */
const closeIn: BotRule = {
  order: 120,
  name: "close-in",
  decide: ({ context, self, foes }) => {
    const foe = nearestToWalk(self, foes, (to, layer) => context.routeLength(to, layer));
    return foe === undefined
      ? undefined
      : { ...NOTHING, moveTo: foe.position, moveToLayer: foe.layer };
  },
};

export default closeIn;
