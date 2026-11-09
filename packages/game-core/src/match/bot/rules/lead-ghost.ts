import { ghostId, onHill } from "../../ghost.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * King of the Hill (#2582): a bot its team's Ghostly Hero follows walks
 * to the altar, foes or not, the ghost at its heel. With the ghost on the
 * altar, Space on it once tells it to stay and claim; it follows nobody
 * then, so the bot is free to fight.
 */
const leadGhost: BotRule = {
  order: 37,
  name: "lead-ghost",
  decide: ({ context, self }) => {
    const { altar, altarLayer } = context.objectives;
    if (altar === undefined) {
      return undefined;
    }
    const id = ghostId(self.combatant.team);
    const ghost = context.participants.find((participant) => participant.id === id);
    if (ghost === undefined || ghost.combatant.dead || ghost.creature?.leaderId !== self.id) {
      return undefined;
    }
    return onHill(altar, altarLayer, ghost)
      ? { ...NOTHING, attackTargetId: ghost.id }
      : { ...NOTHING, moveTo: altar, moveToLayer: altarLayer };
  },
};

export default leadGhost;
