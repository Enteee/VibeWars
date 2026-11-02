import { getSkill } from "../../../skills/catalog.js";
import { RANGE_MELEE } from "../../../distances.js";
import type { Skill, Surroundings } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import {
  botUses,
  holdsGround,
  mirrorsStance,
  onlyInterrupts,
  ownTrapBoost,
  sendsPet,
  stateGateHolds,
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
 * Mirrored Stance only at a foe with a stance to use (#1965). A shout
 * that only acts on a state waits for it (#2096): "You Will Die!" for a
 * foe below 90%, "Retreat!" for a dead ally. Holding Protector's Defense
 * (#2096), it swings only at a foe in reach and otherwise stands.
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
    const holding = holdsGround(self.combatant);
    const surroundings: Surroundings = new Map(context.participants.map((body) => [body.id, body]));
    const worthUsing = (held: Skill): boolean => {
      const on = held.target === "self" ? self.combatant : foe;
      if (on === undefined) {
        return false;
      }
      return (
        stateGateHolds(held, self.combatant, on, surroundings) ?? botUses(held).includes("offence")
      );
    };
    const castOn = (held: Skill): string =>
      held.target === "self" &&
      stateGateHolds(held, self.combatant, self.combatant, surroundings) !== undefined
        ? self.id
        : targetId;
    const skill = bar.find(
      (held) =>
        worthUsing(held) &&
        !onlyInterrupts(held) &&
        copies(held) &&
        (!sendsPet(held) || petFar) &&
        (hasStance || !mirrorsStance(held)) &&
        mayUse(held, castOn(held)) &&
        (!holding || context.check(held.id, castOn(held)).ok),
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
      return use(skill, castOn(skill));
    }
    // The weapon, from where it stands while a step would end what it holds.
    if (
      holding &&
      (target === undefined || distance(self.position, target.position) > RANGE_MELEE)
    ) {
      return { ...NOTHING, targetId };
    }
    return { ...NOTHING, targetId, attackTargetId: targetId };
  },
};

export default fight;
