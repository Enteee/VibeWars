import type { ModWhile } from "../equipment/mods.js";
import { isAttacking, isCastingSpell } from "./attacking.js";
import { raisedMaxHealth, statusWhileHolds } from "./tick.js";
import type { Combatant } from "./types.js";

/**
 * Whether a weapon mod's condition holds on its `bearer` now (#2010).
 * Half of Health is of the raised maximum, morale included, and strictly
 * above or below it: exactly half is neither. `target`: the foe a blow
 * lands on, the only thing Too Much Information asks about; without one
 * a hexed target never holds.
 */
export function modWhileHolds(
  condition: ModWhile,
  bearer: Combatant,
  target: Combatant | undefined,
): boolean {
  switch (condition) {
    case "health-above-half":
      return bearer.health > raisedMaxHealth(bearer) / 2;
    case "health-below-half":
      return bearer.health < raisedMaxHealth(bearer) / 2;
    case "enchanted":
    case "in-stance":
    case "hexed":
      return statusWhileHolds(condition, bearer);
    case "attacking":
      return isAttacking(bearer);
    case "casting":
      return isCastingSpell(bearer);
    case "target-hexed":
      return target !== undefined && target.statuses.countByCategory("hex") > 0;
  }
}
