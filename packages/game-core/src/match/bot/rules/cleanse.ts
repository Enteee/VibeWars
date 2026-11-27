import type { Participant } from "../../simulation.js";
import { distance } from "../../../vec2.js";
import { punishments } from "../punish.js";
import { conditionAuraRadius, removedCategories, removesFromCaster } from "../skill-intent.js";
import { healthFraction, spiritUp } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * The order to cleanse allies in (#4207): first those under a hex that
 * punishes their play (Empathy, Backfire), the costliest first; then the
 * most hurt. `nearest` comes nearest first, the final tiebreak.
 */
function cleanseOrder(nearest: readonly Participant[]): Participant[] {
  const ranked = nearest.map((ally) => {
    const punished = punishments(ally);
    return {
      ally,
      cost: punished.attacks || punished.spells || punished.skills ? punished.cost : undefined,
      health: healthFraction(ally),
    };
  });
  ranked.sort((a, b) =>
    a.cost !== undefined || b.cost !== undefined
      ? (b.cost ?? -1) - (a.cost ?? -1)
      : a.health - b.health,
  );
  return ranked.map(({ ally }) => ally);
}

/** Take a hex or a condition off an ally bearing one, punishing hexes first. */
const cleanse: BotRule = {
  order: 50,
  name: "cleanse",
  decide: ({ context, self, bar, allies, targetId, nearestFirst, mayUse, use }) => {
    for (const ally of cleanseOrder(nearestFirst(allies))) {
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
