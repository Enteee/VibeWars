import type { Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { WATER_LOOK } from "./arena-palette.js";
import {
  WATER_ART,
  RING_PULSE_SECONDS,
  WATER_SUNK,
  insetShore,
  waterArtKey,
  waterSurface,
  type WaterPainter,
} from "./water-painter.js";
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
  return {
    calls,
    painter: {
      fillStyle: log("fillStyle"),
      lineStyle: log("lineStyle"),
      lineBetween: log("lineBetween"),
      strokeEllipse: log("strokeEllipse"),
      fillOutline: (points: readonly Vec2[]) => {
        calls.push(`fillOutline(${points.map((p) => `${n(p.x)} ${n(p.y)}`).join(", ")})`);
      },
      shore: (outline) =>
        outline.map((a, k) => [a, outline[(k + 1) % outline.length] ?? a] as const),
    },
  };
}

const area = { kind: "rect", x: 0, y: 0, width: 120, height: 80 } as const;
const deep = waterShapeOf({ layer: 0, depth: "deep", area });
const shallow = waterShapeOf({ layer: 0, depth: "shallow", area });
const edge = { wall: 0x111111, lip: 0x222222, outline: 0x333333 } as const;

function surface(shape: typeof deep, line = 0.5): string[] {
  const { painter, calls } = recorder();
  WATER_ART[waterArtKey(shape.depth)].surface(painter, shape, line, edge);
  return calls;
}

/** CIE L* of an sRGB colour, 0 to 100. */
function lightness(colour: number): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const y =
    0.2126 * linear((colour >> 16) & 0xff) +
    0.7152 * linear((colour >> 8) & 0xff) +
    0.0722 * linear(colour & 0xff);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

describe("water art (#2984, #4058)", () => {
  it("keys the art by depth", () => {
    expect(waterArtKey("deep")).toBe("water-deep");
    expect(waterArtKey("shallow")).toBe("water-shallow");
  });

  it("sinks deep water under the far shore's wall, the pit wall showing above it", () => {
    const calls = surface(deep);
    expect(calls.slice(0, 4)).toEqual([
      `fillStyle(${String(edge.wall)}, 1)`,
      "fillOutline(0 0, 120 0, 120 80, 0 80)",
      `fillStyle(${String(WATER_LOOK.deep.fill)}, 1)`,
      `fillOutline(3 ${String(WATER_SUNK)}, 117 ${String(WATER_SUNK)}, 117 80, 3 80)`,
    ]);
  });

  it("darkens deep water toward the middle in rings", () => {
    const rings = surface(deep).filter(
      (call) =>
        call === `fillStyle(${String(WATER_LOOK.deep.ring)}, ${String(WATER_LOOK.deep.ringAlpha)})`,
    );
    expect(rings).toHaveLength(4);
  });

  it("stands a lip on deep water's shore, in the biome's wall top, and none on shallow", () => {
    const lip = (calls: string[]): string[] =>
      calls.filter((call) => call.startsWith("lineStyle") && call.includes(String(edge.lip)));
    expect(lip(surface(deep))).toHaveLength(4);
    expect(lip(surface(shallow))).toHaveLength(0);
    expect(surface(shallow).some((call) => call.includes(String(edge.wall)))).toBe(false);
  });

  it("leaves the floor showing through shallow water, its shore one thin lighter line", () => {
    expect(surface(shallow)).toEqual([
      `fillStyle(${String(WATER_LOOK.shallow.fill)}, ${String(WATER_LOOK.shallow.fillAlpha)})`,
      "fillOutline(0 0, 120 0, 120 80, 0 80)",
      `lineStyle(0.5, ${String(WATER_LOOK.shallow.shore)}, 1)`,
      "lineBetween(0, 0, 120, 0)",
      "lineBetween(120, 0, 120, 80)",
      "lineBetween(120, 80, 0, 80)",
      "lineBetween(0, 80, 0, 0)",
    ]);
    expect(WATER_LOOK.shallow.fillAlpha).toBeLessThan(WATER_LOOK.deep.fillAlpha);
    expect(lightness(WATER_LOOK.shallow.shore)).toBeGreaterThan(lightness(WATER_LOOK.shallow.fill));
  });

  it("tells deep from shallow by value, at least 15 L* apart", () => {
    expect(lightness(WATER_LOOK.shallow.fill) - lightness(WATER_LOOK.deep.fill)).toBeGreaterThan(
      15,
    );
  });

  it("moves only the shore in, never a piece's cut edge", () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const [a, b, c, d] = outline as [Vec2, Vec2, Vec2, Vec2];
    // The bottom edge is cut: the next piece goes on below it.
    const shore = [
      [a, b],
      [b, c],
      [d, a],
    ] as const;
    expect(insetShore(outline, shore, 10)).toEqual([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 50 },
      { x: 10, y: 50 },
    ]);
    expect(waterSurface(WATER_ART["water-shallow"], outline, shore)).toBe(outline);
  });

  it("draws one pale ring per ripple, the same twice under reduced motion", () => {
    const ripples = (seconds: number, still: boolean): string[] => {
      const { painter, calls } = recorder();
      WATER_ART["water-deep"].ripples(painter, deep, 1, seconds, still);
      return calls;
    };
    const rings = ripples(0, false).filter((call) => call.startsWith("strokeEllipse"));
    expect(rings).toHaveLength(deep.ripples.length);
    expect(ripples(2, false)).not.toEqual(ripples(0, false));
    expect(ripples(2, true)).toEqual(ripples(0, true));
  });

  it("swells deep water's rings out and back over RING_PULSE_SECONDS, none when still (#4061)", () => {
    const pulse = (seconds: number, still: boolean): string[] => {
      const { painter, calls } = recorder();
      WATER_ART["water-deep"].ripples(painter, deep, 1, seconds, still);
      return calls.filter((call) => call.startsWith("lineBetween"));
    };
    // Four edges a ring, every ring stroked.
    expect(pulse(0, false)).toHaveLength(4 * WATER_LOOK.deep.rings);
    expect(pulse(0, true)).toHaveLength(0);
    expect(pulse(RING_PULSE_SECONDS / 4, false)).not.toEqual(pulse(0, false));
    expect(pulse(RING_PULSE_SECONDS, false)).toEqual(pulse(0, false));
    const { painter, calls } = recorder();
    WATER_ART["water-shallow"].ripples(painter, shallow, 1, 0, false);
    expect(calls.filter((call) => call.startsWith("lineBetween"))).toHaveLength(0);
  });
});
