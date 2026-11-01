import { describe, expect, it } from "vitest";

import { resolveMagnitude, statAt } from "./scaling.js";
import { makeCombatant } from "./testing.js";

function casterWithRank(attributeId: string, rank: number) {
  return makeCombatant({ id: "c", attributeRanks: new Map([[attributeId, rank]]) });
}

describe("resolveMagnitude", () => {
  it("returns a flat magnitude unchanged", () => {
    expect(resolveMagnitude({ flat: 42 }, makeCombatant({ id: "c" }))).toBe(42);
  });

  it("returns the rank-0 value for an unallocated attribute", () => {
    const caster = makeCombatant({ id: "c" });
    const magnitude = { scaling: { attributeId: "x", atZero: 20, atTwelve: 60 } };
    expect(resolveMagnitude(magnitude, caster)).toBe(20);
  });

  it("returns the rank-12 value at rank 12", () => {
    const caster = casterWithRank("x", 12);
    const magnitude = { scaling: { attributeId: "x", atZero: 20, atTwelve: 60 } };
    expect(resolveMagnitude(magnitude, caster)).toBe(60);
  });

  it("interpolates linearly in between", () => {
    const caster = casterWithRank("x", 6);
    const magnitude = { scaling: { attributeId: "x", atZero: 20, atTwelve: 60 } };
    expect(resolveMagnitude(magnitude, caster)).toBe(40);
  });

  it("extrapolates along the same slope past rank 12", () => {
    const caster = casterWithRank("x", 15);
    const magnitude = { scaling: { attributeId: "x", atZero: 20, atTwelve: 60 } };
    // slope = 40/12; at rank 15 -> 20 + 50 = 70
    expect(resolveMagnitude(magnitude, caster)).toBe(70);
  });

  it("rounds to a whole number", () => {
    const caster = casterWithRank("x", 5);
    const magnitude = { scaling: { attributeId: "x", atZero: 7, atTwelve: 91 } };
    // 7 + (84/12)*5 = 42 exactly; use a messier pair to prove rounding
    expect(Number.isInteger(resolveMagnitude(magnitude, caster))).toBe(true);
    const messy = { scaling: { attributeId: "x", atZero: 1, atTwelve: 16 } };
    expect(Number.isInteger(resolveMagnitude(messy, caster))).toBe(true);
  });

  it("handles a descending scale (higher rank = lower value)", () => {
    const caster = casterWithRank("x", 12);
    const magnitude = { scaling: { attributeId: "x", atZero: 50, atTwelve: 14 } };
    expect(resolveMagnitude(magnitude, caster)).toBe(14);
  });

  it("matches the real imported Fireball numbers at rank 12", () => {
    // elementalist.fireball: "7...91...112" -> 91 at rank 12.
    const caster = casterWithRank("elementalist.fire-magic", 12);
    const magnitude = {
      scaling: { attributeId: "elementalist.fire-magic", atZero: 7, atTwelve: 91 },
    };
    expect(resolveMagnitude(magnitude, caster)).toBe(91);
  });
});

describe("statAt (#1976)", () => {
  const frenzy = { scaling: { attributeId: "warrior.strength", atZero: 2, atTwelve: 1.6 } };

  it("gives a flat stat back as it is", () => {
    expect(statAt(27, new Map([["warrior.strength", 3]]))).toBe(27);
  });

  it("gives a scaled one at the ranks, unrounded", () => {
    expect(statAt(frenzy, new Map([["warrior.strength", 12]]))).toBeCloseTo(1.6, 10);
    expect(statAt(frenzy, new Map([["warrior.strength", 0]]))).toBe(2);
    expect(statAt(frenzy, new Map([["warrior.strength", 6]]))).toBeCloseTo(1.8, 10);
  });
});
