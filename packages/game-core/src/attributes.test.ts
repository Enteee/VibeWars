import { describe, expect, it } from "vitest";

import {
  AttributeRankError,
  MAX_ATTRIBUTE_RANK,
  cumulativeCostForRank,
  effectiveRank,
  isAffordable,
  totalCost,
} from "./attributes.js";

describe("cumulativeCostForRank", () => {
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

  it("clamps to MAX_ATTRIBUTE_RANK rather than exceeding it", () => {
    expect(effectiveRank(MAX_ATTRIBUTE_RANK, [{ delta: 10 }])).toBe(MAX_ATTRIBUTE_RANK);
  });
});
