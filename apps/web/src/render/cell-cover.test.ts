import { describe, expect, it } from "vitest";

import { boxMeets, coverBoxes, insideRuns } from "./cell-cover.js";

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

describe("coverBoxes (#3162)", () => {
  it("merges each row's run of cells, and grows it down while the rows below run the same", () => {
    // A 3 × 3 grid of 10s on a 25 × 30 picture, all but the middle of its first column.
    const boxes = coverBoxes(25, 30, 10, ({ x, y }) => !(x === 0 && y === 10));
    expect(boxes).toEqual([
      { x: 0, y: 0, width: 25, height: 10 },
      { x: 10, y: 10, width: 15, height: 10 },
      { x: 0, y: 20, width: 25, height: 10 },
    ]);
  });

  it("clips the last cells to the picture", () => {
    expect(coverBoxes(25, 15, 10, () => true)).toEqual([{ x: 0, y: 0, width: 25, height: 15 }]);
  });

  it("is nothing where nothing shows", () => {
    expect(coverBoxes(25, 15, 10, () => false)).toEqual([]);
  });
});

describe("boxMeets (#3162)", () => {
  const diamond = [
    { x: 50, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 50 },
  ];
  const box = (x: number, y: number) => ({ x, y, width: 10, height: 10 });

  it("meets an outline that crosses it, holds it, or lies within it", () => {
    expect(boxMeets(diamond, box(45, -5), 0)).toBe(true);
    expect(boxMeets(diamond, box(45, 45), 0)).toBe(true);
    expect(boxMeets(diamond, { x: -10, y: -10, width: 200, height: 200 }, 0)).toBe(true);
  });

  it("does not meet one clear of it, unless grown into it", () => {
    expect(boxMeets(diamond, box(0, 0), 0)).toBe(false);
    expect(boxMeets(diamond, box(10, 10), 0)).toBe(false);
    expect(boxMeets(diamond, box(10, 10), 8)).toBe(true);
  });
});
