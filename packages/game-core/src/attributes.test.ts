import { describe, expect, it } from "vitest";

import {
  AttributeRankError,
  MAX_ATTRIBUTE_RANK,
  cumulativeCostForRank,
  MAX_EFFECTIVE_RANK,
  effectiveRank,
  isAffordable,
  totalCost,
} from "./attributes.js";

describe("cumulativeCostForRank", () => {
  it("is GW1's table: rank 12 costs 97 points", () => {
    const table = Array.from({ length: MAX_ATTRIBUTE_RANK + 1 }, (_, rank) =>
      cumulativeCostForRank(rank),
    );
    expect(table).toEqual([0, 1, 3, 6, 10, 15, 21, 28, 37, 48, 61, 77, 97]);
  });

  it("costs nothing to stay at rank 0", () => {
    expect(cumulativeCostForRank(0)).toBe(0);
  });

  it("is strictly increasing with rank", () => {
    let previous = cumulativeCostForRank(0);
    for (let rank = 1; rank <= MAX_ATTRIBUTE_RANK; rank += 1) {
      const cost = cumulativeCostForRank(rank);
      expect(cost).toBeGreaterThan(previous);
      previous = cost;
    }
  });

  it("charges progressively more per additional rank (diminishing returns)", () => {
    const deltaLow = cumulativeCostForRank(2) - cumulativeCostForRank(1);
    const deltaHigh =
      cumulativeCostForRank(MAX_ATTRIBUTE_RANK) - cumulativeCostForRank(MAX_ATTRIBUTE_RANK - 1);
    expect(deltaHigh).toBeGreaterThan(deltaLow);
  });

  it("rejects a rank above the maximum", () => {
    expect(() => cumulativeCostForRank(MAX_ATTRIBUTE_RANK + 1)).toThrow(AttributeRankError);
  });

  it("rejects a negative rank", () => {
    expect(() => cumulativeCostForRank(-1)).toThrow(AttributeRankError);
  });

  it("rejects a non-integer rank", () => {
    expect(() => cumulativeCostForRank(3.5)).toThrow(AttributeRankError);
  });
});

describe("totalCost", () => {
  it("is zero for no allocations", () => {
    expect(totalCost([])).toBe(0);
  });

  it("sums the cumulative cost of every allocation", () => {
    const expected = cumulativeCostForRank(5) + cumulativeCostForRank(3);
    expect(
      totalCost([
        { attributeId: "a", rank: 5 },
        { attributeId: "b", rank: 3 },
      ]),
    ).toBe(expected);
  });
});

describe("isAffordable", () => {
  it("is true when the budget covers the cost exactly", () => {
    const allocations = [{ attributeId: "a", rank: 5 }];
    expect(isAffordable(allocations, totalCost(allocations))).toBe(true);
  });

  it("is false when the budget falls one point short", () => {
    const allocations = [{ attributeId: "a", rank: 5 }];
    expect(isAffordable(allocations, totalCost(allocations) - 1)).toBe(false);
  });

  it("is true for an empty allocation against a zero budget", () => {
    expect(isAffordable([], 0)).toBe(true);
  });

  it("buys GW1's classic splits out of 200: 12/12/3 exactly, not 12/12/4; 10/10/10 leaves 17", () => {
    const split = (...ranks: number[]) =>
      ranks.map((rank, index) => ({ attributeId: String(index), rank }));
    expect(totalCost(split(12, 12, 3))).toBe(200);
    expect(isAffordable(split(12, 12, 4), 200)).toBe(false);
    expect(200 - totalCost(split(10, 10, 10))).toBe(17);
  });
});

describe("effectiveRank", () => {
  it("returns the base rank unmodified with no modifiers", () => {
    expect(effectiveRank(8, [])).toBe(8);
  });

  it("sums multiple modifiers", () => {
    expect(effectiveRank(8, [{ delta: 2 }, { delta: -1 }])).toBe(9);
  });

  it("clamps to 0 rather than going negative", () => {
    expect(effectiveRank(2, [{ delta: -10 }])).toBe(0);
  });

  it("clamps to MAX_EFFECTIVE_RANK, above what points alone can buy", () => {
    // Deliberately higher than MAX_ATTRIBUTE_RANK: clamping effective
    // rank at the allocation cap would make every attribute rune in the
    // game worthless, since a superior rune's +3 would evaporate against
    // the ceiling after the player had already paid 75 health for it.
    expect(effectiveRank(MAX_ATTRIBUTE_RANK, [{ delta: 10 }])).toBe(MAX_EFFECTIVE_RANK);
    expect(MAX_EFFECTIVE_RANK).toBeGreaterThan(MAX_ATTRIBUTE_RANK);
  });

  it("still refuses to go negative, however heavy the penalty", () => {
    expect(effectiveRank(2, [{ delta: -50 }])).toBe(0);
  });
});
