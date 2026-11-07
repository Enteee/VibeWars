import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import { NOTHING, REST_FRACTION, healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Hurt, with no foe in reach (#2549): it stands still while its regen
 * and its healer bring it up to `REST_FRACTION`, rather than walk back
 * into the fight. A foe coming into reach ends the rest.
 */
const rest: BotRule = {
  order: 93,
  name: "rest",
  decide: ({ self, foes, role }) => {
    if (role === undefined || healthFraction(self) >= REST_FRACTION) {
      return undefined;
    }
    return foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
      ? undefined
      : NOTHING;
  },
};

export default rest;
