import { describe, expect, it } from "vitest";

import type { RenderableShape } from "./arena-snapshot.js";
import {
  HAZARD_ART,
  HAZARD_LOOK,
  hazardKindOf,
  hazardVisual,
  pathMotionAt,
  phaseProgressAt,
  type HazardFrame,
  type HazardKind,
  type HazardPainter,
} from "./hazard-marks.js";

const AREA: RenderableShape = { kind: "rect", x: 20, y: 20, width: 70, height: 70 };

/** What `kind` draws in `phase`: every point it touches and every colour it fills. */
function drawn(
  kind: HazardKind,
  frame: Partial<HazardFrame> = {},
): { readonly points: { x: number; y: number }[]; readonly fills: number[] } {
  const points: { x: number; y: number }[] = [];
  const fills: number[] = [];
  const painter: HazardPainter = {
    fillStyle: (colour) => fills.push(colour),
    lineStyle: () => undefined,
    fillCircle: (x, y) => points.push({ x, y }),
    fillEllipse: (x, y) => points.push({ x, y }),
    strokeEllipse: (x, y) => points.push({ x, y }),
    fillTriangle: (x1, y1, x2, y2, x3, y3) =>
      points.push({ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }),
    lineBetween: (x1, y1, x2, y2) => points.push({ x: x1, y: y1 }, { x: x2, y: y2 }),
  };
  HAZARD_ART[kind](painter, {
    area: AREA,
    phase: "idle",
    progress: 0.5,
    now: 1.3,
    line: 1,
    travelled: 0,
    heading: { x: 1, y: 0 },
    ...frame,
  });
  return { points, fills };
}

describe("a hazard's mark (#3053)", () => {
  it("is named by its zone's kind, a moving rockfall a boulder", () => {
    expect(hazardKindOf({ kind: "vent" })).toBe("vent");
    expect(hazardKindOf({ kind: "gas-spout" })).toBe("spout");
    expect(hazardKindOf({ kind: "rockfall" })).toBe("rockfall");
    expect(hazardKindOf({ kind: "rockfall", path: { points: [], speed: 1 } })).toBe("boulder");
    expect(hazardKindOf({ kind: "molten" })).toBeUndefined();
  });

  it("is loud only while it hurts: a cue telegraphing, the strike active", () => {
    const [idle, telegraph, active] = (["idle", "telegraph", "active"] as const).map(hazardVisual);
    expect(idle).toEqual({ glow: 0.15, cue: false, strike: false });
    expect(telegraph?.cue).toBe(true);
    expect(telegraph?.strike).toBe(false);
    expect(active?.strike).toBe(true);
    expect(active?.glow).toBeGreaterThan(telegraph?.glow ?? 1);
  });

  it("draws each phase differently, so the phase reads without the ring", () => {
    for (const kind of ["vent", "spout", "rockfall"] as const) {
      const [idle, telegraph, active] = (["idle", "telegraph", "active"] as const).map(
        (phase) => drawn(kind, { phase }).points,
      );
      expect(telegraph).not.toEqual(idle);
      expect(active).not.toEqual(telegraph);
    }
  });

  it("fires a vent as a column of flame, and only while active", () => {
    expect(drawn("vent", { phase: "active" }).fills).toContain(HAZARD_LOOK.flameCore);
    expect(drawn("vent", { phase: "telegraph" }).fills).not.toContain(HAZARD_LOOK.flameCore);
    expect(drawn("vent", { phase: "idle" }).fills).not.toContain(HAZARD_LOOK.flameOuter);
  });

  it("keeps a still hazard's mark within its zone, so the ring tells the true reach", () => {
    // A boulder's dust trails behind it, where it has been.
    for (const kind of ["vent", "spout", "rockfall"] as const) {
      for (const phase of ["idle", "telegraph", "active"] as const) {
        for (const { x, y } of drawn(kind, { phase, progress: 0.9 }).points) {
          expect(x).toBeGreaterThanOrEqual(20 - 8);
          expect(x).toBeLessThanOrEqual(90 + 8);
          // A flame or a falling rock may rise over it; nothing spills below.
          expect(y).toBeLessThanOrEqual(90 + 8);
        }
      }
    }
  });

  it("turns a boulder as it rolls", () => {
    expect(drawn("boulder", { travelled: 0 }).points).not.toEqual(
      drawn("boulder", { travelled: 30 }).points,
    );
  });
});

describe("a hazard's clocks (#3053)", () => {
  const schedule = { periodSeconds: 4, activeSeconds: 1, offsetSeconds: 0 };

  it("says how far through its phase a timed hazard is", () => {
    expect(phaseProgressAt(schedule, 0.5)).toBeCloseTo(0.5);
    expect(phaseProgressAt(schedule, 1.25)).toBeCloseTo(0.25);
    expect(phaseProgressAt(schedule, 3)).toBeCloseTo(0.5);
    expect(phaseProgressAt(schedule, 4.5)).toBeCloseTo(0.5);
    expect(phaseProgressAt(undefined, 7)).toBe(0);
  });

  it("rolls out along its path and back, heading the way it goes", () => {
    const path = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      speed: 50,
    };
    expect(pathMotionAt(path, 1)).toEqual({ travelled: 50, heading: { x: 1, y: 0 } });
    const back = pathMotionAt(path, 3);
    expect(back.travelled).toBe(50);
    expect(back.heading.x).toBe(-1);
    expect(pathMotionAt(undefined, 3).travelled).toBe(0);
  });
});
