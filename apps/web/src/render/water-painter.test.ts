import type { Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { WATER_LOOK } from "./arena-palette.js";
import { WATER_ART, waterArtKey, type WaterPainter } from "./water-painter.js";
import { waterShapeOf } from "./water-shape.js";

/** A painter that writes down every call, rounded so the record is stable. */
function recorder(): { readonly painter: WaterPainter; readonly calls: string[] } {
  const calls: string[] = [];
  const n = (value: number): string => String(Math.round(value * 100) / 100);
  const log =
    (name: string) =>
    (...args: number[]): void => {
      calls.push(`${name}(${args.map(n).join(", ")})`);
    };
  const outline = (name: string) => (points: readonly Vec2[]) => {
    calls.push(`${name}(${points.map((p) => `${n(p.x)} ${n(p.y)}`).join(", ")})`);
  };
  return {
    calls,
    painter: {
      fillStyle: log("fillStyle"),
      lineStyle: log("lineStyle"),
      lineBetween: log("lineBetween"),
      fillOutline: outline("fillOutline"),
      strokeOutline: outline("strokeOutline"),
    },
  };
}

const area = { kind: "rect", x: 0, y: 0, width: 120, height: 80 } as const;
const deep = waterShapeOf({ layer: 0, depth: "deep", area });
const shallow = waterShapeOf({ layer: 0, depth: "shallow", area });

function surface(shape: typeof deep, line = 0.5): string[] {
  const { painter, calls } = recorder();
  WATER_ART[waterArtKey(shape.depth)].surface(painter, shape, line);
  return calls;
}

describe("water art (#2984)", () => {
  it("keys the art by depth", () => {
    expect(waterArtKey("deep")).toBe("water-deep");
    expect(waterArtKey("shallow")).toBe("water-shallow");
  });

  it("fills deep water opaque and gives it a hard shore", () => {
    expect(surface(deep)).toEqual([
      `fillStyle(${String(WATER_LOOK.deep.fill)}, 1)`,
      "fillOutline(0 0, 120 0, 120 80, 0 80)",
      `lineStyle(1.5, ${String(WATER_LOOK.deep.shore)}, 1)`,
      "strokeOutline(0 0, 120 0, 120 80, 0 80)",
    ]);
  });

  it("leaves the floor showing through shallow water, its shore one CSS px", () => {
    expect(surface(shallow)).toEqual([
      `fillStyle(${String(WATER_LOOK.shallow.fill)}, 0.3)`,
      "fillOutline(0 0, 120 0, 120 80, 0 80)",
      `lineStyle(0.5, ${String(WATER_LOOK.shallow.shore)}, 1)`,
      "strokeOutline(0 0, 120 0, 120 80, 0 80)",
    ]);
  });

  it("tells deep from shallow by value and shore, not hue alone", () => {
    const luma = (colour: number): number =>
      0.299 * ((colour >> 16) & 0xff) + 0.587 * ((colour >> 8) & 0xff) + 0.114 * (colour & 0xff);
    expect(luma(WATER_LOOK.shallow.fill) - luma(WATER_LOOK.deep.fill)).toBeGreaterThan(100);
    expect(WATER_LOOK.deep.shoreWidth).toBeGreaterThan(WATER_LOOK.shallow.shoreWidth);
  });

  it("draws one level stroke per ripple, the same twice under reduced motion", () => {
    const ripples = (seconds: number, still: boolean): string[] => {
      const { painter, calls } = recorder();
      WATER_ART["water-deep"].ripples(painter, deep, 1, seconds, still);
      return calls;
    };
    const strokes = ripples(0, false).filter((call) => call.startsWith("lineBetween"));
    expect(strokes).toHaveLength(deep.ripples.length);
    expect(ripples(2, false)).not.toEqual(ripples(0, false));
    expect(ripples(2, true)).toEqual(ripples(0, true));
  });
});
