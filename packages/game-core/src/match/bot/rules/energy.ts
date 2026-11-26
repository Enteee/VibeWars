import { RANGE_SPELL } from "../../../distances.js";
import { stateHolds } from "../../../skills/effects.js";
import { isSpell } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import {
  botUses,
  drainsFoeEnergy,
  energyAtFoes,
  lowEnergyGain,
  ownStatuses,
} from "../skill-intent.js";
import type { BotRule } from "./types.js";

/** Below this share of its Energy, a bot drains a foe's for its own (#2231). */
const DRAIN_ENERGY_FRACTION = 0.5;

/**
 * Energy for the bot itself (#2132): Ether Signet once it is below the
 * signet's threshold, and Lyssa's Aura, never one already up, with a foe
 * in reach of an offensive spell on its bar to keep it renewed. Energy
 * Drain (#2231) once it is down to half, at the foe in reach with the most
 * Energy to lose.
 */
const energy: BotRule = {
  order: 75,
  name: "energy",
  decide: ({ self, bar, foes, mayUse, use }) => {
    const inReach = foes.filter((foe) => distance(foe.position, self.position) <= RANGE_SPELL);
    const spellAtFoe =
      bar.some(
        (held) =>
          isSpell(held.type) && held.target === "single-enemy" && botUses(held).includes("offence"),
      ) && inReach.length > 0;
    const skill = bar.find((held) => {
      const below = lowEnergyGain(held);
      const wanted =
        below !== undefined
          ? stateHolds(below, self.combatant, self.combatant, new Map())
          : energyAtFoes(held) &&
            spellAtFoe &&
            !ownStatuses(held).some((id) => self.combatant.statuses.has(id));
      return wanted && mayUse(held, self.id);
    });
    if (skill !== undefined) {
      return use(skill, self.id);
    }
    const { energy: own, maxEnergy } = self.combatant;
    if (own >= DRAIN_ENERGY_FRACTION * maxEnergy) {
      return undefined;
    }
    const richest = inReach
      .filter((foe) => foe.combatant.energy > 0)
      .sort((a, b) => b.combatant.energy - a.combatant.energy || a.id.localeCompare(b.id));
    for (const held of bar) {
      if (!drainsFoeEnergy(held)) continue;
      const foe = richest.find((each) => mayUse(held, each.id));
      if (foe !== undefined) {
        return use(held, foe.id);
      }
    }
    return undefined;
  },
};

export default energy;
