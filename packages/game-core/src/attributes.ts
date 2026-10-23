/**
 * Attribute point costs and allocation (brief §5: "the exact attribute-point
 * progression should be represented as data/rules rather than scattered
 * constants").
 *
 * This is an *original* cost curve, not a reverse-engineered copy of any
 * specific game's table: a flat per-rank cost would be trivially gameable
 * (always max one attribute first), so the curve below charges
 * progressively more for each additional rank, which is the design
 * property that actually matters for build diversity — not matching a
 * specific proprietary numeric table.
 */

export const MAX_ATTRIBUTE_RANK = 12;

/**
 * Point cost to go from rank `n-1` to rank `n`. Rank 0 is free (everyone
 * starts there); each subsequent rank costs its own rank number of points,
 * so higher investment costs progressively more per rank — a standard
 * "diminishing returns" curve shape, implemented as our own formula.
 */
function pointCostOfRank(rank: number): number {
  if (rank <= 0) {
    return 0;
  }
  return rank;
}

const CUMULATIVE_COST_BY_RANK: readonly number[] = (() => {
  const costs: number[] = [0];
  for (let rank = 1; rank <= MAX_ATTRIBUTE_RANK; rank += 1) {
    const previous = costs[rank - 1] ?? 0;
    costs.push(previous + pointCostOfRank(rank));
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
 * modifying attributes", "effects modifying attributes", §5), not yet
 * populated by anything since no skill or effect exists until Sprint 10+.
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
  return Math.max(0, Math.min(MAX_ATTRIBUTE_RANK, total));
}
