import { describe, expect, it } from "vitest";

import { circleSides } from "./disc.js";

/** How far, in px, a polygon of `sides` falls inside a circle of `px` px at a side's middle. */
function sag(px: number, sides: number): number {
  return px * (1 - Math.cos(Math.PI / sides));
}

describe("circleSides", () => {
  it("gives a speck the fewest sides", () => {
    expect(circleSides(0.1, 1)).toBe(8);
    expect(circleSides(1, 1)).toBe(8);
  });

  it("gives a large circle no more sides than Phaser's own arc", () => {
    expect(circleSides(100_000, 1)).toBe(100);
  });

  it("keeps every side within a quarter pixel of the true circle", () => {
    for (const px of [3, 10, 40, 120, 300]) {
      const sides = circleSides(px, 1);
      expect(sides).toBeLessThan(100);
      expect(sag(px, sides)).toBeLessThanOrEqual(0.25);
      expect(sag(px, sides - 1)).toBeGreaterThan(0.25);
    }
  });

  it("counts radius in screen pixels, not world units", () => {
    expect(circleSides(80, 2)).toBe(circleSides(40, 1));
  });
});
