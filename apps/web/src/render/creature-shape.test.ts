import { describe, expect, it } from "vitest";

import { DEAD_DASH, DEAD_GAP, HEXAGON_SCALE, creatureOutline, dashes } from "./creature-shape.js";

describe("creatureOutline (#1162)", () => {
  it("gives a minion or spirit a pointy-top hexagon at 1.1 × its radius, whatever its facing", () => {
    for (const look of ["bone-minion", "bone-horror", "spirit"] as const) {
      const points = creatureOutline(look, 100, 50, 10, 1.3);
      expect(points).toHaveLength(6);
      for (const point of points) {
        expect(Math.hypot(point.x - 100, point.y - 50)).toBeCloseTo(10 * HEXAGON_SCALE, 9);
      }
      expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(50 - 11, 9);
      expect(points.filter((p) => Math.abs(p.x - 100) < 1e-9)).toHaveLength(2);
    }
  });

  it("points a pet's teardrop along its facing, 1.45 × its radius out, its back round", () => {
    const facing = Math.PI / 2;
    const [tip, ...back] = creatureOutline("beast", 100, 50, 10, facing);
    expect(tip?.x).toBeCloseTo(100, 9);
    expect(tip?.y).toBeCloseTo(64.5, 9);
    for (const point of back) {
      expect(Math.hypot(point.x - 100, point.y - 50)).toBeCloseTo(10, 9);
    }
    // The back is behind it: nothing past the sides toward the tip.
    expect(Math.max(...back.map((p) => p.y))).toBeCloseTo(55, 9);
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
