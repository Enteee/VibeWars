import { describe, expect, it } from "vitest";

import { DEAD_DASH, DEAD_GAP, HEXAGON_SCALE, creatureOutline, dashes } from "./creature-shape.js";

describe("creatureOutline (#1162)", () => {
  it("gives a creature a pointy-top hexagon at 1.1 × its radius", () => {
    const points = creatureOutline(100, 50, 10);
    expect(points).toHaveLength(6);
    for (const point of points) {
      expect(Math.hypot(point.x - 100, point.y - 50)).toBeCloseTo(10 * HEXAGON_SCALE, 9);
    }
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(50 - 11, 9);
    expect(points.filter((p) => Math.abs(p.x - 100) < 1e-9)).toHaveLength(2);
  });
});

describe("dashes (#1162)", () => {
  it("runs the pattern on round corners, a dash every dash + gap of outline", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    const drawn = dashes(square, 3, 2);
    const total = drawn.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y), 0);
    // 20 of outline, 4 whole patterns of 5: 12 drawn.
    expect(total).toBeCloseTo(12, 9);
    // The second dash starts at 5 on the first corner, the pattern unbroken.
    expect(drawn[0]).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(drawn[1]?.[0]).toEqual({ x: 5, y: 0 });
  });

  it("keeps the study's 3 2 at radius 10", () => {
    expect([DEAD_DASH * 10, DEAD_GAP * 10]).toEqual([3, 2]);
  });
});
