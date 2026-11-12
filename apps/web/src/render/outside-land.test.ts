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
  OUTSIDE_CELL,
  outsideCover,
} from "./outside-land.js";
import { insideRuns } from "./cell-cover.js";

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

describe("outsideCover (#3162)", () => {
  // A slanted, notched outline inside a 600 × 400 map, off the cell grid.
  const outline = [
    { x: 30, y: 20 },
    { x: 570, y: 50 },
    { x: 560, y: 370 },
    { x: 330, y: 380 },
    { x: 300, y: 210 },
    { x: 270, y: 380 },
    { x: 40, y: 360 },
  ];
  const inside = ({ x, y }: { x: number; y: number }): boolean =>
    insideRuns(outline, "y", y).some(([from, to]) => from <= x && x <= to);
  const boxes = outsideCover(outline, 600, 400);
  const covered = (point: { x: number; y: number }): number =>
    boxes.filter(
      ({ x, y, width, height }) =>
        x <= point.x && point.x < x + width && y <= point.y && point.y < y + height,
    ).length;

  it("covers every point of the map outside the outline, once", () => {
    for (let y = 0.5; y < 400; y += 4) {
      for (let x = 0.5; x < 600; x += 4) {
        const times = covered({ x, y });
        expect(times, `${String(x)},${String(y)}`).toBe(inside({ x, y }) ? Math.min(times, 1) : 1);
      }
    }
  });

  it("leaves out the cells wholly under the floor", () => {
    expect(covered({ x: 200, y: 200 })).toBe(0);
    const area = boxes.reduce((sum, { width, height }) => sum + width * height, 0);
    expect(area).toBeLessThan(600 * 400 * 0.6);
    expect(boxes.every(({ x, y }) => x % OUTSIDE_CELL === 0 && y % OUTSIDE_CELL === 0)).toBe(true);
  });

  it("is the whole map round an outline that leaves no cell under the floor", () => {
    const sliver = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 10 },
    ];
    expect(outsideCover(sliver, 600, 400)).toEqual([{ x: 0, y: 0, width: 600, height: 400 }]);
  });
});
