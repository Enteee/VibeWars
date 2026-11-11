import { describe, expect, it } from "vitest";

import { TELEPORT_MARK_LOOK } from "./arena-palette.js";
import {
  paintArrival,
  paintTeleportEntry,
  paintTeleportExit,
  TELEPORT_RADIUS,
  type TeleportMarkPainter,
} from "./teleport-mark.js";

interface Drawn {
  points: { x: number; y: number }[];
  fills: number[];
  strokes: { colour: number; alpha: number }[];
}

/** What `paint` draws: the points it touches, the colours it fills and the lines it strokes. */
function drawn(paint: (painter: TeleportMarkPainter) => void): Drawn {
  const result: Drawn = { points: [], fills: [], strokes: [] };
  const painter: TeleportMarkPainter = {
    fillStyle: (colour) => result.fills.push(colour),
    lineStyle: (_width, colour, alpha) => result.strokes.push({ colour, alpha }),
    fillCircle: (x, y) => result.points.push({ x, y }),
    fillEllipse: (x, y) => result.points.push({ x, y }),
    fillRect: (x, y) => result.points.push({ x, y }),
    strokeEllipse: (x, y) => result.points.push({ x, y }),
    lineBetween: (x1, y1, x2, y2) => result.points.push({ x: x1, y: y1 }, { x: x2, y: y2 }),
  };
  paint(painter);
  return result;
}

const AT = { x: 300, y: 200 };

describe("portal marks (#3030)", () => {
  it("draws an entry round its anchor, on or off", () => {
    for (const on of [true, false]) {
      const { points } = drawn((painter) => {
        paintTeleportEntry(painter, AT, on, 1.3);
      });
      expect(points.length).toBeGreaterThan(10);
      for (const point of points) {
        expect(Math.abs(point.x - AT.x)).toBeLessThanOrEqual(TELEPORT_RADIUS * 1.5);
        expect(Math.abs(point.y - AT.y)).toBeLessThanOrEqual(TELEPORT_RADIUS * 1.5);
      }
    }
  });

  it("swirls aqua round a white core only while on, and differs in shape off", () => {
    const on = drawn((painter) => {
      paintTeleportEntry(painter, AT, true, 0);
    });
    const off = drawn((painter) => {
      paintTeleportEntry(painter, AT, false, 0);
    });
    expect(on.fills).toContain(TELEPORT_MARK_LOOK.swirl);
    expect(on.fills).toContain(TELEPORT_MARK_LOOK.core);
    expect(off.fills).not.toContain(TELEPORT_MARK_LOOK.swirl);
    expect(off.fills).not.toContain(TELEPORT_MARK_LOOK.core);
    expect(off.strokes.map(({ colour }) => colour)).toContain(TELEPORT_MARK_LOOK.offRing);
    expect(on.strokes.map(({ colour }) => colour)).not.toContain(TELEPORT_MARK_LOOK.offRing);
  });

  it("turns its swirl with time, and holds still at one time", () => {
    const at = (time: number): Drawn["points"] =>
      drawn((painter) => {
        paintTeleportEntry(painter, AT, true, time);
      }).points;
    expect(at(0.7)).toEqual(at(0.7));
    expect(at(0.7)).not.toEqual(at(0));
  });

  it("marks an exit faint aqua on and dashed grey off", () => {
    const on = drawn((painter) => {
      paintTeleportExit(painter, AT, true);
    });
    const off = drawn((painter) => {
      paintTeleportExit(painter, AT, false);
    });
    expect(on.strokes.map(({ colour }) => colour)).toContain(TELEPORT_MARK_LOOK.swirl);
    expect(off.strokes.map(({ colour }) => colour)).toContain(TELEPORT_MARK_LOOK.offRing);
  });

  it("bursts on arrival, then fades its ring over the cooldown and is gone after it", () => {
    const ring = (age: number): number =>
      drawn((painter) => {
        paintArrival(painter, AT, age, 5);
      }).strokes[0]?.alpha ?? 0;
    expect(
      drawn((painter) => {
        paintArrival(painter, AT, 0, 5);
      }).fills,
    ).toContain(TELEPORT_MARK_LOOK.core);
    expect(ring(1)).toBeGreaterThan(ring(4));
    expect(ring(4)).toBeGreaterThan(0);
    expect(
      drawn((painter) => {
        paintArrival(painter, AT, 5, 5);
      }).points,
    ).toEqual([]);
  });
});
