import { distance } from "../../../vec2.js";
import { conditionAuraRadius, removedCategories, removesFromCaster } from "../skill-intent.js";
import type { Participant } from "../../simulation.js";
import { punishments } from "../punish.js";
import { healthFraction, spiritUp } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * `allies` in the order a bot cleanses them (#4207): one under a hex that
 * punishes its play first (`punishments`), the dearest punishment first;
 * then the most hurt; ties to `nearest`'s order, nearer first.
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
  return ranked
    .sort((a, b) =>
      a.cost !== undefined || b.cost !== undefined
        ? (b.cost ?? -1) - (a.cost ?? -1)
        : a.health - b.health,
    )
    .map(({ ally }) => ally);
}

/**
 * Take a hex or a condition off an ally bearing one, in `cleanseOrder`
 * (#4207): a punishing hex first, then the most hurt, then the nearest.
 */
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
