import { RANGE_MELEE } from "../../../distances.js";
import { isAttacking } from "../../../skills/attacking.js";
import { getSkill } from "../../../skills/catalog.js";
import { rankOf } from "../../../skills/tick.js";
import type { Skill, Surroundings } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import { isGhostId } from "../../ghost.js";
import {
  blindsUser,
  botUses,
  conditionWithin,
  holdsGround,
  isSpikeSkill,
  mirrorsStance,
  missDisablesBar,
  onlyInterrupts,
  ownTrapBoost,
  sendsPet,
  stateGateHolds,
  takenOffFoe,
} from "../skill-intent.js";
import {
  NOTHING,
  SPIKE_FINISH_FRACTION,
  SPIKE_HOLD_MAX_SECONDS,
  healthFraction,
  spikeLands,
  spikeSeconds,
} from "./shared.js";
import type { BotRule } from "./types.js";

/** A pet at least this far from the foe is worth sending to it (#1966): Strike as One. */
const PET_SEND_UNITS = 300;

/** Other skills recharging that make Oath Shot's risk worth taking (#2159). */
const GAMBLE_RECHARGING = 2;

/** How much later than its teammates' a spike skill may land and still fire with them (#2631): rounding. */
const SPIKE_TOLERANCE = 1e-6;

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
 * A spike skill at the team's target waits for the spike (#2631): until
 * enough of the team's damage dealers could fire with it, the target is
 * low enough to finish, or it has waited `SPIKE_HOLD_MAX_SECONDS`;
 * meanwhile the bot casts its other skills and swings. A ready spike
 * fires so the hits land together: the slowest skill at once, a faster
 * one the difference later.
 */
const fight: BotRule = {
  order: 100,
  name: "fight",
  decide: ({
    context,
    self,
    bar,
    foes,
    allies,
    role,
    targetId,
    nearestFirst,
    mayUse,
    use,
    cursor,
  }) => {
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
    // A healer with an ally to cover fights from the post `position` keeps
    // it on, never walking in: a step in, a step back is the dance of #2615.
    const covering = role === "healer" && allies.some((ally) => ally.id !== self.id);
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
    // The team's target is `play-build`'s: a guard's own, or a ghost on
    // the altar (#2600), is fought as it comes.
    if (cursor.spikeTargetId !== targetId) {
      cursor.spikeTargetId = undefined;
      cursor.spikeHeldSeconds = 0;
      cursor.spikeReadySeconds = undefined;
    }
    // Read once a think, when it first weighs a spike skill.
    const spike: { read: boolean; lands: number | undefined } = { read: false, lands: undefined };
    const holdsSpike = (held: Skill): boolean => {
      if (role === undefined || isGhostId(targetId) || target === undefined) {
        return false;
      }
      if (
        !isSpikeSkill(held) ||
        castOn(held) !== targetId ||
        healthFraction(target) < SPIKE_FINISH_FRACTION ||
        cursor.spikeHeldSeconds >= SPIKE_HOLD_MAX_SECONDS
      ) {
        return false;
      }
      if (!spike.read) {
        spike.read = true;
        spike.lands = spikeLands(allies, target, cursor.spikeReadySeconds ?? 0);
        cursor.spikeReadySeconds =
          spike.lands === undefined ? undefined : (cursor.spikeReadySeconds ?? 0);
      }
      const holds =
        spike.lands === undefined ||
        spike.lands > spikeSeconds(held, self, target) + SPIKE_TOLERANCE;
      if (holds) {
        cursor.spikeTargetId = targetId;
      }
      return holds;
    };
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
        (!(holding || covering) || context.check(held.id, castOn(held)).ok) &&
        !holdsSpike(held),
    );
    if (!spike.read || (skill !== undefined && isSpikeSkill(skill))) {
      cursor.spikeReadySeconds = undefined;
    }
    if (skill !== undefined && isSpikeSkill(skill)) {
      cursor.spikeTargetId = undefined;
      cursor.spikeHeldSeconds = 0;
    }
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
    // The weapon, from where it stands while a step would end what it holds
    // or take a healer off its post.
    const reach = holding ? RANGE_MELEE : self.combatant.equipment.mainHand.weapon.range;
    if (
      (holding || covering) &&
      (target === undefined || distance(self.position, target.position) > reach)
    ) {
      return { ...NOTHING, targetId };
    }
    return { ...NOTHING, targetId, attackTargetId: targetId };
  },
};

export default fight;
