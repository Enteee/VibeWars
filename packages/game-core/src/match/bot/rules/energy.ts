import { RANGE_SPELL } from "../../../distances.js";
import { stateHolds } from "../../../skills/effects.js";
import { isSpell } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import { botUses, energyAtFoes, lowEnergyGain, ownStatuses } from "../skill-intent.js";
import type { BotRule } from "./types.js";

/**
 * Energy for the bot itself (#2132): Ether Signet once it is below the
 * signet's threshold, and Lyssa's Aura, never one already up, with a foe
 * in reach of an offensive spell on its bar to keep it renewed.
 */
const energy: BotRule = {
  order: 75,
  name: "energy",
  decide: ({ self, bar, foes, mayUse, use }) => {
    const spellAtFoe =
      bar.some(
        (held) =>
          isSpell(held.type) && held.target === "single-enemy" && botUses(held).includes("offence"),
      ) && foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL);
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
    return skill === undefined ? undefined : use(skill, self.id);
  },
};

export default energy;
