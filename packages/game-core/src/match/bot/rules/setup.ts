import { energyCostOf } from "../../../skills/activation.js";
import { isAttacking } from "../../../skills/attacking.js";
import { getSkill } from "../../../skills/catalog.js";
import { getStatusDefinition, type StatusId } from "../../../skills/status.js";
import { isSpell, type Combatant, type Skill } from "../../../skills/types.js";
import { setupOf, type Setup } from "../skill-intent.js";
import { healthFraction } from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";
import { retreatsFrom } from "./way-out.js";

/** An enchantment at least this dear is worth Air of Enchantment first (#1975). */
const AIR_WORTH_ENERGY = 10;

/** Party members hitting enchanted foes that make Order of Apostasy worth it (#1975). */
const ORDER_HITTERS = 2;

/** Above this share of its own Health, a bot may pay Order of Apostasy's price (#1975). */
const ORDER_HEALTH_FRACTION = 0.5;

/** Energy a bot keeps for Dark Apostasy's price before casting it (#1975). */
const DARK_APOSTASY_ENERGY = 10;

/** Below this share of its maximum Energy, Ether Prodigy is worth it (#1984). */
const PRODIGY_ENERGY_FRACTION = 0.25;

/** Health above this many times its maximum Energy pays Ether Prodigy's end (#1984). */
const PRODIGY_HEALTH_PER_ENERGY = 2;

/** Enchantments on itself that make Ether Renewal worth it (#1984). */
const RENEWAL_ENCHANTMENTS = 2;

/** Off-hand and dual attacks on the bar that make Way of the Empty Palm worth it (#2134). */
const FREE_CHAIN_ATTACKS = 2;

/** Other non-attack skills of its profession that make Deadly Paradox worth it (#2134). */
const HASTE_SKILLS = 2;

/** Above this much Energy, Marksman's Wager is worth its price on a miss (#2159). */
const WAGER_ENERGY = 10;

/** Whether `combatant` stands in a stance that blocks (#2159), as Marksman's Wager's misses. */
function inBlockStance(combatant: Combatant): boolean {
  return combatant.statuses.active.some(({ id }) => {
    const status = getStatusDefinition(id);
    return status.category === "stance" && status.block !== undefined;
  });
}

/** The setups on its bar (#1975), each with what it sets up. */
function setupsOf(bar: readonly Skill[]) {
  return bar.flatMap((skill) => {
    const found = setupOf(skill);
    return found === undefined ? [] : [{ skill, ...found }];
  });
}

/**
 * Air of Enchantment (#1975) on the ally a dear enchantment is for,
 * before it, unless that ally already bears one.
 */
export function airFirst(
  { context, self, bar, mayUse }: RuleContext,
  enchantment: Skill,
  castOn: string,
): Skill | undefined {
  if (
    enchantment.type !== "enchantment" ||
    enchantment.area !== undefined ||
    energyCostOf(enchantment, self.combatant) < AIR_WORTH_ENERGY
  ) {
    return undefined;
  }
  const bears = (statusId: StatusId): boolean =>
    context.participants.find((other) => other.id === castOn)?.combatant.statuses.has(statusId) ??
    false;
  return setupsOf(bar).find(
    ({ skill, setup, statusId }) =>
      setup === "cheaper-enchantments" && !bears(statusId) && mayUse(skill, castOn),
  )?.skill;
}

/** Whether `skill` puts `statusId` on its target (#2134), as Blinding Surge's Blind. */
function applies(skill: Skill, statusId: StatusId): boolean {
  return skill.effects.some(
    (effect) => effect.kind === "apply-status" && effect.statusId === statusId,
  );
}

