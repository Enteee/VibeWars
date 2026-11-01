import { botUses } from "../skill-intent.js";
import type { BotRule } from "./types.js";

/** Raise the nearest dead ally. */
const raise: BotRule = {
  order: 60,
  name: "raise",
  decide: ({ context, self, bar, nearestFirst, mayUse, use }) => {
    const raises = bar.filter((skill) => botUses(skill).includes("resurrect"));
    if (raises.length === 0) {
      return undefined;
    }
    const corpses = context.participants.filter(
      (other) =>
        other.combatant.dead &&
        other.combatant.team === self.combatant.team &&
        other.creature === undefined &&
        other.id !== self.id,
    );
    for (const corpse of nearestFirst(corpses)) {
      const skill = raises.find((held) => mayUse(held, corpse.id));
      if (skill !== undefined) {
        return use(skill, corpse.id);
      }
    }
    return undefined;
  },
};

export default raise;
