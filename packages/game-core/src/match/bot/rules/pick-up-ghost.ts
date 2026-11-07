import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import { ghostId } from "../../ghost.js";
import { ALTAR_REACH_UNITS } from "../../relics.js";
import { escort, NOTHING, sentTo } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * King of the Hill (#2582), no foe in spell range: while its team does
 * not hold the altar, the team's bot nearest to its Ghostly Hero, standing
 * off the altar and following nobody, tells it to follow (Space on it),
 * unless a human teammate is about to take it. The others escort at the altar.
 */
const pickUpGhost: BotRule = {
  order: 114,
  name: "pick-up-ghost",
  decide: ({ context, self, foes }) => {
    const { altar, altarHolder } = context.objectives;
    const team = self.combatant.team;
    const id = ghostId(team);
    const ghost = context.participants.find((participant) => participant.id === id);
    if (
      altar === undefined ||
      ghost === undefined ||
      foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
    ) {
      return undefined;
    }
    if (
      altarHolder !== team &&
      !ghost.combatant.dead &&
      ghost.creature?.leaderId === undefined &&
      distance(ghost.position, altar) > ALTAR_REACH_UNITS &&
      sentTo(context, ghost.position, true)
    ) {
      return { ...NOTHING, attackTargetId: ghost.id };
    }
    return escort(self, altar);
  },
};

export default pickUpGhost;
