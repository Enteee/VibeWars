import { CAPE_COLOURS, CAPE_EMBLEMS } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { CAPE_LENGTH, CAPE_PALETTE, capeShape, emblemShape } from "./cape-shape.js";
import type { Point } from "./weapon-mark-geometry.js";

const R = 14;

describe("capeShape (#1422)", () => {
  it("trails the tab opposite the facing: facing 0, it reaches to -x, CAPE_LENGTH past the rim", () => {
    const { tab, trim } = capeShape(100, 50, R, 0, "disc");
    const xs = tab.map((point) => point.x);
    expect(Math.min(...xs)).toBeCloseTo(100 - R - CAPE_LENGTH);
    // Its root is under the disc, 2 inside the rim.
    expect(Math.max(...xs)).toBeCloseTo(100 - (R - 2));
    // 13 wide at the root, 9 at the hem.
    expect(Math.max(...tab.map((p) => p.y)) - Math.min(...tab.map((p) => p.y))).toBeCloseTo(13);
    expect(trim).toHaveLength(3);
    expect(Math.abs((trim[0]?.y ?? 0) - (trim[2]?.y ?? 0))).toBeCloseTo(9);
  });

  it("turns with the body: facing down (+y), it trails up", () => {
    const { tab } = capeShape(100, 50, R, Math.PI / 2, "disc");
    expect(Math.min(...tab.map((point) => point.y))).toBeCloseTo(50 - R - CAPE_LENGTH);
    for (const point of tab) {
      expect(point.y).toBeLessThan(50);
    }
  });

  it("puts the emblem on the tab, behind the rim", () => {
    const { emblem } = capeShape(100, 50, R, 0, "diamond");
    const points: Point[] = emblem.flatMap((part) => [...part.points]);
    for (const point of points) {
      expect(point.x).toBeLessThan(100 - R);
      expect(point.x).toBeGreaterThan(100 - R - CAPE_LENGTH);
    }
  });
});

describe("emblemShape (#1422)", () => {
  it.each(CAPE_EMBLEMS)("draws %s as a shape in its 10 unit box", (emblem) => {
    const parts = emblemShape(emblem, { x: 0, y: 0 }, 0, 10);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part.points.length).toBeGreaterThanOrEqual(3);
      for (const point of part.points) {
        expect(Math.max(Math.abs(point.x), Math.abs(point.y))).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe("CAPE_PALETTE (#1422)", () => {
  it("gives every colour its own hue", () => {
    const hues = CAPE_COLOURS.map((colour) => CAPE_PALETTE[colour]);
    expect(new Set(hues).size).toBe(CAPE_COLOURS.length);
  });
});
