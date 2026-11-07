import { distance } from "../../../vec2.js";
import { ghostId } from "../../ghost.js";
import { ALTAR_REACH_UNITS } from "../../relics.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * King of the Hill (#2582): a bot its team's Ghostly Hero follows walks
 * to the altar, foes or not, the ghost at its heel. With the ghost on the
 * altar, Space on it once tells it to stay and claim; it follows nobody
 * then, so the bot is free to fight.
 */
const leadGhost: BotRule = {
  order: 34,
  name: "lead-ghost",
  decide: ({ context, self }) => {
    const { altar } = context.objectives;
    if (altar === undefined) {
      return undefined;
    }
    const id = ghostId(self.combatant.team);
    const ghost = context.participants.find((participant) => participant.id === id);
    if (ghost === undefined || ghost.combatant.dead || ghost.creature?.leaderId !== self.id) {
      return undefined;
    }
    return distance(ghost.position, altar) <= ALTAR_REACH_UNITS
      ? { ...NOTHING, attackTargetId: ghost.id }
      : { ...NOTHING, moveTo: altar };
  },
};

export default leadGhost;
