import { describe, expect, it } from "vitest";

import { criticalStrikesEnergy } from "./primary-attributes.js";

describe("criticalStrikesEnergy (#606)", () => {
  it.each([
    [0, 0],
    [1, 1],
    [7, 1],
    [8, 2],
    [12, 2],
    [13, 3],
    [16, 3],
  ])("gives %i ranks %i energy a crit", (rank, energy) => {
    expect(criticalStrikesEnergy(rank)).toBe(energy);
  });
});
