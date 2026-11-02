import { RANGE_MELEE } from "../../../distances.js";
import { isAttacking } from "../../../skills/attacking.js";
import { getSkill } from "../../../skills/catalog.js";
import { rankOf } from "../../../skills/tick.js";
import type { Skill, Surroundings } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import {
  blindsUser,
  botUses,
  conditionWithin,
  holdsGround,
  mirrorsStance,
  missDisablesBar,
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

/** Other skills recharging that make Oath Shot's risk worth taking (#2159). */
const GAMBLE_RECHARGING = 2;

/**
 * With a foe to fight: an offensive skill in bar order, else the weapon.
 * A copier or a stripper only at a foe with what it takes (#1928, #1954):
 * Inspired Enchantment and Mirror of Disenchantment at an enchanted one.
 * Mirrored Stance only at a foe with a stance to use (#1965). A shout
 * that only acts on a state waits for it (#2096): "You Will Die!" for a
 * foe below 90%, "Retreat!" for a dead ally. Holding Protector's Defense
 * (#2096), it swings only at a foe in reach and otherwise stands.
 * Signet of Midnight (#2132) only at a foe attacking in melee within
 * touch, and never by a bot whose own fight is its attacks. Oath Shot
 * (#2159) only past the Expertise it misses at, with two other skills
 * recharging; Screaming Shot at a foe within earshot not yet Bleeding.
 */
const fight: BotRule = {
  order: 100,
  name: "fight",
  decide: ({ context, self, bar, foes, targetId, nearestFirst, mayUse, use }) => {
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
    // Blinding itself as well (#2132) is worth it only against a melee
    // attacker at hand, and never to a bot with attack skills to use.
    const blindWorth =
      foe !== undefined &&
      target !== undefined &&
      isAttacking(foe) &&
      foe.equipment.mainHand.weapon.projectileSpeed === undefined &&
      distance(target.position, self.position) <= RANGE_MELEE &&
      !bar.some((held) => held.attack !== undefined || botUses(held).includes("boost"));
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
    // Oath Shot (#2159) only when it cannot miss for rank, with two others
    // recharging for its hit to bring back; else it is held.
    const recharging = bar.filter(
      (held) => (self.combatant.cast.rechargeRemaining.get(held.id) ?? 0) > 0,
    );
    const gambleWorth = (held: Skill): boolean => {
      const miss = held.attack?.missChanceAtOrBelowRank;
      return (
        !missDisablesBar(held) ||
        ((miss === undefined || rankOf(self.combatant, miss.attributeId) > miss.rank) &&
          recharging.filter((other) => other.id !== held.id).length >= GAMBLE_RECHARGING)
      );
    };
    // Screaming Shot (#2159) at a foe within earshot not yet Bleeding, the
    // target first; else at the target.
    const freshFoe = (held: Skill): string | undefined => {
      const within = conditionWithin(held);
      if (within === undefined) {
        return undefined;
      }
      const ordered = nearestFirst(foes.filter((foe) => foe.id !== targetId));
      return [...(target === undefined ? [] : [target]), ...ordered].find(
        (foe) =>
          !foe.combatant.statuses.has(within.statusId) &&
          distance(foe.position, self.position) <= within.radius &&
          mayUse(held, foe.id),
      )?.id;
    };
    const castOn = (held: Skill): string =>
      held.target === "self" &&
      stateGateHolds(held, self.combatant, self.combatant, surroundings) !== undefined
        ? self.id
        : (freshFoe(held) ?? targetId);
    const skill = bar.find(
      (held) =>
        worthUsing(held) &&
        gambleWorth(held) &&
        (blindWorth || !blindsUser(held)) &&
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
