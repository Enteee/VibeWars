import { MAX_ATTRIBUTE_RANK } from "../attributes.js";

import { rankOf } from "./tick.js";
import type { AttributeScaling, Combatant, Magnitude } from "./types.js";

/**
 * Resolve a `Magnitude` to a concrete number for a given caster.
 *
 * Attribute scaling interpolates linearly from the rank-0 value to the
 * rank-12 value and continues along the same slope past rank 12 (ranks
 * above 12 are reachable via temporary bonuses — see
 * `attributes.ts`'s `effectiveRank`). Results are rounded to whole
 * numbers: health, damage and energy are integers in this game, and
 * rounding once here keeps that invariant in one place instead of at
 * every call site. The caster's rank is `rankOf`'s: weakness scales a
 * skill one rank lower (#762).
 */
export function resolveMagnitude(magnitude: Magnitude, caster: Combatant): number {
  if ("flat" in magnitude) {
    return magnitude.flat;
  }
  return Math.round(scaledAt(magnitude, (attributeId) => rankOf(caster, attributeId)));
}

/**
 * The same resolution, from attribute ranks alone.
 *
 * The build editor needs to show what a skill will actually do at the
 * ranks the player has allocated, and it has no `Combatant` to hand. It
 * must not reimplement the curve: a second copy is how an editor comes to
 * promise 91 damage while the simulation deals 78.
 */
export function resolveMagnitudeAtRanks(
  magnitude: Magnitude,
  ranks: ReadonlyMap<string, number>,
): number {
  if ("flat" in magnitude) {
    return magnitude.flat;
  }
  return Math.round(scaledAt(magnitude, (attributeId) => ranks.get(attributeId) ?? 0));
}

/**
 * `magnitude` for the caster, times `factor`, rounded once, after (#1614):
 * Aura of Restoration's 360% of a spell's cost is 18 for 5 energy, where
 * rounding the 3.6 first would make it 20.
 */
export function resolveMagnitudeTimes(
  magnitude: Magnitude,
  caster: Combatant,
  factor: number,
): number {
  if ("flat" in magnitude) {
    return Math.round(magnitude.flat * factor);
  }
  return Math.round(scaledAt(magnitude, (attributeId) => rankOf(caster, attributeId)) * factor);
}

/**
 * The curve itself: `scaling` at `rank`, rounded. The tooltip's scale
 * hint prints its ends through this too, so "…8 at 12" is what rank 12
 * deals rather than the raw 8.2 the curve is written with.
 */
export function magnitudeAtRank(
  scaling: Pick<AttributeScaling, "atZero" | "atTwelve">,
  rank: number,
): number {
  return Math.round(curveAt(scaling, rank));
}

/** The curve, unrounded. */
function curveAt(scaling: Pick<AttributeScaling, "atZero" | "atTwelve">, rank: number): number {
  const slope = (scaling.atTwelve - scaling.atZero) / MAX_ATTRIBUTE_RANK;
  return scaling.atZero + slope * rank;
}

/**
 * A scaled magnitude at the rank `rankFor` gives its attribute, unrounded.
 * A `byLevel` one takes the level whole first, as GW1 does (#1899).
 */
function scaledAt(
  magnitude: Exclude<Magnitude, { readonly flat: number }>,
  rankFor: (attributeId: string) => number,
): number {
  if ("byLevel" in magnitude) {
    const { level, atLevelZero, perLevel } = magnitude.byLevel;
    return atLevelZero + perLevel * magnitudeAtRank(level, rankFor(level.attributeId));
  }
  return curveAt(magnitude.scaling, rankFor(magnitude.scaling.attributeId));
}
