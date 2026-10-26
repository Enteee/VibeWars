/**
 * What each profession's primary attribute does (#473): small pure
 * functions of the bearer's effective rank, runes included, called from
 * the seams they act on. Only a primary holds its rank, so no profession
 * check is needed.
 */

import type { Skill } from "./skills/types.js";

/** The Assassin's primary. */
export const CRITICAL_STRIKES_ATTRIBUTE = "assassin.critical-strikes";

/** Crit chance each rank of Critical Strikes adds to weapon blows. */
export const CRITICAL_STRIKES_CHANCE_PER_RANK = 0.01;

/** Energy a critical blow gives its striker: GW1's 1 / 2 / 3 at ranks 1–7 / 8–12 / 13+. */
export function criticalStrikesEnergy(rank: number): number {
  if (rank >= 13) {
    return 3;
  }
  if (rank >= 8) {
    return 2;
  }
  return rank >= 1 ? 1 : 0;
}

/** The Ranger's primary. */
export const EXPERTISE_ATTRIBUTE = "ranger.expertise";

/** Share of an energy cost each rank of Expertise takes off. */
export const EXPERTISE_COST_CUT_PER_RANK = 0.04;

/**
 * What `skill`'s energy cost comes to with this rank of Expertise (#528):
 * 4% less a rank, rounded once, never below 0, for an attack skill or any
 * Ranger skill. Any other skill's cost stands.
 */
export function expertiseEnergyCost(rank: number, skill: Skill, cost: number): number {
  if (skill.type !== "attack" && skill.profession !== "ranger") {
    return cost;
  }
  return Math.max(0, Math.round(cost * (1 - EXPERTISE_COST_CUT_PER_RANK * rank)));
}

/** The Warrior's primary. */
export const STRENGTH_ATTRIBUTE = "warrior.strength";

/** Armor penetration each rank of Strength gives an attack skill. */
export const STRENGTH_PENETRATION_PER_RANK = 0.01;

/**
 * An attack skill's armor penetration with this rank of Strength (#528):
 * 1% a rank, unless the weapon has penetration of its own, which stands
 * instead; the two do not add.
 */
export function strengthArmorPenetration(rank: number, weaponPenetration: number): number {
  return weaponPenetration > 0 ? weaponPenetration : STRENGTH_PENETRATION_PER_RANK * rank;
}
