import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import {
  botUses,
  guardsInterrupt,
  mainDamageType,
  ownStatuses,
  wardedDamageType,
} from "../skill-intent.js";
import { skillsOf } from "./shared.js";
import type { BotRule } from "./types.js";

/** A cast this long or longer is worth a guard against interrupts (#1964). */
const GUARDED_CAST_SECONDS = 2;

/**
 * A mantra before it is needed (#1964), never one already up: a guard
 * against interrupts with a long cast on its bar and a foe in reach that
 * holds an interrupt, or one damage type's cut with a foe in reach that
 * deals mostly that type.
 */
const mantra: BotRule = {
  order: 80,
  name: "mantra",
  decide: ({ self, bar, foes, mayUse, use }) => {
    const mantras = bar.filter(
      (held) => guardsInterrupt(held) || wardedDamageType(held) !== undefined,
    );
    if (mantras.length === 0) {
      return undefined;
    }
    const inReach = foes.filter((foe) => distance(foe.position, self.position) <= RANGE_SPELL);
    const longCast = bar.some((held) => held.activationSeconds >= GUARDED_CAST_SECONDS);
    for (const skill of mantras) {
      if (
        ownStatuses(skill).some((id) => self.combatant.statuses.has(id)) ||
        !mayUse(skill, self.id)
      ) {
        continue;
      }
      const type = wardedDamageType(skill);
      const wanted =
        type === undefined
          ? longCast &&
            inReach.some((foe) => skillsOf(foe).some((held) => botUses(held).includes("interrupt")))
          : inReach.some((foe) => mainDamageType(skillsOf(foe)) === type);
      if (wanted) {
        return use(skill, self.id);
      }
    }
    return undefined;
  },
};

export default mantra;
