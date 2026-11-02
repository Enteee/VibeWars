import { removedCategories, removesFromCaster } from "../skill-intent.js";
import type { BotRule } from "./types.js";

/** Take a hex or a condition off the nearest ally bearing one. */
const cleanse: BotRule = {
  order: 50,
  name: "cleanse",
  decide: ({ self, bar, allies, targetId, nearestFirst, mayUse, use }) => {
    for (const ally of nearestFirst(allies)) {
      const statuses = ally.combatant.statuses;
      for (const skill of bar) {
        const takesOff = removedCategories(skill).some(
          (category) => statuses.countByCategory(category) > 0,
        );
        if (!takesOff) {
          continue;
        }
        // Off the caster: only for itself, cast where the skill says.
        const castOn = removesFromCaster(skill)
          ? ally.id === self.id
            ? skill.target === "single-enemy"
              ? targetId
              : self.id
            : undefined
          : skill.target === "self" && ally.id !== self.id
            ? undefined
            : ally.id;
        if (castOn !== undefined && mayUse(skill, castOn)) {
          return use(skill, castOn);
        }
      }
    }
    return undefined;
  },
};

export default cleanse;
