import { describe, expect, it } from "vitest";

import {
  initialLifts,
  LEVER_LIFT_TRAVEL_SECONDS,
  liftClosedOn,
  stepLift,
  timerLiftAt,
} from "./lifts.js";

const AREA = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("lifts (#3079)", () => {
  it("reads a timer lift off the clock: rest low, rise, rest high, sink, again", () => {
    expect(timerLiftAt(4, 2, 1)).toEqual({ phase: "low", progress: 0 });
    expect(timerLiftAt(4, 2, 5)).toEqual({ phase: "rising", progress: 0.5 });
    expect(timerLiftAt(4, 2, 7)).toEqual({ phase: "high", progress: 1 });
    expect(timerLiftAt(4, 2, 10.5)).toEqual({ phase: "sinking", progress: 0.75 });
    expect(timerLiftAt(4, 2, 13)).toEqual({ phase: "low", progress: 0 });
  });

  it("sends a lever lift off on a flip at rest, and ignores a flip on its way", () => {
    const [resting] = initialLifts([
      { id: "lift", transition: 0, from: 0, to: 1, area: AREA, run: { kind: "lever" } },
    ]);
    if (resting === undefined) throw new Error("no lift");
    expect(stepLift(resting, false, 0.1, 0)).toBe(resting);
    let lift = stepLift(resting, true, 0.5, 0);
    expect(lift.phase).toBe("rising");
    lift = stepLift(lift, true, 0.5, 0);
    expect(lift).toMatchObject({ phase: "rising", progress: 1 / LEVER_LIFT_TRAVEL_SECONDS });
    lift = stepLift(lift, false, LEVER_LIFT_TRAVEL_SECONDS, 0);
    expect(lift).toMatchObject({ phase: "high", progress: 1 });
  });

  it("is closed on the layer it does not rest at, and on both on its way", () => {
    const [low] = initialLifts([
      { id: "lift", transition: 0, from: 0, to: 1, area: AREA, run: { kind: "lever" } },
    ]);
    if (low === undefined) throw new Error("no lift");
    expect([liftClosedOn(low, 0), liftClosedOn(low, 1), liftClosedOn(low, 2)]).toEqual([
      false,
      true,
      false,
    ]);
    const rising = { ...low, phase: "rising" as const };
    expect([liftClosedOn(rising, 0), liftClosedOn(rising, 1)]).toEqual([true, true]);
  });
});
