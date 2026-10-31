import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  CAPE_LENGTH,
  capeJumped,
  capeMotionShape,
  newCapeMotion,
  reprimeCapeMotion,
  stepCapeMotion,
  type CapeMotion,
} from "./cape-motion.js";

const R = 14;
const RUN = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
const FRAME = 1 / 60;

/** Step `state` for `seconds` at 60 fps, the body moving at (vx, vy); returns the largest unfold seen. */
function run(state: CapeMotion, seconds: number, vx: number, vy: number): number {
  let peak = state.unfold;
  for (let i = 0; i < Math.round(seconds / FRAME); i++) {
    stepCapeMotion(state, FRAME, { x: 0, y: 0, r: R, vx, vy });
    peak = Math.max(peak, state.unfold);
  }
  return peak;
}

/** The angle from the body to the tab's tip, the notch's neighbours' midpoint, in degrees. */
function tipAngle(state: CapeMotion): number {
  const { trim } = capeMotionShape(state, { x: 0, y: 0, r: R }, "disc");
  const tip = {
    x: ((trim[0]?.x ?? 0) + (trim[2]?.x ?? 0)) / 2,
    y: ((trim[0]?.y ?? 0) + (trim[2]?.y ?? 0)) / 2,
  };
  return (Math.atan2(tip.y, tip.x) * 180) / Math.PI;
}

describe("cape motion (#1699)", () => {
  it("stays a folded band at rest, its tab under the disc", () => {
    const state = newCapeMotion();
    run(state, 1, 0, 0);
    expect(state.unfold).toBeCloseTo(0);
    const { cloth, band } = capeMotionShape(state, { x: 0, y: 0, r: R }, "disc");
    for (const point of cloth) {
      expect(Math.hypot(point.x, point.y)).toBeLessThan(R);
    }
    // The band sits on the rim behind a body that faces +x.
    expect((band.from + band.to) / 2).toBeCloseTo(Math.PI);
    expect(band.radius).toBeGreaterThan(R);
  });

  it("unfolds walking +x and trails the tab to -x, CAPE_LENGTH past the rim or so", () => {
    const state = newCapeMotion();
    run(state, 1, RUN, 0);
    expect(state.unfold).toBeGreaterThan(0.9);
    expect(Math.abs(tipAngle(state))).toBeGreaterThan(175);
    const { trim } = capeMotionShape(state, { x: 0, y: 0, r: R }, "disc");
    expect(Math.min(...trim.map((p) => p.x))).toBeLessThan(-(R + CAPE_LENGTH * 0.9));
    expect(Math.min(...trim.map((p) => p.x))).toBeGreaterThan(-(R + CAPE_LENGTH * 1.3));
  });

  it("trails the movement, not the facing: walking -y, it streams to +y", () => {
    const state = newCapeMotion();
    run(state, 1, 0, -RUN);
    expect(tipAngle(state)).toBeCloseTo(90, 0);
  });

  it("swings round a turn with a lag, through the angles between", () => {
    const state = newCapeMotion();
    run(state, 1, RUN, 0);
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) {
      run(state, FRAME, 0, RUN);
      seen.push(tipAngle(state));
    }
    // From -x (±180) to -y (-90), and some frames in between.
    expect(seen.at(-1)).toBeCloseTo(-90, 0);
    expect(seen.some((a) => a < -100 && a > -170)).toBe(true);
    expect(Math.abs(seen[0] ?? 0)).toBeGreaterThan(150);
  });

  it("folds back within a second of stopping", () => {
    const state = newCapeMotion();
    run(state, 1, RUN, 0);
    run(state, 1, 0, 0);
    expect(state.unfold).toBeLessThan(0.05);
  });

  // The study's own 0.2 s step peaks at 0.61: well short of a walk's full unfold, no flicker.
  it("does not fully unfold for one short step", () => {
    const state = newCapeMotion();
    run(state, 0.5, 0, 0);
    const peak = Math.max(run(state, 0.2, RUN, 0), run(state, 1, 0, 0));
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(0.65);
  });

  it("clamps a long frame, so a background tab does not explode the spring", () => {
    const long = newCapeMotion();
    const short = newCapeMotion();
    stepCapeMotion(long, FRAME, { x: 0, y: 0, r: R, vx: RUN, vy: 0 });
    stepCapeMotion(short, FRAME, { x: 0, y: 0, r: R, vx: RUN, vy: 0 });
    stepCapeMotion(long, 5, { x: 0, y: 0, r: R, vx: RUN, vy: 0 });
    stepCapeMotion(short, 1 / 20, { x: 0, y: 0, r: R, vx: RUN, vy: 0 });
    expect(long).toEqual(short);
  });

  it("re-primes after a jump: the tab is back on the rim, still folded", () => {
    expect(capeJumped(R * 3 + 1, R)).toBe(true);
    expect(capeJumped(RUN / 20, R)).toBe(false);
    const state = newCapeMotion();
    run(state, 1, RUN, 0);
    reprimeCapeMotion(state);
    stepCapeMotion(state, FRAME, { x: 0, y: 0, r: R, vx: 0, vy: 0 });
    expect(state.unfold).toBe(0);
    expect(Math.hypot(state.nodeX, state.nodeY)).toBeCloseTo(R - 1);
  });
});
