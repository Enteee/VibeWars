import { describe, expect, it } from "vitest";

import { vec2 } from "../vec2.js";
import {
  CAPTURE_REACH_UNITS,
  CAPTURE_SECONDS,
  initialCapturePoints,
  onCapturePoint,
  stepCapturePoints,
  type CapturePointState,
} from "./capture-points.js";

/**
 * Capture Points' shrines (#1378), pure: who takes one, how fast, and
 * what a contest, a foe and an empty shrine do to its progress.
 */

const TICK = 1 / 20;

/** `point` after `seconds` of `on` standing on it, a tick at a time. */
function hold(point: CapturePointState, on: readonly number[], seconds: number): CapturePointState {
  let state: readonly CapturePointState[] = [point];
  for (let i = 0; i < Math.round(seconds / TICK); i += 1) {
    state = stepCapturePoints(state, TICK, [on]).state;
  }
  const [after] = state;
  if (after === undefined) {
    throw new Error("no shrine");
  }
  return after;
}

const NEUTRAL: CapturePointState = { owner: null, capturer: null, progress: 0 };
const OURS: CapturePointState = { owner: 0, capturer: 0, progress: 1 };

describe("a capture point (#1378)", () => {
  it("is taken by one player in 20 s, and by four in 5 s", () => {
    expect(hold(NEUTRAL, [0], CAPTURE_SECONDS - 1)).toMatchObject({ owner: null, capturer: 0 });
    expect(hold(NEUTRAL, [0], CAPTURE_SECONDS)).toEqual(OURS);
    expect(hold(NEUTRAL, [0, 0, 0, 0], 4.95).owner).toBeNull();
    expect(hold(NEUTRAL, [0, 0, 0, 0], 5)).toEqual(OURS);
  });

  it("does not move while two teams are on it", () => {
    const half = hold(NEUTRAL, [1], 10);
    expect(hold(half, [0, 1], 30)).toEqual(half);
    expect(hold(OURS, [0, 0, 1], 30)).toEqual(OURS);
    // Contested at 0, it stays neutral.
    expect(hold(NEUTRAL, [1, 0], 30)).toEqual(NEUTRAL);
  });

  it("is drained to neutral by a foe before it fills for them", () => {
    const drained = hold(OURS, [1], 10);
    expect(drained).toMatchObject({ owner: 0, capturer: 0 });
    expect(drained.progress).toBeCloseTo(0.5);
    expect(hold(OURS, [1], 20)).toMatchObject({ owner: null });
    const neutralAgain = hold(OURS, [1], 30);
    expect(neutralAgain.owner).toBeNull();
    expect(neutralAgain.capturer).toBe(1);
    expect(neutralAgain.progress).toBeCloseTo(0.5);
    expect(hold(OURS, [1], 40)).toEqual({ owner: 1, capturer: 1, progress: 1 });
    // The owner back on it fills it again.
    expect(hold(hold(OURS, [1], 10), [0], 10)).toEqual(OURS);
  });

  it("keeps its progress while nobody is on it, and its owner for good", () => {
    const partial = hold(NEUTRAL, [1, 1], 4);
    expect(hold(partial, [], 60)).toEqual(partial);
    expect(hold(OURS, [], 60)).toEqual(OURS);
  });

  it("counts a player within reach, and each shrine apart", () => {
    const point = vec2(500, 500);
    expect(onCapturePoint(point, vec2(500 + CAPTURE_REACH_UNITS, 500))).toBe(true);
    expect(onCapturePoint(point, vec2(501 + CAPTURE_REACH_UNITS, 500))).toBe(false);
    const { state } = stepCapturePoints(
      initialCapturePoints([point, vec2(900, 500)]),
      CAPTURE_SECONDS,
      [[0], []],
    );
    expect(state).toEqual([
      { ...OURS, position: point },
      { ...NEUTRAL, position: vec2(900, 500) },
    ]);
  });
});
