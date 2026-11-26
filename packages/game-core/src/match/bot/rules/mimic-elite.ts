import { getSkill } from "../../../skills/catalog.js";
import { mimickedElite } from "../../../skills/stand-in.js";
import type { BotRule } from "./types.js";

/**
 * No foe in reach: borrow an ally's elite (#1965), as Arcane Mimicry, one
 * that is no attack and not on its own bar already.
 */
const mimicElite: BotRule = {
  order: 110,
  name: "mimic-elite",
  decide: ({ self, bar, allies, nearestFirst, mayUse, use }) => {
    const mimics = bar.filter((skill) =>
      skill.effects.some((effect) => effect.kind === "copy-elite"),
    );
    for (const ally of mimics.length === 0 ? [] : nearestFirst(allies)) {
      const elite = ally.id === self.id ? undefined : mimickedElite(ally.combatant.skillBar);
      if (
        elite === undefined ||
        getSkill(elite)?.type === "attack" ||
        self.skillBar.includes(elite)
      ) {
        continue;
      }
      const skill = mimics.find((held) => mayUse(held, ally.id));
      if (skill !== undefined) {
        return use(skill, ally.id);
      }
    }
    return undefined;
  },
};

export default mimicElite;
