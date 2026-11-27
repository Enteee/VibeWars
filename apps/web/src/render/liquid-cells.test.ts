import { distancePointToSegment, pointInPolygon, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { liquidCells, tiledCells } from "./liquid-cells.js";

const options = { seed: 4058, sites: 15, gap: 6, size: 512 } as const;

/** How near `a` comes to `b`: the nearest corner of either to an edge of the other. */
function distance(a: readonly Vec2[], b: readonly Vec2[]): number {
  const toEdges = (point: Vec2, polygon: readonly Vec2[]): number =>
    Math.min(
      ...polygon.map((corner, at) =>
        distancePointToSegment(point, {
          a: corner,
          b: polygon[(at + 1) % polygon.length] ?? corner,
        }),
      ),
    );
  return Math.min(...a.map((point) => toEdges(point, b)), ...b.map((point) => toEdges(point, a)));
}

describe("liquid cells (#4058)", () => {
  it("lays out the same cells for the same seed, other cells for another", () => {
    expect(liquidCells(options)).toEqual(liquidCells(options));
    expect(liquidCells({ ...options, seed: 1 })).not.toEqual(liquidCells(options));
  });

  it("makes one cell per site, none squeezed shut", () => {
    const cells = liquidCells(options);
    expect(cells).toHaveLength(options.sites);
    for (const cell of cells) {
      expect(cell.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps every two cells at least the gap apart, across the tile's edges too", () => {
    const cells = tiledCells(liquidCells(options), options.size);
    cells.forEach((cell, at) => {
      for (const other of cells.slice(at + 1)) {
        expect(distance(cell, other)).toBeGreaterThanOrEqual(options.gap - 1e-6);
      }
    });
  });

  it("tiles without a seam: the left edge matches the right, the top the bottom", () => {
    const cells = tiledCells(liquidCells(options), options.size);
    const inside = (point: Vec2): boolean => cells.some((cell) => pointInPolygon(point, cell));
    const { size } = options;
    for (let along = 0.5; along < size; along += 3) {
      expect(inside({ x: 0, y: along })).toBe(inside({ x: size, y: along }));
      expect(inside({ x: along, y: 0 })).toBe(inside({ x: along, y: size }));
    }
  });

  it("covers most of the tile, the gaps a thin network", () => {
    const cells = tiledCells(liquidCells(options), options.size);
    let covered = 0;
    let samples = 0;
    for (let y = 1; y < options.size; y += 8) {
      for (let x = 1; x < options.size; x += 8) {
        samples += 1;
        covered += cells.some((cell) => pointInPolygon({ x, y }, cell)) ? 1 : 0;
      }
    }
    expect(covered / samples).toBeGreaterThan(0.8);
  });
});
