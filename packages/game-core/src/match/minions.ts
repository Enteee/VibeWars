/**
 * Minions (#467 child 3): the rules every minion shares, pure. A minion
 * rises from a corpse, rots from the moment it rises, and one master holds
 * only so many.
 */

/** The attribute GW1 ties every minion cap to (fandom "Minion master"). */
export const MINION_CAP_ATTRIBUTE = "necromancer.death-magic";

/** How many minions one master holds: 2 + ⌊rank / 2⌋ (fandom "Minion master"). */
export function minionCap(rank: number): number {
  return 2 + Math.floor(rank / 2);
}

/** Seconds per extra pip of a minion's degeneration (fandom "Minion"). */
export const MINION_DEGENERATION_STEP_SECONDS = 20;

/**
 * A minion's own degeneration after `ageSeconds` alive, in pips (≤ −1):
 * −1 at once, one more every 20 s. Summed with its statuses' pips before
 * the ±MAX_PIPS clamp, as natural regeneration is, so it can outweigh
 * any regeneration while the net still stops at −10.
 */
export function minionDegenerationPips(ageSeconds: number): number {
  // Within a hair, as `PIP_EPSILON` is: 400 additions of 0.05 fall just
  // short of 20.
  return -(1 + Math.floor((ageSeconds + 1e-6) / MINION_DEGENERATION_STEP_SECONDS));
}
