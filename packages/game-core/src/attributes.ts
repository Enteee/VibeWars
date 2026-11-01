/**
 * Attribute point costs and allocation (brief §5: "the exact attribute-point
 * progression should be represented as data/rules rather than scattered
 * constants").
 *
 * The cost table is GW1's, per the brief (§5, §7): the brief takes GW1's
 * game-rule numbers as reference data, and every skill's attribute scaling
 * assumes GW1's rank spreads. Ranks 8 to 12 are steep on purpose, so the
 * last ranks are a real price: 12/12/3 spends the 200-point budget exactly.
 */

/** The highest rank attribute *points* can buy. Enforced by `validateCharacter`. */
export const MAX_ATTRIBUTE_RANK = 12;

/**
 * The highest rank anything can reach once runes, headgear and temporary
 * bonuses are counted: 12 bought, 3 from a superior rune and 1 from the
 * headgear (#1140), as GW1 PvP caps it.
 *
 * Separate from the allocation cap on purpose. Clamping effective rank at
 * 12 would make every attribute rune in the game worthless — a superior
 * rune's +3 would evaporate against the ceiling, and the player would
 * have paid 75 health for nothing.
 */
export const MAX_EFFECTIVE_RANK = 16;

/**
 * Point cost to go from rank `n-1` to rank `n`, at index `n - 1`: GW1's
 * table (wiki.guildwars.com/wiki/Attribute_point). Rank 0 is free, as
 * everyone starts there. One entry per rank up to `MAX_ATTRIBUTE_RANK`.
 */
const POINT_COST_OF_RANK: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 9, 11, 13, 16, 20];

const CUMULATIVE_COST_BY_RANK: readonly number[] = (() => {
  const costs: number[] = [0];
  for (const cost of POINT_COST_OF_RANK) {
    costs.push((costs[costs.length - 1] ?? 0) + cost);
  }
  return costs;
})();

export class AttributeRankError extends RangeError {
  public override readonly name = "AttributeRankError";
}

/** Total points required to reach `rank` from 0. */
export function cumulativeCostForRank(rank: number): number {
  if (!Number.isInteger(rank) || rank < 0 || rank > MAX_ATTRIBUTE_RANK) {
    throw new AttributeRankError(
      `rank must be an integer in [0, ${String(MAX_ATTRIBUTE_RANK)}], got ${String(rank)}`,
    );
  }
  const cost = CUMULATIVE_COST_BY_RANK[rank];
  if (cost === undefined) {
    // Unreachable: the array has exactly MAX_ATTRIBUTE_RANK + 1 entries
    // (0..MAX inclusive), and `rank` was just validated into that range.
    throw new Error(`internal: no cumulative cost entry for rank ${String(rank)}`);
  }
  return cost;
}

export interface AttributeAllocation {
  readonly attributeId: string;
  readonly rank: number;
}

/** Total points spent across every allocation. Does not validate rank bounds. */
export function totalCost(allocations: readonly AttributeAllocation[]): number {
  return allocations.reduce((sum, allocation) => sum + cumulativeCostForRank(allocation.rank), 0);
}

export function isAffordable(allocations: readonly AttributeAllocation[], budget: number): boolean {
  return totalCost(allocations) <= budget;
}

/**
 * A temporary rank modifier — the seam the brief asks for ("skills
 * modifying attributes", "effects modifying attributes", §5): a status's
 * `attributeDeltas`, as weakness's −1, through `rankOf` (#762).
 * `delta` may be negative (a penalty) or positive (a bonus).
 */
export interface AttributeModifier {
  readonly delta: number;
}

/**
 * Apply temporary modifiers to a base rank, clamped to a sane range. Never
 * goes negative (a heavily-debuffed attribute still behaves like rank 0,
 * not a nonsensical negative rank) and never exceeds the rank cap even if
 * stacked bonuses would otherwise push it past what any formula downstream
 * is designed to handle.
 */
export function effectiveRank(baseRank: number, modifiers: readonly AttributeModifier[]): number {
  const total = baseRank + modifiers.reduce((sum, modifier) => sum + modifier.delta, 0);
  return Math.max(0, Math.min(MAX_EFFECTIVE_RANK, total));
}
