import { RANGE_SPELL } from "../../../distances.js";
import { FLAG_REACH_UNITS } from "../../flags.js";
import { ghostId, onHill } from "../../ghost.js";
import { escort, NOTHING, pressed, sentTo } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * King of the Hill (#2582), no foe in spell range but one it has left
 * behind on its way (#3749): while its team does not hold the altar, the
 * team's bot nearest to its Ghostly Hero, standing off the altar and
 * following nobody, tells it to follow (Space on it), unless a human
 * teammate is about to take it. The others escort at the altar.
 */
const pickUpGhost: BotRule = {
  order: 114,
  name: "pick-up-ghost",
  decide: (rule) => {
    const { context, self } = rule;
    const { altar, altarLayer, altarHolder } = context.objectives;
    const team = self.combatant.team;
    const id = ghostId(team);
    const ghost = context.participants.find((participant) => participant.id === id);
    if (altar === undefined || ghost === undefined) {
      return undefined;
    }
    if (
      altarHolder !== team &&
      !ghost.combatant.dead &&
      ghost.creature?.leaderId === undefined &&
      !onHill(altar, altarLayer, ghost) &&
      sentTo(context, ghost.position, ghost.id, true, false)
    ) {
      return pressed(rule, {
        position: ghost.position,
        layer: ghost.layer,
        reach: FLAG_REACH_UNITS,
      })
        ? undefined
        : { ...NOTHING, attackTargetId: ghost.id };
    }
    return pressed(rule, { position: altar, layer: altarLayer, reach: RANGE_SPELL / 2 })
      ? undefined
      : escort(self, altar, altarLayer);
  },
};

export default pickUpGhost;
