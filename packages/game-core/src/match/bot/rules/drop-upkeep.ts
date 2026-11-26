import { energyCostOf } from "../../../skills/activation.js";
import { getStatusDefinition, type StatusId } from "../../../skills/status.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/** At most one maintained enchantment ended in this long (#2492). */
export const UPKEEP_DROP_SECONDS = 5;

/**
 * Energy back from its own upkeep (#2492): starved, below the cost of the
 * cheapest skill on its bar not recharging, a bot ends the oldest
 * enchantment it maintains, so the pip comes back and it casts again.
 * Never one whose end hurts its own side, as Unyielding Aura's kills.
 */
const dropUpkeep: BotRule = {
  order: 73,
  name: "drop-upkeep",
  decide: ({ context, self, bar, mayEndUpkeep }) => {
    if (!mayEndUpkeep) {
      return undefined;
    }
    const costs = bar
      .filter((held) => held.cost?.kind === "energy" && !self.combatant.cast.isRecharging(held.id))
      .map((held) => energyCostOf(held, self.combatant));
    if (costs.length === 0 || self.combatant.energy >= Math.min(...costs)) {
      return undefined;
    }
    let oldest: { targetId: string; status: StatusId; seq: number } | undefined;
    for (const bearer of context.participants) {
      for (const status of bearer.combatant.statuses.active) {
        if (
          status.maintained !== null &&
          status.sourceId === self.id &&
          !getStatusDefinition(status.id).killsBearerOnEnd &&
          (oldest === undefined || status.maintained.seq < oldest.seq)
        ) {
          oldest = { targetId: bearer.id, status: status.id, seq: status.maintained.seq };
        }
      }
    }
    return oldest === undefined
      ? undefined
      : { ...NOTHING, endUpkeep: { targetId: oldest.targetId, status: oldest.status } };
  },
};

export default dropUpkeep;
