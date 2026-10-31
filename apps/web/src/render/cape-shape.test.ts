import { CAPE_COLOURS, CAPE_EMBLEMS } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { CAPE_PALETTE, emblemShape } from "./cape-shape.js";

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
