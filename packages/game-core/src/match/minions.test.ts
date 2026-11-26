import { describe, expect, it } from "vitest";

import { minionCap, minionDegenerationPips } from "./minions.js";

describe("minion rules (#467)", () => {
  it("caps a master at 2 + half its Death Magic, rounded down", () => {
    expect([0, 1, 12, 15].map(minionCap)).toEqual([2, 2, 8, 9]);
  });

  it("rots 1 pip at once and 1 more every 20 seconds", () => {
    expect(minionDegenerationPips(0)).toBe(-1);
    expect(minionDegenerationPips(19.99)).toBe(-1);
    expect(minionDegenerationPips(20)).toBe(-2);
    expect(minionDegenerationPips(60)).toBe(-4);
    let age = 0;
    for (let i = 0; i < 400; i += 1) {
      age += 0.05;
    }
    expect(minionDegenerationPips(age)).toBe(-2);
  });
});
