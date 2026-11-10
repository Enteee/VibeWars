import { pointInPolygon } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import type { MapWater } from "./arena-snapshot.js";
import {
  MAX_RIPPLES,
  RIPPLE_DRIFT,
  RIPPLE_HALF_LENGTH,
  RIPPLE_SHORE_CLEARANCE,
  rippleDrift,
  rippleSwell,
  shoreDistance,
  waterShapeOf,
} from "./water-shape.js";

const POND: MapWater = {
  layer: 0,
  depth: "deep",
  area: { kind: "rect", x: 100, y: 200, width: 240, height: 160 },
};
const TRIANGLE: MapWater = {
  layer: 1,
  depth: "shallow",
  area: {
    kind: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 300 },
    ],
  },
};

describe("waterShapeOf (#2984)", () => {
  it("traces a rect's shore corner by corner and anchors a sprite on its bounds", () => {
    const shape = waterShapeOf(POND);
    expect(shape.outline).toEqual([
      { x: 100, y: 200 },
      { x: 340, y: 200 },
      { x: 340, y: 360 },
      { x: 100, y: 360 },
    ]);
    expect(shape.anchor).toEqual({ centre: { x: 220, y: 280 }, width: 240, height: 160 });
    expect(shape).toMatchObject({ layer: 0, depth: "deep" });
  });

  it("keeps every ripple, drifted either way, inside the shore", () => {
    for (const water of [POND, TRIANGLE]) {
      const shape = waterShapeOf(water);
      expect(shape.ripples.length).toBeGreaterThan(3);
      for (const { at } of shape.ripples) {
        expect(pointInPolygon(at, shape.outline)).toBe(true);
        expect(shoreDistance(at, shape.outline)).toBeGreaterThanOrEqual(RIPPLE_SHORE_CLEARANCE);
        expect(RIPPLE_SHORE_CLEARANCE).toBeGreaterThan(RIPPLE_HALF_LENGTH + RIPPLE_DRIFT);
      }
    }
  });

  it("gives a puddle too narrow for a ripple none, and a lake no more than the cap", () => {
    const puddle = waterShapeOf({
      ...POND,
      area: { kind: "rect", x: 0, y: 0, width: 20, height: 20 },
    });
    expect(puddle.ripples).toEqual([]);
    const lake = waterShapeOf({
      ...POND,
      area: { kind: "rect", x: 0, y: 0, width: 4000, height: 4000 },
    });
    expect(lake.ripples).toHaveLength(MAX_RIPPLES);
  });

  it("starts neighbouring ripples at different points of their swell", () => {
    const seeds = waterShapeOf(POND).ripples.map((ripple) => ripple.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe("ripple phase (#2984)", () => {
  const [ripple] = waterShapeOf(POND).ripples;
  if (ripple === undefined) {
    throw new Error("the pond has ripples");
  }

  it("swells between 0 and 1 and drifts no further than RIPPLE_DRIFT", () => {
    for (let seconds = 0; seconds < 10; seconds += 0.37) {
      expect(rippleSwell(ripple, seconds, false)).toBeGreaterThanOrEqual(0);
      expect(rippleSwell(ripple, seconds, false)).toBeLessThanOrEqual(1);
      expect(Math.abs(rippleDrift(ripple, seconds, false))).toBeLessThanOrEqual(RIPPLE_DRIFT);
    }
  });

  it("moves with render time", () => {
    expect(rippleSwell(ripple, 1, false)).not.toBeCloseTo(rippleSwell(ripple, 0, false));
  });

  it("holds still under reduced motion", () => {
    expect(rippleSwell(ripple, 7.3, true)).toBe(rippleSwell(ripple, 0, true));
    expect(rippleDrift(ripple, 7.3, true)).toBe(rippleDrift(ripple, 0, true));
  });
});
