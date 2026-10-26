/**
 * What each profession's primary attribute does (#473): small pure
 * functions of the bearer's effective rank, runes included, called from
 * the seams they act on. Only a primary holds its rank, so no profession
 * check is needed.
 */

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
