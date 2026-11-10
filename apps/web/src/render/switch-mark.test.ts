import { describe, expect, it } from "vitest";

import { SWITCH_MARK_ART, switchMarkKey, type SwitchMarkPainter } from "./switch-mark.js";

describe("switch marks (#3025)", () => {
  it("names a lever for every switch id", () => {
    expect(switchMarkKey("lever-west")).toBe("lever");
    expect(switchMarkKey("side-room")).toBe("lever");
  });

  it("draws each mark around its anchor, and differently up and thrown", () => {
    for (const art of Object.values(SWITCH_MARK_ART)) {
      const drawn = (up: boolean): { x: number; y: number }[] => {
        const points: { x: number; y: number }[] = [];
        const painter: SwitchMarkPainter = {
          fillStyle: () => undefined,
          lineStyle: () => undefined,
          fillCircle: (x, y) => points.push({ x, y }),
          fillRect: (x, y) => points.push({ x, y }),
          lineBetween: (x1, y1, x2, y2) => points.push({ x: x1, y: y1 }, { x: x2, y: y2 }),
        };
        art(painter, { x: 300, y: 200 }, up);
        return points;
      };
      for (const up of [true, false]) {
        expect(drawn(up).length).toBeGreaterThan(0);
        for (const point of drawn(up)) {
          expect(Math.hypot(point.x - 300, point.y - 200)).toBeLessThan(24);
        }
      }
      expect(drawn(true)).not.toEqual(drawn(false));
    }
  });
});
