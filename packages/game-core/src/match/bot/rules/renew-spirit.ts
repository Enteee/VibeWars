import { RANGE_SPIRIT } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import { renewsSpirit } from "../skill-intent.js";
import type { BotRule } from "./types.js";

/** Below this share of its lifetime left, a spirit of a bot's own is worth renewing (#1947). */
const RENEW_FRACTION = 0.25;

/**
 * Renew a spirit of its own near its end with a foe in its reach (#1947),
 * as Gaze of Fury: the new one fights on where it stood.
 */
const renewSpirit: BotRule = {
  order: 70,
  name: "renew-spirit",
  decide: ({ context, self, bar, foes, mayUse, use }) => {
    const renews = bar.filter(renewsSpirit);
    if (renews.length === 0) {
      return undefined;
    }
    const ending = context.participants.filter(
      ({ combatant, creature, position }) =>
        creature?.kind === "spirit" &&
        creature.ownerId === self.id &&
        !combatant.dead &&
        creature.expiresInSeconds <
          RENEW_FRACTION * (creature.ageSeconds + creature.expiresInSeconds) &&
        foes.some((foe) => distance(foe.position, position) <= RANGE_SPIRIT),
    );
    for (const spirit of ending) {
      const skill = renews.find((held) => mayUse(held, spirit.id));
      if (skill !== undefined) {
        return use(skill, spirit.id);
      }
    }
    return undefined;
  },
};

export default renewSpirit;
