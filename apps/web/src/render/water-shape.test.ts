import { pointInPolygon } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import type { MapWater } from "./arena-snapshot.js";
import {
  clipToBox,
  MAX_RIPPLES,
  outlineArea,
  RIPPLE_DRIFT,
  RIPPLE_HALF_LENGTH,
  RIPPLE_SHORE_CLEARANCE,
  rippleDrift,
  rippleSwell,
  shoreDistance,
  waterPieces,
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

describe("clipToBox (#3350)", () => {
  const BOX = { left: 0, top: 0, right: 100, bottom: 100 };
  const square = (left: number, top: number, size: number) => [
    { x: left, y: top },
    { x: left + size, y: top },
    { x: left + size, y: top + size },
    { x: left, y: top + size },
  ];

  it("keeps an outline inside the box whole", () => {
    expect(clipToBox(square(10, 10, 50), BOX)).toEqual(square(10, 10, 50));
  });

  it("is nothing of an outline outside the box", () => {
    expect(clipToBox(square(200, 10, 50), BOX)).toEqual([]);
  });

  it("cuts an outline that crosses the box at its side", () => {
    expect(outlineArea(clipToBox(square(50, 50, 100), BOX))).toBe(2500);
  });

  it("clips a concave outline to what of it is inside", () => {
    // A U: two prongs joined at the bottom, cut by the box through both.
    const u = [
      { x: 20, y: 50 },
      { x: 40, y: 50 },
      { x: 40, y: 150 },
      { x: 60, y: 150 },
      { x: 60, y: 50 },
      { x: 80, y: 50 },
      { x: 80, y: 200 },
      { x: 20, y: 200 },
    ];
    expect(outlineArea(clipToBox(u, BOX))).toBe(2000);
  });
});

describe("waterPieces (#3350)", () => {
  const RIVER: MapWater = {
    layer: 0,
    depth: "shallow",
    area: {
      kind: "polygon",
      points: [
        { x: 0, y: 300 },
        { x: 600, y: 200 },
        { x: 600, y: 400 },
        { x: 0, y: 500 },
      ],
    },
  };
  const COVERS = [
    { tunnel: 0, box: { left: 100, top: 0, right: 200, bottom: 600 } },
    { tunnel: 1, box: { left: 400, top: 100, right: 500, bottom: 700 } },
  ];

  it("is the water whole, shore and ripples, when no cover is under it", () => {
    const shape = waterShapeOf(RIVER);
    expect(waterPieces(shape, [])).toEqual([
      {
        tunnel: undefined,
        outline: shape.outline,
        shore: shape.outline.map((corner, at) => [
          corner,
          shape.outline[(at + 1) % shape.outline.length],
        ]),
        ripples: shape.ripples,
      },
    ]);
  });

  it("splits a river over two tunnels into a piece per tunnel and the rest", () => {
    const shape = waterShapeOf(RIVER);
    const pieces = waterPieces(shape, COVERS);
    const area = (tunnel: number | undefined) =>
      pieces
        .filter((piece) => piece.tunnel === tunnel)
        .reduce((sum, { outline }) => sum + outlineArea(outline), 0);
    expect(area(0)).toBeCloseTo(100 * 200);
    expect(area(1)).toBeCloseTo(100 * 200);
    expect(area(0) + area(1) + area(undefined)).toBeCloseTo(outlineArea(shape.outline));
  });

  it("gives each ripple to one piece", () => {
    const shape = waterShapeOf(RIVER);
    const ripples = waterPieces(shape, COVERS).flatMap((piece) => piece.ripples);
    expect(new Set(ripples).size).toBe(ripples.length);
    expect(ripples.length).toBe(shape.ripples.length);
  });

  it("strokes only the water's own shore, never a cut edge", () => {
    const shape = waterShapeOf(RIVER);
    for (const piece of waterPieces(shape, COVERS)) {
      for (const [a, b] of piece.shore) {
        expect(a.x === b.x && [100, 200, 400, 500].includes(a.x)).toBe(false);
      }
    }
  });

  it("gives the overlap of two covers, at a junction, to the earlier", () => {
    const shape = waterShapeOf(POND);
    const pieces = waterPieces(shape, [
      { tunnel: 0, box: { left: 100, top: 200, right: 220, bottom: 360 } },
      { tunnel: 1, box: { left: 160, top: 200, right: 340, bottom: 360 } },
    ]);
    const area = (tunnel: number | undefined) =>
      pieces
        .filter((piece) => piece.tunnel === tunnel)
        .reduce((sum, { outline }) => sum + outlineArea(outline), 0);
    expect(area(0)).toBe(120 * 160);
    expect(area(1)).toBe(120 * 160);
    expect(area(undefined)).toBe(0);
  });
});
