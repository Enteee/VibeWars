import { MAX_ATTRIBUTE_RANK } from "../attributes.js";

import type { Combatant, Magnitude } from "./types.js";

/**
 * Resolve a `Magnitude` to a concrete number for a given caster.
 *
 * Attribute scaling interpolates linearly from the rank-0 value to the
 * rank-12 value and continues along the same slope past rank 12 (ranks
 * above 12 are reachable via temporary bonuses — see
 * `attributes.ts`'s `effectiveRank`). Results are rounded to whole
 * numbers: health, damage and energy are integers in this game, and
 * rounding once here keeps that invariant in one place instead of at
 * every call site.
 */
export function resolveMagnitude(magnitude: Magnitude, caster: Combatant): number {
  if ("flat" in magnitude) {
    return magnitude.flat;
  }
  const { attributeId, atZero, atTwelve } = magnitude.scaling;
  const rank = caster.attributeRanks.get(attributeId) ?? 0;
  const slope = (atTwelve - atZero) / MAX_ATTRIBUTE_RANK;
  return Math.round(atZero + slope * rank);
}
