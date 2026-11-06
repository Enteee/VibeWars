import { distance } from "../../../vec2.js";
import { conditionAuraRadius, removedCategories, removesFromCaster } from "../skill-intent.js";
import { spiritUp } from "./shared.js";
import type { BotRule } from "./types.js";

/** Take a hex or a condition off the nearest ally bearing one. */
const cleanse: BotRule = {
  order: 50,
  name: "cleanse",
  decide: ({ context, self, bar, allies, targetId, nearestFirst, mayUse, use }) => {
    for (const ally of nearestFirst(allies)) {
      const statuses = ally.combatant.statuses;
      for (const skill of bar) {
        // A spirit that runs conditions out faster (#2491), Recovery's:
        // for a bearer inside its aura, unless one already stands.
        const aura = conditionAuraRadius(skill);
        if (aura !== undefined) {
          if (
            statuses.countByCategory("condition") > 0 &&
            distance(ally.position, self.position) <= aura &&
            !spiritUp(context, self, skill) &&
            mayUse(skill, self.id)
          ) {
            return use(skill, self.id);
          }
          continue;
        }
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
