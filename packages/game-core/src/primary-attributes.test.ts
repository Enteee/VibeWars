import { describe, expect, it } from "vitest";

import { criticalStrikesEnergy, fastCastingMultiplier } from "./primary-attributes.js";
import { getSkill } from "./skills/catalog.js";

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

describe("fastCastingMultiplier (#527)", () => {
  const malaise = getSkill("necromancer.malaise");
  if (malaise === undefined) {
    throw new Error("catalog skill missing");
  }

  it.each([
    [0, 1],
    [12, 0.574],
    [15, 0.5],
    [16, 0.477],
  ])("at rank %i multiplies a 2 s spell by %f", (rank, multiplier) => {
    expect(fastCastingMultiplier(rank, malaise)).toBeCloseTo(multiplier, 3);
  });

  it("judges another profession's spell on its base activation", () => {
    expect(fastCastingMultiplier(12, { ...malaise, activationSeconds: 1.75 })).toBe(1);
    expect(fastCastingMultiplier(12, { ...malaise, activationSeconds: 3 })).toBeCloseTo(0.574, 3);
  });

  it("counts enchantments and plain spells, not skills", () => {
    expect(fastCastingMultiplier(12, { ...malaise, type: "enchantment" })).toBeLessThan(1);
    expect(fastCastingMultiplier(12, { ...malaise, type: "spell" })).toBeLessThan(1);
    expect(fastCastingMultiplier(12, { ...malaise, type: "skill" })).toBe(1);
  });
});
