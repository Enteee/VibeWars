import { energyCostOf } from "../../../skills/activation.js";
import type { StatusId } from "../../../skills/status.js";
import type { Skill } from "../../../skills/types.js";
import { setupOf } from "../skill-intent.js";
import { healthFraction } from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/** An enchantment at least this dear is worth Air of Enchantment first (#1975). */
const AIR_WORTH_ENERGY = 10;

/** Party members hitting enchanted foes that make Order of Apostasy worth it (#1975). */
const ORDER_HITTERS = 2;

/** Above this share of its own Health, a bot may pay Order of Apostasy's price (#1975). */
const ORDER_HEALTH_FRACTION = 0.5;

/** Energy a bot keeps for Dark Apostasy's price before casting it (#1975). */
const DARK_APOSTASY_ENERGY = 10;

/** The setups on its bar (#1975), each with what it sets up. */
function setupsOf(bar: readonly Skill[]) {
  return bar.flatMap((skill) => {
    const found = setupOf(skill);
    return found === undefined ? [] : [{ skill, ...found }];
  });
}

/**
 * Air of Enchantment (#1975) on the ally a dear enchantment is for,
 * before it, unless that ally already bears one.
 */
export function airFirst(
  { context, self, bar, mayUse }: RuleContext,
  enchantment: Skill,
  castOn: string,
): Skill | undefined {
  if (
    enchantment.type !== "enchantment" ||
    enchantment.area !== undefined ||
    energyCostOf(enchantment, self.combatant) < AIR_WORTH_ENERGY
  ) {
    return undefined;
  }
  const bears = (statusId: StatusId): boolean =>
    context.participants.find((other) => other.id === castOn)?.combatant.statuses.has(statusId) ??
    false;
  return setupsOf(bar).find(
    ({ skill, setup, statusId }) =>
      setup === "cheaper-enchantments" && !bears(statusId) && mayUse(skill, castOn),
  )?.skill;
}

/**
 * A setup on itself the fight calls for (#1975): Dark Apostasy at an
 * enchanted foe with Energy for its price, Order of Apostasy while the
 * party hits enchanted foes and it has Health for its price.
 */
const setup: BotRule = {
  order: 95,
  name: "setup",
  decide: ({ self, bar, foes, allies, targetId, mayUse, use }) => {
    if (targetId === undefined) {
      return undefined;
    }
    const enchanted = (id: string | undefined): boolean =>
      foes.some(
        (other) => other.id === id && other.combatant.statuses.countByCategory("enchantment") > 0,
      );
    const hitters = allies.filter((member) => enchanted(member.combatant.attack?.targetId)).length;
    const found = setupsOf(bar).find(
      ({ skill, setup, statusId }) =>
        !self.combatant.statuses.has(statusId) &&
        ((setup === "critical-strips" &&
          enchanted(targetId) &&
          self.combatant.energy >= DARK_APOSTASY_ENERGY) ||
          (setup === "party-strips" &&
            hitters >= ORDER_HITTERS &&
            healthFraction(self) > ORDER_HEALTH_FRACTION)) &&
        mayUse(skill, self.id),
    );
    return found === undefined ? undefined : use(found.skill, self.id);
  },
};

export default setup;
