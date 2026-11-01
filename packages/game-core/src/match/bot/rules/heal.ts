import type { Participant } from "../../simulation.js";
import type { Skill } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import { botUses, wardedDamageType } from "../skill-intent.js";
import { airFirst } from "./setup.js";
import { HURT_FRACTION, healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/** Heal or protect the most hurt ally, itself included. */
const heal: BotRule = {
  order: 20,
  name: "heal",
  decide: (rule) => {
    const { self, bar, allies, mayUse, use } = rule;
    let hurt: Participant | undefined;
    for (const ally of allies) {
      if (hurt === undefined || healthFraction(ally) < healthFraction(hurt)) {
        hurt = ally;
      }
    }
    if (hurt === undefined || healthFraction(hurt) >= HURT_FRACTION) {
      return undefined;
    }
    const patient = hurt;
    // A self-targeted skill reaches the caster, unless its area spares the
    // caster (Healing Ring, #1870): then only an ally beside it, so it is
    // never cast for the caster alone or into foes only.
    const reaches = (held: Skill): boolean => {
      if (held.target !== "self") {
        return true;
      }
      const area = held.area;
      if (area?.origin !== "caster" || area.includesCaster) {
        return patient.id === self.id;
      }
      return patient.id !== self.id && distance(patient.position, self.position) <= area.radius;
    };
    for (const role of ["healing", "defence"] as const) {
      const skill = bar.find(
        (held) =>
          botUses(held).includes(role) &&
          wardedDamageType(held) === undefined &&
          reaches(held) &&
          mayUse(held, held.target === "self" ? self.id : patient.id),
      );
      if (skill !== undefined) {
        const castOn = skill.target === "self" ? self.id : patient.id;
        // A dear enchantment goes on cheaper with Air of Enchantment first (#1975).
        return use(airFirst(rule, skill, castOn) ?? skill, castOn);
      }
    }
    return undefined;
  },
};

export default heal;
