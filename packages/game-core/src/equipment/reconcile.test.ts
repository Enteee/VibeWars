import { describe, expect, it } from "vitest";

import { weaponReachable } from "./reconcile.js";
import { getWeapon } from "./weapons.js";

const WARRIOR = new Set(["warrior.strength", "warrior.swordsmanship", "warrior.tactics"]);
const MESMER = new Set(["mesmer.fast-casting", "mesmer.illusion-magic"]);

describe("weaponReachable (#614)", () => {
  it("is a fixed requirement's attribute being accessible", () => {
    expect(
      weaponReachable({ kind: "fixed", attributeId: "warrior.swordsmanship", rank: 9 }, WARRIOR),
    ).toBe(true);
    expect(
      weaponReachable({ kind: "fixed", attributeId: "warrior.swordsmanship", rank: 9 }, MESMER),
    ).toBe(false);
  });

  it("is any candidate of a chosen requirement being accessible", () => {
    const from = ["warrior.tactics", "paragon.command"];
    expect(weaponReachable({ kind: "chosen", from, rank: 9 }, WARRIOR)).toBe(true);
    expect(weaponReachable({ kind: "chosen", from, rank: 9 }, MESMER)).toBe(false);
    expect(weaponReachable({ kind: "chosen", from: "any-accessible", rank: 9 }, MESMER)).toBe(true);
  });

  it("is always true for a weapon nothing governs", () => {
    const unarmed = getWeapon("unarmed");
    expect(unarmed).toBeDefined();
    if (unarmed !== undefined) {
      expect(weaponReachable(unarmed.requirement, new Set())).toBe(true);
    }
  });
});