/**
 * A setup on itself the fight calls for (#1975): Dark Apostasy at an
 * enchanted foe with Energy for its price, Order of Apostasy while the
 * party hits enchanted foes and it has Health for its price. Way of the
 * Empty Palm before a chain of free attacks; Deadly Paradox while one of
 * its profession's other non-attack skills recharges; Unseen Fury at a
 * Blinded foe, or with a blind ready (#2134). The Elementalist's (#1984):
 * a conjure only for the element it wields; Ether Prodigy short of Energy,
 * with Health for its end; Ether Renewal under two enchantments with a
 * spell ready; Elemental Attunement kept up. The Ranger's (#2159):
 * Disrupting Accuracy kept up while it attacks; Marksman's Wager kept up
 * above 10 Energy, never at a foe in a block stance nor while Blinded;
 * Storm Chaser on retreat, or while a foe casts an Elementalist skill at
 * it.
 */
const setup: BotRule = {
  order: 95,
  name: "setup",
  decide: ({ self, bar, foes, allies, targetId, mayUse, use }) => {
    if (targetId === undefined) {
      return undefined;
    }
    const chainAttacks = bar.filter(
      (held) => held.attack?.chain !== undefined && held.attack.chain.role !== "lead",
    ).length;
    const hastened = (skill: Skill): readonly Skill[] =>
      bar.filter(
        (held) =>
          held.id !== skill.id && held.type !== "attack" && held.profession === skill.profession,
      );
    const recharging = (held: Skill): boolean =>
      (self.combatant.cast.rechargeRemaining.get(held.id) ?? 0) > 0;
    const target = foes.find((other) => other.id === targetId)?.combatant;
    const blinded = target?.statuses.has("blind") ?? false;
    const blindReady = bar.some((held) => applies(held, "blind") && mayUse(held, targetId));
    const enchanted = (id: string | undefined): boolean =>
      foes.some(
        (other) => other.id === id && other.combatant.statuses.countByCategory("enchantment") > 0,
      );
    const hitters = allies.filter((member) => enchanted(member.combatant.attack?.targetId)).length;
    const { combatant } = self;
    const wanted = (setup: Setup, statusId: StatusId, skill: Skill): boolean => {
      switch (setup) {
        case "cheaper-enchantments":
          return false;
        case "critical-strips":
          return enchanted(targetId) && combatant.energy >= DARK_APOSTASY_ENERGY;
        case "party-strips":
          return hitters >= ORDER_HITTERS && healthFraction(self) > ORDER_HEALTH_FRACTION;
        case "weapon-element":
          return (
            getStatusDefinition(statusId).onAttackHit?.weaponDamage ===
            combatant.equipment.mainHand.damageType
          );
        case "energy-for-health":
          return (
            combatant.energy < PRODIGY_ENERGY_FRACTION * combatant.maxEnergy &&
            combatant.health > PRODIGY_HEALTH_PER_ENERGY * combatant.maxEnergy
          );
        case "spell-gains":
          return (
            combatant.statuses.countByCategory("enchantment") >= RENEWAL_ENCHANTMENTS &&
            bar.some(
              (held) => isSpell(held.type) && setupOf(held) === undefined && mayUse(held, targetId),
            )
          );
        case "elemental-ranks":
          return true;
        case "free-chain":
          return chainAttacks >= FREE_CHAIN_ATTACKS;
        case "profession-haste":
          return hastened(skill).length >= HASTE_SKILLS && hastened(skill).some(recharging);
        case "blind-unblock":
          return blinded || blindReady;
        case "critical-interrupts":
          return isAttacking(combatant);
        case "hit-wager":
          return (
            combatant.energy > WAGER_ENERGY &&
            !combatant.statuses.has("blind") &&
            target !== undefined &&
            !inBlockStance(target)
          );
        case "elemental-energy":
          return (
            retreatsFrom(self, foes) !== undefined ||
            foes.some(({ combatant: foe }) => {
              const cast = foe.cast.activeCast;
              return (
                cast?.targetId === self.id && getSkill(cast.skillId)?.profession === "elementalist"
              );
            })
          );
      }
    };
    const found = setupsOf(bar).find(
      ({ skill, setup, statusId }) =>
        !combatant.statuses.has(statusId) &&
        wanted(setup, statusId, skill) &&
        mayUse(skill, self.id),
    );
    return found === undefined ? undefined : use(found.skill, self.id);
  },
};

export default setup;
