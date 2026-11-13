import { describe, expect, it } from "vitest";

import { inwardStart } from "./tutorial-start.js";

const SIZE = { width: 4400, height: 3000 };
const HALF = { x: 978, y: 550 };

describe("inwardStart (#3221)", () => {
  it("moves a start by the edge inward until half a view clears every edge", () => {
    const start = inwardStart({ x: 300, y: 1500 }, SIZE, HALF);
    expect(start.x).toBeCloseTo(HALF.x);
    expect(start.y).toBeCloseTo(1500);
  });

  it("moves along the line to the centre, by the further of two edges", () => {
    const spawn = { x: 300, y: 2900 };
    const start = inwardStart(spawn, SIZE, HALF);
    expect(start.x).toBeGreaterThanOrEqual(HALF.x - 1e-9);
    expect(start.y).toBeLessThanOrEqual(SIZE.height - HALF.y + 1e-9);
    // On the line from the spawn to the centre.
    const along = (start.x - spawn.x) / (SIZE.width / 2 - spawn.x);
    expect((start.y - spawn.y) / (SIZE.height / 2 - spawn.y)).toBeCloseTo(along);
  });

  it("leaves a start that already clears every edge where it is", () => {
    expect(inwardStart({ x: 1200, y: 1400 }, SIZE, HALF)).toEqual({ x: 1200, y: 1400 });
  });

  it("takes the centre on a map too small for half a view", () => {
    expect(inwardStart({ x: 100, y: 500 }, { width: 1600, height: 1000 }, HALF)).toEqual({
      x: 800,
      y: 500,
    });
  });
});
