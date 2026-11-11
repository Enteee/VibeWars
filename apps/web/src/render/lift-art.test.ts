import { describe, expect, it } from "vitest";

import { arenaPalette, TRANSITION_LOOK } from "./arena-palette.js";
import { FLAT_STRUCTURE, type MapStructure } from "./arena-snapshot.js";
import { liftFrame, liftPlatform, liftShaft } from "./lift-art.js";
import { elevationOf } from "./render-order.js";
import { transitionPalette, type StructurePainter } from "./structure-art.js";

/** A painter that keeps every call, by name, with the colour it was made in and its heights. */
function recorder(): StructurePainter & {
  readonly calls: { readonly name: string; readonly colour: number; readonly ys: number[] }[];
} {
  const calls: { name: string; colour: number; ys: number[] }[] = [];
  let fill = -1;
  let stroke = -1;
  return {
    calls,
    fillStyle: (colour) => {
      fill = colour;
    },
    lineStyle: (_width, colour) => {
      stroke = colour;
    },
    fillRect: (_x, y, _width, height) =>
      calls.push({ name: "fillRect", colour: fill, ys: [y, y + height] }),
    fillTriangle: (_ax, ay, _bx, by, _cx, cy) =>
      calls.push({ name: "fillTriangle", colour: fill, ys: [ay, by, cy] }),
    lineBetween: (_ax, ay, _bx, by) =>
      calls.push({ name: "lineBetween", colour: stroke, ys: [ay, by] }),
  };
}

const LIFT = {
  from: 0,
  to: 1,
  area: { kind: "rect", x: 680, y: 300, width: 120, height: 100 },
  uphill: "e",
  look: "lift",
  lift: { kind: "timer", restSeconds: 4, travelSeconds: 2 },
} as const;
const STRUCTURE: MapStructure = { ...FLAT_STRUCTURE, layerCount: 2, transitions: [LIFT] };
const COLOURS = TRANSITION_LOOK.lift;
const FRAME = liftFrame(STRUCTURE, LIFT, 1, transitionPalette(arenaPalette(2), "lift"));
const TOP = elevationOf(1, 0);

describe("a lift's art (#3079)", () => {
  it("frames its shaft in iron, from its foot to over its top", () => {
    const painter = recorder();
    liftShaft(painter, FRAME);
    const iron = painter.calls.filter(({ colour }) => colour === COLOURS.riser);
    expect(iron.length).toBeGreaterThanOrEqual(6);
    expect(Math.min(...iron.flatMap(({ ys }) => ys))).toBeLessThan(300 - TOP);
  });

  it("draws its platform at its height: at the bottom resting, halfway on its way", () => {
    const planksAt = (progress: number): number | undefined => {
      const painter = recorder();
      liftPlatform(painter, FRAME, { phase: progress === 0 ? "low" : "rising", progress });
      return painter.calls.find(({ colour, name }) => name === "fillRect" && colour === COLOURS.top)
        ?.ys[0];
    };
    expect(planksAt(0)).toBe(300);
    expect(planksAt(0.5)).toBeCloseTo(300 - TOP / 2);
  });

  it("bars both its ends and points the way only while it travels", () => {
    const iron = (phase: "high" | "sinking"): number => {
      const painter = recorder();
      liftPlatform(painter, FRAME, { phase, progress: phase === "high" ? 1 : 0.5 });
      return painter.calls.filter(({ colour }) => colour === COLOURS.riser).length;
    };
    expect(iron("high")).toBe(0);
    expect(iron("sinking")).toBeGreaterThan(10);
  });
});
