import { OUTSIDE_KINDS, type OutsideKind } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import {
  OUTSIDE_LOOK,
  OUTSIDE_MARGIN,
  OUTSIDE_TILE,
  type OutsidePainter,
  offsetOutline,
  outsideFrame,
  paintOutsideEdge,
  paintOutsideTile,
  wrapped,
  insideRuns,
} from "./outside-land.js";

/** Every colour `kind`'s tile fills with, and how many shapes it draws. */
function tile(kind: OutsideKind): { readonly fills: Set<number>; readonly shapes: number } {
  const fills = new Set<number>();
  let shapes = 0;
  const count = (): void => {
    shapes += 1;
  };
  const painter: OutsidePainter = {
    fillStyle: (colour) => fills.add(colour),
    lineStyle: () => undefined,
    fillRect: count,
    fillCircle: count,
    fillEllipse: count,
    strokeEllipse: count,
    fillTriangle: count,
    lineBetween: count,
  };
  paintOutsideTile(painter, kind);
  return { fills, shapes };
}

/** Friend blue, danger orange and acid green: signals the outside never fills with. */
const SIGNALS = [0x59c2ff, 0xff7a30, 0xb8e05a];

describe("outside land", () => {
  it.each(OUTSIDE_KINDS)("paints %s with grain over its base, never a flat slab", (kind) => {
    const { fills, shapes } = tile(kind);
    expect(fills.has(OUTSIDE_LOOK[kind].base)).toBe(true);
    expect(fills.size).toBeGreaterThan(2);
    expect(shapes).toBeGreaterThan(300);
    for (const signal of SIGNALS) {
      expect(fills.has(signal)).toBe(false);
    }
  });

  it("paints a body near a tile's side again a tile away, so the tile repeats without a seam", () => {
    const at: { x: number; y: number }[] = [];
    wrapped({ x: 4, y: 128 }, 10, (here) => at.push(here));
    expect(at).toEqual([
      { x: 4, y: 128 },
      { x: 4 + OUTSIDE_TILE, y: 128 },
    ]);
  });

  it("moves an outline outward or inward whichever way it is wound", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(offsetOutline(square, 10)[0]).toEqual({ x: -10, y: -10 });
    expect(offsetOutline([...square].reverse(), 10)[3]).toEqual({ x: -10, y: -10 });
    expect(offsetOutline(square, -10)[2]).toEqual({ x: 90, y: 90 });
  });

  it("draws every kind's edge with the ground's line last, inside the outline", () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    for (const kind of OUTSIDE_KINDS) {
      const traced: { colour: number; first: { x: number; y: number } | undefined }[] = [];
      let colour = 0;
      paintOutsideEdge(
        {
          lineStyle: (_, next) => {
            colour = next;
          },
          strokeOutline: (points) => traced.push({ colour, first: points[0] }),
        },
        kind,
        outline,
      );
      const last = traced.at(-1)?.first;
      expect(traced.length).toBeGreaterThan(1);
      expect(last !== undefined && last.x >= 0 && last.y >= 0).toBe(true);
    }
  });

  it("frames the map's rectangle out to the margin without overlapping it", () => {
    const frame = outsideFrame(400, 300);
    const area = frame.reduce((sum, band) => sum + band.width * band.height, 0);
    expect(area).toBe((400 + 2 * OUTSIDE_MARGIN) * (300 + 2 * OUTSIDE_MARGIN) - 400 * 300);
  });
});

describe("insideRuns", () => {
  /** An L: the square 0..200 without its south-east quarter. */
  const ell = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ];

  it("clips a grid line to the spans of it inside the outline", () => {
    expect(insideRuns(ell, "y", 50)).toEqual([[0, 200]]);
    expect(insideRuns(ell, "y", 150)).toEqual([[0, 100]]);
    expect(insideRuns(ell, "x", 150)).toEqual([[0, 100]]);
  });

  it("gives a concave outline's line one span per stretch inside", () => {
    const u = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 200 },
      { x: 200, y: 200 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ];
    expect(insideRuns(u, "y", 150)).toEqual([
      [0, 100],
      [200, 300],
    ]);
  });

  it("gives none for a line wholly outside", () => {
    expect(insideRuns(ell, "y", 250)).toEqual([]);
  });
});
