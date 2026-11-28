import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import { harmAround, harmHolding } from "../hostile-ground.js";
import { NOTHING, REST_FRACTION, healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Hurt, with no foe in reach (#2549): it stands still while its regen
 * and its healer bring it up to `REST_FRACTION`, rather than walk back
 * into the fight. A foe coming into reach ends the rest; so does harmful
 * ground (#3026) or a foe's harmful ground effect (#4193), which
 * `leave-zone` then walks it out of.
 */
const rest: BotRule = {
  order: 93,
  name: "rest",
  decide: ({ context, self, foes, role }) => {
    if (
      role === undefined ||
      healthFraction(self) >= REST_FRACTION ||
      harmHolding(harmAround(context.objectives, self.combatant.team), self.position, self.layer)
        .length > 0
    ) {
      return undefined;
    }
    return foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
      ? undefined
      : NOTHING;
  },
};

export default rest;
