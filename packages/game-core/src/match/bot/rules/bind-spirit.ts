import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import type { BotRule } from "./types.js";

/** At this Health or less, a bot takes no foe's spirit (#1965): Signet of Binding costs up to 200. */
const BIND_HEALTH_FLOOR = 200;

/**
 * Take a foe's spirit in reach (#1965), as Signet of Binding, with Health
 * to spare for its price.
 */
const bindSpirit: BotRule = {
  order: 90,
  name: "bind-spirit",
  decide: ({ context, self, bar, nearestFirst, mayUse, use }) => {
    const binds = bar.filter((skill) => skill.target === "enemy-spirit");
    if (binds.length === 0 || self.combatant.health <= BIND_HEALTH_FLOOR) {
      return undefined;
    }
    const theirs = context.participants.filter(
      ({ combatant, creature, position }) =>
        creature?.kind === "spirit" &&
        creature.ownerId !== undefined &&
        combatant.team !== self.combatant.team &&
        !combatant.dead &&
        distance(position, self.position) <= RANGE_SPELL,
    );
    for (const spirit of nearestFirst(theirs)) {
      const skill = binds.find((held) => mayUse(held, spirit.id));
      if (skill !== undefined) {
        return use(skill, spirit.id);
      }
    }
    return undefined;
  },
};

export default bindSpirit;
