import { distance } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import {
  botUses,
  boostsMember,
  ownStatuses,
  sacrificedFraction,
  WELL_SACRIFICE_FLOOR,
} from "../skill-intent.js";
import { healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Boost the side's attacks (#2000), never one already up, as the fight
 * is on: a foe in the caster's weapon reach, or for a party or an area
 * round it, in reach of a member's weapon there that it does good. Never
 * paid for in Health the caster cannot spare.
 */
const boost: BotRule = {
  order: 97,
  name: "boost",
  decide: ({ self, bar, foes, allies, mayUse, use }) => {
    const swinging = (body: Participant): boolean =>
      foes.some(
        (foe) =>
          distance(foe.position, body.position) <= body.combatant.equipment.mainHand.weapon.range,
      );
    const skill = bar.find((held) => {
      if (
        !botUses(held).includes("boost") ||
        ownStatuses(held).some((id) => self.combatant.statuses.has(id)) ||
        healthFraction(self) - sacrificedFraction(held, self.combatant) < WELL_SACRIFICE_FLOOR
      ) {
        return false;
      }
      const area = held.area;
      const members =
        area === undefined
          ? [self]
          : area.origin === "party"
            ? allies
            : allies.filter((ally) => distance(ally.position, self.position) <= area.radius);
      return (
        members.some((member) => swinging(member) && boostsMember(held, member.combatant)) &&
        mayUse(held, self.id)
      );
    });
    return skill === undefined ? undefined : use(skill, self.id);
  },
};

export default boost;
