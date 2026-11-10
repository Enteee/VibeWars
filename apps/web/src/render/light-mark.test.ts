import { describe, expect, it } from "vitest";

import { LIGHT_MARK_ART, lightMarkKey, type LightMarkPainter } from "./light-mark.js";

describe("light marks (#2989)", () => {
  it("names a mark by the light id's prefix, and none for any other id", () => {
    expect(lightMarkKey("torch-west-door")).toBe("torch");
    expect(lightMarkKey("fire-west-hearth")).toBe("fire");
    expect(lightMarkKey("lamp")).toBeUndefined();
    expect(lightMarkKey("torch")).toBeUndefined();
    expect(lightMarkKey("bonfire-1")).toBeUndefined();
  });

  it("draws each mark around its anchor", () => {
    for (const art of Object.values(LIGHT_MARK_ART)) {
      const points: { x: number; y: number }[] = [];
      const painter: LightMarkPainter = {
        fillStyle: () => undefined,
        fillCircle: (x, y) => points.push({ x, y }),
        fillRect: (x, y) => points.push({ x, y }),
      };
      art(painter, { x: 300, y: 200 });
      expect(points.length).toBeGreaterThan(0);
      for (const point of points) {
        expect(Math.hypot(point.x - 300, point.y - 200)).toBeLessThan(24);
      }
    }
  });
});
