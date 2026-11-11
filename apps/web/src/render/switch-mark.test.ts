import { describe, expect, it } from "vitest";

import { SWITCH_MARK_LOOK } from "./arena-palette.js";
import {
  LEVER_THROW_SECONDS,
  SWITCH_MARK_ART,
  leverThrown,
  switchMarkKey,
  type SwitchMarkPainter,
} from "./switch-mark.js";

/** What `art` draws at (300, 200) `thrown`: the points it touches and the colours it fills. */
function drawn(
  art: (typeof SWITCH_MARK_ART)["lever"],
  thrown: number,
): { points: { x: number; y: number }[]; fills: number[] } {
  const points: { x: number; y: number }[] = [];
  const fills: number[] = [];
  const painter: SwitchMarkPainter = {
    fillStyle: (colour) => fills.push(colour),
    lineStyle: () => undefined,
    fillCircle: (x, y) => points.push({ x, y }),
    fillEllipse: (x, y) => points.push({ x, y }),
    strokeEllipse: (x, y) => points.push({ x, y }),
    lineBetween: (x1, y1, x2, y2) => points.push({ x: x1, y: y1 }, { x: x2, y: y2 }),
  };
  art(painter, { x: 300, y: 200 }, thrown);
  return { points, fills };
}

describe("switch marks (#3025)", () => {
  it("names a lever for every switch id", () => {
    expect(switchMarkKey("lever-west")).toBe("lever");
    expect(switchMarkKey("side-room")).toBe("lever");
  });

  it("draws each mark around its anchor, and differently up and thrown", () => {
    for (const art of Object.values(SWITCH_MARK_ART)) {
      for (const thrown of [0, 1]) {
        const { points } = drawn(art, thrown);
        expect(points.length).toBeGreaterThan(0);
        for (const point of points) {
          expect(Math.hypot(point.x - 300, point.y - 200)).toBeLessThan(24);
        }
      }
      expect(drawn(art, 0).points).not.toEqual(drawn(art, 1).points);
    }
  });

  it("stands its arm up and lays it down thrown, its knob brass up and grey down (#3053)", () => {
    const knob = (thrown: number): { x: number; y: number } => {
      const { points } = drawn(SWITCH_MARK_ART.lever, thrown);
      return points[points.length - 1] ?? { x: 0, y: 0 };
    };
    expect(knob(0).y).toBeLessThan(knob(1).y - 8);
    expect(knob(1).x).toBeGreaterThan(knob(0).x);
    expect(drawn(SWITCH_MARK_ART.lever, 0).fills).toContain(SWITCH_MARK_LOOK.knobUp);
    expect(drawn(SWITCH_MARK_ART.lever, 0).fills).not.toContain(SWITCH_MARK_LOOK.knobDown);
    expect(drawn(SWITCH_MARK_ART.lever, 1).fills).toContain(SWITCH_MARK_LOOK.knobDown);
    expect(drawn(SWITCH_MARK_ART.lever, 1).fills).not.toContain(SWITCH_MARK_LOOK.knobUp);
  });
});

describe("a lever's throw (#3053)", () => {
  it("rests where it is set, with no flip seen", () => {
    expect(leverThrown(true, undefined, false)).toBe(0);
    expect(leverThrown(false, undefined, false)).toBe(1);
  });

  it("flicks over within its throw, then rests", () => {
    const half = leverThrown(false, LEVER_THROW_SECONDS / 2, false);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(leverThrown(false, LEVER_THROW_SECONDS, false)).toBe(1);
    expect(leverThrown(true, LEVER_THROW_SECONDS / 2, false)).toBeCloseTo(1 - half);
  });

  it("snaps to rest under reduced motion", () => {
    expect(leverThrown(false, 0, true)).toBe(1);
    expect(leverThrown(true, 0, true)).toBe(0);
  });
});
