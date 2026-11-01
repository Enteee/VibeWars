import { getSkill } from "../../../skills/catalog.js";
import type { Skill } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import {
  botUses,
  mirrorsStance,
  onlyInterrupts,
  ownTrapBoost,
  sendsPet,
  takenOffFoe,
} from "../skill-intent.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/** A pet at least this far from the foe is worth sending to it (#1966): Strike as One. */
const PET_SEND_UNITS = 300;

/**
 * With a foe to fight: an offensive skill in bar order, else the weapon.
 * A copier or a stripper only at a foe with what it takes (#1928, #1954):
 * Inspired Enchantment and Mirror of Disenchantment at an enchanted one.
 * Mirrored Stance only at a foe with a stance to use (#1965).
 */
const fight: BotRule = {
  order: 100,
  name: "fight",
  decide: ({ context, self, bar, targetId, mayUse, use }) => {
    if (targetId === undefined) {
      return undefined;
    }
    const foe = context.participants.find((other) => other.id === targetId)?.combatant;
    const copies = (held: Skill): boolean => {
      const category = takenOffFoe(held);
      return category === undefined || (foe?.statuses.countByCategory(category) ?? 0) > 0;
    };
    // Strike as One (#1966) only with a living pet far enough from the foe
    // to be worth the leap.
    const pet = context.participants.find(
      ({ combatant, creature }) =>
        creature?.ownerId === self.id && creature.companionSkillId !== undefined && !combatant.dead,
    );
    const target = context.participants.find((other) => other.id === targetId);
    const petFar =
      pet !== undefined &&
      target !== undefined &&
      distance(pet.position, target.position) >= PET_SEND_UNITS;
    const hasStance =
      foe?.skillBar.some((id) => id !== null && getSkill(id)?.type === "stance") ?? false;
    const skill = bar.find(
      (held) =>
        botUses(held).includes("offence") &&
        !onlyInterrupts(held) &&
        copies(held) &&
        (!sendsPet(held) || petFar) &&
        (hasStance || !mirrorsStance(held)) &&
        mayUse(held, targetId),
    );
    // A trap goes down under Trapper's Focus or Speed when the bar has one
    // not yet up (#1966).
    if (skill?.type === "trap") {
      const boost = bar.find((held) => {
        const statusId = ownTrapBoost(held);
        return (
          statusId !== undefined && !self.combatant.statuses.has(statusId) && mayUse(held, self.id)
        );
      });
      if (boost !== undefined) {
        return use(boost, self.id);
      }
    }
    if (skill !== undefined) {
      return use(skill, targetId);
    }
    // The weapon.
    return { ...NOTHING, targetId, attackTargetId: targetId };
  },
};

export default fight;
