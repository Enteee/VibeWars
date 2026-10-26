/**
 * What each profession's primary attribute does (#473): small pure
 * functions of the bearer's effective rank, runes included, called from
 * the seams they act on. Only a primary holds its rank, so no profession
 * check is needed.
 */

import { isSpell, type Skill } from "./skills/types.js";

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

/** The Mesmer's primary. */
export const FAST_CASTING_ATTRIBUTE = "mesmer.fast-casting";

/** A non-Mesmer spell this slow or slower is sped up by Fast Casting too. */
export const FAST_CASTING_MIN_FOREIGN_ACTIVATION_SECONDS = 2;

/**
 * What Fast Casting multiplies this spell's activation by, GW1's
 * 2^(−rank/15): ×0.574 at rank 12, still shrinking above it. Every Mesmer
 * spell, and another profession's whose base activation is 2 s or more;
 * 1 for anything else, non-spells included.
 */
export function fastCastingMultiplier(rank: number, skill: Skill): number {
  if (!isSpell(skill.type)) {
    return 1;
  }
  if (
    skill.profession !== "mesmer" &&
    skill.activationSeconds < FAST_CASTING_MIN_FOREIGN_ACTIVATION_SECONDS
  ) {
    return 1;
  }
  return 2 ** (-rank / 15);
}
